# Ragas RAG 评估操作手册

本文档说明如何使用 Ragas 对 XueJian 的知识问答 RAG 进行离线诊断评估。

当前推荐流程是：**通过 Python orchestration sidecar 的 `/evals/ragas-knowledge-qa` 端点运行评估**。这样评估代码会在 sidecar 内部复用已有的 `HostGatewayClient`，不需要手动获取 `XUEJIAN_HOST_GATEWAY_TOKEN`。

## 1. 重要说明：不要手动获取 Host Gateway Token

Host Gateway Token 是 Rust host gateway 启动时生成的本地安全令牌。它会传给 Python orchestration sidecar，但不会暴露给前端 UI。

因此，如果你按照旧文档在 DevTools 或前端状态里找不到 token，这是正常的。前端不应该持有这个 token。

现在应使用 Python sidecar 内置评估端点：

```text
POST <python-orchestration-endpoint>/evals/ragas-knowledge-qa
```

只有当你明确要直接运行底层 CLI 时，才需要 `XUEJIAN_HOST_GATEWAY_URL` 和 `XUEJIAN_HOST_GATEWAY_TOKEN`。第一版日常评估不推荐走这个路径。

## 2. 评估目标

第一版 Ragas 评估用于回答三个问题：

- 回答是否忠实于检索上下文：`faithfulness`
- 回答是否回应用户问题：`answer_relevancy`
- 检索上下文是否对回答有用：`llm_context_precision_without_reference`

这些分数用于发现失败样本和比较趋势，不代表答案绝对正确。当前方案不使用人工金标，不写自定义硬规则，也不作为发布门禁。

## 3. 前置条件

运行评估前需要满足：

- 已安装 `xuejian/orchestration_service/requirements.txt` 中的 Python 依赖。
- Ragas 可导入并通过自检。
- XueJian 桌面应用正在运行。
- Python orchestration service 处于可访问状态。
- Host gateway 已启动。
- 至少一个测试文档已导入、解析，并完成当前 active embedding profile 的向量化。
- `knowledge_qa` workflow 已绑定可用的 BYOK 模型配置。
- 评估资料允许发送给 BYOK 配置对应的 judge/generator LLM。

## 4. 自检 Ragas 安装

在仓库根目录下执行：

```powershell
cd xuejian
$env:PYTHONPATH="."
python -m orchestration_service.evals.ragas_knowledge_qa_eval --check-ragas
```

期望输出类似：

```json
{
  "ragasVersion": "0.4.3",
  "metrics": [
    "faithfulness",
    "answer_relevancy",
    "llm_context_precision_without_reference"
  ],
  "sampleCount": 1,
  "datasetType": "EvaluationDataset",
  "ok": true
}
```

如果这里失败，先修复 Python 依赖，不要继续跑真实评估。

## 5. 获取 Python Orchestration Endpoint

打开 XueJian 应用后，在前端 DevTools Console 中执行：

```js
await window.__TAURI__.core.invoke('get_orchestration_service_health')
```

返回结果里通常有两个容易混淆的字段：

```json
{
  "endpoint": "http://127.0.0.1:54321",
  "hostGatewayEndpoint": "http://127.0.0.1:54144"
}
```

字段含义：

- `endpoint`：Python orchestration service 地址。**Ragas 推荐流程使用这个。**
- `hostGatewayEndpoint`：Rust host gateway 地址。只有直接跑底层 CLI 时才需要。

后续示例中的 `<python-orchestration-endpoint>` 请替换为 `endpoint` 字段的值。

## 6. 获取已向量化 Document IDs

在前端 DevTools Console 中执行：

```js
const docs = await window.__TAURI__.core.invoke('list_documents', { limit: 100 })
docs.map(d => ({
  id: d.id,
  title: d.title,
  status: d.status,
  parser: d.parser
}))
```

选择已经导入并解析完成的文档 id。

还需要确认这些文档已完成当前 active embedding profile 的向量化。最简单的确认方式是在应用里对该文档执行一次知识问答；如果不再提示 `embedding_missing` 或 `embedding_stale`，说明可用于评估。

## 7. Smoke 评估

先用小样本跑通完整链路。推荐直接在 DevTools Console 调用 Python sidecar：

```js
const health = await window.__TAURI__.core.invoke('get_orchestration_service_health')

await fetch(`${health.endpoint}/evals/ragas-knowledge-qa`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentIds: ['<doc-id-1>', '<doc-id-2>'],
    size: 5,
    out: 'test-results/ragas/smoke'
  })
}).then(r => r.json())
```

只评估一个文档时：

```js
const health = await window.__TAURI__.core.invoke('get_orchestration_service_health')

await fetch(`${health.endpoint}/evals/ragas-knowledge-qa`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentIds: ['<doc-id>'],
    size: 5,
    out: 'test-results/ragas/smoke'
  })
}).then(r => r.json())
```

成功时返回类似：

```json
{
  "status": "ok",
  "outputDir": "test-results/ragas/smoke",
  "summaryPath": "test-results/ragas/smoke/summary.md",
  "scoresPath": "test-results/ragas/smoke/scores.csv",
  "rawResultsPath": "test-results/ragas/smoke/raw_results.json",
  "datasetPath": "test-results/ragas/smoke/dataset.jsonl"
}
```

Smoke 评估的目标是确认：

- 能读取 chunks。
- 能合成问题。
- 能调用当前 XueJian RAG 回答。
- 能调用 Ragas 评分。
- 能生成报告文件。

## 8. 用 PowerShell 调用评估端点

如果不想在 DevTools 里直接发请求，也可以先从 DevTools 拿到 `endpoint`，再用 PowerShell：

```powershell
$endpoint = "http://127.0.0.1:<python-orchestration-port>"

$body = @{
  documentIds = @("<doc-id-1>", "<doc-id-2>")
  size = 5
  out = "test-results/ragas/smoke"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$endpoint/evals/ragas-knowledge-qa" `
  -ContentType "application/json" `
  -Body $body
```

这里使用的是 Python orchestration endpoint，不需要设置 Host Gateway Token。

## 9. 正式诊断评估

Smoke 通过后，可以跑默认规模：

```js
const health = await window.__TAURI__.core.invoke('get_orchestration_service_health')

await fetch(`${health.endpoint}/evals/ragas-knowledge-qa`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentIds: ['<doc-id-1>', '<doc-id-2>'],
    size: 60
  })
}).then(r => r.json())
```

默认输出目录：

```text
test-results/ragas/<timestamp>/
```

建议第一轮正式诊断规模：

- 单文档：`size: 30`
- 多文档：`size: 60`
- 成本敏感：先从 `size: 10` 开始

## 10. 重新生成问题集

Ragas 生成的问题会缓存到：

```text
test-results/ragas/datasets/<hash>.jsonl
```

缓存 key 基于：

- document ids
- chunk 内容摘要
- `size`
- `maxChunkChars`

同一批问题可以反复评估，便于比较 prompt、模型、embedding 或 chunking 调整前后的变化。

如果需要重新生成问题：

```js
const health = await window.__TAURI__.core.invoke('get_orchestration_service_health')

await fetch(`${health.endpoint}/evals/ragas-knowledge-qa`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    documentIds: ['<doc-id-1>', '<doc-id-2>'],
    size: 60,
    refreshDataset: true
  })
}).then(r => r.json())
```

## 11. 输出文件

每次运行会生成：

```text
test-results/ragas/<run>/
  dataset.jsonl
  raw_results.json
  scores.csv
  summary.md
```

文件说明：

- `dataset.jsonl`：本次使用的问题集。
- `raw_results.json`：完整样本结果，包括 question、answer、retrieved contexts、citations 和 scores。
- `scores.csv`：便于用表格工具排序筛选。
- `summary.md`：指标摘要和低分样本清单。

优先阅读：

```text
summary.md
```

## 12. 如何解读指标

### `faithfulness`

衡量回答是否被 retrieved contexts 支持。

低分常见原因：

- 回答加入了上下文没有的信息。
- 回答把多个片段错误综合。
- 检索到了相关但不足以支撑结论的片段。

优先排查：

- prompt 是否鼓励模型补充常识。
- citations 是否看似相关但不支撑结论。
- top contexts 是否缺关键证据。

### `answer_relevancy`

衡量回答是否回应用户问题。

低分常见原因：

- 问题合成质量差。
- RAG 回答过于泛泛。
- 检索片段偏题，导致回答偏题。

优先排查：

- 合成问题是否自然。
- 回答是否直接给出结论。
- 是否需要调整检索 top-k 或 chunk packing。

### `llm_context_precision_without_reference`

衡量 contexts 是否对回答有用。

低分常见原因：

- 检索结果包含噪声。
- chunk 太长，相关信息被稀释。
- 多文档范围过大，召回了相似但无用内容。

优先排查：

- embedding 模型。
- hybrid ranking。
- chunk size。
- `RETRIEVAL_CANDIDATE_LIMIT` 和 `MAX_PASSAGES`。

## 13. 建议排查流程

每次评估后按这个顺序看：

1. 打开 `summary.md`。
2. 看 `Lowest faithfulness` 前 10 条。
3. 对每条低分样本查看 question、answer、top context、citations。
4. 判断失败类型：检索没拿到证据、检索拿到了证据但回答不忠实、问题生成不好、文档 chunk 太长或太碎。
5. 修改 RAG 后，复用同一缓存 dataset 再跑一次。
6. 对比 `scores.csv` 和 `summary.md`。

## 14. 常见错误

### `host_gateway_unavailable`

原因：Python orchestration sidecar 没有拿到 `_host_gateway`，通常是桌面应用没有完整启动，或 sidecar 不是由 XueJian host 拉起的。

处理：

- 重新启动 XueJian 桌面应用。
- 在 DevTools 里重新执行 `get_orchestration_service_health`，确认 `endpoint` 可访问。
- 不要直接手动启动一个孤立的 Python server 来跑该端点。

### `No usable chunks found`

原因：

- document id 不存在。
- 文档未解析。
- host gateway 读取不到 chunks。

处理：

- 检查 `documentIds`。
- 在应用中确认文档解析完成。

### `embedding_missing` 或 `embedding_stale`

原因：

- 文档未向量化。
- 当前 active embedding profile 与已有向量不一致。

处理：

- 在应用中重新生成文档向量。
- 确认设置页的 embedding workflow 绑定正确。

### Ragas 导入失败

先运行：

```powershell
cd xuejian
$env:PYTHONPATH="."
python -m orchestration_service.evals.ragas_knowledge_qa_eval --check-ragas
```

如果失败，重新安装依赖：

```powershell
pip install -r orchestration_service/requirements.txt
```

### 直接 CLI 报缺少 gateway URL 或 401

这是旧的直接 CLI 路径才会遇到的问题。推荐改用本文档的 `/evals/ragas-knowledge-qa` 端点。

只有在你明确要直接调用底层 CLI 时，才需要设置：

```powershell
$env:XUEJIAN_HOST_GATEWAY_URL="http://127.0.0.1:<host-gateway-port>"
$env:XUEJIAN_HOST_GATEWAY_TOKEN="<token>"
```

该 token 不从前端暴露，因此不建议把直接 CLI 作为日常操作方式。

## 15. 安全注意事项

- 不要提交 token。
- 不要把真实敏感文档发送给第三方 judge。
- 不要把 Ragas 分数当作用户可见质量承诺。
- 不要默认把评估接入线上问答流程。
- `test-results/ragas/` 属于本地评估产物，默认不应提交。

## 16. 推荐工作流

```text
启动 XueJian
-> 确认文档已解析并向量化
-> DevTools 获取 Python orchestration endpoint
-> DevTools 获取 documentIds
-> --check-ragas 自检
-> 调 /evals/ragas-knowledge-qa，size=5 smoke
-> 调 /evals/ragas-knowledge-qa，size=30/60 正式诊断
-> 阅读 summary.md
-> 修 RAG
-> 复用缓存问题集重跑
```
