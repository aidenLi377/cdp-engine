"""Natural-language audience planning service.

The model extracts intent; the deterministic compiler remains the authority for
component choice, live options, account permissions and workbench output.
"""

from __future__ import annotations

import copy
import json
import re
from calendar import monthrange
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .ai_component_catalog import AiComponentCatalog, CatalogValidationError
from .ai_intent_compiler import AiIntentCompiler, IntentValidationError
from .ai_model_client import AiModelClient, AiResponseError
from .ai_solution_knowledge import AiSolutionKnowledge
from .ai_system_knowledge import AiSystemKnowledge
from .business_date import (
    business_today,
    latest_selectable_date,
    resolve_business_period,
)


MAX_MESSAGE_LENGTH = 4000
MAX_HISTORY_ITEMS = 512
DMP_OPERATION_ACTION = "prepare_dmp_batch_profile"
DMP_TAG_CATALOG_PATH = (
    Path(__file__).resolve().parents[1]
    / "cdp-web"
    / "src"
    / "data"
    / "dmp_tags_dictionary.json"
)
DMP_CONFIRMATION_WORDS = (
    "都确定",
    "确认执行",
    "开始执行",
    "直接执行",
    "开始取数",
    "确认开始",
    "可以开始",
)
DMP_DEFAULT_TAG_CONFIRMATION_WORDS = (
    "默认就行",
    "默认即可",
    "使用默认",
    "用默认",
    "无需调整",
    "不用调整",
    "不调整",
)
DMP_WORKFLOW_ID = "dmp-batch-profile-comparison"
DMP_DEFAULT_TAG_NAMES = (
    "用户性别",
    "用户年龄",
    "城市等级",
    "消费能力等级",
    "月均消费金额",
    "大快消策略人群（新）",
)
TIME_REQUIRED_COMPONENTS = {
    "类目公域行为",
    "类目商品行为",
    "商品行为",
    "关键词搜索",
}


class AiChatRequestError(ValueError):
    """Raised when the browser sends a malformed chat request."""


class AiChatService:
    def __init__(
        self,
        model_client: AiModelClient,
        catalog: AiComponentCatalog,
        compiler: AiIntentCompiler,
        solution_knowledge: AiSolutionKnowledge,
        system_knowledge: AiSystemKnowledge,
    ) -> None:
        self.model_client = model_client
        self.catalog = catalog
        self.compiler = compiler
        self.solution_knowledge = solution_knowledge
        self.system_knowledge = system_knowledge

    def chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise AiChatRequestError("对话参数格式不正确")
        message = str(payload.get("message") or "").strip()
        if not message:
            raise AiChatRequestError("请输入你想圈选的人群")
        if len(message) > MAX_MESSAGE_LENGTH:
            raise AiChatRequestError(f"单次描述不能超过{MAX_MESSAGE_LENGTH}个字符")

        current_intent = payload.get("currentIntent")
        if current_intent is not None and not isinstance(current_intent, dict):
            raise AiChatRequestError("当前圈包意图格式不正确")
        pending_questions = payload.get("pendingQuestions") or []
        if not isinstance(pending_questions, list):
            raise AiChatRequestError("待确认问题格式不正确")
        question_answer = payload.get("questionAnswer")
        if question_answer is not None and not isinstance(question_answer, dict):
            raise AiChatRequestError("类目确认参数格式不正确")
        current_operation = self._normalize_operation(payload.get("currentOperation"))

        current_intent_copy = copy.deepcopy(current_intent)
        pending_questions_copy = copy.deepcopy(pending_questions[:10])
        current_workflow = self.system_knowledge.normalize_workflow(
            payload.get("currentWorkflow")
        )
        requested_workflow = self.system_knowledge.recommend_workflow(
            message, current_intent_copy
        )
        confirms_recent_dmp_prompt = self._confirms_recent_dmp_prompt(
            message, payload.get("history")
        )
        if (
            self.model_client.configured
            and not confirms_recent_dmp_prompt
            and self._needs_intent_elaboration(
                message,
                current_intent=current_intent_copy,
                pending_questions=pending_questions_copy,
                current_operation=current_operation,
            )
        ):
            return {
                "status": "collecting",
                "reply": self._intent_elaboration_reply(message),
                "intent": None,
                "plan": None,
                "workflow": current_workflow or requested_workflow,
                "operation": None,
            }
        if requested_workflow.get("id") == DMP_WORKFLOW_ID or confirms_recent_dmp_prompt:
            current_workflow = (
                requested_workflow
                if requested_workflow.get("id") == DMP_WORKFLOW_ID
                else self.system_knowledge.recommend_workflow(
                    "达摩盘画像横向对比", None
                )
            )
            if current_operation is None:
                current_operation = self._build_dmp_operation_hint(
                    payload.get("history"), message
                )
        elif current_operation is not None:
            current_workflow = self.system_knowledge.recommend_workflow(
                "达摩盘画像横向对比", None
            )

        if (
            current_operation is not None
            and current_operation.get("tagIds")
            and self._is_operation_confirmation(message)
        ):
            current_operation["userConfirmed"] = True
            current_operation["loginConfirmed"] = True
            current_operation["tagSelectionConfirmed"] = True
            return self._operation_response(current_operation, current_workflow)
        if (
            current_operation is not None
            and current_operation.get("tagIds")
            and self._is_default_tag_confirmation(message)
        ):
            current_operation["tagSelectionConfirmed"] = True
            return self._operation_response(current_operation, current_workflow)
        option_resolved_intent = self._apply_pending_option_answer(
            message,
            current_intent_copy,
            pending_questions_copy,
            question_answer=copy.deepcopy(question_answer),
        )
        if option_resolved_intent is not None:
            matched_solution = self._match_public_solution(
                option_resolved_intent, message
            )
            if matched_solution is not None:
                option_resolved_intent = self._ground_public_solution_intent(
                    option_resolved_intent,
                    matched_solution,
                    previous_intent=current_intent_copy,
                    message=message,
                    pending_questions=pending_questions_copy,
                )
            else:
                option_resolved_intent = self._ground_generic_user_fields(
                    option_resolved_intent,
                    previous_intent=current_intent_copy,
                    message=message,
                )
            option_resolved_intent = self._ground_live_category_intent(
                option_resolved_intent, message
            )
            option_resolved_intent = self._ground_official_store_intent(
                option_resolved_intent, message
            )
            option_resolved_intent = self._ground_channel_aggregate_intent(
                option_resolved_intent, message
            )
            option_resolved_intent = self._normalize_model_intent(
                option_resolved_intent, message
            )
            return self._compile_response(
                option_resolved_intent,
                ready_reply="已记下这个正式选项，方案已经更新。",
                workflow=current_workflow
                or self.system_knowledge.recommend_workflow(
                    message, option_resolved_intent
                ),
                matched_solution=matched_solution,
                message=message,
            )

        system_prompt = self._build_system_prompt(message, current_workflow)
        fixed_context = {
            "userMessage": message,
            "currentIntent": current_intent_copy,
            "pendingQuestions": pending_questions_copy,
            "currentOperation": current_operation,
        }
        reserved_tokens = (
            self._estimate_tokens(system_prompt)
            + self._estimate_tokens(json.dumps(fixed_context, ensure_ascii=False))
            + self.model_client.max_output_tokens
            + 2048
        )
        history_token_budget = max(
            0,
            self.model_client.max_input_tokens - reserved_tokens,
        )
        model_context = {
            "userMessage": message,
            "recentConversation": self._normalize_history(
                payload.get("history"), history_token_budget
            ),
            "currentIntent": current_intent_copy,
            "pendingQuestions": pending_questions_copy,
            "currentOperation": current_operation,
            "currentDate": business_today().isoformat(),
            "latestSelectableDate": latest_selectable_date().isoformat(),
        }
        interpreted = self.model_client.interpret(system_prompt, model_context)
        intent = self._normalize_model_intent(interpreted.get("intent"))
        matched_solution = self._match_public_solution(intent, message)
        if intent is None and matched_solution is not None:
            # A complete public-solution request must not be dropped merely
            # because a non-deterministic model turn returned prose without an
            # intent. Retry once with the already verified solution identity;
            # the compiler remains responsible for asking about missing fields.
            recovery_prompt = (
                f"{system_prompt}\n\n"
                "纠错重试：系统已确认用户请求匹配公共方案"
                f"《{matched_solution.get('name')}》。上一次没有返回 intent。"
                "这次必须返回该方案的完整结构化 intent；未知参数保留为空，"
                "交给系统逐项追问，不能只回复说明文字。"
            )
            recovered = self.model_client.interpret(recovery_prompt, model_context)
            recovered_intent = self._normalize_model_intent(recovered.get("intent"))
            if recovered_intent is not None:
                interpreted = recovered
                intent = recovered_intent
                matched_solution = self._match_public_solution(intent, message)
        if matched_solution is not None:
            intent = self._ground_public_solution_intent(
                intent,
                matched_solution,
                previous_intent=current_intent_copy,
                message=message,
                pending_questions=pending_questions_copy,
            )
        else:
            intent = self._ground_generic_user_fields(
                intent,
                previous_intent=current_intent_copy,
                message=message,
            )
        intent = self._ground_live_category_intent(intent, message)
        intent = self._ground_official_store_intent(intent, message)
        intent = self._ground_channel_aggregate_intent(intent, message)
        intent = self._normalize_model_intent(intent, message)
        assistant_message = str(interpreted.get("assistantMessage") or "").strip()
        incoming_operation = self._normalize_operation(interpreted.get("operation"))
        effective_workflow = current_workflow or requested_workflow
        if effective_workflow.get("id") != DMP_WORKFLOW_ID and current_operation is None:
            incoming_operation = None
        elif (
            current_operation is not None
            and current_operation.get("tagIds")
            and not current_operation.get("tagSelectionConfirmed")
            and not self._message_requests_tag_change(message)
            and incoming_operation is not None
        ):
            incoming_operation["tagIds"] = copy.deepcopy(current_operation["tagIds"])
            incoming_operation["tagNames"] = copy.deepcopy(
                current_operation.get("tagNames") or []
            )
            incoming_operation["tagSelectionConfirmed"] = False
        operation = self._merge_operation(current_operation, incoming_operation)
        workflow = (
            current_workflow
            or self.system_knowledge.recommend_workflow(message, intent)
        )
        if operation is not None:
            return self._operation_response(operation, workflow)
        if intent is None:
            return {
                "status": "collecting",
                "reply": assistant_message or "请继续告诉我需要圈选的人群条件。",
                "intent": current_intent,
                "plan": None,
                "workflow": workflow,
                "operation": None,
            }

        return self._compile_response(
            intent,
            ready_reply=assistant_message,
            workflow=workflow,
            matched_solution=matched_solution,
            message=message,
        )

    def _compile_response(
        self,
        intent: dict[str, Any],
        *,
        ready_reply: str = "",
        workflow: dict[str, Any] | None = None,
        matched_solution: dict[str, Any] | None = None,
        message: str = "",
    ) -> dict[str, Any]:
        try:
            plan = self.compiler.compile(intent)
        except (IntentValidationError, CatalogValidationError) as exc:
            raise AiResponseError(f"AI生成的圈包意图未通过校验：{exc}") from exc

        # The compiler only sees generic component fields, while the public
        # solution catalog knows which date fields are true user parameters.
        # Component defaults (historically 366 days) must never make a public
        # solution look ready before those parameters have been confirmed.
        if matched_solution is not None and plan.get("status") == "ready":
            time_question = self._missing_solution_time_question(
                intent, matched_solution
            )
            if time_question is not None:
                plan["status"] = "needs_clarification"
                plan["questions"] = [time_question]
                plan["nodes"] = []
                plan["generated"] = None
                plan["nextActions"] = []

        # A model may produce a syntactically valid condition while also saying
        # in prose that time still needs confirmation. The workbench must never
        # become applicable in that contradictory state. Public solutions have
        # their own parameter-aware rule above; this covers free-form audiences.
        if matched_solution is None and plan.get("status") == "ready":
            time_question = self._missing_generic_time_question(intent, message)
            if time_question is not None:
                plan["status"] = "needs_clarification"
                plan["questions"] = [time_question]
                plan["nodes"] = []
                plan["generated"] = None
                plan["nextActions"] = []

        selected_workflow = workflow or self.system_knowledge.recommend_workflow("", intent)
        plan["workflow"] = selected_workflow
        if matched_solution is not None:
            plan["matchedSolution"] = {
                "id": matched_solution.get("id"),
                "name": matched_solution.get("name"),
                "version": matched_solution.get("version"),
            }
        if plan["status"] == "needs_clarification" and plan.get("questions"):
            # Ask for one business parameter at a time. Rendering every pending
            # question at once allowed users to confirm a later parameter while
            # the conversation was still asking about the first one.
            plan["questions"] = plan["questions"][:1]
        reply = (
            plan["questions"][0]["prompt"]
            if plan["status"] == "needs_clarification"
            else ready_reply or "方案已经整理完成，请确认后再应用到工作台。"
        )
        return {
            "status": plan["status"],
            "reply": reply,
            "intent": intent,
            "plan": plan,
            "workflow": selected_workflow,
            "operation": None,
        }

    def _missing_generic_time_question(
        self,
        intent: dict[str, Any],
        message: str,
    ) -> dict[str, Any] | None:
        """Require an explicit date for every free-form behavior condition."""

        targets: list[dict[str, Any]] = []
        for index, condition in enumerate(intent.get("conditions") or []):
            if not isinstance(condition, dict):
                continue
            component = str(condition.get("component") or "").strip()
            is_behavior_condition = component in TIME_REQUIRED_COMPONENTS or any(
                condition.get(field) not in (None, "", [], {})
                for field in ("behaviors", "productIds", "searchKeywords")
            )
            if not is_behavior_condition:
                continue
            if self._condition_parameter_value(condition, "timeWindow") is not None:
                continue
            condition_id = str(condition.get("id") or f"condition_{index + 1}")
            targets.append(
                {
                    "conditionId": condition_id,
                    "field": "recentDays",
                    "intentField": "recentDays",
                }
            )

        if not targets:
            return None
        if re.search(r"最近|近期|这段时间", str(message or "")):
            prompt = "你说的“最近”具体指多久？例如近7天、近30天或近90天。"
        else:
            prompt = "请补充统计时间，例如“近30天”或明确的起止日期。"
        first_target = targets[0]
        return {
            "id": f"{first_target['conditionId']}.generic-time.1",
            "conditionId": first_target["conditionId"],
            "field": "recentDays",
            "prompt": prompt,
            "reason": "行为圈选必须由用户确认时间；数据最晚截止到昨天。",
            "answerType": "text",
            "parameterName": "统计时间",
            "applyTargets": targets,
        }

    def _missing_solution_time_question(
        self,
        intent: dict[str, Any],
        solution: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Require every public-solution date parameter before application."""

        conditions = [
            item for item in intent.get("conditions") or [] if isinstance(item, dict)
        ]
        parameter_targets: dict[str, list[dict[str, Any]]] = {}
        for index, node in enumerate(solution.get("nodes") or []):
            if not isinstance(node, dict) or index >= len(conditions):
                continue
            condition = conditions[index]
            condition_id = str(condition.get("id") or f"condition_{index + 1}")
            for binding in node.get("parameterBindings") or []:
                if not isinstance(binding, dict):
                    continue
                if str(binding.get("targetField") or "") != "timeWindow":
                    continue
                parameter_name = str(binding.get("parameter") or "时间").strip()
                parameter_targets.setdefault(parameter_name, []).append(
                    {
                        "conditionId": condition_id,
                        "field": "recentDays",
                        "intentField": "recentDays",
                    }
                )

        missing_names: list[str] = []
        missing_targets: list[dict[str, Any]] = []
        for parameter_name, targets in parameter_targets.items():
            binding_indexes = [
                index
                for index, node in enumerate(solution.get("nodes") or [])
                if isinstance(node, dict)
                and any(
                    isinstance(binding, dict)
                    and str(binding.get("parameter") or "时间").strip()
                    == parameter_name
                    and str(binding.get("targetField") or "") == "timeWindow"
                    for binding in node.get("parameterBindings") or []
                )
            ]
            has_value = any(
                index < len(conditions)
                and self._condition_parameter_value(
                    conditions[index], "timeWindow"
                )
                is not None
                for index in binding_indexes
            )
            if has_value:
                continue
            missing_names.append(parameter_name)
            missing_targets.extend(targets)

        if not missing_names:
            return None

        normalized_names = [name.replace("品类", "类目") for name in missing_names]
        if "统计时间" in normalized_names and "对比时间" in normalized_names:
            prompt = "请补充统计时间和对比时间，例如“近半年对比前半年”。"
            parameter_name = "统计时间与对比时间"
            reason = (
                "该方案需要两个不同的业务周期；数据最晚截止到昨天，"
                "未确认时间前不会生成或应用节点。"
            )
        elif "统计时间" in normalized_names:
            prompt = "请补充统计时间，例如“近半年”或“近30天”。"
            parameter_name = "统计时间"
            reason = "该方案的统计时间尚未确认；数据最晚截止到昨天。"
        elif "对比时间" in normalized_names:
            prompt = "请补充对比时间，例如“对比前半年”或“对比前30天”。"
            parameter_name = "对比时间"
            reason = "该方案的对比时间尚未确认；数据最晚截止到昨天。"
        else:
            readable = "、".join(normalized_names)
            prompt = f"请补充{readable}，例如“近30天”。"
            parameter_name = readable
            reason = "该方案的时间范围尚未确认；数据最晚截止到昨天。"

        first_target = missing_targets[0]
        return {
            "id": f"{first_target['conditionId']}.solution-time.1",
            "conditionId": first_target["conditionId"],
            "field": "recentDays",
            "prompt": prompt,
            "reason": reason,
            "answerType": "text",
            "parameterName": parameter_name,
            "applyTargets": missing_targets,
        }

    @staticmethod
    def _clean_string_list(value: object, *, limit: int = 50) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = str(item or "").strip()
            if not text or text in seen:
                continue
            cleaned.append(text[:240])
            seen.add(text)
            if len(cleaned) >= limit:
                break
        return cleaned

    @classmethod
    def _normalize_operation(cls, value: object) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        action = str(value.get("action") or value.get("type") or "").strip()
        if action not in {DMP_OPERATION_ACTION, "dmp_batch_profile"}:
            return None
        tag_catalog = cls._load_dmp_tag_catalog()
        tag_by_id = {str(item["tagId"]): item for item in tag_catalog}
        requested_tag_ids = cls._clean_string_list(value.get("tagIds"), limit=100)
        tag_ids = [tag_id for tag_id in requested_tag_ids if tag_id in tag_by_id]
        tag_names = (
            [str(tag_by_id[tag_id]["tagName"]) for tag_id in tag_ids]
            if tag_ids
            else cls._clean_string_list(value.get("tagNames"))
        )
        return {
            "action": DMP_OPERATION_ACTION,
            "crowdNames": cls._clean_string_list(value.get("crowdNames")),
            "tagIds": tag_ids,
            "tagNames": tag_names,
            "comparisonMetrics": cls._clean_string_list(
                value.get("comparisonMetrics") or ["人群占比", "Rebase"],
                limit=5,
            ),
            "loginConfirmed": value.get("loginConfirmed") is True,
            "userConfirmed": value.get("userConfirmed") is True,
            "tagSelectionConfirmed": value.get("tagSelectionConfirmed") is True,
            "autoOpenComparison": value.get("autoOpenComparison") is not False,
        }

    @staticmethod
    def _merge_operation(
        current: dict[str, Any] | None,
        incoming: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if incoming is None:
            return current
        if current is None:
            return incoming
        merged = copy.deepcopy(current)
        for field in ("crowdNames", "tagIds", "tagNames", "comparisonMetrics"):
            if incoming.get(field):
                merged[field] = incoming[field]
        for field in (
            "loginConfirmed",
            "userConfirmed",
            "tagSelectionConfirmed",
            "autoOpenComparison",
        ):
            if incoming.get(field) is True:
                merged[field] = True
        return merged

    @classmethod
    def _build_dmp_operation_hint(
        cls,
        history: object,
        message: str,
    ) -> dict[str, Any]:
        tag_by_name = {
            str(item["tagName"]): str(item["tagId"])
            for item in cls._load_dmp_tag_catalog()
        }
        tag_names = [name for name in DMP_DEFAULT_TAG_NAMES if name in tag_by_name]
        tag_ids = [tag_by_name[name] for name in tag_names]
        crowd_names = cls._extract_prior_crowd_names(history)
        if not crowd_names:
            crowd_names = cls._extract_crowd_name_lines(message)
        return cls._normalize_operation(
            {
                "action": DMP_OPERATION_ACTION,
                "crowdNames": crowd_names,
                "tagIds": tag_ids,
                "tagNames": tag_names,
                "comparisonMetrics": ["人群占比", "Rebase"],
                "loginConfirmed": False,
                "userConfirmed": False,
                "tagSelectionConfirmed": False,
                "autoOpenComparison": True,
            }
        ) or {}

    @classmethod
    def _extract_prior_crowd_names(cls, history: object) -> list[str]:
        if not isinstance(history, list):
            return []
        for item in reversed(history[-MAX_HISTORY_ITEMS:]):
            if not isinstance(item, dict) or item.get("role") != "user":
                continue
            candidates = cls._extract_crowd_name_lines(item.get("content"))
            if len(candidates) >= 2:
                return candidates
        return []

    @classmethod
    def _extract_crowd_name_lines(cls, value: object) -> list[str]:
        text = str(value or "").strip()
        if "\n" not in text and "\r" not in text:
            return []
        lines = cls._clean_string_list(
            [
                re.sub(r"^[\s•·*\-\d.、]+", "", line).strip()
                for line in text.splitlines()
            ],
            limit=30,
        )
        if len(lines) < 2:
            return []
        sentence_markers = ("？", "?", "。", "！", "!", "请问", "帮我", "需要")
        if any(
            len(line) > 240 or any(marker in line for marker in sentence_markers)
            for line in lines
        ):
            return []
        return lines

    @staticmethod
    def _load_dmp_tag_catalog() -> list[dict[str, Any]]:
        try:
            loaded = json.loads(DMP_TAG_CATALOG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            return []
        if not isinstance(loaded, list):
            return []
        return [
            {
                "tagId": str(item.get("tagId") or "").strip(),
                "tagName": str(item.get("tagName") or "").strip(),
                "mainCategory": str(item.get("mainCategory") or "").strip(),
                "category": str(item.get("category") or "").strip(),
                "needCondition": item.get("needCondition") is True,
            }
            for item in loaded
            if isinstance(item, dict) and item.get("tagId") and item.get("tagName")
        ]

    @staticmethod
    def _is_operation_confirmation(message: str) -> bool:
        normalized = re.sub(r"\s+", "", str(message or ""))
        return any(word in normalized for word in DMP_CONFIRMATION_WORDS) or normalized in {
            "确认",
            "确定",
            "可以",
            "执行",
            "开始",
        }

    @staticmethod
    def _is_default_tag_confirmation(message: str) -> bool:
        normalized = re.sub(r"\s+", "", str(message or ""))
        return any(word in normalized for word in DMP_DEFAULT_TAG_CONFIRMATION_WORDS)

    @staticmethod
    def _confirms_recent_dmp_prompt(message: str, history: object) -> bool:
        normalized = re.sub(r"[\s，。！!？?]+", "", str(message or ""))
        if normalized not in {
            "是",
            "是的",
            "对",
            "对的",
            "没错",
            "好的",
            "好",
            "可以",
        }:
            return False
        if not isinstance(history, list):
            return False
        for item in reversed(history[-6:]):
            if not isinstance(item, dict) or item.get("role") != "assistant":
                continue
            content = re.sub(r"\s+", "", str(item.get("content") or ""))
            return bool(
                re.search(r"达摩盘|批量取画像|画像透视|横向对比", content, re.I)
            )
        return False

    @classmethod
    def _message_requests_tag_change(cls, message: str) -> bool:
        normalized = re.sub(r"\s+", "", str(message or ""))
        if re.search(
            r"标签|指标|新增|添加|加上|删除|去掉|移除|只要|保留|调整|调序|顺序|移到|放到|排在|第[一二三四五六七八九十\d]+个",
            normalized,
        ):
            return True
        catalog_names = (
            str(item.get("tagName") or "").replace(" ", "")
            for item in cls._load_dmp_tag_catalog()
        )
        if any(name and name in normalized for name in catalog_names):
            return True
        return bool(
            re.search(
                r"(?<!年)(?:年龄|性别|城市等级|消费能力|月均消费|大快消策略)",
                normalized,
            )
        )

    def _operation_response(
        self,
        operation: dict[str, Any],
        workflow: dict[str, Any] | None,
    ) -> dict[str, Any]:
        crowd_names = operation.get("crowdNames") or []
        tag_ids = operation.get("tagIds") or []
        tag_names = operation.get("tagNames") or []
        missing: list[str] = []
        if len(crowd_names) < 2 and operation.get("autoOpenComparison"):
            missing.append("至少两个人群包名称")
        elif not crowd_names:
            missing.append("人群包名称")
        if not tag_ids:
            missing.append("画像标签的正式匹配结果")
        if tag_ids and not operation.get("tagSelectionConfirmed"):
            missing.append("默认画像标签确认")
        if not operation.get("loginConfirmed"):
            missing.append("达摩盘登录与任务执行器状态")
        if not operation.get("userConfirmed"):
            missing.append("最终执行确认")

        ready = not missing
        operation = copy.deepcopy(operation)
        operation["status"] = "ready" if ready else "needs_confirmation"
        operation["missingInputs"] = missing
        if ready:
            reply = "已确认，正在打开达摩盘批量取数；完成后会自动展示横向对比。"
        elif tag_ids and not operation.get("tagSelectionConfirmed"):
            numbered_tags = "　".join(
                f"{marker} {name}"
                for marker, name in zip("①②③④⑤⑥⑦⑧⑨⑩", tag_names)
            )
            reply = (
                f"已带入{len(tag_names)}个默认画像标签（按顺序）：\n"
                f"{numbered_tags}\n"
                "调整方法：直接说“删除月均消费金额”“新增人生阶段”或"
                "“把用户年龄移到第1个”；不需要调整就说“默认就行”。"
            )
        elif len(crowd_names) >= 2 and tag_ids and not operation.get("loginConfirmed"):
            reply = "取数方案已就绪。请确认已登录达摩盘且任务执行器已连接。"
        elif missing:
            reply = f"还差：{'、'.join(missing)}。"
        else:
            reply = "取数方案已准备好，确认后立即执行。"
        return {
            "status": operation["status"],
            "reply": reply,
            "intent": None,
            "plan": None,
            "workflow": workflow,
            "operation": operation,
        }

    @staticmethod
    def _normalize_answer(value: object) -> str:
        return "".join(str(value or "").casefold().split())

    @classmethod
    def _needs_intent_elaboration(
        cls,
        message: str,
        *,
        current_intent: dict[str, Any] | None,
        pending_questions: list[dict[str, Any]],
        current_operation: dict[str, Any] | None,
    ) -> bool:
        """Keep vague first-turn fragments away from the planning model.

        Short answers in an existing dialogue must still be accepted, so this
        guard only runs before a plan, operation or pending question exists.
        """

        if current_intent or pending_questions or current_operation:
            return False
        compact = re.sub(r"[\s，,。.!！?？;；、]+", "", str(message or ""))
        if not compact or len(compact) > 10:
            return False
        vague_phrases = {
            "圈人",
            "圈包",
            "帮我圈人",
            "帮我圈包",
            "看一下",
            "看看",
            "分析一下",
            "测试一下",
            "人群",
            "用户",
            "新客",
            "老客",
            "拉新",
            "复购",
            "达摩盘",
            "取数",
            "做画像",
        }
        if compact in vague_phrases:
            return True

        # A brand plus the colloquial words “新人/新客/老客” is still not a
        # complete business definition. Resolve the metric first instead of
        # spending a model round trip that may guess a public solution.
        ambiguous_audience_words = ("新人", "新客", "老客", "复购")
        explicit_solution_words = (
            "品类新客",
            "类目新客",
            "转牌新客",
            "品牌老客",
            "品类老客",
            "类目老客",
            "存量老客",
        )
        return any(word in compact for word in ambiguous_audience_words) and not any(
            word in compact for word in explicit_solution_words
        )

    @staticmethod
    def _intent_elaboration_reply(message: str) -> str:
        compact = re.sub(r"\s+", "", str(message or ""))
        if "新人" in compact or "新客" in compact or "拉新" in compact:
            return (
                "我知道你想看新人或新客，但还不能确定是哪一种口径。请说明是品类新客、"
                "转牌新客还是其他新客，并补充分析类目和时间。比如："
                "“看兰蔻乳液/面霜的品类新客，近半年对比前半年”。"
            )
        if "老客" in compact or "复购" in compact:
            return (
                "你说的“老客”还需要明确口径：是品类老客，还是品牌老客？"
                "如果是品类老客，再告诉我目标类目；时间也请补充，例如“近半年”。"
            )
        if "达摩盘" in compact or "画像" in compact or "取数" in compact:
            return (
                "请再告诉我要处理哪些人群包，以及是取画像还是做横向对比。"
                "你可以直接粘贴多个人群包名称，再说“去达摩盘按默认六项标签取画像并横向对比”。"
            )
        return (
            "我还不能确定你的圈选目标。请至少说明对象（品牌、类目或商品ID）、"
            "行为和时间；也可以直接说方案口径。比如：“圈近30天购买Dior香水的人”"
            "或“看兰蔻乳液/面霜的品类新客，近半年对比前半年”。"
        )

    def _apply_pending_option_answer(
        self,
        message: str,
        current_intent: dict[str, Any] | None,
        pending_questions: list[dict[str, Any]],
        *,
        question_answer: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Apply an exact live-option click without another model round trip."""

        if not current_intent or not pending_questions:
            return None
        if question_answer is not None:
            question_id = str(question_answer.get("questionId") or "").strip()
            question = next(
                (
                    item
                    for item in pending_questions
                    if isinstance(item, dict) and str(item.get("id") or "") == question_id
                ),
                None,
            )
            if question is None:
                raise AiChatRequestError("这个类目确认项已经失效，请重新选择")
            raw_values = question_answer.get("values")
            if not isinstance(raw_values, list):
                raise AiChatRequestError("请选择正式类目后再确认")
            category_option_count = len(
                self.compiler.engine.dimensions.get("类目维表.csv") or []
            )
            values = self._clean_string_list(
                raw_values,
                limit=max(category_option_count, len(raw_values), 1),
            )
            if not values:
                raise AiChatRequestError("请至少选择一个正式类目")
            if question.get("answerType") != "multi_select" and len(values) != 1:
                raise AiChatRequestError("这个参数只能选择一个类目")
            max_selections = question.get("maxSelections")
            if (
                question.get("answerType") == "multi_select"
                and isinstance(max_selections, int)
                and not isinstance(max_selections, bool)
                and len(values) > max_selections
            ):
                raise AiChatRequestError(f"这个参数最多选择{max_selections}个类目")
            canonical_values: list[str] = []
            option_lookup: dict[str, str] = {}
            for option in question.get("options") or []:
                if isinstance(option, dict):
                    value = str(option.get("value", option.get("label", ""))).strip()
                    label = str(option.get("label", value)).strip()
                else:
                    value = label = str(option or "").strip()
                if value:
                    option_lookup[self._normalize_answer(value)] = label or value
                if label:
                    option_lookup[self._normalize_answer(label)] = label
            for value in values:
                canonical = option_lookup.get(self._normalize_answer(value), value)
                if canonical not in canonical_values:
                    canonical_values.append(canonical)
            updated = self._apply_question_values(
                current_intent,
                question,
                canonical_values,
            )
            if updated is None:
                raise AiChatRequestError("无法应用这个类目选择，请重新打开下拉框")
            return updated

        normalized_message = self._normalize_answer(message)
        for question in pending_questions:
            if not isinstance(question, dict):
                continue
            matched_option = None
            for option in question.get("options") or []:
                if isinstance(option, dict):
                    value = option.get("value", option.get("label", ""))
                    label = option.get("label", value)
                else:
                    value = label = option
                if normalized_message in {
                    self._normalize_answer(value),
                    self._normalize_answer(label),
                }:
                    matched_option = label or value
                    break
            if matched_option is None:
                continue
            return self._apply_question_values(
                current_intent,
                question,
                [str(matched_option)],
            )
        return None

    @staticmethod
    def _apply_question_values(
        current_intent: dict[str, Any],
        question: dict[str, Any],
        values: list[str],
    ) -> dict[str, Any] | None:
        updated = copy.deepcopy(current_intent)
        conditions = updated.get("conditions") or []
        by_id = {
            str(condition.get("id") or f"condition_{index + 1}"): condition
            for index, condition in enumerate(conditions)
            if isinstance(condition, dict)
        }
        targets = question.get("applyTargets") or [
            {
                "conditionId": question.get("conditionId"),
                "intentField": question.get("intentField") or question.get("field"),
            }
        ]
        changed = False
        for target in targets:
            if not isinstance(target, dict):
                continue
            condition = by_id.get(str(target.get("conditionId") or ""))
            intent_field = str(
                target.get("intentField") or target.get("field") or ""
            ).strip()
            if condition is None or not intent_field:
                continue
            condition[intent_field] = copy.deepcopy(values)
            changed = True
        return updated if changed else None

    @staticmethod
    def _normalize_solution_text(value: object) -> str:
        return re.sub(r"[^0-9a-z\u4e00-\u9fff]+", "", str(value or "").casefold())

    @staticmethod
    def _message_mentions_time(message: str) -> bool:
        compact = re.sub(r"\s+", "", str(message or ""))
        return bool(
            re.search(
                r"(?:\d{4}[-/.年]\d{1,2}|(?<!\d)(?:20)?\d{2}(?:0[1-9]|1[0-2])(?!\d)|(?:近|最近|过去|前|上|下|本|这|去|今)(?:\d+|一|两|半)?(?:天|日|周|个月|月|半年|年)|(?:\d+|一|两|半)(?:天|日|周|个月|月|年)|半年|统计时间|对比时间|日期|周期|至今|昨天|YTD|MTD)",
                compact,
                re.IGNORECASE,
            )
        )

    @staticmethod
    def _message_mentions_behavior(message: str) -> bool:
        """Recognize an explicit audience behavior without treating “看看” as browse."""

        compact = re.sub(r"\s+", "", str(message or ""))
        return bool(
            re.search(
                r"购买|买过|买了|下单|成交|浏览|看过|访问|收藏|加购|购物车|"
                r"预售|退款|退货|评论|搜索",
                compact,
                re.IGNORECASE,
            )
        )

    @classmethod
    def _ground_generic_user_fields(
        cls,
        intent: object,
        *,
        previous_intent: dict[str, Any] | None,
        message: str,
    ) -> object:
        """Remove model-invented behavior and time from free-form audiences.

        Values already confirmed on an earlier turn are preserved. New values
        are accepted only when the current user message actually supplies the
        corresponding concept.
        """

        if not isinstance(intent, dict):
            return intent
        grounded = copy.deepcopy(intent)
        previous_conditions = (
            previous_intent.get("conditions") or []
            if isinstance(previous_intent, dict)
            else []
        )
        message_has_time = cls._message_mentions_time(message)
        message_has_behavior = cls._message_mentions_behavior(message)
        for index, condition in enumerate(grounded.get("conditions") or []):
            if not isinstance(condition, dict):
                continue
            previous = (
                previous_conditions[index]
                if index < len(previous_conditions)
                and isinstance(previous_conditions[index], dict)
                else {}
            )
            if not message_has_time:
                previous_date_range = previous.get("dateRange")
                previous_recent_days = previous.get("recentDays")
                condition.pop("dateRange", None)
                condition.pop("recentDays", None)
                if (
                    isinstance(previous_date_range, list)
                    and len(previous_date_range) == 2
                ):
                    condition["dateRange"] = copy.deepcopy(previous_date_range)
                elif previous_recent_days not in (None, ""):
                    condition["recentDays"] = copy.deepcopy(previous_recent_days)
            if not message_has_behavior:
                previous_behaviors = previous.get("behaviors")
                condition.pop("behaviors", None)
                if isinstance(previous_behaviors, list) and previous_behaviors:
                    condition["behaviors"] = copy.deepcopy(previous_behaviors)
        return grounded

    @staticmethod
    def _message_mentions_comparison_time(message: str) -> bool:
        compact = re.sub(r"\s+", "", str(message or ""))
        if re.search(
            r"(?:对比|比较|环比|同比|对照|对比时间|对比期|旧周期|老周期|两个周期|两段时间|同期|去年|上年|上一年|前(?:\d+|一|两|半)?(?:天|日|周|个月|月|半年|年)|此前|之前)",
            compact,
            re.IGNORECASE,
        ):
            return True

        # Business-language requests often express the comparison without the
        # literal word “对比”, for example “2/24 到 3/8 买过，但 10/1 到
        # 11/11 没买过”. Two explicit date ranges are sufficient evidence that
        # the model's second period came from the user rather than a template.
        date_token = (
            r"(?:\d{4}(?:[-/.]\d{1,2}){1,2}"
            r"|\d{4}年\d{1,2}月(?:\d{1,2}日?)?"
            r"|\d{1,2}(?:[-/.]\d{1,2})"
            r"|\d{1,2}月\d{1,2}日?)"
        )
        explicit_ranges = re.findall(
            rf"{date_token}(?:到|至|~|～|-|—|–){date_token}", compact
        )
        return len(explicit_ranges) >= 2

    @staticmethod
    def _message_explicit_date_ranges(message: str) -> list[dict[str, object]]:
        """Extract complete calendar ranges while inheriting an omitted end year."""

        compact = re.sub(r"\s+", "", str(message or ""))
        pattern = re.compile(
            r"(?:(?P<start_year>(?:19|20)\d{2})(?:[-/.]|年))?"
            r"(?P<start_month>\d{1,2})(?:[-/.]|月)"
            r"(?P<start_day>\d{1,2})日?"
            r"(?:到|至|~|～|—|–|-)"
            r"(?:(?P<end_year>(?:19|20)\d{2})(?:[-/.]|年))?"
            r"(?P<end_month>\d{1,2})(?:[-/.]|月)"
            r"(?P<end_day>\d{1,2})日?"
        )
        ranges: list[dict[str, object]] = []
        for match in pattern.finditer(compact):
            start_year_text = match.group("start_year")
            if start_year_text:
                start_year = int(start_year_text)
            else:
                prefix = compact[max(0, match.start() - 8) : match.start()]
                year_offset = -2 if prefix.endswith("前年") else -1 if re.search(
                    r"(?:去年|上年)$", prefix
                ) else 0
                start_year = business_today().year + year_offset
            end_year_text = match.group("end_year")
            end_year = int(end_year_text) if end_year_text else start_year
            try:
                start = date(
                    start_year,
                    int(match.group("start_month")),
                    int(match.group("start_day")),
                )
                end = date(
                    end_year,
                    int(match.group("end_month")),
                    int(match.group("end_day")),
                )
                if end < start and not end_year_text:
                    end = date(
                        end_year + 1,
                        int(match.group("end_month")),
                        int(match.group("end_day")),
                    )
            except ValueError:
                continue
            ranges.append(
                {
                    "dateRange": [start.isoformat(), end.isoformat()],
                    "start": match.start(),
                    "end": match.end(),
                }
            )
        return ranges

    @classmethod
    def _message_solution_time_value(
        cls,
        message: str,
        parameter_name: str,
        *,
        time_parameter_count: int,
        pending_parameter: bool,
    ) -> object:
        ranges = cls._message_explicit_date_ranges(message)
        normalized_name = str(parameter_name or "").replace("周期", "时间")
        if not ranges:
            adjacent_days = cls._comparison_period_days(message)
            if adjacent_days is None or time_parameter_count < 2:
                return None
            if "统计时间" in normalized_name:
                return {"recentDays": adjacent_days}
            if "对比时间" in normalized_name:
                latest_date = latest_selectable_date()
                statistic_start = latest_date - timedelta(days=adjacent_days - 1)
                comparison_end = statistic_start - timedelta(days=1)
                comparison_start = comparison_end - timedelta(days=adjacent_days - 1)
                return {
                    "dateRange": [
                        comparison_start.isoformat(),
                        comparison_end.isoformat(),
                    ]
                }
            return None
        if len(ranges) == 1:
            only_range = ranges[0]
            compact = re.sub(r"\s+", "", str(message or ""))
            start = int(only_range["start"])
            nearby = compact[max(0, start - 16) : start]
            comparison_signal = bool(
                re.search(r"(?:对比|比较|旧|老|去年|上年|前期)", nearby)
            )
            statistic_signal = bool(
                re.search(r"(?:统计|当前|本期|新|今年)", nearby)
            )
            if time_parameter_count == 1 or pending_parameter:
                return {"dateRange": copy.deepcopy(only_range["dateRange"])}
            if "对比时间" in normalized_name and comparison_signal:
                return {"dateRange": copy.deepcopy(only_range["dateRange"])}
            if "统计时间" in normalized_name and statistic_signal:
                return {"dateRange": copy.deepcopy(only_range["dateRange"])}
            return None

        ordered = sorted(ranges, key=lambda item: tuple(item["dateRange"]))
        selected = ordered[0] if "对比时间" in normalized_name else ordered[-1]
        return {"dateRange": copy.deepcopy(selected["dateRange"])}

    @staticmethod
    def _named_business_period(message: str) -> str | None:
        compact = re.sub(r"\s+", "", str(message or "")).upper()
        matches = []
        patterns = (
            (
                "previous_ytd",
                r"(?:去年|上年|上一年|去年同期)(?:的)?YTD|YTD(?:的)?(?:去年|上年|上一年|去年同期)|去年年初至同期",
            ),
            (
                "previous_mtd",
                r"(?:去年|上年|上一年|去年同期)(?:的)?MTD|MTD(?:的)?(?:去年|上年|上一年|去年同期)|去年同月月初至同期",
            ),
            ("ytd", r"YTD|年初至今|本年累计|今年累计"),
            ("mtd", r"MTD|月初至今|本月累计"),
        )
        remaining = compact
        for period, pattern in patterns:
            if re.search(pattern, remaining, re.IGNORECASE):
                matches.append(period)
                remaining = re.sub(pattern, "", remaining, flags=re.IGNORECASE)
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _message_has_explicit_calendar_date(message: str) -> bool:
        return bool(
            re.search(
                r"(?:19|20)\d{2}(?:[-/.年])\d{1,2}(?:(?:[-/.月])\d{1,2}日?)?",
                str(message or ""),
            )
        )

    @staticmethod
    def _explicit_year_business_period(message: str) -> tuple[date, date] | None:
        """Resolve phrases such as ``2025年YTD截至8月底`` deterministically."""

        compact = re.sub(r"\s+", "", str(message or "")).upper()
        period_match = re.search(
            r"((?:19|20)\d{2})年?(?:的)?(YTD|MTD)", compact
        )
        if period_match is None:
            return None
        year = int(period_match.group(1))
        period = period_match.group(2)
        latest_date = latest_selectable_date()
        month = latest_date.month
        day = latest_date.day
        cutoff_match = re.search(
            r"(?:截至|截止|到)(\d{1,2})月(?:(\d{1,2})日|(底|末))?",
            compact[period_match.end() :],
        )
        if cutoff_match is not None:
            month = int(cutoff_match.group(1))
            if not 1 <= month <= 12:
                return None
            if cutoff_match.group(3):
                day = monthrange(year, month)[1]
            elif cutoff_match.group(2):
                day = int(cutoff_match.group(2))
            else:
                day = min(day, monthrange(year, month)[1])
        else:
            day = min(day, monthrange(year, month)[1])
        if not 1 <= day <= monthrange(year, month)[1]:
            return None
        end = date(year, month, day)
        start = end.replace(month=1, day=1) if period == "YTD" else end.replace(day=1)
        return start, end

    @classmethod
    def _apply_named_business_period(
        cls, intent: dict[str, Any], message: str
    ) -> None:
        conditions = [
            item for item in intent.get("conditions") or [] if isinstance(item, dict)
        ]
        if not conditions:
            return
        has_statistic_period = any(
            "统计时间" in str(item.get("displayName") or "") for item in conditions
        )
        has_comparison_period = any(
            "对比时间" in str(item.get("displayName") or "") for item in conditions
        )
        # A single shorthand must not silently make a two-period public solution
        # use the same range for both sides of the comparison.
        if has_statistic_period and has_comparison_period:
            return
        explicit_period = cls._explicit_year_business_period(message)
        if explicit_period is not None:
            start, end = explicit_period
        else:
            period = cls._named_business_period(message)
            if period is None or cls._message_has_explicit_calendar_date(message):
                return
            start, end = resolve_business_period(period)
        date_range = [start.isoformat(), end.isoformat()]
        for condition in conditions:
            condition["dateRange"] = copy.deepcopy(date_range)
            condition.pop("recentDays", None)

    @classmethod
    def _message_mentions_parameter_value(cls, message: str, value: object) -> bool:
        message_key = cls._normalize_solution_text(message)
        raw_values = value if isinstance(value, list) else [value]
        for raw in raw_values:
            text = str(raw or "").strip()
            if not text:
                continue
            leaf = text.split(">")[-1]
            candidates = [text, leaf, *leaf.replace("／", "/").split("/")]
            if any(
                len(candidate_key := cls._normalize_solution_text(candidate)) >= 2
                and candidate_key in message_key
                for candidate in candidates
            ):
                return True
        return False

    def _message_dimension_values(
        self, message: str, dimension_name: str
    ) -> list[str]:
        """Return live formal dimension values explicitly present in a message."""

        values = self.compiler.engine.dimensions.get(dimension_name) or []
        found = {
            str(value).strip()
            for value in values
            if str(value).strip()
            and str(value).strip() in message
            and not (
                dimension_name == "品牌维表.csv"
                and len(self._normalize_solution_text(value)) < 2
            )
        }
        return sorted(found, key=lambda value: message.find(value))

    @classmethod
    def _category_match_score(cls, message: str, formal_category: str) -> int:
        """Score an explicitly mentioned product type against one live category.

        A score is only produced when words from the formal leaf category really
        occur in the user's text. This deliberately does not use fuzzy spelling:
        a unique high-confidence match may be filled automatically, while close
        or ambiguous categories still go through the normal confirmation UI.
        """

        message_key = cls._normalize_solution_text(message)
        formal_text = str(formal_category or "").strip()
        if not message_key or not formal_text:
            return 0
        formal_key = cls._normalize_solution_text(formal_text)
        if formal_key and formal_key in message_key:
            return 10000 + len(formal_key)
        leaf = formal_text.split(">")[-1].strip()
        leaf_key = cls._normalize_solution_text(leaf)
        if len(leaf_key) >= 2 and leaf_key in message_key:
            return 8000 + len(leaf_key)
        aliases = re.split(r"[/／、|,，]+", leaf)
        matched_lengths = [
            len(alias_key)
            for alias in aliases
            if len(alias_key := cls._normalize_solution_text(alias)) >= 2
            and alias_key in message_key
        ]
        if not matched_lengths:
            return 0
        return 100 * max(matched_lengths) + sum(matched_lengths)

    def _infer_unique_live_category(self, text: str) -> str | None:
        """Return a live formal category only when the best semantic hit is unique."""

        values = self.compiler.engine.dimensions.get("类目维表.csv") or []
        scored = [
            (self._category_match_score(text, str(value)), str(value).strip())
            for value in values
        ]
        scored = [item for item in scored if item[0] > 0 and item[1]]
        if not scored:
            return None
        best_score = max(score for score, _ in scored)
        best = list(dict.fromkeys(value for score, value in scored if score == best_score))
        return best[0] if len(best) == 1 else None

    def _ground_live_category_intent(
        self, intent: object, message: str
    ) -> object:
        """Ground clear product words to a unique path in the live category table."""

        if not isinstance(intent, dict):
            return intent
        normalized = copy.deepcopy(intent)
        conditions = [
            item for item in normalized.get("conditions") or [] if isinstance(item, dict)
        ]
        if not conditions:
            return normalized
        live_values = {
            str(value).strip()
            for value in self.compiler.engine.dimensions.get("类目维表.csv") or []
            if str(value).strip()
        }
        message_match = self._infer_unique_live_category(message)
        for condition in conditions:
            categories = self._clean_string_list(condition.get("categories"), limit=10)
            if any(category in live_values for category in categories):
                continue
            category_hint = " ".join(categories)
            inferred = self._infer_unique_live_category(category_hint)
            if inferred is None and len(conditions) == 1:
                inferred = message_match
            if inferred is not None:
                condition["categories"] = [inferred]
        return normalized

    def _infer_official_store_brand(self, message: str) -> str | None:
        """Infer a configured brand only from an explicitly named official store."""

        message_key = self._normalize_solution_text(message)
        if not message_key:
            return None
        meta = self.compiler.engine.get_package_meta("商品行为")
        shop_field = next(
            (item for item in meta.get("schema", []) if item.get("key") == "shop"),
            {},
        )
        matches: list[tuple[int, str]] = []
        for option in shop_field.get("options") or []:
            label = str(
                option.get("label", option.get("value", ""))
                if isinstance(option, dict)
                else option
            ).strip()
            if not label or label == "全淘宝天猫":
                continue
            brand_prefix = re.split(r"官方旗舰店|旗舰店", label, maxsplit=1)[0].strip()
            if not brand_prefix:
                continue
            tokens = set(re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}", brand_prefix.casefold()))
            matched_lengths = [
                len(token)
                for token in tokens
                if self._normalize_solution_text(token) in message_key
            ]
            if matched_lengths:
                matches.append((max(matched_lengths), brand_prefix))
        if not matches:
            return None
        best_score = max(score for score, _ in matches)
        best = list(
            dict.fromkeys(brand for score, brand in matches if score == best_score)
        )
        return best[0] if len(best) == 1 else None

    @staticmethod
    def _explicit_brand_account_access(message: str) -> bool | None:
        """Read explicit permission language without treating “官旗” as permission."""

        compact = re.sub(r"\s+", "", str(message or "")).casefold()
        if re.search(
            r"(?:不能|不可以|不可|无法|没有|没|无)(?:使用|用|登录|登陆|访问|操作)?(?:[^，。；,;]{0,10})(?:账号|官旗|官方旗舰店|数据引擎|权限)",
            compact,
        ) or re.search(
            r"(?:账号|官旗|官方旗舰店|数据引擎)(?:[^，。；,;]{0,10})(?:不能|不可以|不可|无法|没有权限|无权限)",
            compact,
        ):
            return False
        if re.search(
            r"(?:可以|可|能|能够|有权|有权限|已登录|已登陆)(?:使用|用|登录|登陆|访问|操作)?(?:[^，。；,;]{0,10})(?:账号|官旗|官方旗舰店|数据引擎|权限)",
            compact,
        ) or re.search(
            r"(?:账号|官旗|官方旗舰店|数据引擎)(?:[^，。；,;]{0,10})(?:可以使用|可使用|能使用|可登录|能登录|有权限|已登录|已登陆)",
            compact,
        ):
            return True
        return None

    def _ground_official_store_intent(
        self, intent: object, message: str
    ) -> object:
        """Make “官旗” a deterministic Tmall store-level signal.

        The target account can be inferred from live configuration, but access is
        never inferred from the store mention itself.
        """

        if not isinstance(intent, dict) or not re.search(r"官旗|官方旗舰店", message):
            return intent
        normalized = copy.deepcopy(intent)
        conditions = [
            item for item in normalized.get("conditions") or [] if isinstance(item, dict)
        ]
        if not conditions:
            return normalized
        brand_hint = self._infer_official_store_brand(message)
        access = self._explicit_brand_account_access(message)
        for condition in conditions:
            component = str(condition.get("component") or "").strip()
            if component == "关键词搜索" or not condition.get("behaviors"):
                continue
            if component not in {
                "",
                "类目公域行为",
                "类目商品行为",
                "商品行为",
            }:
                continue
            condition["component"] = "商品行为"
            condition["scope"] = "own_store"
            condition["channels"] = ["天猫"]
            if not str(condition.get("brand") or "").strip():
                brands = self._clean_string_list(condition.get("brands"), limit=1)
                if brands:
                    condition["brand"] = brands[0]
                elif brand_hint:
                    condition["brand"] = brand_hint
            condition.pop("brands", None)
            if access is not None:
                condition["canUseBrandAccount"] = access
            elif "canUseBrandAccount" not in condition:
                condition["canUseBrandAccount"] = None
        return normalized

    def _ground_channel_aggregate_intent(
        self, intent: object, message: str
    ) -> object:
        """Keep named platform channels at brand aggregate unless a store is named."""

        if not isinstance(intent, dict):
            return intent
        aggregate_channels = ("天猫国际自营", "天猫国际直营", "天猫国际", "全球购", "淘宝集市")
        if not any(channel in message for channel in aggregate_channels):
            return intent
        if re.search(r"官旗|官方旗舰店|自店|本店|店铺账号|指定账号", message):
            return intent
        normalized = copy.deepcopy(intent)
        for condition in normalized.get("conditions") or []:
            if not isinstance(condition, dict):
                continue
            channels = self._clean_string_list(condition.get("channels"), limit=1)
            if str(condition.get("component") or "").strip() != "商品行为":
                continue
            if not any(channel in aggregate_channels for channel in channels):
                continue
            # 历史包名使用“天猫国际自营”，实时维表的正式选项是“天猫国际直营”。
            condition["channels"] = [
                "天猫国际直营" if channel == "天猫国际自营" else channel
                for channel in channels
            ]
            condition["scope"] = "own_brand"
            condition.pop("canUseBrandAccount", None)
        return normalized

    def _message_brand_core_categories(self, message: str) -> list[str]:
        marker = re.search(r"(?:品牌|本牌)?核心(?:类目|品类|范围)", message)
        if marker is None:
            return []
        segment = message[marker.end() :]
        boundary = re.search(
            r"(?:[，,；;。]\s*)(?:统计(?:时间|期)|新周期|今年|近期|分析(?:类目|品类)|目标(?:类目|品类)|品牌(?:选|是|为))",
            segment,
        )
        if boundary is not None:
            segment = segment[: boundary.start()]
        return self._message_dimension_values(segment, "类目维表.csv")

    def _solution_primary_brand(
        self,
        conditions: list[dict[str, Any]],
        message: str,
    ) -> str | None:
        """Find one brand for store-profile lookup without inventing a role."""

        live_brands = [
            str(value).strip()
            for value in self.compiler.engine.dimensions.get("品牌维表.csv") or []
            if str(value).strip()
        ]
        live_message_brands = self._message_dimension_values(message, "品牌维表.csv")
        if len(live_message_brands) == 1:
            return live_message_brands[0]
        store_profile = self.solution_knowledge.find_unique_brand_core_profile_in_text(
            message
        )
        if store_profile is not None:
            return str(
                store_profile.get("normalizedStoreName")
                or store_profile.get("storeName")
                or ""
            ).strip() or None
        candidates: list[str] = []
        for condition in conditions:
            raw_values = [condition.get("brand"), *(condition.get("brands") or [])]
            for raw_value in raw_values:
                value = str(raw_value or "").strip()
                if value and value not in candidates:
                    candidates.append(value)
        if len(candidates) != 1:
            return None
        # Models and users often use a short alias such as ``CPB`` while the
        # live dimension and store profile use ``CPB/肌肤之钥``.  Resolve the
        # alias before looking up the 95% sales profile; otherwise the brand
        # core category parameter remains empty and gets asked repeatedly.
        return self._canonical_live_brand(candidates[0], live_brands) or candidates[0]

    @classmethod
    def _canonical_live_brand(
        cls, raw_brand: object, live_brands: list[str]
    ) -> str | None:
        raw_key = cls._normalize_solution_text(raw_brand)
        if not raw_key:
            return None
        for live_brand in live_brands:
            live_key = cls._normalize_solution_text(live_brand)
            if raw_key in live_key or live_key in raw_key:
                return live_brand
        return None

    def _solution_brand_roles(
        self,
        solution_name: str,
        incoming_conditions: list[dict[str, Any]],
        message: str,
    ) -> dict[str, list[str]]:
        if solution_name not in {
            "共同浏览后_购买本品",
            "共同浏览后_购买竞品",
        }:
            return {}
        live_brands = self._message_dimension_values(message, "品牌维表.csv")
        if len(live_brands) < 2:
            return {}
        purchased_brand = None
        for condition in incoming_conditions:
            if "购买" not in (condition.get("behaviors") or []):
                continue
            for raw_brand in condition.get("brands") or []:
                purchased_brand = self._canonical_live_brand(raw_brand, live_brands)
                if purchased_brand:
                    break
            if purchased_brand:
                break
        if not purchased_brand:
            return {}
        other_brand = next(
            (brand for brand in live_brands if brand != purchased_brand), None
        )
        if not other_brand:
            return {}
        if solution_name == "共同浏览后_购买竞品":
            return {"本品牌": [other_brand], "竞品": [purchased_brand]}
        return {"本品牌": [purchased_brand], "竞品": [other_brand]}

    def _match_public_solution(
        self, intent: object, message: str = ""
    ) -> dict[str, Any] | None:
        normalized_intent = intent if isinstance(intent, dict) else {}
        requested_solution_id = str(
            normalized_intent.get("solutionId") or ""
        ).strip()
        audience_key = self._normalize_solution_text(
            normalized_intent.get("audienceName")
        )
        message_key = self._normalize_solution_text(message)
        solutions = self.solution_knowledge.list_summaries()
        by_name = {str(item.get("name") or ""): item for item in solutions}
        semantic_override = None
        if any(
            signal in message_key
            for signal in ("竞品流失", "被竞品抢走", "最后买竞品", "购买竞品", "竞品成交")
        ):
            semantic_override = "共同浏览后_购买竞品"
        elif any(
            signal in message_key
            for signal in ("最后买本品", "购买本品", "本品成交", "最终买本品牌")
        ):
            semantic_override = "共同浏览后_购买本品"
        elif any(signal in message_key for signal in ("流出人群", "圈流失", "用户流失", "流出分析")):
            semantic_override = "流出人群分析"
        elif any(signal in message_key for signal in ("流入人群", "圈流入", "用户流入", "流入分析")):
            semantic_override = "流入人群分析"
        elif (
            any(signal in message_key for signal in ("交叉购买", "品类连带分析", "类目连带分析"))
            or (
                "同时买" in message_key
                and any(signal in message_key for signal in ("人里", "还有谁", "还买了", "也买了"))
            )
        ):
            semantic_override = "品类连带分析"
        elif any(signal in message_key for signal in ("跨品类拉新", "跨类目拉新", "其他品类招来")):
            semantic_override = "跨品类招新方向分析"
        elif any(signal in message_key for signal in ("转牌新客", "转牌拉新", "从别的牌子转来")):
            semantic_override = "转牌新客"
        elif any(signal in message_key for signal in ("品类新客", "类目新客", "品类拉新", "类目拉新")):
            semantic_override = "品类新客"
        elif any(signal in message_key for signal in ("同品类复购", "同类目复购", "复购人群", "两个周期都买过")):
            semantic_override = "同品类复购"
        elif any(signal in message_key for signal in ("品牌老客", "品牌存量老客", "本牌老客")):
            semantic_override = "品牌老客"
        elif "连带购买" in message_key:
            semantic_override = "连带购买"
        elif any(signal in message_key for signal in ("最后买", "最终买", "后来买", "最后购买", "最终购买")):
            live_brands = self._message_dimension_values(message, "品牌维表.csv")
            purchase_tail = re.split(
                r"(?:最后|最终|后来)(?:购买|买了|买|下单)?", message, maxsplit=1
            )
            tail = purchase_tail[1] if len(purchase_tail) > 1 else ""
            purchased_brand = next(
                (brand for brand in live_brands if brand and brand in tail), None
            )
            if len(live_brands) >= 2 and purchased_brand:
                semantic_override = (
                    "共同浏览后_购买本品"
                    if purchased_brand == live_brands[0]
                    else "共同浏览后_购买竞品"
                )
        elif (
            any(
                signal in message_key
                for signal in (
                    "同时浏览",
                    "共同浏览",
                    "都浏览",
                    "都看过",
                    "同时看过",
                )
            )
            or (
                any(signal in message_key for signal in ("既浏览", "既看过"))
                and any(signal in message_key for signal in ("又浏览", "也浏览", "又看过", "也看过"))
            )
        ) and not any(signal in message_key for signal in ("购买", "成交", "下单")):
            semantic_override = "共同浏览本品和竞品"
        # A model-selected ID is unambiguous and must win before fuzzy name
        # matching.  Otherwise an audience such as “A与B连带购买人群” can match
        # the public solution named “连带购买” before we reach the intended
        # “品类连带分析” record later in the catalog.
        if requested_solution_id:
            for solution in solutions:
                if requested_solution_id == str(solution.get("id") or "").strip():
                    if semantic_override and semantic_override != str(
                        solution.get("name") or ""
                    ):
                        return by_name.get(semantic_override, solution)
                    return solution
        for solution in solutions:
            solution_key = self._normalize_solution_text(solution.get("name"))
            if not solution_key:
                continue
            if (
                audience_key == solution_key
                or solution_key in audience_key
                or solution_key in message_key
            ):
                return solution
        if semantic_override:
            return by_name.get(semantic_override)
        return None

    @staticmethod
    def _condition_parameter_value(
        condition: dict[str, Any], target_field: str
    ) -> object:
        if target_field == "timeWindow":
            date_range = condition.get("dateRange")
            if isinstance(date_range, list) and len(date_range) == 2:
                return {"dateRange": copy.deepcopy(date_range)}
            if condition.get("recentDays") not in (None, ""):
                return {"recentDays": condition.get("recentDays")}
            return None
        value = condition.get(target_field)
        if value in (None, "", [], {}):
            return None
        return copy.deepcopy(value)

    @staticmethod
    def _set_condition_parameter(
        condition: dict[str, Any], target_field: str, value: object
    ) -> None:
        if target_field == "timeWindow":
            condition.pop("recentDays", None)
            condition.pop("dateRange", None)
            if isinstance(value, dict):
                if value.get("dateRange") is not None:
                    condition["dateRange"] = copy.deepcopy(value["dateRange"])
                elif value.get("recentDays") is not None:
                    condition["recentDays"] = value["recentDays"]
            return
        if value in (None, "", [], {}):
            condition.pop(target_field, None)
        else:
            condition[target_field] = copy.deepcopy(value)

    @classmethod
    def _message_labeled_category_value(
        cls,
        message: str,
        parameter_name: str,
        candidates: list[object],
    ) -> object:
        """Resolve explicit A/B category labels independently of mention order."""

        normalized_name = str(parameter_name or "").replace("品类", "类目")
        if "本类目" in normalized_name:
            labels = ("A类目", "本类目", "目标类目")
        elif "对比类目" in normalized_name:
            labels = ("B类目", "对比类目", "关联类目", "连带类目")
        else:
            return None

        normalized_message = str(message or "").replace("品类", "类目")
        label_pattern = "|".join(re.escape(label) for label in labels)
        label_match = re.search(label_pattern, normalized_message, flags=re.IGNORECASE)
        if label_match is None:
            return None

        segment = normalized_message[label_match.end() :]
        next_label = re.search(
            r"(?:与|和|、)?\s*(?:A类目|B类目|本类目|目标类目|对比类目|关联类目|连带类目)",
            segment,
            flags=re.IGNORECASE,
        )
        if next_label is not None:
            segment = segment[: next_label.start()]
        segment = re.split(r"[，,；;。]", segment, maxsplit=1)[0]

        best_value: object = None
        best_score = -1
        for candidate in candidates:
            for category in cls._clean_string_list(candidate):
                leaf_name = category.rsplit(">", 1)[-1].strip()
                score = -1
                if category and category in segment:
                    score = 1000 + len(category)
                elif leaf_name and leaf_name in segment:
                    score = len(leaf_name)
                if score > best_score:
                    best_value = candidate
                    best_score = score
        return copy.deepcopy(best_value) if best_score >= 0 else None

    @staticmethod
    def _pending_question_names_parameter(
        pending_questions: list[dict[str, Any]], parameter_name: str
    ) -> bool:
        parameter_key = str(parameter_name or "").replace("品类", "类目")
        # The conversational reply always presents the first unresolved
        # question. A later question in the same plan must not steal the
        # user's short answer (for example, “乳液/面霜” belongs to 分析类目,
        # not the following 品牌核心类目 question).
        for question in pending_questions[:1]:
            prompt = str(question.get("prompt") or "").replace("品类", "类目")
            if parameter_key and parameter_key in prompt:
                return True
        return False

    def _ground_public_solution_intent(
        self,
        intent: object,
        solution: dict[str, Any],
        *,
        previous_intent: dict[str, Any] | None,
        message: str,
        pending_questions: list[dict[str, Any]],
    ) -> object:
        """Lock a named public solution to its real nodes while keeping user values."""

        if not isinstance(intent, dict):
            return intent
        template_nodes = [
            item for item in solution.get("nodes") or [] if isinstance(item, dict)
        ]
        if not template_nodes:
            return intent
        incoming_conditions = [
            item for item in intent.get("conditions") or [] if isinstance(item, dict)
        ]
        previous_conditions = [
            item
            for item in (previous_intent or {}).get("conditions") or []
            if isinstance(item, dict)
        ]
        grounded = copy.deepcopy(intent)
        solution_name = str(solution.get("name") or "").strip()
        brand_roles = self._solution_brand_roles(
            solution_name, incoming_conditions, message
        )
        message_core_categories = self._message_brand_core_categories(message)
        grounded_conditions: list[dict[str, Any]] = []
        for index, template in enumerate(template_nodes):
            condition = copy.deepcopy(
                incoming_conditions[index] if index < len(incoming_conditions) else {}
            )
            condition["id"] = str(condition.get("id") or f"solution_condition_{index + 1}")
            condition["displayName"] = str(template.get("displayName") or "").strip()
            condition["component"] = str(template.get("component") or "").strip()
            relation = str(template.get("relation") or "start")
            if index == 0 or relation == "start":
                condition.pop("relation", None)
            else:
                condition["relation"] = relation
            for field, value in (template.get("fixedIntent") or {}).items():
                condition[str(field)] = copy.deepcopy(value)
            grounded_conditions.append(condition)

        primary_brand = self._solution_primary_brand(grounded_conditions, message)
        automatic_core_categories = (
            self.solution_knowledge.brand_core_categories(primary_brand)
            if primary_brand
            else []
        )

        parameter_bindings: dict[str, list[tuple[int, str]]] = {}
        for index, template in enumerate(template_nodes):
            for binding in template.get("parameterBindings") or []:
                if not isinstance(binding, dict):
                    continue
                name = str(binding.get("parameter") or "").strip()
                target_field = str(binding.get("targetField") or "").strip()
                if name and target_field:
                    parameter_bindings.setdefault(name, []).append((index, target_field))

        category_candidates = [
            condition.get("categories")
            for condition in grounded_conditions
            if isinstance(condition.get("categories"), list)
            and condition.get("categories")
        ]
        time_parameter_count = sum(
            1
            for bindings in parameter_bindings.values()
            if any(field == "timeWindow" for _, field in bindings)
        )

        resolved_parameter_values: dict[str, object] = {}
        for parameter_name, bindings in parameter_bindings.items():
            incoming_value = next(
                (
                    self._condition_parameter_value(grounded_conditions[index], field)
                    for index, field in bindings
                    if self._condition_parameter_value(grounded_conditions[index], field)
                    is not None
                ),
                None,
            )
            previous_value = next(
                (
                    self._condition_parameter_value(previous_conditions[index], field)
                    for index, field in bindings
                    if index < len(previous_conditions)
                    and self._condition_parameter_value(previous_conditions[index], field)
                    is not None
                ),
                None,
            )
            normalized_parameter_name = parameter_name.replace("品类", "类目")
            is_analysis_category = "分析类目" in normalized_parameter_name
            is_brand_core_category = "品牌核心类目" in normalized_parameter_name
            is_time_parameter = any(field == "timeWindow" for _, field in bindings)
            labeled_category_value = self._message_labeled_category_value(
                message,
                normalized_parameter_name,
                category_candidates,
            )
            explicit_time_value = (
                self._message_solution_time_value(
                    message,
                    normalized_parameter_name,
                    time_parameter_count=time_parameter_count,
                    pending_parameter=self._pending_question_names_parameter(
                        pending_questions, parameter_name
                    ),
                )
                if is_time_parameter
                else None
            )
            if explicit_time_value is not None:
                selected_value = explicit_time_value
            elif labeled_category_value is not None:
                selected_value = labeled_category_value
            elif is_time_parameter:
                # Public-solution dates are variables, never defaults. A model
                # must not copy or invent the template's example date when the
                # user has not supplied a period in this or an earlier turn.
                is_comparison_parameter = "对比时间" in normalized_parameter_name
                message_supplies_this_period = (
                    self._message_mentions_comparison_time(message)
                    if is_comparison_parameter
                    else self._message_mentions_time(message)
                )
                selected_value = previous_value or (
                    incoming_value if message_supplies_this_period else None
                )
            elif is_analysis_category:
                explicitly_supplied = (
                    "分析类目" in message.replace("品类", "类目")
                    or self._pending_question_names_parameter(
                        pending_questions, parameter_name
                    )
                    or self._message_mentions_parameter_value(message, incoming_value)
                )
                selected_value = previous_value or (
                    incoming_value if explicitly_supplied else None
                )
            elif is_brand_core_category:
                explicitly_supplied = (
                    "品牌核心类目" in message.replace("品类", "类目")
                    or "核心类目" in message.replace("品类", "类目")
                    or "核心范围" in message.replace("品类", "类目")
                    or self._pending_question_names_parameter(
                        pending_questions, parameter_name
                    )
                    and self._comparison_period_days(message) is None
                )
                # A brand's real core-category list may legitimately include the
                # analysis category. Once the user has confirmed that parameter,
                # preserve it across later turns instead of treating equality as
                # evidence that the model copied the wrong field.
                selected_value = previous_value or (
                    message_core_categories
                    if explicitly_supplied and message_core_categories
                    else incoming_value
                    if explicitly_supplied
                    else automatic_core_categories or None
                )
            elif normalized_parameter_name in brand_roles:
                selected_value = copy.deepcopy(
                    brand_roles[normalized_parameter_name]
                )
            else:
                selected_value = incoming_value or previous_value
            resolved_parameter_values[parameter_name] = copy.deepcopy(selected_value)
            for index, target_field in bindings:
                self._set_condition_parameter(
                    grounded_conditions[index], target_field, selected_value
                )

        grounded["conditions"] = grounded_conditions
        return grounded

    @staticmethod
    def _comparison_period_days(message: str) -> int | None:
        compact = re.sub(r"\s+", "", str(message or ""))
        if re.search(r"(?:近|最近)半年(?:对比|比较|环比)(?:前|之前|再前)半年", compact):
            return 180
        match = re.search(
            r"(?:近|最近)(\d{1,4})天(?:对比|比较|环比)(?:前|之前|再前)(\d{1,4})天",
            compact,
        )
        if match and match.group(1) == match.group(2):
            return int(match.group(1))
        return None

    @classmethod
    def _apply_adjacent_comparison_period(
        cls, intent: dict[str, Any], message: str
    ) -> None:
        days = cls._comparison_period_days(message)
        if days is None:
            return
        latest_date = latest_selectable_date()
        current_start = latest_date - timedelta(days=days - 1)
        comparison_end = current_start - timedelta(days=1)
        comparison_start = comparison_end - timedelta(days=days - 1)
        for condition in intent.get("conditions") or []:
            if not isinstance(condition, dict):
                continue
            display_name = str(condition.get("displayName") or "")
            if "统计时间" in display_name:
                condition["recentDays"] = days
                condition.pop("dateRange", None)
            elif "对比时间" in display_name:
                condition["dateRange"] = [
                    comparison_start.isoformat(),
                    comparison_end.isoformat(),
                ]
                condition.pop("recentDays", None)

    @classmethod
    def _normalize_model_intent(cls, intent: object, message: str = "") -> object:
        """Resolve harmless mutually-exclusive time noise from model output."""

        if not isinstance(intent, dict):
            return intent
        normalized = copy.deepcopy(intent)
        today = business_today()
        latest_date = latest_selectable_date()
        for condition in normalized.get("conditions") or []:
            if not isinstance(condition, dict) or "dateRange" not in condition:
                continue
            date_range = condition.get("dateRange")
            if isinstance(date_range, list) and not any(
                str(item or "").strip() for item in date_range
            ):
                condition.pop("dateRange", None)
            elif isinstance(date_range, list) and len(date_range) == 2:
                # A concrete absolute range is more specific than a duplicated
                # recentDays value and therefore wins deterministically.
                condition.pop("recentDays", None)
                try:
                    start = date.fromisoformat(str(date_range[0]))
                    end = date.fromisoformat(str(date_range[1]))
                except ValueError:
                    continue
                # Models commonly interpret “至今” as an inclusive currentDate.
                # The engine only has complete data through yesterday, so an
                # otherwise valid boundary equal to today is safely shifted back.
                if start == today and end == today:
                    condition["dateRange"] = [
                        latest_date.isoformat(),
                        latest_date.isoformat(),
                    ]
                elif end == today and start <= latest_date:
                    condition["dateRange"][1] = latest_date.isoformat()
        cls._apply_adjacent_comparison_period(normalized, message)
        cls._apply_named_business_period(normalized, message)
        return normalized

    @staticmethod
    def _estimate_tokens(text: str) -> int:
        ascii_count = sum(1 for char in text if ord(char) < 128)
        non_ascii_count = len(text) - ascii_count
        return max(1, (ascii_count + 3) // 4 + non_ascii_count)

    def _normalize_history(
        self,
        history: Any,
        token_budget: int,
    ) -> list[dict[str, str]]:
        if not isinstance(history, list):
            return []
        normalized: list[dict[str, str]] = []
        remaining_tokens = max(0, int(token_budget))
        for item in reversed(history[-MAX_HISTORY_ITEMS:]):
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = str(item.get("content") or "").strip()
            if role not in {"user", "assistant"} or not content:
                continue
            if remaining_tokens <= 0:
                break
            estimated_tokens = self._estimate_tokens(content)
            if estimated_tokens > remaining_tokens:
                keep_ratio = remaining_tokens / estimated_tokens
                keep_chars = max(1, int(len(content) * keep_ratio))
                content = content[-keep_chars:]
                estimated_tokens = self._estimate_tokens(content)
            normalized.append({"role": role, "content": content})
            remaining_tokens -= estimated_tokens
        normalized.reverse()
        return normalized

    def _build_system_prompt(
        self,
        message: str = "",
        current_workflow: dict[str, Any] | None = None,
    ) -> str:
        catalog = self.catalog.get_catalog()
        schema = self.compiler.get_schema()
        solution_catalog = self.solution_knowledge.get_prompt_catalog(message)
        system_catalog = self.system_knowledge.get_prompt_catalog(
            message, current_workflow
        )
        catalog_text = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
        schema_text = json.dumps(schema, ensure_ascii=False, separators=(",", ":"))
        solution_catalog_text = json.dumps(
            solution_catalog, ensure_ascii=False, separators=(",", ":")
        )
        system_catalog_text = json.dumps(
            system_catalog, ensure_ascii=False, separators=(",", ":")
        )
        dmp_tag_catalog_text = json.dumps(
            self._load_dmp_tag_catalog(), ensure_ascii=False, separators=(",", ":")
        )
        return f"""你是CDP自然语言圈包执行规划器。你负责理解用户表达、遵守系统能力的适用边界并输出结构化意图；绝不直接编造工作台节点或DMP JSON，节点仍由后端权威编译器生成。

必须输出一个JSON对象，包含三个顶层字段：
1. assistantMessage：简短、自然的中文回复，最多70个汉字；不要复述长人群名、长方案名或完整参数列表；
2. intent：完整的圈包意图对象；尚无法形成任何圈包条件，或本轮属于专用系统操作时可为null；
3. operation：需要真实调用系统功能时输出受控操作对象，否则为null。

关键规则：
- 每次都基于currentIntent返回更新后的完整意图，不要只返回本轮增量。
- pendingQuestions表示后端权威校验需要用户补充的问题；用户本轮回答时，把答案写回对应conditionId和意图字段。如果问题包含applyTargets，必须把同一个答案同步写回其中每个目标的intentField（没有intentField时才使用field）。
- 只有用户明确表达“自店/本店”或“本品牌且指定商品ID”时才尝试商品行为。
- 商品行为必须有品牌，并且canUseBrandAccount只可依据用户对当前账号登录权限的明确回答填写；未知用null，绝不猜测。
- 用户只提供商品ID但没有可用品牌账号时，使用类目商品行为直接按ID筛选，不叠加类目公域行为。
- recentDays和dateRange严格二选一；使用固定日期时不得同时输出recentDays。
- 数据统计永远截止到昨天，今天不可选且不得出现在任何dateRange中。recentDays表示以latestSelectableDate为结束日向前计算的完整天数。
- “近N天”用recentDays=N；“近半年”默认按180个完整天计算，只有用户明确说“完整月”时才按自然月。
- YTD表示从latestSelectableDate所在年份的1月1日到latestSelectableDate；去年YTD表示上一年1月1日到latestSelectableDate的去年同月同日。MTD表示latestSelectableDate所在月份1日到latestSelectableDate；去年MTD表示上一年同月1日到去年同期日。默认截止日永远是昨天；用户明确给出固定起止日期时固定日期优先。
- “近N天对比前N天”或“近半年对比前半年”必须生成两个连续且等长的周期：统计时间截止latestSelectableDate，对比时间截止在统计时间开始日的前一天；不得把两个周期写成相同日期。公共方案中“统计时间”使用近期周期，“对比时间”使用紧邻的前一周期。
- 用户只说“本品牌/我们的品牌”、没有自店且没有商品ID时，scope用own_brand，由后端选择类目公域行为。
- 有商品ID但无自店要求时保留productIds，由后端选择类目商品行为。
- 同一条件多个行为默认behaviorMatch=any，表示同节点并集；用户明确说“都/既…又…”时用all，后端会拆节点取交集。
- 条件之间的“且/并且”为intersect，“或”为union，“排除/不要”为exclude。
- 不推断L1-L5、城市等级等业务方向；用户说什么值就保留什么值，不知道就让后端追问。
- 不编造品牌、类目、渠道、账号和组件参数。保留用户原话，后端会用实时配置校验。
- 用户说出清晰商品类型或商品名时（例如“唇釉”），先在实时类目维表中寻找最具体的正式路径；只有一个高置信候选时直接写入categories，存在多个同等合理候选时才追问用户。
- 用户未指定销售渠道时，默认channels=["天猫"]；只有用户明确指定其他渠道或“所有销售渠道”时才改变。
- 只有“关键词搜索”和“商品行为”属于私域圈包行为，结果人数可以精确到个位数；“类目公域行为”属于公域，人数小于2000不展示具体值且人数按千为单位展示。
- 关键词搜索只表示平台首页的精准搜索，不包含购物车搜索或店铺内搜索；它圈出搜索词触达品牌且属于品牌历史AIPL资产的人群，不要再额外添加AIPL节点。
- 用户同时要求“搜索某关键词”与浏览、购买等商品行为时，一般生成“关键词搜索”与“商品行为”两个节点并取交集。搜索词写入searchKeywords；商品标题词才写入titleKeywords。
- 上述交集结构适用于商品行为的全部六种行为：浏览、收藏、加购、预售、购买、退款。必须保留用户说出的行为：看过/浏览→浏览，收藏过→收藏，加购物车/加购→加购，预售/预购→预售，买过/购买/成交→购买，退款/退货退款→退款；不要一律改成浏览或购买。用户没有指定商品类目或商品ID时，不要猜类目，商品行为按全部商品生成cate=ALL。
- 已确认的人群包命名系列“2025年9月第1周搜索迪奥{{行为}}”表示：2025-09-01至2025-09-07首页精准搜索“迪奥”的人，与天猫DIOR迪奥官方旗舰店对全部商品发生该行为的人取交集；{{行为}}可为浏览、收藏、加购、预售、购买、退款。未说明当前用户能使用官旗账号时canUseBrandAccount=null并询问，明确能使用时才为true。
- 商品行为选择“所有销售渠道”时，表示当前品牌在天猫、淘宝、国际等全部可用销售渠道的私域汇总数据；它仍是品牌数据，不是公域数据，但不选择单一店铺账号，也不询问具体店铺账号登录权限。即使搜索词里出现Dior等品牌，也不把该品牌绑定成商品行为的单店账号。
- 商品行为选择支持账号的具体渠道并选中账号时，数据范围是该店铺，而不是整个品牌的跨渠道汇总；此时才执行品牌、店铺账号和当前用户登录权限校验。
- 用户说“官旗”或“官方旗舰店”时，这是明确的店铺级信号：对应条件必须使用component="商品行为"、scope="own_store"、channels=["天猫"]，并用用户点名的品牌解析实时账号库中的对应官方旗舰店。不能改成“所有销售渠道”。“官旗”只表示目标店铺，不代表当前用户有权限；只有用户明确说能使用、能登录或有权限时canUseBrandAccount=true，明确说不能时为false，未说明时为null并询问。
- 用户明确说全球购、天猫国际自营（实时维表正式名为“天猫国际直营”）、天猫国际或淘宝集市，但没有说官旗、自店、店铺账号或指定账号时，商品行为表示该渠道下的品牌级汇总：component="商品行为"、scope="own_brand"，后端使用shop=ALL，不绑定具体店铺，也不询问品牌账号权限。输出channels时把“天猫国际自营”规范成["天猫国际直营"]。只有明确点名具体店铺时才进入店铺账号校验。
- 用户点名公共方案或表达与方案含义高度一致时，按照公共方案知识中的节点结构生成conditions。fixedIntent中的行为属于方案定义，不要再次追问。
- 品类新客、品类老客等方案的“品牌核心类目”由系统读取店铺销售趋势报表自动填充：按当前销售额从高到低累计，包含首次达到或超过整店95%的临界二级类目。你不得把分析类目复制成品牌核心类目，也不要在知识已命中时要求用户手工选择。
- 品牌核心类目总数不限，单个组件最多承载10项。超过10项时不得提前截断：先完成品牌、分析类目、行为、渠道、日期等其余参数；其余参数齐全后，再让用户通过工作台的“确认拆分”执行最后一步，自动拆成多个组件且每个组件必须继承已完成的全部参数。
- intent.solutionId是公共方案语义分类结果：高度匹配时必须逐字复制方案id；audienceName只是用户可读的人群名称，两者用途不同。不能因为用户没说方案名、换了说法或自定义了人群名就省略solutionId。
- 命中公共方案后必须先锁定该方案的canonicalOrder，再把用户参数填入parameterBindings。即使用户先说旧周期、先说成交、先说B类目，也不得据此颠倒统计期/对比期、浏览/购买或A/B节点。
- “统计期/新周期/今年/近期”对应统计时间；“对比期/老周期/去年/过去”对应对比时间。只给出两个周期且未贴标签时，较晚周期作为统计时间、较早周期作为对比时间。
- 本品牌与竞品按用户表达的角色绑定，不能按出现先后交换；“最终买本品/竞品”只决定购买节点的品牌，不改变模板中浏览节点在前、购买节点在后的顺序。
- 必须先理解“系统功能执行目录”再解析意图：单人群自由搭建、多商品ID拆分、单参数多包、方案复用、拉力方案组、组合参数批量、达摩盘画像是不同流程，不能相互混用。
- 用户要求多个品牌或多组参数“分别/每个”生成人群包时，不得把它们当成同一个人群内的并集。conditions只描述一个代表性基础人群，其余按行展开由系统批量能力处理。
- 多个商品ID如果属于同一个人群，则使用类目商品行为拆成多个并集节点；这和“每个ID分别生成一个人群包”是两种需求，表达不清时必须追问。
- 教程中的步骤、前置条件和限制是系统真实执行规则；示例品牌、商品ID、人群名和日期只是教学示例，不得复制到用户意图。
- 达摩盘批量画像/横向对比使用operation，不要把它伪装成普通圈包intent。operation固定为：{{"action":"prepare_dmp_batch_profile","crowdNames":["准确的人群包名称"],"tagIds":["从实时目录选择的正式ID"],"tagNames":["与ID一致的正式名称"],"comparisonMetrics":["人群占比","Rebase"],"tagSelectionConfirmed":false,"loginConfirmed":false,"userConfirmed":false,"autoOpenComparison":true}}。
- 用户会使用“年龄、性别”等口语。你必须自行在“达摩盘画像标签实时目录”中语义检索最符合的正式标签，并逐字复制它的tagId与tagName；例如是否对应“用户年龄”应由你根据实时目录判断。不得自己创造ID或返回目录外的标签。无法唯一确定时保持tagIds为空并用assistantMessage简短追问。
- 当用户没有指定画像标签时，使用系统传入currentOperation里的六项默认标签及原顺序，并询问用户是否要新增、删除或调整顺序；此时tagSelectionConfirmed=false。用户表示默认即可时改为true；用户明确调整标签后，返回调整后的完整tagIds/tagNames并改为true。
- 用户可能先单独粘贴两行或多行人群包名称，下一轮才说明“去达摩盘取画像”。必须回看recentConversation，把最近一条只包含多行名称的用户消息继承为crowdNames，不得重复询问。
- 用户未确认时，不得声称已经执行。用户明确确认后，应返回userConfirmed=true；同时明确确认已登录达摩盘/执行器可用时返回loginConfirmed=true。不要说“我不会代替你执行”或要求用户再去别处手动操作，后端会把已确认的operation交给真实任务执行器。
- 任何会替换画布、批量建包或调用数据引擎/达摩盘的动作，最终都必须等待用户确认；确认后应交给系统执行。
- currentDate是当前日期，latestSelectableDate是昨天；用户表达相对日期、“至今”或对比周期时，必须以latestSelectableDate为最晚结束日，转换为recentDays或dateRange。
- schemaVersion固定为1。一个完整圈包至少有一个condition。

行为组件能力目录（业务规则与当前字段摘要）：
{catalog_text}

公共方案知识（所有线上已发布方案的结构化语义模板）：
{solution_catalog_text}

系统功能执行目录（全能力索引 + 当前最相关路径的完整教程步骤、前置条件、输入输出与执行规则）：
{system_catalog_text}

达摩盘画像标签实时目录（当前系统实际可选项，AI必须从这里检索正式ID与名称）：
{dmp_tag_catalog_text}

圈包意图规范：
{schema_text}
"""
