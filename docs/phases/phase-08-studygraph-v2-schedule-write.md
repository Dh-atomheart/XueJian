# Phase 08: StudyGraph v2 Schedule Write

## Goal

在 StudyGraph v1 建议能力稳定后，增加复习调度状态写入能力。v2 可以自动写入 review candidates 或 schedule state，但必须具备开关、dry-run、幂等、审计、回滚和质量门槛。

## Inputs

- Phase 05 已完成 StudyGraph v1。
- Phase 06 已完成 Supervisor policy check。
- `multi-agent-development-guide.md` 的 StudyGraph v2 契约。
- `xuejian/orchestration_service/tools/study_tools.py` 和 Host Gateway 的 `submit_review_candidates`。

## Implementation Scope

- 新增 StudyGraph v2 runtime 开关，默认关闭或 dry-run。
- 实现 `study_schedule_write` artifact。
- 写入前必须生成 dry-run 结果。
- 写入必须通过 Host Gateway。
- 写入必须带幂等键、审计事件、回滚/撤销语义。
- 高风险或缺少回滚信息时阻断写入。

## Out Of Scope

- 不让 StudyGraph v2 直接写 SQLite。
- 不让 Supervisor 绕过 StudyGraph 直接写复习调度。
- 不把 learning advice 当作 citation source。
- 不修改 CardGraph 正式成卡规则。

## Interfaces

StudyGraph v2 输出：

```text
status
learningAdviceArtifactRef
studyScheduleWriteArtifactRef
dryRunResult
createdReviewCandidateIds
qualityEnvelope
errorCategory
rollbackRef
```

## Data Model Decisions

不新增复习调度核心表；Phase 08 只通过已有 Host Gateway 路由提交 review candidates。若 Rust 侧尚未实现 `/tool-gateway/study/review-candidates`，本 phase 先补该路由，不允许 Python 直接写表。

`study_schedule_write` artifact 最小 payload：

```json
{
  "artifactType": "study_schedule_write",
  "schemaVersion": 1,
  "dryRun": true,
  "idempotencyKey": "study-schedule:{runId}:{topicHash}:{date}",
  "candidateCount": 0,
  "createdReviewCandidateIds": [],
  "rollbackRef": "rollback:{runId}:{artifactId}",
  "qualityEnvelope": {},
  "errorCategory": null
}
```

写入状态固定为：

```text
dry_run_ready -> write_blocked | write_ready -> writing -> written | write_failed -> rolled_back
```

## API Contract Decisions

- Python 调用 `HostGatewayClient.submit_review_candidates(run_id, candidates)`。
- Rust/Host Gateway 路由固定为 `POST /tool-gateway/study/review-candidates`。
- 请求必须包含 `runId`、`candidates`、`idempotencyKey`、`dryRun`。
- `dryRun=true` 只返回将写入内容和风险，不改变业务状态。
- `dryRun=false` 必须携带前一次 dry-run 的 `dryRunRef`。
- 缺少 `rollbackRef`、`idempotencyKey`、`dryRunRef` 时直接返回 `study_schedule_write_failed`。

## Discovery Checklist

- 读取 `xuejian/orchestration_service/tools/study_tools.py`，确认 `submit_review_candidates` 输入输出。
- 读取 `xuejian/tests/unit/test_study_tools.py`，确认 route-not-implemented 和 success 行为。
- 读取 `xuejian/orchestration_service/clients/host_gateway.py`，确认 review candidate 写入路径。
- 读取 Rust 侧 review / schedule 相关 command、repo、migration。
- 确认 Phase 05 的 advice artifact 可以作为 v2 写入依据。

## Implementation Checklist

- 增加 v2 开关和 dry-run 选项。
- 在 StudyGraph state 中加入 dry-run、idempotency、rollback、write summary。
- 先实现 dry-run-only，再启用真实写入。
- 写入前检查 `qualityEnvelope.riskLevel=low` 或明确可接受。
- 将写入结果和失败原因写入 event/checkpoint。
- 将 `submit_review_candidates` 只暴露给 `langgraph_study` 的 v2 写入节点。
- 为 `study_schedule_write` 增加 idempotency key 构造和重复提交测试。
- 为 rollback 采用“按 rollbackRef 撤销本次创建的 review candidates”的语义；如果底层暂不支持撤销，则真实写入必须保持关闭。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_study_tools.py
rg "submit_review_candidates|study_schedule_write|rollback|dry-run|langgraph_study" docs xuejian/orchestration_service
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
```

## Do Not Proceed If

- v2 未开启 dry-run 就直接写入。
- 写入缺少幂等键、审计事件或回滚引用。
- `riskLevel=high` 仍可写入调度状态。
- Python / LangGraph 直接写 SQLite。
- Supervisor 可绕过 StudyGraph v2 写入复习调度。
- Host Gateway 未实现幂等或 rollback 语义时启用了真实写入。

## Acceptance Tests

- dry-run 能返回将要创建或调整的 review candidates。
- 缺少 dry-run 时真实写入被阻断。
- 缺少 rollbackRef 时真实写入被阻断。
- 重复请求不会创建重复 review candidates。
- 写入失败保留 learning advice 和诊断 artifact。
- `study_schedule_write_failed`、`rollback_failed` 等错误类别稳定。

## Exit Criteria

StudyGraph v2 能在受控开关下安全写入复习调度，并能审计、回滚、幂等后，进入 Phase 09。
