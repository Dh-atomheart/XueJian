# Phase 00: Contract Freeze

## Goal

冻结 RAG LangGraph 化与多 Agent 升级的共享契约，让后续开发只实现已确认边界，不在实现中重新发明 wire shape、质量字段或旧 runner 退出规则。

## Inputs

- [RAG LangChain / LangGraph 重构文档](../rag/rag-langchain-langgraph-refactor.md)
- [多 Agent 升级开发文档](../multi-agent-development-guide.md)
- 现有 `/workflows/knowledge-qa` payload
- 现有 `KnowledgeQaPage`、`RagTracePanel`、citation card、fallback / no relevant UI

## Implementation Scope

- 冻结 `QualityEnvelope` 为唯一质量信封；不得新增 `qualitySummary`、`qualityFlags` 或第二套质量字段。字段固定为：
  - `groundingStatus`
  - `auditStatus`
  - `confidence`
  - `riskLevel`
  - `reviewRequired`
  - `blockingReasons`
- 冻结 `artifactRefs` 为按类型分组对象映射；RAG v1 wire shape 固定为：
  ```json
  {
    "evidence": ["artifact-id"],
    "answer": "artifact-id"
  }
  ```
- 固定 RAG v1 artifact 类型：`evidence`、`answer`。
- 固定 caller 目标名：`langgraph_rag`、`langgraph_card`、`langgraph_study`、`langgraph_multi_agent`。
- 固定旧 runner 退出规则：`knowledge_qa.py` / `knowledge_qa_agent.py` 只作为迁移期 parity 对照或紧急回退，不作为当前 `KnowledgeGraph` 入口；Multi-Agent / Supervisor 不得直接调用旧 runner。
- 建立最小 sanity set：正常单文档、多文档、`no_relevant_content`、FTS-only / lexical fallback 不产生正式 grounded answer、`embedding_missing` / `embedding_stale`、query rewrite failure、citation audit failure、`RagTracePanel` 可解析旧字段与新增字段缺省 payload。

## Out Of Scope

- 不改核心 RAG 行为。
- 不新增 artifact store 或数据库表。
- 不接入 Supervisor。
- 不删除旧 runner。

## Interfaces

`/workflows/knowledge-qa` 现有字段必须继续兼容：

```text
answer
answerMode
retrievalMode
retrievalStatus
citations
ragTrace
queryEmbeddingStatus
```

新增字段只能是非破坏性新增：

```text
runtime
graphVersion
fallbackUsed
artifactRefs
```

Phase 00 只冻结 `runtime=langgraph_rag`、`graphVersion=knowledge-graph-v1`、`fallbackUsed`、`artifactRefs` 的含义和兼容规则；实际返回这些字段从 Phase 1 开始落地。`artifactRefs` 缺省时，旧前端和 Rust 解析仍必须可工作。

Supervisor 禁止输出业务内容类型：

```text
answer
citation
card candidate
learning advice
```

Supervisor 只能汇总 artifact refs、摘要、质量状态和错误类别。

## Discovery Checklist

- 读取 `docs/rag/rag-langchain-langgraph-refactor.md`，确认 `QualityEnvelope`、`artifactRefs`、`langgraph_rag`、旧 runner 退出规则。
- 读取 `docs/multi-agent-development-guide.md`，确认 `QualityEnvelope`、`artifactRefs`、`langgraph_multi_agent`、Supervisor 禁止输出类型。
- 读取 `docs/phases/README.md`，确认 phase 顺序和禁止跳阶段规则。
- 检查 `xuejian/tests/unit/test_knowledge_qa.py` 中现有 payload、event、fallback 行为。
- 检查 `xuejian/tests/unit/knowledge-qa-page.test.tsx` 和 `xuejian/src/components/knowledge/RagTracePanel.tsx` 中前端依赖字段。

## Implementation Checklist

- 固定 `QualityEnvelope` 字段，不新增第二套质量字段。
- 固定 `artifactRefs` 为按类型分组对象映射，RAG v1 为 `{ evidence: string[], answer: string }`。
- 固定 RAG v1 artifact 只包含 `evidence` 和 `answer`。
- 固定旧 `knowledge_qa.py` / `knowledge_qa_agent.py` 只能作为迁移期 parity 对照或紧急回退，不作为当前 KnowledgeGraph 入口。
- 将 sanity set 写入当前开发任务或测试任务清单。

## Verification Commands

```powershell
rg "QualityEnvelope|artifactRefs|langgraph_rag|langgraph_multi_agent" docs
rg "citationAudit|retrievalMode.*qualityEnvelope|qualityEnvelope.*retrievalMode" docs
rg "knowledge_qa_agent.py" docs
rg "旧 runner" docs
pytest xuejian/tests/unit/test_knowledge_qa.py
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-page.test.tsx
```

## Do Not Proceed If

- 两份权威文档对 `QualityEnvelope` 字段不一致。
- 两份权威文档对 `artifactRefs` shape 不一致。
- 旧 `knowledge_qa_agent.py` 被描述为当前 KnowledgeGraph 入口。
- sanity set 没有覆盖 no relevant、FTS-only、embedding missing/stale、citation audit failure。
- 任一文档引入 `qualitySummary`、`qualityFlags` 或第二套质量字段来表达 graph artifact 质量。

## Acceptance Tests

- 两份权威文档对 `QualityEnvelope` 字段无冲突。
- 两份权威文档对 `artifactRefs` wire shape 无冲突。
- `knowledge_qa_agent.py` 不被描述为当前 KnowledgeGraph 入口。
- Phase 1-7 均能引用同一套契约。
- `/workflows/knowledge-qa` 新增字段被描述为可选、非破坏性新增。

## Exit Criteria

契约冻结后进入 Phase 1。后续 phase 不得修改这些字段含义；确需修改时必须回到 Phase 0 更新契约和验收项。
