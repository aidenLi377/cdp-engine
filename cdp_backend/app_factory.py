from __future__ import annotations

import logging
import json
import os
import sys
from datetime import timedelta
from logging.handlers import RotatingFileHandler
from threading import Lock

from flask import Flask, abort, g, jsonify, request, send_from_directory, session
from flask_cors import CORS

from .constants import BASE_DIR, DB_PATH
from .dimension_store import (
    DimensionConflictError,
    DimensionNotFoundError,
    DimensionStore,
    DimensionValidationError,
)
from .engine import ConfigEngine
from .folder_store import FolderAccessError, FolderNotFoundError, FolderStore
from .solution_store import (
    InvalidSolutionStateError,
    SolutionAccessError,
    SolutionNotFoundError,
    SolutionStore,
)
from .task_store import TaskNotFoundError, TaskStore
from .user_store import (
    InviteInvalidError,
    UserAlreadyExistsError,
    UserNotFoundError,
    UserStore,
)
from .validator import ConfigValidationError


def is_production() -> bool:
    return os.environ.get("FLASK_ENV", "development") == "production"


def configure_logging(app: Flask, production: bool) -> None:
    if production:
        log_dir = os.environ.get("LOG_DIR", os.path.join(BASE_DIR, "logs"))
        os.makedirs(log_dir, exist_ok=True)
        handler = RotatingFileHandler(
            os.path.join(log_dir, "app.log"),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        )
        handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s [%(name)s] %(message)s"))
        app.logger.addHandler(handler)
        app.logger.setLevel(logging.INFO)
    else:
        logging.basicConfig(
            stream=sys.stdout,
            level=logging.INFO,
            format="[%(asctime)s] %(levelname)s %(message)s",
            datefmt="%H:%M:%S",
        )


def create_app(test_config: dict | None = None) -> tuple[Flask, ConfigEngine]:
    app = Flask(__name__)
    production = is_production()
    secret_key = os.environ.get("SECRET_KEY")
    if production and (not secret_key or secret_key == "dev-secret-change-in-production"):
        raise RuntimeError(
            "SECRET_KEY environment variable must be set to a secure random value in production"
        )
    app.config["SECRET_KEY"] = secret_key if secret_key else "dev-secret-change-in-production"
    app.config["JSON_AS_ASCII"] = False
    app.config["DB_PATH"] = os.environ.get("CDP_DB_PATH", DB_PATH)
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = production
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)
    if test_config:
        app.config.update(test_config)

    # Stores — now backed by SQLite; the old env-var file paths are
    # accepted for backward compatibility but ignored.
    db_path = app.config["DB_PATH"]
    solution_store = SolutionStore(db_path)
    folder_store = FolderStore(db_path)
    task_store = TaskStore(db_path)
    user_store = UserStore(db_path)
    dimension_store = DimensionStore(db_path)

    if production:
        cors_origins = [item.strip() for item in os.environ.get("CORS_ORIGINS", "").split(",") if item.strip()]
        if not cors_origins:
            raise RuntimeError(
                "CORS_ORIGINS environment variable must be set in production "
                "(comma-separated list of allowed origins, e.g. https://example.com)"
            )
        CORS(app, origins=cors_origins, supports_credentials=True)
    else:
        CORS(app, supports_credentials=True)

    configure_logging(app, production)

    try:
        engine = ConfigEngine(logger=app.logger, db_path=db_path)
    except ConfigValidationError as exc:
        app.logger.error("Configuration validation failed at startup:\n%s", exc)
        raise

    register_routes(
        app,
        engine,
        production,
        solution_store,
        folder_store,
        task_store,
        user_store,
        dimension_store,
    )
    return app, engine


def register_routes(
    app: Flask,
    engine: ConfigEngine,
    production: bool,
    solution_store: SolutionStore,
    folder_store: FolderStore,
    task_store: TaskStore,
    user_store: UserStore,
    dimension_store: DimensionStore,
) -> None:
    config_reload_lock = Lock()
    loaded_config_version = dimension_store.get_published_version()["version"]
    config_dependent_endpoints = {
        "get_packages",
        "get_all_package_meta",
        "get_package_meta",
        "get_package_meta_alias",
        "generate_json_alias",
        "generate",
        "batch_generate",
    }

    def ensure_latest_config() -> dict:
        """Reload this worker when another worker publishes a newer version."""
        nonlocal loaded_config_version
        published = dimension_store.get_published_version()
        if published["version"] == loaded_config_version:
            return published

        with config_reload_lock:
            published = dimension_store.get_published_version()
            if published["version"] != loaded_config_version:
                engine.reload_config(validate_on_load=False)
                loaded_config_version = published["version"]
                app.logger.info(
                    "ConfigEngine synchronized to published config V%s",
                    loaded_config_version,
                )
        return published

    def error_response(code: str, message: str, status: int):
        return jsonify({"code": code, "message": message}), status

    def generation_response(payload: dict, package_name: str | None):
        if package_name in ConfigEngine.OFFICIAL_ORDERED_PACKAGES:
            return app.response_class(
                json.dumps(payload, ensure_ascii=False),
                mimetype="application/json",
            )
        return jsonify(payload)

    def metadata_response(payload):
        """Return version-aware browser-cacheable configuration metadata."""
        response = jsonify(payload)
        requested_version = str(request.args.get("v", ""))
        requested_config_version = requested_version.rsplit(".", 1)[-1]
        is_versioned = bool(requested_version) and requested_config_version == str(
            loaded_config_version
        )
        response.cache_control.private = True
        if is_versioned:
            response.cache_control.max_age = 31_536_000
            response.cache_control.immutable = True
        else:
            response.cache_control.max_age = 0
            response.cache_control.no_cache = True
        response.headers["Vary"] = "Cookie"
        response.headers["X-CDP-Config-Version"] = str(loaded_config_version)
        response.add_etag()
        return response.make_conditional(request)

    def validate_personal_folder(folder_id: str | None, user_id: str):
        if folder_id is None:
            return None
        folder = folder_store.get_folder(folder_id, user_id)
        if (
            folder is None
            or folder.get("visibility") != "private"
            or folder.get("ownerId") != user_id
        ):
            return error_response("INVALID_FOLDER", "只能使用自己的个人文件夹", 400)
        return None

    def require_super_admin():
        if getattr(g, "current_user", {}).get("role") != "super_admin":
            return error_response("FORBIDDEN", "只有超级管理员可以执行此操作", 403)
        return None

    def require_config_admin():
        if getattr(g, "current_user", {}).get("role") not in {
            "super_admin",
            "config_admin",
        }:
            return error_response("FORBIDDEN", "只有配置管理员可以执行此操作", 403)
        return None

    @app.before_request
    def require_login():
        if not request.path.startswith("/api/"):
            return None
        if request.path == "/api/health" or request.path.startswith("/api/auth/"):
            return None
        user = user_store.get_user(session.get("user_id"))
        if (
            user is None
            or not user.get("enabled")
            or session.get("session_version") != user.get("sessionVersion")
        ):
            session.clear()
            return error_response("AUTH_REQUIRED", "登录已失效，请重新登录", 401)
        g.current_user = user
        return None

    @app.before_request
    def synchronize_published_config():
        if request.endpoint in config_dependent_endpoints:
            ensure_latest_config()
        return None

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "请输入用户名和密码", 400)
        username = payload.get("username")
        password = payload.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            return error_response("INVALID_REQUEST", "请输入用户名和密码", 400)
        user = user_store.authenticate(username, password)
        if user is None:
            return error_response("INVALID_CREDENTIALS", "用户名或密码不正确", 401)
        session.clear()
        session["user_id"] = user["id"]
        session["session_version"] = user["sessionVersion"]
        session.permanent = True
        return jsonify({"user": user})

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        session.clear()
        return "", 204

    @app.route("/api/auth/me")
    def current_user():
        user = user_store.get_user(session.get("user_id"))
        if (
            user is None
            or not user.get("enabled")
            or session.get("session_version") != user.get("sessionVersion")
        ):
            session.clear()
            return error_response("AUTH_REQUIRED", "请先登录", 401)
        return jsonify({"user": user})

    @app.route("/api/auth/invite")
    def inspect_invite():
        try:
            invite = user_store.get_invite(request.args.get("token", ""))
        except InviteInvalidError as exc:
            return error_response("INVITE_INVALID", str(exc), 410)
        return jsonify(
            {
                "role": invite["role"],
                "expiresAt": invite["expiresAt"],
            }
        )

    @app.route("/api/auth/register", methods=["POST"])
    def register():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "注册信息格式不正确", 400)
        try:
            user = user_store.register_with_invite(
                payload.get("token", ""),
                payload.get("username", ""),
                payload.get("password", ""),
                payload.get("displayName", ""),
            )
        except InviteInvalidError as exc:
            return error_response("INVITE_INVALID", str(exc), 410)
        except UserAlreadyExistsError:
            return error_response("USERNAME_EXISTS", "该用户名已被使用", 409)
        except ValueError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        session.clear()
        session["user_id"] = user["id"]
        session["session_version"] = user["sessionVersion"]
        session.permanent = True
        return jsonify({"user": user}), 201

    @app.route("/api/admin/users")
    def admin_list_users():
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        users = user_store.list_users()
        for user in users:
            user["dataCounts"] = user_store.get_user_data_counts(user["id"])
        return jsonify(users)

    @app.route("/api/admin/users/<user_id>", methods=["PATCH"])
    def admin_update_user(user_id: str):
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "账号设置格式不正确", 400)
        target = user_store.get_user(user_id)
        if target is None:
            return error_response("USER_NOT_FOUND", "用户不存在", 404)
        next_username = payload.get("username", target["username"])
        next_display_name = payload.get("displayName", target["displayName"])
        next_enabled = payload.get("enabled", target["enabled"])
        next_role = payload.get("role", target["role"])
        if not isinstance(next_enabled, bool):
            return error_response("INVALID_REQUEST", "enabled 必须是布尔值", 400)
        try:
            next_role = user_store._validate_role(next_role)
        except ValueError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        if user_id == g.current_user["id"] and (
            not next_enabled or next_role != "super_admin"
        ):
            return error_response("SELF_LOCKOUT", "不能停用或降级当前超级管理员", 400)
        if target["role"] == "super_admin" and (
            not next_enabled or next_role != "super_admin"
        ):
            active_admins = [
                item
                for item in user_store.list_users()
                if item["role"] == "super_admin" and item["enabled"]
            ]
            if len(active_admins) <= 1:
                return error_response("LAST_ADMIN", "至少需要保留一名启用中的超级管理员", 400)
        try:
            updated = user_store.update_user(
                user_id,
                username=next_username,
                display_name=next_display_name,
                enabled=next_enabled,
                role=next_role,
            )
        except UserAlreadyExistsError:
            return error_response("USERNAME_EXISTS", "该登录账号已被使用", 409)
        except ValueError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        except UserNotFoundError:
            return error_response("USER_NOT_FOUND", "用户不存在", 404)
        changes = {
            field: {"from": target.get(field), "to": updated.get(field)}
            for field in ("username", "displayName", "enabled", "role")
            if target.get(field) != updated.get(field)
        }
        if changes:
            user_store.record_audit(
                g.current_user["id"],
                "USER_UPDATED",
                target_user_id=user_id,
                details={"changes": changes},
            )
        updated["dataCounts"] = user_store.get_user_data_counts(user_id)
        return jsonify(updated)

    @app.route("/api/admin/users/<user_id>/password", methods=["POST"])
    def admin_reset_user_password(user_id: str):
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "密码重置信息格式不正确", 400)
        generate = payload.get("generate", False)
        if not isinstance(generate, bool):
            return error_response("INVALID_REQUEST", "generate 必须是布尔值", 400)
        try:
            updated, temporary_password = user_store.reset_password_by_id(
                user_id,
                payload.get("password"),
                generate=generate,
            )
        except ValueError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        except UserNotFoundError:
            return error_response("USER_NOT_FOUND", "用户不存在", 404)
        user_store.record_audit(
            g.current_user["id"],
            "USER_PASSWORD_RESET",
            target_user_id=user_id,
            details={"generated": generate},
        )
        response = {"user": updated}
        if temporary_password is not None:
            response["temporaryPassword"] = temporary_password
        return jsonify(response)

    @app.route("/api/admin/users/<user_id>/sessions/revoke", methods=["POST"])
    def admin_revoke_user_sessions(user_id: str):
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        try:
            updated = user_store.revoke_sessions(user_id)
        except UserNotFoundError:
            return error_response("USER_NOT_FOUND", "用户不存在", 404)
        user_store.record_audit(
            g.current_user["id"],
            "USER_SESSIONS_REVOKED",
            target_user_id=user_id,
        )
        return jsonify(updated)

    @app.route("/api/admin/users/<user_id>/data")
    def admin_get_user_data(user_id: str):
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        target = user_store.get_user(user_id)
        if target is None:
            return error_response("USER_NOT_FOUND", "用户不存在", 404)
        result = {
            "user": target,
            "counts": user_store.get_user_data_counts(user_id),
            "solutions": solution_store.list_solutions(None, "mine", user_id),
            "folders": folder_store.list_folders("mine", user_id),
            "tasks": task_store.list_tasks(user_id),
        }
        user_store.record_audit(
            g.current_user["id"],
            "USER_DATA_VIEWED",
            target_user_id=user_id,
            details={"counts": result["counts"]},
        )
        return jsonify(result)

    @app.route("/api/admin/audit-logs")
    def admin_list_audit_logs():
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        try:
            limit = int(request.args.get("limit", 100))
        except (TypeError, ValueError):
            return error_response("INVALID_REQUEST", "limit 必须是整数", 400)
        return jsonify(
            user_store.list_audit_logs(
                limit=limit,
                target_user_id=request.args.get("targetUserId") or None,
            )
        )

    @app.route("/api/admin/invites")
    def admin_list_invites():
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        return jsonify(user_store.list_invites())

    @app.route("/api/admin/invites", methods=["POST"])
    def admin_create_invite():
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        role = payload.get("role", "user")
        expires_days = payload.get("expiresDays", 7)
        try:
            expires_days = int(expires_days)
            invite = user_store.create_invite(
                g.current_user["id"],
                role=role,
                expires_days=expires_days,
            )
        except (TypeError, ValueError) as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        user_store.record_audit(
            g.current_user["id"],
            "INVITE_CREATED",
            details={
                "inviteId": invite["id"],
                "role": invite["role"],
                "expiresAt": invite["expiresAt"],
            },
        )
        return jsonify(invite), 201

    @app.route("/api/admin/invites/<invite_id>/revoke", methods=["POST"])
    def admin_revoke_invite(invite_id: str):
        permission_error = require_super_admin()
        if permission_error is not None:
            return permission_error
        try:
            invite = user_store.revoke_invite(invite_id)
        except InviteInvalidError as exc:
            return error_response("INVITE_INVALID", str(exc), 400)
        user_store.record_audit(
            g.current_user["id"],
            "INVITE_REVOKED",
            details={"inviteId": invite["id"], "role": invite["role"]},
        )
        return jsonify(invite)

    @app.route("/api/admin/dimensions")
    def admin_list_dimensions():
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        return jsonify(dimension_store.list_dimensions())

    @app.route("/api/admin/dimensions/<filename>")
    def admin_list_dimension_rows(filename: str):
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        try:
            result = dimension_store.list_rows(
                filename,
                page=int(request.args.get("page", 1)),
                page_size=int(request.args.get("pageSize", 50)),
                query=request.args.get("q", ""),
                package_name=request.args.get("package", ""),
                include_disabled=request.args.get("includeDisabled", "1") != "0",
            )
        except (ValueError, DimensionValidationError) as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        return jsonify(result)

    @app.route("/api/admin/dimensions/<filename>", methods=["POST"])
    def admin_create_dimension_row(filename: str):
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        try:
            created = dimension_store.create_row(
                filename,
                payload.get("data", payload),
                g.current_user["id"],
            )
        except DimensionConflictError as exc:
            return error_response("DIMENSION_CONFLICT", str(exc), 409)
        except DimensionValidationError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        return jsonify(created), 201

    @app.route("/api/admin/dimensions/<filename>/import", methods=["POST"])
    def admin_import_dimension_rows(filename: str):
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        try:
            result = dimension_store.import_rows(
                filename,
                payload.get("rows", []),
                g.current_user["id"],
                replace=bool(payload.get("replace", False)),
            )
        except DimensionConflictError as exc:
            return error_response("DIMENSION_CONFLICT", str(exc), 409)
        except DimensionValidationError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        return jsonify(result)

    @app.route("/api/admin/dimensions/<filename>/<row_id>", methods=["PUT"])
    def admin_update_dimension_row(filename: str, row_id: str):
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        try:
            updated = dimension_store.update_row(
                filename,
                row_id,
                payload.get("data", payload),
                g.current_user["id"],
            )
        except DimensionNotFoundError:
            return error_response("DIMENSION_NOT_FOUND", "维表记录不存在", 404)
        except DimensionConflictError as exc:
            return error_response("DIMENSION_CONFLICT", str(exc), 409)
        except DimensionValidationError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        return jsonify(updated)

    @app.route("/api/admin/dimensions/<filename>/<row_id>/status", methods=["PATCH"])
    def admin_update_dimension_status(filename: str, row_id: str):
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload.get("enabled"), bool):
            return error_response("INVALID_REQUEST", "enabled 必须是布尔值", 400)
        try:
            updated = dimension_store.set_enabled(
                filename,
                row_id,
                payload["enabled"],
                g.current_user["id"],
            )
        except DimensionNotFoundError:
            return error_response("DIMENSION_NOT_FOUND", "维表记录不存在", 404)
        return jsonify(updated)

    @app.route("/api/admin/config/status")
    def admin_config_status():
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        return jsonify(dimension_store.get_config_status())

    @app.route("/api/admin/config/versions")
    def admin_config_versions():
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        return jsonify(dimension_store.list_versions())

    @app.route("/api/admin/config/publish", methods=["POST"])
    def admin_publish_config():
        nonlocal loaded_config_version
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        payload = request.get_json(silent=True) or {}
        try:
            with config_reload_lock:
                version = dimension_store.publish_changes(
                    g.current_user["id"],
                    payload.get("note", ""),
                )
                engine.reload_config(validate_on_load=False)
                loaded_config_version = version["version"]
        except DimensionValidationError as exc:
            return error_response("INVALID_REQUEST", str(exc), 400)
        return jsonify(version), 201

    @app.route("/api/admin/config/discard", methods=["POST"])
    def admin_discard_config():
        permission_error = require_config_admin()
        if permission_error is not None:
            return permission_error
        result = dimension_store.discard_changes()
        return jsonify(result)

    @app.route("/api/packages")
    def get_packages():
        return metadata_response(list(engine.packages.keys()))

    @app.route("/api/health")
    def health_check():
        return jsonify({"status": "ok"})

    @app.route("/api/config/version")
    def get_config_version():
        response = jsonify(dimension_store.get_published_version())
        response.cache_control.no_store = True
        return response

    @app.route("/api/meta")
    def get_all_package_meta():
        return metadata_response(
            {name: engine.get_package_meta(name) for name in engine.packages}
        )

    @app.route("/api/meta/<package_name>")
    def get_package_meta(package_name: str):
        return metadata_response(engine.get_package_meta(package_name))

    @app.route("/api/package_meta")
    def get_package_meta_alias():
        name = request.args.get("name")
        if not name:
            return error_response("PACKAGE_NAME_REQUIRED", "请选择人群包类型", 400)
        return metadata_response(engine.get_package_meta(name))

    @app.route("/api/generate_json", methods=["POST"])
    def generate_json_alias():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("params", {}), dict):
            return error_response("INVALID_REQUEST", "圈选参数格式不正确", 400)
        package_name = data.get("pkgName")
        params = data.get("params", {})
        params["_package"] = package_name
        try:
            return generation_response(engine.generate_json(params), package_name)
        except Exception as exc:
            app.logger.exception("generate_json failed [%s]: %s", package_name, exc)
            return error_response("GENERATION_FAILED", "圈选条件生成失败，请检查填写内容后重试", 500)

    @app.route("/api/generate", methods=["POST"])
    def generate():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "圈选参数格式不正确", 400)
        try:
            package_name = payload.get("_package", ConfigEngine.CATEGORY_PUBLIC_PACKAGE)
            return generation_response(engine.generate_json(payload), package_name)
        except Exception as exc:
            app.logger.exception("generate failed: %s", exc)
            return error_response("GENERATION_FAILED", "圈选条件生成失败，请检查填写内容后重试", 500)

    @app.route("/api/list_templates")
    def list_templates():
        template_dir = engine.template_dir
        if not os.path.exists(template_dir):
            return jsonify([])
        files = [name for name in os.listdir(template_dir) if name.endswith((".csv", ".xlsx"))]
        return jsonify(files)

    @app.route("/api/download_template/<filename>")
    def download_template(filename: str):
        if "/" in filename or "\\" in filename:
            abort(404)
        if not filename.endswith((".csv", ".xlsx")):
            abort(404)
        return send_from_directory(engine.template_dir, filename, as_attachment=True)

    @app.route("/route-interface-demo")
    def route_interface_demo():
        return send_from_directory(os.path.join(BASE_DIR, "cdp_backend", "static"), "route-interface-demo.html")

    @app.route("/api/batch_generate", methods=["POST"])
    def batch_generate():
        if "file" not in request.files:
            return error_response("FILE_REQUIRED", "请选择需要处理的文件", 400)
        result = engine.batch_generate(request.files["file"])
        return generation_response(
            {
                "results": result.results,
                "detected_pkg": result.detected_pkg,
                "errors": result.errors,
            },
            result.detected_pkg,
        )

    @app.route("/api/solutions")
    def list_solutions():
        status = request.args.get("status")
        scope = request.args.get("scope", "mine")
        folder_id = request.args.get("folderId")
        if scope not in ("mine", "public"):
            return error_response("INVALID_SCOPE", "方案库类型不正确", 400)
        normalized_status = None if status in (None, "all") else status
        solutions = solution_store.list_solutions(
            normalized_status, scope, g.current_user["id"]
        )
        if folder_id:
            solutions = [s for s in solutions if s.get("folderId") == folder_id]
        return jsonify(solutions)

    @app.route("/api/solutions/<solution_id>")
    def get_solution(solution_id: str):
        solution = solution_store.get_solution(solution_id, g.current_user["id"])
        if solution is None:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或你无权查看", 404)
        return jsonify(solution)

    @app.route("/api/solutions/drafts", methods=["POST"])
    def create_solution_draft():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "方案数据格式不正确", 400)
        folder_error = validate_personal_folder(payload.get("folderId"), g.current_user["id"])
        if folder_error is not None:
            return folder_error
        created = solution_store.create_draft(payload, g.current_user["id"])
        return jsonify(created), 201

    @app.route("/api/solutions/<solution_id>", methods=["PUT"])
    def update_solution(solution_id: str):
        try:
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                return error_response("INVALID_REQUEST", "方案数据格式不正确", 400)
            folder_error = validate_personal_folder(payload.get("folderId"), g.current_user["id"])
            if folder_error is not None:
                return folder_error
            updated = solution_store.update_draft(
                solution_id, payload, g.current_user["id"]
            )
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能直接修改，请先复制到我的方案", 403)
        except InvalidSolutionStateError:
            return error_response("INVALID_SOLUTION_STATE", "当前方案状态不允许修改", 409)
        return jsonify(updated)

    @app.route("/api/solutions/<solution_id>/publish", methods=["POST"])
    def publish_solution(solution_id: str):
        try:
            published = solution_store.publish(solution_id, g.current_user["id"])
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能直接发布，请先复制到我的方案", 403)
        except InvalidSolutionStateError:
            return error_response("INVALID_SOLUTION_STATE", "只有草稿方案可以发布", 409)
        return jsonify(published)

    @app.route("/api/solutions/<solution_id>/edit-draft", methods=["POST"])
    def create_solution_edit_draft(solution_id: str):
        try:
            created = solution_store.create_edit_draft(solution_id, g.current_user["id"])
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能直接编辑，请先复制到我的方案", 403)
        except InvalidSolutionStateError:
            return error_response("INVALID_SOLUTION_STATE", "只有已发布的个人方案可以创建编辑草稿", 409)
        return jsonify(created), 201

    @app.route("/api/solutions/<solution_id>/duplicate", methods=["POST"])
    def duplicate_solution(solution_id: str):
        try:
            duplicated = solution_store.duplicate(solution_id, g.current_user["id"])
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或你无权查看", 404)
        return jsonify(duplicated), 201

    @app.route("/api/solutions/<solution_id>", methods=["DELETE"])
    def delete_solution(solution_id: str):
        try:
            deleted = solution_store.delete_solution(solution_id, g.current_user["id"])
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能删除", 403)
        if not deleted:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        return "", 204

    @app.route("/api/solutions/<solution_id>/move", methods=["PUT"])
    def move_solution(solution_id: str):
        payload = request.get_json(silent=True) or {}
        folder_id = payload.get("folderId")
        try:
            if folder_id is not None:
                target = folder_store.get_folder(folder_id, g.current_user["id"])
                if target is None or target.get("visibility") != "private" or target.get("ownerId") != g.current_user["id"]:
                    return error_response("INVALID_FOLDER", "只能移动到自己的个人文件夹", 400)
            updated = solution_store.move_solution(
                solution_id, folder_id, g.current_user["id"]
            )
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能移动", 403)
        return jsonify(updated)

    @app.route("/api/solutions/<solution_id>/custom-fields", methods=["PUT"])
    def update_solution_custom_fields(solution_id: str):
        payload = request.get_json(silent=True) or {}
        custom_fields = payload.get("customFields")
        nodes = payload.get("nodes")
        if custom_fields is None:
            return error_response("CUSTOM_FIELDS_REQUIRED", "请提供自定义字段数据", 400)
        try:
            if not isinstance(custom_fields, list):
                return error_response("INVALID_REQUEST", "自定义字段数据格式不正确", 400)
            updated = solution_store.update_custom_fields(
                solution_id, custom_fields, nodes, g.current_user["id"]
            )
        except SolutionNotFoundError:
            return error_response("SOLUTION_NOT_FOUND", "该方案不存在或已被删除", 404)
        except SolutionAccessError:
            return error_response("PUBLIC_SOLUTION_READ_ONLY", "公共方案不能直接修改，请先复制到我的方案", 403)
        return jsonify(updated)

    @app.route("/api/folders")
    def list_folders():
        scope = request.args.get("scope", "mine")
        if scope not in ("mine", "public"):
            return error_response("INVALID_SCOPE", "文件夹类型不正确", 400)
        return jsonify(folder_store.list_folders(scope, g.current_user["id"]))

    @app.route("/api/folders", methods=["POST"])
    def create_folder():
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return error_response("FOLDER_NAME_REQUIRED", "文件夹名称不能为空", 400)
        parent_id = payload.get("parentId")
        try:
            created = folder_store.create_folder(name, g.current_user["id"], parent_id)
        except (FolderNotFoundError, FolderAccessError):
            return error_response("INVALID_PARENT_FOLDER", "上级文件夹不存在或不可编辑", 400)
        return jsonify(created), 201

    @app.route("/api/folders/<folder_id>", methods=["PUT"])
    def update_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return error_response("FOLDER_NAME_REQUIRED", "文件夹名称不能为空", 400)
        try:
            updated = folder_store.update_folder(folder_id, name, g.current_user["id"])
        except FolderNotFoundError:
            return error_response("FOLDER_NOT_FOUND", "该文件夹不存在或已被删除", 404)
        except FolderAccessError:
            return error_response("PUBLIC_FOLDER_READ_ONLY", "公共文件夹不能修改", 403)
        return jsonify(updated)

    @app.route("/api/folders/<folder_id>", methods=["DELETE"])
    def delete_folder(folder_id: str):
        try:
            deleted_ids = folder_store.delete_folder(folder_id, g.current_user["id"])
        except FolderNotFoundError:
            return error_response("FOLDER_NOT_FOUND", "该文件夹不存在或已被删除", 404)
        except FolderAccessError:
            return error_response("PUBLIC_FOLDER_READ_ONLY", "公共文件夹不能删除", 403)
        return "", 204

    @app.route("/api/folders/<folder_id>/move", methods=["PUT"])
    def move_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        parent_id = payload.get("parentId")
        try:
            updated = folder_store.move_folder(
                folder_id, parent_id, g.current_user["id"]
            )
        except FolderNotFoundError:
            return error_response("FOLDER_NOT_FOUND", "文件夹不存在或已被删除", 404)
        except FolderAccessError:
            return error_response("PUBLIC_FOLDER_READ_ONLY", "公共文件夹不能移动", 403)
        except ValueError as exc:
            app.logger.info("folder move rejected: %s", exc)
            return error_response("INVALID_FOLDER_MOVE", "文件夹不能移动到自身或其子文件夹中", 400)
        return jsonify(updated)

    # -- 任务中台 API --

    @app.route("/api/tasks", methods=["POST"])
    def create_task():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "任务数据格式不正确", 400)
        name = (payload.get("name") or "").strip()
        if not name:
            return error_response("TASK_NAME_REQUIRED", "任务名称不能为空", 400)
        task = task_store.create_task(payload, g.current_user["id"])
        return jsonify(task), 201

    @app.route("/api/tasks")
    def list_tasks():
        return jsonify(task_store.list_tasks(g.current_user["id"]))

    @app.route("/api/tasks/<task_id>")
    def get_task(task_id: str):
        task = task_store.get_task(task_id, g.current_user["id"])
        if task is None:
            return error_response("TASK_NOT_FOUND", "该任务不存在或已被删除", 404)
        return jsonify(task)

    @app.route("/api/tasks/<task_id>", methods=["DELETE"])
    def delete_task(task_id: str):
        deleted = task_store.delete_task(task_id, g.current_user["id"])
        if not deleted:
            return error_response("TASK_NOT_FOUND", "该任务不存在或已被删除", 404)
        return "", 204

    @app.route("/api/tasks/<task_id>/progress", methods=["PUT"])
    def update_task_progress(task_id: str):
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "任务进度数据格式不正确", 400)
        try:
            updated = task_store.update_progress(
                task_id, payload, g.current_user["id"]
            )
        except TaskNotFoundError:
            return error_response("TASK_NOT_FOUND", "该任务不存在或已被删除", 404)
        return jsonify(updated)

    @app.errorhandler(404)
    def not_found(_error):
        return error_response("NOT_FOUND", "请求的内容不存在", 404)

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error("500 error: %s", error, exc_info=True)
        return error_response("INTERNAL_ERROR", "服务暂时出现问题，请稍后重试", 500)
