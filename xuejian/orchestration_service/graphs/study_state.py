from __future__ import annotations

from typing import Any, TypedDict


GRAPH_VERSION = "study-graph-v1"
GRAPH_VERSION_V2 = "study-graph-v2"
RUNTIME = "langgraph_study"


class StudyGraphState(TypedDict, total=False):
    run_id: str
    document_ids: list[str]
    card_group_ids: list[str]
    review_summary: dict[str, Any]
    max_weak_topics: int
    max_card_gap_suggestions: int
    enable_schedule_write: bool
    dry_run: bool
    write_target: str
    idempotency_key: str | None
    dry_run_ref: str | None
    rollback_ref: str | None
    max_review_candidates: int
    host_ref: Any

    weak_topics: list[dict[str, Any]]
    card_gap_suggestions: list[dict[str, Any]]
    review_candidates: list[dict[str, Any]]
    schedule_write_artifact_ref: str | None
    dry_run_result: dict[str, Any]
    created_review_candidate_ids: list[str]
    schedule_write_state: str
    schedule_write_blocking_reasons: list[str]
    learning_advice_artifact_ref: str | None
    suggested_card_gap_refs: list[str]
    quality_envelope: dict[str, Any]
    artifacts: dict[str, Any]
    error_category: str | None
    result: dict[str, Any]
