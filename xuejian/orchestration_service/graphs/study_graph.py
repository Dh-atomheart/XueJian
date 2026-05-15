from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from .study_nodes import (
    build_learning_advice,
    detect_weak_topics,
    finalize_schedule_write,
    load_review_summary,
    plan_review_candidates,
    quality_gate_schedule_write,
    submit_schedule_write,
    suggest_card_gaps,
)
from .study_state import GRAPH_VERSION, RUNTIME, StudyGraphState

logger = logging.getLogger(__name__)


def _classify_study_graph_error(exc: Exception) -> str:
    message = str(exc).casefold()
    if "timeout" in message or "timed out" in message:
        return "host_timeout"
    if "host gateway" in message or "host" in message:
        return "host_gateway_error"
    return "study_graph_exception"


def _failure_payload(run_id: str, error_category: str, reason: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "fallbackUsed": False,
        "weakTopics": [],
        "cardGapSuggestions": [],
        "suggestedCardGapRefs": [],
        "learningAdviceArtifactRef": None,
        "summary": f"StudyGraph failed before learning advice could be created: {error_category}.",
        "artifactRefs": {"learning_advice": [], "trace": [f"study-graph://runs/{run_id}/trace"]},
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "failed",
            "confidence": 0.0,
            "riskLevel": "high",
            "reviewRequired": True,
            "blockingReasons": [error_category],
        },
        "errorCategory": error_category,
        "artifacts": {
            f"study-graph://runs/{run_id}/trace": {
                "artifactType": "trace",
                "createdBy": RUNTIME,
                "summary": reason[:240],
            }
        },
    }


def build_study_graph():
    graph = StateGraph(StudyGraphState)
    graph.add_node("load_review_summary", load_review_summary)
    graph.add_node("detect_weak_topics", detect_weak_topics)
    graph.add_node("suggest_card_gaps", suggest_card_gaps)
    graph.add_node("build_learning_advice", build_learning_advice)
    graph.add_node("plan_review_candidates", plan_review_candidates)
    graph.add_node("quality_gate_schedule_write", quality_gate_schedule_write)
    graph.add_node("submit_schedule_write", submit_schedule_write)
    graph.add_node("finalize_schedule_write", finalize_schedule_write)

    graph.add_edge(START, "load_review_summary")
    graph.add_edge("load_review_summary", "detect_weak_topics")
    graph.add_edge("detect_weak_topics", "suggest_card_gaps")
    graph.add_edge("suggest_card_gaps", "build_learning_advice")
    graph.add_conditional_edges(
        "build_learning_advice",
        lambda state: "schedule_write" if state.get("enable_schedule_write") else "done",
        {
            "schedule_write": "plan_review_candidates",
            "done": END,
        },
    )
    graph.add_edge("plan_review_candidates", "quality_gate_schedule_write")
    graph.add_edge("quality_gate_schedule_write", "submit_schedule_write")
    graph.add_edge("submit_schedule_write", "finalize_schedule_write")
    graph.add_edge("finalize_schedule_write", END)
    return graph.compile()


class StudyGraphRunner:
    def __init__(self, host: Any) -> None:
        self.host = host
        self._graph = build_study_graph()

    def run(
        self,
        run_id: str,
        *,
        document_ids: list[str] | None = None,
        card_group_ids: list[str] | None = None,
        review_summary: dict[str, Any] | None = None,
        max_weak_topics: int = 5,
        max_card_gap_suggestions: int = 5,
        enable_schedule_write: bool = False,
        dry_run: bool = True,
        write_target: str = "review_candidates",
        idempotency_key: str | None = None,
        dry_run_ref: str | None = None,
        rollback_ref: str | None = None,
        max_review_candidates: int = 10,
    ) -> dict[str, Any]:
        state: StudyGraphState = {
            "run_id": run_id,
            "document_ids": document_ids or [],
            "card_group_ids": card_group_ids or [],
            "review_summary": review_summary or {},
            "max_weak_topics": max_weak_topics,
            "max_card_gap_suggestions": max_card_gap_suggestions,
            "enable_schedule_write": enable_schedule_write,
            "dry_run": dry_run,
            "write_target": write_target,
            "idempotency_key": idempotency_key,
            "dry_run_ref": dry_run_ref,
            "rollback_ref": rollback_ref,
            "max_review_candidates": max_review_candidates,
            "host_ref": self.host,
        }
        try:
            final_state = self._graph.invoke(state)
        except Exception as exc:  # noqa: BLE001
            error_category = _classify_study_graph_error(exc)
            logger.exception("StudyGraph failed for run %s: %s", run_id[:8], exc)
            return _failure_payload(run_id, error_category, str(exc))
        result = final_state.get("result") if isinstance(final_state, dict) else None
        if isinstance(result, dict):
            return result
        return _failure_payload(run_id, "study_graph_result_missing", "StudyGraph finished without a result payload.")
