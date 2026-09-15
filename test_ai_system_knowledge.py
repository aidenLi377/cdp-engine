import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from cdp_backend.ai_system_knowledge import AiSystemKnowledge
from cdp_backend.announcement_store import AnnouncementStore


class AiSystemKnowledgeTest(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory(prefix="cdp-system-knowledge-")
        root = Path(self.temporary_directory.name)
        self.store = AnnouncementStore(str(root / "test.db"), str(root / "uploads"))
        self.knowledge = AiSystemKnowledge(self.store)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_all_tutorial_workflows_and_guided_steps_are_available(self):
        catalog = json.loads(
            Path("ai_system_capability_catalog.json").read_text(encoding="utf-8")
        )
        ids = {item["id"] for item in catalog["capabilities"]}
        self.assertEqual(len(ids), 7)
        self.assertGreaterEqual(len(catalog["systemFeatures"]), 30)
        self.assertIn("direct-workbench-audience-build", ids)
        self.assertIn("category-item-behavior-split", ids)
        self.assertIn("competitor-brand-parameter-batch", ids)
        self.assertIn("pull-analysis-solution-group", ids)
        self.assertIn("combination-competitor-batch", ids)
        self.assertIn("dmp-batch-profile-comparison", ids)
        self.assertGreater(
            sum(len(item.get("steps") or []) for item in catalog["capabilities"]),
            50,
        )

    def test_prompt_retrieval_keeps_full_index_and_expands_relevant_workflow(self):
        prompt_catalog = self.knowledge.get_prompt_catalog(
            "把商品ID 123456 和 789012 圈成同一个购买人群"
        )
        self.assertEqual(len(prompt_catalog["capabilityIndex"]), 7)
        self.assertGreaterEqual(len(prompt_catalog["systemFeatureIndex"]), 30)
        selected = prompt_catalog["selectedCapability"]
        self.assertEqual(selected["id"], "category-item-behavior-split")
        self.assertGreater(len(selected["steps"]), 10)

    def test_router_distinguishes_one_audience_from_multiple_packages(self):
        one_audience = self.knowledge.recommend_workflow(
            "商品ID 123456、789012组成同一个人群"
        )
        separate_packages = self.knowledge.recommend_workflow(
            "四个竞争品牌分别建包，每个品牌一个人群包"
        )
        combination = self.knowledge.recommend_workflow(
            "把三个竞品名单批量展开整套拉力方案组"
        )
        self.assertEqual(one_audience["id"], "category-item-behavior-split")
        self.assertEqual(separate_packages["id"], "competitor-brand-parameter-batch")
        self.assertEqual(combination["id"], "combination-competitor-batch")

    def test_published_tutorial_articles_are_loaded_dynamically(self):
        tutorial = self.store.create(
            "admin",
            {
                "kind": "tutorial",
                "title": "新品画像批量复盘",
                "summary": "统一选择标签并横向对比",
                "highlights": ["批量取数", "保持名单顺序"],
                "content": [
                    {"type": "heading", "text": "执行规则"},
                    {"type": "paragraph", "text": "真实执行前必须确认已经登录达摩盘。"},
                ],
            },
        )
        self.store.publish(tutorial["id"], "admin")

        prompt_catalog = self.knowledge.get_prompt_catalog("批量做新品画像复盘")
        self.assertEqual(len(prompt_catalog["publishedTutorialIndex"]), 1)
        self.assertEqual(len(prompt_catalog["relevantPublishedTutorials"]), 1)
        self.assertIn(
            "确认已经登录达摩盘",
            prompt_catalog["relevantPublishedTutorials"][0]["content"],
        )
        status = self.knowledge.status()
        self.assertEqual(status["systemCapabilityCount"], 7)
        self.assertGreaterEqual(status["systemFeatureCount"], 30)
        self.assertEqual(status["publishedTutorialKnowledgeCount"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
