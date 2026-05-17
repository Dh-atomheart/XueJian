# Phase 12: Evaluation And Regression

## Goal

建立 RAG、CardGraph、StudyGraph、Supervisor 的长期评估与回归体系，避免后续改动破坏证据边界、制卡质量、学习建议和编排策略。

## Inputs

- Phase 03 RAG sanity set。
- Phase 04 CardGraph quote audit / dedupe 测试。
- Phase 05/08 StudyGraph advice / schedule tests。
- Phase 06 Supervisor golden tasks。
- artifact store 和 workflow trace。

## Implementation Scope

- 建立 RAG eval set：grounded answer、no relevant、FTS-only、citation audit failure。
- 建立 CardGraph eval set：quote validity、duplicate、low value、formal write gate。
- 建立 StudyGraph eval set：weak topic detection、card gap suggestion、schedule write risk。
- 建立 Supervisor golden tasks：routing、partial success、policy rejection、budget exceeded。
- 产出 regression report。

## Out Of Scope

- 不用 LLM judge 替代硬性质量门槛。
- 不把 eval 结果直接用于自动写入。
- 不保存 prompt、chain-of-thought 或未裁剪正文。

## Interfaces

评估输出最小字段：

```text
evalSuite
caseId
runtime
status
qualityEnvelope
expectedBehavior
actualBehavior
blockingReasons
traceRef
```

## Baseline And Threshold Decisions

第一版阻断阈值固定为：

```text
RAG grounded answer citation audit pass rate >= 0.95
RAG no relevant / FTS-only false grounded answer count = 0
CardGraph source quote invalid write count = 0
CardGraph duplicate formal write count = 0
StudyGraph high-risk schedule write count = 0
Supervisor policy bypass count = 0
Supervisor budget bypass count = 0
privacy leakage count = 0
```

warning 阈值：

```text
RAG grounded answer confidence median < 0.70
Card candidate rejection rate > 0.60
Study advice reviewRequired rate > 0.50
Supervisor partial success rate > 0.40
```

eval case 存储位置固定：

```text
docs/evals/
  rag-sanity-cases.md
  cardgraph-quality-cases.md
  studygraph-cases.md
  supervisor-golden-tasks.md
```

## Discovery Checklist

- 读取 `xuejian/orchestration_service/evals/ragas_knowledge_qa_eval.py`。
- 读取 `docs/rag/legacy/ragas-rag-evaluation.md` 和 `docs/rag/legacy/langsmith-rag-evaluation.md`。
- 读取现有 Python / Vitest / Rust 测试。
- 从 artifact store 和 workflow events 选取可回放案例。
- 列出 Supervisor golden tasks。

## Implementation Checklist

- 固化 RAG sanity set 为可运行测试或 eval case。
- 增加 CardGraph quality eval cases。
- 增加 StudyGraph recommendation eval cases。
- 增加 Supervisor golden task runner。
- 生成回归报告并记录版本、runtime、graphVersion。
- 将高风险回归设为阻断项。
- 每次 regression report 必须记录 graphVersion、runtime、case count、blocking failures、warnings。
- 对所有 eval 输入做脱敏，保存 refs 和摘要，不保存原始长正文。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_card_tools.py xuejian/tests/unit/test_study_tools.py
python scripts/ci/python_orchestration_smoke.py
rg "ragas|eval|golden|regression|qualityEnvelope" docs xuejian/orchestration_service xuejian/tests
```

## Do Not Proceed If

- eval 只看答案文本相似度，不检查 citation / quote / quality gate。
- Supervisor golden tasks 不能覆盖普通 QA 绕行和普通制卡绕行。
- regression report 不能定位 runtime、graphVersion 或 artifact refs。
- 评估数据保存了敏感 prompt 或未裁剪正文。
- 阻断阈值未达标仍允许进入 Phase 13。

## Acceptance Tests

- RAG eval 能捕获 FTS-only grounded answer 回归。
- Card eval 能捕获 quote invalid 和 duplicate 回归。
- Study eval 能捕获高风险 schedule write 回归。
- Supervisor eval 能捕获越权计划和预算绕过。
- 回归报告可复现并可追溯到 trace/artifact。

## Exit Criteria

评估体系能稳定阻断核心质量回归后，进入 Phase 13。
