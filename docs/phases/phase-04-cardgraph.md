# Phase 04: CardGraph

## Goal

将制卡能力从 `CardGenerationAgentRunner` 迁移为 CardGraph，支持从可信 evidence 生成候选卡，并在满足质量门槛时自动创建正式卡。

## Inputs

- Phase 03 已通过，可信 `evidence` artifact 可用。
- `multi-agent-development-guide.md` 的 CardGraph 契约。
- 现有 `card_generation_agent.py` 和 `card_tools.py`。

## Implementation Scope

目标流程：

```text
load_source_evidence
 -> build_coverage_plan
 -> generate_candidates
 -> audit_source_quotes
 -> critique_candidates
 -> dedupe_candidates
 -> submit_or_create_cards
```

- 输入优先使用 `evidenceArtifactRefs`。
- 区分 candidate write 与 formal card write。
- 正式成卡必须通过 source quote audit、quality gate、dedupe、幂等键、审计事件和回滚/撤销语义。
- card tools 的 caller 迁移到 `langgraph_card`。

## Out Of Scope

- 不让 CardGraph 消费 high-risk evidence 创建正式卡。
- 不绕过 Host Gateway 直接写 cards 表。
- 不让 Supervisor 生成 card candidate。
- 不改 StudyGraph 调度状态。

## Interfaces

CardGraph 输入包含：

```text
runId
documentIds
sourceChunkIds
evidenceArtifactRefs
cardCountHint
difficulty
writeMode
```

输出包含 card artifact refs、created card ids、`qualityEnvelope` 和 `errorCategory`。

## Discovery Checklist

- 读取 `xuejian/orchestration_service/workflows/card_generation_agent.py`，确认 `CardGenerationAgentRunner` 当前线性流程。
- 读取 `xuejian/orchestration_service/tools/card_tools.py`，确认 content map、candidate、quote audit、critique、dedupe、submit 工具。
- 读取 `xuejian/tests/unit/test_card_tools.py`，确认现有制卡工具验收。
- 读取 `xuejian/orchestration_service/server.py` 中 card runner 调用点。
- 检查 Host Gateway 写卡路径，确认 Python 不直接写 SQLite。

## Implementation Checklist

- 新建 CardGraph shell 和 state，不继续扩展手写 runner。
- 先迁移 candidate write 路径，再迁移 formal card write。
- 输入优先消费 Phase 3 的可信 `evidenceArtifactRefs`。
- 在正式成卡前串联 quote audit、quality gate、dedupe、幂等键、审计事件。
- 为失败写入稳定 `errorCategory`，并保留可回滚/撤销语义。
- 将 card tools caller 迁移到 `langgraph_card`。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_card_tools.py
pytest xuejian/tests/unit/test_knowledge_qa.py
rg "CardGenerationAgentRunner|langgraph_card|source quote|dedupe" docs docs/phases xuejian/orchestration_service
```

## Do Not Proceed If

- high-risk evidence 可以创建正式卡。
- source quote invalid 仍能写入候选卡或正式卡。
- duplicate 未处理仍可正式成卡。
- formal card write 缺少幂等键、审计事件或回滚/撤销语义。
- Python / LangGraph 直接写 cards 表。

## Acceptance Tests

- 每张卡都有可验证 source quote。
- source quote 无效不得写入候选卡或正式卡。
- quality gate 失败不得正式成卡。
- duplicate 未处理不得正式成卡。
- 正式成卡写入必须有幂等键、审计事件和回滚/撤销语义。
- Python / LangGraph 不直接写 SQLite。

## Exit Criteria

CardGraph 可稳定替代手写制卡 runner 的编排职责后进入 Phase 5。旧 runner 不再新增业务编排。
