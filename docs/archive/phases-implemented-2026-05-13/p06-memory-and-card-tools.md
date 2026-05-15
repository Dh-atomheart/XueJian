# P06 Memory And Card Tools

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 5。目标是在 Single Agent QA 稳定后，逐步开放单会话 memory、制卡工具和学习诊断建议。

## 目标

- 单会话 memory 服务意图理解和多轮衔接。
- 制卡工具复用同一套 child evidence、source quote、citation audit 边界。
- Study Graph 第一版只输出学习建议和补卡线索，不提交复习调度状态。
- 长期 memory 后置，只有在治理机制明确后再引入。

## 前置条件

- P05 已完成。
- 单 Agent 工具 registry、trace、fallback、citation audit 稳定。
- 已阅读 [RAG Context Engineering](../rag-context-engineering.md) 和 [Multi-Agent Development Guide](../multi-agent-development-guide.md)。

## 改动范围

- 引入单会话 memory 的摘要、读取和过期策略。
- 增加制卡工具的候选生成、source quote 绑定和审核入口。
- 增加学习诊断建议的结构化输出，但不生成用户可见待审项，不提交复习调度状态。
- 通过 Host Gateway 校验所有持久化写入。

## 不做事项

- memory 不作为 citation source。
- 不引入未治理的长期 memory。
- 不允许 Agent tool 直接写 SQLite 业务表。
- 不绕过 citation audit 生成卡片 source quote。
- 不为学习计划或复习调度设计待审表、待审 UI、用户参与、撤销或拒绝流程。
- 不调用 `submit_review_candidates`，不写复习调度或长期记忆。
- 不引入 Multi-Agent supervisor。

## 验收标准

- 多轮 QA 可以使用单会话 memory 理解指代，但 grounded answer 仍只依赖本轮 retrieved child chunks。
- 制卡结果能追溯到 child evidence 和 source quote。
- 学习诊断只输出 `learning_advice_artifact` 和补卡建议，不产生调度写入。
- 用户不需要感知、审核、撤销或拒绝学习计划输出。
- 制卡候选等用户可见 artifact 仍应保留可理解和可处理的 UI。
- trace 不保存完整长会话历史。

## 退出门槛

- memory、制卡、学习工具不污染事实回答和 citation 边界。
- 工具权限、trace、fallback 足够稳定，可进入 P07 的多 Agent 拆分评估。
