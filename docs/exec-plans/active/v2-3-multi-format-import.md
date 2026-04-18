---
title: V2-3 Multi Format Import
status: archived
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# V2-3 多格式文档导入模块

## Goal

在复用现有文档导入主链路的前提下，支持 MD、TXT、DOCX 导入与锚点降级策略。

## Depends On

- [../../product-specs/v2.md](../../product-specs/v2.md)
- [../completed/m2-document-import-and-anchors.md](../completed/m2-document-import-and-anchors.md) ✅

## Scope

- MD / TXT / DOCX 文件导入
- 统一的 `Document` 入口和状态流转
- 锚点降级策略与来源回查
- 与卡片生成、RAG 的兼容

## Acceptance

- 新格式导入后继续走统一文档主链路
- 降级锚点策略仍能支撑卡片生成和引用
- 错误文件保留明确状态，不写入半成品正式数据

## Tests

| ID      | 验收点                     | 状态 |
| ------- | -------------------------- | ---- |
| v2-3-a1 | 新格式走统一文档主链路     | ✅   |
| v2-3-a2 | 降级锚点支撑卡片生成和引用 | ✅   |
| v2-3-a3 | 错误文件保留明确状态       | ✅   |

## Relevant Files

- `xuejian/src-tauri/src/commands/documents.rs` — generalized import + pick_and_import_document
- `xuejian/src/services/renderer/text.ts` — MD/TXT parser with degraded anchors
- `xuejian/src/services/renderer/docx.ts` — DOCX parser (ZIP + XML text extraction)
- `xuejian/src/features/documents/useDocumentImport.ts` — format-routed importDocument hook
- `xuejian/src/components/documents/ImportDocumentButton.tsx` — multi-format button
- `xuejian/src/services/gateway/documents.ts` — pickAndImportDocument gateway
- `xuejian/src/services/gateway/mockData.ts` — mock for pick_and_import_document
- `xuejian/tests/services/multi-format-import.test.ts` — acceptance tests

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 不新增与 PDF 平行的第二套文档状态体系。
- DOCX 等格式的定位能力可以降级，但必须可解释。
- **Backlog**：此计划属于 V2 阶段，MVP（m1–m6）完成前不应启动。
