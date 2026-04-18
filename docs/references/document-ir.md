---
title: DocumentIR Reference
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# DocumentIR Reference

`DocumentIR` is the shared intermediate representation between document parsing, retrieval, card generation, reader anchors, and citation rendering.

## Purpose

The project should stop passing around loosely shaped parser payloads. `DocumentIR` provides a stable contract that supports:

- chunking
- citation tracking
- page and anchor lookup
- reader highlight linking
- card draft generation
- downstream artifact generation

## Core Shape

Suggested top-level fields:

- `document`
- `pages`
- `blocks`
- `spans`
- `anchors`
- `assets`
- `citations`
- `sourceMetadata`

## Field Intent

### `document`

Identity and provenance.

Examples:

- document id
- title
- mime type
- source path
- parser version

### `pages`

Page-level geometry and ordering.

Examples:

- page number
- width and height
- rotation
- page labels

### `blocks`

Semantic or layout-oriented units such as:

- heading
- paragraph
- list
- table
- figure
- code block

Each block should be able to reference page and span ranges.

### `spans`

Fine-grained text runs or token-aligned segments used for:

- precise highlighting
- snippet extraction
- anchor resolution

### `anchors`

Resolvable handles for deep links and source jumps.

Examples:

- page + bbox anchor
- span id range
- paragraph id

### `assets`

External or embedded supporting material:

- images
- tables rendered as assets
- extracted figures

### `citations`

Structured source references, not string-only footnotes.

Each citation should link back to one or more anchors.

### `sourceMetadata`

Parser and ingestion metadata, such as:

- import timestamp
- parser family
- warnings
- language

## Pipeline Role

Recommended pipeline:

1. Parse source into `DocumentIR`
2. Derive retrieval chunks and anchor maps
3. Ask the model to draft cards or content from the structured source
4. Persist artifacts with citation references back to IR

## Non-Goals

- raw HTML as the canonical storage format
- parser-specific opaque payloads leaking into all downstream layers
- citation data that cannot resolve back to anchors
