# RAG 问答 LangGraph 化改造文档

本文是 XueJian RAG 问答运行时的架构蓝图和迁移 Runbook。目标不是新增第二套问答系统，而是把现有 `knowledge_qa` workflow 从长流程函数和手写 runner 收敛为真正的 LangGraph `StateGraph`。

核心结论：

- `KnowledgeGraph` 是升级第一阶段，必须先完成、先验收，再进入 CardGraph、StudyGraph、Intelligent Supervisor 集成。
- `Knowledge Agent = LangGraph KnowledgeGraph`。
- 普通知识问答仍走 `/workflows/knowledge-qa`，不交给 Multi-Agent Orchestrator。
- LangGraph 实现完成后成为默认 RAG QA runtime。
- 旧 `knowledge_qa.py` / `knowledge_qa_agent.py` 只允许作为迁移期 parity 对照或紧急回退，不作为长期并列运行时。
- 不允许把旧 `AgentQaRunner` 包成单节点 graph 后称为 LangGraph 化。

## 1. Decision

RAG QA 必须 LangGraph 化，原因不是追求框架形式，而是现有实现已经出现三套心智：

- `knowledge_qa.py`：确定性长流程 pipeline，承载 embedding gate、hybrid retrieval、rewrite、rerank、relevance gate、answer、citation audit、ragTrace 等核心行为。
- `knowledge_qa_agent.py`：手写 tool runner，把 RAG 能力包装成白名单工具调用，同时自己维护 event、checkpoint、fallback。
- `agent/graph.py`：当前只是 `START -> run_agent -> END`，内部仍调用 `AgentQaRunner`，没有把 RAG 步骤变成可观测、可测试、可组合的 graph 节点。

这种形态会让后续 Card Graph、Study Graph、Multi-Agent Orchestrator 都面对同一个问题：运行时看似统一，实际编排仍分散在手写 runner 和长函数里。新的 RAG Graph 必须把编排权收回到 LangGraph。

非目标：

- 不新增第二套 QA 产品入口。
- 不让 Multi-Agent 接管普通 QA。
- 不让 LLM 自由规划和调用 RAG 工具。
- 不绕过现有 Rust workflow run、message、event、checkpoint 边界。
- 不把 LangGraph checkpointer 作为新的长期状态数据库。

## 2. Current State

当前实现可以复用大量能力，但组织方式不应继续扩大。

| 模块 | 当前职责 | 问题 |
| --- | --- | --- |
| `workflows/knowledge_qa.py` | 长流程 deterministic RAG pipeline | 功能完整但编排集中，节点不可独立替换，后续 graph 化成本持续上升 |
| `workflows/knowledge_qa_agent.py` | 手写工具 runner、event、checkpoint、fallback | 与 LangGraph 职责重叠，继续扩展会形成自研 graph runtime |
| `agent/graph.py` | 单节点 LangGraph wrapper | 只包装旧 runner，不提供真实 graph 编排价值 |
| `tools/qa_tools.py` | RAG 工具注册与 schema 校验 | 可以保留为节点调用边界，但不应让 runner 直接决定流程 |
| `/workflows/knowledge-qa` | Rust 调用的 Python endpoint | 对外入口应保持稳定，内部 runtime 要收敛到 `langgraph_rag` |

迁移起点判断：

- 当前系统已有可用 RAG 能力。
- 当前系统尚未完成真正 LangGraph 化。
- 当前 `LangGraphQaRunner` 不是目标形态，只是过渡代码。
- 新文档和后续实现不得以单节点 wrapper 作为验收标准。

## 3. Target Architecture

目标链路：

```text
Rust knowledge_qa command
 -> create workflow_run / user message / assistant placeholder
 -> Python POST /workflows/knowledge-qa
 -> runtime: langgraph_rag
 -> KnowledgeGraph StateGraph
 -> compatible answer payload
 -> Rust persists assistant message, workflow events, checkpoints
```

对外 payload 保持兼容：

```json
{
  "answer": "...",
  "answerMode": "grounded | excerpt_fallback | no_relevant_content",
  "retrievalMode": "hybrid | fts5",
  "retrievalStatus": "ready | embedding_missing | embedding_stale | no_hits | low_relevance",
  "citations": [],
  "ragTrace": {},
  "queryEmbeddingStatus": "ready | missing | failed"
}
```

新增运行时诊断字段：

```json
{
  "runtime": "langgraph_rag",
  "graphVersion": "knowledge-graph-v1",
  "fallbackUsed": false,
  "artifactRefs": {
    "evidence": ["optional-ref"],
    "answer": "optional-ref"
  }
}
```

`artifactRefs` 在第一版只定义接口和状态字段，不要求新增 artifact 存储表。它用于和后续 Multi-Agent、Card Graph、Study Graph 对齐通信模型。该字段是非破坏性新增；不返回 `artifactRefs` 时，旧前端和 Rust 解析仍必须可工作。

### Artifact And Quality Contract

KnowledgeGraph 第一版只定义两类 RAG artifact：

- `evidence`
- `answer`

本文内嵌 RAG v1 最小契约，后续 [多 Agent 升级开发文档](./multi-agent-development-guide.md) 复用同一 artifact / `QualityEnvelope` 标准。RAG 不另建一套质量字段标准，也不依赖多 Agent 实现先完成。

公共 artifact 字段：

```json
{
  "artifactId": "string",
  "artifactType": "evidence | answer",
  "schemaVersion": 1,
  "summary": "string",
  "sourceRefs": ["string"],
  "qualityEnvelope": {
    "groundingStatus": "grounded | partially_grounded | ungrounded | not_applicable",
    "auditStatus": "passed | failed | skipped | not_applicable",
    "confidence": 0.82,
    "riskLevel": "low | medium | high",
    "reviewRequired": false,
    "blockingReasons": ["string"]
  },
  "errorCategory": "string | null",
  "createdBy": "langgraph_rag"
}
```

`evidence` artifact 最小字段：

```json
{
  "artifactType": "evidence",
  "documentIds": ["string"],
  "sourceChunkIds": ["string"],
  "retrievalMode": "hybrid | fts5",
  "retrievalStatus": "ready | embedding_missing | embedding_stale | no_hits | low_relevance",
  "ragTraceRef": "string | null"
}
```

`answer` artifact 最小字段：

```json
{
  "artifactType": "answer",
  "answerMode": "grounded | excerpt_fallback | no_relevant_content",
  "citationRefs": ["string"],
  "evidenceArtifactRefs": ["string"],
  "ragTraceRef": "string | null"
}
```

RAG quality gate：

- `answer` artifact 只有在 `groundingStatus=grounded` 且 `auditStatus=passed` 时，才可作为正式 grounded answer。
- `evidence` artifact 只有在 source refs 可追踪且 `riskLevel != high` 时，才可供 CardGraph / Supervisor 复用。
- FTS-only / lexical-only 结果不得生成正式 grounded answer；可以生成 high-risk evidence artifact 或 `excerpt_fallback` answer artifact。
- 缺失 `QualityEnvelope` 的 artifact 视为 `riskLevel=high`。
- `QualityEnvelope` 字段不合法时记录 `quality_envelope_invalid`。

依赖策略：

- `langgraph` 是 orchestration service 的正式依赖，不再按“可选增强”理解。
- 迁移文档可以保留紧急 fallback 说明，但最终实现目标是默认启用 `langgraph_rag`。

持久化边界：

- Rust / Host Gateway 是业务写入权威。
- `workflow_events` 和 `workflow_checkpoints` 继续由现有 Rust 表承载。
- Python / LangGraph 不直接写 SQLite。
- LangGraph state 可以产生 event/checkpoint payload，但写入必须经 Host Gateway。
- checkpoint 不保存 prompt、chain-of-thought、API key、完整长正文；只保存节点名、artifact refs、质量分数、错误类别、摘要和必要诊断。

工具边界：

- Graph 节点只能调用注册工具或明确的本地节点 helper。
- Tool registry 继续保留 `allowed_callers`。
- RAG Graph caller 固定为 `langgraph_rag`，不得继续使用 `knowledge_qa_agent` 或新增兼容别名作为长期 caller。
- Router / Supervisor 不生成 answer、citation、evidence 或 learning advice。

## 4. KnowledgeGraph Contract

### 4.1 State

第一版 `KnowledgeGraphState` 应显式表达 RAG 每个阶段的输入、输出和失败类别：

```python
class KnowledgeGraphState(TypedDict, total=False):
    run_id: str
    graph_version: str
    runtime: str

    question: str
    document_ids: list[str]
    conversation_id: str | None

    active_profile: dict | None
    readiness_status: str
    query_embedding_status: str
    query_embedding_meta: dict

    recent_messages: list[dict]
    rewrite_summary: dict
    rewritten_query: str | None

    candidate_chunks: list[dict]
    expanded_contexts: dict
    packed_chunks: list[dict]

    retrieval_mode: str
    retrieval_status: str
    retrieval_summary: dict
    merge_summary: dict
    rerank_summary: dict
    gate_summary: dict

    remediation_count: int
    remediation_reason: str | None
    remediation_summary: dict

    answer_data: dict | None
    citations: list[dict]
    audit_summary: dict
    rag_trace: dict

    artifact_refs: dict
    quality_envelope: dict
    result: dict | None
    error_category: str | None
    fallback_used: bool
```

State 不是日志桶。长文本和大块 evidence 应优先通过 refs 或摘要传递，避免 checkpoint 膨胀。

### 4.2 Nodes

目标节点采用中粒度拆分：

```text
START
 -> initialize_run
 -> check_embedding_readiness
 -> embed_question
 -> load_conversation_context
 -> maybe_rewrite_query
 -> retrieve_evidence
 -> merge_parent_context
 -> rerank_evidence
 -> relevance_gate
 -> maybe_remediate_retrieval
 -> pack_context
 -> write_answer
 -> audit_citations
 -> build_rag_trace
 -> finalize_result
 -> END
```

节点职责：

- `initialize_run`：规范化输入，设置 `runtime=langgraph_rag`、`graphVersion`、初始 event。
- `check_embedding_readiness`：读取 embedding profile 和文档 readiness。
- `embed_question`：生成 query embedding；失败时记录 `queryEmbeddingStatus=failed`，不得直接生成 grounded answer。
- `load_conversation_context`：加载同一 conversation 的近期消息，只作为 rewrite 上下文，不作为 citation 来源。
- `maybe_rewrite_query`：在多轮对话需要时改写检索 query；失败则回退原问题并记录 `rewrite_failed`。
- `retrieve_evidence`：执行注册检索工具，返回候选 chunks、retrieval mode、retrieval summary。
- `merge_parent_context`：补充父级结构上下文，保留 child chunk citation 锚点。
- `rerank_evidence`：本地或 provider rerank，输出稳定排序和诊断。
- `relevance_gate`：判断 evidence 是否足够回答。
- `maybe_remediate_retrieval`：受控补救分支，最多一次。
- `pack_context`：生成回答上下文，保留 citation 可追踪结构。
- `write_answer`：生成结构化 answer JSON。
- `audit_citations`：校验 citation 是否忠实于 retrieved child chunks。
- `build_rag_trace`：输出 retrieval、merge、rerank、gate、audit 的诊断摘要。
- `finalize_result`：构造兼容 payload，写入最终 event/checkpoint。

### 4.3 Controlled Remediation

Graph 主链是确定性编排，不允许 LLM 自由规划工具调用。允许的混合策略仅限受控补救分支：

- 最多执行 1 次。
- 触发条件必须来自明确 error category：
  - `evidence_gap`
  - `rewrite_failed`
  - `low_relevance`
  - `citation_audit_failed`
- 补救节点仍只能调用白名单工具。
- 补救不得绕过 `pack_context`、`write_answer`、`audit_citations`。
- 补救失败后优先返回 `no_relevant_content`，不得继续循环。

禁止形态：

- 自由 Agent 多轮自主调用工具。
- LLM 自行决定是否跳过 citation audit。
- 因为检索失败而让模型凭常识回答文档问题。

### 4.4 Answer Boundary

FTS-only / lexical-only 是降级能力，不是正式 grounded answer 的证据基础。

规则：

- `retrievalMode=hybrid` 且 citation audit 通过，才允许输出正式 grounded answer。
- `retrievalMode=fts5` 或 lexical-only 时，只允许：
  - `excerpt_fallback`
  - `no_relevant_content`
  - 诊断性提示
- embedding missing / stale 时不得伪装为完整 grounded answer。
- no hits、low relevance、citation audit failed 时优先拒答。
- `citations` 必须指向 retrieved child chunks，不得指向 conversation memory 或 LLM 生成内容。

### 4.5 Failure Policy

失败分类必须稳定，便于测试和 UI 展示：

| error category | 处理 |
| --- | --- |
| `embedding_missing` | 返回 embedding readiness 诊断，不生成 grounded answer |
| `query_embedding_failed` | 可走 lexical excerpt fallback，但不能 grounded |
| `rewrite_failed` | 使用原问题继续检索，并记录补救原因 |
| `retrieval_no_hits` | 返回 `no_relevant_content` |
| `low_relevance` | 最多一次补救，仍失败则拒答 |
| `citation_audit_failed` | 最多一次补救，仍失败则拒答 |
| `node_exception` | 迁移期可紧急回退旧 deterministic；最终应转为明确失败 payload |

紧急 fallback 只服务迁移期稳定性。parity 通过后，不应长期保留旧 `knowledge_qa_agent.py` 或长流程 `knowledge_qa.py` 作为并列 runtime。

## 5. Migration Runbook

### Step 1: 建立新的 graph 目录

新增目标结构：

```text
orchestration_service/
  graphs/
    knowledge_graph.py
    knowledge_nodes.py
    knowledge_state.py
    knowledge_events.py
```

要求：

- `knowledge_graph.py` 只负责组装 `StateGraph`、条件边和 compile。
- `knowledge_nodes.py` 承载中粒度节点。
- `knowledge_state.py` 定义 state 类型和常量。
- `knowledge_events.py` 统一 event/checkpoint payload 构造。

不再把新逻辑放进 `orchestration_service/agent/graph.py`。该路径当前语义已经被单节点 wrapper 污染，迁移后应删除或停止引用。

### Step 2: 提升 LangGraph 依赖

- 将 `langgraph` 视为 orchestration service 必选依赖。
- 文档和实现都不再把 “langgraph not available” 当作正常生产路径。
- 安装缺失应在启动或测试阶段暴露，而不是在请求中静默降级。

### Step 3: 收敛工具调用

Graph 节点可以复用现有 `qa_tools.py` 的 schema 和 handler，但调用方必须从 `knowledge_qa_agent` 迁移到 `langgraph_rag`。

迁移期允许从 `knowledge_qa.py` 拆出已验证 helper，避免一次性重写所有检索和审计细节。但拆出的 helper 只能服务 graph 节点，不应形成新的长流程 pipeline。

### Step 4: 接入 `/workflows/knowledge-qa`

endpoint 对外路径不变：

```text
POST /workflows/knowledge-qa
```

内部策略：

```text
default runtime: langgraph_rag
migration fallback: deterministic emergency fallback only
final runtime: langgraph_rag only
```

返回 payload 必须保持前端和 Rust 可兼容解析，同时增加运行时诊断字段。

### Step 5: Lightweight Compatibility Parity

旧实现退出前只做轻量兼容性 parity。它是迁移护栏，不是长期双运行机制，也不是要求新实现复刻旧实现所有细节。

不做：

- 不做生产影子流量。
- 不要求新旧实现持续双跑。
- 不要求自然语言答案逐字一致。
- 不要求 citation 数量和排序完全一致。
- 不复刻旧实现中与本文档冲突的行为，例如 FTS-only grounded answer。

最小检查范围：

- 契约兼容：`answer`、`answerMode`、`retrievalMode`、`retrievalStatus`、`citations`、`ragTrace`、`queryEmbeddingStatus` 不破坏现有解析。
- 新增字段兼容：`runtime`、`graphVersion`、`fallbackUsed`、`artifactRefs` 只能作为非破坏性新增。
- 前端兼容：`KnowledgeQaPage`、`RagTracePanel`、citation card、fallback / no relevant UI 不崩。
- 边界行为：no hits、embedding missing / stale、FTS-only、citation audit failure、rewrite failure 不回退。

允许差异：

- answer 文本可以不同。
- citation 排序可以不同。
- 同等质量 citation 数量可以小幅不同。
- rerank 分数、gate 分数可以小幅波动。
- `ragTrace` 可以新增字段，但不得删除或改坏前端依赖字段。

阻断项：

- 前端 schema 无法解析。
- `answerMode` / `retrievalMode` / `retrievalStatus` 枚举不兼容。
- `ragTrace` shape 破坏现有 UI。
- no hits 仍生成 grounded answer。
- citation audit failure 后仍输出 grounded answer。
- FTS-only 输出正式 grounded answer。
- Python 直接写 SQLite。

最小 sanity set：

- 正常单文档 grounded answer。
- 多文档 grounded answer。
- no relevant content。
- FTS-only / lexical fallback。
- embedding missing 或 stale。
- rewrite failure 回退原 query。
- citation audit failure。
- `RagTracePanel` 可解析显示。

旧实现只作为 payload 和边界行为参考，不作为最终行为权威。最终以本文档定义的证据边界、质量边界和 LangGraph runtime 边界为准。

轻量 parity 通过后：

- 删除或停用 `knowledge_qa_agent.py` 的编排职责。
- 删除单节点 LangGraph wrapper。
- `knowledge_qa.py` 不再作为主 workflow；必要 helper 应迁入 graph/tool/core 层。

### Step 6: 对齐 Multi-Agent

多 Agent 文档中的 Knowledge Agent 只能指向：

```text
Knowledge Agent = LangGraph KnowledgeGraph
```

RAG acceptance tests 未通过前，多 Agent 不得把旧 `knowledge_qa.py` / `knowledge_qa_agent.py` 当作 Knowledge Agent，也不得让 Supervisor 正式集成旧 RAG runner。多 Agent 只能消费已验收的 KnowledgeGraph 契约、artifact refs 和质量状态。

Multi-Agent Orchestrator 不直接调用 `knowledge_qa_agent.py`，也不直接复刻 RAG 检索、回答、citation audit。普通 QA 不触发 Multi-Agent。

## 6. Acceptance Tests

文档和实现完成后至少满足以下验收项。

### Contract

- `/workflows/knowledge-qa` 返回现有字段：`answer`、`answerMode`、`retrievalMode`、`retrievalStatus`、`citations`、`ragTrace`、`queryEmbeddingStatus`。
- 返回新增字段：`runtime=langgraph_rag`、`graphVersion`、`fallbackUsed`、可选 `artifactRefs`。
- Rust 和前端现有解析不破坏。
- `ragTrace` 必须保留前端依赖字段，并允许非破坏性新增字段。
- `artifactRefs` 使用对象映射：`evidence` 为 ref 数组，`answer` 为单个 ref。
- 不返回 `artifactRefs` 时旧解析仍可工作。

### Artifact And Quality

- 第一版只定义 `evidence` 和 `answer` 两类 RAG artifact。
- RAG artifact 必须包含公共字段：`artifactId`、`artifactType`、`schemaVersion`、`summary`、`sourceRefs`、`qualityEnvelope`、`errorCategory`、`createdBy`。
- `evidence` artifact 必须包含 `documentIds`、`sourceChunkIds`、`retrievalMode`、`retrievalStatus`、`ragTraceRef`。
- `answer` artifact 必须包含 `answerMode`、`citationRefs`、`evidenceArtifactRefs`、`ragTraceRef`。
- `qualityEnvelope` 必须包含 `groundingStatus`、`auditStatus`、`confidence`、`riskLevel`、`reviewRequired`、`blockingReasons`。
- 缺失 `QualityEnvelope` 的 artifact 不能被后续 Graph 当作可信输入。
- grounded answer 必须满足 `groundingStatus=grounded` 且 `auditStatus=passed`。
- citation audit failure 不能输出可用 answer artifact。
- FTS-only / lexical-only 不能输出正式 grounded answer artifact。

### Graph Runtime

- 默认 runtime 是 `langgraph_rag`。
- `agent/graph.py` 的单节点 wrapper 不再作为验收依据。
- 每个中粒度节点可以独立单测。
- 条件边覆盖 rewrite failure、low relevance、citation audit failure、no hits。

### RAG Quality Boundary

- `retrievalMode=fts5` / lexical-only 不产生正式 grounded answer。
- embedding missing / stale 不产生正式 grounded answer。
- no hits 返回 `no_relevant_content`。
- citation audit failure 不允许绕过审计直接输出答案。
- 受控补救分支最多执行 1 次。

### Lightweight Compatibility Parity

- 不要求答案文本逐字一致。
- 不要求 citation 数量和排序完全一致。
- 正常单文档 grounded answer 可以返回兼容 payload。
- 多文档 grounded answer 可以返回兼容 payload。
- `no_relevant_content` 可以被前端解析和展示。
- `excerpt_fallback` 可以被前端解析和展示。
- FTS-only / lexical fallback 不产生正式 grounded answer。
- embedding missing / stale 不伪装为 ready。
- rewrite failure 可以回退原 query。
- citation audit failure 不绕过审计。
- `KnowledgeQaPage`、`RagTracePanel`、citation card、fallback / no relevant UI 不崩。

### Persistence And Observability

- graph 开始、关键节点、补救分支、最终结果都写入 workflow event。
- checkpoint 只保存节点名、诊断摘要、artifact refs、质量分数、error category。
- checkpoint 不保存 prompt、chain-of-thought、API key、完整长正文。
- Python 不直接写 SQLite。

### Legacy Exit

- `knowledge_qa_agent.py` 不再新增业务编排逻辑。
- Multi-Agent 不引用 `knowledge_qa_agent.py` 作为 Knowledge Agent。
- 轻量 compatibility parity 通过后，旧 runner 和旧长流程 pipeline 从主路径退出。

## 7. Implementation Notes

推荐优先级：

1. 先搭建 `KnowledgeGraphState` 和空节点 graph，让 runtime 形态正确。
2. 再迁移 retrieval、rerank、gate、pack、answer、audit 等中粒度节点。
3. 再接入 event/checkpoint。
4. 最后处理旧文件退出和 Multi-Agent 文档引用。

判断实现是否走偏的标准：

- 如果 graph 只有一个节点调用旧 runner，说明没有完成迁移。
- 如果 LLM 可以自由选择工具，说明 RAG QA 变成了不可控 agent。
- 如果 FTS-only 能输出 grounded answer，说明证据边界失守。
- 如果 Python 直接写 SQLite，说明 Host Gateway 边界失守。
- 如果旧 `knowledge_qa_agent.py` 仍是 Multi-Agent 的 Knowledge Agent 入口，说明架构没有收敛。
