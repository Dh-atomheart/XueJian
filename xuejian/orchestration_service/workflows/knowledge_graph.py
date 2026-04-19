"""Knowledge graph workflow — LLM-based entity/relation extraction."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


def _run_knowledge_graph_llm(
    run_id: str,
    document_ids: list[str],
    host: HostGatewayClient,
    config: dict,
    api_key: str,
) -> dict:
    """Use LLM to extract entities and relations from document chunks."""
    all_chunks: list[dict] = []
    for doc_id in document_ids:
        try:
            chunks = host.list_document_chunks(doc_id)
            all_chunks.extend(chunks)
        except Exception as exc:
            logger.warning("Could not fetch chunks for doc %s: %s", doc_id[:8], exc)

    if not all_chunks:
        return _build_fallback_graph(document_ids)

    text_parts = []
    for chunk in all_chunks[:20]:
        content = chunk.get("content", "")
        if content:
            text_parts.append(content)
    combined_text = "\n\n".join(text_parts)[:8000]

    prompt = f"""Analyze the following learning material and extract knowledge entities and their relationships.

Return a JSON object with:
- "nodes": array of objects with "label" (string), "type" (one of: concept, person, event, formula, term), "aliases" (string array)
- "edges": array of objects with "fromLabel" (string), "toLabel" (string), "relation" (string describing the relationship), "confidence" (number 0-1)

Only extract entities and relationships that are clearly supported by the text. Do not infer unsupported facts.

Material:
{combined_text}"""

    provider = config.get("provider", "openai")
    model = config.get("model", "gpt-4o")
    base_url = config.get("baseUrl") or "https://api.openai.com/v1"
    base_url = base_url.rstrip("/")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a knowledge extraction assistant. Return only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }).encode("utf-8")

    chat_url = f"{base_url}/chat/completions"
    req = urllib.request.Request(chat_url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())

    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    parsed = json.loads(raw)

    raw_nodes = parsed.get("nodes", [])
    raw_edges = parsed.get("edges", [])

    nodes = []
    label_map: dict[str, int] = {}
    for i, n in enumerate(raw_nodes):
        label = n.get("label", "").strip()
        if not label:
            continue
        node_type = n.get("type", "concept")
        if node_type not in ("concept", "person", "event", "formula", "term"):
            node_type = "concept"
        nodes.append({
            "label": label,
            "type": node_type,
            "aliases": n.get("aliases", []),
            "sourceIds": document_ids,
            "metadata": {},
        })
        label_map[label.lower()] = i

    edges = []
    for e in raw_edges:
        from_label = e.get("fromLabel", "").strip().lower()
        to_label = e.get("toLabel", "").strip().lower()
        if from_label not in label_map or to_label not in label_map:
            continue
        edges.append({
            "fromNodeId": f"pending:{label_map[from_label]}",
            "toNodeId": f"pending:{label_map[to_label]}",
            "relation": e.get("relation", "related_to"),
            "confidence": max(0.0, min(1.0, float(e.get("confidence", 0.5)))),
            "sourceIds": document_ids,
        })

    return {"nodes": nodes, "edges": edges}


def _build_fallback_graph(document_ids: list[str]) -> dict:
    """Build a minimal placeholder graph when LLM is unavailable."""
    nodes = [
        {
            "label": f"Document {doc_id[:8]}",
            "type": "concept",
            "aliases": [],
            "sourceIds": [doc_id],
            "metadata": {"fallback": True},
        }
        for doc_id in document_ids
    ]
    return {"nodes": nodes, "edges": []}


def run_knowledge_graph_workflow(
    run_id: str,
    document_ids: list[str],
    host: HostGatewayClient,
) -> dict:
    """Extract entities and relations from documents. Returns {nodes: [...], edges: [...]}."""
    config_with_key = host.get_default_config_with_key()

    if config_with_key:
        config, api_key = config_with_key
        try:
            return _run_knowledge_graph_llm(run_id, document_ids, host, config, api_key)
        except Exception as exc:
            logger.warning("LLM knowledge-graph extraction failed, using fallback: %s", exc)

    return _build_fallback_graph(document_ids)
