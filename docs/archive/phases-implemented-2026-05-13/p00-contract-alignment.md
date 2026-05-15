# P00 Contract Alignment

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 0。目标是统一文档职责、术语、边界和验收口径，为后续 RAG 优先开发建立稳定契约。

## 目标

- 明确全局顺序：RAG Data Foundation -> Retrieval Foundation -> RAG Quality 2.0 -> Single Agent QA -> Memory/Card Tools -> Multi-Agent Runtime。
- 明确各专项文档的职责边界，避免 chunking、retrieval、context、Agent 文档互相覆盖。
- 明确不可变底线，尤其是 citation、trace、Rust/SQLite/Host Gateway 权威边界。

## 前置条件

- 已有 RAG、chunking、embedding/hybrid、context、Agent、多 Agent 相关设计文档。
- 本阶段不要求任何代码、schema 或 UI 已经完成。

## 改动范围

- 整理 `docs/index.md`、`docs/rag-agent-upgrade-roadmap.md` 和本目录阶段文档。
- 对齐专项文档中的阶段编号、先后关系和术语。
- 标注 LangGraph、多 Agent、memory、制卡工具的后置条件。

## 不做事项

- 不改代码。
- 不改数据库 schema。
- 不引入 LangGraph 或 supervisor。
- 不修改 RAG 检索行为。

## 验收标准

- 所有 RAG/Agent 升级文档都承认同一条主线：强 RAG -> 单 Agent -> Memory/Card Tools -> Multi-Agent。
- 文档没有暗示先做 Multi-Agent、先做 LangGraph 或先做制卡闭环。
- `docs/index.md` 能链接到本阶段目录入口。
- 专项文档能链接回总纲或被总纲引用。

## 退出门槛

- 文档路线、阶段顺序、不可变底线无明显冲突。
- 后续开发可以从 P01 开始，不需要再临时决定先做 RAG、Agent 还是 Multi-Agent。

## 执行状态

**完成日期**：2026-05-12

已修改文件：

- `docs/index.md`：拆分权威关系条目，将全局阶段顺序（P00-P07）和不可变底线权威明确指向 `rag-agent-upgrade-roadmap.md`；"做阶段实施"快速入口补充 RAG/Agent 升级阶段（P00-P07）路径。
- `docs/rag-knowledge-qa.md`：Section 1 段首插入总纲链接及 Phase 1-3 阶段归属声明，消除孤立文档。
- `docs/rag-agent-upgrade-roadmap.md`：Section 3 文档职责索引补充 `rag-knowledge-qa.md` 条目，形成总纲 -> 专项文档的双向可追溯性。

退出门槛检查：

- [x] 所有 RAG/Agent 升级文档承认同一条主线：强 RAG -> 单 Agent -> Memory/Card Tools -> Multi-Agent
- [x] 文档没有暗示先做 Multi-Agent、先做 LangGraph 或先做制卡闭环
- [x] `docs/index.md` 能链接到本阶段目录入口（`phases/README.md`）
- [x] 专项文档能链接回总纲（`rag-agent-upgrade-roadmap.md`）或被总纲引用
- [x] `index.md` 权威关系中"全局阶段顺序"不再与多 Agent 专项文档混用
