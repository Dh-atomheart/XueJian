# XueJian 系统架构总览

本文档是 `docs/spec.md` 的架构补充，负责说明系统分层、数据权威、进程协作、长任务和密钥边界。产品方向、MVP 边界和阶段路线以 `docs/spec.md` 为准。

## 目标

XueJian 的架构目标是支撑一个强本地优先的 PDF 学习闪卡桌面应用。第一阶段架构必须优先服务主闭环：

```text
PDF 导入 -> 文档解析 -> 卡片生成/编辑 -> 分组管理 -> 每日复习 -> 学习反馈
```

系统应保留现有技术底座，不推倒重来；MVP 阶段冻结超前功能。UI-05 / V1.1 解冻 `knowledge` 为学习型 RAG 页面，其余 `podcast / animation / points / export` 仍不得影响主线。

## 分层架构

```text
React / Tauri WebView
  -> Tauri commands / gateway client
Rust / Tauri host
  -> SQLite / Stronghold / BackgroundJob / host gateway
Python orchestration sidecar
  -> PDF parsing / AI workflow / Provider adapter
```

### React / Tauri WebView

前端负责页面、交互、查询状态和用户反馈。

- 技术栈沿用 React 19 + Vite + TypeScript。
- 前端不直接访问 SQLite。
- 前端不直接持有明文 API Key。
- 前端通过 Tauri commands 或 gateway client 调用 Rust。
- TanStack Query 和 Zustand 可继续作为 UI 状态与服务端状态的组织方式。

### Rust / Tauri host

Rust 是本地应用的权威层。

- Rust/SQLite 是唯一数据权威。
- Rust 负责 Tauri commands、IPC、SQLite、迁移、后台任务、Stronghold、应用数据目录和 host gateway。
- Rust 负责创建、更新和查询 `BackgroundJob`。
- Rust 负责把必要的短时密钥注入 Python workflow。
- Rust 负责把 Python workflow 的结果写入 SQLite，或通过 host gateway 接收 Python 回写请求并执行受控写入。

### Python orchestration sidecar

Python 是计算与编排执行层，不是数据权威。

- Python 负责 PyMuPDF / Docling 文档解析。
- Python 负责 LiteLLM Provider 调用。
- Python 负责 Pydantic schema 校验。
- Python 负责确定性 AI workflow。
- Python 不直接读写 SQLite。
- Python 不持久化 API Key，不写入日志。
- Python 通过本地 HTTP 与 Rust host gateway 协作。

## 数据权威

核心原则：**Rust/SQLite 是唯一数据权威**。

这意味着：

- 所有业务实体最终都以 SQLite 为准。
- 前端缓存可以被丢弃和重建。
- Python 产生解析结果、AI 结果和进度事件，但不拥有最终状态。
- 任何需要持久化的变更都要经过 Rust 的命令、仓储或 host gateway。
- `provider_configs` 只保存非敏感配置和 Stronghold key ref。

## 进程协作

### Tauri commands

Tauri commands 是前端访问本地能力的主要入口。

典型职责：

- 文档导入与文档列表查询。
- 卡片 CRUD 与分组管理。
- 学习队列生成与复习反馈提交。
- Provider 配置与 key 状态查询。
- 后台任务创建、取消、状态查询。

### Host gateway

Host gateway 是 Python sidecar 回到 Rust 权威层的受控入口。

典型职责：

- 读取 workflow 所需的文档 chunk。
- 接收 Python 的任务进度。
- 接收解析结果或 AI 生成结果。
- 由 Rust 校验并写入 SQLite。

Python 不应绕过 gateway 直接打开应用 SQLite 文件。

### 本地 HTTP orchestration

Rust 与 Python orchestration 保留本地 HTTP 通信。

推荐边界：

- Rust 启动或连接 Python sidecar。
- Rust 创建 `BackgroundJob` 后调用 Python workflow endpoint。
- Python workflow 执行期间通过 host gateway 上报进度。
- workflow 完成后由 Rust 统一落库并更新任务状态。

## BackgroundJob 长任务模型

所有长任务统一进入 `BackgroundJob`：

- PDF 解析。
- Docling 后台增强。
- AI 卡片生成。
- 未来 embedding / RAG 索引。
- 未来播客脚本或 TTS 生成。

MVP 中任务状态至少需要覆盖：

```text
queued -> running -> succeeded
queued -> running -> failed
queued -> cancelled
```

任务必须保存：

- 任务类型。
- 关联业务对象，例如 document、card group。
- 当前状态。
- 可展示的进度。
- 可理解的错误信息。
- 创建、开始、结束时间。

失败策略：

- PDF 解析失败时保留文档记录和失败任务，UI 展示可理解错误。
- AI 卡片生成失败时不部分入库，避免污染卡片库。
- 可重试任务应复用原业务上下文创建新 job，避免直接覆盖失败证据。

## 密钥边界

密钥存储沿用 Stronghold。

原则：

- API Key 只保存在 Stronghold。
- SQLite 只保存 Provider 非敏感配置和 Stronghold key ref。
- 前端只看到 key 是否已配置、是否可用、最后验证状态。
- Python workflow 只接收 Rust 短时注入的密钥。
- 明文密钥不得写日志、不得进入任务 payload、不得进入错误信息。

首启不强制配置 API Key。用户可以先使用文档库、手动卡片和复习；触发 AI 生成时再配置 Provider。

## MVP 与冻结模块边界

MVP 架构只服务以下主线模块；V1.1 在此基础上加入 knowledge RAG：

- documents
- cards
- study
- ai
- settings
- knowledge

以下能力冻结，不进入 MVP/V1.1 主导航和主开发路线：

- podcast。
- animation。
- points。
- APKG/export。
- annotated PDF export。

冻结表示隐藏入口、停止主线开发和延后审计，不代表立即删除历史代码。

## 后续待细化问题

- Tauri commands 与 host gateway 的具体接口。
- `BackgroundJob` 字段级 schema。
- Python sidecar 启动、健康检查和崩溃恢复。
- Rust 仓储层和领域模块边界。
- Provider key 验证与错误分类。
- 任务取消、重试、并发和恢复策略。
