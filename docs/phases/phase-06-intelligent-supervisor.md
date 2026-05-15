# Phase 06: Intelligent Supervisor

## Goal

实现 Intelligent Supervisor Graph 和 `/workflows/agent-task`，只处理复合学习任务，组织 KnowledgeGraph、CardGraph、StudyGraph 的已验收能力。

## Inputs

- Phase 03 已通过 KnowledgeGraph 验收。
- Phase 04 已完成 CardGraph。
- Phase 05 已完成 StudyGraph v1。
- `multi-agent-development-guide.md` 的 Supervisor Control Contract 和 Runtime Contracts。

## Implementation Scope

- 新增目标入口 `/workflows/agent-task`。
- 实现 task understanding、task plan、route plan、context trimming、subgraph execution、observe、replan、orchestration summary。
- 使用受控循环：

```text
plan -> self-evaluate -> policy-check -> execute -> observe -> replan
```

- 固定预算：

```text
maxPlanSteps = 6
maxSubgraphCalls = 5
maxReplans = 2
```

- 记录 `decisionRecord`，但不保存 chain-of-thought。

## Out Of Scope

- 不接管普通 QA。
- 不接管普通制卡。
- Supervisor 不生成 answer、citation、card candidate、learning advice。
- Supervisor 不直接写 SQLite。
- 不调用 `knowledge_qa.py` / `knowledge_qa_agent.py` 作为 KnowledgeGraph 入口。

## Interfaces

`/workflows/agent-task` 输出：

```text
runtime = langgraph_multi_agent
status
summary
artifactRefs
qualityEnvelope
errorCategory
```

`artifactRefs` 使用按类型分组对象映射。

## Discovery Checklist

- 读取 `xuejian/orchestration_service/server.py`，确认新增 `/workflows/agent-task` 的路由位置。
- 读取 `xuejian/orchestration_service/tools/registry.py`，确认 `allowed_callers` 和错误分类。
- 读取 `xuejian/orchestration_service/clients/host_gateway.py`，确认 Host Gateway 可承载 event/checkpoint 和业务写入边界。
- 读取 `xuejian/src-tauri/src/db/workflow_repo.rs` 和 migrations 中 `workflow_events` / `workflow_checkpoints` 表结构。
- 确认 Phase 03、04、05 的 artifact 和质量门槛已经通过验收。

## Implementation Checklist

- 新增 `/workflows/agent-task` endpoint shell。
- 新建 Supervisor state、plan model、decisionRecord、budget counters。
- 实现 `plan -> self-evaluate -> policy-check -> execute -> observe -> replan`。
- 固定 `maxPlanSteps=6`、`maxSubgraphCalls=5`、`maxReplans=2`。
- 实现普通 QA / 普通制卡的绕行规则，不进入 Supervisor。
- 只汇总子图 artifact 摘要、质量状态、错误类别和执行结果。
- 将越权计划、质量失败、预算耗尽映射为稳定 error category。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_supervisor_graph.py xuejian/tests/unit/test_supervisor_policy.py xuejian/tests/unit/test_orchestration_server_agent_task.py
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_card_tools.py xuejian/tests/unit/test_study_tools.py
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
rg "maxPlanSteps|maxSubgraphCalls|maxReplans|decisionRecord|budget_exceeded|langgraph_multi_agent" docs xuejian/orchestration_service
```

## Do Not Proceed If

- 普通 QA 进入 Supervisor。
- 普通制卡进入 Supervisor。
- Supervisor 生成 answer、citation、card candidate 或 learning advice。
- policy check 可以被 LLM 自评绕过。
- event/checkpoint 保存 prompt、chain-of-thought、API key 或未裁剪长正文。

## Acceptance Tests

- 普通 QA 不进入 Supervisor。
- 普通制卡不进入 Supervisor。
- 复合任务生成合理 route plan。
- 子图失败后输出部分成功。
- LLM 计划越权时被 policy check 拒绝并消耗 replan 预算。
- 重写超过预算后输出 `budget_exceeded`。
- Supervisor 不能把未通过质量门槛的 artifact 升级为可用。
- event/checkpoint 不保存 prompt、chain-of-thought、API key 或未裁剪长正文。

## Exit Criteria

Supervisor 能稳定处理复合学习任务后进入 Phase 7。左侧 Agent 面板只能绑定到本阶段通过验收后的入口。
