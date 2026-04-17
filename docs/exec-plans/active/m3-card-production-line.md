---
title: M3 Card Production Line
status: draft
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# M3 卡片生产线模块

## Goal

建立从文档分块到卡片候选、人工确认、正式入库、恢复与导出的完整生产线。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [./m2-document-import-and-anchors.md](./m2-document-import-and-anchors.md)
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- Python orchestration service 工作流骨架
- Host / service 协议与事件流
- `chunk -> generate -> confirm -> save` 流程
- `CardCandidate`、`Card`、`WorkflowRun`、`WorkflowCheckpoint`
- 批量确认、单张编辑、恢复与导出

## Acceptance

- 用户可启动生成任务、查看候选、批量确认并入库
- 任务支持取消、恢复和错误解释
- 候选与正式卡片都保留来源锚点
- 幂等保存，恢复后不生成重复正式卡片

## Relevant Files

- `xuejian/orchestration_service/`
- `xuejian/src/features/agents/`
- `xuejian/src/features/cards/`
- `xuejian/src/components/cards/`
- `xuejian/src/services/gateway/cards.ts`
- `xuejian/src/services/gateway/orchestration.ts`
- `xuejian/src-tauri/src/gateway/`
- `xuejian/src-tauri/src/tasks/`
- `xuejian/src-tauri/src/commands/orchestration.rs`
- `xuejian/src-tauri/src/db/workflow_repo.rs`
- `xuejian/src-tauri/src/db/card_repo.rs`

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`

## Notes

- Python 只能通过 Host 获取模型、文件、预算和受控工具能力。
- 人工确认点是正式边界，候选数据不能越过它直接写正式表。
