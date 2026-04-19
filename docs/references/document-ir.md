---
title: DocumentIR 参考
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

## V1 Contract

The V1 contract freezes the field names, types, and semantics listed below. Downstream consumers (card generation, knowledge QA, reader, export) must program against this shape. Parsers (Docling+PyMuPDF pipeline) must produce this shape.

### `DocumentIR`

Top-level envelope.

| Field            | Type                  | Description                              |
| ---------------- | --------------------- | ---------------------------------------- |
| `documentId`     | `string (uuid)`       | FK to the `documents` table              |
| `parserFamily`   | `string`              | e.g. `"docling+pymupdf"`, `"docling"`, `"manual"` |
| `parserVersion`  | `string`              | SemVer of the parser run                 |
| `irVersion`      | `"1"`                 | Contract version discriminator           |
| `pages`          | `DocumentIRPage[]`    | Ordered page list                        |
| `blocks`         | `DocumentIRBlock[]`   | All semantic blocks across pages         |
| `assets`         | `DocumentIRAsset[]`   | Extracted images, tables-as-images, etc. |
| `sourceMetadata` | `DocumentIRMetadata`  | Import provenance and parser warnings    |

### `DocumentIRPage`

| Field        | Type     | Description                        |
| ------------ | -------- | ---------------------------------- |
| `pageNumber` | `number` | 1-based page index                 |
| `width`      | `number` | Page width in points               |
| `height`     | `number` | Page height in points              |
| `rotation`   | `number` | Rotation in degrees (0/90/180/270) |
| `label`      | `string \| null` | Optional page label (e.g. "iv") |

### `DocumentIRBlock`

A semantic or layout-oriented unit.

| Field           | Type                              | Description                            |
| --------------- | --------------------------------- | -------------------------------------- |
| `blockId`       | `string`                          | Stable identifier within the IR        |
| `blockType`     | `DocumentIRBlockType`             | Semantic type discriminator            |
| `pageNumber`    | `number`                          | Page this block primarily belongs to   |
| `content`       | `string`                          | Text content of the block              |
| `spans`         | `DocumentIRSpan[]`                | Fine-grained text runs                 |
| `anchorId`      | `string \| null`                  | FK to `document_anchors` if resolvable |
| `parentBlockId` | `string \| null`                  | For nested structures (list items, etc.) |
| `level`         | `number \| null`                  | Heading level or nesting depth         |
| `language`      | `string \| null`                  | Detected language (for code blocks)    |
| `metadata`      | `Record<string, unknown> \| null` | Parser-specific extension fields       |

### `DocumentIRBlockType`

```
'heading' | 'paragraph' | 'list' | 'list_item' | 'table' | 'figure' |
'code_block' | 'formula' | 'blockquote' | 'page_header' | 'page_footer' | 'unknown'
```

### `DocumentIRSpan`

Fine-grained text run within a block.

| Field    | Type              | Description                                    |
| -------- | ----------------- | ---------------------------------------------- |
| `spanId` | `string`          | Stable identifier within the IR                |
| `start`  | `number`          | Character offset within the block's `content`  |
| `end`    | `number`          | Character end offset (exclusive)               |
| `page`   | `number`          | Page number                                    |
| `rect`   | `IRRect \| null`  | Bounding box on page (points)                  |

### `IRRect`

| Field    | Type     |
| -------- | -------- |
| `x`      | `number` |
| `y`      | `number` |
| `width`  | `number` |
| `height` | `number` |

### `DocumentIRAsset`

| Field       | Type              | Description                       |
| ----------- | ----------------- | --------------------------------- |
| `assetId`   | `string`          | Stable identifier                 |
| `assetType` | `'image' \| 'table_image' \| 'figure'` | Asset category    |
| `blockId`   | `string \| null`  | Owning block                      |
| `mimeType`  | `string`          | e.g. `"image/png"`                |
| `dataRef`   | `string`          | File path or data URI             |
| `altText`   | `string \| null`  | Accessibility text                |

### `DocumentIRMetadata`

| Field              | Type                | Description                         |
| ------------------ | ------------------- | ----------------------------------- |
| `importTimestamp`  | `string` (ISO 8601) | When the parse was executed         |
| `sourceHash`       | `string \| null`    | Content hash of the source file     |
| `languageHint`     | `string \| null`    | Primary detected language           |
| `warnings`         | `string[]`          | Parser warnings or quality notes    |
| `totalBlocks`      | `number`            | Block count for quick sanity checks |
| `totalPages`       | `number`            | Page count                          |

## Pipeline Role

Recommended pipeline:

1. Parse source into `DocumentIR` via Docling+PyMuPDF (Docling for structure, PyMuPDF for coordinates)
2. Derive retrieval chunks and anchor maps (with hierarchyPath, bbox, quoteHash)
3. Ask the model to draft cards or content from the structured source (PydanticAI validated)
4. Persist artifacts with citation references back to IR

## Non-Goals

- raw HTML as the canonical storage format
- parser-specific opaque payloads leaking into all downstream layers
- citation data that cannot resolve back to anchors
