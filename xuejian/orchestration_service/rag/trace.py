"""RAG trace builder and default summaries."""
from __future__ import annotations

from typing import Any

from .audit import _truncate_text
from .retriever import _lexical_status
from .constants import (
    MAX_PARENT_CONTEXT_CHARS,
    MAX_TOTAL_CONTEXT_CHARS,
    RELEVANCE_GATE_MIN_SCORE,
)


def _default_merge_summary(status: str = "not_run") -> dict[str, Any]:
    return {
        "status": status,
        "childChunksExpanded": 0,
        "parentContextsAdded": 0,
        "sectionContextsAdded": 0,
        "charsAdded": 0,
    }


def _default_packing_summary() -> dict[str, Any]:
    return {
        "passageCount": 0,
        "totalChars": 0,
        "budgetChars": MAX_TOTAL_CONTEXT_CHARS + MAX_PARENT_CONTEXT_CHARS,
    }


def _default_audit_summary(
    audit_status: str = "not_run",
    total_citations: int = 0,
    valid_citations: int = 0,
    rejected_citations: int = 0,
) -> dict[str, Any]:
    return {
        "totalCitations": total_citations,
        "validCitations": valid_citations,
        "rejectedCitations": rejected_citations,
        "auditStatus": audit_status,
    }


def _default_rewrite_summary(
    status: str = "not_triggered",
    *,
    trigger_reason: str | None = None,
    original_query: str = "",
    rewritten_query: str | None = None,
    recent_message_count: int = 0,
) -> dict[str, Any]:
    return {
        "status": status,
        "triggerReason": trigger_reason,
        "recentMessageCount": recent_message_count,
        "originalQueryPreview": _truncate_text(original_query, 80),
        "rewrittenQueryPreview": _truncate_text(rewritten_query or "", 80),
    }


def _default_rerank_summary(status: str = "not_enabled") -> dict[str, Any]:
    return {
        "status": status,
        "provider": status,
        "topScore": None,
        "averageScore": None,
        "chunkCount": 0,
    }


def _default_gate_summary(decision: str = "not_enabled") -> dict[str, Any]:
    return {
        "decision": decision,
        "topScore": None,
        "threshold": RELEVANCE_GATE_MIN_SCORE,
        "chunkCount": 0,
        "reason": decision,
    }


def _default_second_retrieval_summary(status: str = "not_used") -> dict[str, Any]:
    return {
        "status": status,
        "used": False,
        "queryPreview": "",
        "additionalChunkCount": 0,
        "reason": None,
    }


def build_rag_trace(
    *,
    readiness_status: str,
    retrieval_mode: str,
    chunks: list[dict[str, Any]] | None = None,
    query_rewrite_used: bool = False,
    rewrite_summary: dict[str, Any] | None = None,
    merge_summary: dict[str, Any] | None = None,
    packing_summary: dict[str, Any] | None = None,
    rerank_summary: dict[str, Any] | None = None,
    gate_summary: dict[str, Any] | None = None,
    second_retrieval_summary: dict[str, Any] | None = None,
    audit_summary: dict[str, Any] | None = None,
    failure_reason: str | None = None,
) -> dict[str, Any]:
    chunks = chunks or []
    retrieved_document_count = len(
        {
            document_id
            for chunk in chunks
            for document_id in [chunk.get("documentId")]
            if isinstance(document_id, str) and document_id
        }
    )

    merge_summary = merge_summary or _default_merge_summary()
    packing_summary = packing_summary or _default_packing_summary()
    rewrite_summary = rewrite_summary or _default_rewrite_summary()
    rerank_summary = rerank_summary or _default_rerank_summary()
    gate_summary = gate_summary or _default_gate_summary()
    second_retrieval_summary = second_retrieval_summary or _default_second_retrieval_summary()
    audit_summary = audit_summary or _default_audit_summary()

    return {
        "embeddingReadiness": readiness_status,
        "retrievalMode": retrieval_mode,
        "queryRewriteUsed": query_rewrite_used,
        "secondRetrievalUsed": bool(second_retrieval_summary.get("used")),
        "retrievedDocumentCount": retrieved_document_count,
        "parentMergeStatus": merge_summary.get("status"),
        "rerankStatus": rerank_summary.get("status"),
        "relevanceGateDecision": gate_summary.get("decision"),
        "citationAuditStatus": audit_summary.get("auditStatus"),
        "failureReason": failure_reason,
        "retrievalSummary": {
            "chunkCount": len(chunks),
            "retrievedDocumentCount": retrieved_document_count,
            "lexicalStatus": _lexical_status(chunks),
            "retrievalMode": retrieval_mode,
        },
        "rewriteSummary": rewrite_summary,
        "mergeSummary": merge_summary,
        "packingSummary": packing_summary,
        "rerankSummary": rerank_summary,
        "relevanceGateSummary": gate_summary,
        "secondRetrievalSummary": second_retrieval_summary,
        "auditSummary": audit_summary,
    }
