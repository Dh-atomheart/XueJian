# M08：AI 卡片生成 workflow

## 目标

实现 LiteLLM + Pydantic 的确定性 AI 卡片生成 workflow，并由 Rust 校验后自动入库。

## 所属 MVP

MVP-1。

## 相对工作量

L。

## 前置条件

- M07 完成。
- MVP-0 文档 chunk、source anchor、cards、review_states 可用。
- 已阅读 `docs/ai-card-generation.md` 和 `docs/background-jobs.md`。

## 交付内容

- AI 生成 BackgroundJob。
- Python 通过 LiteLLM 调用 Provider。
- Pydantic schema 校验输出。
- Rust 二次校验来源和字段。
- 成功后写入 cards/source_anchors/review_states。
- 失败时不部分入库。

## 任务分配

### Frontend

- 暂不做完整生成 UI。
- 可提供开发调试入口或等待 M09。

### Rust/Tauri

- 创建 AI job。
- 短时注入 Stronghold key。
- 提供 chunk 读取 gateway。
- 接收结果并校验落库。
- 失败状态写入 BackgroundJob。

### Python orchestration

- 接入 LiteLLM。
- 定义 Pydantic schema。
- 实现确定性 prompt。
- 输出 title/front/back/sourcePage/sourceQuote/sourceChunkIds/confidence/tags。

### Data/Schema

- 复用 provider_configs、background_jobs、cards、source_anchors、review_states。

### Tests

- mock Provider 成功生成。
- schema 校验失败。
- 来源校验失败。
- Provider 调用失败。
- 不部分入库。

## 不做什么

- 不用 Agent 主线。
- 不用 LangChain 主线。
- 不做候选审核表。
- 不做 RAG。
- 不做播客或动画。

## 验收场景

- 使用 mock Provider 从 chunk 生成中文 Basic 卡片。
- 生成卡片带来源页码和 quote。
- 生成卡片自动加入目标分组。
- schema 错误时 job failed 且不入库。

## 测试要求

- Python schema 测试。
- Rust 落库校验测试。
- AI job 集成测试。

## 风险与回退

- 模型输出不稳定：严格 Pydantic 校验，失败不入库。
- Provider 差异：统一走 LiteLLM 适配层。

## 完成后解锁

M09：AI 生成 UI 与 MVP-1 验收。
