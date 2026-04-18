---
title: V3-1 Card Animation
status: active
owner: platform
last_reviewed: 2026-04-18
canonical: true
---

# V3-1 卡片动画生成模块

## Goal

把适合可视化表达的卡片内容转为动画预览资源，并建立失败可回退、资源可清理的闭环。

## Depends On

- [../../product-specs/v3.md](../../product-specs/v3.md)
- [../completed/m3-card-production-line.md](../completed/m3-card-production-line.md) ✅

## Scope

- 动画引擎选型：Framer Motion（`flashcard_reveal` + `keyword_emphasis`）
- AnimationScript = 纯数据 JSON（无可执行代码）
- LLM 生成动画脚本，Framer Motion 渲染
- 预览组件与资源管理

## Technical Decisions

- 2 种动画类型：`flashcard_reveal`（闪卡翻转展示）+ `keyword_emphasis`（关键词高亮强调）
- 无视频导出，仅应用内预览
- LLM 生成 AnimationScript JSON，本地 Rust 规则兜底
- Python 服务新增 `/workflows/card-animation` 端点

## Acceptance

- 用户可从卡片发起动画生成
- 动画可预览、重生成、删除
- 失败任务保留足够上下文用于排查和重试
- 废弃资源可清理

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| v3-1-a1 | 从卡片发起动画生成 | ✅ |
| v3-1-a2 | 动画可预览、重生成、删除 | ✅ |
| v3-1-a3 | 失败任务保留上下文 | ✅ |
| v3-1-a4 | 废弃资源可清理 | ✅ |

## Relevant Files

- `xuejian/src/features/animation/` (queries)
- `xuejian/src/components/cards/AnimationRenderer.tsx`
- `xuejian/src/components/cards/AnimationPreviewModal.tsx`
- `xuejian/src/queries/animation.ts`
- `xuejian/src/services/gateway/animation.ts`
- `xuejian/src/types/animation.ts`
- `xuejian/src-tauri/src/commands/animation.rs`
- `xuejian/src-tauri/src/db/animation_repo.rs`
- `xuejian/src-tauri/src/migrations/V5__card_animations.sql`
- `xuejian/orchestration_service/main.py` (new `/workflows/card-animation` endpoint)

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 生成脚本必须受约束，不能变成任意执行入口。
- **Backlog**：此计划属于 V3 阶段，V2 完成前不应启动。
