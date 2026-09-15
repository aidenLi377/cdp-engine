from __future__ import annotations

import os
import unittest

os.environ["FLASK_ENV"] = "development"

from test_support import create_authenticated_test_app  # noqa: E402


class AiComponentCatalogApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.test_app = create_authenticated_test_app("ai-catalog-test-user")
        cls.client = cls.test_app.client

    @classmethod
    def tearDownClass(cls):
        cls.test_app.close()

    def test_catalog_covers_all_live_components_and_operator_semantics(self):
        response = self.client.get("/api/ai/components")
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["coverage"]["configuredComponentCount"], 12)
        self.assertEqual(data["coverage"]["documentedComponentCount"], 12)
        self.assertEqual(data["coverage"]["missingBusinessPolicies"], [])
        self.assertEqual(data["coverage"]["staleBusinessPolicies"], [])
        self.assertEqual(data["operatorSemantics"]["multiBehaviorInOneNode"], "union")

    def test_count_visibility_rules_are_exposed(self):
        category_response = self.client.get("/api/ai/components/类目公域行为")
        commodity_response = self.client.get("/api/ai/components/商品行为")
        category = category_response.get_json()["business"]["countVisibility"]
        commodity = commodity_response.get_json()["business"]["countVisibility"]

        self.assertEqual(category_response.status_code, 200)
        self.assertEqual(category["threshold"], 2000)
        self.assertFalse(category["suppressedIsZero"])
        self.assertEqual(commodity_response.status_code, 200)
        self.assertTrue(commodity["supportsHundreds"])

    def test_live_fields_are_merged_without_inlining_huge_option_lists(self):
        data = self.client.get("/api/ai/components/类目公域行为").get_json()
        fields = {field["key"]: field for field in data["runtime"]["fields"]}

        self.assertGreater(fields["leafCates"]["optionCount"], 20)
        self.assertTrue(fields["leafCates"]["optionSearchRequired"])
        self.assertNotIn("options", fields["leafCates"])
        self.assertGreater(fields["stdBrand"]["optionCount"], 20)
        self.assertNotIn("options", fields["stdBrand"])
        self.assertEqual(fields["bhv"]["optionCount"], 6)
        self.assertEqual(len(fields["bhv"]["options"]), 6)

    def test_large_live_options_are_searchable(self):
        response = self.client.post(
            "/api/ai/options/search",
            json={
                "component": "类目公域行为",
                "field": "leafCates",
                "query": "USB暖手套",
                "limit": 5,
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(data["matches"])
        self.assertIn("USB暖手套", data["matches"][0]["label"])
        self.assertGreater(data["totalOptions"], 20)

    def test_category_search_returns_all_face_cream_matches(self):
        response = self.client.post(
            "/api/ai/options/search",
            json={
                "component": "类目公域行为",
                "field": "leafCates",
                "query": "面霜",
                "limit": 50,
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(data["matches"]), 7)
        self.assertFalse(data["truncated"])
        self.assertTrue(all("面霜" in item["label"] for item in data["matches"]))

    def test_standard_brand_search_prioritizes_formal_slash_label(self):
        response = self.client.post(
            "/api/ai/options/search",
            json={
                "component": "类目公域行为",
                "field": "stdBrand",
                "query": "迪奥",
                "limit": 10,
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["matches"][0]["label"], "Dior/迪奥")

    def test_brand_account_resolution_uses_live_shop_accounts(self):
        response = self.client.post(
            "/api/ai/accounts/resolve",
            json={"brand": "IPSA", "canUseBrandAccount": True},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["account"]["label"], "IPSA茵芙纱官方旗舰店")
        self.assertEqual(data["currentUserAccess"], "confirmed")

    def test_dior_official_store_resolves_from_live_account_configuration(self):
        response = self.client.post(
            "/api/ai/accounts/resolve",
            json={"brand": "Dior", "canUseBrandAccount": True},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(
            data["account"]["label"],
            "DIOR迪奥官方旗舰店 香水与美容品",
        )
        self.assertEqual(
            data["account"]["value"],
            "DIOR迪奥官方旗舰店 香水与美容品",
        )

    def test_standard_brand_label_can_resolve_account_despite_alias_spelling(self):
        response = self.client.post(
            "/api/ai/accounts/resolve",
            json={"brand": "IPSA/茵芙莎", "canUseBrandAccount": True},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "resolved")
        self.assertEqual(data["account"]["label"], "IPSA茵芙纱官方旗舰店")

    def test_configured_account_requires_current_user_access_confirmation(self):
        response = self.client.post(
            "/api/ai/accounts/resolve",
            json={"brand": "IPSA"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_access_confirmation")
        self.assertEqual(data["answerField"], "canUseBrandAccount")

    def test_denied_account_access_falls_back_to_category_public(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={
                "mentionsOwnStore": True,
                "brand": "IPSA",
                "canUseBrandAccount": False,
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["component"], "类目公域行为")
        self.assertEqual(data["fallbackFrom"], "商品行为")
        self.assertEqual(data["accountResolution"]["status"], "access_denied")

    def test_missing_brand_account_returns_feedback_action(self):
        response = self.client.post(
            "/api/ai/accounts/resolve",
            json={"brand": "尚未配置的测试品牌"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "not_configured")
        self.assertEqual(data["nextAction"]["type"], "open_feedback")
        self.assertEqual(data["nextAction"]["category"], "suggestion")
        self.assertIn("尚未配置的测试品牌", data["nextAction"]["prefillMessage"])

    def test_own_store_requires_brand_before_commodity_behavior(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={"mentionsOwnStore": True},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["component"], "商品行为")
        self.assertTrue(data["questions"])

    def test_own_store_product_ids_use_commodity_behavior(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={
                "mentionsOwnStore": True,
                "brand": "IPSA",
                "canUseBrandAccount": True,
                "productIds": ["123456"],
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["component"], "商品行为")
        self.assertEqual(data["defaults"]["selectedGoodsType"], "指定商品ID")
        self.assertEqual(data["accountResolution"]["status"], "resolved")

    def test_own_brand_without_store_or_ids_defaults_to_category_public(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={"mentionsOwnBrand": True, "brand": "IPSA"},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["component"], "类目公域行为")

    def test_own_brand_product_ids_with_missing_account_uses_category_item_and_offers_feedback(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={
                "mentionsOwnBrand": True,
                "brand": "尚未配置的测试品牌",
                "productIds": ["123456"],
            },
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["component"], "类目商品行为")
        self.assertEqual(data["fallbackFrom"], "商品行为")
        self.assertEqual(data["nextAction"]["type"], "open_feedback")
        self.assertTrue(data["preservesProductIds"])

    def test_public_product_ids_use_category_item_behavior(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={"productIds": ["123456"]},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ready")
        self.assertEqual(data["component"], "类目商品行为")

    def test_fine_grained_category_count_returns_threshold_warning(self):
        response = self.client.post(
            "/api/ai/components/recommend",
            json={"needsFineGrainedCount": True},
        )
        data = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["component"], "类目公域行为")
        self.assertIn("2000", data["warnings"][0])

    def test_ai_endpoints_require_login(self):
        unauthenticated_client = self.test_app.app.test_client()
        response = unauthenticated_client.get("/api/ai/components")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["code"], "AUTH_REQUIRED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
