"""Document embedding workflow for child chunks."""
from __future__ import annotations

import hashlib
import logging
import time
from urllib.parse import urlparse
from typing import TYPE_CHECKING

from ..providers.embedding_runtime import embed_texts

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient


EMBEDDING_BATCH_SIZE = 16
logger = logging.getLogger(__name__)


def _batched(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _coerce_int(value: object, default: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return default
    return default


def _chunk_content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _chunk_requires_embedding(
    chunk: dict,
    state: dict | None,
    *,
    chunking_profile_revision: int,
    embedding_profile_revision: int,
    embedding_dimensions: int,
) -> bool:
    if state is None:
        return True

    content_hash = _chunk_content_hash(str(chunk.get("content", "")))
    if state.get("contentHash") != content_hash:
        return True
    if _coerce_int(state.get("chunkingProfileRevision"), -1) != chunking_profile_revision:
        return True
    if _coerce_int(state.get("embeddingProfileRevision"), -1) != embedding_profile_revision:
        return True
    if embedding_dimensions > 0 and _coerce_int(state.get("embeddingDimensions"), -1) != embedding_dimensions:
        return True

    return False


def run_document_embedding_workflow(
    run_id: str,
    document_id: str,
    host: HostGatewayClient,
) -> dict:
    profile = host.get_active_embedding_profile()
    if profile is None:
        host.update_document_status(document_id, "embedding_failed")
        return {
            "status": "failed",
            "error": "No active embedding profile configured",
        }

    profile_id = str(profile.get("id") or "").strip()
    if not profile_id:
        host.update_document_status(document_id, "embedding_failed")
        return {
            "status": "failed",
            "error": "Active embedding profile is missing an id",
        }

    document = host.get_document(document_id) or {}
    document_chunking_profile_revision = _coerce_int(
        document.get("chunkingProfileRevision"),
        0,
    )
    profile_revision = _coerce_int(profile.get("revision"), 0)
    profile_dimensions = _coerce_int(profile.get("dimensions"), 0)

    chunks = host.list_chunks(document_id)
    embeddable_chunks = [
        chunk
        for chunk in chunks
        if chunk.get("chunkKind") == "child" and chunk.get("content", "").strip()
    ]
    if not embeddable_chunks:
        embeddable_chunks = [
            chunk for chunk in chunks if chunk.get("content", "").strip()
        ]

    if not embeddable_chunks:
        host.update_document_status(document_id, "embedding_failed")
        return {
            "status": "failed",
            "error": "No document chunks available for embedding",
            "profileId": profile.get("id"),
        }

    states = {
        str(item.get("chunkId")): item
        for item in host.list_chunk_embedding_states(document_id, profile_id)
        if item.get("chunkId")
    }
    stale_chunks = [
        chunk
        for chunk in embeddable_chunks
        if _chunk_requires_embedding(
            chunk,
            states.get(str(chunk.get("id") or "")),
            chunking_profile_revision=document_chunking_profile_revision,
            embedding_profile_revision=profile_revision,
            embedding_dimensions=profile_dimensions,
        )
    ]
    skipped_count = len(embeddable_chunks) - len(stale_chunks)
    if not stale_chunks:
        host.update_document_status(document_id, "ready")
        if run_id:
            host.update_background_job_progress(
                run_id,
                progress_current=len(embeddable_chunks),
                progress_total=len(embeddable_chunks),
                progress_message=f"Skipped {skipped_count}/{len(embeddable_chunks)} unchanged chunks",
            )
        return {
            "status": "completed",
            "profileId": profile.get("id"),
            "profileModel": profile.get("model"),
            "embeddedChunkCount": 0,
            "sourceChunkCount": len(embeddable_chunks),
            "skippedChunkCount": skipped_count,
        }

    resolved = None
    try:
        from ..providers.embedding_runtime import resolve_embedding_config

        resolved = resolve_embedding_config(host, profile)
    except Exception:
        logger.exception("Failed to pre-resolve embedding config: doc=%s", document_id[:8])
    if resolved:
        config, _ = resolved
        base_url = str(config.get("baseUrl") or "").strip()
        base_host = urlparse(base_url).netloc if base_url else ""
        logger.info(
            "Document embedding config resolved: job=%s doc=%s profile=%s provider=%s model=%s base_host=%s chunks=%d batch_size=%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            str(profile.get("id", ""))[:8],
            config.get("provider"),
            config.get("model"),
            base_host or "native",
            len(stale_chunks),
            EMBEDDING_BATCH_SIZE,
        )
    else:
        logger.warning(
            "Document embedding config did not resolve before provider call: job=%s doc=%s profile=%s chunks=%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            str(profile.get("id", ""))[:8],
            len(stale_chunks),
        )

    host.update_document_status(document_id, "embedding")
    if run_id:
        host.update_background_job_progress(
            run_id,
            progress_current=0,
            progress_total=len(stale_chunks),
            progress_message="Embedding provider call starting",
        )

    stored_count = 0
    for batch_index, batch in enumerate(_batched(stale_chunks, EMBEDDING_BATCH_SIZE), start=1):
        texts = [chunk.get("content", "") for chunk in batch]
        batch_started = time.perf_counter()
        logger.info(
            "Embedding batch start: job=%s doc=%s batch=%d batch_size=%d stored=%d/%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            batch_index,
            len(batch),
            stored_count,
            len(stale_chunks),
        )
        vectors = embed_texts(host, profile, texts, task_type="RETRIEVAL_DOCUMENT")
        if vectors and profile_dimensions <= 0:
            actual_dimensions = len(vectors[0])
            locked_profile = host.lock_embedding_dimensions(profile_id, actual_dimensions)
            if isinstance(locked_profile, dict) and locked_profile:
                profile = locked_profile
                profile_id = str(profile.get("id") or profile_id)
                profile_revision = _coerce_int(
                    profile.get("revision"),
                    profile_revision,
                )
                profile_dimensions = _coerce_int(
                    profile.get("dimensions"),
                    actual_dimensions,
                )
            else:
                profile_dimensions = actual_dimensions

        for vector in vectors:
            expected_dimensions = profile_dimensions or len(vector)
            if len(vector) != expected_dimensions:
                raise ValueError(
                    f"Embedding dimensions mismatch: expected {expected_dimensions}, got {len(vector)}"
                )

        payload = [
            {
                "chunkId": chunk["id"],
                "vector": vector,
                "contentHash": _chunk_content_hash(str(chunk.get("content", ""))),
                "chunkingProfileRevision": document_chunking_profile_revision,
                "embeddingProfileRevision": profile_revision,
                "embeddingDimensions": profile_dimensions or len(vector),
            }
            for chunk, vector in zip(batch, vectors, strict=True)
        ]
        response = host.save_chunk_embeddings(profile_id, payload)
        stored_count += int(response.get("storedCount", 0))
        elapsed_ms = round((time.perf_counter() - batch_started) * 1000)
        logger.info(
            "Embedding batch complete: job=%s doc=%s batch=%d stored=%d/%d elapsed_ms=%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            batch_index,
            stored_count,
            len(stale_chunks),
            elapsed_ms,
        )
        if run_id:
            status = host.update_background_job_progress(
                run_id,
                progress_current=stored_count,
                progress_total=len(stale_chunks),
                progress_message=f"Embedded {stored_count}/{len(stale_chunks)} chunks",
            )
            if status.get("cancelRequestedAt"):
                host.update_document_status(document_id, "embedding_failed")
                return {
                    "status": "cancelled",
                    "profileId": profile.get("id"),
                    "embeddedChunkCount": stored_count,
                    "sourceChunkCount": len(embeddable_chunks),
                    "skippedChunkCount": skipped_count,
                }

    host.update_document_status(document_id, "ready")
    return {
        "status": "completed",
        "profileId": profile.get("id"),
        "profileModel": profile.get("model"),
        "embeddedChunkCount": stored_count,
        "sourceChunkCount": len(embeddable_chunks),
        "skippedChunkCount": skipped_count,
    }
