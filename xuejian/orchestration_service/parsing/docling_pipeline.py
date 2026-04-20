"""Docling + PyMuPDF document parsing pipeline.

Extracts structured content (chunks + anchors) from PDF documents.
Falls back to PyMuPDF if docling is unavailable.
"""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

# ── Helpers ────────────────────────────────────────────────


def _compute_quote_hash(text: str) -> str:
    """SHA-256 of normalized quote text for deduplication."""
    normalized = text.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _build_hierarchy_path(heading_stack: list[str]) -> list[str]:
    """Return a copy of the current heading hierarchy."""
    return list(heading_stack)


# ── Docling-based extraction ──────────────────────────────


def _try_docling_parse(file_path: str) -> dict | None:
    """Attempt to parse the document with docling. Returns structured result or None."""
    try:
        from docling.document_converter import DocumentConverter
    except ImportError:
        logger.warning("docling not installed, skipping docling pipeline")
        return None

    try:
        converter = DocumentConverter()
        result = converter.convert(file_path)
        doc = result.document

        anchors: list[dict] = []
        chunks: list[dict] = []
        heading_stack: list[str] = []
        chunk_index = 0

        for item in doc.iterate_items():
            element = item
            # docling items have .text, .label, and optionally .prov (provenance)
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
                    bbox = {
                        "x": getattr(bbox_obj, "l", 0.0),
                        "y": getattr(bbox_obj, "t", 0.0),
                        "width": getattr(bbox_obj, "r", 0.0) - getattr(bbox_obj, "l", 0.0),
                        "height": getattr(bbox_obj, "b", 0.0) - getattr(bbox_obj, "t", 0.0),
                    }

            # Track heading hierarchy
            if "heading" in label.lower() or "title" in label.lower():
                level = 1
                for ch in label:
                    if ch.isdigit():
                        level = int(ch)
                        break
                # Truncate stack to parent level
                heading_stack = heading_stack[: max(0, level - 1)]
                heading_stack.append(text.strip())

            # Build anchor for non-trivial text
            stripped = text.strip()
            if len(stripped) >= 12:
                quote_hash = _compute_quote_hash(stripped)
                anchor = {
                    "page": page,
                    "paragraph": None,
                    "textQuote": stripped[:500],
                    "hash": quote_hash,
                    "hierarchyPath": _build_hierarchy_path(heading_stack),
                    "rects": [bbox] if bbox else [],
                }
                anchors.append(anchor)

            # Build chunks from substantial text blocks
            if len(stripped) >= 30:
                anchor_hashes = [_compute_quote_hash(stripped)]
                chunk = {
                    "pageStart": page,
                    "pageEnd": page,
                    "chunkIndex": chunk_index,
                    "content": stripped[:2000],
                    "tokenCount": len(stripped.split()),
                    "metadata": {
                        "label": label,
                        "anchorHashes": anchor_hashes,
                        "hierarchyPath": _build_hierarchy_path(heading_stack),
                    },
                }
                chunks.append(chunk)
                chunk_index += 1

        page_count = max((a["page"] for a in anchors), default=1) if anchors else 1
        return {
            "pageCount": page_count,
            "anchors": anchors,
            "chunks": chunks,
        }
    except Exception as exc:
        logger.error("Docling parsing failed: %s", exc, exc_info=True)
        return None


# ── PyMuPDF fallback ──────────────────────────────────────


def _pymupdf_parse(file_path: str) -> dict:
    """Fallback parser using PyMuPDF (fitz) for basic text extraction."""
    try:
        import fitz  # pymupdf
    except ImportError:
        logger.error("pymupdf not installed, cannot parse document")
        return {"pageCount": 0, "anchors": [], "chunks": []}

    doc = fitz.open(file_path)
    page_count = doc.page_count
    anchors: list[dict] = []
    chunks: list[dict] = []
    chunk_index = 0

    for page_num in range(page_count):
        page = doc.load_page(page_num)
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        page_text_parts: list[str] = []
        for block in blocks:
            if block.get("type") != 0:  # text blocks only
                continue
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = "".join(s.get("text", "") for s in spans).strip()
                if not line_text:
                    continue
                page_text_parts.append(line_text)

                # Create anchor for substantial lines
                if len(line_text) >= 12:
                    bbox_raw = block.get("bbox", (0, 0, 0, 0))
                    quote_hash = _compute_quote_hash(line_text)
                    anchors.append({
                        "page": page_num + 1,
                        "paragraph": None,
                        "textQuote": line_text[:500],
                        "hash": quote_hash,
                        "hierarchyPath": [],
                        "rects": [{
                            "x": bbox_raw[0],
                            "y": bbox_raw[1],
                            "width": bbox_raw[2] - bbox_raw[0],
                            "height": bbox_raw[3] - bbox_raw[1],
                        }],
                    })

        # Create page-level chunk
        page_content = "\n".join(page_text_parts)
        if len(page_content.strip()) >= 30:
            anchor_hashes = [
                _compute_quote_hash(a["textQuote"])
                for a in anchors
                if a["page"] == page_num + 1
            ]
            chunks.append({
                "pageStart": page_num + 1,
                "pageEnd": page_num + 1,
                "chunkIndex": chunk_index,
                "content": page_content[:2000],
                "tokenCount": len(page_content.split()),
                "metadata": {
                    "anchorHashes": anchor_hashes,
                    "hierarchyPath": [],
                },
            })
            chunk_index += 1

    doc.close()
    return {
        "pageCount": page_count,
        "anchors": anchors,
        "chunks": chunks,
    }


# ── Public entry point ────────────────────────────────────


def run_document_parse_workflow(
    run_id: str,
    document_id: str,
    host: HostGatewayClient,
) -> dict:
    """Parse a document (PDF) via docling or PyMuPDF fallback.

    Steps:
    1. Fetch document metadata from host.
    2. Set status to 'parsing'.
    3. Extract anchors + chunks.
    4. Persist analysis via host.
    5. Set status to 'parsed' (ready for card generation).

    Returns:
        {"status": "completed", "pageCount": ..., "anchorCount": ..., "chunkCount": ...}
    """
    document = host.get_document(document_id)
    if not document:
        return {"status": "failed", "error": f"Document {document_id} not found"}

    file_path = document.get("filePath", "")
    if not file_path or not Path(file_path).exists():
        return {"status": "failed", "error": f"File not found: {file_path}"}

    # Mark document as parsing
    host.update_document_status(document_id, "parsing")

    # Try docling first, fall back to PyMuPDF
    result = _try_docling_parse(file_path)
    if result is None:
        logger.info("Falling back to PyMuPDF for document %s", document_id)
        result = _pymupdf_parse(file_path)

    if not result["anchors"] and not result["chunks"]:
        host.update_document_status(document_id, "failed")
        return {"status": "failed", "error": "No extractable content found"}

    # Persist analysis results to host
    host.save_document_analysis(document_id, {
        "pageCount": result["pageCount"],
        "anchors": [
            {
                "page": a["page"],
                "paragraph": a.get("paragraph"),
                "textQuote": a["textQuote"],
                "rects": a.get("rects", []),
                "hash": a["hash"],
            }
            for a in result["anchors"]
        ],
        "chunks": [
            {
                "pageStart": c.get("pageStart"),
                "pageEnd": c.get("pageEnd"),
                "chunkIndex": c["chunkIndex"],
                "content": c["content"],
                "tokenCount": c.get("tokenCount"),
                "metadata": c.get("metadata"),
            }
            for c in result["chunks"]
        ],
    })

    # Mark document as ready
    host.update_document_status(document_id, "parsed")

    return {
        "status": "completed",
        "pageCount": result["pageCount"],
        "anchorCount": len(result["anchors"]),
        "chunkCount": len(result["chunks"]),
    }
