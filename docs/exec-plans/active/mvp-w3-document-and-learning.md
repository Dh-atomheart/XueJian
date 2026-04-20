---
title: MVP W3 Document And Learning
status: done
owner: platform
last_reviewed: 2026-04-19
canonical: true
---

# MVP 第3周：文档处理与学习核心功能

## Goal

实现 PDF 上传落盘、Docling+PyMuPDF 解析管线（产出 hierarchyPath/bbox/quoteHash）、PDF.js 前端渲染与文本选择热区、文档转卡片工作流（PydanticAI CardDraft）、genanki .apkg 导出、FSRS 调度与贴笺展示，打通从文档上传到卡片学习的完整闭环。

## Depends On

- [mvp-w2-gateway-and-orchestration.md](./mvp-w2-gateway-and-orchestration.md) ⏳
- [../../references/document-ir.md](../../references/document-ir.md)
- [../../design-docs/reader-annotation.md](../../design-docs/reader-annotation.md)

## Scope

- 实现 PDF 上传：Rust 落盘 + document 状态管理（uploading→parsed→ready）
- 实现 `parsing/docling_pipeline.py`：Docling 解析结构 + PyMuPDF 提取坐标 → DocumentIR
- PDF.js 前端渲染：复用已有 `PdfPageCanvas` + `HighlightLayer`，接入新 hierarchyPath/quoteHash 锚点
- 文档转卡片工作流：调用 W2 的 PydanticAI CardDraft + LiteLLM 路由
- genanki .apkg 导出：调用 W2 的 `genanki_exporter.py`
- FSRS 调度算法：使用 ts-fsrs，实现 `ReviewPage` 的 Again/Hard/Good/Easy 评分
- 贴笺展示：右侧 ContextRail 展示当前页卡片，支持卡片→原文跳转
- 编写相关测试

## Acceptance

- 上传 PDF 后 Rust 落盘成功，document status 从 uploading → parsed → ready
- Docling+PyMuPDF 管线产出 DocumentIR，包含 hierarchyPath、bbox、quoteHash
- PDF.js 渲染当前页，HighlightLayer 正确显示高亮和焦点框
- 文档转卡片工作流产出 CardDraft，经人工确认后持久化为正式 Card（含 exportGuid）
- genanki 导出的 .apkg 文件可被 Anki 桌面版导入
- FSRS 评分后 card.state 和 nextReview 正确更新
- 贴笺栏点击卡片可滚动到原文对应锚点位置

## Tests

| ID        | 验收点                                                          | 状态 |
| --------- | --------------------------------------------------------------- | ---- |
| mvp-w3-a1 | PDF 上传落盘 + 状态流转 uploading→parsed→ready                  | ✅   |
| mvp-w3-a2 | Docling+PyMuPDF 产出 DocumentIR 含 hierarchyPath/bbox/quoteHash | ✅   |
| mvp-w3-a3 | 文档转卡片：CardDraft → 人工确认 → Card（含 exportGuid）        | ✅   |
| mvp-w3-a4 | genanki .apkg 导出可被 Anki 导入                                | ✅   |
| mvp-w3-a5 | FSRS 评分：state 和 nextReview 正确更新                         | ✅   |
| mvp-w3-a6 | 贴笺栏卡片→原文锚点跳转                                         | ✅   |

## Relevant Files

- `xuejian/orchestration_service/parsing/docling_pipeline.py` (to create)
- `xuejian/orchestration_service/workflows/card_generation.py`
- `xuejian/orchestration_service/exports/genanki_exporter.py`
- `xuejian/src-tauri/src/commands/documents.rs`
- `xuejian/src-tauri/src/db/document_repo.rs`
- `xuejian/src/features/documents/ReaderPage.tsx`
- `xuejian/src/components/documents/PdfPageCanvas.tsx`
- `xuejian/src/components/documents/HighlightLayer.tsx`
- `xuejian/src/features/learning/ReviewPage.tsx`
- `xuejian/src/services/renderer/pdf.ts`

## Checks

- `pytest orchestration_service/`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- `cd xuejian && npm run test`
- `cd xuejian && npm run lint`

## Notes

- Docling 首次冷启动可能需要下载模型，需在 UI 显示进度条
- PDF.js 仅做前端渲染，不做解析；解析由 Python sidecar 的 Docling+PyMuPDF 完成
- genanki 导出需要 card.exportGuid，此字段在 W1 迁移中已添加
- FSRS 使用 ts-fsrs 库，初始参数使用默认值，后续根据数据优化
- 贴笺栏复用已有 ContextRail 组件，仅展示当前页的 cards
