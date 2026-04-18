---
title: Reader Annotation Design
status: active
owner: design
last_reviewed: 2026-04-18
canonical: true
---

# Reader Annotation Design

This file records the target interaction model for the PDF reader, highlights, sticky notes, and source-to-card jumps.

## Core Model Split

The reader should distinguish between selection and annotation.

- `Highlight`: geometry, selected text, and source anchor
- `ReaderAnnotation`: annotation metadata bound to one or more highlights
- `NoteThread`: note content, replies, status, and card links

Do not use one type to represent all three concerns.

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

- `react-pdf-viewer` as the main reader surface
- `components/reader/` for reusable reader UI composition
- `features/reader/` for page orchestration
