# Ragas RAG 评估运行说明

本文档说明如何运行 XueJian 的离线 Ragas 评估脚本。该评估只做诊断，不写入线上问答记录，不作为发布门禁。

## 前置条件

- 已安装 `xuejian/orchestration_service/requirements.txt` 中的 Python 依赖。
- XueJian host gateway 正在运行。
- 至少一个测试文档已导入、解析，并完成当前 active embedding profile 的向量化。
- `knowledge_qa` workflow 已绑定可用模型配置。
- 当前资料允许脱敏后发送给 BYOK 配置对应的 LLM judge。

## 环境变量

评估脚本需要连接本地 host gateway：

```powershell
$env:XUEJIAN_HOST_GATEWAY_URL="http://127.0.0.1:<port>"
$env:XUEJIAN_HOST_GATEWAY_TOKEN="<token>"
```

`<port>` 和 `<token>` 以当前应用运行时实际值为准。

## Smoke 运行

先用小样本跑通链路：

```powershell
cd xuejian
$env:PYTHONPATH="."
python -m orchestration_service.evals.ragas_knowledge_qa_eval `
  --document-ids "<doc-id-1>,<doc-id-2>" `
  --size 5 `
  --out test-results/ragas/smoke
```

正式诊断可使用默认规模：

```powershell
python -m orchestration_service.evals.ragas_knowledge_qa_eval `
  --document-ids "<doc-id-1>,<doc-id-2>" `
  --size 60
```

默认输出路径为：

```text
test-results/ragas/<timestamp>/
```

## 输出文件

- `dataset.jsonl`：本次使用的问题集。
- `raw_results.json`：每条样本的问题、回答、contexts、citations 和 Ragas 分数。
- `scores.csv`：便于排序筛选。
- `summary.md`：指标摘要和低分样本清单。

问题集会按文档内容和参数缓存到：

```text
test-results/ragas/datasets/<hash>.jsonl
```

如需重新生成问题：

```powershell
python -m orchestration_service.evals.ragas_knowledge_qa_eval `
  --document-ids "<doc-id-1>,<doc-id-2>" `
  --size 60 `
  --refresh-dataset
```

## 当前指标

脚本使用无人工金标的 LLM-as-a-Judge 指标：

- `faithfulness`：回答是否忠实于检索上下文。
- `answer_relevancy`：回答是否回应问题。
- `llm_context_precision_without_reference`：检索上下文是否对回答有用。

这些指标用于发现失败样本和比较趋势，不代表绝对正确性。

## 已知兼容处理

Ragas 0.4.x 通过 `instructor` 间接导入 `mistralai.Mistral`。部分 `mistralai` 2.x 安装没有顶层导出该类，评估脚本会在导入 Ragas 前做本地兼容补丁，只影响离线评估进程。

