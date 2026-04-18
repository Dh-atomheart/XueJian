---
title: V4-2 Theme Switching And Theme Packs
status: archived
owner: design
last_reviewed: 2026-04-18
canonical: true
---

# V4-2 主题切换与扩展主题模块

## Goal

在不改变 MVP 默认视觉基线的前提下，增加主题切换、扩展主题包和无障碍回退主题能力。

## Depends On

- [../../product-specs/v4.md](../../product-specs/v4.md)
- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [../../design-docs/tokens.md](../../design-docs/tokens.md)
- [../../design-docs/foundation.md](../../design-docs/foundation.md)

## Scope

- `ThemeProvider` 与主题注册
- 主题切换状态持久化
- 扩展主题包 manifest 与资源映射
- 默认主题回退与高对比主题

## Acceptance

- 用户可切换默认主题、扩展主题包和回退主题
- 切换后阅读、学习、设置等关键界面保持可读与可用
- 主题包只能覆盖 token 和资源，不能改业务组件 API
- MVP 默认主题始终可回退

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| v4-2-a1 | 切换默认/扩展/回退主题 | ✅ |
| v4-2-a2 | 关键界面切换后保持可读可用 | ✅ |
| v4-2-a3 | 主题包只覆盖 token 和资源 | ✅ |
| v4-2-a4 | MVP 默认主题始终可回退 | ✅ |

## Relevant Files

- `xuejian/src/design-system/`
- `xuejian/src/design-system/themes.ts`
- `xuejian/src/design-system/ThemeProvider.tsx`
- `xuejian/src/components/shell/`
- `xuejian/src/features/settings/`
- `xuejian/src/queries/settings.ts`
- `xuejian/src/services/gateway/mockData.ts`
- `xuejian/src-tauri/src/commands/settings.rs`
- `xuejian/src-tauri/src/db/settings_repo.rs`
- `xuejian/tests/services/gateway/settings.test.ts`
- `xuejian/tests/unit/theme-provider.test.tsx`
- `xuejian/tests/unit/theme-readability.test.ts`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 主题扩展不能借机重写阅读器布局或学习主流程。
- 当前已完成第一批基础设施：运行时主题注册、设置持久化、Settings 切换入口、壳层与基础组件变量化。
- `v4-2-a2` 已完成：将 ReaderPage、FlipCard、RatingBar、KnowledgeGraphPage、SettingsPage 中的硬编码颜色全部迁移至主题 token（paper-*/ink-*/highlight-*/line-soft/shadow-*），并新增了静态源码扫描测试确保不回退。
