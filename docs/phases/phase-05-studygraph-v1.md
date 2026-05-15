# Phase 05: StudyGraph v1

## Goal

实现 StudyGraph v1，提供学习诊断、薄弱主题识别、补卡建议和 learning advice artifact。v1 只建议，不写复习调度状态。

## Inputs

- Phase 04 已完成 CardGraph。
- `multi-agent-development-guide.md` 的 StudyGraph v1 契约。
- 现有 `study_tools.py` 的 review summary / suggestion 能力。

## Implementation Scope

目标流程：

```text
load_review_summary
 -> detect_weak_topics
 -> suggest_card_gaps
 -> build_learning_advice
```

- 输出 `learning_advice` artifact。
- 可以建议 CardGraph 生成补卡。
- 建议必须标明依据类型、置信度和风险。

## Out Of Scope

- 不调用 `submit_review_candidates`。
- 不写复习调度状态。
- 不写长期记忆。
- 不直接创建卡片；补卡必须经过 CardGraph。

## Interfaces

StudyGraph v1 输出：

```text
status
weakTopics
cardGapSuggestions
learningAdviceArtifactRef
qualityEnvelope
errorCategory
```

## Discovery Checklist

- 读取 `xuejian/orchestration_service/tools/study_tools.py`，确认 `submit_review_candidates` 当前能力。
- 读取 `xuejian/tests/unit/test_study_tools.py`，确认现有 study tool 测试。
- 读取 `xuejian/orchestration_service/clients/host_gateway.py` 中 `submit_review_candidates`，确认 v1 禁止调用路径。
- 检查 review summary 数据来源和可用字段。
- 检查 CardGraph 补卡入口，确认补卡建议不会直接写卡。

## Implementation Checklist

- 新建 StudyGraph v1 shell 和 state。
- 实现 review summary 加载、weak topics 检测、card gaps 建议、learning advice 构造。
- 输出 `learning_advice` artifact 和 `QualityEnvelope`。
- 对补卡只输出建议或 CardGraph 输入，不直接创建卡片。
- 确保 v1 不调用 `submit_review_candidates`。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_study_tools.py
rg "submit_review_candidates|learning_advice|study_schedule_write" docs/phases docs/multi-agent-development-guide.md xuejian/orchestration_service
```

## Do Not Proceed If

- StudyGraph v1 调用了 `submit_review_candidates`。
- v1 写复习调度状态或长期记忆。
- learning advice 缺少依据类型、置信度或风险状态。
- 补卡建议绕过 CardGraph 直接创建卡。

## Acceptance Tests

- 能基于 review summary 输出 weak topics。
- 能输出补卡建议，但不直接写卡。
- 能输出 learning advice artifact。
- v1 不写复习调度状态。
- v1 不写长期记忆。
- Python / LangGraph 不直接写 SQLite。

## Exit Criteria

StudyGraph v1 能稳定输出建议 artifact 后进入 Phase 6。StudyGraph v2 写调度状态不属于当前 phase，后续单独规划。
