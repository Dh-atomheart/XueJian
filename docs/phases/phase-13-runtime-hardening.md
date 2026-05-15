# Phase 13: Runtime Hardening

## Goal

对 RAG Graph、多 Agent Graph、artifact store 和 Agent Panel 做生产化硬化，覆盖取消、超时、重试、预算、provider fallback、隐私过滤、运行监控和错误分类。

## Inputs

- Phase 00-12 全部通过。
- workflow events / checkpoints。
- artifact store。
- evaluation regression report。

## Implementation Scope

- 统一 timeout、retry、cancellation、budget 策略。
- 统一 provider fallback 和 cost tracking。
- 统一 error taxonomy。
- 增加 privacy redaction audit。
- 增加运行监控：latency、token/cost、failure rate、quality gate failure rate。
- 增加清理策略：过期 artifact、失败 checkpoint、取消任务残留。

## Out Of Scope

- 不改变业务质量门槛。
- 不新增绕过 Host Gateway 的写入路径。
- 不把监控数据变成用户隐私泄露点。

## Interfaces

运行时诊断最小字段：

```text
runtime
graphVersion
durationMs
tokenEstimate
costEstimate
errorCategory
qualityGateStatus
fallbackUsed
redactionStatus
```

## Runtime Defaults

默认策略固定为：

```text
nodeTimeoutMs = 60000
graphTimeoutMs = 300000
providerRetries = 2
retryBackoffMs = 1000, 3000
maxPlanSteps = 6
maxSubgraphCalls = 5
maxReplans = 2
maxArtifactSummaryChars = 1000
maxSelectedTextPreviewChars = 500
```

重试只允许用于 transient provider/network error。以下错误不得重试：

```text
quality_gate_failed
blocked_by_policy
caller_not_allowed
citation_audit_failed
source_quote_invalid
privacy_redaction_failed
```

## Monitoring Decisions

必须记录但不保存敏感正文：

```text
runtime
graphVersion
nodeKey
durationMs
retryCount
fallbackUsed
errorCategory
qualityGateStatus
redactionStatus
artifactCount
```

## Discovery Checklist

- 读取所有 Graph 的 event/checkpoint 输出。
- 读取 provider runtime 和 LiteLLM adapter。
- 读取 Host Gateway 和 workflow repo 的错误处理。
- 读取 evaluation report 中的高频失败类型。
- 读取 Agent Panel 的错误和取消展示。

## Implementation Checklist

- 给所有长任务接入 cancellation。
- 给外部 provider 调用接入 timeout 和 retry。
- 给 graph run 接入 budget counter 和 cost estimate。
- 统一 error category 常量。
- 给 event/checkpoint/artifact 增加 redaction 检查。
- 增加失败清理和可观测指标。
- 所有 provider 调用包装统一 timeout/retry helper。
- 所有 event/checkpoint/artifact 写入前统一调用 redaction validator。
- budget 超限时立即停止后续子图调用并记录 `budget_exceeded`。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_card_tools.py xuejian/tests/unit/test_study_tools.py
python scripts/ci/python_orchestration_smoke.py
cd xuejian; npm.cmd run build
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
rg "timeout|retry|cancel|budget|redaction|fallbackUsed|errorCategory" docs xuejian
```

## Do Not Proceed If

- 取消任务后仍继续写业务数据。
- provider timeout 没有稳定错误类别。
- event/checkpoint/artifact 泄露 prompt、chain-of-thought、API key 或未裁剪正文。
- budget 超限后仍继续调用子图或模型。
- fallback 行为无法在 trace 中解释。
- 不可重试错误仍被 retry。

## Acceptance Tests

- cancellation 可停止长任务且不继续写入。
- timeout / retry 有稳定 error category。
- cost / token / duration 诊断可见。
- privacy redaction audit 能阻断敏感字段。
- artifact 和 checkpoint 清理不破坏已完成任务追溯。
- evaluation report 无核心质量回归。

## Exit Criteria

运行时硬化完成后，系统具备进入持续迭代和生产验收的基础。
