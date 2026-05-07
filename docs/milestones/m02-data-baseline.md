# M02：V1 数据基线与 Rust 数据权威

## 目标

建立 MVP-0 所需的 V1 SQLite baseline，并明确 Rust/SQLite 是唯一数据权威。

## 所属 MVP

MVP-0。

## 相对工作量

L。

## 前置条件

- M01 完成。
- 已阅读 `docs/architecture.md` 和 `docs/mvps/mvp-0.md`。
- 已阅读 `docs/database-baseline.md`。

## 交付内容

- 新 V1 baseline 包含 MVP-0 核心表。
- Rust repo/command 边界可支撑 documents/cards/study/background_jobs。
- 旧 migrations 不作为兼容要求。
- 冻结功能表不进入核心 baseline。

## 任务分配

### Frontend

- 不依赖 mock 数据作为最终状态源。
- 准备通过 gateway/query 层接入真实命令。

### Rust/Tauri

- 建立或折叠 V1 baseline。
- 实现 SQLite 初始化、foreign keys、WAL。
- 建立 documents/cards/study/background_jobs 的最小仓储。
- 统一 UUID 文本主键和 UTC ISO 时间。

### Python orchestration

- 不直接写 SQLite。
- 等待后续通过 Rust/gateway 接收解析任务。

### Data/Schema

最小核心表：

```text
documents
document_chunks
source_anchors
cards
card_groups
review_states
study_events
background_jobs
```

### Tests

- 数据库初始化测试。
- foreign key 测试。
- 软删除基础测试。
- background job 状态流转测试。

## 不做什么

- 不兼容旧开发数据。
- 不加入 provider_configs。
- 不加入 knowledge、podcast、animation、points、export 相关表。
- 不做 sqlite-vec。

## 验收场景

- 新环境启动后能创建 V1 SQLite 数据库。
- 核心表存在。
- Rust 能创建并查询基础记录。
- Python 无法绕过 Rust 成为数据权威。

## 测试要求

- Rust 数据库测试必须通过。
- 至少覆盖表创建、基础插入、关系约束和软删除。

## 风险与回退

- 旧迁移依赖过多：保留旧迁移作参考，MVP 使用新 baseline。
- Schema 过早复杂化：只纳入 MVP-0 必需表。

## 完成后解锁

M03：PDF 导入与解析闭环。
