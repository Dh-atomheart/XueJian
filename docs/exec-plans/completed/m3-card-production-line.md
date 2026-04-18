---
title: M3 Card Production Line
status: archived
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# M3 卡片生产线模块

## Goal

建立从文档分块到卡片候选、人工确认、正式入库、恢复与导出的完整生产线。

## Depends On

- [../completed/m1-platform-foundation.md](../completed/m1-platform-foundation.md) ✅
- [../completed/m2-document-import-and-anchors.md](../completed/m2-document-import-and-anchors.md) ✅
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

## Tests

| ID | 验收点 | 状态 |
|----|--------|------|
| m3-a1 | 启动任务、查看候选、批量确认并入库 | ✅ |
| m3-a2 | 任务支持取消、恢复和错误解释 | ✅ |
| m3-a3 | 候选与正式卡片都保留来源锚点 | ✅ |
| m3-a4 | 幂等保存，恢复后不生成重复正式卡片 | ⏳ |

## Relevant Files

- `xuejian/orchestration_service/main.py` — Python card_generation workflow + HostGatewayClient
- `xuejian/orchestration_service/requirements.txt` — LangChain dependencies
- `xuejian/src/features/cards/CardStudioPage.tsx` — Full card studio UI
- `xuejian/src/services/gateway/cards.ts` — Card/candidate/highlight gateway
- `xuejian/src/services/gateway/orchestration.ts` — Orchestration gateway
- `xuejian/src-tauri/src/app_state.rs` — Shared AppState (extracted from commands)
- `xuejian/src-tauri/src/gateway/host_http.rs` — Host HTTP gateway (ModelGateway + ToolGateway)
- `xuejian/src-tauri/src/gateway/mod.rs` — Gateway manifest
- `xuejian/src-tauri/src/tasks/orchestration_service.rs` — Python process manager
- `xuejian/src-tauri/src/commands/cards.rs` — Card generation workflow + orchestration integration
- `xuejian/src-tauri/src/db/card_repo.rs` — Card/candidate/highlight DB repo
- `xuejian/src-tauri/src/db/workflow_repo.rs` — Workflow DB repo

## Checks

- `python scripts/docs/validate.py`
- `python scripts/docs/check_architecture.py`
- `cd xuejian && npm run lint`
- `cd xuejian && npm run test`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- `python scripts/docs/preflight.py`

## Notes

- Python 只能通过 Host 获取模型、文件、预算和受控工具能力。
- 人工确认点是正式边界，候选数据不能越过它直接写正式表。
- Rust worker 先尝试调 Python service，失败则回退到本地规则生成。
- `app_state.rs` 从 commands 层提取到 crate root，避免 gateway 依赖 commands（架构规则）。
