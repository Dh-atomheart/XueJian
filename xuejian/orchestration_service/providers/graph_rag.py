"""GraphRAG retrieval helpers built on top of the host knowledge graph gateway."""
from __future__ import annotations

import re
from collections import deque
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-_]{1,}|[\u4e00-\u9fff]{2,12}")


def graph_rag_search(
    query: str,
    host: HostGatewayClient,
    query_embedding: list[float] | None = None,
    top_k: int = 6,
) -> dict[str, Any]:
    """Run a lightweight GraphRAG retrieval: entity hits, relation paths and community summaries."""
    nodes = host.list_knowledge_nodes()
    edges = host.list_all_graph_edges()
    node_map = {node["id"]: node for node in nodes}

    entity_hits = _search_entities(query, query_embedding, host, nodes, top_k)
    seed_ids = [item["nodeId"] for item in entity_hits]
    relation_paths = _expand_paths(seed_ids, edges, max_paths=top_k)
    community_summaries = _collect_community_summaries(seed_ids, node_map, host)

    return {
        "entities": entity_hits,
        "paths": relation_paths,
        "communities": community_summaries,
    }


def fuse_graph_and_traditional_results(
    graph_results: list[dict[str, Any]],
    traditional_results: list[dict[str, Any]],
    rrf_k: int = 60,
) -> list[dict[str, Any]]:
    """Fuse GraphRAG results with traditional retrieval using reciprocal rank fusion."""
    merged: dict[str, dict[str, Any]] = {}
    for ranking, results in (("graph", graph_results), ("traditional", traditional_results)):
        for index, result in enumerate(results, start=1):
            item_id = str(result.get("id") or result.get("nodeId") or result.get("documentId") or index)
            entry = merged.setdefault(item_id, {"rrfScore": 0.0, **result})
            entry["rrfScore"] += 1.0 / (rrf_k + index)
            entry[f"{ranking}Rank"] = index
    ranked = list(merged.values())
    ranked.sort(key=lambda item: item.get("rrfScore", 0.0), reverse=True)
    return ranked


def _search_entities(
    query: str,
    query_embedding: list[float] | None,
    host: HostGatewayClient,
    nodes: list[dict],
    top_k: int,
) -> list[dict[str, Any]]:
    tokens = {token.lower() for token in _TOKEN_RE.findall(query)}
    lexical_hits: list[dict[str, Any]] = []
    for node in nodes:
        haystack = " ".join(
            [
                str(node.get("label", "")),
                str(node.get("description", "")),
                " ".join(str(alias) for alias in node.get("aliases", [])),
            ]
        ).lower()
        score = sum(1 for token in tokens if token in haystack)
        if score <= 0:
            continue
        lexical_hits.append(
            {
                "nodeId": node["id"],
                "label": node.get("label"),
                "nodeType": node.get("nodeType"),
                "description": node.get("description"),
                "score": float(score),
                "source": "lexical",
            }
        )
    lexical_hits.sort(key=lambda item: item["score"], reverse=True)

    semantic_hits: list[dict[str, Any]] = []
    if query_embedding:
        try:
            semantic_hits = [
                {
                    "nodeId": item.get("nodeId"),
                    "label": item.get("label"),
                    "nodeType": item.get("nodeType"),
                    "description": item.get("description"),
                    "score": float(item.get("similarity", 0.0)),
                    "source": "semantic",
                }
                for item in host.vector_search_entity(query_embedding, top_k=top_k)
            ]
        except Exception:
            semantic_hits = []

    merged: dict[str, dict[str, Any]] = {}
    for ranking, results in (("lexical", lexical_hits), ("semantic", semantic_hits)):
        for index, result in enumerate(results[:top_k], start=1):
            node_id = result["nodeId"]
            entry = merged.setdefault(node_id, {**result, "rrfScore": 0.0})
            entry["rrfScore"] += 1.0 / (60 + index)
            entry[f"{ranking}Rank"] = index
            entry["score"] = max(entry.get("score", 0.0), result.get("score", 0.0))
    ranked = list(merged.values())
    ranked.sort(key=lambda item: item["rrfScore"], reverse=True)
    return ranked[:top_k]


def _expand_paths(seed_ids: list[str], edges: list[dict], max_paths: int) -> list[dict[str, Any]]:
    adjacency: dict[str, list[dict]] = {}
    for edge in edges:
        adjacency.setdefault(edge["fromNodeId"], []).append(edge)
        adjacency.setdefault(edge["toNodeId"], []).append(edge)

    paths: list[dict[str, Any]] = []
    for seed_id in seed_ids[:3]:
        queue: deque[tuple[str, list[dict], set[str]]] = deque([(seed_id, [], {seed_id})])
        while queue and len(paths) < max_paths:
            current, path_edges, visited = queue.popleft()
            if len(path_edges) >= 2:
                paths.append(
                    {
                        "id": f"path:{seed_id}:{len(paths)}",
                        "seedNodeId": seed_id,
                        "edges": path_edges,
                    }
                )
                continue
            for edge in adjacency.get(current, []):
                next_node = edge["toNodeId"] if edge["fromNodeId"] == current else edge["fromNodeId"]
                if next_node in visited:
                    continue
                queue.append((next_node, [*path_edges, edge], {next_node, *visited}))
    return paths[:max_paths]


def _collect_community_summaries(
    seed_ids: list[str],
    node_map: dict[str, dict],
    host: HostGatewayClient,
) -> list[dict[str, Any]]:
    seen_ids: set[str] = set()
    summaries: list[dict[str, Any]] = []
    for node_id in seed_ids:
        node = node_map.get(node_id)
        if not node:
            continue
        for community_id in [node.get("communityId"), node.get("parentCommunityId")]:
            if not community_id or community_id in seen_ids:
                continue
            seen_ids.add(community_id)
            summary = host.get_community_summary(community_id)
            if summary is None:
                continue
            summaries.append({"communityId": community_id, **summary})
    return summaries
