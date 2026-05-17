"""XueJianHybridRetriever — LangChain BaseRetriever for hybrid search."""
from __future__ import annotations

import logging
from typing import Any

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from pydantic import Field

from .retriever import embed_optional_query, search_candidates_for_queries

logger = logging.getLogger(__name__)


class XueJianHybridRetriever(BaseRetriever):
    """Hybrid retriever that combines vector and FTS5 search via the host gateway.

    Uses the same search_candidates_for_queries logic as the legacy workflow,
    but exposes it through the standard LangChain BaseRetriever interface so
    it can be composed with other LangChain runnables.
    """

    host: Any = Field(description="HostGatewayClient instance")
    document_ids: list[str] = Field(default_factory=list, description="Scoped document IDs")
    active_profile: dict[str, Any] | None = Field(default=None, description="Active embedding profile")

    class Config:
        arbitrary_types_allowed = True

    def _get_relevant_documents(
        self,
        query: str,
        *,
        run_manager: CallbackManagerForRetrieverRun,
    ) -> list[Document]:
        if self.active_profile is None:
            logger.warning("XueJianHybridRetriever invoked without active_profile; embedding will be skipped, falling back to lexical-only search")
        profile = self.active_profile or {}
        query_embedding = embed_optional_query(self.host, profile, query)

        query_specs = [
            {
                "query": query,
                "embedding": query_embedding,
                "required": True,
                "label": "primary",
            }
        ]

        chunks, retrieval_mode = search_candidates_for_queries(
            self.host,
            query_specs,
            self.document_ids,
        )

        documents: list[Document] = []
        for chunk in chunks:
            chunk_id = chunk.get("chunkId") or chunk.get("id") or ""
            content = str(chunk.get("content") or chunk.get("snippet") or "")
            metadata = {
                "chunkId": chunk_id,
                "documentId": chunk.get("documentId"),
                "sectionId": chunk.get("sectionId"),
                "page": chunk.get("page") if chunk.get("page") is not None else chunk.get("pageStart"),
                "score": chunk.get("score") or chunk.get("relevanceScore") or chunk.get("rrfScore") or 0.0,
                "retrievalMode": retrieval_mode,
            }
            documents.append(Document(page_content=content, metadata=metadata))

        return documents
