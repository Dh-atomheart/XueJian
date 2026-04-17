---
title: M2 Document Import And Anchors
status: archived
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# M2 文档导入与锚点模块

## Goal

支持 PDF 导入、复制、解析、建档、分块和锚点生成，为卡片生成和阅读联动提供稳定输入。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [../../product-specs/mvp.md](../../product-specs/mvp.md)

## Scope

- 文件选择与应用目录复制
- PDF.js 加载、文本提取、分页渲染
- `Document`、`DocumentChunk`、`DocumentAnchor` 建模与写库
- 文档状态流转与错误状态
- 文档列表与基础预览

## Acceptance

- 用户可导入有效 PDF 并看到状态流转
- `DocumentChunk` 和 `DocumentAnchor` 可被后续模块复用
- 错误文件不会留下半成品正式数据
- 锚点至少保留 `page + quote + rects + hash`

## Relevant Files

- `xuejian/src/components/documents/`
- `xuejian/src/features/documents/`
- `xuejian/src/services/renderer/`
- `xuejian/src/services/gateway/documents.ts`
- `xuejian/src/types/document.ts`
- `xuejian/src-tauri/src/commands/documents.rs`
- `xuejian/src-tauri/src/db/document_repo.rs`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cd xuejian && npm run test:e2e`

## Notes

- 仅覆盖 MVP 的 PDF 导入，不提前混入多格式导入。
- 选区、段落编号和坐标规则要稳定，否则后续 `M3` 与 `M4` 都会漂移。
