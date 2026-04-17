---
title: V2-3 Multi Format Import
status: draft
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

## Relevant Files

- `xuejian/src/features/documents/`
- `xuejian/src/components/documents/`
- `xuejian/src/services/renderer/`
- `xuejian/src-tauri/src/commands/documents.rs`
- `xuejian/src-tauri/src/db/document_repo.rs`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 不新增与 PDF 平行的第二套文档状态体系。
- DOCX 等格式的定位能力可以降级，但必须可解释。
- **Backlog**：此计划属于 V2 阶段，MVP（m1–m6）完成前不应启动。
