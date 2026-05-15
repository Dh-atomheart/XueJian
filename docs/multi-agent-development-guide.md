# 多 Agent 升级开发文档

本文是 XueJian 多 Agent 升级的唯一权威开发契约与架构蓝图。多 Agent 不是普通问答或普通制卡的起点，而是在 `KnowledgeGraph`、`CardGraph`、`StudyGraph` 稳定后，由 `Intelligent Supervisor Graph` 组织复合学习任务。

核心结论：

```text
Knowledge Agent = LangGraph KnowledgeGraph
Card Agent = CardGraph
Learning Agent = StudyGraph
Multi-Agent Orchestrator = Intelligent Supervisor Graph
```

当前能力阶段：

```text
KnowledgeGraph -> CardGraph -> StudyGraph -> Intelligent Supervisor
```

不再使用旧 `P05/P06/P07` 作为当前开发阶段命名。旧阶段文档已经归档，不能再作为当前多 Agent 开发入口。

## 1. Decision

Multi-Agent Orchestrator 应写成更智能的 Supervisor，而不是薄 router。原因是复合学习任务通常不是简单地把用户请求分发给一个子图：

- 用户可能同时要求解释资料、生成卡片、诊断薄弱点、安排后续学习。
- 子图结果可能改变后续计划，例如 KnowledgeGraph 发现证据不足时，不应继续正式成卡。
- CardGraph 可能生成低质量候选，此时 Supervisor 应能调整输出为部分成功。
- StudyGraph 可能没有足够复习数据，此时 Supervisor 应能保留 QA / Card 结果并解释诊断缺口。

因此 Supervisor 必须具备：

- 复合任务理解。
- 计划拆分。
- 子图选择。
- 上下文裁剪。
- 受控动态重规划。
- 部分成功输出。
- 最终 orchestration summary 汇总。

但 Supervisor 不是业务内容生成者：

- 不生成 grounded answer。
- 不生成 citation。
- 不生成 card candidate。
- 不生成 learning advice。
- 不直接写 SQLite。
- 不绕过子图的质量门槛。
- 不保存 chain-of-thought。

Supervisor 可以生成用户可见的 orchestration summary，但只能汇总子图 artifact 摘要、质量分数、错误类别和执行结果，不新增事实。

## 2. Current State

当前仓库已有一些能力来源，但还没有完成真正的多 Agent graph 化。

已存在：

- `knowledge_qa.py`：已有 RAG pipeline 能力，但它是长流程实现，不是目标 `KnowledgeGraph`。
- `knowledge_qa_agent.py`：已有手写 RAG tool runner，但不能作为长期 Knowledge Agent。
- `agent/graph.py`：当前只是单节点 wrapper，不是合格 RAG Graph。
- `tools/registry.py`：已有 schema-first tool registry、`allowed_callers`、side effect 和错误分类基础。
- `card_generation_agent.py`：已有接近 CardGraph 的线性工具链，但仍是手写 runner。
- `card_tools.py`：已有 content map、candidate generation、source quote audit、critique、dedupe、candidate submit 工具。
- `study_tools.py`：已有 review suggestion / review candidate submission 工具雏形。

当前落地边界：

- RAG QA 已收敛到 `KnowledgeGraph`，以 [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md) 为准。
- CardGraph 已作为 `langgraph_card` subgraph 落地。
- StudyGraph v1 已作为 `langgraph_study` subgraph 落地。
- Intelligent Supervisor Graph 已作为 `langgraph_multi_agent` 落地。
- `/workflows/agent-task` 已作为复合学习任务入口落地；普通 QA 和普通制卡仍走专用入口。
- 全局 artifact store、跨 Graph artifact refs 通信、role event chain 尚未落地；RAG v1 最小 `evidence` / `answer` artifact 契约以 [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md) 为准。
- `allowed_callers` 的旧 caller 命名已开始迁移；card tools 使用 `langgraph_card`，study tools 使用 `langgraph_study`。

迁移原则：

- 旧 runner 只作为迁移期能力来源、parity 对照或紧急回退，不作为长期并列 runtime。
- 新增编排必须放入 LangGraph graph/subgraph，不再新增手写 orchestration runner。
- 多 Agent 不直接调用旧 runner，只调用 graph 或 artifact。
- 业务写入必须通过 Rust / Host Gateway。

## 3. Target Architecture

目标形态：

```text
User compound learning task
 -> /workflows/agent-task
 -> Intelligent Supervisor Graph
      -> KnowledgeGraph
      -> CardGraph
      -> StudyGraph
      -> Trace / Summary Builder
 -> artifact refs + orchestration summary
 -> Rust persists workflow result, events, checkpoints, business writes
```

普通任务不进入 multi-agent：

```text
普通 QA -> /workflows/knowledge-qa -> KnowledgeGraph
普通制卡 -> CardGraph 或迁移后的制卡入口
复合学习任务 -> /workflows/agent-task -> Intelligent Supervisor Graph
```

目标 runtime：

```text
langgraph_rag
langgraph_card
langgraph_study
langgraph_multi_agent
```

数据权威边界：

- Rust / SQLite 是业务数据权威。
- Python / LangGraph 负责流程编排和结构化结果生成。
- Python 不直接写 SQLite。
- 所有业务写入通过 Host Gateway。
- LangGraph 生产 event/checkpoint/artifact payload，但持久化由 Host Gateway 执行。

## 4. Graph Contracts

### 4.1 KnowledgeGraph

KnowledgeGraph 是多 Agent 体系中的 Knowledge Agent。它的权威设计见 [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md)。

多 Agent 文档只规定集成边界：

- Supervisor 只能调用已通过 RAG 文档验收的 KnowledgeGraph，或读取其 artifact refs。
- Supervisor 不直接调用 `knowledge_qa.py` 或 `knowledge_qa_agent.py`。
- KnowledgeGraph 负责 answer、evidence、citation audit、ragTrace。
- KnowledgeGraph 失败时优先返回 `no_relevant_content` 或诊断 artifact。
- 旧 deterministic RAG 只允许作为迁移期紧急回退，不是长期 fallback。

KnowledgeGraph 输出给 Supervisor 的最小边界：

- artifact 类型只使用 RAG 文档定义的 `evidence` 和 `answer`。
- `qualityEnvelope` 必须使用统一字段：`groundingStatus`、`auditStatus`、`confidence`、`riskLevel`、`reviewRequired`、`blockingReasons`。
- `retrievalMode`、`retrievalStatus`、`answerMode`、`citationRefs` 等属于 RAG artifact 业务字段。
- 上述业务字段不得放入 `qualityEnvelope`。
- `artifactRefs` 使用按类型分组的对象映射；RAG v1 固定为 `{ "evidence": string[], "answer": string }`。Supervisor 只传 refs 和摘要，不传完整正文、prompt 或 chain-of-thought。

### 4.2 CardGraph

CardGraph 负责从可信 evidence 生成卡片。目标是替代 `CardGenerationAgentRunner` 的手写编排。

目标流程：

```text
START
 -> load_source_evidence
 -> build_coverage_plan
 -> generate_candidates
 -> audit_source_quotes
 -> critique_candidates
 -> dedupe_candidates
 -> submit_or_create_cards
 -> END
```

输入：

```json
{
  "runId": "string",
  "documentIds": ["string"],
  "sourceChunkIds": ["string"],
  "evidenceArtifactRefs": ["string"],
  "cardCountHint": 10,
  "difficulty": "basic | normal | advanced",
  "writeMode": "candidate | formal_card"
}
```

输出：

```json
{
  "status": "completed | partial | failed",
  "cardArtifactRefs": ["string"],
  "createdCardIds": ["string"],
  "qualityEnvelope": {},
  "errorCategory": "string | null"
}
```

候选卡最小 schema：

```json
{
  "front": "string",
  "back": "string",
  "sourceChunkIds": ["string"],
  "sourceQuote": "string",
  "confidence": 0.85,
  "tags": ["string"],
  "qualityEnvelope": {}
}
```

候选卡质量原因必须写入统一 `qualityEnvelope.blockingReasons`，不得新增 `qualityFlags`、`qualitySummary` 或第二套质量字段。

正式成卡写入规则：

- 允许自动创建正式 cards，默认不要求人工确认。
- 必须通过 `audit_source_quotes`。
- 必须通过 quality gate。
- 必须通过 dedupe。
- 必须带幂等键。
- 必须写审计事件。
- 必须具备可回滚或撤销语义。
- 必须通过 Host Gateway 写入。

禁止：

- source quote 无效时创建正式卡。
- duplicate 未处理时创建正式卡。
- Python 直接写 cards 表。
- `CardGenerationAgentRunner` 仅保留为迁移期参考或紧急回退，不再扩展新业务编排；主路径由 CardGraph 承担。

### 4.3 StudyGraph

StudyGraph 负责学习诊断和复习状态建议。它分为 v1 和 v2 两层契约。

#### StudyGraph v1

v1 只输出 learning advice 和补卡建议，不写调度状态。

目标流程：

```text
START
 -> load_review_summary
 -> detect_weak_topics
 -> suggest_card_gaps
 -> build_learning_advice
 -> END
```

输出：

```json
{
  "status": "completed | partial | failed",
  "learningAdviceArtifactRef": "string | null",
  "suggestedCardGapRefs": ["string"],
  "qualityEnvelope": {},
  "errorCategory": "string | null"
}
```

硬边界：

- 不调用 `submit_review_candidates`。
- 不写复习调度状态。
- 不写长期记忆。
- 不作为 citation source。
- 可以建议 CardGraph 生成补卡，但必须经过 CardGraph 质量门槛。

#### StudyGraph v2

v2 允许直接写复习调度状态，但这是高风险扩展，必须独立满足硬门槛。

启用条件：

- 有显式 runtime 开关。
- 支持 dry-run。
- 有幂等键。
- 有回滚或撤销语义。
- 有审计事件。
- 有权限矩阵。
- 有失败恢复契约。
- 有验收测试覆盖重复写入、取消、回滚、部分成功。

即使默认不要求人工确认，StudyGraph v2 也不得绕过这些门槛。

### 4.4 Intelligent Supervisor Graph

Intelligent Supervisor 是多 Agent 的核心，不是薄 router。

目标能力：

- 理解复合学习任务。
- 拆分 task plan。
- 选择子图。
- 裁剪传入子图的上下文。
- 根据子图结果受控重规划。
- 输出部分成功结果。
- 生成 orchestration summary。

Supervisor state 最小字段：

```python
class SupervisorState(TypedDict, total=False):
    run_id: str
    graph_version: str
    runtime: str

    user_request: str
    document_ids: list[str]
    card_group_ids: list[str]

    task_plan: list[dict]
    route_plan: list[str]
    plan_revisions: list[dict]
    decision_records: list[dict]
    subgraph_results: dict

    answer_artifact_refs: list[str]
    evidence_artifact_refs: list[str]
    card_artifact_refs: list[str]
    learning_advice_artifact_refs: list[str]
    trace_artifact_refs: list[str]

    quality_envelopes: dict
    error_categories: list[str]
    budget_counters: dict
    fallback_targets: list[str]
    final_summary: dict
```

受控动态计划预算：

```text
maxPlanSteps = 6
maxSubgraphCalls = 5
maxReplans = 2
```

超过预算时：

- 停止新增子图调用。
- 保留已完成 artifact。
- 输出 `budget_exceeded` 诊断。
- 不让 Supervisor 自行生成缺失业务结果。

Supervisor 可以输出：

- `route_plan`
- `plan_revisions`
- `orchestration_summary`
- `artifactRefs`
- `qualityEnvelope`
- `errorCategory`
- `fallbackTarget`

Supervisor 不得输出：

- grounded answer 正文。
- citation。
- card candidate。
- formal card 内容。
- learning advice 内容。
- review schedule 状态。

### 4.5 Supervisor Control Contract

Intelligent Supervisor 必须采用 `plan -> self-evaluate -> policy-check -> execute -> observe -> replan` 的受控循环。LLM 可以提出计划和自评，但不能自我放行。

职责划分：

- LLM planner：产出 task plan、route plan、self evaluation、reason summary。
- Policy checker：检查预算、权限、artifact 输入类型、目标 artifact 类型、质量门槛、禁止输出类型。
- Executor：只执行通过 policy check 的单步子图调用。
- Observer：读取子图 artifact、error category、quality envelope，决定是否需要重规划。

每一步执行前必须校验：

- 当前 plan step 未超过 `maxPlanSteps`。
- 子图调用次数未超过 `maxSubgraphCalls`。
- 重规划次数未超过 `maxReplans`。
- `selectedGraph` 在允许路由内。
- 输入 artifact 类型满足目标子图要求。
- 输入 artifact 的 `qualityEnvelope` 通过对应 gate。
- 输出类型不在 Supervisor 禁止输出清单内。
- caller 权限满足 `allowed_callers`。

LLM 自评最小输出：

```json
{
  "necessity": "required | optional | unnecessary",
  "riskLevel": "low | medium | high",
  "confidence": 0.82,
  "expectedBenefit": "string",
  "reasonSummary": "string"
}
```

计划或重规划必须记录结构化 `decisionRecord`：

```json
{
  "intent": "string",
  "selectedGraph": "knowledge | card | study | summary",
  "inputArtifactRefs": ["string"],
  "expectedArtifactType": "answer | evidence | card_candidate | formal_card_write | learning_advice | study_schedule_write | trace",
  "selfEval": {},
  "policyCheck": {
    "status": "passed | rejected",
    "blockingReasons": ["string"]
  },
  "stopCondition": "string",
  "reasonSummary": "string"
}
```

规则：

- `decisionRecord` 不保存 chain-of-thought。
- policy check 拒绝后，允许 LLM 重写计划，但必须消耗 `maxReplans`。
- 重写后仍失败时，保留已完成 artifact，输出 `blocked_by_policy`、`quality_gate_failed` 或 `budget_exceeded`。
- Supervisor 可以把风险调高、把结果降级为部分成功，但不能把未通过质量门槛的 artifact 升级为可用。

## 5. Runtime Contracts

### 5.1 Entrypoints

当前入口状态：

- `/workflows/knowledge-qa` 已存在，内部收敛到 `langgraph_rag`。
- 现有制卡入口已收敛到 CardGraph。
- `/workflows/agent-task` 已实现，是复合学习任务入口。

目标 `agent-task` 输入：

```json
{
  "runId": "string",
  "taskType": "compound_study_task",
  "userRequest": "string",
  "documentIds": ["string"],
  "cardGroupIds": ["string"],
  "options": {
    "allowFormalCardWrite": true,
    "allowStudyScheduleWrite": false,
    "dryRun": false
  }
}
```

目标输出：

```json
{
  "runtime": "langgraph_multi_agent",
  "status": "completed | partial | failed",
  "summary": "string",
  "artifactRefs": {
    "evidence": ["artifact-id"],
    "answer": ["artifact-id"],
    "card_candidate": ["artifact-id"],
    "formal_card_write": ["artifact-id"],
    "learning_advice": ["artifact-id"],
    "study_schedule_write": ["artifact-id"],
    "trace": ["artifact-id"]
  },
  "qualityEnvelope": {},
  "errorCategory": "string | null"
}
```

### 5.2 Artifact Contract

Agent 之间只传 artifact refs、摘要、质量分数和 error category。

最小 artifact 类型：

```text
evidence
answer
card_candidate
formal_card_write
learning_advice
study_schedule_write
trace
```

公共字段：

```json
{
  "artifactId": "string",
  "artifactType": "evidence | answer | card_candidate | formal_card_write | learning_advice | study_schedule_write | trace",
  "schemaVersion": 1,
  "summary": "string",
  "sourceRefs": ["string"],
  "qualityEnvelope": {},
  "errorCategory": "string | null",
  "createdBy": "langgraph_rag | langgraph_card | langgraph_study | langgraph_multi_agent"
}
```

禁止保存：

- 完整 prompt。
- chain-of-thought。
- API key。
- 未裁剪长正文。
- 完整长对话历史。
- 未脱敏 provider response。

### 5.3 Quality Contract

所有 graph 输出 artifact 都必须带统一 `QualityEnvelope`。子图负责产出初始质量字段，公共 quality gate 负责标准化和校验。Supervisor 只能降级质量判断，不能把未通过审计或质量门槛的结果升级为可用。

第一版 `QualityEnvelope`：

```json
{
  "groundingStatus": "grounded | partially_grounded | ungrounded | not_applicable",
  "auditStatus": "passed | failed | skipped | not_applicable",
  "confidence": 0.82,
  "riskLevel": "low | medium | high",
  "reviewRequired": false,
  "blockingReasons": ["string"]
}
```

字段语义：

- `groundingStatus`：结果是否有可追溯 evidence。
- `auditStatus`：citation/source quote/写入前检查是否通过。
- `confidence`：子图对结果质量的归一化置信度。
- `riskLevel`：该 artifact 继续进入后续步骤或写入的风险等级。
- `reviewRequired`：是否建议用户或更高层流程审核。
- `blockingReasons`：阻断继续执行或写入的稳定原因。

按 artifact 类型应用质量门槛：

| Artifact | 最低门槛 | 失败处理 |
| --- | --- | --- |
| `answer` | `groundingStatus=grounded` 且 citation audit 通过 | 拒答或输出诊断 artifact |
| `evidence` | source refs 可追踪，risk 不为 high | 阻断 CardGraph 正式成卡 |
| `card_candidate` | source quote audit 通过，dedupe 完成 | 不进入候选池 |
| `formal_card_write` | quote audit、quality gate、dedupe、幂等键全部通过 | 阻断正式成卡 |
| `learning_advice` | 标明依据类型和置信度，不作为 citation source | 降级为诊断摘要 |
| `study_schedule_write` | low risk、dry-run 可用、幂等通过、可回滚 | 阻断调度写入 |

质量失败规则：

- 高风险写入必须被阻断。
- Supervisor 不得用自评覆盖子图 audit failure。
- 缺失 `QualityEnvelope` 视为 `riskLevel=high`。
- 字段不合法时记录 `quality_envelope_invalid`。
- gate 失败时记录 `quality_gate_failed` 并输出部分成功。

### 5.4 Caller Names

目标 caller 命名：

```text
langgraph_rag
langgraph_card
langgraph_study
langgraph_multi_agent
```

迁移规则：

- `knowledge_qa_agent` -> `langgraph_rag`
- `card_generation_agent` -> `langgraph_card`
- `study_agent` -> `langgraph_study`
- `router` / `supervisor` -> `langgraph_multi_agent`

caller 不在 `allowed_callers` 时，必须拒绝并记录 `caller_not_allowed`。

### 5.5 Permission Matrix

| Caller | 可调用 | 不可调用 | 允许副作用 |
| --- | --- | --- | --- |
| `langgraph_rag` | RAG retrieval、rerank、pack、answer、citation audit、trace | card write、study schedule write | `none`、`event_only`、`checkpoint_only` |
| `langgraph_card` | card evidence load、candidate generation、quote audit、dedupe、card write via Host Gateway | QA citation、study schedule write | `none`、`candidate_only`、`persistent_via_rust`、`event_only` |
| `langgraph_study` | review summary、weak topic detection、learning advice、v2 schedule write via Host Gateway | QA citation、direct card write | `none`、`event_only`、`checkpoint_only`、`persistent_via_rust` |
| `langgraph_multi_agent` | planning、routing、context trimming、artifact summary、event/checkpoint | answer writer、card content writer、learning advice writer、direct SQLite | `event_only`、`checkpoint_only` |

`persistent_via_rust` 只表示允许请求 Host Gateway，不表示 Python 可以直接写 SQLite。

### 5.6 Event And Checkpoint

workflow event payload 只保存摘要：

```text
runtime
role
stepKey
toolKey
inputSummary
outputSummary
decisionSummary
routePlan
planRevision
decisionRecord
errorCategory
durationMs
artifactRefs
fallbackTarget
```

checkpoint 只保存：

- graph version。
- current role。
- current step。
- task plan summary。
- route plan。
- plan revision summary。
- decision records。
- resumable state summary。
- artifact refs。
- quality envelopes。
- budget counters。
- fallback target。
- diagnostics summary。

checkpoint 不保存完整 messages、prompt、chain-of-thought、API key 或未裁剪正文。

### 5.7 Failure And Partial Success

组合任务允许部分成功。

规则：

- KnowledgeGraph 失败：返回 `no_relevant_content` 或诊断 artifact；旧 deterministic 只作为迁移期紧急回退。
- CardGraph 失败：保留 answer / evidence artifact，标记 card generation failed。
- StudyGraph v1 失败：跳过 learning advice，不影响 QA 或 Card 结果。
- StudyGraph v2 写入失败：保留 dry-run / advice artifact，记录 schedule write failed，必须可回滚或撤销。
- Supervisor 超预算：保留已完成 artifact，输出 `budget_exceeded`。
- Trace summary 失败：保留基础 workflow events，输出 `trace_missing`。

稳定错误类别：

```text
tool_not_registered
caller_not_allowed
tool_input_invalid
schema_validation_failed
provider_timeout
provider_auth_error
provider_rate_limited
citation_invalid
source_quote_invalid
quality_gate_failed
dedupe_required
context_budget_exceeded
budget_exceeded
checkpoint_write_failed
checkpoint_resume_failed
artifact_write_failed
study_schedule_write_failed
quality_envelope_invalid
rollback_failed
blocked_by_policy
workflow_cancelled
unknown_error
```

## 6. Migration Runbook

### Step 1: KnowledgeGraph

- 先完成 RAG QA 的真正 LangGraph 化。
- `Knowledge Agent` 只能指向 `KnowledgeGraph`。
- 多 Agent 不引用 `knowledge_qa_agent.py`。
- `knowledge_qa.py` / `knowledge_qa_agent.py` 只保留迁移期 parity 或紧急回退语义。
- 只有 `rag-langgraph-migration.md` 的 Contract、Artifact And Quality、Graph Runtime、RAG Quality Boundary、Lightweight Compatibility Parity 验收通过后，才能进入 Supervisor 对 KnowledgeGraph 的正式集成。

### Step 2: CardGraph

- 将 `CardGenerationAgentRunner` 的线性工具链迁入 CardGraph。
- 将 card tools 的 `allowed_callers` 迁移到 `langgraph_card`。
- 明确 candidate write 与 formal card write。
- 正式成卡写入必须具备幂等、审计、回滚。
- 旧 runner 不再新增业务编排。

### Step 3: StudyGraph

- 先实现 v1，只输出 learning advice 和补卡建议。
- v1 不调用 `submit_review_candidates`。
- v2 再启用直接调度状态写入。
- v2 必须具备开关、dry-run、幂等、审计、回滚和验收。

### Step 4: Intelligent Supervisor

- 新增 `langgraph_multi_agent` runtime。
- 目标入口是 `/workflows/agent-task`。
- 实现任务理解、计划、路由、上下文裁剪、受控重规划。
- 接入 KnowledgeGraph、CardGraph、StudyGraph。
- 输出 orchestration summary 和 artifact refs。
- 不直接生成业务内容。

## 7. UI Contract

UI 只需要最小展示契约，不在本文展开页面设计。

默认展示：

- 是否进入 multi-agent。
- Supervisor 当前阶段。
- role chain 摘要。
- route plan。
- plan revision 摘要。
- 部分成功状态。
- artifact summary。
- 失败原因。
- fallback 状态。
- 自动写入结果和撤销入口。

开发诊断可见：

- role event chain。
- tool input/output summary。
- artifact refs。
- quality score summary。
- error category。
- budget counters。

UI 不展示：

- chain-of-thought。
- prompt 原文。
- API key。
- 未裁剪长正文。

## 8. Acceptance Tests

### Consistency

- 文档不再使用 `P05/P06/P07` 作为当前阶段路线。
- `Knowledge Agent` 不再指向 `knowledge_qa_agent.py`。
- `knowledge_qa.py` 不再被描述为长期 deterministic fallback。
- `/workflows/agent-task` 被明确标记为已落地的复合学习任务入口。
- 普通 QA 不触发 multi-agent。
- 普通制卡不触发 multi-agent。

### Supervisor

- 复合学习任务触发 Intelligent Supervisor。
- Supervisor 可生成 task plan。
- Supervisor 可根据子图结果重规划。
- Supervisor 受 `maxPlanSteps=6`、`maxSubgraphCalls=5`、`maxReplans=2` 限制。
- Supervisor 只汇总 artifact 摘要，不生成 answer、citation、card、learning advice。
- Supervisor 计划必须经过 self evaluation 和 policy check。
- policy check 拒绝后，LLM 可重写计划但必须消耗重规划预算。
- 每次计划和重规划都记录 `decisionRecord`，不记录 chain-of-thought。
- Supervisor 不能把未通过质量门槛的 artifact 升级为可用。
- 超预算时输出 `budget_exceeded` 并保留已完成 artifact。

### CardGraph

- 每张卡都有可验证 source quote。
- source quote 无效不得写入候选卡或正式卡。
- quality gate 失败不得正式成卡。
- duplicate 未处理不得正式成卡。
- 正式成卡写入必须有幂等键、审计事件和回滚/撤销语义。
- `formal_card_write` 缺少有效 `QualityEnvelope` 时必须阻断。
- Python 不直接写 cards 表。

### StudyGraph

- v1 不调用 `submit_review_candidates`。
- v1 不写复习调度状态。
- v1 不写长期记忆。
- v2 写复习调度状态必须经过开关、dry-run、幂等、审计、回滚。
- v2 写入失败必须保留诊断 artifact。
- `study_schedule_write` 的 `riskLevel=high` 或缺少 dry-run / rollback 时必须阻断。

### QualityEnvelope

- 每个 artifact 都必须包含 `qualityEnvelope`。
- answer 缺 citation audit 时不可用。
- card source quote invalid 时阻断候选或正式写入。
- formal card write 缺幂等键时阻断。
- study schedule write 高风险时阻断。
- Supervisor 只能把风险调高，不能把失败结果调成通过。

### Supervisor Golden Tasks

- 普通 QA 不进入 Supervisor。
- 普通制卡不进入 Supervisor。
- 复合任务生成合理 route plan。
- 子图失败后输出部分成功。
- 低质量 evidence 阻断 CardGraph 正式成卡。
- Study v2 写入缺少 dry-run / rollback 时被阻断。
- LLM 计划越权时被 policy check 拒绝并重写。
- 重写超过预算后输出 `budget_exceeded`。

### Security And Privacy

- event/checkpoint/artifact 不保存完整 prompt。
- event/checkpoint/artifact 不保存 chain-of-thought。
- event/checkpoint/artifact 不保存 API key。
- event/checkpoint/artifact 不保存未裁剪长正文。
- caller 不在 `allowed_callers` 时返回 `caller_not_allowed`。
- Python / LangGraph 不直接写 SQLite。

## 9. References

- [RAG 问答 LangGraph 化改造文档](./rag-langgraph-migration.md)
- LangGraph Overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph Graph API: https://docs.langchain.com/oss/python/langgraph/graph-api
- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
