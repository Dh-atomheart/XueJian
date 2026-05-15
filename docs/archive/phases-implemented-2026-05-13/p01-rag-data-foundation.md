# P01 RAG Data Foundation

本阶段对应 [升级总路线图](../rag-agent-upgrade-roadmap.md) 的 Phase 1。目标是先让证据单元可靠落库。没有稳定的 Section/Parent/Child 结构，就不应先做复杂 auto-merge、rerank 或 Agent 编排。

## 目标

- 修复 `Section -> Parent -> Child` 结构落库。
- 保留 `sectionId`、`anchorId`、`chunkKind`、metadata、source anchor。
- 引入或等价维护 chunking profile、profile revision、stale 标记。
- 明确 child chunk 是 embedding、retrieval、citation、source quote 和制卡的最小证据单元。

## 前置条件

- P00 已完成。
- 已阅读 [Chunking 优化策略](../chunking-optimization-strategy.md)。
- 当前解析链路和 Rust 入库链路的结构信息丢失点已经定位。

## 改动范围

- Python 解析侧输出结构化 section、parent、child 元数据。
- Rust/SQLite/Host Gateway 接收并持久化结构字段。
- 文档重解析或 profile 变更时，能标记旧 chunk stale。
- 保留 source anchor，支持后续 citation 和 source quote 追溯。

## 不做事项

- 不实现 parent/child auto-merge 检索后合并。
- 不实现 rerank、relevance gate 或 second retrieval。
- 不引入 Agent runtime。
- 不把 parent 或 section 作为 citation source。

## 验收标准

- 同一文档解析后，可以从 Host Gateway 读回 section、parent、child 的层级关系。
- child chunk 能稳定追溯到文档、页码或 anchor。
- chunk metadata 至少能表达轻量知识类型，例如 definition、steps、comparison、example、table、code、formula、narrative。
- chunking profile 或等价 revision 变化后，旧 chunk 能被识别为需要重解析或重嵌入。

## 退出门槛

- 结构化 chunk 数据可被 P02 的 embedding 与 hybrid retrieval 使用。
- P03 所需的 parent/section context expansion 数据前提已经具备。

## 执行状态

状态：已完成。

说明：本阶段结构化落库契约继续作为 P02-P04 的前置依赖；本次收口未改动 P01 代码路径。
