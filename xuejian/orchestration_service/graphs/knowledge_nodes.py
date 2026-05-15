from __future__ import annotations

import logging
from typing import Any

from ..providers.embedding_runtime import QueryEmbeddingRuntimeError, embed_query_with_resilience
from ..tools.qa_tools import TOOL_REGISTRY
from ..workflows import knowledge_qa as workflow
from .artifact_store import persist_graph_artifacts
from .knowledge_events import build_artifact_refs, build_rag_artifacts, emit_event, emit_progress, save_checkpoint
from .knowledge_state import GRAPH_VERSION, RUNTIME, KnowledgeGraphState

logger = logging.getLogger(__name__)


EMBEDDING_STATUS_MESSAGES = {
    "embedding_missing": "所选资料尚未完成当前 embedding 配置的向量化。请先生成文档向量后再提问。",
    "embedding_stale": "所选资料的向量已过期。请重新生成文档向量后再提问。",
}


def _invoke_tool(tool_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    return TOOL_REGISTRY.invoke(tool_key, payload, caller=RUNTIME)


def _host(state: KnowledgeGraphState) -> Any:
    return state["host_ref"]


def _run_id(state: KnowledgeGraphState) -> str:
    return str(state.get("run_id") or "")


def _retrieval_summary(chunks: list[dict[str, Any]], retrieval_mode: str) -> dict[str, Any]:
    return {
        "chunkCount": len(chunks),
        "retrievedDocumentCount": len(
            {
                document_id
                for chunk in chunks
                for document_id in [chunk.get("documentId")]
                if isinstance(document_id, str) and document_id
            }
        ),
        "lexicalStatus": workflow._lexical_status(chunks),
        "retrievalMode": retrieval_mode,
    }


def _query_embedding_meta_from_error(exc: Exception) -> dict[str, Any]:
    status, _message = workflow._embedding_error_status(exc)
    attempts = exc.attempts if isinstance(exc, QueryEmbeddingRuntimeError) else 0
    latency_ms = exc.latency_ms if isinstance(exc, QueryEmbeddingRuntimeError) else None
    return {
        "queryEmbeddingStatus": status,
        "cacheHit": False,
        "attempts": attempts,
        "latencyMs": round(latency_ms, 2) if isinstance(latency_ms, (int, float)) else None,
        "fallbackReason": status,
    }


def _result_failure_reason(state: KnowledgeGraphState) -> str | None:
    error_category = state.get("error_category")
    if isinstance(error_category, str) and error_category:
        return error_category

    answer_data = state.get("answer_data")
    if isinstance(answer_data, dict) and answer_data.get("answerMode") == "excerpt_fallback":
        fallback_reason = answer_data.get("fallbackReason")
        if isinstance(fallback_reason, str) and fallback_reason:
            return fallback_reason

    if state.get("gate_decision") == "no_relevant_content":
        return "relevance_gate_rejected"

    retrieval_status = state.get("retrieval_status")
    if isinstance(retrieval_status, str) and retrieval_status not in {"", "ready", "no_hits"}:
        return retrieval_status

    return None


def _quality_audit_status(raw_status: str) -> str:
    normalized = raw_status.strip().lower()
    if normalized in {"passed", "failed", "skipped", "not_applicable"}:
        return normalized
    if normalized == "clean":
        return "passed"
    if normalized in {"filtered", "all_rejected"}:
        return "failed"
    if normalized in {"", "not_run"}:
        return "not_applicable"
    return "not_applicable"


def _build_quality_envelope(state: KnowledgeGraphState, answer_payload: dict[str, Any]) -> dict[str, Any]:
    answer_mode = str(answer_payload.get("answerMode") or "no_relevant_content")
    retrieval_mode = str(answer_payload.get("retrievalMode") or state.get("retrieval_mode") or "hybrid")
    error_category = str(state.get("error_category") or "")
    audit_summary = state.get("audit_summary") or {}
    audit_status = _quality_audit_status(str(audit_summary.get("auditStatus") or "not_applicable"))
    gate_decision = str(state.get("gate_decision") or "not_run")

    grounding_status = "not_applicable"
    risk_level = "medium"
    confidence = 0.0
    blocking_reasons: list[str] = []
    review_required = False

    if answer_mode == "grounded" and audit_status == "passed" and retrieval_mode == "hybrid":
        grounding_status = "grounded"
        risk_level = "low"
        confidence = 0.82
    elif answer_mode == "grounded":
        grounding_status = "partially_grounded"
        risk_level = "high"
        confidence = 0.35
        review_required = True
    elif answer_mode == "excerpt_fallback":
        grounding_status = "ungrounded"
        audit_status = "not_applicable"
        risk_level = "high"
        confidence = 0.2
        review_required = True
    elif answer_mode == "no_relevant_content":
        grounding_status = "not_applicable"
        audit_status = audit_status if audit_status != "passed" else "not_applicable"
        risk_level = "medium"
        confidence = 0.0

    if retrieval_mode == "fts5" and answer_mode != "no_relevant_content":
        grounding_status = "ungrounded"
        risk_level = "high"
        confidence = min(confidence, 0.2)
        review_required = True
        blocking_reasons.append("lexical_only_evidence")

    if error_category:
        blocking_reasons.append(error_category)

    if gate_decision == "no_relevant_content" and answer_mode == "no_relevant_content":
        blocking_reasons.append("insufficient_evidence")

    if audit_status == "failed":
        review_required = True
        risk_level = "high"
        if answer_mode == "grounded":
            grounding_status = "partially_grounded"
        blocking_reasons.append("citation_audit_failed")

    deduped_reasons: list[str] = []
    seen_reasons: set[str] = set()
    for reason in blocking_reasons:
        if reason and reason not in seen_reasons:
            seen_reasons.add(reason)
            deduped_reasons.append(reason)

    return {
        "groundingStatus": grounding_status,
        "auditStatus": audit_status,
        "confidence": confidence,
        "riskLevel": risk_level,
        "reviewRequired": review_required,
        "blockingReasons": deduped_reasons,
    }


def _validate_quality_envelope(envelope: object) -> bool:
    if not isinstance(envelope, dict):
        return False
    if not isinstance(envelope.get("groundingStatus"), str):
        return False
    if not isinstance(envelope.get("auditStatus"), str):
        return False

    confidence = envelope.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        return False

    if not isinstance(envelope.get("riskLevel"), str):
        return False
    if not isinstance(envelope.get("reviewRequired"), bool):
        return False

    blocking_reasons = envelope.get("blockingReasons")
    if not isinstance(blocking_reasons, list):
        return False
    return all(isinstance(reason, str) for reason in blocking_reasons)


def _invalid_quality_envelope(envelope: object, error_category: str | None) -> dict[str, Any]:
    blocking_reasons: list[str] = ["quality_envelope_invalid"]
    if isinstance(error_category, str) and error_category:
        blocking_reasons.append(error_category)
    if isinstance(envelope, dict):
        for reason in envelope.get("blockingReasons") or []:
            if isinstance(reason, str) and reason:
                blocking_reasons.append(reason)
    return {
        "groundingStatus": "not_applicable",
        "auditStatus": "not_applicable",
        "confidence": 0.0,
        "riskLevel": "high",
        "reviewRequired": True,
        "blockingReasons": list(dict.fromkeys(blocking_reasons)),
    }


def initialize_run(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    workflow._check_cancelled(host, run_id)

    config_with_key = getattr(host, "get_config_for_workflow", lambda _workflow_type: None)("knowledge_qa")
    config: dict[str, Any] = {}
    api_key = ""
    if isinstance(config_with_key, tuple) and len(config_with_key) == 2:
        config, api_key = config_with_key

    emit_event(
        host,
        run_id,
        "started",
        "KnowledgeGraph QA 开始",
        progress=0.05,
        payload={
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "questionPreview": workflow._truncate_text(state.get("question", ""), 60),
            "documentCount": len(state.get("document_ids") or []),
        },
    )
    return {
        "runtime": RUNTIME,
        "graph_version": GRAPH_VERSION,
        "config": config,
        "api_key": api_key,
        "query_embedding_meta": {
            "queryEmbeddingStatus": "missing",
            "cacheHit": False,
            "attempts": 0,
            "latencyMs": None,
        },
        "rewrite_summary": workflow._default_rewrite_summary(),
        "retrieval_mode": "hybrid",
        "retrieval_status": "ready",
        "retrieval_summary": _retrieval_summary([], "hybrid"),
        "merge_summary": workflow._default_merge_summary(),
        "rerank_summary": workflow._default_rerank_summary(),
        "gate_summary": workflow._default_gate_summary(),
        "gate_decision": "not_run",
        "second_retrieval_summary": workflow._default_second_retrieval_summary(),
        "remediation_count": 0,
        "remediation_reason": None,
        "remediation_summary": workflow._default_second_retrieval_summary(),
        "candidate_chunks": [],
        "expanded_contexts": {},
        "packed_chunks": [],
        "citations": [],
        "audit_summary": workflow._default_audit_summary(),
        "artifact_refs": {},
        "fallback_used": False,
    }


def check_embedding_readiness(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    document_ids = state.get("document_ids") or []
    emit_progress(
        host,
        run_id,
        "query_embedding",
        "running",
        title="Understanding question",
        detail="Checking embedding readiness",
        progress=0.08,
        metrics={"documentCount": len(document_ids)},
    )

    active_profile = getattr(host, "get_active_embedding_profile", lambda: None)()
    if active_profile is None:
        emit_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail="No active embedding profile",
            progress=0.1,
            metrics={},
        )
        return {
            "active_profile": None,
            "readiness_status": "embedding_missing",
            "retrieval_status": "embedding_missing",
            "query_embedding_status": "missing",
            "error_category": "embedding_missing",
        }

    readiness_status = workflow._embedding_readiness_status(host, active_profile, document_ids)
    if readiness_status != "ready":
        emit_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail=readiness_status,
            progress=0.1,
            metrics={"readinessStatus": readiness_status},
        )
        return {
            "active_profile": active_profile,
            "readiness_status": readiness_status,
            "retrieval_status": readiness_status,
            "query_embedding_status": "missing",
            "error_category": readiness_status,
        }

    return {
        "active_profile": active_profile,
        "readiness_status": "ready",
        "retrieval_status": "ready",
        "error_category": None,
    }


def embed_question(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    workflow._check_cancelled(host, run_id)
    active_profile = state.get("active_profile")
    if not isinstance(active_profile, dict):
        return {}

    try:
        query_embedding_result = embed_query_with_resilience(
            host,
            active_profile,
            state.get("question", ""),
            task_type="RETRIEVAL_QUERY",
        )
        emit_progress(
            host,
            run_id,
            "query_embedding",
            "completed",
            title="Understanding question",
            detail="Query embedding is ready",
            progress=0.18,
            metrics={
                "cacheHit": query_embedding_result.cache_hit,
                "attempts": query_embedding_result.attempts,
                "latencyMs": round(query_embedding_result.latency_ms, 2),
            },
        )
        return {
            "query_embedding": query_embedding_result.vector,
            "query_embedding_status": query_embedding_result.status,
            "query_embedding_meta": {
                "queryEmbeddingStatus": query_embedding_result.status,
                "cacheHit": query_embedding_result.cache_hit,
                "attempts": query_embedding_result.attempts,
                "latencyMs": round(query_embedding_result.latency_ms, 2),
            },
        }
    except Exception as exc:
        if isinstance(exc, workflow.WorkflowCancelled):
            raise
        status, _message = workflow._embedding_error_status(exc)
        logger.warning("KnowledgeGraph query embedding failed: %s", exc)
        emit_progress(
            host,
            run_id,
            "query_embedding",
            "failed",
            title="Understanding question",
            detail=status,
            progress=0.18,
            metrics={"attempts": _query_embedding_meta_from_error(exc).get("attempts", 0)},
        )
        return {
            "query_embedding": None,
            "query_embedding_status": status,
            "query_embedding_meta": _query_embedding_meta_from_error(exc),
            "retrieval_status": status,
        }


def load_conversation_context(state: KnowledgeGraphState) -> dict[str, Any]:
    recent_messages = workflow._recent_messages_for_rewrite(
        _host(state),
        state.get("conversation_id"),
    )
    return {"recent_messages": recent_messages}


def maybe_rewrite_query(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    question = state.get("question", "")
    recent_messages = state.get("recent_messages") or []
    rewrite_reason = workflow._rewrite_trigger_reason(question, recent_messages)
    rewrite_summary = workflow._default_rewrite_summary(
        trigger_reason=rewrite_reason,
        original_query=question,
        recent_message_count=len(recent_messages),
    )
    if not rewrite_reason:
        emit_progress(
            host,
            run_id,
            "rewrite",
            "skipped",
            title="Rewriting query",
            detail="Question is already standalone",
            progress=0.24,
            metrics={"status": rewrite_summary.get("status")},
        )
        return {"rewrite_summary": rewrite_summary, "rewritten_query": None}

    emit_progress(
        host,
        run_id,
        "rewrite",
        "running",
        title="Rewriting query",
        detail="Resolving the question against recent context",
        progress=0.2,
        metrics={"recentMessageCount": len(recent_messages), "reason": rewrite_reason},
    )

    config = state.get("config") or {}
    api_key = str(state.get("api_key") or "")
    if not config:
        rewrite_summary = workflow._default_rewrite_summary(
            "skipped_no_model",
            trigger_reason=rewrite_reason,
            original_query=question,
            recent_message_count=len(recent_messages),
        )
        emit_progress(
            host,
            run_id,
            "rewrite",
            "skipped",
            title="Rewriting query",
            detail="skipped_no_model",
            progress=0.26,
            metrics={"status": rewrite_summary.get("status")},
        )
        return {"rewrite_summary": rewrite_summary, "rewritten_query": None}

    try:
        rewrite_candidate = workflow._rewrite_query(config, api_key, question, recent_messages)
        if rewrite_candidate.strip() != question.strip():
            rewritten_query = rewrite_candidate
            rewrite_summary = workflow._default_rewrite_summary(
                "applied",
                trigger_reason=rewrite_reason,
                original_query=question,
                rewritten_query=rewritten_query,
                recent_message_count=len(recent_messages),
            )
        else:
            rewritten_query = None
            rewrite_summary = workflow._default_rewrite_summary(
                "same_as_original",
                trigger_reason=rewrite_reason,
                original_query=question,
                rewritten_query=rewrite_candidate,
                recent_message_count=len(recent_messages),
            )
    except Exception as exc:
        if isinstance(exc, workflow.WorkflowCancelled):
            raise
        logger.warning("KnowledgeGraph rewrite failed: %s", exc)
        rewritten_query = None
        rewrite_summary = workflow._default_rewrite_summary(
            "failed",
            trigger_reason=rewrite_reason,
            original_query=question,
            recent_message_count=len(recent_messages),
        )

    emit_progress(
        host,
        run_id,
        "rewrite",
        "completed" if rewrite_summary.get("status") == "applied" else "skipped",
        title="Rewriting query",
        detail=str(rewrite_summary.get("status") or "not_run"),
        progress=0.26,
        metrics={"status": rewrite_summary.get("status")},
    )
    return {"rewrite_summary": rewrite_summary, "rewritten_query": rewritten_query}


def retrieve_evidence(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    workflow._check_cancelled(host, run_id)
    document_ids = state.get("document_ids") or []
    question = state.get("question", "")
    rewritten_query = state.get("rewritten_query")
    emit_progress(
        host,
        run_id,
        "retrieve",
        "running",
        title="Retrieving documents",
        detail="Searching document chunks",
        progress=0.3,
        metrics={"documentCount": len(document_ids)},
    )

    first_result = _invoke_tool(
        "retrieve_evidence",
        {
            "question": question,
            "document_ids": document_ids,
            "host_ref": host,
        },
    )
    candidate_chunks = list(first_result.get("chunks") or [])
    retrieval_mode = str(first_result.get("retrieval_mode") or "hybrid")

    if rewritten_query:
        rewrite_result = _invoke_tool(
            "retrieve_evidence",
            {
                "question": question,
                "document_ids": document_ids,
                "host_ref": host,
                "rewritten_query": rewritten_query,
            },
        )
        candidate_chunks = workflow._merge_candidate_chunks(candidate_chunks, rewrite_result.get("chunks") or [])
        retrieval_mode = workflow._combine_retrieval_modes(
            retrieval_mode,
            str(rewrite_result.get("retrieval_mode") or "hybrid"),
        )

    summary = _retrieval_summary(candidate_chunks, retrieval_mode)
    emit_progress(
        host,
        run_id,
        "retrieve",
        "completed",
        title="Retrieving documents",
        detail="Candidate retrieval finished",
        progress=0.38,
        metrics={"chunkCount": len(candidate_chunks), "retrievalMode": retrieval_mode},
    )
    return {
        "candidate_chunks": candidate_chunks,
        "retrieval_mode": retrieval_mode,
        "retrieval_summary": summary,
    }


def merge_parent_context(state: KnowledgeGraphState) -> dict[str, Any]:
    result = _invoke_tool(
        "merge_parent_context",
        {
            "chunks": state.get("candidate_chunks") or [],
            "host_ref": _host(state),
        },
    )
    return {
        "expanded_contexts": result.get("expanded_contexts") or {},
        "merge_summary": result.get("merge_summary") or workflow._default_merge_summary(),
    }


def rerank_evidence(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    candidate_chunks = state.get("candidate_chunks") or []
    emit_progress(
        host,
        run_id,
        "rerank",
        "running",
        title="Reranking evidence",
        detail="Sorting retrieved evidence by relevance",
        progress=0.42,
        metrics={"chunkCount": len(candidate_chunks)},
    )
    result = _invoke_tool(
        "rerank_evidence",
        {
            "chunks": candidate_chunks,
            "question": state.get("question", ""),
            "expanded_contexts": state.get("expanded_contexts") or {},
            "rewritten_query": state.get("rewritten_query"),
            "config_ref": state.get("config") or None,
            "api_key_ref": str(state.get("api_key") or ""),
        },
    )
    rerank_summary = result.get("rerank_summary") or workflow._default_rerank_summary()
    emit_progress(
        host,
        run_id,
        "rerank",
        "completed",
        title="Reranking evidence",
        detail=str(rerank_summary.get("status") or "completed"),
        progress=0.5,
        metrics={
            "chunkCount": rerank_summary.get("chunkCount", 0),
            "topScore": rerank_summary.get("topScore"),
        },
    )
    return {
        "candidate_chunks": result.get("chunks") or [],
        "rerank_summary": rerank_summary,
    }


def relevance_gate(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    emit_progress(
        host,
        run_id,
        "gate",
        "running",
        title="Checking relevance",
        detail="Evaluating whether evidence is sufficient",
        progress=0.52,
        metrics={},
    )
    result = _invoke_tool(
        "grade_retrieval_relevance",
        {
            "chunks": state.get("candidate_chunks") or [],
            "is_second_retrieval": False,
        },
    )
    gate_summary = result.get("gate_summary") or workflow._default_gate_summary()
    decision = str(result.get("decision") or gate_summary.get("decision") or "no_relevant_content")
    emit_progress(
        host,
        run_id,
        "gate",
        "completed",
        title="Checking relevance",
        detail=decision,
        progress=0.58,
        metrics={
            "decision": decision,
            "topScore": gate_summary.get("topScore"),
        },
    )
    return {
        "gate_decision": decision,
        "gate_summary": gate_summary,
    }


def maybe_remediate_retrieval(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    workflow._check_cancelled(host, run_id)

    question = state.get("question", "")
    rewritten_query = state.get("rewritten_query")
    recent_messages = state.get("recent_messages") or []
    config = state.get("config") or None
    api_key = str(state.get("api_key") or "")
    remediation_count = int(state.get("remediation_count") or 0)
    second_query_status = "fallback_original"
    second_query_reason = str((state.get("gate_summary") or {}).get("reason") or "low_relevance")
    second_query = rewritten_query or question

    if not rewritten_query or rewritten_query == question:
        try:
            second_query = workflow._build_second_retrieval_query(
                config,
                api_key,
                question,
                rewritten_query,
                recent_messages,
            )
            if second_query.strip() != question.strip():
                second_query_status = "applied"
        except Exception as exc:
            if isinstance(exc, workflow.WorkflowCancelled):
                raise
            logger.warning("KnowledgeGraph second retrieval rewrite failed: %s", exc)
            second_query = rewritten_query or question
            second_query_status = "failed_fallback"
    else:
        second_query_status = "reuse_rewrite"

    emit_progress(
        host,
        run_id,
        "second_retrieval",
        "running",
        title="Running second retrieval",
        detail="First pass evidence was weak",
        progress=0.6,
        metrics={"reason": second_query_reason},
    )
    second_result = _invoke_tool(
        "retrieve_evidence",
        {
            "question": question,
            "document_ids": state.get("document_ids") or [],
            "host_ref": host,
            "rewritten_query": second_query,
        },
    )
    first_chunk_ids = {
        workflow._chunk_id(chunk)
        for chunk in state.get("candidate_chunks") or []
        if workflow._chunk_id(chunk)
    }
    additional_chunk_count = sum(
        1
        for chunk in second_result.get("chunks") or []
        if workflow._chunk_id(chunk) and workflow._chunk_id(chunk) not in first_chunk_ids
    )
    merged_candidates = workflow._merge_candidate_chunks(
        state.get("candidate_chunks") or [],
        second_result.get("chunks") or [],
    )
    retrieval_mode = workflow._combine_retrieval_modes(
        str(state.get("retrieval_mode") or "hybrid"),
        str(second_result.get("retrieval_mode") or "hybrid"),
    )

    merge_result = _invoke_tool(
        "merge_parent_context",
        {
            "chunks": merged_candidates,
            "host_ref": host,
        },
    )
    rerank_result = _invoke_tool(
        "rerank_evidence",
        {
            "chunks": merged_candidates,
            "question": question,
            "expanded_contexts": merge_result.get("expanded_contexts") or {},
            "rewritten_query": rewritten_query or second_query,
            "config_ref": config,
            "api_key_ref": api_key,
        },
    )
    gate_result = _invoke_tool(
        "grade_retrieval_relevance",
        {
            "chunks": rerank_result.get("chunks") or [],
            "is_second_retrieval": True,
        },
    )
    second_retrieval_summary = {
        "status": second_query_status,
        "used": True,
        "queryPreview": workflow._truncate_text(second_query, 80),
        "additionalChunkCount": additional_chunk_count,
        "reason": second_query_reason,
    }
    second_pass_chunks = rerank_result.get("chunks") or []
    retrieval_status = str(state.get("retrieval_status") or "ready")
    gate_decision = str(gate_result.get("decision") or "no_relevant_content")
    if gate_decision == "no_relevant_content":
        retrieval_status = "no_hits" if not second_pass_chunks else "low_relevance"

    emit_progress(
        host,
        run_id,
        "second_retrieval",
        "completed",
        title="Running second retrieval",
        detail=second_query_status,
        progress=0.7,
        metrics={"additionalChunkCount": additional_chunk_count, "status": second_query_status},
    )
    return {
        "candidate_chunks": second_pass_chunks,
        "expanded_contexts": merge_result.get("expanded_contexts") or {},
        "merge_summary": merge_result.get("merge_summary") or workflow._default_merge_summary(),
        "rerank_summary": rerank_result.get("rerank_summary") or workflow._default_rerank_summary(),
        "gate_decision": gate_decision,
        "gate_summary": gate_result.get("gate_summary") or workflow._default_gate_summary(),
        "retrieval_mode": retrieval_mode,
        "retrieval_status": retrieval_status,
        "retrieval_summary": _retrieval_summary(second_pass_chunks, retrieval_mode),
        "remediation_count": remediation_count + 1,
        "remediation_reason": second_query_reason,
        "remediation_summary": second_retrieval_summary,
        "second_retrieval_summary": second_retrieval_summary,
    }


def pack_context(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    candidate_chunks = state.get("candidate_chunks") or []
    emit_progress(
        host,
        run_id,
        "pack",
        "running",
        title="Packing context",
        detail="Preparing context for answer generation",
        progress=0.72,
        metrics={"chunkCount": len(candidate_chunks)},
    )
    result = _invoke_tool(
        "pack_context",
        {
            "chunks": candidate_chunks,
            "expanded_contexts": state.get("expanded_contexts") or {},
            "episodic_memory": None,
        },
    )
    packing_summary = result.get("packing_summary") or workflow._default_packing_summary()
    packed_chunks = result.get("packed_chunks") or []
    emit_progress(
        host,
        run_id,
        "pack",
        "completed",
        title="Packing context",
        detail="Evidence context is ready",
        progress=0.76,
        metrics={
            "passageCount": packing_summary.get("passageCount", 0),
            "totalChars": packing_summary.get("totalChars", 0),
        },
    )
    save_checkpoint(
        host,
        run_id,
        "knowledge_graph",
        "retrieval_ready",
        {
            "runtime": RUNTIME,
            "graphVersion": GRAPH_VERSION,
            "retrievalMode": state.get("retrieval_mode"),
            "gateDecision": state.get("gate_decision"),
            "chunkCount": len(packed_chunks),
        },
    )
    return {
        "packed_chunks": packed_chunks,
        "packing_summary": packing_summary,
    }


def write_answer(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    workflow._check_cancelled(host, run_id)

    retrieval_mode = str(state.get("retrieval_mode") or "hybrid")
    packed_chunks = state.get("packed_chunks") or []
    expanded_contexts = state.get("expanded_contexts") or {}
    question = state.get("question", "")
    query_embedding_meta = state.get("query_embedding_meta") or {}

    if state.get("gate_decision") == "no_relevant_content" or not packed_chunks:
        retrieval_status = str(state.get("retrieval_status") or "no_hits")
        if retrieval_status == "ready":
            retrieval_status = "no_hits"
        emit_progress(
            host,
            run_id,
            "generate",
            "skipped",
            title="Generating answer",
            detail="No relevant evidence passed the gate",
            progress=0.88,
            metrics={"decision": state.get("gate_decision")},
        )
        return {
            "answer_data": {
                "answer": "当前资料中没有足够证据回答这个问题。",
                "answerMode": "no_relevant_content",
                "citations": [],
            },
            "raw_citations": [],
            "retrieval_status": retrieval_status,
            "query_embedding_meta": query_embedding_meta,
        }

    config = state.get("config") or {}
    api_key = str(state.get("api_key") or "")
    if not config:
        if retrieval_mode == "fts5":
            emit_progress(
                host,
                run_id,
                "generate",
                "skipped",
                title="Generating answer",
                detail="No model is configured",
                progress=0.88,
                metrics={},
            )
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
        fallback_reason = "contains_only_fallback" if workflow._uses_degraded_lexical_fallback(retrieval_mode, packed_chunks) else "lexical_only"
        retrieval_status = str(state.get("retrieval_status") or "ready")
        emit_progress(
            host,
            run_id,
            "generate",
            "skipped",
            title="Generating answer",
            detail="Using excerpt fallback",
            progress=0.88,
            metrics={},
        )
        fallback_result = workflow._excerpt_fallback_answer(
            packed_chunks,
            fallback_reason,
            retrieval_status=retrieval_status,
            retrieval_mode=retrieval_mode,
        )
        return {
            "answer_data": fallback_result.get("answer"),
            "raw_citations": (fallback_result.get("answer") or {}).get("citations") or [],
            "retrieval_status": (fallback_result.get("answer") or {}).get("retrievalStatus") or "ready",
        }

    passages_text = workflow._build_passages(packed_chunks, expanded_contexts)
    emit_progress(
        host,
        run_id,
        "generate",
        "running",
        title="Generating answer",
        detail="Calling the configured model",
        progress=0.82,
        metrics={},
    )
    try:
        answer_data = workflow._try_langchain_qa(config, api_key, question, passages_text)
    except Exception as exc:
        if isinstance(exc, workflow.WorkflowCancelled):
            raise
        logger.warning("KnowledgeGraph answer generation failed, using excerpt fallback: %s", exc)
        emit_progress(
            host,
            run_id,
            "generate",
            "failed",
            title="Generating answer",
            detail="Model generation failed; using excerpt fallback",
            progress=0.88,
            metrics={},
        )
        fallback_result = workflow._excerpt_fallback_answer(
            packed_chunks,
            f"model_error: {exc}",
            retrieval_mode=retrieval_mode,
        )
        return {
            "answer_data": fallback_result.get("answer"),
            "raw_citations": (fallback_result.get("answer") or {}).get("citations") or [],
            "retrieval_status": (fallback_result.get("answer") or {}).get("retrievalStatus") or "ready",
        }

    emit_progress(
        host,
        run_id,
        "generate",
        "completed",
        title="Generating answer",
        detail="Answer text generated",
        progress=0.88,
        metrics={},
    )
    return {
        "answer_data": answer_data,
        "raw_citations": answer_data.get("citations", []),
        "retrieval_status": "ready" if answer_data.get("answerMode") == "grounded" else "no_hits",
    }


def audit_citations(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    answer_data = state.get("answer_data")
    if not isinstance(answer_data, dict) or answer_data.get("answerMode") != "grounded":
        return {
            "citations": [],
            "audit_summary": workflow._default_audit_summary(),
        }

    raw_citations = answer_data.get("citations", [])
    emit_progress(
        host,
        run_id,
        "audit",
        "running",
        title="Auditing citations",
        detail="Checking cited chunks",
        progress=0.92,
        metrics={"citationCount": len(raw_citations) if isinstance(raw_citations, list) else 0},
    )
    result = _invoke_tool(
        "audit_citations",
        {
            "raw_citations": raw_citations,
            "chunks": state.get("packed_chunks") or [],
        },
    )
    audit_summary = result.get("audit_summary") or workflow._default_audit_summary()
    citations = result.get("citations") or []
    error_category = None if citations else "citation_audit_failed"

    emit_progress(
        host,
        run_id,
        "audit",
        "completed",
        title="Auditing citations",
        detail=str(result.get("audit_status") or audit_summary.get("auditStatus") or "clean"),
        progress=0.96,
        metrics={
            "validCitations": len(citations),
            "rejectedCitations": len(result.get("removed_ids") or []),
        },
    )
    return {
        "citations": citations,
        "audit_summary": audit_summary,
        "error_category": error_category,
    }


def build_rag_trace(state: KnowledgeGraphState) -> dict[str, Any]:
    result = _invoke_tool(
        "build_rag_trace",
        {
            "readiness_status": str(state.get("readiness_status") or "ready"),
            "retrieval_mode": str(state.get("retrieval_mode") or "hybrid"),
            "chunks": state.get("packed_chunks") or [],
            "query_rewrite_used": bool(state.get("rewritten_query")),
            "rewrite_summary": state.get("rewrite_summary") or workflow._default_rewrite_summary(),
            "merge_summary": state.get("merge_summary") or workflow._default_merge_summary(),
            "packing_summary": state.get("packing_summary") or workflow._default_packing_summary(),
            "rerank_summary": state.get("rerank_summary") or workflow._default_rerank_summary(),
            "gate_summary": state.get("gate_summary") or workflow._default_gate_summary(),
            "second_retrieval_summary": state.get("second_retrieval_summary") or workflow._default_second_retrieval_summary(),
            "audit_summary": state.get("audit_summary") or workflow._default_audit_summary(),
            "failure_reason": _result_failure_reason(state),
        },
    )
    return {"rag_trace": result.get("rag_trace") or {}}


def finalize_result(state: KnowledgeGraphState) -> dict[str, Any]:
    host = _host(state)
    run_id = _run_id(state)
    rag_trace = state.get("rag_trace") or workflow._build_rag_trace(
        readiness_status=str(state.get("readiness_status") or "ready"),
        retrieval_mode=str(state.get("retrieval_mode") or "hybrid"),
        chunks=state.get("packed_chunks") or [],
        query_rewrite_used=bool(state.get("rewritten_query")),
        rewrite_summary=state.get("rewrite_summary") or workflow._default_rewrite_summary(),
        merge_summary=state.get("merge_summary") or workflow._default_merge_summary(),
        packing_summary=state.get("packing_summary") or workflow._default_packing_summary(),
        rerank_summary=state.get("rerank_summary") or workflow._default_rerank_summary(),
        gate_summary=state.get("gate_summary") or workflow._default_gate_summary(),
        second_retrieval_summary=state.get("second_retrieval_summary") or workflow._default_second_retrieval_summary(),
        audit_summary=state.get("audit_summary") or workflow._default_audit_summary(),
        failure_reason=_result_failure_reason(state),
    )
    query_embedding_meta = state.get("query_embedding_meta") or {}
    error_category = state.get("error_category")
    retrieval_mode = str(state.get("retrieval_mode") or "hybrid")
    answer_data = state.get("answer_data")

    if error_category in EMBEDDING_STATUS_MESSAGES:
        result = workflow._status_answer(
            EMBEDDING_STATUS_MESSAGES[error_category],
            error_category,
            retrieval_mode=retrieval_mode,
            rag_trace=rag_trace,
        )
        result["answer"].update(query_embedding_meta)
    elif isinstance(answer_data, dict) and answer_data.get("answerMode") == "excerpt_fallback":
        answer_payload = dict(answer_data)
        answer_payload["ragTrace"] = rag_trace
        answer_payload.setdefault("retrievalMode", retrieval_mode)
        answer_payload.setdefault("retrievalStatus", str(state.get("retrieval_status") or "ready"))
        answer_payload.update(query_embedding_meta)
        result = {
            "status": "completed",
            "answer": answer_payload,
        }
    elif isinstance(answer_data, dict) and answer_data.get("answerMode") == "grounded" and state.get("citations"):
        result = {
            "status": "completed",
            "answer": {
                "answer": str(answer_data.get("answer") or "").strip(),
                "answerMode": "grounded",
                "retrievalMode": retrieval_mode,
                "retrievalStatus": "ready",
                "citations": state.get("citations") or [],
                "ragTrace": rag_trace,
                **query_embedding_meta,
            },
        }
    else:
        answer_text = "当前资料中没有足够证据回答这个问题。"
        if isinstance(answer_data, dict):
            candidate_answer = str(answer_data.get("answer") or "").strip()
            if candidate_answer:
                answer_text = candidate_answer
        result = workflow._status_answer(
            answer_text,
            str(state.get("retrieval_status") or "no_hits"),
            retrieval_mode=retrieval_mode,
            rag_trace=rag_trace,
        )
        result["answer"]["answerMode"] = "no_relevant_content"
        result["answer"].update(query_embedding_meta)

    answer_payload = result.get("answer") or {}
    quality_envelope = _build_quality_envelope(state, answer_payload)
    artifact_error_category = state.get("error_category")
    if not _validate_quality_envelope(quality_envelope):
        artifact_error_category = str(artifact_error_category or "quality_envelope_invalid")
        quality_envelope = _invalid_quality_envelope(quality_envelope, artifact_error_category)

    citations = result.get("answer", {}).get("citations") or []
    artifact_refs = build_artifact_refs(
        run_id,
        state.get("packed_chunks") or state.get("candidate_chunks") or [],
        citations,
    )
    artifacts = build_rag_artifacts(
        run_id,
        state.get("packed_chunks") or state.get("candidate_chunks") or [],
        citations,
        quality_envelope,
        answer_payload,
        retrieval_mode,
        str(result.get("answer", {}).get("retrievalStatus") or state.get("retrieval_status") or "ready"),
        error_category=str(artifact_error_category) if artifact_error_category else None,
    )
    result["runtime"] = str(state.get("runtime") or RUNTIME)
    result["graphVersion"] = str(state.get("graph_version") or GRAPH_VERSION)
    result["fallbackUsed"] = bool(state.get("fallback_used"))
    result["qualityEnvelope"] = quality_envelope
    if artifacts:
        result["artifacts"] = artifacts
    if artifact_refs:
        result["artifactRefs"] = artifact_refs
    artifact_store_ok, artifact_store_error = persist_graph_artifacts(host, run_id, artifacts)
    if not artifact_store_ok:
        artifact_error_category = str(artifact_error_category or artifact_store_error or "artifact_write_failed")
        quality_envelope["blockingReasons"] = list(
            dict.fromkeys([*(quality_envelope.get("blockingReasons") or []), "artifact_write_failed"])
        )
        result["qualityEnvelope"] = quality_envelope
        result["errorCategory"] = artifact_error_category

    emit_event(
        host,
        run_id,
        "completed",
        "KnowledgeGraph QA 完成",
        progress=1.0,
        payload={
            "runtime": result.get("runtime"),
            "graphVersion": result.get("graphVersion"),
            "fallbackUsed": result.get("fallbackUsed"),
            "answerMode": result.get("answer", {}).get("answerMode"),
            "retrievalStatus": result.get("answer", {}).get("retrievalStatus"),
            "citationCount": len(citations),
        },
    )
    save_checkpoint(
        host,
        run_id,
        "knowledge_graph",
        "finalized_result",
        {
            "runtime": result.get("runtime"),
            "graphVersion": result.get("graphVersion"),
            "fallbackUsed": result.get("fallbackUsed"),
            "answerMode": result.get("answer", {}).get("answerMode"),
            "retrievalStatus": result.get("answer", {}).get("retrievalStatus"),
            "artifactRefs": artifact_refs,
            "qualityEnvelope": quality_envelope,
            "errorCategory": artifact_error_category,
        },
    )
    return {
        "artifact_refs": artifact_refs,
        "artifacts": artifacts,
        "quality_envelope": quality_envelope,
        "error_category": artifact_error_category,
        "result": result,
    }
