from __future__ import annotations

import logging
import os
import sys
from datetime import timedelta
from logging.handlers import RotatingFileHandler

from flask import Flask, abort, g, jsonify, request, send_from_directory, session
from flask_cors import CORS

from .constants import BASE_DIR, DB_PATH
from .engine import ConfigEngine
from .folder_store import FolderAccessError, FolderNotFoundError, FolderStore
from .solution_store import (
    InvalidSolutionStateError,
    SolutionAccessError,
    SolutionNotFoundError,
    SolutionStore,
)
from .task_store import TaskNotFoundError, TaskStore
from .user_store import UserStore
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
        engine = ConfigEngine(logger=app.logger)
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
) -> None:
    def error_response(code: str, message: str, status: int):
        return jsonify({"code": code, "message": message}), status

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

    @app.before_request
    def require_login():
        if not request.path.startswith("/api/"):
            return None
        if request.path == "/api/health" or request.path.startswith("/api/auth/"):
            return None
        user = user_store.get_user(session.get("user_id"))
        if user is None or not user.get("enabled"):
            session.clear()
            return error_response("AUTH_REQUIRED", "登录已失效，请重新登录", 401)
        g.current_user = user
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
        session.permanent = True
        return jsonify({"user": user})

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        session.clear()
        return "", 204

    @app.route("/api/auth/me")
    def current_user():
        user = user_store.get_user(session.get("user_id"))
        if user is None or not user.get("enabled"):
            session.clear()
            return error_response("AUTH_REQUIRED", "请先登录", 401)
        return jsonify({"user": user})

    @app.route("/api/packages")
    def get_packages():
        return jsonify(list(engine.packages.keys()))

    @app.route("/api/health")
    def health_check():
        return jsonify({"status": "ok"})

    @app.route("/api/meta/<package_name>")
    def get_package_meta(package_name: str):
        return jsonify(engine.get_package_meta(package_name))

    @app.route("/api/package_meta")
    def get_package_meta_alias():
        name = request.args.get("name")
        if not name:
            return error_response("PACKAGE_NAME_REQUIRED", "请选择人群包类型", 400)
        return jsonify(engine.get_package_meta(name))

    @app.route("/api/generate_json", methods=["POST"])
    def generate_json_alias():
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or not isinstance(data.get("params", {}), dict):
            return error_response("INVALID_REQUEST", "圈选参数格式不正确", 400)
        package_name = data.get("pkgName")
        params = data.get("params", {})
        params["_package"] = package_name
        try:
            return jsonify(engine.generate_json(params))
        except Exception as exc:
            app.logger.exception("generate_json failed [%s]: %s", package_name, exc)
            return error_response("GENERATION_FAILED", "圈选条件生成失败，请检查填写内容后重试", 500)

    @app.route("/api/generate", methods=["POST"])
    def generate():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error_response("INVALID_REQUEST", "圈选参数格式不正确", 400)
        try:
            return jsonify(engine.generate_json(payload))
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
        return jsonify(
            {
                "results": result.results,
                "detected_pkg": result.detected_pkg,
                "errors": result.errors,
            }
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
