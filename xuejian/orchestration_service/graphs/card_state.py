from __future__ import annotations

from typing import Any, TypedDict


GRAPH_VERSION = "card-graph-v1"
RUNTIME = "langgraph_card"


class CardGraphState(TypedDict, total=False):
    run_id: str
    document_ids: list[str]
    source_chunk_ids: list[str]
    evidence_artifact_refs: list[str]
    evidence_artifacts: list[dict[str, Any]]
    card_count_hint: int
    difficulty: str
    write_mode: str
    provider_config_id: str
    host_ref: Any

    chunks: list[dict[str, Any]]
    evidence_trusted: bool
    concepts: list[dict[str, Any]]
    generated_candidates: list[dict[str, Any]]
    audit_passed_candidates: list[dict[str, Any]]
    audit_failed_candidates: list[dict[str, Any]]
    critiqued_candidates: list[dict[str, Any]]
    deduplicated_candidates: list[dict[str, Any]]
    discarded_candidates: list[dict[str, Any]]
    submitted_count: int
    created_card_ids: list[str]
    write_response: dict[str, Any]
    quality_envelope: dict[str, Any]
    card_artifact_refs: list[str]
    artifacts: dict[str, Any]
    error_category: str | None
    result: dict[str, Any]
