from __future__ import annotations

from typing import Any

from ..workflows import knowledge_qa as workflow


def emit_event(
    host: Any,
    run_id: str,
    event_type: str,
    message: str,
    *,
    progress: float | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if not run_id:
        return
    emit = getattr(host, "emit_workflow_event", None)
    if not callable(emit):
        return
    try:
        emit(run_id, event_type, message=message, progress=progress, payload=payload)
    except Exception:
        return


def emit_progress(
    host: Any,
    run_id: str,
    step_key: str,
    status: str,
    *,
    title: str,
    detail: str | None = None,
    progress: float | None = None,
    metrics: dict[str, Any] | None = None,
) -> None:
    workflow._emit_rag_progress(
        host,
        run_id,
        step_key,
        status,
        title=title,
        detail=detail,
        progress=progress,
        metrics=metrics,
    )


def build_artifact_refs(
    run_id: str,
    chunks: list[dict[str, Any]],
    citations: list[dict[str, Any]],
) -> dict[str, Any]:
    if not run_id:
        return {}

    evidence_refs: list[str] = []
    seen_chunk_ids: set[str] = set()
    for citation in citations:
        chunk_id = citation.get("chunkId")
        if isinstance(chunk_id, str) and chunk_id and chunk_id not in seen_chunk_ids:
            seen_chunk_ids.add(chunk_id)
            evidence_refs.append(f"knowledge-qa://runs/{run_id}/evidence/{chunk_id}")

    if not evidence_refs:
        for chunk in chunks[:3]:
            chunk_id = workflow._chunk_id(chunk)
            if isinstance(chunk_id, str) and chunk_id and chunk_id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk_id)
                evidence_refs.append(f"knowledge-qa://runs/{run_id}/evidence/{chunk_id}")

    answer_ref = f"knowledge-qa://runs/{run_id}/answer"
    return {
        "evidence": evidence_refs,
        "answer": answer_ref,
    }


def _dedupe_strings(values: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = value.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return deduped


def _chunk_refs(run_id: str, chunk_ids: list[str]) -> list[str]:
    return [f"knowledge-qa://runs/{run_id}/evidence/{chunk_id}" for chunk_id in chunk_ids]


def _evidence_quality_envelope(
    chunk_ids: list[str],
    retrieval_mode: str,
    retrieval_status: str,
) -> dict[str, Any]:
    blocking_reasons: list[str] = []
    grounding_status = "grounded"
    audit_status = "not_applicable"
    confidence = 0.72
    risk_level = "low"
    review_required = False

    if retrieval_status in {"embedding_missing", "embedding_stale", "no_hits", "low_relevance"}:
        grounding_status = "not_applicable"
        confidence = 0.0
        risk_level = "high"
        review_required = True
        blocking_reasons.append(retrieval_status)

    if retrieval_mode == "fts5":
        grounding_status = "ungrounded"
        confidence = min(confidence, 0.2)
        risk_level = "high"
        review_required = True
        blocking_reasons.append("lexical_only_evidence")

    if not chunk_ids:
        grounding_status = "not_applicable"
        confidence = 0.0
        risk_level = "high"
        review_required = True
        blocking_reasons.append("missing_source_refs")

    return {
        "groundingStatus": grounding_status,
        "auditStatus": audit_status,
        "confidence": confidence,
        "riskLevel": risk_level,
        "reviewRequired": review_required,
        "blockingReasons": _dedupe_strings(blocking_reasons),
    }


def build_rag_artifacts(
    run_id: str,
    chunks: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    quality_envelope: dict[str, Any],
    answer_data: dict[str, Any],
    retrieval_mode: str,
    retrieval_status: str,
    *,
    error_category: str | None = None,
) -> dict[str, Any]:
    if not run_id:
        return {}

    chunk_ids = _dedupe_strings(
        [
            str(chunk_id)
            for chunk_id in [
                *(citation.get("chunkId") for citation in citations),
                *(workflow._chunk_id(chunk) for chunk in chunks),
            ]
            if isinstance(chunk_id, str) and chunk_id
        ]
    )
    document_ids = _dedupe_strings(
        [
            str(document_id)
            for document_id in (chunk.get("documentId") for chunk in chunks)
            if isinstance(document_id, str) and document_id
        ]
    )
    evidence_ref = f"knowledge-qa://runs/{run_id}/evidence"
    answer_ref = f"knowledge-qa://runs/{run_id}/answer"
    source_refs = _chunk_refs(run_id, chunk_ids)
    citation_refs = _chunk_refs(
        run_id,
        _dedupe_strings(
            [
                str(chunk_id)
                for chunk_id in (citation.get("chunkId") for citation in citations)
                if isinstance(chunk_id, str) and chunk_id
            ]
        ),
    )
    answer_mode = str(answer_data.get("answerMode") or "no_relevant_content")

    evidence_artifact = {
        "artifactId": evidence_ref,
        "artifactType": "evidence",
        "schemaVersion": 1,
        "summary": f"{len(chunk_ids)} chunks from {len(document_ids)} documents",
        "sourceRefs": source_refs,
        "qualityEnvelope": _evidence_quality_envelope(chunk_ids, retrieval_mode, retrieval_status),
        "errorCategory": error_category,
        "createdBy": "langgraph_rag",
        "documentIds": document_ids,
        "sourceChunkIds": chunk_ids,
        "retrievalMode": retrieval_mode,
        "retrievalStatus": retrieval_status,
        "ragTraceRef": None,
    }
    answer_artifact = {
        "artifactId": answer_ref,
        "artifactType": "answer",
        "schemaVersion": 1,
        "summary": f"{answer_mode} answer with {len(citation_refs)} citations",
        "sourceRefs": citation_refs,
        "qualityEnvelope": dict(quality_envelope),
        "errorCategory": error_category,
        "createdBy": "langgraph_rag",
        "answerMode": answer_mode,
        "citationRefs": citation_refs,
        "evidenceArtifactRefs": [evidence_ref],
        "ragTraceRef": None,
    }
    return {
        "evidence": evidence_artifact,
        "answer": answer_artifact,
    }


def build_final_result(
    state: dict[str, Any],
    rag_trace: dict[str, Any],
    error_category: str | None,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Build the final result payload with quality envelope and artifact refs."""
    from .artifact_store import persist_graph_artifacts

    answer_payload = result.get("answer") or {}
    run_id = state.get("run_id", "")
    host = state.get("host_ref")
    packed_chunks = state.get("packed_chunks") or state.get("candidate_chunks") or []
    citations = answer_payload.get("citations") or []
    retrieval_mode = str(state.get("retrieval_mode") or "hybrid")

    artifact_refs = build_artifact_refs(run_id, packed_chunks, citations)
    quality_envelope = state.get("quality_envelope") or {}

    artifacts = build_rag_artifacts(
        run_id, packed_chunks, citations, quality_envelope, answer_payload,
        retrieval_mode,
        str(answer_payload.get("retrievalStatus") or state.get("retrieval_status") or "ready"),
        error_category=str(error_category) if error_category else None,
    )

    result["runtime"] = str(state.get("runtime") or "langgraph")
    result["graphVersion"] = str(state.get("graph_version") or "2.0")
    result["fallbackUsed"] = bool(state.get("fallback_used"))
    result["qualityEnvelope"] = quality_envelope
    if artifacts:
        result["artifacts"] = artifacts
    if artifact_refs:
        result["artifactRefs"] = artifact_refs

    artifact_store_ok, artifact_store_error = persist_graph_artifacts(host, run_id, artifacts)
    if not artifact_store_ok:
        error_category = str(error_category or artifact_store_error or "artifact_write_failed")
        quality_envelope["blockingReasons"] = list(
            dict.fromkeys([*(quality_envelope.get("blockingReasons") or []), "artifact_write_failed"])
        )
        result["errorCategory"] = error_category

    return {
        "artifact_refs": artifact_refs,
        "artifacts": artifacts,
        "quality_envelope": quality_envelope,
        "error_category": error_category,
        "result": result,
    }