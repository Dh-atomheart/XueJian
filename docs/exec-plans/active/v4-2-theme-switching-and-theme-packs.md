---
title: V4-2 Theme Switching And Theme Packs
status: draft
owner: design
last_reviewed: 2026-04-17
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

## Relevant Files

- `xuejian/src/design-system/`
- `xuejian/src/components/shell/`
- `xuejian/src/assets/themes/`
- `xuejian/src/features/settings/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 主题扩展不能借机重写阅读器布局或学习主流程。
- **Backlog**：此计划属于 V4 阶段，V3 完成前不应启动。
