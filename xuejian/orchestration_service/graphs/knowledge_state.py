from __future__ import annotations

from typing import Any, TypedDict


GRAPH_VERSION = "knowledge-graph-v1"
RUNTIME = "langgraph_rag"


class KnowledgeGraphState(TypedDict, total=False):
    run_id: str
    question: str
    document_ids: list[str]
    conversation_id: str | None
    host_ref: Any

    graph_version: str
    runtime: str
    config: dict[str, Any]
    api_key: str

    active_profile: dict[str, Any] | None
    readiness_status: str
    query_embedding: list[float] | None
    query_embedding_status: str
    query_embedding_meta: dict[str, Any]

    recent_messages: list[dict[str, str]]
    rewrite_summary: dict[str, Any]
    rewritten_query: str | None

    candidate_chunks: list[dict[str, Any]]
    expanded_contexts: dict[str, dict[str, Any]]
    packed_chunks: list[dict[str, Any]]

    retrieval_mode: str
    retrieval_status: str
    retrieval_summary: dict[str, Any]
    merge_summary: dict[str, Any]
    packing_summary: dict[str, Any]
    rerank_summary: dict[str, Any]
    gate_summary: dict[str, Any]
    gate_decision: str
    second_retrieval_summary: dict[str, Any]

    remediation_count: int
    remediation_reason: str | None
    remediation_summary: dict[str, Any]

    answer_data: dict[str, Any] | None
    raw_citations: object
    citations: list[dict[str, Any]]
    audit_summary: dict[str, Any]
    rag_trace: dict[str, Any]

    artifact_refs: dict[str, Any]
    artifacts: dict[str, Any]
    quality_envelope: dict[str, Any]
    result: dict[str, Any] | None
    error_category: str | None
    fallback_used: bool