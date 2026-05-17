"""Context merging and packing — parent context, section headings, passage building."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from .audit import _chunk_content, _chunk_id, _chunk_index, _chunk_kind, _chunk_score, _truncate_text
from .constants import (
    MAX_EXPANDED_CONTEXT_CHARS,
    MAX_PASSAGE_CHARS,
    MAX_PASSAGES,
    MAX_PARENT_CONTEXT_CHARS,
    MAX_SECTION_HEADING_CHARS,
    MAX_TOTAL_CONTEXT_CHARS,
)
from .trace import _default_merge_summary, _default_packing_summary

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)


def _section_heading(section: dict[str, Any] | None) -> str:
    if not isinstance(section, dict):
        return ""

    parts: list[str] = []
    hierarchy = section.get("hierarchyPath")
    if isinstance(hierarchy, list):
        for item in hierarchy:
            text = str(item).strip()
            if text:
                parts.append(text)

    heading = section.get("heading")
    if isinstance(heading, str) and heading.strip():
        heading_text = heading.strip()
        if not parts or parts[-1] != heading_text:
            parts.append(heading_text)

    return _truncate_text(" > ".join(parts), MAX_SECTION_HEADING_CHARS)


def _overlap_ratio(left: str, right: str) -> float:
    left = left.strip()
    right = right.strip()
    if not left or not right:
        return 0.0
    shorter, longer = (left, right) if len(left) <= len(right) else (right, left)
    if shorter in longer:
        return len(shorter) / max(1, len(longer))
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _dedupe_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped_by_id: dict[str, dict[str, Any]] = {}
    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        content = _chunk_content(chunk)
        if not chunk_id or not content:
            continue
        existing = deduped_by_id.get(chunk_id)
        if existing is None or _chunk_score(chunk) > _chunk_score(existing):
            deduped_by_id[chunk_id] = dict(chunk)
    return sorted(deduped_by_id.values(), key=_chunk_score, reverse=True)


def _pack_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    packed: list[dict[str, Any]] = []
    total_chars = 0
    for chunk in chunks:
        content = _chunk_content(chunk)
        document_id = chunk.get("documentId")
        chunk_index = chunk.get("chunkIndex")
        is_near_duplicate = False
        for existing in packed:
            if document_id != existing.get("documentId"):
                continue
            existing_index = existing.get("chunkIndex")
            if isinstance(chunk_index, int) and isinstance(existing_index, int):
                if abs(chunk_index - existing_index) > 1:
                    continue
            if _overlap_ratio(content, _chunk_content(existing)) >= 0.82:
                is_near_duplicate = True
                break
        if is_near_duplicate:
            continue

        remaining = MAX_TOTAL_CONTEXT_CHARS - total_chars
        if remaining <= 0:
            break
        clipped_content = content[: min(MAX_PASSAGE_CHARS, remaining)]
        packed_chunk = dict(chunk)
        packed_chunk["content"] = clipped_content
        packed.append(packed_chunk)
        total_chars += len(clipped_content)
        if len(packed) >= MAX_PASSAGES:
            break
    return packed


def dedupe_and_pack_chunks(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return _pack_chunks(_dedupe_chunks(chunks))


def build_document_structure_cache(
    host: HostGatewayClient,
    chunks: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    list_chunks = getattr(host, "list_chunks", None)
    if not callable(list_chunks):
        return {}

    list_sections = getattr(host, "list_sections", None)
    cache: dict[str, dict[str, Any]] = {}
    document_ids = sorted(
        {
            document_id
            for chunk in chunks
            for document_id in [chunk.get("documentId")]
            if isinstance(document_id, str) and document_id
        }
    )

    for document_id in document_ids:
        try:
            structured_chunks = list_chunks(document_id) or []
        except Exception as exc:
            logger.warning("Knowledge QA parent merge failed to list chunks for %s: %s", document_id, exc)
            structured_chunks = []

        try:
            sections = list_sections(document_id) or [] if callable(list_sections) else []
        except Exception as exc:
            logger.warning("Knowledge QA parent merge failed to list sections for %s: %s", document_id, exc)
            sections = []

        chunk_by_id: dict[str, dict[str, Any]] = {}
        section_chunks: dict[str, list[dict[str, Any]]] = {}
        for structured_chunk in structured_chunks:
            if not isinstance(structured_chunk, dict):
                continue
            chunk_id = _chunk_id(structured_chunk)
            if chunk_id:
                chunk_by_id[chunk_id] = structured_chunk
            section_id = structured_chunk.get("sectionId")
            if isinstance(section_id, str) and section_id:
                section_chunks.setdefault(section_id, []).append(structured_chunk)

        for values in section_chunks.values():
            values.sort(key=lambda value: (_chunk_index(value), _chunk_id(value) or ""))

        sections_by_id: dict[str, dict[str, Any]] = {}
        for section in sections:
            if not isinstance(section, dict):
                continue
            section_id = section.get("id")
            if isinstance(section_id, str) and section_id:
                sections_by_id[section_id] = section

        cache[document_id] = {
            "chunkById": chunk_by_id,
            "sectionChunks": section_chunks,
            "sectionsById": sections_by_id,
        }

    return cache


def hydrate_chunks_from_structure(
    chunks: list[dict[str, Any]],
    document_structure: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    hydrated: list[dict[str, Any]] = []
    for chunk in chunks:
        document_id = chunk.get("documentId")
        chunk_id = _chunk_id(chunk)
        structured_chunk = None
        if isinstance(document_id, str) and document_id and chunk_id:
            structured_chunk = document_structure.get(document_id, {}).get("chunkById", {}).get(chunk_id)
        if isinstance(structured_chunk, dict):
            merged = dict(structured_chunk)
            merged.update(chunk)
            hydrated.append(merged)
        else:
            hydrated.append(chunk)
    return hydrated


def merge_parent_context(
    chunks: list[dict[str, Any]],
    host: HostGatewayClient,
    *,
    document_structure: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    document_structure = document_structure or build_document_structure_cache(host, chunks)
    if not document_structure:
        return {}, _default_merge_summary("unavailable")

    remaining_chars = MAX_PARENT_CONTEXT_CHARS
    seen_merge_keys: set[str] = set()
    expanded_contexts: dict[str, dict[str, Any]] = {}
    merge_summary = _default_merge_summary("none")

    for chunk in chunks:
        chunk_id = _chunk_id(chunk)
        document_id = chunk.get("documentId")
        section_id = chunk.get("sectionId")
        if not chunk_id or not isinstance(document_id, str) or not document_id:
            continue

        context_entry = document_structure.get(document_id)
        if not isinstance(context_entry, dict):
            continue

        payload: dict[str, Any] = {}
        section = None
        if isinstance(section_id, str) and section_id:
            section = context_entry.get("sectionsById", {}).get(section_id)
        heading = _section_heading(section)
        if heading:
            payload["sectionHeading"] = heading

        if not isinstance(section_id, str) or not section_id or remaining_chars <= 0:
            if payload:
                expanded_contexts[chunk_id] = payload
            continue

        section_chunks = context_entry.get("sectionChunks", {}).get(section_id, [])
        child_index = _chunk_index(chunk)
        parent_chunk: dict[str, Any] | None = None
        for section_chunk in section_chunks:
            if _chunk_kind(section_chunk) != "parent":
                continue
            if child_index >= 0 and _chunk_index(section_chunk) > child_index:
                continue
            parent_chunk = section_chunk

        source_kind = "parent"
        source_chunk = parent_chunk
        if source_chunk is None and isinstance(section, dict):
            source_kind = "section"
            source_chunk = section

        if isinstance(source_chunk, dict):
            merge_key = ":".join(
                [
                    document_id,
                    section_id,
                    _chunk_id(source_chunk) or source_kind,
                ]
            )
            if merge_key not in seen_merge_keys:
                context_text = _truncate_text(
                    _chunk_content(source_chunk),
                    min(MAX_EXPANDED_CONTEXT_CHARS, remaining_chars),
                )
                if context_text:
                    payload["context"] = context_text
                    payload["sourceKind"] = source_kind
                    payload["mergeKey"] = merge_key
                    seen_merge_keys.add(merge_key)
                    merge_summary["status"] = "merged"
                    merge_summary["childChunksExpanded"] += 1
                    merge_summary["charsAdded"] += len(context_text)
                    remaining_chars -= len(context_text)
                    if source_kind == "parent":
                        merge_summary["parentContextsAdded"] += 1
                    else:
                        merge_summary["sectionContextsAdded"] += 1

        if payload:
            expanded_contexts[chunk_id] = payload

    return expanded_contexts, merge_summary


def packing_summary(
    chunks: list[dict[str, Any]],
    expanded_contexts: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    expanded_contexts = expanded_contexts or {}
    total_chars = 0
    for chunk in chunks:
        total_chars += len(_chunk_content(chunk))
        context = expanded_contexts.get(_chunk_id(chunk) or "", {})
        total_chars += len(str(context.get("sectionHeading") or ""))
        total_chars += len(str(context.get("context") or ""))

    return {
        "passageCount": len(chunks),
        "totalChars": total_chars,
        "budgetChars": MAX_TOTAL_CONTEXT_CHARS + MAX_PARENT_CONTEXT_CHARS,
    }


def build_passages(
    chunks: list[dict[str, Any]],
    expanded_contexts: dict[str, dict[str, Any]] | None = None,
    episodic_memory: str | None = None,
) -> str:
    expanded_contexts = expanded_contexts or {}
    passages: list[str] = []
    if isinstance(episodic_memory, str) and episodic_memory.strip():
        passages.append(
            "[Session Memory]\n"
            "type: non_citable_context\n"
            "instruction: use only for intent resolution and pronoun disambiguation; do not cite this block\n"
            f"content: {episodic_memory.strip()}"
        )
    for index, chunk in enumerate(chunks, start=1):
        context = expanded_contexts.get(_chunk_id(chunk) or "", {})
        section_heading = context.get("sectionHeading") if isinstance(context, dict) else None
        expanded_text = context.get("context") if isinstance(context, dict) else None
        lines = [
            f"[Passage {index}]",
            f"chunkId: {_chunk_id(chunk)}",
            f"documentId: {chunk.get('documentId')}",
            f"page: {_chunk_page(chunk)}",
            f"score: {_chunk_score(chunk):.6f}",
        ]
        if isinstance(section_heading, str) and section_heading:
            lines.append(f"sectionHeading: {section_heading}")
        if isinstance(expanded_text, str) and expanded_text:
            lines.append(f"expandedContext: {expanded_text}")
        lines.append(f"citationEvidence: {_chunk_content(chunk)}")
        passages.append(
            "\n".join(lines)
        )
    return "\n\n".join(passages)


def _chunk_page(chunk: dict[str, Any]) -> Any:
    return chunk.get("page") if chunk.get("page") is not None else chunk.get("pageStart")
