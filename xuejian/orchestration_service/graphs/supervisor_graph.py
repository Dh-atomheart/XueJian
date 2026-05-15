from __future__ import annotations

import logging
from typing import Any

from langgraph.graph import END, START, StateGraph

from .supervisor_nodes import (
    execute_step,
    finalize_summary,
    maybe_replan,
    observe,
    plan,
    policy_check,
    self_evaluate,
    understand_task,
)
from .supervisor_state import GRAPH_VERSION, RUNTIME, SupervisorState

logger = logging.getLogger(__name__)


def _classify_supervisor_error(exc: Exception) -> str:
    message = str(exc).casefold()
    if "timeout" in message or "timed out" in message:
        return "provider_timeout"
    if "json" in message:
        return "schema_validation_failed"
    if "policy" in message:
        return "blocked_by_policy"
    if "host gateway" in message or "host" in message:
        return "host_gateway_error"
    return "supervisor_graph_exception"


def _failure_payload(run_id: str, error_category: str, reason: str) -> dict[str, Any]:
    return {
        "runtime": RUNTIME,
        "graphVersion": GRAPH_VERSION,
        "fallbackUsed": False,
        "status": "failed",
        "summary": f"Supervisor failed before completing the compound task: {error_category}.",
        "artifactRefs": {"trace": [f"supervisor-graph://runs/{run_id}/trace"]},
        "qualityEnvelope": {
            "groundingStatus": "not_applicable",
            "auditStatus": "failed",
            "confidence": 0.0,
            "riskLevel": "high",
            "reviewRequired": True,
            "blockingReasons": [error_category],
        },
        "errorCategory": error_category,
        "decisionRecords": [],
        "budgetCounters": {},
        "artifacts": {
            f"supervisor-graph://runs/{run_id}/trace": {
                "artifactType": "trace",
                "createdBy": RUNTIME,
                "summary": reason[:240],
            }
        },
    }


def build_supervisor_graph():
    graph = StateGraph(SupervisorState)
    graph.add_node("understand_task", understand_task)
    graph.add_node("plan", plan)
    graph.add_node("self_evaluate", self_evaluate)
    graph.add_node("policy_check", policy_check)
    graph.add_node("execute_step", execute_step)
    graph.add_node("observe", observe)
    graph.add_node("maybe_replan", maybe_replan)
    graph.add_node("finalize_summary", finalize_summary)

    graph.add_edge(START, "understand_task")
    graph.add_edge("understand_task", "plan")
    graph.add_edge("plan", "self_evaluate")
    graph.add_edge("self_evaluate", "policy_check")
    graph.add_edge("policy_check", "execute_step")
    graph.add_edge("execute_step", "observe")
    graph.add_edge("observe", "maybe_replan")
    graph.add_edge("maybe_replan", "finalize_summary")
    graph.add_edge("finalize_summary", END)
    return graph.compile()


class SupervisorGraphRunner:
    def __init__(self, host: Any) -> None:
        self.host = host
        self._graph = build_supervisor_graph()

    def run(
        self,
        run_id: str,
        *,
        task_type: str,
        user_request: str,
        document_ids: list[str] | None = None,
        card_group_ids: list[str] | None = None,
        options: dict[str, Any] | None = None,
        provider_config_id: str = "",
        planner_config: dict[str, Any] | None = None,
        planner_api_key: str = "",
    ) -> dict[str, Any]:
        state: SupervisorState = {
            "run_id": run_id,
            "task_type": task_type,
            "user_request": user_request,
            "document_ids": document_ids or [],
            "card_group_ids": card_group_ids or [],
            "options": options or {},
            "provider_config_id": provider_config_id,
            "planner_config": planner_config or {},
            "planner_api_key": planner_api_key,
            "host_ref": self.host,
        }
        try:
            final_state = self._graph.invoke(state)
        except Exception as exc:  # noqa: BLE001
            error_category = _classify_supervisor_error(exc)
            logger.exception("SupervisorGraph failed for run %s: %s", run_id[:8], exc)
            return _failure_payload(run_id, error_category, str(exc))
        result = final_state.get("result") if isinstance(final_state, dict) else None
        if isinstance(result, dict):
            return result
        return _failure_payload(run_id, "supervisor_result_missing", "Supervisor finished without a result payload.")
