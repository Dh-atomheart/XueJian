# V2-1 知识库问答模块实施计划

## 模块定位

- `Module ID`: `V2-1`
- `Stage`: `V2`
- `Priority`: `P1`
- `Spec Reference`: `spec.md` §2.3.1、§5.2、§6.3
- `Depends On`: `M1`、`M2`、`M3`、`M6`
- `Blocks`: `V3-2`、`V4-1`

## 交付目标

- 让用户可基于指定知识范围进行问答，并返回可追溯引用
- 在 MVP 的 FTS5 基础上扩展 embedding 与混合检索
- 使用 `sqlite-vec` 作为向量存储方案，保持 SQLite 为唯一数据源
- 保持 `RAG = 简单 RAG（非 Agentic）`，不把问答链并入 agent runtime

## Done Means

- 用户可以创建知识范围并发起问答
- 回答包含引用来源、页码、锚点或相关卡片
- `sqlite-vec` 集成完成，向量索引可正常工作
- 混合检索不可用时系统可平滑回退到纯 FTS5

## 前置条件

- `M2` 已稳定产出 `DocumentChunk`、`DocumentAnchor`
- `M3` 已稳定产出正式 `Card`
- `M6` 的 `ModelGateway`、成本统计与 BYOK 已可用

## 交付物

- 代码层：检索服务、RAG Prompt、回答链、会话管理、引用展示
- 数据层：`KnowledgeScope`、`RetrievalChunk`、`Citation`、`RagSession`
- UI层：问答输入区、引用列表、知识范围选择器
- 测试层：检索正确性、降级策略、引用跳转测试

## 一级任务映射

| 一级任务 | 内容 |
| --- | --- |
| `V2-1-T1` | 知识范围定义 |
| `V2-1-T2` | FTS5检索增强 |
| `V2-1-T3` | `sqlite-vec` 集成 |
| `V2-1-T4` | Embedding生成与索引 |
| `V2-1-T5` | 混合检索实现 |
| `V2-1-T6` | RAG Prompt构造 |
| `V2-1-T7` | 引用解析与展示 |
| `V2-1-T8` | RAG会话管理 |

## 实施级子任务

| 一级任务 | 子任务 | 说明 |
| --- | --- | --- |
| `V2-1-T1` | `V2-1-T1.1` 定义 `KnowledgeScope`；`V2-1-T1.2` 支持按文档、卡组、标签筛选 | 锁定检索边界 |
| `V2-1-T2` | `V2-1-T2.1` 增加 BM25 排序；`V2-1-T2.2` 增加元数据过滤 | 先提升关键词检索质量 |
| `V2-1-T3` | `V2-1-T3.1` 集成 `sqlite-vec` Rust 扩展；`V2-1-T3.2` 创建向量虚拟表；`V2-1-T3.3` 实现向量存储与查询接口 | 向量存储基础设施 |
| `V2-1-T4` | `V2-1-T4.1` 通过 `ModelGateway` 生成 embedding；`V2-1-T4.2` 批量生成 chunk embedding；`V2-1-T4.3` 处理缺失和重建策略 | 为混合检索做准备 |
| `V2-1-T5` | `V2-1-T5.1` 实现 RRF 融合排序；`V2-1-T5.2` 无 embedding 时自动回退；`V2-1-T5.3` 检索结果缓存 | 避免功能断裂 |
| `V2-1-T6` | `V2-1-T6.1` 构造带引用上下文；`V2-1-T6.2` 要求回答输出可解析引用结构 | 引用必须可审计 |
| `V2-1-T7` | `V2-1-T7.1` 展示引用列表；`V2-1-T7.2` 支持跳转原文与高亮定位 | 与 MVP 阅读能力对接 |
| `V2-1-T8` | `V2-1-T8.1` 持久化 `RagSession`；`V2-1-T8.2` 支持回放与错误记录 | 便于调试与审计 |

## 计划改动路径

- `xuejian/src/features/rag/`
- `xuejian/src/components/rag/`
- `xuejian/src-tauri/src/db/repositories/`
- `xuejian/src-tauri/src/gateway/model_gateway.rs`

## 接口与数据契约

- 公共业务类型：`KnowledgeScope`、`RetrievalChunk`、`Citation`、`RagSession`、`EmbeddingConfig`
- 关键契约：
  - 所有回答必须带引用列表
  - `Citation` 至少包含 `documentId`、`page`、`quote`
  - `RagSession` 必须可回放查询、回答和引用
  - 支持检索模式：`RetrievalMode = 'fts5' | 'hybrid'`
  - RAG 调用模型能力时通过 `ModelGateway`，但不要求进入 `PresetWorkflow`
- 模块内部实施类型：
  - `RetrievalPlan`
  - `EmbeddingResult`
  - `RagAnswerChain`

## 数据流 / 交互流

1. 用户选择知识范围并输入问题
2. 系统生成问题 embedding 并执行 FTS5 + 向量并行检索
3. RRF 融合排序后取 Top-K chunks
4. 检查降级条件，无 embedding 时使用纯 FTS5 结果
5. 构造 RAG Prompt 并通过 `ModelGateway` 生成回答
6. 解析回答与引用，展示结果并支持跳转
7. 持久化 `RagSession` 到 SQLite

## 异常与边界

- 不允许返回无引用的强结论
- embedding 失败不能阻断纯 FTS5 问答
- 不允许跨知识范围串文档
- `sqlite-vec` 扩展加载失败时自动降级
- embedding API 超时或失败时记录日志并降级
- 向量维度不匹配时拒绝写入并报错
- 当前阶段不把 RAG 问答链视为 agent graph 或长任务工作流

## 测试矩阵

- 单元：知识范围过滤、RRF 融合、引用结构校验
- 集成：混合检索、降级回退、引用跳转
- 视觉验收：问答界面符合默认视觉基线

## 验收清单

- [ ] `V2-1-T1` ~ `V2-1-T8` 已全部覆盖
- [ ] 所有一级任务均有实施级子任务
- [ ] `sqlite-vec` 集成完成，向量索引可用
- [ ] 回答可追溯、可跳转、可回放
- [ ] 纯 FTS5 和混合检索都可工作
- [ ] 降级策略经过测试验证
- [ ] 为 `V3-2` 和 `V4-1` 提供稳定知识范围能力
