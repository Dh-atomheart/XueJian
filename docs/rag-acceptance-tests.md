# RAG 验收测试

本文档定义 MVP-3 RAG 知识问答的验收用例。第一质量指标是引用忠实度，不是回答流畅度。

## 1. 测试前置

准备至少三份测试文档：

- `doc-a`：包含明确概念定义、步骤和结论。
- `doc-b`：包含与 `doc-a` 相关但不完全相同的内容。
- `doc-c`：不包含目标问题答案，用于无证据测试。

每份文档应完成：

- 导入和解析成功。
- 生成 `document_chunks`。
- 使用 active embedding profile 完成 chunk embedding。

## 2. 向量门槛

### 用例：未配置 embedding profile

步骤：

1. 清空或停用 active embedding profile。
2. 在知识问答页选择文档并提问。

期望：

- 系统不调用 LLM。
- assistant message 标记为 error 或受控失败状态。
- `retrievalStatus` 为 `embedding_missing`。
- UI 提示先配置 embedding 或生成向量。

### 用例：文档未向量化

步骤：

1. 导入并解析新文档，但不运行 embedding。
2. 选择该文档提问。

期望：

- 系统阻止回答。
- 不发生 FTS-only 正式回答。
- UI 引导用户先生成文档向量。

### 用例：embedding 过期

步骤：

1. 修改 active embedding profile 或触发文档重新解析。
2. 使用旧向量状态的文档提问。

期望：

- 系统返回 `embedding_stale`。
- 不调用 LLM。
- UI 提示重新生成向量。

## 3. 检索与回答

### 用例：单文档命中

步骤：

1. 选择 `doc-a`。
2. 提问一个答案明确存在于该文档的问题。

期望：

- 返回 `answerMode: "grounded"`。
- 返回 `retrievalMode: "hybrid"`。
- 至少 1 条 citation。
- citation 包含页面和相关内容。
- citation 的 `chunkId` 属于本轮检索结果。
- snippet 是对应 chunk content 的子串或后端裁剪片段。

### 用例：多文档命中

步骤：

1. 同时选择 `doc-a` 和 `doc-b`。
2. 提问需要综合两个文档的问题。

期望：

- citations 可来自多个 documentId。
- 答案只使用引用内容支持的结论。
- 不把不同文档中的相似概念混为一个无来源结论。

### 用例：无证据拒答

步骤：

1. 只选择 `doc-c`。
2. 提问 `doc-c` 中不存在的问题。

期望：

- 返回 `answerMode: "no_relevant_content"`。
- 答案明确说明当前资料不足以回答。
- 不使用模型常识补充答案。
- citations 为空或仅显示用于说明“不足”的检索片段。

## 4. 引用忠实度

### 用例：模型返回不存在 chunkId

模拟：

- LLM 返回 citation，`chunkId` 不在本轮检索结果中。

期望：

- 后端丢弃该 citation。
- 不把无效 citation 写入 `answer_payload`。
- 如果没有合法 citation，答案不得标记为正常 grounded。

### 用例：模型改写 snippet

模拟：

- LLM 返回的 snippet 不是 chunk content 子串。

期望：

- 后端用对应 chunk 的短片段替换 snippet。
- 或将该 citation 标记无效并回退到 top chunk 裁剪。

### 用例：答案与引用不一致

模拟：

- LLM 答案包含引用不支持的结论。

期望：

- 测试应失败。
- 后续实现可通过更严格 prompt、二次校验或人工评测集改进。

## 5. 多轮上下文

### 用例：轻量指代继承

步骤：

1. 第一轮问：“文档中如何定义间隔重复？”
2. 第二轮问：“它和集中复习有什么区别？”

期望：

- 第二轮可以理解“它”指间隔重复。
- 第二轮仍重新检索。
- 第二轮 citations 来自第二轮检索结果。
- 不把第一轮答案本身当作事实依据。

### 用例：历史污染防护

步骤：

1. 第一轮讨论 `doc-a` 的概念。
2. 第二轮切换到只选择 `doc-c` 并追问同一概念。

期望：

- 如果 `doc-c` 无相关证据，返回 `no_relevant_content`。
- 不沿用 `doc-a` 的结论回答。

## 6. 任务与错误

### 用例：provider 超时

模拟：

- LLM provider 超过 Rust/Python 设定超时。

期望：

- workflow_run 标记 failed。
- assistant message 标记 error。
- 错误文案可读，包含可重试提示。
- 不留下 pending message。

### 用例：非法 JSON

模拟：

- LLM 返回 Markdown、数组顶层或非 JSON。

期望：

- Python 最多执行一次 JSON 修复。
- 修复失败后返回 `invalid_json`。
- 不写入伪成功 answer。

### 用例：用户取消

步骤：

1. 提交问题。
2. 在回答完成前取消。

期望：

- workflow_run 标记 cancelled。
- assistant message 标记 cancelled。
- UI 不再轮询该 message。

## 7. UI 回归

### 用例：乱码文案

检查页面：

- embedding 缺失提示。
- embedding 过期提示。
- 无证据回答提示。
- provider 失败提示。
- 取消提示。

期望：

- 用户可见中文文案无乱码。
- 不暴露底层堆栈或 API key。

### 用例：引用展示

步骤：

1. 得到有 citation 的回答。

期望：

- UI 显示页面号。
- UI 显示相关内容片段。
- 不出现未实现的 Reader 跳转承诺。

## 8. 验收命令建议

实现后至少覆盖：

```text
Python unit: knowledge_qa JSON/parser/citation validation
Rust unit: embedding gate/search_hybrid/message status
Frontend unit: KnowledgeQaPage states/citations/errors
Smoke: one real parsed+embedded document asks one grounded question
```

