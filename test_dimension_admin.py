from __future__ import annotations

import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import Workbook

from cdp_backend.app_factory import create_app
from cdp_backend.user_store import UserStore


class DimensionAdminApiTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-dimension-tests-")
        self.db_path = str(Path(self.temporary_directory.name) / "dimensions.db")
        self.app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "dimension-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        users = UserStore(self.db_path)
        users.create_user("root", "root-password", "Root", role="super_admin")
        users.create_user(
            "config", "config-password", "Config", role="config_admin"
        )
        users.create_user("normal", "normal-password", "Normal", role="user")

    def tearDown(self):
        self.temporary_directory.cleanup()

    def login(self, username: str, password: str):
        client = self.app.test_client()
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200)
        return client

    @staticmethod
    def excel_file(headers, rows, filename="维表批量导入.xlsx"):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "导入数据"
        worksheet.append(headers)
        for row in rows:
            worksheet.append(row)
        content = BytesIO()
        workbook.save(content)
        workbook.close()
        content.seek(0)
        return content, filename

    def test_config_admin_can_create_and_disable_dimension_row(self):
        client = self.login("config", "config-password")
        second_app, _ = create_app(
            {
                "TESTING": True,
                "DB_PATH": self.db_path,
                "SECRET_KEY": "dimension-test-secret",
                "SESSION_COOKIE_SECURE": False,
            }
        )
        second_client = second_app.test_client()
        second_login = second_client.post(
            "/api/auth/login",
            json={"username": "config", "password": "config-password"},
        )
        self.assertEqual(second_login.status_code, 200)
        filename = "类目维表.csv"
        initial = client.get(f"/api/admin/dimensions/{filename}?pageSize=1")
        self.assertEqual(initial.status_code, 200)
        self.assertIn("rows", initial.get_json())

        created = client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>邀请注册",
                    "cateId": "990000001",
                }
            },
        )
        self.assertEqual(created.status_code, 201)
        row = created.get_json()
        self.assertTrue(row["enabled"])
        self.assertTrue(row["hasChanges"])

        meta = client.get("/api/meta/类目公域行为").get_json()
        leaf_cates = next(
            item for item in meta["schema"] if item["key"] == "leafCates"
        )
        self.assertNotIn("测试类目>邀请注册", leaf_cates["options"])

        published = client.post(
            "/api/admin/config/publish",
            json={"note": "add test category"},
        )
        self.assertEqual(published.status_code, 201)
        self.assertEqual(published.get_json()["version"], 1)
        version_marker = second_client.get("/api/config/version")
        self.assertEqual(version_marker.get_json()["version"], 1)

        second_meta_response = second_client.get(
            "/api/meta/类目公域行为?v=test-release.1"
        )
        self.assertEqual(second_meta_response.headers["X-CDP-Config-Version"], "1")
        self.assertIn("immutable", second_meta_response.headers["Cache-Control"])
        meta = second_meta_response.get_json()
        leaf_cates = next(
            item for item in meta["schema"] if item["key"] == "leafCates"
        )
        self.assertIn("测试类目>邀请注册", leaf_cates["options"])

        disabled = client.patch(
            f"/api/admin/dimensions/{filename}/{row['id']}/status",
            json={"enabled": False},
        )
        self.assertEqual(disabled.status_code, 200)
        self.assertFalse(disabled.get_json()["enabled"])

        refreshed = client.get("/api/meta/类目公域行为").get_json()
        refreshed_leaf_cates = next(
            item for item in refreshed["schema"] if item["key"] == "leafCates"
        )
        self.assertIn("测试类目>邀请注册", refreshed_leaf_cates["options"])

        republished = client.post(
            "/api/admin/config/publish",
            json={"note": "disable test category"},
        )
        self.assertEqual(republished.status_code, 201)

        refreshed = client.get("/api/meta/类目公域行为").get_json()
        refreshed_leaf_cates = next(
            item for item in refreshed["schema"] if item["key"] == "leafCates"
        )
        self.assertNotIn("测试类目>邀请注册", refreshed_leaf_cates["options"])

    def test_regular_user_cannot_manage_dimensions(self):
        client = self.login("normal", "normal-password")
        response = client.get("/api/admin/dimensions")
        self.assertEqual(response.status_code, 403)

        excel = self.excel_file(
            ["适用的包", "类目名称", "cateId"],
            [["类目公域行为", "无权限导入", "990100001"]],
        )
        preview = client.post(
            "/api/admin/dimensions/类目维表.csv/import/preview",
            data={"file": excel},
            content_type="multipart/form-data",
        )
        self.assertEqual(preview.status_code, 403)
        confirm = client.post(
            "/api/admin/dimensions/类目维表.csv/import/not-allowed/confirm"
        )
        self.assertEqual(confirm.status_code, 403)

    def test_config_admin_can_preview_and_confirm_excel_import(self):
        client = self.login("config", "config-password")
        filename = "类目维表.csv"
        existing = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": "3C数码配件>USB数码周边", "pageSize": 10},
        ).get_json()["rows"][0]
        updated_id = f"{existing['data']['cateId']}9"
        new_name = "测试类目>Excel批量导入"
        excel = self.excel_file(
            ["适用的包", "类目名称", "cateId"],
            [
                [existing["data"]["适用的包"], existing["data"]["类目名称"], updated_id],
                ["类目公域行为", new_name, "990100002"],
                ["类目公域行为", new_name, "990100002"],
            ],
        )

        preview_response = client.post(
            f"/api/admin/dimensions/{filename}/import/preview",
            data={"file": excel},
            content_type="multipart/form-data",
        )
        self.assertEqual(preview_response.status_code, 200)
        preview = preview_response.get_json()
        self.assertTrue(preview["valid"])
        self.assertEqual(preview["rowCount"], 3)
        self.assertEqual(preview["columnCount"], 3)
        self.assertEqual(preview["created"], 1)
        self.assertEqual(preview["updated"], 0)
        self.assertEqual(preview["existing"], 1)
        self.assertEqual(preview["duplicateInFile"], 1)
        self.assertEqual(preview["unchanged"], 2)
        self.assertEqual(preview["skipped"], 2)
        self.assertEqual(preview["existingRows"][0]["row"], 2)
        self.assertEqual(
            preview["existingRows"][0]["displayName"],
            existing["data"]["类目名称"],
        )
        self.assertEqual(preview["duplicateRows"][0]["row"], 4)
        self.assertEqual(preview["duplicateRows"][0]["duplicateOfRow"], 3)
        self.assertTrue(preview["importId"].startswith("dim_import_"))

        before_confirm = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": new_name},
        ).get_json()
        self.assertEqual(before_confirm["total"], 0)

        confirmed_response = client.post(
            f"/api/admin/dimensions/{filename}/import/{preview['importId']}/confirm"
        )
        self.assertEqual(confirmed_response.status_code, 200)
        confirmed = confirmed_response.get_json()
        self.assertEqual(confirmed["created"], 1)
        self.assertEqual(confirmed["updated"], 0)
        self.assertEqual(confirmed["rowCount"], 1)
        self.assertEqual(confirmed["sourceRowCount"], 3)
        self.assertEqual(confirmed["skipped"], 2)

        imported = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": new_name},
        ).get_json()["rows"][0]
        self.assertTrue(imported["hasChanges"])
        self.assertFalse(imported["published"])
        changed_existing = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": existing["data"]["类目名称"], "pageSize": 10},
        ).get_json()["rows"][0]
        self.assertEqual(
            changed_existing["data"]["cateId"],
            existing["data"]["cateId"],
        )

        repeated = client.post(
            f"/api/admin/dimensions/{filename}/import/{preview['importId']}/confirm"
        )
        self.assertEqual(repeated.status_code, 409)

        audit_entries = client.get(
            "/api/admin/config/audit-logs",
            query_string={"dimensionFile": filename, "limit": 20},
        ).get_json()["items"]
        import_entry = next(
            entry for entry in audit_entries
            if entry["action"] == "DIMENSION_ROWS_IMPORTED"
        )
        self.assertEqual(import_entry["details"]["rowCount"], 1)
        self.assertEqual(import_entry["details"]["sourceRowCount"], 3)
        self.assertEqual(import_entry["details"]["skipped"], 2)
        self.assertEqual(import_entry["details"]["sourceName"], "维表批量导入.xlsx")

    def test_excel_import_with_only_existing_rows_has_no_confirmable_job(self):
        client = self.login("root", "root-password")
        filename = "状态维表.csv"
        existing = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"pageSize": 1},
        ).get_json()["rows"][0]
        excel = self.excel_file(
            ["适用的包", "状态名称", "ID", "Value"],
            [[
                existing["data"]["适用的包"],
                existing["data"]["状态名称"],
                "999999",
                "SHOULD_NOT_OVERWRITE",
            ]],
        )
        response = client.post(
            f"/api/admin/dimensions/{filename}/import/preview",
            data={"file": excel},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        preview = response.get_json()
        self.assertTrue(preview["valid"])
        self.assertEqual(preview["created"], 0)
        self.assertEqual(preview["existing"], 1)
        self.assertEqual(preview["skipped"], 1)
        self.assertFalse(preview["importId"])
        refreshed = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": existing["data"]["状态名称"]},
        ).get_json()["rows"][0]
        self.assertEqual(refreshed["data"], existing["data"])

    def test_excel_import_rejects_header_and_cell_format_errors_without_writing(self):
        client = self.login("root", "root-password")
        filename = "类目维表.csv"
        wrong_headers = self.excel_file(
            ["适用的包", "cateId", "类目名称"],
            [["类目公域行为", "990100003", "表头错误"]],
        )
        header_response = client.post(
            f"/api/admin/dimensions/{filename}/import/preview",
            data={"file": wrong_headers},
            content_type="multipart/form-data",
        )
        self.assertEqual(header_response.status_code, 200)
        header_preview = header_response.get_json()
        self.assertFalse(header_preview["valid"])
        self.assertEqual(header_preview["rowCount"], 1)
        self.assertEqual(header_preview["columnCount"], 3)
        self.assertIn(
            "HEADER_MISMATCH",
            {issue["code"] for issue in header_preview["issues"]},
        )
        self.assertNotIn("importId", header_preview)

        formula_workbook = Workbook()
        worksheet = formula_workbook.active
        worksheet.append(["适用的包", "类目名称", "cateId"])
        worksheet.append(["类目公域行为", "公式错误", "=1+1"])
        formula_content = BytesIO()
        formula_workbook.save(formula_content)
        formula_workbook.close()
        formula_content.seek(0)
        format_response = client.post(
            f"/api/admin/dimensions/{filename}/import/preview",
            data={"file": (formula_content, "格式错误.xlsx")},
            content_type="multipart/form-data",
        )
        self.assertEqual(format_response.status_code, 200)
        format_preview = format_response.get_json()
        self.assertFalse(format_preview["valid"])
        self.assertIn(
            "FORMULA_NOT_ALLOWED",
            {issue["code"] for issue in format_preview["issues"]},
        )
        self.assertEqual(
            client.get(
                f"/api/admin/dimensions/{filename}",
                query_string={"q": "公式错误"},
            ).get_json()["total"],
            0,
        )

    def test_config_audit_records_field_diffs_actor_and_publish_details(self):
        client = self.login("config", "config-password")
        filename = "类目维表.csv"
        created = client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>审计详情",
                    "cateId": "990000010",
                    "备注": "首版",
                }
            },
        )
        self.assertEqual(created.status_code, 201)
        row_id = created.get_json()["id"]

        updated = client.put(
            f"/api/admin/dimensions/{filename}/{row_id}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>审计详情",
                    "cateId": "990000011",
                }
            },
        )
        self.assertEqual(updated.status_code, 200)
        disabled = client.patch(
            f"/api/admin/dimensions/{filename}/{row_id}/status",
            json={"enabled": False},
        )
        self.assertEqual(disabled.status_code, 200)
        published = client.post(
            "/api/admin/config/publish",
            json={"note": "验证配置审计详情"},
        )
        self.assertEqual(published.status_code, 201)

        response = client.get(
            "/api/admin/config/audit-logs",
            query_string={"limit": 30, "dimensionFile": filename},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertGreaterEqual(payload["total"], 3)
        entries = payload["items"]
        actions = {entry["action"] for entry in entries}
        self.assertIn("DIMENSION_ROW_CREATED", actions)
        self.assertIn("DIMENSION_ROW_UPDATED", actions)
        self.assertIn("DIMENSION_ROW_STATUS_CHANGED", actions)
        self.assertIn("CONFIG_PUBLISHED", actions)
        self.assertTrue(
            all(entry["actorDisplayName"] == "Config" for entry in entries)
        )

        edit_entry = next(
            entry for entry in entries
            if entry["action"] == "DIMENSION_ROW_UPDATED"
            and entry["rowId"] == row_id
        )
        changes = {change["field"]: change for change in edit_entry["details"]["changes"]}
        self.assertEqual(changes["cateId"]["before"], "990000010")
        self.assertEqual(changes["cateId"]["after"], "990000011")
        self.assertEqual(changes["cateId"]["kind"], "changed")
        self.assertEqual(changes["备注"]["kind"], "removed")
        self.assertEqual(changes["备注"]["before"], "首版")
        self.assertIsNone(changes["备注"]["after"])

        all_entries = client.get(
            "/api/admin/config/audit-logs",
            query_string={"limit": 30},
        ).get_json()["items"]
        publish_entry = next(
            entry for entry in all_entries
            if entry["action"] == "CONFIG_PUBLISHED"
            and entry["details"].get("note") == "验证配置审计详情"
        )
        table = next(
            item for item in publish_entry["details"]["tables"]
            if item["dimensionFile"] == filename
        )
        published_row = next(item for item in table["rows"] if item["rowId"] == row_id)
        self.assertEqual(published_row["rowName"], "测试类目>审计详情")
        self.assertTrue(published_row["changes"])

        regular_client = self.login("normal", "normal-password")
        denied = regular_client.get("/api/admin/config/audit-logs")
        self.assertEqual(denied.status_code, 403)

    def test_only_super_admin_can_delete_a_dimension_row(self):
        config_client = self.login("config", "config-password")
        root_client = self.login("root", "root-password")
        filename = "类目维表.csv"
        created = config_client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>待删除",
                    "cateId": "990000002",
                }
            },
        )
        self.assertEqual(created.status_code, 201)
        row_id = created.get_json()["id"]
        self.assertEqual(
            config_client.post(
                "/api/admin/config/publish",
                json={"note": "publish before delete"},
            ).status_code,
            201,
        )

        denied = config_client.delete(
            f"/api/admin/dimensions/{filename}/{row_id}"
        )
        self.assertEqual(denied.status_code, 403)

        staged = root_client.delete(
            f"/api/admin/dimensions/{filename}/{row_id}"
        )
        self.assertEqual(staged.status_code, 200)
        self.assertTrue(staged.get_json()["deleted"])
        self.assertTrue(staged.get_json()["hasChanges"])

        audit_entries = root_client.get(
            "/api/admin/config/audit-logs",
            query_string={"limit": 20, "dimensionFile": filename},
        ).get_json()["items"]
        delete_entry = next(
            entry for entry in audit_entries
            if entry["action"] == "DIMENSION_ROW_DELETED"
            and entry["rowId"] == row_id
        )
        self.assertEqual(delete_entry["actorDisplayName"], "Root")
        self.assertTrue(delete_entry["details"]["staged"])
        self.assertTrue(
            all(change["kind"] == "removed" for change in delete_entry["details"]["changes"])
        )

        pending = root_client.get(
            f"/api/admin/dimensions/{filename}?q=待删除"
        ).get_json()["rows"]
        self.assertTrue(any(row["id"] == row_id and row["deleted"] for row in pending))

        discarded = root_client.post("/api/admin/config/discard")
        self.assertEqual(discarded.status_code, 200)
        discard_entries = root_client.get(
            "/api/admin/config/audit-logs",
            query_string={"limit": 20},
        ).get_json()["items"]
        self.assertTrue(
            any(entry["action"] == "CONFIG_DRAFT_DISCARDED" for entry in discard_entries)
        )
        restored = root_client.get(
            f"/api/admin/dimensions/{filename}?q=待删除"
        ).get_json()["rows"]
        self.assertTrue(any(row["id"] == row_id and not row["deleted"] for row in restored))

        root_client.delete(f"/api/admin/dimensions/{filename}/{row_id}")
        published = root_client.post(
            "/api/admin/config/publish",
            json={"note": "remove test category"},
        )
        self.assertEqual(published.status_code, 201)
        meta = root_client.get("/api/meta/类目公域行为").get_json()
        leaf_cates = next(item for item in meta["schema"] if item["key"] == "leafCates")
        self.assertNotIn("测试类目>待删除", leaf_cates["options"])

    def test_staged_delete_keeps_its_page_position_until_publish(self):
        client = self.login("root", "root-password")
        filename = "行为维表.csv"
        first_page = client.get(
            f"/api/admin/dimensions/{filename}?page=1&pageSize=5"
        ).get_json()
        self.assertGreater(first_page["total"], 5)
        deleted_row = first_page["rows"][0]

        staged = client.delete(
            f"/api/admin/dimensions/{filename}/{deleted_row['id']}"
        )
        self.assertEqual(staged.status_code, 200)
        self.assertTrue(staged.get_json()["deleted"])

        second_page = client.get(
            f"/api/admin/dimensions/{filename}?page=2&pageSize=5"
        )
        self.assertEqual(second_page.status_code, 200)
        refreshed_first_page = client.get(
            f"/api/admin/dimensions/{filename}?page=1&pageSize=5"
        ).get_json()
        refreshed_row = next(
            row for row in refreshed_first_page["rows"]
            if row["id"] == deleted_row["id"]
        )
        self.assertTrue(refreshed_row["deleted"])
        self.assertTrue(refreshed_row["hasChanges"])

    def test_published_delete_disappears_and_can_be_added_or_imported_again(self):
        client = self.login("root", "root-password")
        filename = "类目维表.csv"
        data = {
            "适用的包": "类目公域行为",
            "类目名称": "测试类目>删除后重建",
            "cateId": "990000099",
        }
        created = client.post(
            f"/api/admin/dimensions/{filename}",
            json={"data": data},
        ).get_json()
        client.post("/api/admin/config/publish", json={"note": "创建待删除记录"})

        client.delete(f"/api/admin/dimensions/{filename}/{created['id']}")
        pending = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": data["类目名称"]},
        ).get_json()
        self.assertEqual(pending["total"], 1)
        self.assertTrue(pending["rows"][0]["deleted"])

        client.post("/api/admin/config/publish", json={"note": "确认删除"})
        removed = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": data["类目名称"]},
        ).get_json()
        self.assertEqual(removed["total"], 0)

        restored = client.post(
            f"/api/admin/dimensions/{filename}",
            json={"data": data},
        )
        self.assertEqual(restored.status_code, 201)
        self.assertEqual(restored.get_json()["id"], created["id"])
        self.assertTrue(restored.get_json()["hasChanges"])
        client.post("/api/admin/config/publish", json={"note": "手动恢复"})

        client.delete(f"/api/admin/dimensions/{filename}/{created['id']}")
        client.post("/api/admin/config/publish", json={"note": "再次删除"})
        excel = self.excel_file(
            ["适用的包", "类目名称", "cateId"],
            [[data["适用的包"], data["类目名称"], data["cateId"]]],
        )
        preview_response = client.post(
            f"/api/admin/dimensions/{filename}/import/preview",
            data={"file": excel},
            content_type="multipart/form-data",
        )
        self.assertEqual(preview_response.status_code, 200)
        preview = preview_response.get_json()
        self.assertEqual(preview["created"], 1)
        self.assertEqual(preview["existing"], 0)
        confirmed = client.post(
            f"/api/admin/dimensions/{filename}/import/{preview['importId']}/confirm"
        )
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.get_json()["created"], 1)
        imported = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": data["类目名称"]},
        ).get_json()["rows"]
        self.assertEqual(imported[0]["id"], created["id"])
        self.assertTrue(imported[0]["hasChanges"])

    def test_config_admin_can_rollback_to_a_published_version_as_a_new_release(self):
        client = self.login("config", "config-password")
        filename = "类目维表.csv"
        original = {
            "适用的包": "类目公域行为",
            "类目名称": "测试类目>版本回滚",
            "cateId": "990000120",
        }
        created = client.post(
            f"/api/admin/dimensions/{filename}",
            json={"data": original},
        ).get_json()
        first = client.post(
            "/api/admin/config/publish",
            json={"note": "回滚测试基线"},
        ).get_json()
        self.assertEqual(first["version"], 1)

        changed = {**original, "cateId": "990000121"}
        self.assertEqual(
            client.put(
                f"/api/admin/dimensions/{filename}/{created['id']}",
                json={"data": changed},
            ).status_code,
            200,
        )
        extra_name = "测试类目>仅存在于V2"
        client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": extra_name,
                    "cateId": "990000122",
                }
            },
        )
        second = client.post(
            "/api/admin/config/publish",
            json={"note": "回滚测试第二版"},
        ).get_json()
        self.assertEqual(second["version"], 2)

        client.post(
            f"/api/admin/dimensions/{filename}",
            json={
                "data": {
                    "适用的包": "类目公域行为",
                    "类目名称": "测试类目>未发布草稿",
                    "cateId": "990000123",
                }
            },
        )
        blocked = client.post("/api/admin/config/versions/1/rollback")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("待发布修改", blocked.get_json()["message"])
        client.post("/api/admin/config/discard")

        regular_client = self.login("normal", "normal-password")
        self.assertEqual(
            regular_client.post("/api/admin/config/versions/1/rollback").status_code,
            403,
        )

        rolled_back = client.post(
            "/api/admin/config/versions/1/rollback",
            json={"note": "恢复稳定配置"},
        )
        self.assertEqual(rolled_back.status_code, 201)
        rollback = rolled_back.get_json()
        self.assertEqual(rollback["version"], 3)
        self.assertEqual(rollback["releaseType"], "rollback")
        self.assertEqual(rollback["sourceVersion"], 1)

        restored = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": original["类目名称"]},
        ).get_json()["rows"][0]
        self.assertEqual(restored["data"]["cateId"], original["cateId"])
        removed_extra = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": extra_name},
        ).get_json()
        self.assertEqual(removed_extra["total"], 0)

        status = client.get("/api/admin/config/status").get_json()
        self.assertEqual(status["currentVersion"], 3)
        self.assertEqual(status["latestVersion"]["releaseType"], "rollback")
        versions = client.get("/api/admin/config/versions").get_json()
        self.assertEqual(versions[0]["version"], 3)
        self.assertEqual(versions[0]["sourceVersion"], 1)
        self.assertEqual(versions[0]["publisherDisplayName"], "Config")
        audit = client.get("/api/admin/config/audit-logs").get_json()["items"]
        rollback_audit = next(
            item for item in audit if item["action"] == "CONFIG_ROLLED_BACK"
        )
        self.assertEqual(rollback_audit["details"]["fromVersion"], 2)
        self.assertEqual(rollback_audit["details"]["targetVersion"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
