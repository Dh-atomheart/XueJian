# Phase 09: Artifact Store

## Goal

将 Phase 0-8 中的 artifact refs 从接口契约升级为可持久化、可查询、可回放的 artifact store，支撑跨 Graph 通信、长任务恢复、UI 展示和回归评估。

## Inputs

- Phase 03 的 RAG `evidence` / `answer` artifact。
- Phase 04 的 card artifact。
- Phase 05/08 的 learning advice 和 study schedule artifact。
- 现有 workflow events / checkpoints。

## Implementation Scope

- 设计 artifact 存储 schema 和版本策略。
- 持久化公共字段：`artifactId`、`artifactType`、`schemaVersion`、`summary`、`sourceRefs`、`qualityEnvelope`、`errorCategory`、`createdBy`。
- 支持按 run、type、source refs、createdBy 查询。
- 支持 artifact lifecycle：created、consumed、superseded、rolled_back、expired。
- artifact 写入通过 Host Gateway，Python / LangGraph 不直接写 SQLite。

## Out Of Scope

- 不保存完整 prompt、chain-of-thought、API key 或未裁剪长正文。
- 不把 artifact store 当作长期向量库。
- 不改变 KnowledgeGraph / CardGraph / StudyGraph 的业务质量门槛。

## Interfaces

目标能力：

```text
create_artifact
get_artifact
list_artifacts
mark_artifact_consumed
mark_artifact_rolled_back
```

`artifactRefs` 继续使用按类型分组对象映射。

## Data Model Decisions

新增 SQLite 表由 Rust migration 创建，Python 只能通过 Host Gateway 访问。

```sql
CREATE TABLE workflow_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  summary TEXT NOT NULL,
  source_refs_json TEXT NOT NULL,
  quality_envelope_json TEXT NOT NULL,
  error_category TEXT,
  created_by TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

索引固定：

```sql
CREATE INDEX idx_workflow_artifacts_run_id ON workflow_artifacts(run_id);
CREATE INDEX idx_workflow_artifacts_type ON workflow_artifacts(artifact_type);
CREATE INDEX idx_workflow_artifacts_lifecycle ON workflow_artifacts(lifecycle_status);
```

`lifecycle_status` 固定枚举：

```text
created
consumed
superseded
rolled_back
expired
```

## API Contract Decisions

Host Gateway 新增路由：

```text
POST /tool-gateway/artifacts
GET /tool-gateway/artifacts/{artifactId}
GET /tool-gateway/artifacts?runId=&artifactType=
POST /tool-gateway/artifacts/{artifactId}/lifecycle
```

所有 artifact payload 必须先做 redaction。`payload_json` 只保存必要结构化字段，不保存完整 prompt、chain-of-thought、API key 或未裁剪长正文。

## Discovery Checklist

- 读取 `xuejian/src-tauri/src/db/workflow_repo.rs` 和 workflow migrations。
- 读取 Host Gateway 中已有 workflow event/checkpoint 方法。
- 盘点 Phase 03-08 中所有 artifact 类型和字段。
- 检查 UI 是否已有 artifact summary 展示入口。
- 确认数据库迁移策略和回滚要求。

## Implementation Checklist

- 新增 artifact schema / migration。
- 新增 Rust repository 和 Host Gateway route。
- 新增 Python client 方法，只通过 Host Gateway 写入。
- 将各 Graph 的 artifact refs 接入 artifact store。
- 增加 artifact schema version 校验。
- 增加隐私过滤和摘要长度限制。
- 将 `artifactRefs` 解析统一为按类型分组对象映射，不再新增数组形态。
- 对 `rolled_back`、`expired` artifact 设置不可作为可信输入。

## Verification Commands

```powershell
cd xuejian; cargo check --manifest-path src-tauri/Cargo.toml
pytest xuejian/tests/unit/test_knowledge_qa.py xuejian/tests/unit/test_card_tools.py xuejian/tests/unit/test_study_tools.py
rg "artifactId|artifactType|schemaVersion|qualityEnvelope|create_artifact|list_artifacts" docs xuejian
```

## Do Not Proceed If

- artifact store 保存完整 prompt、chain-of-thought 或未裁剪长正文。
- Python / LangGraph 绕过 Host Gateway 写 artifact 表。
- artifact 缺少 `qualityEnvelope` 仍可被后续 Graph 当作可信输入。
- schemaVersion 缺失或不可迁移。
- artifact lifecycle 不可查询或不可更新。

## Acceptance Tests

- Graph 可创建 artifact 并返回 refs。
- Supervisor 可通过 refs 读取 artifact 摘要和质量状态。
- artifact 可按 run/type 查询。
- rolled_back artifact 不再作为可信输入。
- 缺失或非法 `QualityEnvelope` 视为 high risk。

## Exit Criteria

artifact store 可支撑跨 Graph refs、UI 展示和长任务恢复后，进入 Phase 10。
