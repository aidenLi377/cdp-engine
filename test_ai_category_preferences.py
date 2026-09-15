import unittest

from cdp_backend.user_store import UserStore
from test_support import create_authenticated_test_app


class AiCategoryPreferenceApiTest(unittest.TestCase):
    def setUp(self):
        self.ctx = create_authenticated_test_app(username="alice", password="alice-password")
        self.client = self.ctx.client
        self.store = UserStore(self.ctx.db_path)
        self.store.create_user("bob", "bob-password", "Bob")

    def tearDown(self):
        self.ctx.close()

    @staticmethod
    def preference(value="美容护肤/美体/精油>乳液/面霜", label=None):
        return {
            "field": "category",
            "query": "乳液面霜",
            "queryKey": "乳液面霜",
            "leafKey": "乳液面霜",
            "value": value,
            "label": label or value,
            "updatedAt": "2000-01-01T00:00:00Z",
        }

    def test_preferences_follow_the_account_across_browser_sessions(self):
        saved = self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "upsert", "preferences": [self.preference()]},
        )
        self.assertEqual(saved.status_code, 200)
        saved_item = saved.get_json()["preferences"][0]
        self.assertEqual(saved_item["value"], self.preference()["value"])
        self.assertNotEqual(saved_item["updatedAt"], "2000-01-01T00:00:00Z")

        another_browser = self.ctx.app.test_client()
        login = another_browser.post(
            "/api/auth/login",
            json={"username": "alice", "password": "alice-password"},
        )
        self.assertEqual(login.status_code, 200)
        loaded = another_browser.get("/api/ai/category-preferences")
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.get_json()["preferences"][0]["queryKey"], "乳液面霜")

    def test_browser_migration_preserves_newer_account_choice_and_users_are_isolated(self):
        account_choice = self.preference("婴童洗护>婴童护肤>婴童乳液/面霜")
        self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "upsert", "preferences": [account_choice]},
        )

        stale_browser_choice = self.preference("洗护清洁剂>面部清洁/护理>乳液/面霜")
        merged = self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "merge", "preferences": [stale_browser_choice]},
        )
        self.assertEqual(merged.get_json()["preferences"][0]["value"], account_choice["value"])

        bob = self.ctx.app.test_client()
        bob.post(
            "/api/auth/login",
            json={"username": "bob", "password": "bob-password"},
        )
        self.assertEqual(bob.get("/api/ai/category-preferences").get_json()["preferences"], [])

    def test_explicit_change_overwrites_the_same_business_word(self):
        self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "upsert", "preferences": [self.preference()]},
        )
        changed = self.preference("孕妇装/孕产妇用品>孕产妇护肤>乳液/面霜")
        response = self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "upsert", "preferences": [changed]},
        )
        items = response.get_json()["preferences"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["value"], changed["value"])

    def test_endpoint_requires_login_and_rejects_invalid_preferences(self):
        anonymous = self.ctx.app.test_client()
        self.assertEqual(anonymous.get("/api/ai/category-preferences").status_code, 401)
        invalid = self.client.put(
            "/api/ai/category-preferences",
            json={"mode": "upsert", "preferences": [{"field": "category"}]},
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(invalid.get_json()["code"], "INVALID_REQUEST")


if __name__ == "__main__":
    unittest.main(verbosity=2)
