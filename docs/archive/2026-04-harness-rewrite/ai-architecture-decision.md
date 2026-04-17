# AI 编排架构决策

## 决策结论

当前正式方案固定为：

- `Python Orchestration Service` 负责 AI 应用编排
- `LangChain` 作为当前唯一正式编排框架
- `LangGraph` 不再作为现行运行时前提，只保留为未来升级路径

本决策替代此前的 `LangGraph.js + Web Worker` 方案。旧方案不再作为当前目标架构，不再指导 `/docs` 中的实施文档。

## 分层职责

### UI / React

- 负责页面交互、进度展示、流式结果渲染和人工确认入口
- 不直接持有主数据库真相
- 不直接持有明文密钥

### Rust / Tauri Host

- 持有 SQLite、Stronghold、文件系统、任务登记与预算执行边界
- 暴露 `ModelGateway` 与 `ToolGateway`
- 负责 Provider 接入、错误归一化、token/成本统计、连接测试
- 负责 `WorkflowRun` / `WorkflowCheckpoint` / `WorkflowEvent` 的持久化与分发

### Python Orchestration Service

- 负责预设工作流编排、Prompt 组装、工作流状态推进
- 通过 `Orchestration Protocol` 调用 Host 暴露的受控能力
- 当前以 `LangChain` 实现 `PresetWorkflow`

## 安全与边界

- Python 不持有明文密钥
- Python 不直接定义为 SQLite 真源
- 模型调用、预算统计、连接测试仍通过 Host 暴露的统一能力完成
- Host 保持对数据库写入、文件落盘和受控工具调用的最终边界

## 结构化输出与类型边界

- Python 侧工作流输出使用 `Pydantic` 模型约束结构
- 前端与 Tauri IPC 边界使用 `Zod` 做运行时校验
- `CardGenerationCandidate`、`Citation / RagAnswer`、`WorkflowEvent` 必须保持严格结构化，不接受自由文本拼装
- 前端只消费通过 schema 校验后的 payload，不直接信任模型原始输出

## 当前接口口径

当前文档统一采用以下术语：

- `Python Orchestration Service`
- `Orchestration Protocol`
- `PresetWorkflow`
- `WorkflowRun`
- `WorkflowCheckpoint`
- `WorkflowEvent`
- `ModelGateway`
- `ToolGateway`

其中：

- `ModelGateway` 归 Host 所有，负责 OpenAI、Anthropic 与兼容端点接入
- `ToolGateway` 归 Host 所有，负责文件、检索、数据库写入、任务状态登记等受控能力
- `PresetWorkflow` 当前由 LangChain 实现，不把 LangGraph 写成前置依赖
- `RAG` 保持为“简单 RAG（非 Agentic）”，不并入 agent runtime
- `TanStack Query` 只承载 IPC / 异步状态，`Zustand` 只承载 UI 状态，`idb` 只承载派生缓存

## 跨端策略

- 当前桌面端采用本地 `Python Orchestration Service`
- Android 仍是硬约束，但复用的是 `Orchestration Protocol`、任务语义和数据契约
- 未来 Android 不承诺复用同一种 Python 进程拓扑
- 评估重点是协议复用、Host 能力抽象和替代运行形态，而不是强行复用桌面进程模型

## LangGraph 的保留定位

`LangGraph` 仅作为未来升级路径，在以下条件出现时再进入正式评估：

- checkpoint / 恢复成为正式的一等需求
- 人工确认点需要图级状态恢复
- 多分支、长链路状态图明显复杂化

在此之前，所有预设工作流按 `LangChain-first` 设计与实施。
