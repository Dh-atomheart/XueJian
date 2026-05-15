from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ToolSchema(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)


class RetrieveEvidenceInput(ToolSchema):
    question: str = Field(..., min_length=1)
    document_ids: list[str] = Field(default_factory=list)
    host_ref: Any
    rewritten_query: str | None = None


class RetrieveEvidenceOutput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    retrieval_mode: str = "hybrid"
    readiness_status: str = "ready"
    query_used: str = ""
    retrieval_summary: dict[str, Any] = Field(default_factory=dict)


class MergeParentContextInput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    host_ref: Any
    document_structure: dict[str, dict[str, Any]] | None = None


class MergeParentContextOutput(ToolSchema):
    expanded_contexts: dict[str, dict[str, Any]] = Field(default_factory=dict)
    merge_summary: dict[str, Any] = Field(default_factory=dict)


class RerankEvidenceInput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    question: str = Field(..., min_length=1)
    expanded_contexts: dict[str, dict[str, Any]] = Field(default_factory=dict)
    rewritten_query: str | None = None
    config_ref: dict[str, Any] | None = None
    api_key_ref: str = ""


class RerankEvidenceOutput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    rerank_summary: dict[str, Any] = Field(default_factory=dict)


class GradeRetrievalRelevanceInput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    is_second_retrieval: bool = False


class GradeRetrievalRelevanceOutput(ToolSchema):
    decision: str
    gate_summary: dict[str, Any] = Field(default_factory=dict)


class PackContextInput(ToolSchema):
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    expanded_contexts: dict[str, dict[str, Any]] = Field(default_factory=dict)
    episodic_memory: str | None = None


class PackContextOutput(ToolSchema):
    packed_chunks: list[dict[str, Any]] = Field(default_factory=list)
    packing_summary: dict[str, Any] = Field(default_factory=dict)


class AuditCitationsInput(ToolSchema):
    raw_citations: object = None
    chunks: list[dict[str, Any]] = Field(default_factory=list)


class AuditCitationsOutput(ToolSchema):
    citations: list[dict[str, Any]] = Field(default_factory=list)
    removed_ids: list[str] = Field(default_factory=list)
    audit_status: str = "clean"
    audit_summary: dict[str, Any] = Field(default_factory=dict)


class BuildRagTraceInput(ToolSchema):
    readiness_status: str
    retrieval_mode: str
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    query_rewrite_used: bool = False
    rewrite_summary: dict[str, Any] | None = None
    merge_summary: dict[str, Any] | None = None
    packing_summary: dict[str, Any] | None = None
    rerank_summary: dict[str, Any] | None = None
    gate_summary: dict[str, Any] | None = None
    second_retrieval_summary: dict[str, Any] | None = None
    audit_summary: dict[str, Any] | None = None
    failure_reason: str | None = None


class BuildRagTraceOutput(ToolSchema):
    rag_trace: dict[str, Any] = Field(default_factory=dict)


class ContentMapInput(ToolSchema):
    document_id: str = Field(..., min_length=1)
    chunks: list[dict[str, Any]] = Field(default_factory=list)


class ContentMapOutput(ToolSchema):
    concepts: list[dict[str, Any]] = Field(default_factory=list)


class GenerateCardCandidatesInput(ToolSchema):
    run_id: str = Field(..., min_length=1)
    document_id: str = Field(..., min_length=1)
    concepts: list[dict[str, Any]] = Field(default_factory=list)
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    density: str = Field(default="medium", min_length=1)
    provider_config_id: str = Field(..., min_length=1)
    host_ref: Any


class GenerateCardCandidatesOutput(ToolSchema):
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    discarded_count: int = 0


class CritiqueCardCandidatesInput(ToolSchema):
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class CritiqueCardCandidatesOutput(ToolSchema):
    critiqued_candidates: list[dict[str, Any]] = Field(default_factory=list)


class DedupeCardCandidatesInput(ToolSchema):
    candidates: list[dict[str, Any]] = Field(default_factory=list)


class DedupeCardCandidatesOutput(ToolSchema):
    deduplicated_candidates: list[dict[str, Any]] = Field(default_factory=list)
    discarded_candidates: list[dict[str, Any]] = Field(default_factory=list)
    dedupe_summary: dict[str, Any] = Field(default_factory=dict)


class AuditCardSourceQuotesInput(ToolSchema):
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    chunks: list[dict[str, Any]] = Field(default_factory=list)


class AuditCardSourceQuotesOutput(ToolSchema):
    passed_candidates: list[dict[str, Any]] = Field(default_factory=list)
    failed_candidates: list[dict[str, Any]] = Field(default_factory=list)
    audit_summary: dict[str, Any] = Field(default_factory=dict)


class SubmitCardCandidatesInput(ToolSchema):
    run_id: str = Field(..., min_length=1)
    document_id: str = Field(..., min_length=1)
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    host_ref: Any


class SubmitCardCandidatesOutput(ToolSchema):
    submitted_count: int = 0
    response: dict[str, Any] = Field(default_factory=dict)


class SuggestReviewScheduleInput(ToolSchema):
    card_ids: list[str] = Field(default_factory=list)
    confidence_scores: dict[str, float] = Field(default_factory=dict)


class SuggestReviewScheduleOutput(ToolSchema):
    suggestions: list[dict[str, Any]] = Field(default_factory=list)


class SubmitReviewCandidatesInput(ToolSchema):
    run_id: str = Field(..., min_length=1)
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    host_ref: Any
    dry_run: bool = True
    idempotency_key: str | None = None
    dry_run_ref: str | None = None
    rollback_ref: str | None = None


class SubmitReviewCandidatesOutput(ToolSchema):
    accepted_count: int = 0
    rejected_count: int = 0
    created_review_candidate_ids: list[str] = Field(default_factory=list)
    dry_run_ref: str | None = None
    rollback_ref: str | None = None
    skipped_duplicates: int = 0
    response: dict[str, Any] = Field(default_factory=dict)
    error_category: str | None = None
