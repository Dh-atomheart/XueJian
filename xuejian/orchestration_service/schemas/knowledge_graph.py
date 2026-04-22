"""Pydantic schemas for the knowledge graph GraphRAG pipeline."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


NodeType = Literal["concept", "person", "event", "formula", "term"]
RelationType = Literal[
    "is_a",
    "part_of",
    "depends_on",
    "causes",
    "related_to",
    "similar_to",
    "uses",
    "produces",
]


class ChunkInfo(BaseModel):
    chunk_id: str
    document_id: str
    content: str = Field(min_length=1)
    page: int | None = None
    hierarchy_path: list[str] = Field(default_factory=list)


class ExtractedNode(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: NodeType = Field(default="concept")
    aliases: list[str] = Field(default_factory=list)
    description: str = Field(default="", max_length=500)
    source_ids: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)

    @field_validator("label")
    @classmethod
    def _normalize_label(cls, value: str) -> str:
        return " ".join(value.strip().split())[:100]


class ExtractedEdge(BaseModel):
    from_label: str = Field(min_length=1, max_length=100)
    to_label: str = Field(min_length=1, max_length=100)
    relation: RelationType = Field(default="related_to")
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    source_ids: list[str] = Field(default_factory=list)
    inferred: bool = False
    metadata: dict = Field(default_factory=dict)


class ExtractionResult(BaseModel):
    nodes: list[ExtractedNode] = Field(default_factory=list)
    edges: list[ExtractedEdge] = Field(default_factory=list)


class CommunitySummary(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    summary: str = Field(min_length=20, max_length=500)
    key_entities: list[str] = Field(default_factory=list, max_length=10)
    core_relations: list[str] = Field(default_factory=list, max_length=10)
    knowledge_gaps: list[str] = Field(default_factory=list)


class KnowledgeNodePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    label: str = Field(min_length=1, max_length=100)
    type: NodeType = Field(default="concept", alias="nodeType")
    aliases: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    description: str = Field(default="", max_length=500)
    metadata: dict = Field(default_factory=dict)
    community_id: str | None = Field(default=None, alias="communityId")
    parent_community_id: str | None = Field(default=None, alias="parentCommunityId")
    degree: int = Field(default=0, ge=0)
    has_embedding: bool = Field(default=False, alias="hasEmbedding")


class KnowledgeEdgePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    from_node_id: str = Field(alias="fromNodeId")
    to_node_id: str = Field(alias="toNodeId")
    relation: RelationType = Field(default="related_to")
    confidence: float = Field(default=0.6, ge=0.0, le=1.0)
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    inferred: bool = False
    metadata: dict = Field(default_factory=dict)


class CommunityPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    level: int = Field(ge=0, le=1)
    title: str = Field(default="", max_length=80)
    member_node_ids: list[str] = Field(default_factory=list, alias="memberNodeIds")
    parent_community_id: str | None = Field(default=None, alias="parentCommunityId")
    summary_json: dict | None = Field(default=None, alias="summary")
    node_count: int = Field(default=0, alias="nodeCount")
    edge_count: int = Field(default=0, alias="edgeCount")
    collapsed: bool = False


class EntityEmbeddingPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    node_id: str = Field(alias="nodeId")
    embedding_model: str = Field(alias="embeddingModel")
    vector: list[float] = Field(default_factory=list)


class KnowledgeGraphWorkflowPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    nodes: list[KnowledgeNodePayload] = Field(default_factory=list)
    edges: list[KnowledgeEdgePayload] = Field(default_factory=list)
    communities: list[CommunityPayload] = Field(default_factory=list)
    entity_embeddings: list[EntityEmbeddingPayload] = Field(
        default_factory=list, alias="entityEmbeddings"
    )
    nodes_created: int = Field(default=0, alias="nodesCreated")
    edges_created: int = Field(default=0, alias="edgesCreated")
    nodes_merged: int = Field(default=0, alias="nodesMerged")
    communities_detected: int = Field(default=0, alias="communitiesDetected")
