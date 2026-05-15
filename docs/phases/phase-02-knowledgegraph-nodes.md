# Phase 02: KnowledgeGraph Nodes

## Goal

将旧 RAG 主流程拆入 KnowledgeGraph 中粒度节点，让检索、重排、门控、回答和审计可观测、可测试、可替换。

## Inputs

- Phase 01 已接入 `langgraph_rag` runtime。
- `knowledge_qa.py` 中已经验证的 RAG helper。
- `qa_tools.py` 的 schema 和 handler。

## Implementation Scope

迁移或实现以下中粒度节点：

```text
initialize_run
check_embedding_readiness
embed_question
load_conversation_context
rewrite_question
retrieve_candidates
merge_parent_context
rerank_candidates
relevance_gate
controlled_remediation
pack_answer_context
generate_answer
citation_audit
build_rag_trace
finalize_response
```

- LLM 只负责 rewrite、answer 等生成任务。
- 受控补救分支最多执行 1 次。
- Graph 节点可复用 `qa_tools.py`，caller 收敛到 `langgraph_rag`。
- event/checkpoint payload 由 graph 节点产生，持久化仍走 Host Gateway。

## Out Of Scope

- 不让 LLM 自由规划工具。
- 不输出正式多 Agent artifact store。
- 不让 Multi-Agent 直接调用旧 RAG runner。
- 不处理 CardGraph 或 StudyGraph。

## Interfaces

节点之间通过 `KnowledgeGraphState` 传递结构化字段。长正文和大块 evidence 应通过 refs 或摘要传递，避免 checkpoint 膨胀。

## Discovery Checklist

- 读取 `xuejian/orchestration_service/workflows/knowledge_qa.py`，标记现有 embedding gate、rewrite、retrieval、rerank、gate、answer、citation audit、ragTrace 细节。
- 读取 `xuejian/orchestration_service/tools/qa_tools.py`，确认可复用 tool schema 和 handler。
- 读取 `xuejian/tests/unit/test_knowledge_qa.py`、`test_knowledge_qa_p03.py`、`test_knowledge_qa_p04.py`，确认边界行为。
- 检查 `xuejian/orchestration_service/clients/host_gateway.py`，确认节点需要通过 Host Gateway 获取上下文或写 event。
- 列出现有 `ragTrace` 字段，避免 Phase 3 破坏前端。

## Implementation Checklist

- 先从 `knowledge_qa.py` 抽取已验证 helper，再挂接到 graph 节点。
- 按节点顺序迁移 initialize、embedding readiness、query embedding、conversation context、rewrite。
- 再迁移 retrieve、parent merge、rerank、relevance gate、controlled remediation。
- 最后迁移 pack、answer、citation audit、trace、finalize。
- 每迁移一个节点就补对应单测或更新现有测试。
- 确保 LLM 不自由选择工具，只在指定节点执行 rewrite / answer。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py
pytest xuejian/tests/unit/test_knowledge_qa_p03.py xuejian/tests/unit/test_knowledge_qa_p04.py
pytest xuejian/tests/unit/test_knowledge_qa_agent.py
```

## Do Not Proceed If

- rewrite failure、low relevance、no hits、citation audit failure 没有稳定条件边。
- 节点迁移靠从零重写，未复用旧实现中已验证的关键边界。
- checkpoint 保存完整 prompt、chain-of-thought 或大块正文。
- FTS-only / lexical-only 仍能产生正式 grounded answer。

## Acceptance Tests

- 每个中粒度节点可单测。
- 条件边覆盖 rewrite failure、low relevance、citation audit failure、no hits。
- FTS-only / lexical-only 不产生正式 grounded answer。
- embedding missing / stale 不伪装为 ready。
- citation audit failure 不绕过审计。

## Exit Criteria

KnowledgeGraph 主链可替代旧长流程的核心编排后进入 Phase 3。旧实现仍可作为轻量 parity 参考。
