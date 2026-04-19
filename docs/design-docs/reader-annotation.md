---
title: 阅读页贴笺与标注设计
---

# Reader Annotation Design

This file records the target interaction model for the PDF reader, highlights, sticky notes, and source-to-card jumps.

## Core Model Split

MVP uses a single `Highlight` type. V2+ introduces the following split:

- `Highlight`: geometry, selected text, and source anchor (MVP)
- `ReaderAnnotation`: annotation metadata bound to one or more highlights (V2+)
- `NoteThread`: note content, replies, status, and card links (V2+)

Do not use one type to represent all three concerns once V2 ships.

## Primary Reader Behaviors

- page navigation
- zoom
- source anchor jump
- highlight creation
- right-sidebar note browsing
- card-to-source and source-to-card linking

## Layout Direction

Preferred structure:

- center reading surface
- right annotation sidebar
- stable header for document title, page, and zoom controls

The annotation sidebar should remain visible for note-heavy workflows.

## Persistence Rule

Phase 1 stores annotations in SQLite sidecar data. The original PDF file remains unchanged.

## Interaction Notes

- A note can exist without mutating the PDF file.
- A single note thread may point to multiple highlights if the UX requires grouped commentary.
- Cards should link back to precise anchors or highlight ranges, not only page numbers.

## Implementation Direction

This design aligns with:

- `PDF.js` as the main reader surface (custom canvas rendering with highlight overlay)
- `components/reader/` for reusable reader UI composition
- `features/reader/` for page orchestration
