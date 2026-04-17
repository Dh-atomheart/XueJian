---
title: V3-1 Card Animation
status: draft
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# V3-1 卡片动画生成模块

## Goal

把适合可视化表达的卡片内容转为动画预览资源，并建立失败可回退、资源可清理的闭环。

## Depends On

- [../../product-specs/v3.md](../../product-specs/v3.md)
- [./m3-card-production-line.md](./m3-card-production-line.md)

## Scope

- 动画引擎选型
- 内容分析与动画意图结构化
- 脚本生成与执行沙箱
- 预览组件与资源管理

## Acceptance

- 用户可从卡片发起动画生成
- 动画可预览、重生成、删除
- 失败任务保留足够上下文用于排查和重试
- 废弃资源可清理

## Relevant Files

- `xuejian/src/features/animation/`
- `xuejian/src/components/animation/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/src-tauri/src/db/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 生成脚本必须受约束，不能变成任意执行入口。
- **Backlog**：此计划属于 V3 阶段，V2 完成前不应启动。
