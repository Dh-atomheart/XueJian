---
title: M4 Reading And Sticky Notes
status: draft
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# M4 阅读与贴笺模块

## Goal

在桌面端阅读壳层中实现 PDF 阅读、贴笺卡、原文高亮和双向跳转，把“贴笺式学习体验”做成 MVP 核心差异点。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [./m2-document-import-and-anchors.md](./m2-document-import-and-anchors.md)
- [./m3-card-production-line.md](./m3-card-production-line.md)
- [../../design-docs/pages.md](../../design-docs/pages.md)
- [../../design-docs/interactions.md](../../design-docs/interactions.md)

## Scope

- PDF 阅读器、工具栏、分页和文本层
- 高亮图层与选区菜单
- 右侧贴笺栏与当前页卡片列表
- 卡片跳原文、原文跳卡片
- 缩放坐标映射与重绑定入口

## Acceptance

- 用户可边读 PDF 边查看当前页关联卡片
- 点击卡片可定位原文，点击高亮可定位贴笺卡
- 布局固定为导航轨 + 阅读区 + 贴笺栏
- 高亮和装饰不影响正文阅读与文本选择

## Relevant Files

- `xuejian/src/components/documents/`
- `xuejian/src/components/shell/`
- `xuejian/src/features/documents/`
- `xuejian/src/services/renderer/`
- `xuejian/src/lib/cache/documentCache.ts`
- `xuejian/src/types/document.ts`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cd xuejian && npm run test:e2e`

## Notes

- 视觉上要继承默认纸感与细墨线系统，不能退回后台列表风。
- 锚点漂移必须有手动修复路径，不允许静默失败。
