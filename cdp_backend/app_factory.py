from __future__ import annotations

import logging
import os
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory
from flask_cors import CORS

from .constants import BASE_DIR, FOLDERS_FILENAME, RPA_RESULTS_DIRNAME, RPA_TASKS_DIRNAME, RUNTIME_DIRNAME, SOLUTIONS_FILENAME
from .rpa_agent.dmp_api import filter_ready_tags, group_tags_by_category, load_tags
from .rpa_agent.orchestrator import RpaOrchestrator
from .rpa_agent.task_store import TaskStatus, TaskStore
from .engine import ConfigEngine
from .folder_store import FolderNotFoundError, FolderStore
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


def create_app() -> tuple[Flask, ConfigEngine]:
    app = Flask(__name__)
    production = is_production()
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
    app.config["JSON_AS_ASCII"] = False
    solutions_file = os.environ.get("SOLUTIONS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, SOLUTIONS_FILENAME))
    solution_store = SolutionStore(solutions_file)
    folders_file = os.environ.get("FOLDERS_FILE", os.path.join(BASE_DIR, RUNTIME_DIRNAME, FOLDERS_FILENAME))
    folder_store = FolderStore(folders_file)

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

    register_routes(app, engine, production, solution_store, folder_store)
    return app, engine


def register_routes(
    app: Flask,
    engine: ConfigEngine,
    production: bool,
    solution_store: SolutionStore,
    folder_store: FolderStore,
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

    @app.route("/route-interface-demo")
    def route_interface_demo():
        return send_from_directory(os.path.join(BASE_DIR, "cdp_backend", "static"), "route-interface-demo.html")

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

    @app.route("/api/solutions")
    def list_solutions():
        status = request.args.get("status")
        folder_id = request.args.get("folderId")
        if status in (None, "all"):
            solutions = solution_store.list_solutions()
        else:
            solutions = solution_store.list_solutions(status=status)
        if folder_id:
            solutions = [s for s in solutions if s.get("folderId") == folder_id]
        return jsonify(solutions)

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

    @app.route("/api/solutions/<solution_id>/move", methods=["PUT"])
    def move_solution(solution_id: str):
        payload = request.get_json(silent=True) or {}
        folder_id = payload.get("folderId")
        try:
            updated = solution_store.move_solution(solution_id, folder_id)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        return jsonify(updated)

    @app.route("/api/solutions/<solution_id>/custom-fields", methods=["PUT"])
    def update_solution_custom_fields(solution_id: str):
        payload = request.get_json(silent=True) or {}
        custom_fields = payload.get("customFields")
        nodes = payload.get("nodes")
        if custom_fields is None:
            return jsonify({"error": "customFields is required"}), 400
        try:
            updated = solution_store.update_custom_fields(solution_id, custom_fields, nodes)
        except SolutionNotFoundError:
            return jsonify({"error": "solution not found"}), 404
        return jsonify(updated)

    @app.route("/api/folders")
    def list_folders():
        return jsonify(folder_store.list_folders())

    @app.route("/api/folders", methods=["POST"])
    def create_folder():
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "folder name is required"}), 400
        parent_id = payload.get("parentId")
        created = folder_store.create_folder(name, parent_id)
        return jsonify(created), 201

    @app.route("/api/folders/<folder_id>", methods=["PUT"])
    def update_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "folder name is required"}), 400
        try:
            updated = folder_store.update_folder(folder_id, name)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        return jsonify(updated)

    @app.route("/api/folders/<folder_id>", methods=["DELETE"])
    def delete_folder(folder_id: str):
        try:
            deleted_ids = folder_store.delete_folder(folder_id)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        with solution_store._lock:
            data = solution_store._load()
            for item in data["solutions"]:
                if item.get("folderId") in deleted_ids:
                    item["folderId"] = None
            solution_store._write(data)
        return "", 204

    @app.route("/api/folders/<folder_id>/move", methods=["PUT"])
    def move_folder(folder_id: str):
        payload = request.get_json(silent=True) or {}
        parent_id = payload.get("parentId")
        try:
            updated = folder_store.move_folder(folder_id, parent_id)
        except FolderNotFoundError:
            return jsonify({"error": "folder not found"}), 404
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        return jsonify(updated)

    # ── RPA routes ────────────────────────────────────────────

    rpa_tasks_dir = os.path.join(BASE_DIR, RUNTIME_DIRNAME, RPA_TASKS_DIRNAME)
    rpa_results_dir = os.path.join(BASE_DIR, RUNTIME_DIRNAME, RPA_RESULTS_DIRNAME)
    rpa_store = TaskStore(Path(rpa_tasks_dir))
    rpa_orchestrator = RpaOrchestrator(rpa_store, Path(rpa_results_dir))

    @app.route("/api/rpa/tags")
    def list_rpa_tags():
        all_tags = rpa_orchestrator.tags
        ready_tags = filter_ready_tags(all_tags)
        return jsonify({
            "allTags": all_tags,
            "readyTags": ready_tags,
            "groups": group_tags_by_category(ready_tags),
        })

    @app.route("/api/rpa/execute", methods=["POST"])
    def execute_rpa_task():
        data = request.get_json(silent=True) or {}
        crowd_name = (data.get("crowdName") or "").strip()
        tag_ids = data.get("tagIds") or []

        if not crowd_name:
            return jsonify({"error": "crowdName is required"}), 400
        if not tag_ids or not isinstance(tag_ids, list):
            return jsonify({"error": "tagIds must be a non-empty array"}), 400

        task = rpa_store.create_task(crowd_name=crowd_name, tag_ids=tag_ids)
        thread = threading.Thread(
            target=rpa_orchestrator.run,
            args=(task["id"], crowd_name, tag_ids),
            daemon=True,
        )
        thread.start()

        return jsonify({"taskId": task["id"]}), 201

    @app.route("/api/rpa/tasks")
    def list_rpa_tasks():
        limit = request.args.get("limit", 50, type=int)
        tasks = rpa_store.list_tasks(limit=limit)
        summaries = []
        for t in tasks:
            summary = {
                "taskId": t["id"],
                "crowdName": t["crowdName"],
                "status": t["status"],
                "progress": t.get("progress"),
                "error": t.get("error"),
                "createdAt": t["createdAt"],
                "updatedAt": t["updatedAt"],
            }
            if t.get("result"):
                summary["totalRows"] = t["result"].get("totalRows")
                summary["excelFilename"] = t["result"].get("excelFilename")
            summaries.append(summary)
        return jsonify({"tasks": summaries})

    @app.route("/api/rpa/tasks/<task_id>")
    def get_rpa_task(task_id: str):
        task = rpa_store.get_task(task_id)
        if task is None:
            return jsonify({"error": "task not found"}), 404
        return jsonify(task)

    @app.route("/api/rpa/tasks/<task_id>/result")
    def get_rpa_task_result(task_id: str):
        task = rpa_store.get_task(task_id)
        if task is None:
            return jsonify({"error": "task not found"}), 404
        if task["status"] != TaskStatus.COMPLETED or task.get("result") is None:
            return jsonify({"error": "task not yet completed"}), 404
        return jsonify({
            "taskId": task["id"],
            "excelUrl": f"/api/rpa/download/{task['result']['excelFilename']}",
            "previewRows": task["result"]["previewRows"],
            "totalRows": task["result"]["totalRows"],
            "generatedAt": task["result"]["generatedAt"],
        })

    @app.route("/api/rpa/download/<filename>")
    def download_rpa_result(filename: str):
        if "/" in filename or "\\" in filename:
            abort(404)
        file_path = os.path.join(rpa_results_dir, filename)
        if not os.path.isfile(file_path):
            return jsonify({"error": "file not found"}), 404
        return send_from_directory(rpa_results_dir, filename, as_attachment=True)

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "接口不存在"}), 404

    @app.errorhandler(500)
    def internal_error(error):
        app.logger.error("500 error: %s", error, exc_info=True)
        return jsonify({"error": "服务器内部错误"}), 500
