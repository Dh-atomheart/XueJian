# LangSmith RAG 评估操作文档

本文档说明如何在 XueJian 中使用 LangSmith 对知识问答 RAG 进行离线评估。目标是补齐当前系统缺少的“回答质量评估”能力，同时不改变线上问答链路。

参考文档：

- LangSmith RAG 评估教程：https://docs.langchain.com/langsmith/evaluate-rag-tutorial
- LangSmith Python SDK：https://docs.smith.langchain.com/

## 1. 适用范围

当前项目已经具备 RAG 问答链路：

- Python workflow：`xuejian/orchestration_service/workflows/knowledge_qa.py`
- 检索入口：`HostGatewayClient.search_hybrid`
- 模型构造：`xuejian/orchestration_service/providers/runtime.py`
- 引用校验：`_normalize_citations`
- RAG 验收标准：`docs/rag-acceptance-tests.md`

LangSmith 应作为开发者评估工具接入，推荐先用于：

- 离线回归评估。
- 比较不同 embedding 模型、LLM 模型、chunk packing 参数。
- 检查回答是否忠实于检索片段。
- 检查检索结果是否真正相关。
- 生成可追踪的实验报告。

不建议第一阶段用于：

- 默认上传真实用户资料。
- 每次线上问答都自动评估。
- 把 LangSmith 评分直接展示给终端用户。

## 2. 隐私边界

LangSmith 评估通常会把 inputs、outputs、retrieved documents、trace 和 evaluator 结果上传到 LangSmith 服务端。XueJian 是本地优先的学习工具，因此必须遵守以下边界：

- 只对测试文档、脱敏文档或用户明确授权的文档运行评估。
- 不上传 API Key、Stronghold 密钥、完整本地路径或其他敏感配置。
- 评估样本中尽量使用短 chunk 片段，而不是整篇 PDF。
- CI 中不要使用个人真实学习资料。
- 评估脚本必须作为手动命令运行，不应绑定到默认应用启动流程。

## 3. 接入目标

第一阶段只做离线评估脚本，输出 LangSmith experiment：

```text
测试集样本
-> 调用本地 XueJian RAG target
-> 返回 answer + retrieved documents + citations
-> LangSmith evaluators 打分
-> 在 LangSmith UI 中比较实验结果
```

推荐首批指标：

- `answer_correctness`：回答是否符合标准答案。需要 gold answer。
- `answer_relevance`：回答是否回应问题。
- `groundedness`：回答是否被检索片段支持。
- `retrieval_relevance`：检索片段是否和问题相关。
- `citation_validity`：citation 是否来自本轮检索 chunk。项目内可用 deterministic evaluator 做。

## 4. 依赖安装

在 `xuejian/orchestration_service/requirements.txt` 中新增：

```text
langsmith>=0.4,<1
```

如果后续 evaluator 直接使用 OpenAI/Anthropic/Google judge，可以继续复用项目已有的 LangChain provider 依赖。不要在脚本里硬编码 API Key。

安装依赖：

```powershell
cd xuejian
pip install -r orchestration_service/requirements.txt
```

如果项目使用虚拟环境，应先激活虚拟环境再安装。

## 5. LangSmith 环境变量

手动运行评估前设置：

```powershell
$env:LANGSMITH_TRACING="true"
$env:LANGSMITH_API_KEY="lsv2_..."
$env:LANGSMITH_PROJECT="xuejian-rag-eval"
```

可选：

```powershell
$env:LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
```

不要把 `LANGSMITH_API_KEY` 写入仓库。Windows 下可放在用户级环境变量或本地未提交的 `.env` 文件中。

## 6. 评估数据集设计

LangSmith dataset 的每条样本建议包含：

```json
{
  "inputs": {
    "question": "文档中如何定义间隔重复？",
    "documentIds": ["doc-a"]
  },
  "outputs": {
    "answer": "间隔重复是把复习分散到多个时间点，以提高长期记忆保持率。",
    "mustCiteDocumentIds": ["doc-a"],
    "expectedEvidence": ["复习间隔", "长期记忆"]
  }
}
```

字段约定：

- `question`：用户问题。
- `documentIds`：限定检索范围。必须是本地数据库中已导入、已解析、已完成当前 embedding profile 向量化的文档。
- `answer`：人工标准答案，用于 correctness 评估。
- `mustCiteDocumentIds`：可选，用于检查 citation 来源。
- `expectedEvidence`：可选，用于 deterministic 检查或人工排查。

首批数据集建议覆盖：

- 单文档命中问题。
- 多文档综合问题。
- 无证据问题，应返回 `no_relevant_content`。
- 相似但不等价概念，防止模型混淆。
- 需要页码 citation 的问题。
- 检索容易误命中的问题。

## 7. 推荐目录结构

建议新增：

```text
xuejian/orchestration_service/evals/
  __init__.py
  knowledge_qa_langsmith_eval.py
  rag_eval_dataset.example.jsonl
```

`rag_eval_dataset.example.jsonl` 用于本地 seed 数据；正式 dataset 可以在 LangSmith UI 中维护，也可以由脚本创建或更新。

## 8. Target 函数设计

LangSmith 的 target 函数需要接收一条 dataset input，并返回 evaluator 可以读取的结构。

推荐返回结构：

```python
{
    "answer": "...",
    "answerMode": "grounded",
    "retrievalStatus": "ready",
    "citations": [
        {
            "chunkId": "...",
            "documentId": "...",
            "page": 12,
            "snippet": "..."
        }
    ],
    "documents": [
        {
            "page_content": "...",
            "metadata": {
                "chunkId": "...",
                "documentId": "...",
                "page": 12,
                "score": 0.82
            }
        }
    ]
}
```

注意：当前 `run_knowledge_qa_workflow()` 最终结果只返回 answer 和 citations，不返回完整 retrieved chunks。为了评估 retrieval quality，建议在 eval 脚本中复用以下内部步骤：

1. `host.get_active_embedding_profile()`
2. `embed_texts(..., task_type="RETRIEVAL_QUERY")`
3. `host.search_hybrid(...)`
4. `_vector_backed_chunks(...)`
5. `_dedupe_and_pack_chunks(...)`
6. `_build_passages(...)`
7. `_try_langchain_qa(...)`
8. `_normalize_citations(...)`

这样既能保持与生产 RAG 行为一致，又能把 retrieved documents 返回给 LangSmith evaluator。

## 9. 脚本骨架

以下是建议实现骨架，作为后续开发参考：

```python
from __future__ import annotations

import os
import uuid
from typing import Any

from langsmith import Client
from langsmith.evaluation import evaluate

from orchestration_service.clients.host_gateway import HostGatewayClient
from orchestration_service.providers.embedding_runtime import embed_texts
from orchestration_service.workflows import knowledge_qa as rag


DATASET_NAME = "xuejian-rag-smoke"


def make_host() -> HostGatewayClient:
    base_url = os.environ["XUEJIAN_HOST_GATEWAY_URL"]
    return HostGatewayClient(base_url)


def run_xuejian_rag(inputs: dict[str, Any]) -> dict[str, Any]:
    host = make_host()
    question = str(inputs["question"]).strip()
    document_ids = list(inputs.get("documentIds") or [])

    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        return {
            "answer": "当前没有可用的 embedding 配置。",
            "answerMode": "no_relevant_content",
            "retrievalStatus": "embedding_missing",
            "citations": [],
            "documents": [],
        }

    query_embedding = embed_texts(
        host,
        active_profile,
        [question],
        task_type="RETRIEVAL_QUERY",
    )[0]

    raw_chunks = host.search_hybrid(
        question,
        query_embedding=query_embedding,
        document_ids=document_ids or None,
        limit=rag.RETRIEVAL_CANDIDATE_LIMIT,
    )
    packed_chunks = rag._dedupe_and_pack_chunks(rag._vector_backed_chunks(raw_chunks))

    if not packed_chunks:
        return {
            "answer": "当前资料中没有足够证据回答这个问题。",
            "answerMode": "no_relevant_content",
            "retrievalStatus": "no_hits",
            "citations": [],
            "documents": [],
        }

    config_with_key = host.get_config_for_workflow("knowledge_qa")
    if not config_with_key:
        raise RuntimeError("Knowledge Q&A model is not configured")

    config, api_key = config_with_key
    answer_data = rag._try_langchain_qa(
        config,
        api_key,
        question,
        rag._build_passages(packed_chunks),
    )
    citations = rag._normalize_citations(answer_data.get("citations", []), packed_chunks)

    if answer_data.get("answerMode") == "no_relevant_content" or not citations:
        answer_mode = "no_relevant_content"
        retrieval_status = "no_hits"
        citations = []
    else:
        answer_mode = "grounded"
        retrieval_status = "ready"

    return {
        "answer": str(answer_data.get("answer") or "").strip(),
        "answerMode": answer_mode,
        "retrievalStatus": retrieval_status,
        "citations": citations,
        "documents": [
            {
                "page_content": rag._chunk_content(chunk),
                "metadata": {
                    "chunkId": rag._chunk_id(chunk),
                    "documentId": chunk.get("documentId"),
                    "page": rag._chunk_page(chunk),
                    "score": rag._chunk_score(chunk),
                    "vectorRank": chunk.get("vectorRank"),
                    "distance": chunk.get("distance"),
                },
            }
            for chunk in packed_chunks
        ],
    }


def citation_validity(outputs: dict[str, Any], reference_outputs: dict[str, Any]) -> dict[str, Any]:
    expected_document_ids = set(reference_outputs.get("mustCiteDocumentIds") or [])
    citations = outputs.get("citations") or []

    if outputs.get("answerMode") == "grounded" and not citations:
        return {
            "key": "citation_validity",
            "score": 0,
            "comment": "grounded answer has no citations",
        }

    if expected_document_ids:
        cited_document_ids = {citation.get("documentId") for citation in citations}
        missing = expected_document_ids - cited_document_ids
        if missing:
            return {
                "key": "citation_validity",
                "score": 0,
                "comment": f"missing expected document citations: {sorted(missing)}",
            }

    return {
        "key": "citation_validity",
        "score": 1,
        "comment": "citations satisfy deterministic checks",
    }


def main() -> None:
    client = Client()
    evaluate(
        run_xuejian_rag,
        data=DATASET_NAME,
        evaluators=[
            citation_validity,
            # 后续可加入 LangSmith/LLM-as-judge evaluators:
            # correctness
            # answer relevance
            # groundedness
            # retrieval relevance
        ],
        experiment_prefix=f"xuejian-rag-{uuid.uuid4().hex[:8]}",
        metadata={
            "app": "xuejian",
            "workflow": "knowledge_qa",
        },
    )


if __name__ == "__main__":
    main()
```

这段骨架有两个目的：

- 证明 XueJian 的 RAG 可以被包装成 LangSmith target。
- 保留 retrieved documents，方便后续 groundedness 和 retrieval relevance 评估。

真正落地时，应避免长期依赖 `_xxx` 私有函数。更稳的做法是把 `knowledge_qa.py` 中的检索、packing、answer 生成拆成可复用的公开 helper，例如：

```python
def retrieve_knowledge_qa_context(...) -> list[dict[str, Any]]:
    ...

def answer_knowledge_qa_from_context(...) -> dict[str, Any]:
    ...
```

## 10. Dataset 创建方式

### 方式 A：在 LangSmith UI 手动创建

适合早期小样本验证。

1. 登录 LangSmith。
2. 创建 dataset：`xuejian-rag-smoke`。
3. 添加 example。
4. 每条 example 的 inputs 使用：

```json
{
  "question": "...",
  "documentIds": ["..."]
}
```

5. 每条 example 的 outputs 使用：

```json
{
  "answer": "...",
  "mustCiteDocumentIds": ["..."],
  "expectedEvidence": ["..."]
}
```

### 方式 B：用脚本从 JSONL 创建

适合固定回归集。示例 JSONL：

```jsonl
{"inputs":{"question":"文档如何定义间隔重复？","documentIds":["doc-a"]},"outputs":{"answer":"间隔重复是把复习分散到多个时间点，以提高长期记忆保持率。","mustCiteDocumentIds":["doc-a"],"expectedEvidence":["长期记忆"]}}
{"inputs":{"question":"文档是否讨论火星地质？","documentIds":["doc-a"]},"outputs":{"answer":"当前资料中没有足够证据回答这个问题。","mustCiteDocumentIds":[],"expectedEvidence":[]}}
```

后续可以新增 `seed_langsmith_dataset.py`，读取 JSONL 并调用 LangSmith SDK 创建 dataset examples。

## 11. 运行前置条件

运行评估前必须满足：

- Tauri/Rust host gateway 正在运行。
- `XUEJIAN_HOST_GATEWAY_URL` 指向本地 host gateway。
- `XUEJIAN_HOST_GATEWAY_TOKEN` 与 host gateway 匹配。
- 测试文档已导入并解析成功。
- 测试文档已使用 active embedding profile 完成向量化。
- `knowledge_qa` workflow 已绑定可用模型配置。
- LangSmith 环境变量已设置。

示例：

```powershell
$env:XUEJIAN_HOST_GATEWAY_URL="http://127.0.0.1:PORT"
$env:XUEJIAN_HOST_GATEWAY_TOKEN="..."
$env:LANGSMITH_TRACING="true"
$env:LANGSMITH_API_KEY="lsv2_..."
$env:LANGSMITH_PROJECT="xuejian-rag-eval"

cd xuejian
python -m orchestration_service.evals.knowledge_qa_langsmith_eval
```

`PORT` 和 token 以本地运行时实际 host gateway 为准。

## 12. 推荐评估批次

### Smoke Eval

目的：确认接入可运行。

- 样本数：5-10。
- 文档：测试/脱敏文档。
- 指标：citation validity、answer relevance。
- 运行频率：手动。

### Regression Eval

目的：比较 RAG 参数或模型变化。

- 样本数：30-80。
- 文档：覆盖不同文档类型和问题类型。
- 指标：correctness、groundedness、retrieval relevance、citation validity。
- 运行频率：重要 RAG 改动前后。

### Retrieval Tuning Eval

目的：比较 embedding profile、`RETRIEVAL_CANDIDATE_LIMIT`、`MAX_PASSAGES`、chunk 大小。

- 样本数：50+。
- 重点指标：retrieval relevance、是否命中 expected evidence。
- 运行频率：调整检索策略时。

## 13. 结果解读

优先关注以下失败类型：

- `retrieval_relevance` 低：检索没有拿到正确上下文。优先检查 embedding、chunking、document scope、hybrid ranking。
- `groundedness` 低：回答包含检索片段不支持的结论。优先检查 prompt、citation 校验、回答生成温度。
- `answer_correctness` 低但 groundedness 高：检索到了相关内容，但模型理解或组织答案失败。
- `citation_validity` 低：后端 citation 归一化或 evaluator target 返回结构有问题。
- 无证据样本被回答为 grounded：这是严重问题，应优先修复。

不要只看平均分。RAG 更需要按失败样本逐条查看 retrieved documents 和 answer。

## 14. 与现有验收文档的关系

`docs/rag-acceptance-tests.md` 是人工/工程验收标准，LangSmith 是自动化评估平台。二者分工如下：

- 验收文档定义必须满足的行为边界。
- LangSmith dataset 把这些边界转成可重复运行的样本。
- deterministic evaluator 覆盖 citation、answerMode、documentId 等硬性规则。
- LLM-as-judge evaluator 覆盖语义质量，例如 groundedness、relevance、correctness。

## 15. 最小落地计划

建议按以下顺序实施：

1. 在 `requirements.txt` 增加 `langsmith`。
2. 新增 `orchestration_service/evals/knowledge_qa_langsmith_eval.py`。
3. 新增 5 条脱敏 smoke dataset。
4. 先只跑 `citation_validity` deterministic evaluator。
5. 确认 LangSmith experiment 能生成。
6. 再加入 groundedness 和 retrieval relevance evaluator。
7. 把失败样本回写到 `docs/rag-acceptance-tests.md` 或专门的 eval dataset。
8. 等离线评估稳定后，再考虑 CI 手动触发，不做默认强制 gate。

## 16. 不建议做的事

- 不要把 LangSmith API Key 放入 Stronghold 以外的代码或文档示例。
- 不要默认上传用户真实 PDF 内容。
- 不要把 LangSmith 评分当成唯一质量标准。
- 不要为了评估另建一套 RAG 实现，必须复用 `knowledge_qa.py` 的检索和回答逻辑。
- 不要在没有 gold answer 的情况下声称 correctness 分数可靠。

