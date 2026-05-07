"""Document embedding workflow for child chunks."""
from __future__ import annotations

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
            len(embeddable_chunks),
            EMBEDDING_BATCH_SIZE,
        )
    else:
        logger.warning(
            "Document embedding config did not resolve before provider call: job=%s doc=%s profile=%s chunks=%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            str(profile.get("id", ""))[:8],
            len(embeddable_chunks),
        )

    host.update_document_status(document_id, "embedding")
    if run_id:
        host.update_background_job_progress(
            run_id,
            progress_current=0,
            progress_total=len(embeddable_chunks),
            progress_message="Embedding provider call starting",
        )

    stored_count = 0
    for batch_index, batch in enumerate(_batched(embeddable_chunks, EMBEDDING_BATCH_SIZE), start=1):
        texts = [chunk.get("content", "") for chunk in batch]
        batch_started = time.perf_counter()
        logger.info(
            "Embedding batch start: job=%s doc=%s batch=%d batch_size=%d stored=%d/%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            batch_index,
            len(batch),
            stored_count,
            len(embeddable_chunks),
        )
        vectors = embed_texts(host, profile, texts, task_type="RETRIEVAL_DOCUMENT")
        payload = [
            {
                "chunkId": chunk["id"],
                "vector": vector,
            }
            for chunk, vector in zip(batch, vectors, strict=True)
        ]
        response = host.save_chunk_embeddings(profile["id"], payload)
        stored_count += int(response.get("storedCount", 0))
        elapsed_ms = round((time.perf_counter() - batch_started) * 1000)
        logger.info(
            "Embedding batch complete: job=%s doc=%s batch=%d stored=%d/%d elapsed_ms=%d",
            run_id[:8] if run_id else "none",
            document_id[:8],
            batch_index,
            stored_count,
            len(embeddable_chunks),
            elapsed_ms,
        )
        if run_id:
            status = host.update_background_job_progress(
                run_id,
                progress_current=stored_count,
                progress_total=len(embeddable_chunks),
                progress_message=f"Embedded {stored_count}/{len(embeddable_chunks)} chunks",
            )
            if status.get("cancelRequestedAt"):
                host.update_document_status(document_id, "embedding_failed")
                return {
                    "status": "cancelled",
                    "profileId": profile.get("id"),
                    "embeddedChunkCount": stored_count,
                    "sourceChunkCount": len(embeddable_chunks),
                }

    host.update_document_status(document_id, "ready")
    return {
        "status": "completed",
        "profileId": profile.get("id"),
        "profileModel": profile.get("model"),
        "embeddedChunkCount": stored_count,
        "sourceChunkCount": len(embeddable_chunks),
    }
