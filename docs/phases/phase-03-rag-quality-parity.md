# Phase 03: RAG Quality And Parity

## Goal

补齐 RAG artifact、QualityEnvelope、质量门槛和轻量 compatibility parity。通过本阶段后，旧 `knowledge_qa_agent.py` 不再承担主编排职责。

## Inputs

- Phase 02 已完成 KnowledgeGraph 中粒度节点。
- Phase 00 sanity set。
- 现有前端 QA 页面和 trace 展示。

## Implementation Scope

- 生成 RAG v1 artifact：`evidence`、`answer`。
- 每个 artifact 必须包含 `qualityEnvelope`。
- `answer` 只有在 `groundingStatus=grounded` 且 `auditStatus=passed` 时，才可作为正式 grounded answer。
- `evidence` 只有 source refs 可追踪且 `riskLevel != high` 时，才可供 CardGraph / Supervisor 复用。
- 执行轻量 compatibility parity，不要求答案文本逐字一致。

## Out Of Scope

- 不做生产影子流量。
- 不要求新旧实现持续双跑。
- 不把旧实现中与新证据边界冲突的行为复刻回来。
- 不新增 artifact store 或数据库表。

## Interfaces

RAG artifact 公共字段：

```text
artifactId
artifactType
schemaVersion
summary
sourceRefs
qualityEnvelope
errorCategory
createdBy
```

`artifactRefs` 保持非破坏性新增。

## Discovery Checklist

- 读取 `xuejian/src/features/knowledge/KnowledgeQaPage.tsx`，确认容器状态和提交路径。
- 读取 `xuejian/src/components/knowledge/RagTracePanel.tsx`，确认 `ragTrace` 展示依赖。
- 读取 `xuejian/tests/unit/knowledge-qa-result.test.ts` 和 `knowledge-qa-page.test.tsx`，确认前端解析测试。
- 读取 `xuejian/tests/unit/test_knowledge_qa.py`，确认 no hits、fallback、event、citation 行为。
- 固定轻量 parity sanity set 的输入和期望边界。

## Implementation Checklist

- 在 KnowledgeGraph finalize 阶段生成 `evidence` artifact ref。
- 在 answer / audit 后生成 `answer` artifact ref。
- 给每个 artifact 填充完整 `QualityEnvelope`。
- 将缺失或非法 `QualityEnvelope` 归为 high risk，并记录 `quality_envelope_invalid`。
- 将 FTS-only / lexical-only 降级为 high-risk evidence 或 `excerpt_fallback`，不得输出正式 grounded answer。
- 建立轻量 parity sanity set，不比较自然语言答案逐字一致。

## Verification Commands

```powershell
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_knowledge_qa_agent.py
cd xuejian; npm.cmd test -- tests/unit/knowledge-qa-result.test.ts tests/unit/knowledge-qa-page.test.tsx
rg "groundingStatus|auditStatus|qualityEnvelope|artifactRefs" docs/rag-langgraph-migration.md docs/phases
```

## Do Not Proceed If

- FTS-only 仍能输出正式 grounded answer。
- citation audit failure 后仍输出可用 answer artifact。
- `ragTrace` shape 破坏 `RagTracePanel`。
- `artifactRefs` 变成必填字段导致旧解析失败。
- 缺失 `QualityEnvelope` 的 artifact 可被后续 Graph 当作可信输入。

## Acceptance Tests

- `/workflows/knowledge-qa` 返回现有字段并兼容旧解析。
- `artifactRefs` 可选；缺失时旧解析仍可工作。
- RAG artifact 包含完整 `qualityEnvelope`。
- 缺失 `QualityEnvelope` 的 artifact 不能被后续 Graph 当作可信输入。
- no hits 返回 `no_relevant_content`。
- citation audit failure 不输出可用 answer artifact。
- FTS-only / lexical-only 不输出正式 grounded answer artifact。
- `KnowledgeQaPage`、`RagTracePanel`、citation card、fallback / no relevant UI 不崩。

## Exit Criteria

RAG 文档中的 Contract、Artifact And Quality、Graph Runtime、RAG Quality Boundary、Lightweight Compatibility Parity 全部通过后，进入 Phase 4。旧 RAG runner 从主路径退出；Multi-Agent 才能消费 KnowledgeGraph 契约。
