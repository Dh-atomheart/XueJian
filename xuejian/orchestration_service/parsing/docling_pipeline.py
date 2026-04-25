"""Docling + PyMuPDF document parsing pipeline.

Produces stable anchors, hierarchical sections, and parent/child chunks.
Falls back to PyMuPDF for PDFs and supports basic Markdown / plain text parsing.
"""
from __future__ import annotations

import hashlib
import logging
import re
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

MIN_ANCHOR_CHARS = 12
MIN_SECTION_CHARS = 24
MAX_PARENT_CHARS = 6000
MAX_CHILD_CHARS = 900
OVERLAP_UNITS = 1
PDF_TEXT_MIN_CHARS_PER_PAGE = 24


def _stable_uuid(*parts: object) -> str:
    seed = "::".join(str(part) for part in parts if part not in (None, ""))
    return str(uuid.uuid5(uuid.NAMESPACE_URL, seed or "empty"))


def _compute_quote_hash(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _estimate_token_count(text: str) -> int:
    return max(1, len(re.findall(r"\S+", text)))


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _copy_hierarchy_path(stack: list[str]) -> list[str]:
    return list(stack)


def _infer_heading_level(label: str, text: str) -> int | None:
    lowered = (label or "").strip().lower()
    if "heading" in lowered or "title" in lowered:
        for ch in lowered:
            if ch.isdigit():
                return max(1, min(6, int(ch)))
        return 1

    stripped = text.strip()
    if not stripped:
        return None

    if stripped.startswith("#"):
        return min(6, len(stripped) - len(stripped.lstrip("#")))

    return None


def _is_heading_block(block: dict[str, Any]) -> bool:
    return block.get("headingLevel") is not None


def _rect_from_bbox(left: float, top: float, right: float, bottom: float) -> dict[str, float]:
    return {
        "x": left,
        "y": top,
        "width": max(0.0, right - left),
        "height": max(0.0, bottom - top),
    }


def _build_block(
    document_id: str,
    block_index: int,
    *,
    text: str,
    label: str,
    page: int,
    hierarchy_path: list[str],
    heading_level: int | None,
    bbox: dict[str, float] | None,
) -> dict[str, Any] | None:
    stripped = _normalize_text(text)
    if not stripped:
        return None

    return {
        "blockId": _stable_uuid(document_id, "block", block_index, page, stripped[:80]),
        "text": stripped,
        "label": (label or "paragraph").strip().lower() or "paragraph",
        "page": page,
        "hierarchyPath": hierarchy_path,
        "headingLevel": heading_level,
        "bbox": bbox,
    }


def _hydrate_anchors(document_id: str, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    anchors: list[dict[str, Any]] = []

    for block_index, block in enumerate(blocks):
        text = block["text"]
        if len(text) < MIN_ANCHOR_CHARS:
            block["anchorId"] = None
            block["anchorHash"] = None
            continue

        quote_hash = _compute_quote_hash(text)
        anchor_id = _stable_uuid(document_id, "anchor", block["page"], quote_hash, block_index)
        rects = [block["bbox"]] if block.get("bbox") else []
        anchor = {
            "id": anchor_id,
            "page": block["page"],
            "paragraph": None,
            "textQuote": _truncate(text, 500),
            "hash": quote_hash,
            "quoteHash": quote_hash,
            "hierarchyPath": block.get("hierarchyPath", []),
            "rects": rects,
        }
        anchors.append(anchor)
        block["anchorId"] = anchor_id
        block["anchorHash"] = quote_hash

    return anchors


def _finalize_section(
    document_id: str,
    section_index: int,
    heading: str | None,
    hierarchy_path: list[str],
    blocks: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not blocks:
        return None

    content = "\n\n".join(block["text"] for block in blocks if block.get("text")).strip()
    if len(content) < MIN_SECTION_CHARS:
        return None

    anchor_ids = [block.get("anchorId") for block in blocks if block.get("anchorId")]
    pages = [block["page"] for block in blocks]
    section_id = _stable_uuid(document_id, "section", section_index, heading or content[:120])

    return {
        "id": section_id,
        "sectionIndex": section_index,
        "heading": heading,
        "hierarchyPath": hierarchy_path,
        "pageStart": min(pages),
        "pageEnd": max(pages),
        "anchorStartId": anchor_ids[0] if anchor_ids else None,
        "anchorEndId": anchor_ids[-1] if anchor_ids else None,
        "content": content,
        "tokenCount": _estimate_token_count(content),
        "metadata": {
            "blockCount": len(blocks),
            "anchorCount": len(anchor_ids),
            "sectionKind": "heading_section" if heading else "preamble",
        },
        "blocks": blocks,
    }


def _build_sections(document_id: str, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    current_blocks: list[dict[str, Any]] = []
    current_heading: str | None = None
    current_hierarchy: list[str] = []
    section_index = 0

    def flush_current() -> None:
        nonlocal current_blocks, current_heading, current_hierarchy, section_index
        section = _finalize_section(
            document_id,
            section_index,
            current_heading,
            current_hierarchy,
            current_blocks,
        )
        if section:
            sections.append(section)
            section_index += 1
        current_blocks = []
        current_heading = None
        current_hierarchy = []

    for block in blocks:
        if _is_heading_block(block):
            flush_current()
            current_heading = block["text"]
            current_hierarchy = block.get("hierarchyPath", [])
            current_blocks = [block]
            continue

        if not current_blocks:
            current_hierarchy = block.get("hierarchyPath", [])
        current_blocks.append(block)

    flush_current()
    return sections


def _emit_chunk(
    document_id: str,
    chunk_index: int,
    *,
    section: dict[str, Any],
    chunk_kind: str,
    content: str,
    source_blocks: list[dict[str, Any]],
    child_index: int | None = None,
) -> dict[str, Any] | None:
    normalized_content = content.strip()
    if not normalized_content:
        return None

    anchor_ids = [block.get("anchorId") for block in source_blocks if block.get("anchorId")]
    anchor_hashes = [block.get("anchorHash") for block in source_blocks if block.get("anchorHash")]
    pages = [block["page"] for block in source_blocks] or [section["pageStart"]]
    chunk_id = _stable_uuid(
        document_id,
        "chunk",
        section["id"],
        chunk_kind,
        child_index if child_index is not None else 0,
        normalized_content[:120],
    )

    metadata = {
        "hierarchyPath": section.get("hierarchyPath", []),
        "sectionHeading": section.get("heading"),
        "anchorIds": anchor_ids,
        "anchorHashes": anchor_hashes,
        "sourceBlockIds": [block["blockId"] for block in source_blocks],
    }
    if child_index is not None:
        metadata["childIndex"] = child_index

    return {
        "id": chunk_id,
        "sectionId": section["id"],
        "anchorId": anchor_ids[0] if anchor_ids else None,
        "pageStart": min(pages),
        "pageEnd": max(pages),
        "chunkIndex": chunk_index,
        "chunkKind": chunk_kind,
        "content": normalized_content,
        "tokenCount": _estimate_token_count(normalized_content),
        "metadata": metadata,
    }


def _build_chunks(document_id: str, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    chunk_index = 0

    for section in sections:
        parent_chunk = _emit_chunk(
            document_id,
            chunk_index,
            section=section,
            chunk_kind="parent",
            content=_truncate(section["content"], MAX_PARENT_CHARS),
            source_blocks=section["blocks"],
        )
        if parent_chunk:
            chunks.append(parent_chunk)
            chunk_index += 1

        units = section["blocks"]
        current_units: list[dict[str, Any]] = []
        current_length = 0
        child_index = 0

        def flush_child() -> None:
            nonlocal current_units, current_length, child_index, chunk_index
            if not current_units:
                return

            child_content = "\n\n".join(unit["text"] for unit in current_units).strip()
            child_chunk = _emit_chunk(
                document_id,
                chunk_index,
                section=section,
                chunk_kind="child",
                content=child_content,
                source_blocks=current_units,
                child_index=child_index,
            )
            if child_chunk:
                chunks.append(child_chunk)
                child_index += 1
                chunk_index += 1

            overlap = current_units[-OVERLAP_UNITS:] if OVERLAP_UNITS > 0 else []
            current_units = list(overlap)
            current_length = sum(len(unit["text"]) for unit in current_units)

        for unit in units:
            unit_length = len(unit["text"])
            projected_length = current_length + unit_length + (2 if current_units else 0)
            if current_units and projected_length > MAX_CHILD_CHARS:
                flush_child()

            current_units.append(unit)
            current_length += unit_length + (2 if current_units else 0)

        flush_child()

    deduped_chunks: list[dict[str, Any]] = []
    seen_signatures: set[tuple[str, str]] = set()
    for chunk in chunks:
        signature = (chunk["sectionId"], chunk["content"])
        if chunk["chunkKind"] == "child" and signature in seen_signatures:
            continue
        seen_signatures.add(signature)
        deduped_chunks.append(chunk)

    for index, chunk in enumerate(deduped_chunks):
        chunk["chunkIndex"] = index

    return deduped_chunks


def _apply_parse_metadata(items: list[dict[str, Any]], parse_metadata: dict[str, Any]) -> None:
    for item in items:
        metadata = item.get("metadata")
        if not isinstance(metadata, dict):
            metadata = {}
        metadata.update(parse_metadata)
        item["metadata"] = metadata


def _assemble_analysis(
    document_id: str,
    page_count: int,
    blocks: list[dict[str, Any]],
    parse_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    anchors = _hydrate_anchors(document_id, blocks)
    sections = _build_sections(document_id, blocks)
    chunks = _build_chunks(document_id, sections)
    if parse_metadata:
        _apply_parse_metadata(sections, parse_metadata)
        _apply_parse_metadata(chunks, parse_metadata)

    return {
        "pageCount": page_count,
        "parseMetadata": parse_metadata or {},
        "anchors": anchors,
        "sections": [
            {key: value for key, value in section.items() if key != "blocks"}
            for section in sections
        ],
        "chunks": chunks,
    }


def _extract_docling_blocks(file_path: str, document_id: str) -> tuple[int, list[dict[str, Any]]] | None:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        logger.warning("docling not installed, skipping docling pipeline")
        return None

    try:
        converter = DocumentConverter()
        result = converter.convert(file_path)
        doc = result.document

        blocks: list[dict[str, Any]] = []
        heading_stack: list[str] = []

        for block_index, item in enumerate(doc.iterate_items()):
            element = item
            text = getattr(element, "text", "") or ""
            label = getattr(element, "label", "paragraph") or "paragraph"
            prov_list = getattr(element, "prov", []) or []

            page = 1
            bbox = None
            if prov_list:
                first_prov = prov_list[0]
                page = getattr(first_prov, "page_no", 1) or 1
                bbox_obj = getattr(first_prov, "bbox", None)
                if bbox_obj is not None:
                    bbox = _rect_from_bbox(
                        getattr(bbox_obj, "l", 0.0),
                        getattr(bbox_obj, "t", 0.0),
                        getattr(bbox_obj, "r", 0.0),
                        getattr(bbox_obj, "b", 0.0),
                    )

            heading_level = _infer_heading_level(str(label), text)
            normalized_text = _normalize_text(text).lstrip("# ")
            if heading_level and normalized_text:
                heading_stack = heading_stack[: max(0, heading_level - 1)]
                heading_stack.append(normalized_text)

            block = _build_block(
                document_id,
                block_index,
                text=normalized_text,
                label=str(label),
                page=page,
                hierarchy_path=_copy_hierarchy_path(heading_stack),
                heading_level=heading_level,
                bbox=bbox,
            )
            if block:
                blocks.append(block)

        page_count = max((block["page"] for block in blocks), default=1)
        return page_count, blocks
    except Exception as exc:
        logger.error("Docling parsing failed: %s", exc, exc_info=True)
        return None


def _extract_pymupdf_blocks(file_path: str, document_id: str) -> tuple[int, list[dict[str, Any]]]:
    try:
        import fitz
    except ImportError:
        logger.error("pymupdf not installed, cannot parse document")
        return 0, []

    doc = fitz.open(file_path)
    blocks: list[dict[str, Any]] = []
    heading_stack: list[str] = []
    block_index = 0

    for page_num in range(doc.page_count):
        page = doc.load_page(page_num)
        text_blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        for block in text_blocks:
            if block.get("type") != 0:
                continue

            raw_lines = []
            max_font_size = 0.0
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = "".join(span.get("text", "") for span in spans).strip()
                if line_text:
                    raw_lines.append(line_text)
                for span in spans:
                    max_font_size = max(max_font_size, float(span.get("size", 0.0) or 0.0))

            text = _normalize_text(" ".join(raw_lines))
            if not text:
                continue

            is_heading = (
                len(text) <= 100
                and not text.endswith(("。", ".", ":", "：", ";", "；", "?", "？"))
                and max_font_size >= 12.0
            )
            heading_level = 1 if is_heading else None
            if heading_level:
                heading_stack = heading_stack[: max(0, heading_level - 1)]
                heading_stack.append(text)

            bbox_raw = block.get("bbox", (0.0, 0.0, 0.0, 0.0))
            built_block = _build_block(
                document_id,
                block_index,
                text=text,
                label="heading" if is_heading else "paragraph",
                page=page_num + 1,
                hierarchy_path=_copy_hierarchy_path(heading_stack),
                heading_level=heading_level,
                bbox=_rect_from_bbox(*bbox_raw),
            )
            block_index += 1
            if built_block:
                blocks.append(built_block)

    page_count = doc.page_count
    doc.close()
    return page_count, blocks


def _detect_pdf_type(file_path: str) -> dict[str, Any]:
    """Classify a PDF by text-layer coverage before choosing the parser."""
    try:
        import fitz
    except ImportError:
        return {"pdfType": "unknown", "textLayerPages": 0, "scannedPages": 0, "totalPages": 0}

    doc = fitz.open(file_path)
    try:
        total_pages = doc.page_count
        text_layer_pages = 0
        scanned_pages = 0
        for page_num in range(total_pages):
            text = _normalize_text(doc.load_page(page_num).get_text("text"))
            if len(text) >= PDF_TEXT_MIN_CHARS_PER_PAGE:
                text_layer_pages += 1
            else:
                scanned_pages += 1

        if total_pages == 0:
            pdf_type = "unknown"
        elif text_layer_pages == total_pages:
            pdf_type = "text"
        elif scanned_pages == total_pages:
            pdf_type = "scanned"
        else:
            pdf_type = "mixed"

        return {
            "pdfType": pdf_type,
            "textLayerPages": text_layer_pages,
            "scannedPages": scanned_pages,
            "totalPages": total_pages,
        }
    finally:
        doc.close()


def _extract_text_blocks(file_path: str, document_id: str) -> tuple[int, list[dict[str, Any]]]:
    content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
    suffix = Path(file_path).suffix.lower()
    blocks: list[dict[str, Any]] = []
    heading_stack: list[str] = []
    block_index = 0
    paragraph_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_lines, block_index
        text = _normalize_text(" ".join(paragraph_lines))
        if not text:
            paragraph_lines = []
            return
        block = _build_block(
            document_id,
            block_index,
            text=text,
            label="paragraph",
            page=1,
            hierarchy_path=_copy_hierarchy_path(heading_stack),
            heading_level=None,
            bbox=None,
        )
        block_index += 1
        if block:
            blocks.append(block)
        paragraph_lines = []

    for raw_line in content.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            flush_paragraph()
            continue

        if suffix == ".md" and stripped.startswith("#"):
            flush_paragraph()
            heading_level = min(6, len(stripped) - len(stripped.lstrip("#")))
            heading_text = stripped.lstrip("#").strip()
            heading_stack = heading_stack[: max(0, heading_level - 1)]
            heading_stack.append(heading_text)
            block = _build_block(
                document_id,
                block_index,
                text=heading_text,
                label="heading",
                page=1,
                hierarchy_path=_copy_hierarchy_path(heading_stack),
                heading_level=heading_level,
                bbox=None,
            )
            block_index += 1
            if block:
                blocks.append(block)
            continue

        paragraph_lines.append(stripped)

    flush_paragraph()
    return 1, blocks


def _parse_document(file_path: str, document_id: str) -> dict[str, Any]:
    suffix = Path(file_path).suffix.lower()

    if suffix in {".md", ".txt"}:
        page_count, blocks = _extract_text_blocks(file_path, document_id)
        return _assemble_analysis(document_id, page_count, blocks, {"parseMode": "text"})

    if suffix == ".pdf":
        detection = _detect_pdf_type(file_path)
        pdf_type = detection.get("pdfType", "unknown")
        if pdf_type in {"text", "mixed"}:
            page_count, blocks = _extract_pymupdf_blocks(file_path, document_id)
            metadata = {**detection, "parseMode": "pymupdf"}
            if pdf_type == "mixed":
                metadata["parseWarning"] = "mixed_pdf_text_layer; OCR pages require follow-up parsing"
            return _assemble_analysis(document_id, page_count, blocks, metadata)

        docling_result = _extract_docling_blocks(file_path, document_id)
        if docling_result is not None:
            page_count, blocks = docling_result
            return _assemble_analysis(
                document_id,
                page_count,
                blocks,
                {**detection, "parseMode": "docling_ocr" if pdf_type == "scanned" else "docling"},
            )

        page_count, blocks = _extract_pymupdf_blocks(file_path, document_id)
        return _assemble_analysis(document_id, page_count, blocks, {**detection, "parseMode": "pymupdf"})

    docling_result = _extract_docling_blocks(file_path, document_id)
    if docling_result is not None:
        page_count, blocks = docling_result
        return _assemble_analysis(document_id, page_count, blocks, {"parseMode": "docling"})

    logger.info("Falling back to PyMuPDF for document %s", document_id)
    page_count, blocks = _extract_pymupdf_blocks(file_path, document_id)
    return _assemble_analysis(document_id, page_count, blocks, {"parseMode": "pymupdf"})


def run_document_parse_workflow(
    run_id: str,
    document_id: str,
    host: HostGatewayClient,
) -> dict[str, Any]:
    """Parse a document into anchors, sections, and parent/child chunks."""
    _ = run_id
    document = host.get_document(document_id)
    if not document:
        return {"status": "failed", "error": f"Document {document_id} not found"}

    file_path = document.get("filePath", "")
    if not file_path or not Path(file_path).exists():
        host.update_document_status(document_id, "error")
        return {"status": "failed", "error": f"File not found: {file_path}"}

    host.update_document_status(document_id, "parsing")

    result = _parse_document(file_path, document_id)
    if not result["anchors"] and not result["chunks"]:
        host.update_document_status(document_id, "error")
        return {"status": "failed", "error": "No extractable content found"}

    host.save_document_analysis(
        document_id,
        {
            "pageCount": result["pageCount"],
            "anchors": result["anchors"],
            "sections": result["sections"],
            "chunks": result["chunks"],
        },
    )

    host.update_document_status(document_id, "parsed")

    return {
        "status": "completed",
        "pageCount": result["pageCount"],
        "anchorCount": len(result["anchors"]),
        "sectionCount": len(result["sections"]),
        "chunkCount": len(result["chunks"]),
        "parseMetadata": result.get("parseMetadata", {}),
    }
