"""Entity embedding helpers for the knowledge graph pipeline."""
from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import TYPE_CHECKING, Iterable

from ..providers.embedding_runtime import embed_texts
from ..schemas.knowledge_graph import EntityEmbeddingPayload, KnowledgeNodePayload

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

_TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff]{2,}")
_DEFAULT_DIMENSIONS = 128
_DEFAULT_MODEL = "hash-fallback-v1"

logger = logging.getLogger(__name__)


def embed_entity_text(text: str, dimensions: int = _DEFAULT_DIMENSIONS) -> list[float]:
    vector = [0.0] * dimensions
    if not text.strip():
        return vector

    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        tokens = [segment for segment in text.lower().split() if segment]

    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        primary = int.from_bytes(digest[:4], "big") % dimensions
        secondary = int.from_bytes(digest[4:8], "big") % dimensions
        sign = 1.0 if digest[8] % 2 == 0 else -1.0
        weight = 1.0 + (len(token) / 12.0)
        vector[primary] += weight
        vector[secondary] -= sign * (weight / 2.0)

    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0.0:
        return vector
    return [round(value / norm, 6) for value in vector]


def cosine_similarity(left: Iterable[float], right: Iterable[float]) -> float:
    left_values = list(left)
    right_values = list(right)
    if len(left_values) != len(right_values) or not left_values:
        return 0.0
    dot = sum(a * b for a, b in zip(left_values, right_values))
    left_norm = math.sqrt(sum(value * value for value in left_values))
    right_norm = math.sqrt(sum(value * value for value in right_values))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return dot / (left_norm * right_norm)


def build_entity_embeddings(
    nodes: list[KnowledgeNodePayload],
    host: HostGatewayClient | None = None,
    embedding_model: str = _DEFAULT_MODEL,
) -> list[EntityEmbeddingPayload]:
    texts = [
        "\n".join(
            part
            for part in [node.label, node.description, " ".join(node.aliases)]
            if part
        )
        for node in nodes
    ]

    vectors: list[list[float]] | None = None
    resolved_model = embedding_model
    if host is not None:
        profile = host.get_active_embedding_profile()
        if profile is not None:
            try:
                vectors = embed_texts(host, profile, texts, task_type="RETRIEVAL_DOCUMENT")
                resolved_model = profile.get("model") or profile.get("id") or embedding_model
            except Exception as exc:
                logger.warning(
                    "Active embedding profile failed for knowledge graph entities, falling back to hash embeddings: %s",
                    exc,
                )

    if vectors is None:
        vectors = [embed_entity_text(text) for text in texts]

    embeddings: list[EntityEmbeddingPayload] = []
    for node, vector in zip(nodes, vectors, strict=True):
        embeddings.append(
            EntityEmbeddingPayload(
                nodeId=node.id,
                embeddingModel=resolved_model,
                vector=vector,
            )
        )
    return embeddings
