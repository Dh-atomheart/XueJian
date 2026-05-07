# AI Card Generation 工程契约

本文档定义 MVP-1 的 AI 卡片生成契约。AI 模块边界以 `docs/modules/ai.md` 为准，长任务语义以 `docs/background-jobs.md` 为准，数据写入以 `docs/database-baseline.md` 为准。

## 目标

- 从整篇 PDF 或页码范围生成中文 Basic 卡片。
- 生成结果自动入库，但用户可以编辑、删除、批量删除。
- 每张 AI 卡必须能追溯到文档页码和 source quote。
- AI 是辅助生产系统，不是学习资产的唯一来源。

## 边界

MVP-1 不做：

- Agent 主线编排。
- RAG 问答。
- 播客脚本或音频。
- Manim 动画。
- 候选审核表。
- 成本预算系统。
- 多 workflow 模型分配 UI。
- `knowledge / podcast / animation / points / export / profile`。

## Provider

- Python 使用 LiteLLM 作为主调用层。
- MVP 支持 `OpenAI / Anthropic / OpenAI-compatible`。
- API Key 存 Stronghold。
- SQLite 只保存非敏感 `ProviderConfig` 和 `api_key_ref`。
- Python workflow 只在运行时拿到必要凭据，不持久化 key。

## 输入契约

```ts
type StartAiCardGenerationRequest = {
  documentId: string;
  groupId: string;
  pageStart?: number;
  pageEnd?: number;
  density: "low" | "medium" | "high";
  providerConfigId: string;
};
```

规则：

- `documentId` 必须指向已解析文档。
- `groupId` 必须指向未删除分组。
- 页码范围为空表示整篇文档。
- 页码范围必须落在文档页数内。
- Provider 未配置或不可用时不能启动任务。

## 上下文构造

Rust 根据输入选择 `document_chunks`：

- 整篇生成：选取文档全部 chunks。
- 页码范围生成：选取页码重叠的 chunks。

上下文提交给 Python 时应包含：

- document title。
- chunk id。
- page_start / page_end。
- text。

Python 不自行读取 SQLite。

## 生成密度

密度只影响目标卡片数量和覆盖粒度，不改变卡片结构。

建议语义：

| density | 语义 |
| --- | --- |
| `low` | 只提取最核心概念 |
| `medium` | 覆盖主要知识点 |
| `high` | 更细粒度覆盖定义、步骤、对比和例子 |

具体数量可由 workflow 按文本长度估算，但 UI 不承诺精确数量。

## 输出契约

Python workflow 返回 Pydantic 校验后的结构：

```ts
type GeneratedCard = {
  title: string;
  front: string;
  back: string;
  source: {
    chunkId?: string;
    page: number;
    quote: string;
  };
  tags: string[];
};

type AiCardGenerationResult = {
  cards: GeneratedCard[];
};
```

校验规则：

- `title/front/back` 必须非空。
- 最终卡片内容必须是中文。
- `source.page` 必须存在。
- `source.quote` 必须能在对应 chunk 或页文本中找到近似匹配。
- `tags` 可空，但必须是数组。
- 不允许生成脱离原文、无法追溯来源的卡片。

## 不合格输出处理

- 如果所有卡片都不合格，任务失败，不入库。
- 如果部分卡片不合格，MVP 推荐丢弃不合格项，保留合格项，并在 `result_json` 记录丢弃数量。
- 如果 provider 返回内容无法解析为 schema，任务失败。
- 如果来源 quote 无法匹配，相关卡片丢弃。

## 入库策略

流程：

```text
Rust 创建 ai_card_generation BackgroundJob
-> Rust 读取 chunks 并请求 Python workflow
-> Python 使用 LiteLLM 生成并用 Pydantic 校验
-> Python 返回结构化结果
-> Rust 二次校验来源和字段
-> Rust 事务写入 source_anchors / cards / review_states
-> job succeeded
```

事务规则：

- 同一个成功任务中的卡片写入必须在一个事务中完成。
- `source_anchors`、`cards`、`review_states` 必须成组创建。
- 如果事务失败，任务失败，不保留部分卡片。
- `cards.origin = ai`。
- AI 卡 `source_anchor_id` 必填。

## 提示词策略

- 系统提示词可以英文，以提升模型遵循结构化指令的稳定性。
- 输出卡片必须中文。
- 提示词必须强调“忠实来源文本，不要补充文档外事实”。
- 卡片结构固定为 `标题 + 正面 + 背面`。
- 正面应是问题或简明提示。
- 背面应是答案、解释或关键推理。
- 避免把整段原文机械复制为背面。

## UI 交互约束

- Provider 未配置时，生成入口显示配置提示，不启动任务。
- 用户必须选择目标分组。
- 用户可选择整篇或页码范围。
- 用户可选择生成密度：少 / 中 / 多。
- 文档页展示任务状态：queued/running/succeeded/failed/cancelled。
- 成功后可跳转卡片列表查看生成结果。
- 质量问题通过编辑、删除、批量删除补救。

## 失败场景

必须可理解处理：

- Provider 未配置。
- API Key 错误。
- 网络或 provider 超时。
- 模型输出不是合法 schema。
- 文档没有可用 chunks。
- 页码范围无文本。
- 来源 quote 无法匹配。

## 验收

- 可从整篇 PDF 生成中文卡片。
- 可从页码范围生成中文卡片。
- 可选择少/中/多密度和目标分组。
- 生成卡片自动入库并创建 `review_states`。
- AI 卡均有来源页码和 quote。
- Provider 未配置时 UI 给出可理解提示。
- 失败任务显示可理解错误。
- schema 失败或事务失败不部分入库。

