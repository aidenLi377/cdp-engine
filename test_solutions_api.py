from __future__ import annotations

import importlib
import os
import sys
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


class SolutionLifecycleApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = TemporaryDirectory()
        cls.solutions_file = str(Path(cls.temp_dir.name) / "solutions.json")
        os.environ["FLASK_ENV"] = "development"
        os.environ["SOLUTIONS_FILE"] = cls.solutions_file

        sys.modules.pop("app", None)
        app_module = importlib.import_module("app")
        cls.app_module = importlib.reload(app_module)
        cls.client = cls.app_module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()
        os.environ.pop("SOLUTIONS_FILE", None)

    def setUp(self):
        solutions_path = Path(self.solutions_file)
        if solutions_path.exists():
            solutions_path.unlink()

    def make_payload(self, name: str) -> dict:
        return {
            "name": name,
            "defaultCrowdName": f"{name} crowd",
            "nodes": [
                {
                    "id": "node_1",
                    "packageType": "类目公域行为",
                    "operator": None,
                    "formData": {"channel": ["tmall"]},
                    "modeData": {},
                }
            ],
            "workbenchFieldIds": ["field_a"],
        }

    def create_draft(self, name: str, **overrides) -> dict:
        payload = self.make_payload(name)
        payload.update(overrides)
        response = self.client.post("/api/solutions/drafts", json=payload)
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def test_solution_lifecycle_routes(self):
        created = self.create_draft("Original")
        self.assertEqual(created["status"], "draft")
        self.assertEqual(created["source"], "manual")
        self.assertNotIn("basePublishedId", created)

        publish_response = self.client.post(f"/api/solutions/{created['id']}/publish")
        self.assertEqual(publish_response.status_code, 200)
        published = publish_response.get_json()
        self.assertEqual(published["status"], "published")
        self.assertIn("publishedAt", published)

        list_published_response = self.client.get("/api/solutions?status=published")
        self.assertEqual(list_published_response.status_code, 200)
        published_list = list_published_response.get_json()
        self.assertEqual([item["id"] for item in published_list], [created["id"]])

        edit_draft_response = self.client.post(f"/api/solutions/{created['id']}/edit-draft")
        self.assertEqual(edit_draft_response.status_code, 201)
        edit_draft = edit_draft_response.get_json()
        self.assertEqual(edit_draft["status"], "draft")
        self.assertEqual(edit_draft["source"], "published-edit")
        self.assertEqual(edit_draft["basePublishedId"], created["id"])

        update_payload = {
            "name": "Updated Name",
            "defaultCrowdName": "Updated Crowd",
            "nodes": [
                {
                    "id": "node_2",
                    "packageType": "商品行为",
                    "operator": "AND",
                    "formData": {"behavior": ["buy"]},
                    "modeData": {"audience": "vip"},
                }
            ],
            "workbenchFieldIds": ["field_b", "field_c"],
        }
        update_response = self.client.put(f"/api/solutions/{edit_draft['id']}", json=update_payload)
        self.assertEqual(update_response.status_code, 200)
        updated_draft = update_response.get_json()
        self.assertEqual(updated_draft["name"], "Updated Name")
        self.assertEqual(updated_draft["defaultCrowdName"], "Updated Crowd")
        self.assertEqual(updated_draft["nodes"], update_payload["nodes"])
        self.assertEqual(updated_draft["workbenchFieldIds"], update_payload["workbenchFieldIds"])

        publish_edit_response = self.client.post(f"/api/solutions/{edit_draft['id']}/publish")
        self.assertEqual(publish_edit_response.status_code, 200)
        overwritten = publish_edit_response.get_json()
        self.assertEqual(overwritten["id"], created["id"])
        self.assertEqual(overwritten["status"], "published")
        self.assertEqual(overwritten["name"], "Updated Name")
        self.assertEqual(overwritten["defaultCrowdName"], "Updated Crowd")

        fetch_published_response = self.client.get(f"/api/solutions/{created['id']}")
        self.assertEqual(fetch_published_response.status_code, 200)
        fetched = fetch_published_response.get_json()
        self.assertEqual(fetched["name"], "Updated Name")

        edit_draft_fetch_response = self.client.get(f"/api/solutions/{edit_draft['id']}")
        self.assertEqual(edit_draft_fetch_response.status_code, 404)

        duplicate_response = self.client.post(f"/api/solutions/{created['id']}/duplicate")
        self.assertEqual(duplicate_response.status_code, 201)
        duplicate = duplicate_response.get_json()
        self.assertNotEqual(duplicate["id"], created["id"])
        self.assertEqual(duplicate["status"], "draft")
        self.assertEqual(duplicate["name"], "Updated Name")

        delete_response = self.client.delete(f"/api/solutions/{duplicate['id']}")
        self.assertEqual(delete_response.status_code, 204)

        deleted_fetch_response = self.client.get(f"/api/solutions/{duplicate['id']}")
        self.assertEqual(deleted_fetch_response.status_code, 404)

        list_all_response = self.client.get("/api/solutions?status=all")
        self.assertEqual(list_all_response.status_code, 200)
        remaining = list_all_response.get_json()
        self.assertEqual([item["id"] for item in remaining], [created["id"]])

    def test_update_published_solution_returns_409(self):
        created = self.create_draft("Published")
        publish_response = self.client.post(f"/api/solutions/{created['id']}/publish")
        self.assertEqual(publish_response.status_code, 200)

        update_response = self.client.put(
            f"/api/solutions/{created['id']}",
            json={"name": "Should Not Update"},
        )
        self.assertEqual(update_response.status_code, 409)
        self.assertIn("error", update_response.get_json())

        fetch_response = self.client.get(f"/api/solutions/{created['id']}")
        self.assertEqual(fetch_response.status_code, 200)
        self.assertEqual(fetch_response.get_json()["name"], "Published")

    def test_create_edit_draft_from_draft_returns_409(self):
        created = self.create_draft("Draft Only")

        edit_draft_response = self.client.post(f"/api/solutions/{created['id']}/edit-draft")
        self.assertEqual(edit_draft_response.status_code, 409)
        self.assertIn("error", edit_draft_response.get_json())

    def test_publish_published_solution_returns_409(self):
        created = self.create_draft("Already Published")
        first_publish_response = self.client.post(f"/api/solutions/{created['id']}/publish")
        self.assertEqual(first_publish_response.status_code, 200)

        second_publish_response = self.client.post(f"/api/solutions/{created['id']}/publish")
        self.assertEqual(second_publish_response.status_code, 409)
        self.assertIn("error", second_publish_response.get_json())

    def test_create_draft_ignores_forged_lifecycle_fields(self):
        created = self.create_draft(
            "Forged",
            id="solution_fake",
            status="published",
            source="published-edit",
            basePublishedId="solution_base",
            createdAt="2000-01-01T00:00:00Z",
            updatedAt="2000-01-01T00:00:00Z",
            publishedAt="2000-01-01T00:00:00Z",
        )

        self.assertNotEqual(created["id"], "solution_fake")
        self.assertEqual(created["status"], "draft")
        self.assertEqual(created["source"], "manual")
        self.assertNotIn("basePublishedId", created)
        self.assertNotIn("publishedAt", created)
        self.assertNotEqual(created["createdAt"], "2000-01-01T00:00:00Z")
        self.assertNotEqual(created["updatedAt"], "2000-01-01T00:00:00Z")

        fetch_response = self.client.get(f"/api/solutions/{created['id']}")
        self.assertEqual(fetch_response.status_code, 200)
        fetched = fetch_response.get_json()
        self.assertEqual(fetched["source"], "manual")
        self.assertNotIn("basePublishedId", fetched)
        self.assertNotIn("publishedAt", fetched)

    def test_list_solutions_returns_newest_first(self):
        older = self.create_draft("Older")
        time.sleep(1.1)
        newer = self.create_draft("Newer")

        list_response = self.client.get("/api/solutions?status=all")
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.get_json()
        self.assertEqual([item["id"] for item in listed], [newer["id"], older["id"]])


if __name__ == "__main__":
    unittest.main(verbosity=2)
