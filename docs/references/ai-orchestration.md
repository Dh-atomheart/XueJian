---
title: AI Orchestration Reference
status: active
owner: platform
last_reviewed: 2026-04-17
canonical: true
---

# AI 编排参考

## 决策结论

当前正式方案固定为：

- `Python Orchestration Service` 负责 AI 应用编排。
- `LangChain` 作为当前唯一正式编排框架。
- `LangGraph` 不作为现行运行时前提，只保留为未来升级路径。

## 分层职责

### UI / React

- 负责页面交互、进度展示、流式结果渲染和人工确认入口。
- 不直接持有主数据库真相。
- 不直接持有明文密钥。

### Rust / Tauri Host

- 持有 `SQLite`、`Stronghold`、文件系统、任务登记与预算执行边界。
- 暴露 `ModelGateway` 与 `ToolGateway`。
- 负责 provider 接入、错误归一化、token/成本统计和连接测试。
- 负责 `WorkflowRun`、`WorkflowCheckpoint`、`WorkflowEvent` 的持久化与分发。

### Python Orchestration Service

- 负责预设工作流编排、Prompt 组装和工作流状态推进。
- 通过 `Orchestration Protocol` 调用 Host 暴露的受控能力。
- 当前以 `LangChain` 实现 `PresetWorkflow`。

## 安全与边界

- Python 不持有明文密钥。
- Python 不作为 `SQLite` 真相源。
- 模型调用、预算统计、连接测试通过 Host 暴露的统一能力完成。
- Host 保持对数据库写入、文件落盘和受控工具调用的最终边界。

## 结构化输出

- Python 侧工作流输出用 `Pydantic` 约束。
- 前端与 Tauri IPC 边界用 `Zod` 做运行时校验。
- `CardGenerationCandidate`、`Citation / RagAnswer`、`WorkflowEvent` 必须保持结构化。
- 前端只消费校验后的 payload，不直接信任模型原始输出。

## 当前正式术语

- `Python Orchestration Service`
- `Orchestration Protocol`
- `PresetWorkflow`
- `WorkflowRun`
- `WorkflowCheckpoint`
- `WorkflowEvent`
- `ModelGateway`
- `ToolGateway`

## 跨端策略

- 当前桌面端采用本地 `Python Orchestration Service`。
- Android 复用的是协议、任务语义和数据契约，而不是桌面端进程拓扑。
- 评估重点是协议复用、Host 能力抽象和替代运行形态。

## 代码锚点

- Rust Host 生命周期：`xuejian/src-tauri/src/lib.rs`
- Orchestration service 进程管理：`xuejian/src-tauri/src/tasks/orchestration_service.rs`
- Tauri orchestration commands：`xuejian/src-tauri/src/commands/orchestration.rs`
- Protocol version：`xuejian/src-tauri/src/gateway/mod.rs`
- Python service 入口：`xuejian/orchestration_service/main.py`
