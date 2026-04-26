"""Document embedding workflow for child chunks."""
from __future__ import annotations

from typing import TYPE_CHECKING

from ..providers.embedding_runtime import embed_texts

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient


EMBEDDING_BATCH_SIZE = 16


def _batched(items: list[dict], size: int) -> list[list[dict]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def run_document_embedding_workflow(
    run_id: str,
    document_id: str,
    host: HostGatewayClient,
) -> dict:
    _ = run_id

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

    host.update_document_status(document_id, "embedding")

    stored_count = 0
    for batch in _batched(embeddable_chunks, EMBEDDING_BATCH_SIZE):
        texts = [chunk.get("content", "") for chunk in batch]
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

    host.update_document_status(document_id, "ready")
    return {
        "status": "completed",
        "profileId": profile.get("id"),
        "profileModel": profile.get("model"),
        "embeddedChunkCount": stored_count,
        "sourceChunkCount": len(embeddable_chunks),
    }
