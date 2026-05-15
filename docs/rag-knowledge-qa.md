# RAG 知识问答设计文档

## 1. 定位

全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md) 为准。本文定义学习型 RAG 的基础检索链路、回答契约和引用校验规则，是 Phase 1（RAG Data Foundation）至 Phase 3（RAG Quality 2.0）的基线前提文档，也是 Phase 4–5（Single Agent QA / Memory & Card Tools）工具化的前置依据。

RAG 知识问答是 XueJian 的学习型问答能力。它不是通用聊天助手，也不是开放域搜索；它只基于用户已经导入、解析并完成向量化的文档回答问题。

第一版目标：

- 帮助用户理解自己的学习资料。
- 回答必须可追溯到文档页面和相关内容。
- 没有足够证据时明确拒答。
- 复用现有知识问答骨架，不新建并行系统。

第一版不做：

- FTS-only 正式回答。
- 通用聊天、开放域知识补全。
- 自动制卡、追问生成、概念图、学习计划。
- Reader 跳转或精确高亮。
- 复杂 agent、多步骤规划或工具调用链。

## 2. 用户场景

核心场景：

- 用户选择一个或多个已向量化文档，提出学习问题。
- 系统检索相关 chunk，生成结构化讲解。
- 答案下方展示引用来源：页面和相关内容。
- 如果文档没有完成 embedding，系统阻止提问并引导用户先生成向量。
- 如果检索内容不足以回答，系统返回“资料中没有足够依据”的回答。

默认回答风格：

```text
直接答案

要点解释
- ...
- ...

引用来源
- P.12：相关内容片段
- P.18：相关内容片段
```

引用来源可以在 UI 中以卡片展示，但第一版不要求跳转 Reader。

## 3. 现有骨架

必须复用的现有模块：

- Python workflow：`xuejian/orchestration_service/workflows/knowledge_qa.py`
- Rust IPC：`xuejian/src-tauri/src/commands/knowledge.rs`
- Host gateway：`search_hybrid`、`search_chunks`、`list_chunks`、embedding profile 相关接口
- Embedding workflow：`xuejian/orchestration_service/workflows/document_embedding.py`
- Vector repository：`xuejian/src-tauri/src/db/vector_repo.rs`
- 会话存储：`knowledge_qa_conversations`、`knowledge_qa_messages`
- 前端页面：`xuejian/src/features/knowledge/KnowledgeQaPage.tsx`

原则：

- 不新增第二套 RAG 服务。
- 不绕过现有 provider/BYOK/Stronghold 体系。
- 不绕过现有 workflow_runs 和 knowledge_qa_messages。
- 不把 RAG 结果写入 cards，RAG 第一版只回答问题。

## 4. 数据流

```text
用户选择文档并提问
-> Rust send_knowledge_qa_message 创建 user/assistant message 和 workflow_run
-> Rust 调用 Python /workflows/knowledge-qa
-> Python 检查 active embedding profile
-> Python/Rust 检查所选文档是否完成该 profile 的 chunk embeddings
-> Python 生成 query embedding
-> Host gateway search_hybrid 执行向量检索和排序
-> Python chunk packing 构造上下文
-> LLM 生成 grounded JSON answer
-> Python 校验 citations 来自本轮检索 chunk
-> Rust 写回 workflow event 和 assistant message.answer_payload
-> 前端轮询 conversation 并展示答案与引用
```

FTS 的位置：

- FTS 可以保留为“搜索辅助”和“诊断能力”。
- RAG 正式回答不得在缺少 embedding 时降级为 FTS-only。
- 如果向量检索没有命中，可以返回 `no_relevant_content`，而不是使用 FTS 伪造 RAG。

## 5. 输入输出契约

### IPC 输入

现有接口保持：

```ts
send_knowledge_qa_message({
  conversationId?: string | null
  question: string
  documentIds?: string[]
})
```

约束：

- `question` 必须非空。
- `documentIds` 为空时，第一版可解释为所有已向量化文档；如果没有任何可用文档，应阻止回答。
- 多文档问答必须保留每条 citation 的 `documentId`。

### Python workflow 输出

Python 返回：

```json
{
  "status": "completed",
  "answer": {
    "answer": "结构化中文回答",
    "answerMode": "grounded",
    "retrievalMode": "hybrid",
    "retrievalStatus": "ready",
    "citations": [
      {
        "chunkId": "chunk-id",
        "documentId": "document-id",
        "page": 12,
        "snippet": "来自 chunk 的相关内容",
        "relevanceScore": 0.82
      }
    ]
  }
}
```

字段约束：

- `answerMode`
  - `grounded`：答案由引用支持。
  - `no_relevant_content`：检索内容不足以回答。
  - `excerpt_fallback`：仅用于 provider 失败时的明确降级展示，不应作为常规成功路径。
- `retrievalMode`
  - 第一版正式回答使用 `hybrid`。
  - `fts5` 只用于搜索辅助或诊断，不作为正式 RAG 回答模式。
- `retrievalStatus`
  - `ready`
  - `embedding_missing`
  - `embedding_stale`
  - `embedding_failed`
  - `no_hits`
- `citations`
  - `chunkId` 必须来自本轮检索结果。
  - `snippet` 必须是对应 chunk content 的子串或由后端从 chunk 裁剪。
  - 不信任模型自由生成引用。

## 6. 检索设计

第一版必须 embedding：

- 没有 active embedding profile：阻止回答，返回 `retrievalStatus: "embedding_missing"`。
- 所选文档没有完成当前 profile 的 embedding：阻止回答，返回 `embedding_missing` 或 `embedding_stale`。
- embedding provider 调用失败：返回 `embedding_failed`，不调用 LLM。

检索步骤：

1. 使用 embedding provider 对 question 生成 query embedding。
2. 对所选文档执行向量检索。
3. 使用现有 `search_hybrid` 聚合向量结果和可用的 lexical signal。
4. 去重：同一 chunk 只保留一次；高度重复的相邻 chunk 优先保留分数高者。
5. 压缩上下文：限制 top chunks 数量和总字符数。
6. chunk packing 必须保留 `chunkId/documentId/pageStart/pageEnd/content`。

建议默认值：

- top chunks：8
- 单 chunk 最大上下文：800 字符
- 总上下文：4000-6000 字符
- LLM temperature：0.1-0.2
- Python workflow 请求超时：先沿用现有 Rust workflow 调用，但实现阶段需从 60s 加固到可解释失败。

## 7. 多轮策略

第一版采用轻量继承：

- 会话历史用于理解“它”“这个概念”“上一点”等指代。
- 每一轮都必须重新检索。
- 回答只能引用本轮检索结果。
- 历史回答不能作为事实依据，除非本轮再次检索到同样证据。

实现建议：

- Python prompt 可传入最近 1-3 轮 question/answer 的短摘要。
- 如果当前问题不是自包含问题，模型可以结合历史改写检索 query。
- 改写 query 不展示给用户，但应写入日志诊断摘要，不能记录完整敏感内容。

## 8. Prompt 与 JSON

RAG prompt 必须强调：

- 只基于 retrieved passages 回答。
- 不足则返回无证据回答。
- 不使用模型常识补全文档没有的内容。
- 输出一个 JSON object，不输出 Markdown 或解释性包装。
- citations 只能引用提供的 passage id/chunk id。

建议输出 schema：

```json
{
  "answer": "直接答案 + 要点解释",
  "answerMode": "grounded",
  "citations": [
    {
      "chunkId": "chunk-id",
      "snippet": "引用依据"
    }
  ]
}
```

后端再补齐：

- `documentId`
- `page`
- `relevanceScore`
- `retrievalMode`
- `retrievalStatus`

## 9. 引用校验

必须做二次校验：

- LLM 返回的 `chunkId` 必须属于本轮检索 chunk set。
- LLM 返回的 `snippet` 如果不是 chunk content 子串，后端使用该 chunk 的最佳短片段替换。
- 如果所有 citations 都无效：
  - 有足够 chunk 时，可回退到 top 1-2 chunks 的后端裁剪引用。
  - 若答案无法由这些 chunk 支持，应改为 `no_relevant_content`。

前端第一版展示：

```text
P.12
相关内容片段...
```

不做：

- Reader 跳转。
- bbox 高亮。
- 引用段落定位动画。

## 10. 错误与超时

错误分类：

- `embedding_missing`：没有 active profile 或文档未向量化。
- `embedding_stale`：文档解析版本或 profile 变化导致向量过期。
- `embedding_failed`：query embedding 或检索阶段失败。
- `no_hits`：向量检索没有足够相关内容。
- `provider_timeout`：LLM 超时。
- `invalid_json`：模型返回非 JSON 或 schema 不合法。
- `citation_invalid`：引用不来自检索 chunk。

行为：

- 未 embedding：不调用 LLM。
- 无命中：返回 `no_relevant_content`。
- LLM 超时：message 标记 error，提示可重试。
- 用户取消：workflow_run cancelled，assistant message cancelled。

日志：

- 不记录 API key。
- 不记录完整用户文档内容。
- 可以记录 run id、document count、chunk ids、错误类别、截断诊断。

## 11. 验收标准

RAG MVP 通过标准：

- 已向量化文档可以被选择并提问。
- 未向量化文档不能进入正式回答链路。
- 多文档提问返回多个文档中的相关引用。
- 答案结构清楚，默认包含直接答案和要点解释。
- citation 都来自本轮检索 chunk。
- 无证据问题返回 `no_relevant_content`。
- provider 超时、取消、非法 JSON 都能给出可理解状态。

详细用例见 [RAG 验收测试](./rag-acceptance-tests.md)。
