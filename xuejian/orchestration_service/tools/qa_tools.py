from __future__ import annotations

from typing import Any

from .registry import ToolDefinition, ToolRegistry
from .schemas import (
    AuditCitationsInput,
    AuditCitationsOutput,
    BuildRagTraceInput,
    BuildRagTraceOutput,
    GradeRetrievalRelevanceInput,
    GradeRetrievalRelevanceOutput,
    MergeParentContextInput,
    MergeParentContextOutput,
    PackContextInput,
    PackContextOutput,
    RerankEvidenceInput,
    RerankEvidenceOutput,
    RetrieveEvidenceInput,
    RetrieveEvidenceOutput,
)
from ..workflows import knowledge_qa as workflow


TOOL_REGISTRY = ToolRegistry()
QA_ALLOWED_CALLERS = ("langgraph_rag",)


def _retrieved_document_count(chunks: list[dict[str, Any]]) -> int:
    return len(
        {
            document_id
            for chunk in chunks
            for document_id in [chunk.get("documentId")]
            if isinstance(document_id, str) and document_id
        }
    )


def retrieve_evidence(tool_input: RetrieveEvidenceInput) -> RetrieveEvidenceOutput:
    host = tool_input.host_ref
    query_text = (tool_input.rewritten_query or tool_input.question).strip()
    active_profile_getter = getattr(host, "get_active_embedding_profile", None)
    active_profile = active_profile_getter() if callable(active_profile_getter) else {"id": None}
    readiness_status = workflow._embedding_readiness_status(
        host,
        active_profile or {"id": None},
        tool_input.document_ids,
    )
    query_embedding = None
    if readiness_status == "ready":
        query_embedding = workflow._embed_optional_query(host, active_profile, query_text)
    chunks, retrieval_mode = workflow._search_candidates_for_queries(
        host,
        [
            {
                "query": query_text,
                "embedding": query_embedding,
                "required": True,
                "label": "primary",
            }
        ],
        tool_input.document_ids,
    )
    retrieval_summary = {
        "chunkCount": len(chunks),
        "retrievedDocumentCount": _retrieved_document_count(chunks),
        "lexicalStatus": workflow._lexical_status(chunks),
        "retrievalMode": retrieval_mode,
    }
    return RetrieveEvidenceOutput(
        chunks=chunks,
        retrieval_mode=retrieval_mode,
        readiness_status=readiness_status,
        query_used=query_text,
        retrieval_summary=retrieval_summary,
    )


def merge_parent_context(tool_input: MergeParentContextInput) -> MergeParentContextOutput:
    expanded_contexts, merge_summary = workflow._merge_parent_context(
        tool_input.chunks,
        tool_input.host_ref,
        document_structure=tool_input.document_structure,
    )
    return MergeParentContextOutput(
        expanded_contexts=expanded_contexts,
        merge_summary=merge_summary,
    )


def rerank_evidence(tool_input: RerankEvidenceInput) -> RerankEvidenceOutput:
    chunks, rerank_summary = workflow._rerank_evidence(
        tool_input.chunks,
        tool_input.question,
        tool_input.expanded_contexts,
        rewritten_query=tool_input.rewritten_query,
        config=tool_input.config_ref,
        api_key=tool_input.api_key_ref,
    )
    return RerankEvidenceOutput(chunks=chunks, rerank_summary=rerank_summary)


def grade_retrieval_relevance(
    tool_input: GradeRetrievalRelevanceInput,
) -> GradeRetrievalRelevanceOutput:
    decision, gate_summary = workflow._relevance_gate(
        tool_input.chunks,
        is_second_retrieval=tool_input.is_second_retrieval,
    )
    return GradeRetrievalRelevanceOutput(decision=decision, gate_summary=gate_summary)


def pack_context(tool_input: PackContextInput) -> PackContextOutput:
    packed_chunks = workflow._pack_chunks(tool_input.chunks)
    packing_summary = workflow._packing_summary(packed_chunks, tool_input.expanded_contexts)
    packing_summary["episodicMemoryUsed"] = bool(tool_input.episodic_memory)
    return PackContextOutput(packed_chunks=packed_chunks, packing_summary=packing_summary)


def audit_citations(tool_input: AuditCitationsInput) -> AuditCitationsOutput:
    citations, removed_ids, audit_status = workflow._audit_citations(
        tool_input.raw_citations,
        tool_input.chunks,
    )
    audit_summary = {
        "totalCitations": len(tool_input.raw_citations) if isinstance(tool_input.raw_citations, list) else 0,
        "validCitations": len(citations),
        "rejectedCitations": len(removed_ids),
        "auditStatus": audit_status,
    }
    return AuditCitationsOutput(
        citations=citations,
        removed_ids=removed_ids,
        audit_status=audit_status,
        audit_summary=audit_summary,
    )


def build_rag_trace(tool_input: BuildRagTraceInput) -> BuildRagTraceOutput:
    rag_trace = workflow._build_rag_trace(
        readiness_status=tool_input.readiness_status,
        retrieval_mode=tool_input.retrieval_mode,
        chunks=tool_input.chunks,
        query_rewrite_used=tool_input.query_rewrite_used,
        rewrite_summary=tool_input.rewrite_summary,
        merge_summary=tool_input.merge_summary,
        packing_summary=tool_input.packing_summary,
        rerank_summary=tool_input.rerank_summary,
        gate_summary=tool_input.gate_summary,
        second_retrieval_summary=tool_input.second_retrieval_summary,
        audit_summary=tool_input.audit_summary,
        failure_reason=tool_input.failure_reason,
    )
    return BuildRagTraceOutput(rag_trace=rag_trace)


TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="retrieve_evidence",
        description="Run retrieval for a question against the scoped documents.",
        input_schema=RetrieveEvidenceInput,
        output_schema=RetrieveEvidenceOutput,
        handler=retrieve_evidence,
        error_categories=("embedding_missing", "embedding_stale", "query_embedding_failed"),
        retryable=True,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="merge_parent_context",
        description="Expand child chunks with parent or section context.",
        input_schema=MergeParentContextInput,
        output_schema=MergeParentContextOutput,
        handler=merge_parent_context,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="rerank_evidence",
        description="Rerank evidence chunks for QA relevance.",
        input_schema=RerankEvidenceInput,
        output_schema=RerankEvidenceOutput,
        handler=rerank_evidence,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="grade_retrieval_relevance",
        description="Decide whether evidence is sufficient for answering.",
        input_schema=GradeRetrievalRelevanceInput,
        output_schema=GradeRetrievalRelevanceOutput,
        handler=grade_retrieval_relevance,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="pack_context",
        description="Pack evidence within the QA context budget.",
        input_schema=PackContextInput,
        output_schema=PackContextOutput,
        handler=pack_context,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="audit_citations",
        description="Filter citations to the chunks retrieved in this run.",
        input_schema=AuditCitationsInput,
        output_schema=AuditCitationsOutput,
        handler=audit_citations,
        error_categories=("citation_invalid",),
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)
TOOL_REGISTRY.register(
    ToolDefinition(
        tool_key="build_rag_trace",
        description="Build a structured RAG trace payload from tool summaries.",
        input_schema=BuildRagTraceInput,
        output_schema=BuildRagTraceOutput,
        handler=build_rag_trace,
        allowed_callers=QA_ALLOWED_CALLERS,
    )
)