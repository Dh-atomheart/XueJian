# M07：Provider 与 BYOK

## 目标

实现 Provider 配置、Stronghold 密钥存储和 BYOK 基础能力。

## 所属 MVP

MVP-1。

## 相对工作量

M。

## 前置条件

- M06 完成。
- 已阅读 `docs/ipc-api.md`。
- Settings 页面基础可用。

## 交付内容

- ProviderConfig 支持 OpenAI、Anthropic、OpenAI-compatible。
- API Key 保存到 Stronghold。
- SQLite 只保存非敏感配置和 key ref。
- 设置页 AI tab 可配置 Provider。
- 首启不强制 API Key。

## 任务分配

### Frontend

- 设置页增加 AI tab。
- Provider 列表、创建、编辑、删除。
- API Key 输入后只显示 key status。

### Rust/Tauri

- provider_configs 仓储和命令。
- Stronghold 保存、读取、删除、验证 key。
- 默认 Provider 设置。

### Python orchestration

- 不持久化 key。
- 等待 M08 注入使用。

### Data/Schema

- 增加 provider_configs。
- 保存 provider、protocol、base_url、model、key_status、default、stronghold_key_ref。

### Tests

- ProviderConfig CRUD。
- Stronghold key status。
- API Key 不进入 SQLite。

## 不做什么

- 不调用模型生成卡片。
- 不做 workflow assignment UI。
- 不做成本预算。
- 不做 RAG。

## 验收场景

- 用户配置 OpenAI Provider。
- 用户配置 Anthropic Provider。
- 用户配置 OpenAI-compatible Provider。
- API Key 不回显。
- SQLite 不保存明文 key。

## 测试要求

- Rust key 存储测试。
- 设置页 Provider 表单测试。

## 风险与回退

- Stronghold 状态不稳定：提供重置 key 状态入口。
- Provider 字段膨胀：MVP 保持最小字段。

## 完成后解锁

M08：AI 卡片生成 workflow。
