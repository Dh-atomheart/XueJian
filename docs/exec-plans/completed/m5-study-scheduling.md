---
title: M5 Study Scheduling
status: archived
owner: app
last_reviewed: 2026-04-18
canonical: true
---

# M5 学习调度模块

## Goal

基于 FSRS 提供今日任务、翻卡学习、列表学习、评分和复习记录，把学习页做成高聚焦的主舞台。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [../completed/m3-card-production-line.md](../completed/m3-card-production-line.md) ✅
- [../../design-docs/pages.md](../../design-docs/pages.md)

## Scope

- `ts-fsrs` 集成与默认参数
- 今日任务计算
- 翻卡学习界面和列表学习视图
- `Again / Hard / Good / Easy` 评分逻辑
- `ReviewLog` 持久化和基础统计

## Acceptance

- 今日待复习和新卡数计算正确
- 用户可完成完整评分流程并写入 `ReviewLog`
- 评分后同步更新卡片状态和下次复习时间
- 学习页保持视觉聚焦，不退化为后台管理面板

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| m5-a1 | 今日待复习和新卡数计算正确 | ✅ |
| m5-a2 | 完整评分流程写入 ReviewLog | ✅ |
| m5-a3 | 评分后同步更新卡片状态和下次复习时间 | ✅ |
| m5-a4 | 学习页保持视觉聚焦 | ✅ |

## Relevant Files

- `xuejian/src/components/learning/`
- `xuejian/src/features/review/`
- `xuejian/src/services/learning/`
- `xuejian/src/services/gateway/cards.ts`
- `xuejian/src-tauri/src/db/card_repo.rs`
- `xuejian/src-tauri/src/db/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`

## Notes

- MVP 不开放复杂 FSRS 参数设置。
- 学习结果要可复用给 `M6` 的最小统计和后续积分系统。
