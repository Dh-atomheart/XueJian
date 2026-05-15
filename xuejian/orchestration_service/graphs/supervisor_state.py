from __future__ import annotations

from typing import Any, TypedDict


GRAPH_VERSION = "supervisor-graph-v1"
RUNTIME = "langgraph_multi_agent"

MAX_PLAN_STEPS = 6
MAX_SUBGRAPH_CALLS = 5
MAX_REPLANS = 2


class SupervisorState(TypedDict, total=False):
    run_id: str
    task_type: str
    user_request: str
    document_ids: list[str]
    card_group_ids: list[str]
    options: dict[str, Any]
    provider_config_id: str
    planner_config: dict[str, Any]
    planner_api_key: str
    host_ref: Any

    is_compound_task: bool
    route_plan: dict[str, Any]
    self_eval: dict[str, Any]
    decision_records: list[dict[str, Any]]
    plan_revisions: list[dict[str, Any]]
    completed_steps: list[dict[str, Any]]
    artifact_refs: dict[str, Any]
    artifacts: dict[str, Any]
    subgraph_results: list[dict[str, Any]]
    budget_counters: dict[str, int]
    quality_envelope: dict[str, Any]
    error_category: str | None
    result: dict[str, Any]
