# Phase 01: KnowledgeGraph Runtime

## Goal

让 `/workflows/knowledge-qa` 能以 `langgraph_rag` runtime 返回兼容 payload。目标是 runtime 形态正确，不追求一次性替换全部 RAG 细节。

## Inputs

- Phase 00 已冻结契约。
- `docs/rag/rag-langchain-langgraph-refactor.md` 的 Target Architecture 与 KnowledgeGraph Contract。
- 现有 `knowledge_qa.py`、`knowledge_qa_agent.py`、`agent/graph.py`、`qa_tools.py`。

## Implementation Scope

- 建立目标 graph 结构：

```text
orchestration_service/
  graphs/
    knowledge_graph.py
    knowledge_nodes.py
    knowledge_state.py
    knowledge_events.py
```

- 定义 `KnowledgeGraphState`、graph version、runtime 常量。
- 接入 `/workflows/knowledge-qa`，保持外部 endpoint 不变。
- 返回 `runtime=langgraph_rag`、`graphVersion`、`fallbackUsed`、可选 `artifactRefs`。
- LangGraph 依赖作为正式依赖；缺失应在启动或测试阶段暴露。

## Out Of Scope

- 不完成全部 retrieval / rerank / audit 节点迁移。
- 不把旧 `AgentQaRunner` 包成单节点 graph 后宣称完成。
- 不接入 CardGraph、StudyGraph 或 Supervisor。
- 不删除旧 runner。

## Interfaces

`/workflows/knowledge-qa` 入口不变。返回 payload 必须兼容旧前端和 Rust 解析，并允许新增：

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

## Discovery Checklist

- 读取 `xuejian/orchestration_service/server.py`，定位 `/workflows/knowledge-qa` 路由和 runner 调用。
- 读取 `xuejian/src-tauri/src/commands/knowledge.rs`，定位 Rust 调 Python endpoint 和 payload 解析。
- 读取 `xuejian/orchestration_service/agent/graph.py` 和 `xuejian/orchestration_service/agent/langgraph_qa_runner.py`，确认当前单节点 wrapper 行为。
- 读取 `xuejian/orchestration_service/requirements.txt` 和 `requirements-optional.txt`，确认 `langgraph` 依赖位置。
- 读取 `xuejian/tests/unit/test_knowledge_qa_agent.py`、`test_knowledge_qa.py`，确认现有 QA 测试入口。

## Implementation Checklist

- 新建 graph shell、state、events 文件，先让 `KnowledgeGraphState` 和 compile 形态成立。
- 将 `runtime=langgraph_rag`、`graphVersion`、`fallbackUsed` 接入返回 payload。
- 保持 `/workflows/knowledge-qa` endpoint 不变。
- 保持旧前端和 Rust 必需字段不变。
- 将 `langgraph` 作为正式依赖检查项，不在请求时静默降级。
- 保留迁移期 emergency fallback 标记，但不把它写成长期并列 runtime。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_knowledge_qa_agent.py
pytest xuejian/tests/unit/test_orchestration_server_ragas_eval.py
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-result.test.ts tests/unit/knowledge-qa-page.test.tsx
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
```

## Do Not Proceed If

- `/workflows/knowledge-qa` payload 破坏现有字段。
- `runtime=langgraph_rag` 无法出现在成功响应或诊断响应中。
- 新 graph 仍只是单节点调用旧 runner。
- `langgraph not available` 被当作正常生产路径。

## Acceptance Tests

- 普通 QA 请求仍能返回兼容 payload。
- `runtime` 可识别为 `langgraph_rag`。
- `agent/graph.py` 单节点 wrapper 不作为验收依据。
- `langgraph not available` 不再是正常生产路径。
- Python 不直接写 SQLite。

## Exit Criteria

KnowledgeGraph runtime 形态稳定后进入 Phase 2。Phase 2 才开始系统迁移中粒度 RAG 节点。
