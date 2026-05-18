from __future__ import annotations

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

from .constants import BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME
from .databank_automation import DatabankAutomationError, DatabankAutomator
from .engine import ConfigEngine
from .solution_store import InvalidSolutionStateError, SolutionNotFoundError, SolutionStore
from .validator import ConfigValidationError


def is_production() -> bool:
    return os.environ.get("FLASK_ENV", "development") == "production"


def configure_logging(app: Flask, production: bool) -> None:
    if production:
        log_dir = os.environ.get("LOG_DIR", "/var/log/cdp-project")
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


def create_app(databank_automator: DatabankAutomator | None = None) -> tuple[Flask, ConfigEngine]:
    app = Flask(__name__)
    production = is_production()
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    app.config["JSON_AS_ASCII"] = False
    solutions_file = os.environ.get("SOLUTIONS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME))
    solution_store = SolutionStore(solutions_file)

    if production:
        allowed_origins = [item.strip() for item in os.environ.get("CORS_ORIGINS", "").split(",") if item.strip()]
        CORS(app, origins=allowed_origins or ["https://databank.tmall.com"])
    else:
        CORS(app)

    configure_logging(app, production)

    try:
        engine = ConfigEngine(logger=app.logger)
    except ConfigValidationError as exc:
        app.logger.error("Configuration validation failed at startup:\n%s", exc)
        raise

    register_routes(app, engine, production, solution_store, databank_automator or DatabankAutomator())
    return app, engine


def register_routes(
    app: Flask,
    engine: ConfigEngine,
    production: bool,
    solution_store: SolutionStore,
    databank_automator: DatabankAutomator,
) -> None:
    @app.route("/api/packages")
    def get_packages():
        return jsonify(list(engine.packages.keys()))

    @app.route("/api/health")
    def health_check():
        return jsonify(
            {
                "status": "ok",
                "mode": "production" if production else "development",
                "packages": len(engine.packages),
                "cached_meta": len(engine._meta_cache),
                "cached_logic": len(engine._logic_cache),
                "base_dir": BASE_DIR,
            }
        )

    @app.route("/api/meta/<package_name>")
    def get_package_meta(package_name: str):
        return jsonify(engine.get_package_meta(package_name))

    @app.route("/api/package_meta")
    def get_package_meta_alias():
        name = request.args.get("name")
        if not name:
            return jsonify({"error": "缺少 name 参数"}), 400
        return jsonify(engine.get_package_meta(name))

    @app.route("/api/generate_json", methods=["POST"])
    def generate_json_alias():
        data = request.get_json(silent=True) or {}
        package_name = data.get("pkgName")
        params = data.get("params", {})
        params["_package"] = package_name
        try:
            return jsonify(engine.generate_json(params))
        except Exception as exc:
            app.logger.error("generate_json failed [%s]: %s", package_name, exc)
            return jsonify({"error": str(exc)}), 500

    @app.route("/api/generate", methods=["POST"])
    def generate():
        try:
            return jsonify(engine.generate_json(request.get_json(silent=True) or {}))
        except Exception as exc:
            app.logger.error("generate failed: %s", exc)
            return jsonify({"error": str(exc)}), 500

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

    @app.route("/api/batch_generate", methods=["POST"])
    def batch_generate():
        if "file" not in request.files:
            return jsonify({"error": "未收到文件"}), 400
        result = engine.batch_generate(request.files["file"])
        return jsonify(
            {
                "results": result.results,
                "detected_pkg": result.detected_pkg,
                "errors": result.errors,
            }
        )

    @app.route("/api/databank/automate", methods=["POST"])
    def automate_databank():
        data = request.get_json(silent=True) or {}
        json_text = str(data.get("jsonText") or "").strip()
        if not json_text:
            return jsonify({"error": "缺少 jsonText 参数"}), 400
        try:
            return jsonify(databank_automator.automate(json_text))
        except DatabankAutomationError as exc:
            app.logger.warning("databank automation failed: %s", exc)
            return jsonify({"error": str(exc)}), 502

    @app.route("/api/solutions")
    def list_solutions():
        status = request.args.get("status")
        if status in (None, "all"):
            return jsonify(solution_store.list_solutions())
        return jsonify(solution_store.list_solutions(status=status))

    @app.route("/api/solutions/<solution_id>")
    def get_solution(solution_id: str):
        solution = solution_store.get_solution(solution_id)
        if solution is None:
            return jsonify({"error": "solution not found"}), 404
        return jsonify(solution)

    @app.route("/api/solutions/drafts", methods=["POST"])
    def create_solution_draft():
        created = solution_store.create_draft(request.get_json(silent=True) or {})
        return jsonify(created), 201

    @app.route("/api/solutions/<solution_id>", methods=["PUT"])
    def update_solution(solution_id: str):
        try:
            updated = solution_store.update_draft(solution_id, request.get_json(silent=True) or {})
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        except InvalidSolutionStateError:
            return jsonify({"error": "invalid solution state"}), 409
        return jsonify(updated)

    @app.route("/api/solutions/<solution_id>/publish", methods=["POST"])
    def publish_solution(solution_id: str):
        try:
            published = solution_store.publish(solution_id)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        except InvalidSolutionStateError:
            return jsonify({"error": "invalid solution state"}), 409
        return jsonify(published)

    @app.route("/api/solutions/<solution_id>/edit-draft", methods=["POST"])
    def create_solution_edit_draft(solution_id: str):
        try:
            created = solution_store.create_edit_draft(solution_id)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        except InvalidSolutionStateError:
            return jsonify({"error": "invalid solution state"}), 409
        return jsonify(created), 201

    @app.route("/api/solutions/<solution_id>/duplicate", methods=["POST"])
    def duplicate_solution(solution_id: str):
        try:
            duplicated = solution_store.duplicate(solution_id)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        return jsonify(duplicated), 201

    @app.route("/api/solutions/<solution_id>", methods=["DELETE"])
    def delete_solution(solution_id: str):
        deleted = solution_store.delete_solution(solution_id)
        if not deleted:
            return jsonify({"error": "solution not found"}), 404
        return "", 204

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "接口不存在"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error("500 error: %s", error, exc_info=True)
        return jsonify({"error": "服务器内部错误"}), 500
