"""RAG pipeline orchestration — high-level step functions called by graph nodes.

Each function encapsulates the business logic for a single RAG step,
so graph nodes become thin wrappers that just read state → call pipeline → emit progress → return.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .answer import excerpt_fallback_answer, status_answer, try_langchain_qa
from .audit import _chunk_id, _truncate_text
from .context import build_passages, merge_parent_context
from .exceptions import WorkflowCancelled
from .retriever import combine_retrieval_modes, merge_candidate_chunks, search_candidates_for_queries
from .rerank import relevance_gate, rerank_evidence
from .rewrite import build_second_retrieval_query
from .trace import (
    _default_audit_summary,
    _default_gate_summary,
    _default_merge_summary,
    _default_packing_summary,
    _default_rerank_summary,
    _default_rewrite_summary,
    _default_second_retrieval_summary,
    build_rag_trace,
)

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


def remediate_retrieval(
    host: HostGatewayClient,
    question: str,
    rewritten_query: str | None,
    recent_messages: list[dict[str, str]],
    candidate_chunks: list[dict[str, Any]],
    document_ids: list[str],
    retrieval_mode: str,
    gate_summary: dict[str, Any],
    config: dict[str, Any] | None,
    api_key: str,
    remediation_count: int,
    expanded_contexts: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """Run second-pass retrieval and return updated state fields."""
    second_query_status = "fallback_original"
    second_query_reason = str(gate_summary.get("reason") or "low_relevance")
    second_query = rewritten_query or question

    if not rewritten_query or rewritten_query == question:
        try:
            second_query = build_second_retrieval_query(
                config, api_key, question, rewritten_query, recent_messages,
            )
            if second_query.strip() != question.strip():
                second_query_status = "applied"
        except Exception as exc:
            if isinstance(exc, WorkflowCancelled):
                raise
            logger.warning("KnowledgeGraph second retrieval rewrite failed: %s", exc)
            second_query = rewritten_query or question
            second_query_status = "failed_fallback"
    else:
        second_query_status = "reuse_rewrite"

    second_result = search_candidates_for_queries(
        host,
        [{"query": second_query, "embedding": None, "required": False, "label": "second_retrieval"}],
        document_ids,
    )
    second_candidate_chunks, _ = second_result

    first_chunk_ids = {_chunk_id(c) for c in candidate_chunks if _chunk_id(c)}
    additional_chunk_count = sum(
        1 for c in second_candidate_chunks
        if _chunk_id(c) and _chunk_id(c) not in first_chunk_ids
    )
    merged_candidates = merge_candidate_chunks(candidate_chunks, second_candidate_chunks)
    new_retrieval_mode = combine_retrieval_modes(retrieval_mode, "hybrid")

    # Re-run merge → rerank → gate pipeline on merged candidates
    new_expanded, merge_summary = merge_parent_context(merged_candidates, host)
    reranked_chunks, rerank_summary = rerank_evidence(
        merged_candidates, question, new_expanded,
        rewritten_query=rewritten_query or second_query,
        config=config, api_key=api_key,
    )
    decision, gate_result = relevance_gate(reranked_chunks, is_second_retrieval=True)

    retrieval_status = "ready"
    if decision == "no_relevant_content":
        retrieval_status = "no_hits" if not reranked_chunks else "low_relevance"

    second_retrieval_summary = {
        "status": second_query_status,
        "used": True,
        "queryPreview": _truncate_text(second_query, 80),
        "additionalChunkCount": additional_chunk_count,
        "reason": second_query_reason,
    }

    return {
        "candidate_chunks": reranked_chunks,
        "expanded_contexts": new_expanded,
        "merge_summary": merge_summary,
        "rerank_summary": rerank_summary,
        "gate_decision": decision,
        "gate_summary": gate_result,
        "retrieval_mode": new_retrieval_mode,
        "retrieval_status": retrieval_status,
        "remediation_count": remediation_count + 1,
        "remediation_reason": second_query_reason,
        "remediation_summary": second_retrieval_summary,
        "second_retrieval_summary": second_retrieval_summary,
    }


def generate_answer(
    question: str,
    packed_chunks: list[dict[str, Any]],
    expanded_contexts: dict[str, dict[str, Any]],
    gate_decision: str,
    retrieval_mode: str,
    retrieval_status: str,
    config: dict[str, Any],
    api_key: str,
    query_embedding_meta: dict[str, Any],
) -> dict[str, Any]:
    """Generate answer from packed chunks, with fallback logic."""
    from .retriever import uses_degraded_lexical_fallback

    if gate_decision == "no_relevant_content" or not packed_chunks:
        status = retrieval_status if retrieval_status != "ready" else "no_hits"
        return {
            "answer_data": {
                "answer": "当前资料中没有足够证据回答这个问题。",
                "answerMode": "no_relevant_content",
                "citations": [],
            },
            "raw_citations": [],
            "retrieval_status": status,
            "query_embedding_meta": query_embedding_meta,
        }

    if not config:
        if retrieval_mode == "fts5":
            return {
                "answer_data": {
                    "answer": "当前资料中没有足够证据回答这个问题。",
                    "answerMode": "no_relevant_content",
                    "citations": [],
                },
                "raw_citations": [],
                "retrieval_status": "no_hits",
            }
        raise RuntimeError("Knowledge Q&A model is not configured")

    if retrieval_mode == "fts5":
        fallback_reason = "contains_only_fallback" if uses_degraded_lexical_fallback(retrieval_mode, packed_chunks) else "lexical_only"
        fallback_result = excerpt_fallback_answer(
            packed_chunks, fallback_reason,
            retrieval_status=retrieval_status, retrieval_mode=retrieval_mode,
        )
        return {
            "answer_data": fallback_result.get("answer"),
            "raw_citations": (fallback_result.get("answer") or {}).get("citations") or [],
            "retrieval_status": (fallback_result.get("answer") or {}).get("retrievalStatus") or "ready",
        }

    passages_text = build_passages(packed_chunks, expanded_contexts)
    try:
        answer_data = try_langchain_qa(config, api_key, question, passages_text)
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("KnowledgeGraph answer generation failed, using excerpt fallback: %s", exc)
        fallback_result = excerpt_fallback_answer(
            packed_chunks, f"model_error: {exc}", retrieval_mode=retrieval_mode,
        )
        return {
            "answer_data": fallback_result.get("answer"),
            "raw_citations": (fallback_result.get("answer") or {}).get("citations") or [],
            "retrieval_status": (fallback_result.get("answer") or {}).get("retrievalStatus") or "ready",
        }

    return {
        "answer_data": answer_data,
        "raw_citations": answer_data.get("citations", []),
        "retrieval_status": "ready" if answer_data.get("answerMode") == "grounded" else "no_hits",
    }
