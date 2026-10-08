from __future__ import annotations

import unittest
import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

from openpyxl import Workbook, load_workbook

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

    def test_export_all_filtered_rows_as_text(self):
        from cdp_backend.dimension_store import DimensionStore

        client = self.login("config", "config-password")
        filename = "类目维表.csv"
        store = DimensionStore(self.db_path)
        store.import_rows(filename, [
            {"适用的包": "导出测试包", "类目名称": f"导出测试{i:03}",
             "cateId": "001234567890123456789" if i == 0 else f"001234567890123456{i:03}", "备注": "=1+1"}
            for i in range(205)
        ], "export-test")
        response = client.get(f"/api/admin/dimensions/{filename}/export",
                              query_string={"package": "导出测试包", "q": "导出测试"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["Content-Disposition"])
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        workbook = load_workbook(BytesIO(response.data))
        sheet = workbook.active
        rows = list(sheet.iter_rows())
        self.assertEqual(len(rows), 206)
        headers = [cell.value for cell in rows[0]]
        self.assertEqual(rows[1][headers.index("cateId")].value, "001234567890123456789")
        formula_cell = rows[1][headers.index("备注")]
        self.assertEqual(formula_cell.value, "=1+1")
        self.assertEqual(formula_cell.data_type, "s")
        self.assertEqual(rows[1][headers.index("发布状态")].value, "待发布")
        workbook.close()
        empty = client.get(f"/api/admin/dimensions/{filename}/export",
                           query_string={"q": "不存在的导出记录xyz"})
        workbook = load_workbook(BytesIO(empty.data))
        self.assertEqual(workbook.active.max_row, 1)
        workbook.close()

    def test_export_permissions_and_unknown_dimension(self):
        path = "/api/admin/dimensions/类目维表.csv/export"
        self.assertEqual(self.app.test_client().get(path).status_code, 401)
        self.assertEqual(self.login("normal", "normal-password").get(path).status_code, 403)
        admin = self.login("config", "config-password")
        self.assertEqual(admin.get("/api/admin/dimensions/unknown.csv/export").status_code, 400)

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

    def test_category_and_brand_mapping_consistency_checks_both_directions(self):
        path = "/api/admin/config/dimension-consistency"
        self.assertEqual(self.app.test_client().get(path).status_code, 401)
        self.assertEqual(self.login("normal", "normal-password").get(path).status_code, 403)
        client = self.login("config", "config-password")

        for filename, name_column, value_column, prefix in (
            ("类目维表.csv", "类目名称", "cateId", "映射检测类目"),
            ("品牌维表.csv", "品牌名称", "Value", "映射检测品牌"),
        ):
            for package, name, value in (
                ("映射检测包甲", f"{prefix}甲", f"{prefix}001"),
                ("映射检测包甲", f"{prefix}乙", f"{prefix}001"),
                ("映射检测包丙", f"{prefix}甲", f"{prefix}002"),
            ):
                response = client.post(
                    f"/api/admin/dimensions/{filename}",
                    json={"data": {
                        "适用的包": package,
                        name_column: name,
                        value_column: value,
                    }},
                )
                self.assertEqual(response.status_code, 201)

        response = client.get(path)
        self.assertEqual(response.status_code, 200)
        checks = {item["dimensionFile"]: item for item in response.get_json()["checks"]}
        for filename, prefix in (
            ("类目维表.csv", "映射检测类目"),
            ("品牌维表.csv", "映射检测品牌"),
        ):
            conflicts = checks[filename]["conflicts"]
            value_conflict = next(item for item in conflicts if item["type"] == "value_to_names" and item["key"] == f"{prefix}001")
            name_conflict = next(item for item in conflicts if item["type"] == "name_to_values" and item["key"] == f"{prefix}甲")
            self.assertEqual(value_conflict["mappedValues"], [f"{prefix}乙", f"{prefix}甲"])
            self.assertEqual(name_conflict["mappedValues"], [f"{prefix}001", f"{prefix}002"])
            self.assertEqual({row["packageName"] for row in value_conflict["rows"]}, {"映射检测包甲"})

        brand_value_conflict = next(
            item for item in checks["品牌维表.csv"]["conflicts"]
            if item["type"] == "value_to_names" and item["key"] == "映射检测品牌001"
        )
        other_brand = next(row for row in brand_value_conflict["rows"] if row["name"] == "映射检测品牌乙")
        disabled = client.patch(
            f"/api/admin/dimensions/品牌维表.csv/{other_brand['id']}/status",
            json={"enabled": False},
        )
        self.assertEqual(disabled.status_code, 200)
        brand_conflicts = next(
            item["conflicts"] for item in client.get(path).get_json()["checks"]
            if item["dimensionFile"] == "品牌维表.csv"
        )
        self.assertFalse(any(
            item["type"] == "value_to_names" and item["key"] == "映射检测品牌001"
            for item in brand_conflicts
        ))
        self.assertTrue(any(
            item["type"] == "name_to_values" and item["key"] == "映射检测品牌甲"
            for item in brand_conflicts
        ))

    def test_official_json_import_previews_updates_and_keeps_exact_deduplication(self):
        from cdp_backend.dimension_store import DimensionStore

        client = self.login("config", "config-password")
        package = "类目公域行为"
        created = client.post(
            "/api/admin/dimensions/品牌维表.csv",
            json={"data": {"适用的包": package, "品牌名称": "官方 JSON 旧名", "Value": "990008811"}},
        )
        self.assertEqual(created.status_code, 201)
        duplicate_id = client.post(
            "/api/admin/dimensions/品牌维表.csv",
            json={"data": {"适用的包": package, "品牌名称": "官方 JSON 冲突旧名", "Value": "990008811"}},
        )
        self.assertEqual(duplicate_id.status_code, 201)
        brand_json = json.dumps({"data": [
            {"name": "官方 JSON 新名", "id": "990008811"},
            {"name": "官方 JSON 新名", "id": "990008811"},
            {"name": "官方 JSON 新品牌", "id": "990008812"},
        ]}, ensure_ascii=False)
        path = "/api/admin/dimensions/品牌维表.csv/import/official-json"
        preview_response = client.post(path + "/preview", json={"text": brand_json})
        self.assertEqual(preview_response.status_code, 200)
        preview = preview_response.get_json()
        self.assertTrue(preview["valid"])
        self.assertEqual((preview["created"], preview["updated"], preview["disabled"], preview["duplicateInFile"]), (1, 1, 1, 1))
        self.assertIn(preview["updateRows"][0]["beforeName"], {"官方 JSON 旧名", "官方 JSON 冲突旧名"})
        confirmed = client.post(path + "/confirm", json={
            "text": brand_json, "packageName": preview["packageName"],
            "previewToken": preview["previewToken"],
        })
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.get_json()["rowCount"], 3)
        self.assertEqual(client.post(path + "/confirm", json={
            "text": brand_json, "packageName": preview["packageName"],
            "previewToken": preview["previewToken"],
        }).status_code, 409)
        rows = client.get("/api/admin/dimensions/品牌维表.csv", query_string={"q": "官方 JSON", "pageSize": 10}).get_json()["rows"]
        self.assertEqual({row["data"]["品牌名称"] for row in rows if row["enabled"]}, {"官方 JSON 新名", "官方 JSON 新品牌"})
        self.assertEqual(len([row for row in rows if not row["enabled"]]), 1)
        self.assertTrue(all(row["hasChanges"] for row in rows))
        published_names = {row["品牌名称"] for row in DimensionStore(self.db_path).read_dimension_rows("品牌维表.csv")}
        self.assertNotIn("官方 JSON 新名", published_names)

        category_json = json.dumps({"data": [{
            "cateFullName": "官方测试->一级", "cateId": 990009901,
            "children": [{"cateFullName": "官方测试->一级->二级", "cateId": 990009902, "children": None}],
        }]}, ensure_ascii=False)
        category_path = "/api/admin/dimensions/类目维表.csv/import/official-json"
        category_preview = client.post(category_path + "/preview", json={"text": category_json}).get_json()
        self.assertTrue(category_preview["valid"])
        self.assertEqual(category_preview["created"], 2)
        result = client.post(category_path + "/confirm", json={
            "text": category_json, "packageName": category_preview["packageName"],
            "previewToken": category_preview["previewToken"],
        })
        self.assertEqual(result.status_code, 200)
        category_rows = client.get("/api/admin/dimensions/类目维表.csv", query_string={"q": "官方测试", "pageSize": 10}).get_json()["rows"]
        self.assertEqual({row["data"]["类目名称"] for row in category_rows}, {"官方测试>一级", "官方测试>一级>二级"})

    def test_official_json_preview_separates_restored_rows_from_mapping_updates(self):
        client = self.login("config", "config-password")
        path = "/api/admin/dimensions/品牌维表.csv"
        brand = {"适用的包": "类目公域行为", "品牌名称": "预览状态测试品牌", "Value": "990008899"}
        created = client.post(path, json={"data": brand})
        self.assertEqual(created.status_code, 201)
        row_id = created.get_json()["id"]
        payload = json.dumps({"data": [{"name": brand["品牌名称"], "id": brand["Value"]}]}, ensure_ascii=False)
        preview_path = path + "/import/official-json/preview"

        identical = client.post(preview_path, json={"text": payload}).get_json()
        self.assertEqual((identical["created"], identical["updated"], identical["skipped"]), (0, 0, 1))

        disabled = client.patch(path + f"/{row_id}/status", json={"enabled": False})
        self.assertEqual(disabled.status_code, 200)
        preview = client.post(preview_path, json={"text": payload}).get_json()
        self.assertEqual((preview["created"], preview["updated"], preview["restored"], preview["skipped"]), (0, 0, 1, 0))
        self.assertEqual(preview["updateRows"], [])
        self.assertEqual(preview["restoreRows"][0]["afterName"], brand["品牌名称"])
        self.assertEqual(preview["restoreRows"][0]["afterValue"], brand["Value"])
        self.assertEqual(preview["restoreRows"][0]["fieldChanges"], [])
        self.assertEqual(preview["restoreRows"][0]["stateChanges"], ["重新启用停用记录"])
        confirmed = client.post(path + "/import/official-json/confirm", json={
            "text": payload, "packageName": preview["packageName"],
            "previewToken": preview["previewToken"],
        })
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.get_json()["restored"], 1)
        self.assertEqual(confirmed.get_json()["updated"], 0)

    def test_official_json_preview_identifies_previously_deleted_mapping_as_restore(self):
        client = self.login("root", "root-password")
        path = "/api/admin/dimensions/品牌维表.csv"
        brand = {"适用的包": "类目公域行为", "品牌名称": "曾删除的官方品牌", "Value": "990008898"}
        created = client.post(path, json={"data": brand})
        self.assertEqual(created.status_code, 201)
        row_id = created.get_json()["id"]
        self.assertEqual(client.post("/api/admin/config/publish", json={"note": "测试发布"}).status_code, 201)
        self.assertEqual(client.delete(path + f"/{row_id}").status_code, 200)
        self.assertEqual(client.post("/api/admin/config/publish", json={"note": "测试删除"}).status_code, 201)

        payload = json.dumps({"data": [{"name": brand["品牌名称"], "id": brand["Value"]}]}, ensure_ascii=False)
        preview = client.post(path + "/import/official-json/preview", json={"text": payload}).get_json()
        self.assertTrue(preview["valid"])
        self.assertEqual((preview["created"], preview["updated"], preview["restored"]), (0, 0, 1))
        self.assertEqual(preview["restoreRows"][0]["stateChanges"], ["恢复已删除记录", "重新启用停用记录"])

    def test_store_json_merge_keeps_unmentioned_category_rows(self):
        client = self.login("config", "config-password")
        path = "/api/admin/dimensions/类目维表.csv"
        package = "店铺局部类目测试包"
        old_rows = [
            ("保留类目", "990009931"),
            ("旧卫生巾名称", "990009932"),
            ("同 ID 的另一旧名", "990009932"),
            ("本店 JSON 未包含的其他类目", "990009933"),
        ]
        for name, value in old_rows:
            response = client.post(path, json={"data": {"适用的包": package, "类目名称": name, "cateId": value}})
            self.assertEqual(response.status_code, 201)
        other_package = client.post(path, json={"data": {
            "适用的包": "另一个包", "类目名称": "另一个包的类目", "cateId": "990009934",
        }})
        self.assertEqual(other_package.status_code, 201)
        text = json.dumps({"data": [
            {"cateFullName": "保留类目", "cateId": "990009931"},
            {"cateFullName": "新卫生巾名称", "cateId": "990009932"},
        ]}, ensure_ascii=False)
        preview_path = path + "/import/official-json/preview"
        preview = client.post(preview_path, json={"text": text, "packageName": package}).get_json()
        self.assertTrue(preview["valid"])
        self.assertEqual((preview["updated"], preview["disabled"], preview["skipped"]), (1, 1, 1))
        self.assertEqual(preview["disabledRows"][0]["reason"], "与官方名称或 ID 冲突")
        self.assertEqual(client.post(preview_path, json={
            "text": text, "packageName": package, "replace": True,
        }).status_code, 400)
        self.assertEqual(client.post(path + "/import/official-json/confirm", json={
            "text": text, "packageName": package, "previewToken": preview["previewToken"],
            "replace": True,
        }).status_code, 400)

        confirmed = client.post(path + "/import/official-json/confirm", json={
            "text": text, "packageName": package, "previewToken": preview["previewToken"],
        })
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.get_json()["disabled"], 1)
        selected_rows = client.get(path, query_string={"package": package, "pageSize": 20}).get_json()["rows"]
        self.assertEqual({row["data"]["类目名称"] for row in selected_rows if row["enabled"]},
                         {"保留类目", "新卫生巾名称", "本店 JSON 未包含的其他类目"})
        outside = client.get(path, query_string={"package": "另一个包", "pageSize": 20}).get_json()["rows"]
        self.assertTrue(any(row["id"] == other_package.get_json()["id"] and row["enabled"] for row in outside))
        self.assertEqual(client.post("/api/admin/config/publish", json={"note": "店铺局部类目合并"}).status_code, 201)
        from cdp_backend.dimension_store import DimensionStore
        published = DimensionStore(self.db_path).read_dimension_rows("类目维表.csv")
        selected_names = {row["类目名称"] for row in published if row["适用的包"] == package}
        self.assertEqual(selected_names, {"保留类目", "新卫生巾名称", "本店 JSON 未包含的其他类目"})

    def test_legacy_import_cannot_replace_category_or_brand_rows(self):
        client = self.login("config", "config-password")
        for filename, name_column, value_column in (
            ("类目维表.csv", "类目名称", "cateId"),
            ("品牌维表.csv", "品牌名称", "Value"),
        ):
            with self.subTest(filename=filename):
                path = f"/api/admin/dimensions/{filename}"
                existing = {"适用的包": "局部导入保护测试包", name_column: "保留记录", value_column: "990008841"}
                added = {"适用的包": "局部导入保护测试包", name_column: "新记录", value_column: "990008842"}
                self.assertEqual(client.post(path, json={"data": existing}).status_code, 201)
                response = client.post(path + "/import", json={"rows": [added], "replace": True})
                self.assertEqual(response.status_code, 400)
                rows = client.get(path, query_string={"package": "局部导入保护测试包", "pageSize": 10}).get_json()["rows"]
                self.assertEqual(len(rows), 1)
                self.assertTrue(rows[0]["enabled"])
                self.assertEqual(rows[0]["data"][name_column], "保留记录")

    def test_json_and_excel_import_reject_nonunique_id_name_mappings(self):
        client = self.login("config", "config-password")
        path = "/api/admin/dimensions/品牌维表.csv/import/official-json/preview"
        self.assertEqual(self.app.test_client().post(path, json={}).status_code, 401)
        self.assertEqual(self.login("normal", "normal-password").post(path, json={}).status_code, 403)
        bad_json = json.dumps({"data": [
            {"name": "重复 ID 品牌甲", "id": "990008821"},
            {"name": "重复 ID 品牌乙", "id": "990008821"},
        ]}, ensure_ascii=False)
        preview = client.post(path, json={"text": bad_json}).get_json()
        self.assertFalse(preview["valid"])
        self.assertIn("ID_TO_MULTIPLE_NAMES", {issue["code"] for issue in preview["issues"]})

        duplicate_name_json = json.dumps({"data": [
            {"name": "重复名称品牌", "id": "990008822"},
            {"name": "重复名称品牌", "id": "990008823"},
        ]}, ensure_ascii=False)
        name_preview = client.post(path, json={"text": duplicate_name_json}).get_json()
        self.assertFalse(name_preview["valid"])
        self.assertIn("NAME_TO_MULTIPLE_IDS", {issue["code"] for issue in name_preview["issues"]})

        existing = client.get("/api/admin/dimensions/类目维表.csv", query_string={"pageSize": 1}).get_json()["rows"][0]
        excel = self.excel_file(
            ["适用的包", "类目名称", "cateId"],
            [[existing["data"]["适用的包"], "同 ID 新类目", existing["data"]["cateId"]]],
        )
        response = client.post(
            "/api/admin/dimensions/类目维表.csv/import/preview",
            data={"file": excel}, content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["valid"])
        self.assertIn("ID_TO_MULTIPLE_NAMES", {issue["code"] for issue in response.get_json()["issues"]})

    def test_config_admin_can_preview_and_confirm_excel_import(self):
        client = self.login("config", "config-password")
        filename = "类目维表.csv"
        existing = client.get(
            f"/api/admin/dimensions/{filename}",
            query_string={"q": "3C数码配件>USB数码周边", "pageSize": 10},
        ).get_json()["rows"][0]
        updated_id = existing["data"]["cateId"]
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

    def test_field_option_order_is_draft_only_until_publish_and_restored_by_rollback(self):
        client = self.login("config", "config-password")
        records_response = client.get("/api/admin/field-orders")
        self.assertEqual(records_response.status_code, 200)
        record = next(
            item for item in records_response.get_json()
            if item["packageName"] == "类目公域行为" and item["fieldKey"] == "bhv"
        )
        original_order = list(record["order"])
        reversed_order = list(reversed(original_order))

        staged = client.put(
            "/api/admin/field-orders",
            json={
                "packageName": record["packageName"],
                "fieldKey": record["fieldKey"],
                "order": reversed_order,
            },
        )
        self.assertEqual(staged.status_code, 200)
        status = client.get("/api/admin/config/status").get_json()
        self.assertEqual(status["pendingOptionOrderChanges"], 1)

        draft_meta = client.get("/api/meta/类目公域行为").get_json()
        draft_behavior = next(
            field for field in draft_meta["schema"] if field["key"] == "bhv"
        )
        self.assertEqual(draft_behavior["options"], original_order)

        first = client.post(
            "/api/admin/config/publish",
            json={"note": "发布组内字段排序"},
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(first.get_json()["version"], 1)
        published_meta = client.get("/api/meta/类目公域行为").get_json()
        published_behavior = next(
            field for field in published_meta["schema"] if field["key"] == "bhv"
        )
        self.assertEqual(published_behavior["options"], reversed_order)

        client.put(
            "/api/admin/field-orders",
            json={
                "packageName": record["packageName"],
                "fieldKey": record["fieldKey"],
                "order": original_order,
            },
        )
        second = client.post(
            "/api/admin/config/publish",
            json={"note": "恢复默认排序"},
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.get_json()["version"], 2)

        rollback = client.post(
            "/api/admin/config/versions/1/rollback",
            json={"note": "回滚字段排序"},
        )
        self.assertEqual(rollback.status_code, 201)
        self.assertEqual(rollback.get_json()["version"], 3)
        restored_meta = client.get("/api/meta/类目公域行为").get_json()
        restored_behavior = next(
            field for field in restored_meta["schema"] if field["key"] == "bhv"
        )
        self.assertEqual(restored_behavior["options"], reversed_order)


if __name__ == "__main__":
    unittest.main(verbosity=2)
