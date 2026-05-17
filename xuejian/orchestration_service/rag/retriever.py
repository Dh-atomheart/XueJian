"""Retrieval logic — embedding readiness, search, merge, dedupe."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .audit import _chunk_id, _chunk_score
from .constants import RETRIEVAL_CANDIDATE_LIMIT
from .exceptions import WorkflowCancelled

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


def embed_optional_query(
    host: HostGatewayClient,
    active_profile: dict[str, Any],
    query: str,
) -> list[float] | None:
    try:
        from ..providers.embedding_runtime import embed_query_with_resilience

        result = embed_query_with_resilience(
            host,
            active_profile,
            query,
            task_type="RETRIEVAL_QUERY",
        )
        return result.vector
    except Exception as exc:
        if isinstance(exc, WorkflowCancelled):
            raise
        logger.warning("Knowledge QA optional query embedding failed: %s", exc)
        return None


def _vector_backed_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for chunk in chunks:
        if (
            chunk.get("vectorBacked") is True
            or chunk.get("vectorRank") is not None
            or chunk.get("distance") is not None
        ):
            filtered.append(chunk)
    return filtered


def _dedupe_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from .audit import _chunk_content

    deduped_by_id: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        content = _chunk_content(chunk)
        if not chunk_id or not content:
            continue
        existing = deduped_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            deduped_by_id[chunk_id] = dict(chunk)
    return sorted(deduped_by_id.values(), key=_chunk_score, reverse=True)


def _lexical_status(chunks: list[dict[str, Any]]) -> str:
    for chunk in chunks:
        value = chunk.get("lexicalSource")
        if isinstance(value, str) and value:
            return value
    return "not_used"


def uses_degraded_lexical_fallback(retrieval_mode: str, chunks: list[dict[str, Any]]) -> bool:
    return retrieval_mode == "fts5" and _lexical_status(chunks) == "fallback"


def embedding_readiness_status(
    host: HostGatewayClient,
    active_profile: dict[str, Any],
    document_ids: list[str],
) -> str:
    checker = getattr(host, "get_document_embedding_readiness", None)
    if not callable(checker):
        return "ready"

    profile_id = active_profile.get("id")
    if not isinstance(profile_id, str) or not profile_id:
        return "embedding_missing"

    readiness = checker(profile_id, document_ids if document_ids else None)
    status = readiness.get("status") if isinstance(readiness, dict) else None
    if status in ("ready", "embedding_missing", "embedding_stale"):
        return status
    return "embedding_missing"


def search_candidates_for_queries(
    host: HostGatewayClient,
    query_specs: list[dict[str, Any]],
    document_ids: list[str],
) -> tuple[list[dict[str, Any]], str]:
    raw_hits: list[dict[str, Any]] = []
    for query_spec in query_specs:
        query = query_spec.get("query")
        if not isinstance(query, str) or not query.strip():
            continue

        try:
            hits = host.search_hybrid(
                query,
                query_embedding=query_spec.get("embedding"),
                document_ids=document_ids if document_ids else None,
                limit=RETRIEVAL_CANDIDATE_LIMIT,
            )
        except Exception as exc:
            if query_spec.get("required"):
                raise
            logger.warning("Knowledge QA optional retrieval query failed: %s", exc)
            continue

        label = query_spec.get("label") if isinstance(query_spec.get("label"), str) else "query"
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            tagged_hit = dict(hit)
            tagged_hit["retrievalQueryLabel"] = label
            raw_hits.append(tagged_hit)

    vector_candidates = _dedupe_chunks(_vector_backed_chunks(raw_hits))
    if vector_candidates:
        return vector_candidates, "hybrid"

    lexical_candidates = _dedupe_chunks(raw_hits)
    if lexical_candidates:
        return lexical_candidates, "fts5"

    return [], "hybrid"


def merge_candidate_chunks(
    primary: list[dict[str, Any]],
    secondary: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged_by_id: dict[str, dict[str, Any]] = {}
    for chunk in [*primary, *secondary]:
        chunk_id = _chunk_id(chunk)
        if not chunk_id:
            continue
        existing = merged_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            merged_by_id[chunk_id] = dict(chunk)
    return sorted(merged_by_id.values(), key=_chunk_score, reverse=True)


def combine_retrieval_modes(*modes: str) -> str:
    if any(mode == "hybrid" for mode in modes):
        return "hybrid"
    if any(mode == "fts5" for mode in modes):
        return "fts5"
    return "hybrid"
