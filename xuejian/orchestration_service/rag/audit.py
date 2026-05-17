"""Citation audit and chunk helper functions."""
from __future__ import annotations

from typing import Any

from .constants import MAX_CITATION_CHARS


def _chunk_id(chunk: dict[str, Any]) -> str | None:
    value = chunk.get("chunkId") or chunk.get("id")
    return value if isinstance(value, str) and value else None


def _chunk_page(chunk: dict[str, Any]) -> Any:
    return chunk.get("page") if chunk.get("page") is not None else chunk.get("pageStart")


def _chunk_score(chunk: dict[str, Any]) -> float:
    for key in ("score", "relevanceScore", "rrfScore"):
        value = chunk.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def _chunk_content(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("snippet") or "").strip()


def _chunk_kind(chunk: dict[str, Any]) -> str | None:
    value = chunk.get("chunkKind")
    return value if isinstance(value, str) and value else None


def _chunk_index(chunk: dict[str, Any]) -> int:
    value = chunk.get("chunkIndex")
    return value if isinstance(value, int) else -1


def _truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0:
        return ""
    return " ".join(text.split())[:max_chars].strip()


def _strip_code_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return stripped


def _extract_query_text(text: str, fallback: str, max_chars: int) -> str:
    import re as _re

    stripped = _strip_code_fence(text)
    lines = [line.strip() for line in stripped.splitlines() if line.strip()]
    candidate = lines[0] if lines else stripped.strip()
    candidate = _re.sub(r"^(query|rewritten query|broader query)\s*[:：]\s*", "", candidate, flags=_re.IGNORECASE)
    candidate = _truncate_text(candidate, max_chars)
    return candidate or _truncate_text(fallback, max_chars)


def _short_quote(text: str, max_chars: int = MAX_CITATION_CHARS) -> str:
    return " ".join(text.split())[:max_chars].strip()


def _citation_from_chunk(chunk: dict[str, Any], snippet: str | None = None) -> dict[str, Any]:
    content = _chunk_content(chunk)
    quote = _short_quote(snippet if snippet else content)
    if not quote:
        quote = _short_quote(content)
    return {
        "chunkId": _chunk_id(chunk),
        "documentId": chunk.get("documentId"),
        "sectionId": chunk.get("sectionId"),
        "anchorId": chunk.get("anchorId"),
        "page": _chunk_page(chunk),
        "quote": quote,
        "snippet": quote,
        "relevanceScore": _chunk_score(chunk) or None,
    }


def _normalize_citations(raw_citations: object, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunk_by_id = {_chunk_id(chunk): chunk for chunk in chunks if _chunk_id(chunk)}
    passage_index_by_chunk_id = {
        chunk_id: index
        for index, chunk in enumerate(chunks, start=1)
        for chunk_id in [_chunk_id(chunk)]
        if chunk_id
    }
    if not isinstance(raw_citations, list):
        return []

    citations: list[dict[str, Any]] = []
    seen_chunk_ids: set[str] = set()
    for raw in raw_citations:
        if not isinstance(raw, dict):
            continue
        chunk_id = raw.get("chunkId")
        if not isinstance(chunk_id, str) or chunk_id not in chunk_by_id or chunk_id in seen_chunk_ids:
            continue
        chunk = chunk_by_id[chunk_id]
        content = _chunk_content(chunk)
        raw_snippet = raw.get("snippet") if isinstance(raw.get("snippet"), str) else raw.get("quote")
        snippet = raw_snippet.strip() if isinstance(raw_snippet, str) else ""
        if not snippet or snippet not in content:
            snippet = _short_quote(content)
        citation = _citation_from_chunk(chunk, snippet)
        if citation["quote"]:
            passage_index = passage_index_by_chunk_id.get(chunk_id)
            if passage_index is not None:
                citation["passageIndex"] = passage_index
            citations.append(citation)
            seen_chunk_ids.add(chunk_id)
    return citations


def audit_citations(
    raw_citations: object,
    chunks: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str], str]:
    if not isinstance(raw_citations, list):
        return [], [], "clean"

    allowed_chunk_ids = {_chunk_id(chunk) for chunk in chunks if _chunk_id(chunk)}
    filtered_raw: list[dict[str, Any]] = []
    rejected_chunk_ids: list[str] = []
    for raw in raw_citations:
        if not isinstance(raw, dict):
            continue
        chunk_id = raw.get("chunkId")
        if not isinstance(chunk_id, str) or chunk_id not in allowed_chunk_ids:
            if isinstance(chunk_id, str) and chunk_id:
                rejected_chunk_ids.append(chunk_id)
            continue
        filtered_raw.append(raw)

    citations = _normalize_citations(filtered_raw, chunks)
    if rejected_chunk_ids and not citations:
        audit_status = "all_rejected"
    elif rejected_chunk_ids:
        audit_status = "filtered"
    else:
        audit_status = "clean"
    return citations, rejected_chunk_ids, audit_status
