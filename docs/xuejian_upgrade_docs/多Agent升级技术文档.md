# XueJian 多 Agent 升级技术文档

> 本文定义 v5-v7 的 Agent 化与多 Agent 升级。多 Agent 不是起点，而是 RAG Graph、Card Graph、Study Graph 稳定后的组合层。目标是少角色、强边界、可回退。

## 0. 阅读方式

- 只想知道架构：读「1. 总体形态」。
- 准备开发 Card Graph：读「3. Card Graph」。
- 准备开发 Study Graph：读「4. Study Graph」。
- 准备开发 Multi-Agent：读「5. Multi-Agent Orchestrator」。

## 1. 总体形态

多 Agent 最终形态：

```text
Router / Supervisor
  -> Knowledge Agent = RAG Graph
  -> Card Agent = Card Graph
  -> Learning Agent = Study Graph
  -> Trace Reporter = Summary Builder
```

核心原则：

- 每个 Agent 是一个受控 LangGraph subgraph。
- Agent 之间传 artifact refs 和摘要，不传完整正文。
- Router 只路由，不直接生成答案或卡片。
- 业务写入仍经 Rust/Host Gateway。
- 普通任务不走 multi-agent。

## 2. 版本分解

### V5：Card Graph

目标：把 AI 制卡升级为候选制卡流程。

只新增：

1. `card_graph.py`。
2. 候选卡存储或 artifact。

### V6：Study Graph

目标：基于复习反馈生成弱点诊断和补卡建议。

只新增：

1. `study_graph.py`。
2. 弱点主题摘要。

### V7：Multi-Agent Orchestrator

目标：组合 RAG、Card、Study 三个 graph。

只新增：

1. `multi_agent_graph.py`。
2. `router.py`。

## 3. Card Graph

### 3.1 目标

Card Graph 负责从可信来源生成候选卡，不直接写正式卡片。

输入：

```json
{
  "runId": "string",
  "documentIds": ["string"],
  "sourceChunkIds": ["string"],
  "cardCountHint": 10,
  "difficulty": "basic | normal | advanced"
}
```

输出：

```json
{
  "status": "completed | failed",
  "cardCandidateArtifactId": "string",
  "qualitySummary": {}
}
```

### 3.2 CardState

```python
class CardState(TypedDict):
    run_id: str
    graph_version: str
    document_ids: list[str]
    source_chunk_ids: list[str]

    source_evidence: list[dict]
    coverage_plan: list[dict]
    raw_candidates: list[dict]
    audited_candidates: list[dict]
    critiqued_candidates: list[dict]
    deduped_candidates: list[dict]

    candidate_artifact_id: str | None
    quality_summary: dict
    error_category: str | None
```

### 3.3 节点

```text
START
 -> load_source_evidence
 -> build_coverage_plan
 -> generate_candidates
 -> audit_source_quotes
 -> critique_candidates
 -> dedupe_candidates
 -> submit_candidates
 -> END
```

### 3.4 节点职责

#### `load_source_evidence`

- 读取 chunks。
- 不允许读取任意文件。
- 优先使用 RAG Graph 输出的 evidence artifact。

#### `build_coverage_plan`

- 从 chunks 中识别概念、定义、机制、对比、公式、例子。
- 只输出覆盖计划，不生成卡片。

#### `generate_candidates`

- 使用结构化输出。
- 候选卡必须包含 front、back、sourceChunkId、sourceQuote、confidence。

#### `audit_source_quotes`

- 校验 sourceQuote 是否来自 sourceChunk。
- 失败则丢弃候选或标记不可入库。

#### `critique_candidates`

检查：

- 是否一题一知识点。
- front 是否自包含。
- back 是否解释充分。
- 是否机械复制原文。
- 是否过宽泛。

只保存摘要级 critique。

#### `dedupe_candidates`

- 同一知识点去重。
- 保留来源更清楚、表达更适合复习的版本。

#### `submit_candidates`

- 通过 Host Gateway 提交候选。
- 不直接写正式 cards。

### 3.5 候选卡 schema

```json
{
  "front": "string",
  "back": "string",
  "sourceChunkId": "string",
  "sourceQuote": "string",
  "confidence": 0.85,
  "tags": ["string"],
  "qualityFlags": ["too_broad | duplicate | quote_invalid | low_value"]
}
```

### 3.6 验收

- 生成的每张卡都有可校验 source quote。
- source quote 无效的卡不能进入候选池。
- 去重结果有摘要原因。
- 图失败时不产生正式卡片写入。

## 4. Study Graph

### 4.1 目标

Study Graph 基于复习行为输出轻量学习诊断，不直接修改复习计划。

输入：

```json
{
  "runId": "string",
  "cardGroupIds": ["string"],
  "since": "ISO-8601",
  "options": {
    "allowCardGapSuggestion": true
  }
}
```

输出：

```json
{
  "status": "completed | failed",
  "learningAdviceArtifactId": "string"
}
```

### 4.2 StudyState

```python
class StudyState(TypedDict):
    run_id: str
    graph_version: str
    card_group_ids: list[str]
    review_events_summary: dict

    weak_topics: list[dict]
    card_gap_suggestions: list[dict]
    learning_advice_artifact_id: str | None
    error_category: str | None
```

### 4.3 节点

```text
START
 -> load_review_summary
 -> detect_weak_topics
 -> suggest_card_gaps
 -> build_learning_advice
 -> END
```

### 4.4 规则

- 不自动改复习队列。
- 不自动写长期记忆。
- 不作为事实 citation source。
- 建议可以触发 Card Graph，但必须经过候选流程。

### 4.5 learning advice schema

```json
{
  "weakTopics": [
    {
      "topic": "string",
      "evidence": "review_history | repeated_failure | low_rating",
      "confidence": 0.75
    }
  ],
  "suggestedActions": [
    {
      "type": "review_focus | create_cards | revisit_document",
      "summary": "string"
    }
  ]
}
```

### 4.6 验收

- 能识别重复失败的主题。
- 能输出补卡建议。
- 失败不影响复习主流程。
- 不产生自动调度写入。

## 5. Multi-Agent Orchestrator

### 5.1 目标

Multi-Agent Orchestrator 只处理复合学习任务。

示例：

```text
“根据这几篇 PDF 解释重点，帮我生成复习卡，并指出我最近薄弱的相关知识点。”
```

不处理：

- 单轮普通问答。
- 普通制卡。
- 普通复习队列生成。

### 5.2 MultiAgentState

```python
class MultiAgentState(TypedDict):
    run_id: str
    graph_version: str
    user_request: str
    document_ids: list[str]
    card_group_ids: list[str]

    route_plan: list[str]
    answer_artifact_id: str | None
    evidence_artifact_id: str | None
    card_candidate_artifact_ids: list[str]
    learning_advice_artifact_id: str | None
    trace_artifact_id: str | None

    diagnostics: dict
    error_category: str | None
    fallback_used: bool
```

### 5.3 Router 输出

```json
{
  "route": ["knowledge_agent", "card_agent"],
  "reasonSummary": "用户请求包含资料解释与候选制卡",
  "fallbackTarget": "knowledge_qa"
}
```

Router 不得输出：

- 最终 answer。
- card candidate。
- learning advice。
- citation。

### 5.4 Orchestrator Graph

```text
START
 -> classify_task
 -> route
 -> run_knowledge_agent?
 -> run_card_agent?
 -> run_learning_agent?
 -> build_trace_report
 -> END
```

条件规则：

```text
普通 QA -> 不进入 multi_agent，直接 rag_graph
普通制卡 -> 不进入 multi_agent，直接 card_graph
复合任务 -> multi_agent_graph
```

### 5.5 Agent 权限

| Agent | 可调用 | 不可调用 |
| --- | --- | --- |
| Router | route tools, event tools | answer writer, card submit |
| Knowledge Agent | RAG tools | card persistence, review schedule |
| Card Agent | card tools, source quote audit | QA citation writer, review schedule |
| Learning Agent | review summary, learning advice | card persistence, QA citation |
| Trace Reporter | event summary | planning, business write |

### 5.6 Fallback

```text
Knowledge Agent 失败 -> fallback deterministic knowledge_qa 或 no_relevant_content
Card Agent 失败 -> 返回 answer，标记 card generation failed
Learning Agent 失败 -> 跳过 learning advice
Trace Reporter 失败 -> 返回基础结果，标记 trace_missing
```

规则：

- 已完成的安全 artifact 可以保留。
- 失败的候选卡不得部分入正式 cards。
- fallback 需写 event。

## 6. LangGraph 使用方式

### 6.1 推荐模式

- 每个业务图使用 `StateGraph`。
- 节点是普通 Python 函数或 async 函数。
- 条件边控制 retry / reject / fallback。
- 结构化输出使用 Pydantic schema。
- 开发期 `InMemorySaver`。
- 生产期 `HostGatewayCheckpointer`。

### 6.2 不推荐模式

- 不使用无限 ReAct loop。
- 不让 LLM 自由选择未注册工具。
- 不把完整 messages 存 checkpoint。
- 不使用 Agent 自动创建子 Agent。
- 不让 LangGraph 自己持有业务数据库。

## 7. 文件结构建议

V5：

```text
orchestration_service/
  graphs/card_graph.py
  card_agent/source_mapping.py
  card_agent/generator.py
  card_agent/critic.py
  card_agent/dedupe.py
```

V6：

```text
  graphs/study_graph.py
  study_agent/review_analyzer.py
  study_agent/weak_topic_detector.py
```

V7：

```text
  graphs/multi_agent_graph.py
  agents/router.py
  agents/trace_reporter.py
```

## 8. 测试与验收

### V5 Card Graph

- candidate schema 校验。
- quote audit 测试。
- dedupe 测试。
- 不部分写入测试。

### V6 Study Graph

- 弱点识别测试。
- 空复习数据测试。
- 建议不写库测试。

### V7 Multi-Agent

- 普通任务不触发 multi-agent。
- 复合任务触发 route。
- Router 不生成业务结果。
- 子图失败 fallback。
- event chain 可追踪。

## 9. 参考资料

- LangGraph Overview: https://docs.langchain.com/oss/python/langgraph/overview
- LangGraph Graph API: https://docs.langchain.com/oss/python/langgraph/graph-api
- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangChain Agents: https://docs.langchain.com/oss/python/langchain/agents
- LangChain Structured Output: https://docs.langchain.com/oss/python/langchain/structured-output
- SuperMew LangChain Agent System: https://deepwiki.com/icey1287/SuperMew/6-langchain-agent-system
