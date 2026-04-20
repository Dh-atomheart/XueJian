---
title: MVP W2 Gateway And Orchestration
status: draft
owner: platform
last_reviewed: 2026-04-19
canonical: true
---

# MVP 第2周：Host 网关与 Python 编排服务

## Goal

将 Python 编排服务从 LangChain-only 升级为 LiteLLM+PydanticAI+LangChain 三层架构，实现 provider 路由、结构化输出校验和成本 callback，完成预设工作流注册与 WorkflowCheckpoint 持久化，使 Host 网关具备完整的模型调用和任务恢复能力。

## Depends On

- [mvp-w1-foundation-and-data-layer.md](./mvp-w1-foundation-and-data-layer.md) ✅
- [../../references/ai-orchestration.md](../../references/ai-orchestration.md)

## Scope

- 实现 `providers/litellm_adapter.py`：provider 路由（openai/anthropic/custom）、成本 callback、流式输出归一化
- 实现 `schemas/card_draft.py`：PydanticAI `CardDraft` 结构化输出模型（含 title, cardType, front, back, tags, confidence, dedupeKey）
- 更新 `workflows/card_generation.py`：使用 PydanticAI 校验 LLM 输出，自动重试 ≤2 次
- 实现 Host ToolGateway `export_apkg` 端点（Rust 侧调用 Python genanki）
- 实现 `WorkflowCheckpoint` 持久化与恢复（Rust 侧已有 workflow_checkpoints 表，需 Python 侧写入）
- 实现任务事件流（WorkflowEvent）和取消能力
- 编写 Python 侧单元测试

## Acceptance

- `litellm_adapter.py` 可根据 provider 字段路由到 openai/anthropic/custom 端点
- `CardDraft` PydanticAI 模型校验成功时返回结构化对象，失败时自动重试 ≤2 次，超限产出 error 事件
- Host ToolGateway `/tool-gateway/export-apkg` 端点可接收 cardIds 列表并返回 .apkg 文件路径
- `WorkflowCheckpoint` 在每个 PresetWorkflow 节点完成后持久化，恢复时从最近 checkpoint 继续
- 任务取消后 Python 侧停止生成，Host 侧标记 run status 为 `cancelled`
- `pytest orchestration_service/` 通过

## Tests

| ID        | 验收点                                                                                      | 状态 |
| --------- | ------------------------------------------------------------------------------------------- | ---- |
| mvp-w2-a1 | LiteLLM provider 路由：openai→openai, anthropic→anthropic, custom→openai-compatible+baseUrl | ✅   |
| mvp-w2-a2 | PydanticAI CardDraft 校验：合法输出通过，非法输出重试 ≤2 次后降级                           | ✅   |
| mvp-w2-a3 | Host export_apkg 端点返回 .apkg 文件路径                                                    | ✅   |
| mvp-w2-a4 | WorkflowCheckpoint 持久化与恢复：中断后从最近 checkpoint 继续                               | ✅   |
| mvp-w2-a5 | 任务取消：Python 停止生成，Host 标记 cancelled                                              | ✅   |

## Relevant Files

- `xuejian/orchestration_service/providers/litellm_adapter.py` (to create)
- `xuejian/orchestration_service/schemas/card_draft.py` (to create)
- `xuejian/orchestration_service/workflows/card_generation.py`
- `xuejian/orchestration_service/clients/host_gateway.py`
- `xuejian/orchestration_service/exports/genanki_exporter.py` (to create)
- `xuejian/orchestration_service/server.py`
- `xuejian/src-tauri/src/gateway/host_http.rs`
- `xuejian/src-tauri/src/gateway/mod.rs`
- `xuejian/orchestration_service/requirements.txt`

## Checks

- `pytest orchestration_service/`
- `cargo test --manifest-path xuejian/src-tauri/Cargo.toml`
- `cd xuejian && npm run lint`

## Notes

- LiteLLM 运行在 Python sidecar 进程中，Rust Host 通过 HTTP 注入密钥到请求头，LiteLLM 不持久化密钥
- PydanticAI 的 retry 逻辑封装在 `schemas/card_draft.py`，workflow 层只调用 `validate_card_draft()`
- genanki .apkg 导出需要 stable exportGuid（W1 已在 Card 表添加）
- WorkflowCheckpoint 复用 V2 迁移已有的 workflow_checkpoints 表
- 取消能力通过 Python 侧轮询 Host 端的 run status 实现，不使用进程信号
