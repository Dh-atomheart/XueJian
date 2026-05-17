from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from ..providers.runtime import build_langchain_chat_model


SUPERVISOR_PLANNER_SYSTEM = """You are a planning component for XueJian's multi-agent learning workflow.
Return only JSON. Do not answer the user's question. Do not generate citations, card content, learning advice, or schedules.
Allowed selectedGraph values: knowledge, card, study.
Allowed expectedArtifactType values: answer, evidence, card_candidate, formal_card_write, learning_advice.
Each step must include selectedGraph, expectedArtifactType, reasonSummary, and optional inputArtifactRefs."""


def _extract_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("planner output does not contain JSON object")
    return json.loads(text[start : end + 1])


class SupervisorPlanner:
    def __init__(self, config: dict[str, Any], api_key: str) -> None:
        self.config = config
        self.api_key = api_key

    def plan(
        self,
        *,
        user_request: str,
        document_ids: list[str],
        card_group_ids: list[str],
        options: dict[str, Any],
        previous_records: list[dict[str, Any]] | None = None,
        previous_artifact_refs: dict[str, Any] | None = None,
        follow_up_message: str = "",
    ) -> dict[str, Any]:
        if not self.config:
            raise RuntimeError("planner model is not configured")
        llm = build_langchain_chat_model(
            self.config,
            self.api_key,
            0.1,
            timeout=20,
            max_tokens=1200,
        )
        prompt = {
            "userRequest": user_request[:1200],
            "documentIds": document_ids[:20],
            "cardGroupIds": card_group_ids[:20],
            "options": {
                "allowFormalCardWrite": bool(options.get("allowFormalCardWrite")),
                "allowStudyScheduleWrite": False,
                "dryRun": bool(options.get("dryRun")),
            },
            "previousDecisionRecords": previous_records or [],
            "previousArtifactRefs": previous_artifact_refs or {},
            "followUpMessage": follow_up_message[:600],
            "requiredOutputShape": {
                "intent": "short compound task intent",
                "steps": [
                    {
                        "selectedGraph": "knowledge|card|study",
                        "expectedArtifactType": "answer|evidence|card_candidate|formal_card_write|learning_advice",
                        "inputArtifactRefs": [],
                        "reasonSummary": "brief reason without hidden reasoning",
                    }
                ],
                "selfEval": {
                    "necessity": "required|optional|unnecessary",
                    "riskLevel": "low|medium|high",
                    "confidence": 0.0,
                    "expectedBenefit": "short text",
                    "reasonSummary": "brief reason without hidden reasoning",
                },
            },
        }
        response = llm.invoke(
            [
                SystemMessage(content=SUPERVISOR_PLANNER_SYSTEM),
                HumanMessage(content=json.dumps(prompt, ensure_ascii=False)),
            ]
        )
        raw = getattr(response, "content", response)
        return _extract_json_object(str(raw))
