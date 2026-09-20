"""Turn published public solutions into provider-independent AI examples."""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from typing import Any

from .csv_utils import project_path
from .solution_store import SolutionStore


DEFAULT_TRAINING_EXAMPLES_PATH = Path(project_path("ai_training_examples.json"))
DEFAULT_STORE_CATEGORY_PROFILES_PATH = Path(
    project_path("store_sales_category_profiles.json")
)


FORM_TO_INTENT_FIELD = {
    "bhv": "behaviors",
    "leafCates": "categories",
    "stdBrand": "brands",
    "channel": "channels",
    "frequency": "purchaseCount",
    "price": "purchaseAmount",
    "itemprice": "itemPrice",
    "dayFrequency": "browseDays",
    "item": "productIds",
    "title": "titleKeywords",
    "attributes": "attributes",
    "types": "aiplStatuses",
    "time": "timeWindow",
    "shop": "brandAccount",
}

RELATION_LABELS = {
    None: "start",
    "n": "intersect",
    "u": "union",
    "d": "exclude",
    "intersect": "intersect",
    "union": "union",
    "exclude": "exclude",
}

IGNORED_FORM_FIELDS = {
    "title_type",
    "selectedGoodsType",
}


# These descriptions teach the model the business meaning behind the current
# public templates.  They do not build nodes themselves: the live published
# solution remains the sole source of component order, fixed values and
# parameter bindings.
SOLUTION_SEMANTICS: dict[str, dict[str, Any]] = {
    "品类老客": {
        "businessDefinition": "统计期购买本品牌目标分析类目；对比期买过目标分析类目，但没有买过本品牌核心类目。它表示目标品类的既有消费者，不能标为转牌新客。",
        "recognitionExamples": ["前期买过目标品类但没买本品牌，近期买本品牌目标品类", "品类老客"],
        "canonicalOrder": ["统计期本品牌分析类目购买", "对比期分析类目购买（交集）", "对比期本品牌核心类目购买（排除）"],
    },
    "品类新客": {
        "businessDefinition": "统计期购买本品牌目标分析类目，排除对比期买过本品牌核心类目的人，再排除对比期买过目标分析类目的人。",
        "recognitionExamples": ["目标品类新客", "近期买本品牌该品类、过去既没买本品牌也没买该品类"],
        "canonicalOrder": ["统计期本品牌分析类目购买", "对比期本品牌核心类目购买（排除）", "对比期分析类目购买（排除）"],
    },
    "转牌新客": {
        "businessDefinition": "统计期购买本品牌目标分析类目，排除对比期买过本品牌核心类目的人，同时保留对比期买过目标分析类目的人。",
        "recognitionExamples": ["转牌拉新", "过去买该类目但没买本品牌、近期转来买本品牌"],
        "canonicalOrder": ["统计期本品牌分析类目购买", "对比期本品牌核心类目购买（排除）", "对比期分析类目购买（交集）"],
    },
    "同品类复购": {
        "businessDefinition": "同一品牌同一分析类目在统计期和对比期都发生购买，两个周期取交集。",
        "recognitionExamples": ["两个周期都买过", "老周期买过、新周期又买同品牌同类目"],
        "canonicalOrder": ["统计期购买", "对比期购买（交集）"],
    },
    "连带购买": {
        "businessDefinition": "统计期购买本品牌分析类目，并且在对比期既买过本品牌核心类目，也买过该分析类目。",
        "recognitionExamples": ["连带购买", "买分析类目的人过去还买过本品牌核心类目和该类目"],
        "canonicalOrder": ["统计期本品牌分析类目购买", "对比期本品牌核心类目购买（交集）", "对比期分析类目购买（交集）"],
    },
    "品牌老客": {
        "businessDefinition": "统计期购买本品牌分析类目，同时在对比期购买过本品牌核心类目。",
        "recognitionExamples": ["品牌老客", "品牌存量老客", "过去买本品牌核心类目、近期又买本品牌分析类目"],
        "canonicalOrder": ["统计期本品牌分析类目购买", "对比期本品牌核心类目购买（交集）"],
    },
    "共同浏览本品和竞品": {
        "businessDefinition": "同一统计期和类目内，既浏览本品牌又浏览竞品，两个浏览条件取交集。",
        "recognitionExamples": ["同时看过本品和竞品", "共同浏览两个品牌"],
        "canonicalOrder": ["浏览本品牌", "浏览竞品（交集）"],
    },
    "共同浏览后_购买本品": {
        "businessDefinition": "同一统计期和类目内，浏览本品牌、浏览竞品并最终购买本品牌，三个条件取交集。",
        "recognitionExamples": ["本竞品都看过最后买本品", "共同浏览后购买本品牌"],
        "canonicalOrder": ["浏览本品牌", "浏览竞品（交集）", "购买本品牌（交集）"],
    },
    "共同浏览后_购买竞品": {
        "businessDefinition": "同一统计期和类目内，浏览本品牌、浏览竞品并最终购买竞品，三个条件取交集。",
        "recognitionExamples": ["本竞品都看过最后买竞品", "共同浏览后购买竞争品牌"],
        "canonicalOrder": ["浏览本品牌", "浏览竞品（交集）", "购买竞品（交集）"],
    },
    "流出人群分析": {
        "businessDefinition": "对比期买过本品牌对应类目，统计期仍购买该类目大盘，但统计期不再购买本品牌。",
        "recognitionExamples": ["品牌流出", "过去买本牌、现在买类目但不买本牌"],
        "canonicalOrder": ["对比期本品牌类目购买", "统计期类目大盘购买（交集）", "统计期本品牌类目购买（排除）"],
    },
    "流入人群分析": {
        "businessDefinition": "对比期买过类目大盘，统计期购买本品牌对应类目，并排除对比期已经买过本品牌的人。",
        "recognitionExamples": ["品牌流入", "过去买类目但没买本牌、现在转来买本牌"],
        "canonicalOrder": ["对比期类目大盘购买", "统计期本品牌类目购买（交集）", "对比期本品牌类目购买（排除）"],
    },
    "品类连带分析": {
        "businessDefinition": "同一时间内购买本类目A并且购买对比类目B，两个品类购买条件取交集。",
        "recognitionExamples": ["A与B交叉购买", "买A的人还同时买了B", "两个类目的连带"],
        "canonicalOrder": ["购买本类目A", "购买对比类目B（交集）"],
    },
    "跨品类招新方向分析": {
        "businessDefinition": "统计期购买本品牌目标品类，并排除对比期买过该天猫类目大盘的人。",
        "recognitionExamples": ["跨品类招新", "近期买本品牌目标品类、过去没买该类目"],
        "canonicalOrder": ["统计期本品牌品类购买", "对比期类目大盘购买（排除）"],
    },
}


def _has_meaningful_value(value: Any) -> bool:
    if value in (None, "", [], {}):
        return False
    if isinstance(value, dict):
        return any(_has_meaningful_value(item) for item in value.values())
    return True


class AiSolutionKnowledge:
    """Expose every published public solution as a compact semantic template."""

    MAX_SOLUTIONS = 100

    def __init__(
        self,
        solution_store: SolutionStore,
        training_examples_path: str | Path | None = None,
        store_category_profiles_path: str | Path | None = None,
    ) -> None:
        self.solution_store = solution_store
        self.training_examples_path = Path(
            training_examples_path or DEFAULT_TRAINING_EXAMPLES_PATH
        )
        self.store_category_profiles_path = Path(
            store_category_profiles_path or DEFAULT_STORE_CATEGORY_PROFILES_PATH
        )

    def _load_store_category_knowledge(self) -> dict[str, Any]:
        try:
            with self.store_category_profiles_path.open(
                "r", encoding="utf-8"
            ) as stream:
                payload = json.load(stream)
        except (OSError, json.JSONDecodeError):
            return {"source": {}, "method": {}, "quality": {}, "profiles": []}
        if not isinstance(payload, dict):
            return {"source": {}, "method": {}, "quality": {}, "profiles": []}
        profiles = [
            copy.deepcopy(item)
            for item in payload.get("profiles") or []
            if isinstance(item, dict)
        ]
        return {
            "source": copy.deepcopy(payload.get("source") or {}),
            "method": copy.deepcopy(payload.get("method") or {}),
            "quality": copy.deepcopy(payload.get("quality") or {}),
            "profiles": profiles,
        }

    @staticmethod
    def _has_complete_top_ten(profile: dict[str, Any]) -> bool:
        """An old 95% cache is usable only if it contains every top-ten row."""

        total_categories = int(profile.get("allCategoryCount") or 0)
        core_count = len(profile.get("coreCategories") or [])
        return total_categories > 0 and core_count >= min(10, total_categories)

    @staticmethod
    def _normalize_store_lookup(value: object) -> str:
        normalized = str(value or "").strip().casefold()
        normalized = re.sub(r"[\s/／\\_\-—·•（）()【】\[\]{}]+", "", normalized)
        for suffix in (
            "天猫国际官方直营",
            "海外旗舰店",
            "官方旗舰店",
            "旗舰店",
            "官方店",
            "专卖店",
            "专营店",
            "企业店",
            "淘宝店",
            "店铺",
        ):
            if normalized.endswith(suffix):
                normalized = normalized[: -len(suffix)]
                break
        return normalized

    @classmethod
    def _store_query_aliases(cls, value: object) -> list[str]:
        text = str(value or "").strip()
        candidates = [text, *re.split(r"[/／|]", text)]
        candidates.extend(re.findall(r"[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]{2,}", text))
        aliases: list[str] = []
        for candidate in candidates:
            normalized = cls._normalize_store_lookup(candidate)
            if len(normalized) >= 2 and normalized not in aliases:
                aliases.append(normalized)
        return aliases

    def find_brand_core_profile(
        self,
        brand_or_store: object,
        *,
        require_fully_mapped: bool = True,
    ) -> dict[str, Any] | None:
        """Return one unambiguous store profile for a brand/store expression."""

        aliases = self._store_query_aliases(brand_or_store)
        if not aliases:
            return None
        matches: list[tuple[int, float, dict[str, Any]]] = []
        for profile in self._load_store_category_knowledge()["profiles"]:
            if require_fully_mapped and not profile.get("fullyMapped"):
                continue
            if require_fully_mapped and not self._has_complete_top_ten(profile):
                continue
            store_key = self._normalize_store_lookup(
                profile.get("normalizedStoreName") or profile.get("storeName")
            )
            if not store_key:
                continue
            store_aliases = [store_key]
            store_aliases.extend(
                item
                for item in re.findall(
                    r"[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]{2,}", store_key
                )
                if item not in store_aliases
            )
            score = 0
            for alias in aliases:
                for store_alias in store_aliases:
                    if store_alias == alias:
                        score = max(score, 10000 + len(alias))
                    elif alias in store_alias:
                        score = max(score, 5000 + len(alias))
                    elif store_alias in alias:
                        score = max(score, 3000 + len(store_alias))
            if score:
                matches.append(
                    (score, float(profile.get("totalSalesAmount") or 0), profile)
                )
        if not matches:
            return None
        best_score = max(item[0] for item in matches)
        best = [item for item in matches if item[0] == best_score]
        if len(best) > 1:
            # A short brand name can legitimately match more than one store.
            # Never silently choose the biggest one because that changes scope.
            return None
        profile = copy.deepcopy(best[0][2])
        profile["matchedFrom"] = str(brand_or_store or "").strip()
        return profile

    def find_unique_brand_core_profile_in_text(
        self,
        text: object,
        *,
        require_fully_mapped: bool = True,
    ) -> dict[str, Any] | None:
        """Find a profile only when the message names exactly one known brand."""

        message_key = self._normalize_store_lookup(text)
        if not message_key:
            return None
        matched: list[dict[str, Any]] = []
        for profile in self._load_store_category_knowledge()["profiles"]:
            if require_fully_mapped and not profile.get("fullyMapped"):
                continue
            if require_fully_mapped and not self._has_complete_top_ten(profile):
                continue
            store_key = self._normalize_store_lookup(
                profile.get("normalizedStoreName") or profile.get("storeName")
            )
            aliases = [store_key]
            aliases.extend(
                item
                for item in re.findall(
                    r"[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]{2,}", store_key
                )
                if item not in aliases
            )
            if any(alias and alias in message_key for alias in aliases):
                matched.append(profile)
        if len(matched) != 1:
            return None
        profile = copy.deepcopy(matched[0])
        profile["matchedFrom"] = str(text or "").strip()
        return profile

    def brand_core_categories(self, brand_or_store: object) -> list[str]:
        profile = self.find_brand_core_profile(brand_or_store)
        if profile is None:
            return []
        return [
            str(item.get("categoryPath") or "").strip()
            for item in (profile.get("coreCategories") or [])[:10]
            if str(item.get("categoryPath") or "").strip() and item.get("cateId")
        ]

    def brand_category_group_top_categories(
        self, brand_or_store: object, group: str
    ) -> list[str]:
        """Take a group's ten best-selling second-level categories for one store."""

        profile = self.find_brand_core_profile(
            brand_or_store, require_fully_mapped=False
        )
        if profile is None:
            return []
        categories = (profile.get("categoryGroups") or {}).get(group) or []
        if not categories or any(not item.get("cateId") for item in categories[:10]):
            return []
        return [
            str(item.get("categoryPath") or "").strip()
            for item in categories[:10]
            if str(item.get("categoryPath") or "").strip()
        ]

    def _load_training_knowledge(self) -> dict[str, Any]:
        try:
            with self.training_examples_path.open("r", encoding="utf-8") as stream:
                payload = json.load(stream)
        except (OSError, json.JSONDecodeError):
            return {"businessTimeSemantics": [], "verifiedBrandAccountAccess": [], "businessTermMappings": [], "adTouchpointMappings": [], "campaignAudienceMappings": [], "rules": [], "examples": []}
        if not isinstance(payload, dict):
            return {"businessTimeSemantics": [], "verifiedBrandAccountAccess": [], "businessTermMappings": [], "adTouchpointMappings": [], "campaignAudienceMappings": [], "rules": [], "examples": []}
        return {
            "businessTimeSemantics": copy.deepcopy(
                payload.get("businessTimeSemantics") or []
            ),
            "verifiedBrandAccountAccess": copy.deepcopy(
                payload.get("verifiedBrandAccountAccess") or []
            ),
            "businessTermMappings": copy.deepcopy(
                payload.get("businessTermMappings") or []
            ),
            "adTouchpointMappings": copy.deepcopy(
                payload.get("adTouchpointMappings") or []
            ),
            "campaignAudienceMappings": copy.deepcopy(
                payload.get("campaignAudienceMappings") or []
            ),
            "rules": copy.deepcopy(payload.get("rules") or []),
            "examples": copy.deepcopy(payload.get("examples") or []),
        }

    def find_verified_brand_account_access(
        self, brand_or_message: object
    ) -> dict[str, Any] | None:
        normalized = str(brand_or_message or "").casefold()
        matches = [
            mapping
            for mapping in self._load_training_knowledge()[
                "verifiedBrandAccountAccess"
            ]
            if isinstance(mapping, dict)
            and mapping.get("canUseBrandAccount") is True
            and any(
                isinstance(alias, str) and alias.casefold() in normalized
                for alias in [mapping.get("brand"), *(mapping.get("aliases") or [])]
                if alias
            )
        ]
        return copy.deepcopy(matches[0]) if len(matches) == 1 else None

    def find_business_term_mapping(self, message: str) -> dict[str, Any] | None:
        normalized = str(message or "").casefold()
        matches = [
            mapping
            for mapping in self._load_training_knowledge()["businessTermMappings"]
            if isinstance(mapping, dict)
            and any(
                isinstance(alias, str) and alias.casefold() in normalized
                for alias in mapping.get("aliases") or []
            )
        ]
        return copy.deepcopy(matches[0]) if len(matches) == 1 else None

    def find_ad_touchpoint_mapping(self, message: str) -> dict[str, Any] | None:
        normalized = str(message or "").casefold()
        matches = [
            mapping
            for mapping in self._load_training_knowledge()["adTouchpointMappings"]
            if isinstance(mapping, dict)
            and any(
                isinstance(alias, str) and alias.casefold() in normalized
                for alias in mapping.get("aliases") or []
            )
        ]
        return copy.deepcopy(matches[0]) if len(matches) == 1 else None

    def find_campaign_audience_mapping(self, message: str) -> dict[str, Any] | None:
        normalized = str(message or "").casefold()
        matches = [
            mapping
            for mapping in self._load_training_knowledge()[
                "campaignAudienceMappings"
            ]
            if isinstance(mapping, dict)
            and any(
                isinstance(alias, str) and alias.casefold() in normalized
                for alias in mapping.get("aliases") or []
            )
        ]
        return copy.deepcopy(matches[0]) if len(matches) == 1 else None

    def find_exact_curated_example(self, message: str) -> dict[str, Any] | None:
        """Return a confirmed training example only for an exact utterance match.

        This is a recovery path for occasional model turns that return prose
        without an intent.  It deliberately does not fuzzy-match: unfamiliar
        natural language must still be interpreted by the model and validated
        by the compiler rather than being forced into the nearest example.
        """

        normalized = re.sub(r"\s+", "", str(message or "")).casefold()
        if not normalized:
            return None
        matches: list[dict[str, Any]] = []
        for example in self._load_training_knowledge()["examples"]:
            if not isinstance(example, dict):
                continue
            for utterance in example.get("naturalLanguageVariants") or []:
                if re.sub(r"\s+", "", str(utterance or "")).casefold() == normalized:
                    matches.append({"example": example, "period": None})
            for variant in example.get("dynamicNaturalLanguageVariants") or []:
                if not isinstance(variant, dict):
                    continue
                utterance = variant.get("utterance")
                if re.sub(r"\s+", "", str(utterance or "")).casefold() == normalized:
                    matches.append(
                        {
                            "example": example,
                            "period": str(variant.get("period") or "") or None,
                        }
                    )
        return copy.deepcopy(matches[0]) if len(matches) == 1 else None

    def _prompt_training_examples(self) -> list[dict[str, Any]]:
        compact_examples = []
        for example in self._load_training_knowledge()["examples"]:
            if not isinstance(example, dict):
                continue
            compact_examples.append(
                {
                    "id": example.get("id"),
                    "businessMeaning": example.get("businessMeaning"),
                    "dateSemantics": example.get("dateSemantics"),
                    "naturalLanguageVariants": example.get(
                        "naturalLanguageVariants"
                    ),
                    "dynamicNaturalLanguageVariants": example.get(
                        "dynamicNaturalLanguageVariants"
                    ),
                    "canonicalIntent": example.get("canonicalIntent"),
                    "criticalMappings": example.get("criticalMappings"),
                }
            )
        return compact_examples

    def list_summaries(self) -> list[dict[str, Any]]:
        solutions = self.solution_store.list_solutions(
            "published", "public", "ai-solution-knowledge"
        )
        return [self._summarize(item) for item in solutions[: self.MAX_SOLUTIONS]]

    def status(self) -> dict[str, Any]:
        solutions = self.solution_store.list_solutions(
            "published", "public", "ai-solution-knowledge"
        )
        latest = max(
            (str(item.get("updatedAt") or "") for item in solutions),
            default="",
        )
        training_knowledge = self._load_training_knowledge()
        store_knowledge = self._load_store_category_knowledge()
        return {
            "solutionKnowledgeCount": min(len(solutions), self.MAX_SOLUTIONS),
            "solutionKnowledgeUpdatedAt": latest or None,
            "trainingExampleCount": len(training_knowledge["examples"]),
            "storeCategoryProfileCount": len(store_knowledge["profiles"]),
            "availableTopTenCategoryProfileCount": sum(
                1 for item in store_knowledge["profiles"]
                if item.get("fullyMapped") and self._has_complete_top_ten(item)
            ),
            "fullyMappedStoreCategoryProfileCount": sum(
                1 for item in store_knowledge["profiles"] if item.get("fullyMapped")
            ),
            "storeCategoryProfileMonths": store_knowledge["source"].get("months") or [],
        }

    def get_prompt_catalog(self, message: str = "") -> dict[str, Any]:
        training_knowledge = self._load_training_knowledge()
        matched_profile = self.find_unique_brand_core_profile_in_text(message)
        matched_profiles = []
        if matched_profile is not None:
            matched_profiles.append(
                {
                    "storeName": matched_profile.get("storeName"),
                    "coveredShare": matched_profile.get("coveredShare"),
                    "coreCategories": [
                        item.get("categoryPath")
                        for item in (matched_profile.get("coreCategories") or [])[:10]
                    ],
                    "makeupTopCategories": [
                        item.get("categoryPath")
                        for item in (matched_profile.get("categoryGroups") or {}).get("彩妆") or []
                    ][:10],
                    "skincareTopCategories": [
                        item.get("categoryPath")
                        for item in (matched_profile.get("categoryGroups") or {}).get("护肤") or []
                    ][:10],
                }
            )
        return {
            "rules": [
                "先对照每个方案的businessDefinition和recognitionExamples做语义分类；高度一致时，intent.solutionId必须逐字复制该方案id。不要因为用户自定义了audienceName而省略solutionId。",
                "方案名称或业务含义命中时，复用方案的组件数量、节点顺序、固定行为和集合运算关系。",
                "命中方案后conditions必须严格按照canonicalOrder输出；用户叙述顺序、事件发生顺序或日期先后顺序都不能改变模板节点顺序。",
                "parameterBindings是用户需要提供或可从本轮话语提取的变量；不要复制方案创建时的示例品牌、类目和日期。",
                "fixedIntent是方案定义本身。用户没有另行修改时必须保留，不能对其中已有的行为再次追问。",
                "公共方案只提供业务结构参考；实时品牌、类目、账号和字段选项仍交给后端校验。",
                "品类新客、品类老客等方案中的分析类目是本次目标二级类目；品牌核心类目按店铺销售额降序取前10个二级类目，不使用销售覆盖率阈值，不得把分析类目复制为品牌核心类目。",
                "口语中的某品牌“彩妆”按一级类目“彩妆/香水/美妆工具”解释，先限定这个一级类目，再按二级类目销售额取前10项；因此香水和美容工具也属于这一口语范围。口语中的“护肤”同理按一级类目“美容护肤/美体/精油”解释。这些范围都不同于全店品牌核心类目。",
                "仅在店铺销售趋势知识包含完整前10项时自动填充品牌核心类目；旧95%缓存不够10项且店铺还有更多类目时不得假称已选出前10。品牌核心类目最多10项，不需要因该字段批量拆分。",
                "curatedExamples是用户确认过的JSON反向训练样本，用于学习组件与字段语义；它们不是公共方案，除非另有方案命中，否则不要填写solutionId。",
            ],
            "solutions": self.list_summaries(),
            "businessTimeSemantics": training_knowledge["businessTimeSemantics"],
            "verifiedBrandAccountAccess": training_knowledge[
                "verifiedBrandAccountAccess"
            ],
            "businessTermMappings": training_knowledge["businessTermMappings"],
            "adTouchpointMappings": training_knowledge["adTouchpointMappings"],
            "campaignAudienceMappings": training_knowledge[
                "campaignAudienceMappings"
            ],
            "curatedTrainingRules": training_knowledge["rules"],
            "curatedExamples": self._prompt_training_examples(),
            "matchedStoreCategoryProfiles": matched_profiles,
        }

    @staticmethod
    def _summarize(solution: dict[str, Any]) -> dict[str, Any]:
        custom_fields = solution.get("customFields") or []
        bindings: dict[tuple[str, str], dict[str, str]] = {}
        parameters: list[dict[str, Any]] = []
        for field in custom_fields:
            if not isinstance(field, dict):
                continue
            name = str(field.get("name") or "").strip()
            if not name:
                continue
            parameters.append(
                {
                    "name": name,
                    "type": str(field.get("type") or "text"),
                }
            )
            for binding in field.get("bindings") or []:
                if not isinstance(binding, dict):
                    continue
                node_id = str(binding.get("nodeId") or "")
                field_key = str(binding.get("fieldKey") or "")
                if node_id and field_key:
                    bindings[(node_id, field_key)] = {
                        "parameter": name,
                        "targetField": FORM_TO_INTENT_FIELD.get(field_key, field_key),
                    }

        summarized_nodes = []
        seen_pool_ids: set[str] = set()
        for node in solution.get("nodes") or []:
            if not isinstance(node, dict):
                continue
            node_id = str(node.get("id") or "")
            fixed_intent: dict[str, Any] = {}
            parameter_bindings = []
            for field_key, value in (node.get("formData") or {}).items():
                binding = bindings.get((node_id, str(field_key)))
                if binding:
                    parameter_bindings.append(copy.deepcopy(binding))
                    continue
                if field_key in IGNORED_FORM_FIELDS or not _has_meaningful_value(value):
                    continue
                intent_field = FORM_TO_INTENT_FIELD.get(str(field_key))
                if intent_field:
                    fixed_intent[intent_field] = copy.deepcopy(value)
            pool_id = str(node.get("poolId") or "").strip()
            relation_operator = node.get("operator")
            if pool_id and pool_id in seen_pool_ids:
                relation_operator = node.get("poolOperator") or "n"
            if pool_id:
                seen_pool_ids.add(pool_id)
            summarized_nodes.append(
                {
                    "displayName": str(node.get("displayName") or "").strip(),
                    "component": str(node.get("packageType") or "").strip(),
                    "relation": RELATION_LABELS.get(
                        relation_operator, str(relation_operator or "start")
                    ),
                    "fixedIntent": fixed_intent,
                    "parameterBindings": parameter_bindings,
                }
            )

        solution_name = str(solution.get("name") or "").strip()
        if solution_name == "品类新客":
            for parameter in parameters:
                normalized_name = str(parameter.get("name") or "").replace(
                    "品类", "类目"
                )
                if "分析类目" in normalized_name:
                    parameter.update(
                        {
                            "selectionMode": "single",
                            "maxSelections": 1,
                            "description": "本次要判断新客的目标二级类目，必须使用实时维表中的正式类目路径。",
                        }
                    )
                elif "品牌核心类目" in normalized_name:
                    parameter.update(
                        {
                            "selectionMode": "multiple",
                            "maxSelectionsPerNode": 10,
                            "description": "系统按店铺销售额降序取前10个二级类目；不足10个时保留全部，源数据不足时不能编造。",
                        }
                    )

        result = {
            "id": solution.get("id"),
            "name": solution_name,
            "defaultAudienceName": str(
                solution.get("defaultCrowdName") or ""
            ).strip(),
            "version": solution.get("_version"),
            "parameters": parameters,
            "nodes": summarized_nodes,
        }
        result.update(copy.deepcopy(SOLUTION_SEMANTICS.get(solution_name) or {}))
        return result
