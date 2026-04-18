---
title: V2-2 Points System
status: draft
owner: app
last_reviewed: 2026-04-17
canonical: true
---

# V2-2 积分系统模块

## Goal

建立可审计、可防重、可回溯的学习积分系统，复用 `M5` 的学习事件而不破坏主复习流程。

## Depends On

- [../../product-specs/v2.md](../../product-specs/v2.md)
- [./m5-study-scheduling.md](./m5-study-scheduling.md)

## Scope

- 积分事件模型和账本
- 学习事件到积分事件的映射
- 防重记账和撤销场景
- 首页或个人页的最小积分展示

## Acceptance

- 同一学习事件不会重复记账
- 积分流水可追溯到具体学习行为
- 积分展示不打断主学习节奏
- 账本设计可支持后续规则扩展

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| v2-2-a1 | 同一学习事件不会重复记账 | ⏳ |
| v2-2-a2 | 积分流水可追溯到具体学习行为 | ⏳ |
| v2-2-a3 | 积分展示不打断主学习节奏 | ⏳ |
| v2-2-a4 | 账本设计可支持后续规则扩展 | ⏳ |

## Relevant Files

- `xuejian/src/features/review/`
- `xuejian/src/components/stats/`
- `xuejian/src/services/learning/`
- `xuejian/src-tauri/src/db/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- 先做账本和规则边界，不把积分系统演化成复杂 gamification 平台。
- **Backlog**：此计划属于 V2 阶段，MVP（m1–m6）完成前不应启动。
