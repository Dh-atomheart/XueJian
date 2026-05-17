"""Grounded RAG workflow for Knowledge Q&A — compatibility entry point.

This module now delegates to the rag/ core modules.
It is kept as a fallback entry point for the deterministic workflow path.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ..providers.embedding_runtime import (
    QueryEmbeddingRuntimeError,
    embed_query_with_resilience,
)
from ..providers.runtime import estimate_workflow_cost
from ..rag.answer import embedding_error_status, excerpt_fallback_answer, status_answer, try_langchain_qa
from ..rag.audit import _chunk_id, _truncate_text, audit_citations
from ..rag.constants import RECENT_MESSAGES_LIMIT
from ..rag.context import (
    _pack_chunks,
    build_document_structure_cache,
    build_passages,
    hydrate_chunks_from_structure,
    merge_parent_context,
    packing_summary,
    dedupe_and_pack_chunks,
)
from ..rag.exceptions import KnowledgeQaJsonError as KnowledgeQaJsonError, WorkflowCancelled as WorkflowCancelled
from ..rag.retriever import (
    combine_retrieval_modes,
    embedding_readiness_status,
    embed_optional_query,
    merge_candidate_chunks,
    search_candidates_for_queries,
    uses_degraded_lexical_fallback,
)
from ..rag.rewrite import (
    build_second_retrieval_query,
    recent_messages_for_rewrite,
    rewrite_query,
    rewrite_trigger_reason,
)
from ..rag.rerank import relevance_gate, rerank_evidence
from ..rag.trace import (
    _default_audit_summary,
    _default_gate_summary,
    _default_merge_summary,
    _default_packing_summary,
    _default_rerank_summary,
    _default_rewrite_summary,
    _default_second_retrieval_summary,
    _lexical_status,
    build_rag_trace,
)

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

# Re-export for backward compatibility
WorkflowCancelled = WorkflowCancelled
KnowledgeQaJsonError = KnowledgeQaJsonError


def _check_cancelled(host: HostGatewayClient, run_id: str) -> None:
    if run_id and host.is_run_cancelled(run_id):
        raise WorkflowCancelled("knowledge Q&A workflow cancelled")


def _emit_rag_progress(
    host: HostGatewayClient,
    run_id: str,
    step: str,
    status: str,
    *,
    title: str = "",
    detail: str = "",
    progress: float = 0.0,
    metrics: dict[str, Any] | None = None,
) -> None:
    emitter = getattr(host, "emit_rag_progress", None)
    if not callable(emitter):
        return
    try:
        emitter(run_id, step, status, title=title, detail=detail, progress=progress, metrics=metrics or {})
    except Exception:
        pass


def run_knowledge_qa_workflow(
    run_id: str,
    question: str,
    document_ids: list[str],
    host: HostGatewayClient,
    conversation_id: str | None = None,
    episodic_memory: str | None = None,
) -> dict[str, Any]:
    """Execute a grounded knowledge_qa workflow using vector-backed retrieval.

    This is the deterministic fallback path — delegates to rag/ core modules.
    """
    _check_cancelled(host, run_id)
    _emit_rag_progress(
        host, run_id, "query_embedding", "running",
        title="Understanding question", detail="Checking embedding readiness",
        progress=0.08, metrics={"documentCount": len(document_ids)},
    )

    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        _emit_rag_progress(host, run_id, "query_embedding", "failed",
                           title="Understanding question", detail="No active embedding profile",
                           progress=0.08)
        return status_answer(
            "当前没有可用的 embedding 配置。请先配置 embedding，并为文档生成向量后再提问。",
            "embedding_missing",
            rag_trace=build_rag_trace(readiness_status="embedding_missing", retrieval_mode="hybrid", failure_reason="embedding_missing"),
        )

    readiness_status = embedding_readiness_status(host, active_profile, document_ids)
    if readiness_status == "embedding_missing":
        _emit_rag_progress(host, run_id, "query_embedding", "failed",
                           title="Understanding question", detail="Selected documents are not embedded",
                           progress=0.08, metrics={"readiness": readiness_status})
        return status_answer(
            "所选资料尚未完成当前 embedding 配置的向量化。请先生成文档向量后再提问。",
            "embedding_missing",
            rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode="hybrid", failure_reason=readiness_status),
        )
    if readiness_status == "embedding_stale":
        _emit_rag_progress(host, run_id, "query_embedding", "failed",
                           title="Understanding question", detail="Selected documents have stale embeddings",
                           progress=0.08, metrics={"readiness": readiness_status})
        return status_answer(
            "所选资料的向量已过期。请重新生成文档向量后再提问。",
            "embedding_stale",
            rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode="hybrid", failure_reason=readiness_status),
        )

    query_embedding_meta: dict[str, Any] = {
        "queryEmbeddingStatus": "ready", "cacheHit": False, "attempts": 0, "latencyMs": None,
    }

    try:
        query_embedding_result = embed_query_with_resilience(host, active_profile, question, task_type="RETRIEVAL_QUERY")
        query_embedding = query_embedding_result.vector
        query_embedding_meta = {
            "queryEmbeddingStatus": query_embedding_result.status,
            "cacheHit": query_embedding_result.cache_hit,
            "attempts": query_embedding_result.attempts,
            "latencyMs": round(query_embedding_result.latency_ms, 2),
        }
        _emit_rag_progress(host, run_id, "query_embedding", "completed",
                           title="Understanding question", detail="Query embedding is ready",
                           progress=0.18, metrics={"cacheHit": query_embedding_result.cache_hit, "attempts": query_embedding_result.attempts})
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        status, message = embedding_error_status(exc)
        attempts = exc.attempts if isinstance(exc, QueryEmbeddingRuntimeError) else 0
        latency_ms = exc.latency_ms if isinstance(exc, QueryEmbeddingRuntimeError) else None
        logger.warning("Query embedding failed: status=%s attempts=%s error=%s", status, attempts, exc)
        failure_meta = {
            "queryEmbeddingStatus": status, "cacheHit": False, "attempts": attempts,
            "latencyMs": round(latency_ms, 2) if isinstance(latency_ms, (int, float)) else None,
            "fallbackReason": status,
        }
        _emit_rag_progress(host, run_id, "query_embedding", "failed", title="Understanding question", detail=status, progress=0.18)
        try:
            _emit_rag_progress(host, run_id, "retrieve", "running", title="Retrieving documents", detail="Falling back to lexical retrieval", progress=0.24)
            lexical_chunks = host.search_hybrid(question, query_embedding=None, document_ids=document_ids or None, limit=24)
            packed_lexical = dedupe_and_pack_chunks(lexical_chunks)
        except Exception as lexical_exc:
            logger.warning("Lexical fallback failed: %s", lexical_exc)
            packed_lexical = []
        if packed_lexical:
            _emit_rag_progress(host, run_id, "retrieve", "completed", title="Retrieving documents", detail="Lexical fallback found chunks", progress=0.32, metrics={"chunkCount": len(packed_lexical)})
            lexical_structure = build_document_structure_cache(host, packed_lexical)
            packed_lexical = hydrate_chunks_from_structure(packed_lexical, lexical_structure)
            lexical_expanded, lexical_merge = merge_parent_context(packed_lexical, host, document_structure=lexical_structure)
            lexical_packing = packing_summary(packed_lexical, lexical_expanded)
            result = excerpt_fallback_answer(packed_lexical, f"{status}: {message}", retrieval_status=status, retrieval_mode="fts5",
                                             rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode="fts5", chunks=packed_lexical, merge_summary=lexical_merge, packing_summary=lexical_packing, audit_summary=_default_audit_summary("clean"), failure_reason=status))
            result["answer"].update(failure_meta)
            return result
        result = status_answer(message, status, rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode="hybrid", failure_reason=status))
        result["answer"].update(failure_meta)
        return result

    _check_cancelled(host, run_id)
    config_with_key = host.get_config_for_workflow("knowledge_qa")
    config: dict[str, Any] = {}
    api_key = ""
    if config_with_key:
        config, api_key = config_with_key

    recent_messages = recent_messages_for_rewrite(host, conversation_id)
    rewrite_reason = rewrite_trigger_reason(question, recent_messages)
    rewritten_query: str | None = None
    rewrite_summary = _default_rewrite_summary(trigger_reason=rewrite_reason, original_query=question, recent_message_count=len(recent_messages))

    if rewrite_reason:
        _emit_rag_progress(host, run_id, "rewrite", "running", title="Rewriting query", detail="Resolving question", progress=0.22, metrics={"recentMessageCount": len(recent_messages)})
        if config_with_key:
            try:
                rewrite_candidate = rewrite_query(config, api_key, question, recent_messages)
                if rewrite_candidate.strip() != question.strip():
                    rewritten_query = rewrite_candidate
                    rewrite_summary = _default_rewrite_summary("applied", trigger_reason=rewrite_reason, original_query=question, rewritten_query=rewritten_query, recent_message_count=len(recent_messages))
                else:
                    rewrite_summary = _default_rewrite_summary("same_as_original", trigger_reason=rewrite_reason, original_query=question, rewritten_query=rewrite_candidate, recent_message_count=len(recent_messages))
            except Exception as exc:
                if isinstance(exc, WorkflowCancelled):
                    raise
                logger.warning("Rewrite failed: %s", exc)
                rewrite_summary = _default_rewrite_summary("failed", trigger_reason=rewrite_reason, original_query=question, recent_message_count=len(recent_messages))
        else:
            rewrite_summary = _default_rewrite_summary("skipped_no_model", trigger_reason=rewrite_reason, original_query=question, recent_message_count=len(recent_messages))
        _emit_rag_progress(host, run_id, "rewrite", "completed" if rewrite_summary.get("status") == "applied" else "skipped", title="Rewriting query", detail=str(rewrite_summary.get("status") or "not_run"), progress=0.28, metrics={"status": rewrite_summary.get("status")})
    else:
        _emit_rag_progress(host, run_id, "rewrite", "skipped", title="Rewriting query", detail="Question is already standalone", progress=0.28)

    first_query_specs: list[dict[str, Any]] = [{"label": "original", "query": question, "embedding": query_embedding, "required": True}]
    if rewritten_query:
        first_query_specs.append({"label": "rewrite", "query": rewritten_query, "embedding": embed_optional_query(host, active_profile, rewritten_query), "required": False})

    _emit_rag_progress(host, run_id, "retrieve", "running", title="Retrieving documents", detail="Searching", progress=0.34, metrics={"queryCount": len(first_query_specs)})
    candidate_chunks, retrieval_mode = search_candidates_for_queries(host, first_query_specs, document_ids)
    _emit_rag_progress(host, run_id, "retrieve", "completed" if candidate_chunks else "failed", title="Retrieving documents", detail="Retrieval finished", progress=0.42, metrics={"chunkCount": len(candidate_chunks), "mode": retrieval_mode})

    # Merge → Rerank → Gate pipeline
    document_structure = build_document_structure_cache(host, candidate_chunks)
    hydrated = hydrate_chunks_from_structure(candidate_chunks, document_structure)
    expanded_contexts, merge_summary = merge_parent_context(hydrated, host, document_structure=document_structure)
    reranked_chunks, rerank_summary = rerank_evidence(hydrated, question, expanded_contexts, rewritten_query=rewritten_query, config=config if config_with_key else None, api_key=api_key)
    packed_chunks = _pack_chunks(reranked_chunks)
    pack_summary = packing_summary(packed_chunks, expanded_contexts)
    decision, gate_summary = relevance_gate(reranked_chunks, is_second_retrieval=False)

    _emit_rag_progress(host, run_id, "rerank", "completed", title="Reranking evidence", detail=str(rerank_summary.get("status") or "not_run"), progress=0.52, metrics={"chunkCount": rerank_summary.get("chunkCount", 0), "topScore": rerank_summary.get("topScore")})
    _emit_rag_progress(host, run_id, "gate", "completed", title="Checking relevance", detail=str(gate_summary.get("decision") or "not_run"), progress=0.58, metrics={"decision": gate_summary.get("decision"), "topScore": gate_summary.get("topScore")})

    second_retrieval_summary = _default_second_retrieval_summary()
    if decision == "second_retrieval":
        _emit_rag_progress(host, run_id, "second_retrieval", "running", title="Running second retrieval", detail="First pass evidence was weak", progress=0.62)
        second_query_status = "fallback_original"
        second_query_reason = str(gate_summary.get("reason") or "low_relevance")
        second_query = rewritten_query or question
        if not rewritten_query or rewritten_query == question:
            try:
                second_query = build_second_retrieval_query(config if config_with_key else None, api_key, question, rewritten_query, recent_messages)
                if second_query.strip() != question.strip():
                    second_query_status = "applied"
            except Exception as exc:
                if isinstance(exc, WorkflowCancelled):
                    raise
                logger.warning("Second retrieval rewrite failed: %s", exc)
                second_query = rewritten_query or question
                second_query_status = "failed_fallback"
        else:
            second_query_status = "reuse_rewrite"

        second_specs = [{"label": "second_retrieval", "query": second_query, "embedding": embed_optional_query(host, active_profile, second_query), "required": False}]
        second_candidates, second_mode = search_candidates_for_queries(host, second_specs, document_ids)
        first_chunk_ids = {_chunk_id(c) for c in reranked_chunks if _chunk_id(c)}
        additional_count = sum(1 for c in second_candidates if _chunk_id(c) and _chunk_id(c) not in first_chunk_ids)
        merged = merge_candidate_chunks(reranked_chunks, second_candidates)
        retrieval_mode = combine_retrieval_modes(retrieval_mode, second_mode)

        document_structure2 = build_document_structure_cache(host, merged)
        hydrated2 = hydrate_chunks_from_structure(merged, document_structure2)
        expanded_contexts, merge_summary = merge_parent_context(hydrated2, host, document_structure=document_structure2)
        reranked_chunks, rerank_summary = rerank_evidence(hydrated2, question, expanded_contexts, rewritten_query=rewritten_query or second_query, config=config if config_with_key else None, api_key=api_key)
        packed_chunks = _pack_chunks(reranked_chunks)
        pack_summary = packing_summary(packed_chunks, expanded_contexts)
        decision, gate_summary = relevance_gate(reranked_chunks, is_second_retrieval=True)
        second_retrieval_summary = {"status": second_query_status, "used": True, "queryPreview": _truncate_text(second_query, 80), "additionalChunkCount": additional_count, "reason": second_query_reason}
        _emit_rag_progress(host, run_id, "second_retrieval", "completed", title="Running second retrieval", detail=second_query_status, progress=0.68, metrics={"additionalChunkCount": additional_count})
    else:
        _emit_rag_progress(host, run_id, "second_retrieval", "skipped", title="Running second retrieval", detail="First pass evidence was sufficient", progress=0.68)

    _emit_rag_progress(host, run_id, "pack", "completed", title="Packing context", detail="Evidence context is ready", progress=0.74, metrics={"passageCount": pack_summary.get("passageCount", 0), "totalChars": pack_summary.get("totalChars", 0)})

    if decision == "no_relevant_content" or not packed_chunks:
        _emit_rag_progress(host, run_id, "generate", "skipped", title="Generating answer", detail="No relevant evidence", progress=0.88)
        result = status_answer("当前资料中没有足够证据回答这个问题。", "no_hits", retrieval_mode=retrieval_mode,
                               rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, audit_summary=_default_audit_summary("not_run"), failure_reason="relevance_gate_rejected"))
        result["answer"].update(query_embedding_meta)
        return result

    if not config_with_key:
        if retrieval_mode == "fts5":
            _emit_rag_progress(host, run_id, "generate", "skipped", title="Generating answer", detail="No model configured", progress=0.88)
            result = status_answer("当前资料中没有足够证据回答这个问题。", "no_hits",
                                   rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, failure_reason="model_not_configured"))
            result["answer"].update(query_embedding_meta)
            return result
        raise RuntimeError("Knowledge Q&A model is not configured")

    if uses_degraded_lexical_fallback(retrieval_mode, packed_chunks):
        _emit_rag_progress(host, run_id, "generate", "skipped", title="Generating answer", detail="Using excerpt fallback", progress=0.88)
        result = excerpt_fallback_answer(packed_chunks, "contains_only_fallback", retrieval_mode=retrieval_mode,
                                         rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, audit_summary=_default_audit_summary("not_run"), failure_reason="contains_only_fallback"))
        result["answer"].update(query_embedding_meta)
        return result

    passages_text = build_passages(packed_chunks, expanded_contexts, episodic_memory=episodic_memory)
    _check_cancelled(host, run_id)
    _emit_rag_progress(host, run_id, "generate", "running", title="Generating answer", detail="Calling model", progress=0.82)
    try:
        answer_data = try_langchain_qa(config, api_key, question, passages_text)
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("Model answer failed, using excerpt fallback: %s", exc)
        _emit_rag_progress(host, run_id, "generate", "failed", title="Generating answer", detail="Model failed; excerpt fallback", progress=0.88)
        result = excerpt_fallback_answer(packed_chunks, f"model_error: {exc}", retrieval_mode=retrieval_mode,
                                         rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, audit_summary=_default_audit_summary("clean"), failure_reason=f"model_error: {exc}"))
        result["answer"].update(query_embedding_meta)
        return result

    _check_cancelled(host, run_id)
    _emit_rag_progress(host, run_id, "generate", "completed", title="Generating answer", detail="Answer generated", progress=0.88)

    answer_mode = answer_data.get("answerMode")
    raw_citations = answer_data.get("citations", [])
    _emit_rag_progress(host, run_id, "audit", "running", title="Auditing citations", detail="Checking cited chunks", progress=0.92, metrics={"citationCount": len(raw_citations) if isinstance(raw_citations, list) else 0})
    citations, rejected_citations, audit_status = audit_citations(raw_citations, packed_chunks)
    audit_summary = _default_audit_summary(audit_status, len(raw_citations) if isinstance(raw_citations, list) else 0, len(citations), len(rejected_citations))
    rag_trace = build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, audit_summary=audit_summary)
    _emit_rag_progress(host, run_id, "audit", "completed", title="Auditing citations", detail=audit_status, progress=0.96, metrics={"validCitations": len(citations), "rejectedCitations": len(rejected_citations)})

    if answer_mode == "no_relevant_content":
        return {"status": "completed", "answer": {"answer": str(answer_data.get("answer") or "当前资料中没有足够证据回答这个问题。").strip(), "answerMode": "no_relevant_content", "retrievalMode": retrieval_mode, "retrievalStatus": "no_hits", "citations": [], "ragTrace": rag_trace, **query_embedding_meta}}

    if not citations:
        result = status_answer("当前资料中没有足够证据回答这个问题。", "no_hits",
                               rag_trace=build_rag_trace(readiness_status=readiness_status, retrieval_mode=retrieval_mode, chunks=packed_chunks, query_rewrite_used=rewritten_query is not None, rewrite_summary=rewrite_summary, merge_summary=merge_summary, packing_summary=pack_summary, rerank_summary=rerank_summary, gate_summary=gate_summary, second_retrieval_summary=second_retrieval_summary, audit_summary=audit_summary, failure_reason="citation_audit_failed"))
        result["answer"].update(query_embedding_meta)
        return result

    if config.get("id"):
        try:
            host.record_workflow_cost(config["id"], estimate_workflow_cost(config))
        except Exception as exc:
            logger.warning("Failed to record cost: %s", exc)

    return {"status": "completed", "answer": {"answer": str(answer_data.get("answer") or "").strip(), "answerMode": "grounded", "retrievalMode": retrieval_mode, "retrievalStatus": "ready", "citations": citations, "ragTrace": rag_trace, **query_embedding_meta}}
