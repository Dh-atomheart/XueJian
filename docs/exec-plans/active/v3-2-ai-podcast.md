---
title: V3-2 AI Podcast
status: draft
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# V3-2 AI 播客生成模块

## Goal

根据文档或卡片集合生成播客式学习材料，打通提纲、脚本、TTS、音频拼接和恢复链路。

## Depends On

- [../../product-specs/v3.md](../../product-specs/v3.md)
- [./v2-1-rag.md](./v2-1-rag.md)
- [../completed/m6-byok-and-minimal-analytics.md](../completed/m6-byok-and-minimal-analytics.md) ✅
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- 提纲生成与多角色对话脚本
- TTS 分段生成
- 音频拼接和播放器
- `WorkflowRun` / checkpoint / 预算中止

## Acceptance

- 用户可生成播客脚本与音频
- 任务可恢复、可取消、可预算中止
- 音频、脚本和元数据都可回放和管理

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| v3-2-a1 | 生成播客脚本与音频 | ⏳ |
| v3-2-a2 | 任务可恢复、可取消、可预算中止 | ⏳ |
| v3-2-a3 | 音频、脚本和元数据可回放和管理 | ⏳ |

## Relevant Files

- `xuejian/orchestration_service/`
- `xuejian/src/features/podcast/`
- `xuejian/src/components/podcast/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/src-tauri/src/db/`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- 默认仍是 `LangChain-first`，只有工作流复杂度明显升级后才单独评估 `LangGraph`。
- **Backlog**：此计划属于 V3 阶段，V2 完成前不应启动。
