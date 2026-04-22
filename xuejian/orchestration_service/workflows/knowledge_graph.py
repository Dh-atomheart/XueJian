"""Knowledge graph workflow — 5-stage GraphRAG pipeline with incremental merge."""
from __future__ import annotations

import json
import logging
import re
import urllib.request
import uuid
from collections import Counter, defaultdict
from itertools import combinations
from typing import TYPE_CHECKING, Iterable

from ..schemas.knowledge_graph import (
    ChunkInfo,
    CommunityPayload,
    CommunitySummary,
    ExtractionResult,
    ExtractedEdge,
    ExtractedNode,
    KnowledgeEdgePayload,
    KnowledgeGraphWorkflowPayload,
    KnowledgeNodePayload,
    RelationType,
)
from .graph_embedding import build_entity_embeddings, cosine_similarity, embed_entity_text

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

_RELATION_PATTERNS: list[tuple[re.Pattern[str], RelationType]] = [
    (re.compile(r"(.{1,40}?)(?:是|属于|是一种|属于一种)(.{1,40}?)"), "is_a"),
    (re.compile(r"(.{1,40}?)(?:是|属于)(.{1,40}?)(?:的一部分|组成部分)"), "part_of"),
    (re.compile(r"(.{1,40}?)(?:依赖于|依赖|取决于)(.{1,40}?)"), "depends_on"),
    (re.compile(r"(.{1,40}?)(?:导致|引起|造成)(.{1,40}?)"), "causes"),
    (re.compile(r"(.{1,40}?)(?:使用|利用|借助)(.{1,40}?)"), "uses"),
    (re.compile(r"(.{1,40}?)(?:生成|产生|输出)(.{1,40}?)"), "produces"),
    (re.compile(r"(.{1,40}?)(?:类似于|相似于|近似于)(.{1,40}?)"), "similar_to"),
    (re.compile(r"(.{1,40}?)(?:相关于|相关|关联)(.{1,40}?)"), "related_to"),
    (re.compile(r"(.{1,40}?)\s+is a\s+(.{1,40}?)", re.IGNORECASE), "is_a"),
    (re.compile(r"(.{1,40}?)\s+part of\s+(.{1,40}?)", re.IGNORECASE), "part_of"),
    (re.compile(r"(.{1,40}?)\s+depends on\s+(.{1,40}?)", re.IGNORECASE), "depends_on"),
    (re.compile(r"(.{1,40}?)\s+causes\s+(.{1,40}?)", re.IGNORECASE), "causes"),
    (re.compile(r"(.{1,40}?)\s+uses\s+(.{1,40}?)", re.IGNORECASE), "uses"),
    (re.compile(r"(.{1,40}?)\s+produces\s+(.{1,40}?)", re.IGNORECASE), "produces"),
    (re.compile(r"(.{1,40}?)\s+related to\s+(.{1,40}?)", re.IGNORECASE), "related_to"),
    (re.compile(r"(.{1,40}?)\s+similar to\s+(.{1,40}?)", re.IGNORECASE), "similar_to"),
]
_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-_/]{2,}|[\u4e00-\u9fff]{2,12}")
_SENTENCE_RE = re.compile(r"[。！？!?\n]+")
_STOPWORDS = {
    "我们",
    "你们",
    "他们",
    "以及",
    "这个",
    "那个",
    "因此",
    "然后",
    "进行",
    "通过",
    "可以",
    "一种",
    "一个",
    "用于",
    "学习",
    "知识",
    "系统",
    "应用",
    "data",
    "using",
    "used",
    "system",
    "learning",
    "knowledge",
}


class WorkflowCancelledError(RuntimeError):
    pass


def run_knowledge_graph_workflow(
    run_id: str,
    build_run_id: str,
    document_ids: list[str],
    incremental: bool,
    host: HostGatewayClient,
) -> dict:
    """Execute the 5-stage GraphRAG pipeline and return a persistence payload."""
    if not document_ids:
        return KnowledgeGraphWorkflowPayload().model_dump(by_alias=True)

    config_with_key = host.get_default_config_with_key()
    _emit_progress(host, run_id, 1, "Collecting document chunks", 0.05, {"buildRunId": build_run_id})
    chunks = _stage_collect_chunks(document_ids, host)
    _save_checkpoint(host, run_id, "stage-1-chunks", {
        "chunkCount": len(chunks),
        "documentIds": document_ids,
        "incremental": incremental,
    })
    _ensure_not_cancelled(host, run_id)

    _emit_progress(host, run_id, 2, "Extracting entities and relationships", 0.22, {"chunkCount": len(chunks)})
    raw_nodes, raw_edges = _stage_extract(chunks, document_ids, host, config_with_key, run_id)
    _save_checkpoint(host, run_id, "stage-2-extracted", {
        "nodeCount": len(raw_nodes),
        "edgeCount": len(raw_edges),
    })
    _ensure_not_cancelled(host, run_id)

    _emit_progress(host, run_id, 3, "Merging entities and deduplicating graph", 0.45, None)
    nodes, edges, nodes_merged = _stage_merge(raw_nodes, raw_edges, host, incremental)
    _save_checkpoint(host, run_id, "stage-3-merged", {
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "nodesMerged": nodes_merged,
    })
    _ensure_not_cancelled(host, run_id)

    _emit_progress(host, run_id, 4, "Detecting graph communities", 0.66, {"nodeCount": len(nodes), "edgeCount": len(edges)})
    nodes, communities = _stage_detect_communities(nodes, edges)
    _save_checkpoint(host, run_id, "stage-4-communities", {
        "communityCount": len(communities),
    })
    _ensure_not_cancelled(host, run_id)

    _emit_progress(host, run_id, 5, "Summarizing communities and embeddings", 0.86, {"communityCount": len(communities)})
    communities = _stage_summarize_communities(communities, nodes, edges)
    embeddings = build_entity_embeddings(nodes, host)
    embedding_ids = {embedding.node_id for embedding in embeddings}
    nodes = [
        node.model_copy(update={"has_embedding": node.id in embedding_ids or node.has_embedding})
        for node in nodes
    ]

    payload = KnowledgeGraphWorkflowPayload(
        nodes=nodes,
        edges=edges,
        communities=communities,
        entityEmbeddings=embeddings,
        nodesCreated=len(nodes),
        edgesCreated=len(edges),
        nodesMerged=nodes_merged,
        communitiesDetected=len(communities),
    )
    _save_checkpoint(host, run_id, "stage-5-ready", payload.model_dump(by_alias=True))
    _emit_progress(host, run_id, 5, "Knowledge graph pipeline completed", 1.0, {
        "nodes": len(nodes),
        "edges": len(edges),
        "communities": len(communities),
    })
    return payload.model_dump(by_alias=True)


def _stage_collect_chunks(document_ids: list[str], host: HostGatewayClient) -> list[ChunkInfo]:
    chunks: list[ChunkInfo] = []
    for document_id in document_ids:
        try:
            for chunk in host.list_document_chunks(document_id):
                content = str(chunk.get("content", "")).strip()
                if not content:
                    continue
                chunks.append(
                    ChunkInfo(
                        chunk_id=str(chunk.get("id") or uuid.uuid4()),
                        document_id=document_id,
                        content=content,
                        page=chunk.get("pageStart") or chunk.get("pageEnd"),
                        hierarchy_path=_safe_string_list(chunk.get("hierarchyPath") or chunk.get("metadata", {}).get("hierarchyPath")),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not fetch chunks for doc %s: %s", document_id[:8], exc)

        if any(chunk.document_id == document_id for chunk in chunks):
            continue

        try:
            for section in host.list_sections(document_id):
                content = str(section.get("content", "")).strip()
                if not content:
                    continue
                chunks.append(
                    ChunkInfo(
                        chunk_id=str(section.get("id") or uuid.uuid4()),
                        document_id=document_id,
                        content=content,
                        page=section.get("pageStart") or section.get("pageEnd"),
                        hierarchy_path=_safe_string_list(section.get("hierarchyPath")),
                    )
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not fetch sections for doc %s: %s", document_id[:8], exc)

        if any(chunk.document_id == document_id for chunk in chunks):
            continue

        document = host.get_document(document_id)
        title = str((document or {}).get("title") or f"Document {document_id[:8]}")
        chunks.append(
            ChunkInfo(
                chunk_id=f"fallback:{document_id}",
                document_id=document_id,
                content=title,
                page=None,
                hierarchy_path=[title],
            )
        )
    return chunks


def _stage_extract(
    chunks: list[ChunkInfo],
    document_ids: list[str],
    host: HostGatewayClient,
    config_with_key: tuple[dict, str] | None,
    run_id: str,
) -> tuple[list[ExtractedNode], list[ExtractedEdge]]:
    all_nodes: list[ExtractedNode] = []
    all_edges: list[ExtractedEdge] = []
    batch_size = 5 if len(chunks) <= 50 else 8

    for index in range(0, len(chunks), batch_size):
        batch = chunks[index:index + batch_size]
        try:
            llm_result = None
            if config_with_key is not None:
                llm_result = _extract_batch_with_llm(batch, config_with_key)
            heuristic_result = _rule_extract_batch(batch)
            result = _merge_extraction_results(llm_result, heuristic_result)
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM extraction failed for batch %d, using heuristics: %s", index // batch_size, exc)
            result = _rule_extract_batch(batch)

        all_nodes.extend(result.nodes)
        all_edges.extend(result.edges)

        if run_id and (index // batch_size + 1) % 2 == 0:
            _save_checkpoint(host, run_id, "stage-2-progress", {
                "processedChunks": min(index + batch_size, len(chunks)),
                "totalChunks": len(chunks),
                "nodeCount": len(all_nodes),
                "edgeCount": len(all_edges),
            })
            _emit_progress(
                host,
                run_id,
                2,
                f"Processed {min(index + batch_size, len(chunks))}/{len(chunks)} chunks",
                0.22 + 0.18 * (min(index + batch_size, len(chunks)) / max(1, len(chunks))),
                {"documentIds": document_ids},
            )
            _ensure_not_cancelled(host, run_id)

    return all_nodes, all_edges


def _extract_batch_with_llm(
    batch: list[ChunkInfo],
    config_with_key: tuple[dict, str],
) -> ExtractionResult:
    config, api_key = config_with_key
    combined = []
    for chunk in batch:
        hierarchy = " > ".join(chunk.hierarchy_path[:4]) if chunk.hierarchy_path else ""
        prefix = f"[doc={chunk.document_id} chunk={chunk.chunk_id}"
        if chunk.page:
            prefix += f" page={chunk.page}"
        prefix += "]"
        if hierarchy:
            prefix += f" [{hierarchy}]"
        combined.append(f"{prefix}\n{chunk.content[:1600]}")
    prompt = (
        "Extract entities and relationships from the following text.\n\n"
        "Return JSON with this exact shape:\n"
        "{\n"
        '  "nodes": [{"label": "...", "type": "concept|person|event|formula|term", "aliases": [], "description": "..."}],\n'
        '  "edges": [{"fromLabel": "...", "toLabel": "...", "relation": "is_a|part_of|depends_on|causes|related_to|similar_to|uses|produces", "confidence": 0.0}]\n'
        "}\n\n"
        "Text:\n"
        + "\n\n".join(combined)
    )
    response = _call_chat_json(config, api_key, prompt)
    parsed = ExtractionResult.model_validate(response)

    source_ids = sorted({chunk.document_id for chunk in batch})
    nodes = [
        node.model_copy(update={"source_ids": sorted(set(node.source_ids) | set(source_ids))})
        for node in parsed.nodes
    ]
    edges = [
        edge.model_copy(update={"source_ids": sorted(set(edge.source_ids) | set(source_ids))})
        for edge in parsed.edges
    ]
    return ExtractionResult(nodes=nodes, edges=edges)


def _rule_extract_batch(batch: list[ChunkInfo]) -> ExtractionResult:
    node_index: dict[str, ExtractedNode] = {}
    edges: list[ExtractedEdge] = []

    for chunk in batch:
        candidates = []
        candidates.extend(chunk.hierarchy_path[-2:])
        candidates.extend(_extract_candidate_terms(chunk.content))
        for candidate in candidates:
            normalized = _normalize_label(candidate)
            if not normalized:
                continue
            node_index.setdefault(
                normalized,
                ExtractedNode(
                    label=normalized,
                    type=_infer_node_type(normalized),
                    aliases=[],
                    description=_build_short_description(normalized, chunk.content),
                    source_ids=[chunk.document_id],
                    metadata={"extraction": "rule"},
                ),
            )
            if chunk.document_id not in node_index[normalized].source_ids:
                node_index[normalized].source_ids.append(chunk.document_id)

        sentences = [segment.strip() for segment in _SENTENCE_RE.split(chunk.content) if segment.strip()]
        for sentence in sentences:
            for pattern, relation in _RELATION_PATTERNS:
                for match in pattern.finditer(sentence):
                    left = _normalize_label(match.group(1))
                    right = _normalize_label(match.group(2))
                    if not left or not right or left == right:
                        continue
                    if left not in node_index:
                        node_index[left] = ExtractedNode(
                            label=left,
                            type=_infer_node_type(left),
                            aliases=[],
                            description=_build_short_description(left, sentence),
                            source_ids=[chunk.document_id],
                            metadata={"extraction": "pattern"},
                        )
                    if right not in node_index:
                        node_index[right] = ExtractedNode(
                            label=right,
                            type=_infer_node_type(right),
                            aliases=[],
                            description=_build_short_description(right, sentence),
                            source_ids=[chunk.document_id],
                            metadata={"extraction": "pattern"},
                        )
                    edges.append(
                        ExtractedEdge(
                            from_label=left,
                            to_label=right,
                            relation=relation,
                            confidence=0.58,
                            source_ids=[chunk.document_id],
                            inferred=False,
                            metadata={"rule": pattern.pattern},
                        )
                    )

        chunk_terms = [label for label in map(_normalize_label, _extract_candidate_terms(chunk.content)) if label]
        for left, right in combinations(chunk_terms[:8], 2):
            if left == right:
                continue
            edges.append(
                ExtractedEdge(
                    from_label=left,
                    to_label=right,
                    relation="related_to",
                    confidence=0.32,
                    source_ids=[chunk.document_id],
                    inferred=True,
                    metadata={"rule": "co_occurrence"},
                )
            )

    deduped_edges: dict[tuple[str, str, str], ExtractedEdge] = {}
    for edge in edges:
        signature = _edge_signature_by_label(edge.from_label, edge.to_label, edge.relation)
        current = deduped_edges.get(signature)
        if current is None or current.confidence < edge.confidence:
            deduped_edges[signature] = edge
        else:
            merged_sources = sorted(set(current.source_ids) | set(edge.source_ids))
            deduped_edges[signature] = current.model_copy(update={"source_ids": merged_sources})

    return ExtractionResult(nodes=list(node_index.values()), edges=list(deduped_edges.values()))


def _stage_merge(
    raw_nodes: list[ExtractedNode],
    raw_edges: list[ExtractedEdge],
    host: HostGatewayClient,
    incremental: bool,
) -> tuple[list[KnowledgeNodePayload], list[KnowledgeEdgePayload], int]:
    existing_nodes = [_node_from_host(item) for item in host.list_knowledge_nodes()] if incremental else []
    existing_edges = [_edge_from_host(item) for item in host.list_all_graph_edges()] if incremental else []

    node_states: dict[str, KnowledgeNodePayload] = {node.id: node for node in existing_nodes}
    label_index: dict[str, str] = {}
    embedding_cache: dict[str, list[float]] = {}
    nodes_merged = 0

    for node in existing_nodes:
        for alias in [node.label, *node.aliases]:
            normalized = _normalize_label(alias)
            if normalized:
                label_index[normalized] = node.id
        embedding_cache[node.id] = embed_entity_text(f"{node.label}\n{node.description}\n{' '.join(node.aliases)}")

    for raw in raw_nodes:
        normalized = _normalize_label(raw.label)
        if not normalized:
            continue
        target_id = label_index.get(normalized)
        if target_id is None:
            target_id = _match_semantic_node(raw, node_states, label_index, embedding_cache)

        if target_id is None:
            target_id = f"kg-node-{uuid.uuid5(uuid.NAMESPACE_URL, normalized)}"
            node = KnowledgeNodePayload(
                id=target_id,
                label=raw.label,
                nodeType=raw.type,
                aliases=_dedupe_strings(raw.aliases),
                sourceIds=_dedupe_strings(raw.source_ids),
                description=raw.description,
                metadata=raw.metadata,
                degree=0,
                hasEmbedding=False,
            )
            node_states[target_id] = node
            embedding_cache[target_id] = embed_entity_text(f"{node.label}\n{node.description}\n{' '.join(node.aliases)}")
        else:
            nodes_merged += 1
            current = node_states[target_id]
            metadata = dict(current.metadata)
            metadata.update(raw.metadata)
            node_states[target_id] = current.model_copy(
                update={
                    "label": current.label if current.metadata.get("user_edited") else _prefer_label(current.label, raw.label),
                    "aliases": _dedupe_strings([*current.aliases, *raw.aliases, raw.label]),
                    "source_ids": _dedupe_strings([*current.source_ids, *raw.source_ids]),
                    "description": current.description if current.metadata.get("user_edited") else _prefer_description(current.description, raw.description),
                    "metadata": metadata,
                    "node_type": current.type if current.metadata.get("user_edited") else _prefer_node_type(current.type, raw.type),
                },
                deep=True,
            )
            current = node_states[target_id]
            embedding_cache[target_id] = embed_entity_text(f"{current.label}\n{current.description}\n{' '.join(current.aliases)}")

        for alias in [raw.label, *raw.aliases, node_states[target_id].label, *node_states[target_id].aliases]:
            alias_norm = _normalize_label(alias)
            if alias_norm:
                label_index[alias_norm] = target_id

    edge_states: dict[tuple[str, str, str], KnowledgeEdgePayload] = {
        _edge_signature(edge.from_node_id, edge.to_node_id, edge.relation): edge
        for edge in existing_edges
    }

    for raw in raw_edges:
        from_id = label_index.get(_normalize_label(raw.from_label))
        to_id = label_index.get(_normalize_label(raw.to_label))
        if from_id is None or to_id is None or from_id == to_id:
            continue

        signature = _edge_signature(from_id, to_id, raw.relation)
        current = edge_states.get(signature)
        if current is None:
            edge_states[signature] = KnowledgeEdgePayload(
                id=f"kg-edge-{uuid.uuid5(uuid.NAMESPACE_URL, '::'.join(signature))}",
                fromNodeId=signature[0],
                toNodeId=signature[1],
                relation=raw.relation,
                confidence=raw.confidence,
                sourceIds=_dedupe_strings(raw.source_ids),
                inferred=raw.inferred,
                metadata=raw.metadata,
            )
            continue

        if current.metadata.get("user_edited"):
            continue

        merged_sources = _dedupe_strings([*current.source_ids, *raw.source_ids])
        edge_states[signature] = current.model_copy(
            update={
                "confidence": max(current.confidence, raw.confidence),
                "source_ids": merged_sources,
                "inferred": current.inferred and raw.inferred,
                "metadata": {**current.metadata, **raw.metadata},
            },
            deep=True,
        )

    nodes = list(node_states.values())
    degrees = Counter()
    for edge in edge_states.values():
        degrees[edge.from_node_id] += 1
        degrees[edge.to_node_id] += 1
    nodes = [node.model_copy(update={"degree": degrees.get(node.id, 0)}) for node in nodes]
    edges = list(edge_states.values())
    return nodes, edges, nodes_merged


def _stage_detect_communities(
    nodes: list[KnowledgeNodePayload],
    edges: list[KnowledgeEdgePayload],
) -> tuple[list[KnowledgeNodePayload], list[CommunityPayload]]:
    if not nodes:
        return nodes, []

    node_ids = [node.id for node in nodes]
    adjacency: dict[str, set[str]] = {node.id: set() for node in nodes}
    for edge in edges:
        adjacency.setdefault(edge.from_node_id, set()).add(edge.to_node_id)
        adjacency.setdefault(edge.to_node_id, set()).add(edge.from_node_id)

    top_level, bottom_level = _detect_communities_with_fallback(node_ids, adjacency, nodes)
    communities: list[CommunityPayload] = []
    node_updates: dict[str, tuple[str | None, str | None]] = {}

    for community_id, members in top_level.items():
        communities.append(
            CommunityPayload(
                id=community_id,
                level=1,
                title="",
                memberNodeIds=members,
                parentCommunityId=None,
                nodeCount=len(members),
                edgeCount=_count_internal_edges(members, edges),
                collapsed=False,
            )
        )

    for community_id, data in bottom_level.items():
        members = data["members"]
        parent_id = data["parent"]
        communities.append(
            CommunityPayload(
                id=community_id,
                level=0,
                title="",
                memberNodeIds=members,
                parentCommunityId=parent_id,
                nodeCount=len(members),
                edgeCount=_count_internal_edges(members, edges),
                collapsed=False,
            )
        )
        for node_id in members:
            node_updates[node_id] = (community_id, parent_id)

    updated_nodes = [
        node.model_copy(
            update={
                "community_id": node_updates.get(node.id, (None, None))[0],
                "parent_community_id": node_updates.get(node.id, (None, None))[1],
            }
        )
        for node in nodes
    ]
    return updated_nodes, communities


def _stage_summarize_communities(
    communities: list[CommunityPayload],
    nodes: list[KnowledgeNodePayload],
    edges: list[KnowledgeEdgePayload],
) -> list[CommunityPayload]:
    node_map = {node.id: node for node in nodes}
    edge_map = defaultdict(list)
    for edge in edges:
        edge_map[edge.from_node_id].append(edge)
        edge_map[edge.to_node_id].append(edge)

    updated: list[CommunityPayload] = []
    for community in communities:
        members = [node_map[node_id] for node_id in community.member_node_ids if node_id in node_map]
        if not members:
            updated.append(community)
            continue
        top_nodes = sorted(members, key=lambda item: item.degree, reverse=True)[:5]
        relation_counts = Counter()
        for node in members:
            for edge in edge_map[node.id]:
                if edge.from_node_id in community.member_node_ids and edge.to_node_id in community.member_node_ids:
                    relation_counts[edge.relation] += 1
        relation_labels = [relation for relation, _ in relation_counts.most_common(5)]
        knowledge_gaps = _infer_knowledge_gaps(members, relation_counts)
        title = _build_community_title(top_nodes, community.level)
        summary = CommunitySummary(
            title=title,
            summary=_build_community_summary(members, relation_counts, community.level),
            key_entities=[node.label for node in top_nodes],
            core_relations=relation_labels,
            knowledge_gaps=knowledge_gaps,
        )
        updated.append(
            community.model_copy(update={
                "title": summary.title,
                "summary_json": summary.model_dump(),
            })
        )
    return updated


def _detect_communities_with_fallback(
    node_ids: list[str],
    adjacency: dict[str, set[str]],
    nodes: list[KnowledgeNodePayload],
) -> tuple[dict[str, list[str]], dict[str, dict[str, list[str] | str]]]:
    try:
        import igraph as ig  # type: ignore[import-not-found]
        import leidenalg  # type: ignore[import-not-found]

        graph = ig.Graph(directed=False)
        graph.add_vertices(node_ids)
        edges = []
        for source, neighbors in adjacency.items():
            for target in neighbors:
                if source < target:
                    edges.append((source, target))
        graph.add_edges(edges)

        high_partition = leidenalg.find_partition(
            graph,
            leidenalg.RBConfigurationVertexPartition,
            resolution_parameter=0.3,
        )
        low_partition = leidenalg.find_partition(
            graph,
            leidenalg.RBConfigurationVertexPartition,
            resolution_parameter=1.0,
        )

        top_level: dict[str, list[str]] = defaultdict(list)
        for index, cluster in enumerate(high_partition.membership):
            top_level[f"kg-community-l1-{cluster}"] .append(node_ids[index])

        bottom_level: dict[str, dict[str, list[str] | str]] = defaultdict(lambda: {"members": [], "parent": ""})
        for index, cluster in enumerate(low_partition.membership):
            node_id = node_ids[index]
            parent = next(
                community_id
                for community_id, members in top_level.items()
                if node_id in members
            )
            community_id = f"kg-community-l0-{cluster}-{parent.split('-')[-1]}"
            bottom_level[community_id]["parent"] = parent
            bottom_level[community_id]["members"].append(node_id)
        return dict(top_level), dict(bottom_level)
    except Exception:  # noqa: BLE001
        pass

    top_level: dict[str, list[str]] = {}
    bottom_level: dict[str, dict[str, list[str] | str]] = {}
    node_map = {node.id: node for node in nodes}
    seen: set[str] = set()

    for node_id in node_ids:
        if node_id in seen:
            continue
        component = _connected_component(node_id, adjacency)
        seen.update(component)
        parent_id = _stable_id("kg-community-l1", sorted(component))
        top_level[parent_id] = sorted(component)

        groups: dict[str, list[str]] = defaultdict(list)
        for member_id in component:
            groups[node_map[member_id].type].append(member_id)
        if len(groups) == 1:
            child_id = _stable_id("kg-community-l0", sorted(component))
            bottom_level[child_id] = {"members": sorted(component), "parent": parent_id}
            continue
        for group_name, members in groups.items():
            child_id = _stable_id("kg-community-l0", [parent_id, group_name, *sorted(members)])
            bottom_level[child_id] = {"members": sorted(members), "parent": parent_id}

    return top_level, bottom_level


def _call_chat_json(config: dict, api_key: str, prompt: str) -> dict:
    model = config.get("model", "gpt-4o")
    base_url = (config.get("baseUrl") or "https://api.openai.com/v1").rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a knowledge extraction assistant for a learning application. "
                        "Choose entity types only from concept, person, event, formula, term. "
                        "Choose relation types only from is_a, part_of, depends_on, causes, related_to, similar_to, uses, produces. "
                        "Return valid JSON only."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    request = urllib.request.Request(f"{base_url}/chat/completions", data=body, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read())
    raw = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    if isinstance(raw, dict):
        return raw
    return json.loads(raw)


def _merge_extraction_results(
    llm_result: ExtractionResult | None,
    heuristic_result: ExtractionResult,
) -> ExtractionResult:
    if llm_result is None:
        return heuristic_result
    nodes: dict[str, ExtractedNode] = {
        _normalize_label(node.label): node for node in heuristic_result.nodes if _normalize_label(node.label)
    }
    for node in llm_result.nodes:
        normalized = _normalize_label(node.label)
        if not normalized:
            continue
        current = nodes.get(normalized)
        if current is None:
            nodes[normalized] = node
            continue
        nodes[normalized] = current.model_copy(
            update={
                "aliases": _dedupe_strings([*current.aliases, *node.aliases]),
                "source_ids": _dedupe_strings([*current.source_ids, *node.source_ids]),
                "description": _prefer_description(current.description, node.description),
                "metadata": {**current.metadata, **node.metadata},
                "type": _prefer_node_type(current.type, node.type),
            }
        )

    edges: dict[tuple[str, str, str], ExtractedEdge] = {
        _edge_signature_by_label(edge.from_label, edge.to_label, edge.relation): edge
        for edge in heuristic_result.edges
    }
    for edge in llm_result.edges:
        signature = _edge_signature_by_label(edge.from_label, edge.to_label, edge.relation)
        current = edges.get(signature)
        if current is None or edge.confidence > current.confidence:
            edges[signature] = edge
        else:
            edges[signature] = current.model_copy(
                update={
                    "source_ids": _dedupe_strings([*current.source_ids, *edge.source_ids]),
                    "metadata": {**current.metadata, **edge.metadata},
                }
            )
    return ExtractionResult(nodes=list(nodes.values()), edges=list(edges.values()))


def _match_semantic_node(
    raw: ExtractedNode,
    node_states: dict[str, KnowledgeNodePayload],
    label_index: dict[str, str],
    embedding_cache: dict[str, list[float]],
) -> str | None:
    for alias in raw.aliases:
        alias_match = label_index.get(_normalize_label(alias))
        if alias_match is not None:
            return alias_match

    probe = embed_entity_text(f"{raw.label}\n{raw.description}\n{' '.join(raw.aliases)}")
    best_id: str | None = None
    best_score = 0.0
    for node_id, node in node_states.items():
        if node.type != raw.type and not ({node.type, raw.type} <= {"concept", "term"}):
            continue
        score = cosine_similarity(probe, embedding_cache.get(node_id, []))
        if score > 0.92 and score > best_score:
            best_id = node_id
            best_score = score
    return best_id


def _node_from_host(item: dict) -> KnowledgeNodePayload:
    return KnowledgeNodePayload(
        id=str(item.get("id")),
        label=str(item.get("label", "")),
        nodeType=str(item.get("nodeType") or item.get("type") or "concept"),
        aliases=_safe_string_list(item.get("aliases")),
        sourceIds=_safe_string_list(item.get("sourceIds")),
        description=str(item.get("description", "")),
        metadata=item.get("metadata") or {},
        communityId=item.get("communityId"),
        parentCommunityId=item.get("parentCommunityId"),
        degree=int(item.get("degree") or 0),
        hasEmbedding=bool(item.get("hasEmbedding", False)),
    )


def _edge_from_host(item: dict) -> KnowledgeEdgePayload:
    return KnowledgeEdgePayload(
        id=str(item.get("id")) if item.get("id") else None,
        fromNodeId=str(item.get("fromNodeId")),
        toNodeId=str(item.get("toNodeId")),
        relation=str(item.get("relation", "related_to")),
        confidence=float(item.get("confidence") or 0.5),
        sourceIds=_safe_string_list(item.get("sourceIds")),
        inferred=bool(item.get("inferred", False)),
        metadata=item.get("metadata") or {},
    )


def _connected_component(start: str, adjacency: dict[str, set[str]]) -> set[str]:
    component = {start}
    queue = [start]
    while queue:
        node = queue.pop()
        for neighbor in adjacency.get(node, set()):
            if neighbor in component:
                continue
            component.add(neighbor)
            queue.append(neighbor)
    return component


def _count_internal_edges(members: Iterable[str], edges: list[KnowledgeEdgePayload]) -> int:
    member_set = set(members)
    return sum(1 for edge in edges if edge.from_node_id in member_set and edge.to_node_id in member_set)


def _build_community_title(nodes: list[KnowledgeNodePayload], level: int) -> str:
    if not nodes:
        return "Knowledge Community"
    if level == 1:
        return f"{nodes[0].label} 知识域"
    if len(nodes) == 1:
        return nodes[0].label
    return " / ".join(node.label for node in nodes[:2])


def _build_community_summary(
    members: list[KnowledgeNodePayload],
    relation_counts: Counter[str],
    level: int,
) -> str:
    type_counts = Counter(node.type for node in members)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else "concept"
    relation_text = "、".join(relation for relation, _ in relation_counts.most_common(3)) or "related_to"
    scope = "高层主题" if level == 1 else "局部主题"
    return (
        f"该{scope}包含 {len(members)} 个以 {dominant_type} 为主的实体，"
        f"核心关系集中在 {relation_text}。"
        f"它可以作为后续 GraphRAG 检索和学习导航的上下文单元。"
    )


def _infer_knowledge_gaps(
    members: list[KnowledgeNodePayload],
    relation_counts: Counter[str],
) -> list[str]:
    gaps: list[str] = []
    if relation_counts.get("causes", 0) == 0:
        gaps.append("缺少明确的因果链条，可补充 causes 关系")
    if relation_counts.get("depends_on", 0) == 0:
        gaps.append("依赖关系较弱，可补充前置条件或 prerequisite")
    if all(node.type != "person" for node in members):
        gaps.append("尚未关联关键人物，可补充 person 节点")
    return gaps[:3]


def _extract_candidate_terms(text: str) -> list[str]:
    candidates = []
    for token in _TOKEN_RE.findall(text):
        normalized = _normalize_label(token)
        if normalized and normalized.lower() not in _STOPWORDS and len(normalized) <= 32:
            candidates.append(normalized)
    counts = Counter(candidates)
    ranked = [label for label, count in counts.most_common(12) if count >= 1]
    return ranked[:10]


def _infer_node_type(label: str) -> str:
    lowered = label.lower()
    if re.search(r"[=+\-*/^()]", label):
        return "formula"
    if any(keyword in lowered for keyword in ["定律", "公式", "equation", "theorem", "formula"]):
        return "formula"
    if any(keyword in lowered for keyword in ["先生", "教授", "博士", "dr", "professor"]):
        return "person"
    if any(keyword in lowered for keyword in ["战争", "革命", "发现", "会议", "event"]):
        return "event"
    if len(label) <= 4:
        return "term"
    return "concept"


def _build_short_description(label: str, text: str) -> str:
    sentence = next((segment.strip() for segment in _SENTENCE_RE.split(text) if label in segment), text[:140])
    return sentence[:180].strip()


def _prefer_label(current: str, incoming: str) -> str:
    return current if len(current) <= len(incoming) else incoming


def _prefer_description(current: str, incoming: str) -> str:
    if not current:
        return incoming
    if not incoming:
        return current
    return incoming if len(incoming) > len(current) else current


def _prefer_node_type(current: str, incoming: str) -> str:
    if current == "concept" and incoming != "concept":
        return incoming
    return current


def _edge_signature_by_label(from_label: str, to_label: str, relation: str) -> tuple[str, str, str]:
    left = _normalize_label(from_label)
    right = _normalize_label(to_label)
    if relation in {"related_to", "similar_to"} and left > right:
        left, right = right, left
    return left, right, relation


def _edge_signature(from_node_id: str, to_node_id: str, relation: str) -> tuple[str, str, str]:
    left, right = from_node_id, to_node_id
    if relation in {"related_to", "similar_to"} and left > right:
        left, right = right, left
    return left, right, relation


def _stable_id(prefix: str, parts: Iterable[str]) -> str:
    return f"{prefix}-{uuid.uuid5(uuid.NAMESPACE_URL, '::'.join(parts))}"


def _normalize_label(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip(" ,，。:：;；()[]{}\"'“”‘’")
    if not cleaned:
        return ""
    if len(cleaned) > 80:
        cleaned = cleaned[:80].strip()
    return cleaned


def _dedupe_strings(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = _normalize_label(value)
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _safe_string_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _emit_progress(
    host: HostGatewayClient,
    run_id: str,
    stage: int,
    message: str,
    progress: float,
    payload: dict | None,
) -> None:
    if not run_id:
        return
    try:
        host.emit_workflow_event(
            run_id,
            "progress",
            message=message,
            progress=round(progress, 3),
            payload={"stage": stage, **(payload or {})},
        )
    except Exception:  # noqa: BLE001
        logger.debug("Failed to emit graph workflow progress", exc_info=True)


def _save_checkpoint(host: HostGatewayClient, run_id: str, step_key: str, payload: dict) -> None:
    if not run_id:
        return
    try:
        host.save_checkpoint(
            run_id,
            {
                "checkpointRef": "knowledge-graph",
                "stepKey": step_key,
                "payload": payload,
            },
        )
    except Exception:  # noqa: BLE001
        logger.debug("Failed to save graph workflow checkpoint", exc_info=True)


def _ensure_not_cancelled(host: HostGatewayClient, run_id: str) -> None:
    if not run_id:
        return
    try:
        if host.is_run_cancelled(run_id):
            raise WorkflowCancelledError("knowledge graph workflow cancelled")
    except WorkflowCancelledError:
        raise
    except Exception:  # noqa: BLE001
        logger.debug("Failed to check graph workflow cancellation state", exc_info=True)
