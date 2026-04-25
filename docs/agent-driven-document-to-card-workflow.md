# Agent 驱动文档 -> 卡片工作流体系总设计

> 文档版本：1.1.0  
> 最后更新：2026-04-23  
> 状态：专题设计文档  
> 适用范围：XueJian 文档导入、结构化解析、RAG 检索、卡片候选生成、人工审阅、卡片落库全链路  
> 文档定位：卡片候选生成链路的上游专题补充，不是卡片系统唯一开发规范

---

## 0. 文档优先级与约束

自 2026-04-23 起，`docs/card-system-v2.md` 是卡片系统唯一开发规范。本文档仅负责解释“文档 -> 候选卡片”的上游编排设计，不负责定义以下内容：

- 卡片系统页面职责
- 正式卡片状态机
- 正式卡片落库边界
- `ReviewPage` 行为
- 卡片系统完成态与验收门禁

若本文档与 `docs/card-system-v2.md` 冲突，以 `docs/card-system-v2.md` 为准。若本文档与 `docs/card-system-evaluation-framework.md` 冲突，以主规范优先，再由评估框架对齐主规范。

本文件是 XueJian 中“文档 -> 卡片”子系统的主设计文档。自本文件生效起，后续编码、测试、迁移、UI 调整、工作流改造，都必须以本文件为准。

对于以下已有文档中的相关段落，本文件拥有更高优先级：

- docs/spec.md 中关于“简单 RAG（非 Agentic）”的旧表述
- docs/spec.md 中关于“LangGraph 仅作为未来路径”的旧表述
- docs/references/ai-orchestration.md 中关于“LangGraph 非当前运行时依赖”的旧表述
- README.md 中关于“LangChain 是当前唯一正式工作流框架”的旧表述

本文件不替代以下文档的角色，但会在本专题范围内引用这些文档：

- docs/card-system-v2.md：卡片系统主线、页面职责、卡片模型、前后端契约
- docs/references/document-ir.md：DocumentIR 作为解析输出中间表示的稳定契约
- docs/spec.md：项目总体阶段目标与验收边界

在本文件没有完成对应实现前，不得以“局部功能可用”为理由宣布该子系统开发完成。

---

## 1. 目标与问题定义

### 1.1 要解决的问题

XueJian 当前已经具备：

- 本地文档导入
- Docling + PyMuPDF 解析基础
- document_chunks / document_anchors 持久化
- SQLite FTS5 检索基础设施
- Python sidecar 编排服务
- 线性卡片生成工作流雏形
- 卡片候选审阅与最终入库流程

但当前链路仍然存在以下结构性不足：

1. 没有语义向量检索，RAG 仍停留在 FTS5 级别。
2. chunk 只有单层平面结构，无法同时兼顾精确命中和大上下文生成。
3. 工作流是线性、脆弱、弱恢复的，无法把长文档拆成多个可恢复单元。
4. 候选卡片缺少系统化质量评估，默认只能依赖人工大量筛选。
5. 配置层没有把“聊天模型”和“嵌入模型”能力清晰拆开。
6. 当前规范里对 RAG 是否 agentic、LangGraph 是否立即引入存在文档冲突。

### 1.2 本设计的目标

本设计要构建一套完整、优质、高效、可恢复、可调试的 Agent 驱动文档 -> 卡片工作流体系，满足以下目标：

1. 文档导入后，自动完成结构化解析、分层 chunking、向量化准备。
2. 在 SQLite 单库内完成 FTS5 + sqlite-vec 的 Hybrid RRF 检索。
3. 基于 LangGraph 构建 Supervisor -> Subagent 的 section 级卡片生成工作流。
4. 用结构化评估 Agent 给候选卡片打分，并默认展示高分结果。
5. 将人工审阅明确纳入图工作流，而不是作为图外无状态操作。
6. 让整个链路具备 checkpoint / resume / interrupt 能力。
7. 保持 Rust Host 为 source of truth，Python 只负责编排，不拥有主存储和明文密钥。
8. 后续代码实现必须严格对应本文件中的结构、状态机、字段、节点、测试与验收规则。

### 1.3 结果形态

用户从导入文档到拿到可复习卡片的主路径应为：

1. 导入文档
2. 解析为 DocumentIR
3. 生成 parent-child 层次化检索结构
4. 自动生成向量索引
5. 文档进入可生成状态
6. LangGraph 工作流按 section 并行起草候选卡片
7. 评估 Agent 打分、去重、聚合
8. 用户在候选面板审阅、编辑、接受或拒绝
9. 图工作流恢复执行，最终物化为正式 cards
10. 卡片进入后续学习与 FSRS 复习系统

---

## 2. 设计原则

### 2.1 单一事实源

- SQLite 是唯一事实源。
- app.db 同时承载文档元数据、chunk/section、候选卡片、正式卡片、工作流、向量索引元数据。
- Python 不得直接持有数据库写权限；所有持久化通过 Rust Host 提供的受控接口完成。

### 2.2 宿主拥有边界

- Rust Host 负责密钥、数据库、文件系统、预算、工具边界、日志脱敏。
- Python Orchestration 负责图执行、模型调用、结构化输出、重试与 checkpoint 协调。
- React 只负责提交请求、消费事件、呈现审阅 UI，不直接承担编排逻辑。

### 2.3 默认可恢复

- 长链路必须设计为可 checkpoint、可 interrupt、可 resume。
- 任何会消耗远程 token、可能跨秒或跨分钟执行的步骤，都必须可恢复。
- “跑完再说”的一次性脚本式流程不允许成为正式实现。

### 2.4 先确定性，后模型

- 能由规则可靠完成的事情，优先规则完成。
- 解析、层次化 chunking、锚点建立、精确去重、状态流转、候选可见性分桶，都应尽量确定性实现。
- LLM 主要负责语义抽取、候选撰写、质量评估和解释性字段生成。

### 2.5 锚点优先

- 所有生成结果都必须可追溯到文档原文。
- 生成卡片的最小可接受标准，不仅是“答案正确”，还包括“来源可定位”。
- 低锚点质量结果必须被评估 Agent 显式降分。

### 2.6 显式降级

- Fallback 可以存在，但不能伪装成标准模型输出。
- 规则生成、FTS5-only、embedding 失败降级都必须在 UI、事件流和持久化结果里明确标注。

### 2.7 约束型 Agent，而非放任式 Agent

- 这里的 Agent 是“窄职责节点 + 受控工具 + 状态图”，不是开放式自治系统。
- 不引入自由探索式多智能体，不引入无边界工具调用，不引入图外任意副作用。

---

## 3. 术语表

### 3.1 核心对象

- DocumentIR：文档结构化中间表示，是解析输出的稳定契约。
- Section：Parent chunk，面向生成与上下文注入的章节级单元。
- Child Chunk：面向检索与精确引用的细粒度单元，通常对应段落、列表项或窗口切片。
- Anchor：文档原文定位点，可映射到页码、段落、坐标、引用文本。
- Embedding Profile：当前生效的向量空间配置，定义 provider、model、dimensions、revision。
- Hybrid Search：FTS5 + 向量检索并行召回，再用 RRF 融合排序。
- Review Batch：某次 workflow run 产出的候选卡片集合，是人工审阅与恢复执行的边界。
- Human Gate：LangGraph 中的 interrupt 点，等待用户审批或编辑。
- Fallback Mode：显式降级路径，例如规则生成或 FTS5-only。

### 3.2 Agent 角色

- Supervisor：负责 section 任务编排、配额与总体状态推进。
- Section Draft Agent：针对单个 section 生成候选卡片。
- Evaluation Agent：针对候选卡片进行 6 维质量评估。
- Dedupe Layer：规则优先，必要时结合检索辅助，负责批内和历史重复检测。
- Human Reviewer：最终审批者，决定候选是否进入正式卡片集。

---

## 4. 适用范围与非目标

### 4.1 本次体系明确覆盖

1. PDF 文档导入后的解析、层次化 chunking、embedding 与卡片生成。
2. Markdown / 纯文本导入的统一结构化落地。
3. SQLite 单库内的向量存储与 Hybrid RRF 检索。
4. LangGraph 运行时引入与 checkpoint 持久化。
5. 候选卡片评分、默认展示策略、人工审阅恢复。
6. 前端文档状态、候选评分 UI、回退模式提示。
7. 后续编码必须以本文件的 phase 和 acceptance 为交付边界。

### 4.2 明确不在本次范围内

1. 用户自定义图工作流编排器。
2. 本地离线 embedding 模型内置运行。
3. 独立向量数据库、独立图数据库或额外守护进程。
4. 学习历史反向驱动生成策略。
5. 动画、播客、知识图谱工作流的 LangGraph 迁移。
6. Android 端特殊适配。
7. 多用户、多端同步或云端账户系统。

---

## 5. 当前仓库基线与差距

### 5.1 已有基础能力

- xuejian/orchestration_service/parsing/docling_pipeline.py 已具备 Docling + PyMuPDF 解析骨架。
- xuejian/src-tauri/src/db/document_repo.rs 已具备 documents、document_chunks、document_anchors 持久化。
- xuejian/src-tauri/src/db/workflow_repo.rs 已具备 workflow_runs、workflow_checkpoints、workflow_events。
- xuejian/orchestration_service/workflows/card_generation.py 已具备基础 LLM / 规则候选生成。
- xuejian/orchestration_service/workflows/knowledge_qa.py 已具备 FTS5 检索 + 回答骨架。
- xuejian/src-tauri/src/gateway/host_http.rs 与 orchestration_service/clients/host_gateway.py 已具备 HostGateway 通信基础。
- xuejian/src/components/cards/CardCandidatePanel.tsx 已有候选人工审阅 UI 基础。

### 5.2 当前主要差距

1. 缺少 document_sections 这一级 parent context 持久化。
2. document_chunks 尚未和 parent section 建立强关联。
3. 没有 sqlite-vec 向量表与 embedding profile 管理。
4. RAG 仍是 FTS5 主导，Hybrid 只是类型层预留。
5. card_generation 仍是线性流程，没有图执行、interrupt、resume。
6. card_candidates 未保存足够的评估细节、可见性与 fallback 元信息。
7. provider 契约、前端类型、设置页 UI 还存在新旧命名不一致。

### 5.3 当前文档冲突

当前仓库中文档存在以下冲突，本文件在这些问题上给出最终裁决：

1. RAG 是否保持简单非 agentic：本设计裁决为“知识问答保持有限图式编排，但仍是受控检索型工作流，不演化为自由多轮自治 Agent”。
2. LangGraph 是否立即引入：本设计裁决为“立即引入，用于文档 -> 卡片工作流，且 checkpoint-first 是当前前提，不再是 future path only”。

---

## 6. 最终架构决策

下表是本体系的最终决策，不再重复讨论，除非显式修订本文件。

| 主题             | 最终决策                 | 说明                                                 |
| ---------------- | ------------------------ | ---------------------------------------------------- |
| 主数据库         | 共享 app.db              | 所有结构化数据和向量元信息都在同一个 SQLite 文件里   |
| 向量引擎         | sqlite-vec               | 不引入独立向量数据库                                 |
| 检索策略         | Hybrid RRF               | FTS5 + 向量并行召回，RRF 融合                        |
| 编排运行时       | LangGraph                | 立即引入，不再仅作未来升级路径                       |
| Chunking 策略    | Parent-Child 双层        | section 为 parent，child chunk 为检索单元            |
| Parent 存储      | document_sections 独立表 | 不使用 document_chunks 自引用模拟                    |
| Embedding 时机   | 导入后自动异步生成       | 文档完成结构解析后立即进入 embedding 阶段            |
| 标准生成前置条件 | Embedding Ready          | 标准卡片生成流程要求文档先完成 embedding             |
| 降级策略         | 显式 Fallback            | 仅供运维和受控回退，默认 UX 不伪装                   |
| 用户体验         | 后台静默处理 + 完成通知  | 默认不打断用户，但可查看状态与日志                   |
| 学习历史介入     | 首版不介入               | 先做全量生成和人工筛选                               |
| 评估维度         | 6 维全量启用             | 信息密度、清晰度、完整性、去重、学习友好性、溯源质量 |

---

## 7. 总体架构

## 7.1 分层结构

```text
React UI
  -> Tauri IPC / Queries / Mutations
    -> Rust Host
      -> SQLite(app.db) / FTS5 / sqlite-vec / Stronghold / Filesystem
      -> HostGateway HTTP
        -> Python Orchestration Service
          -> LangGraph + LangChain + LiteLLM + PydanticAI
            -> External Model Providers
```

### 7.2 责任划分

#### React UI

- 发起导入、生成、审阅、恢复、最终确认
- 呈现文档状态、候选批次、评分、来源锚点、回退标签
- 消费 workflow events 和最终结果

#### Rust Host

- 管理 documents、sections、chunks、cards、workflow data
- 管理向量表、FTS5 查询、混合检索与降级逻辑
- 管理 API 配置、密钥、预算边界、状态机和日志脱敏
- 暴露 HostGateway 工具给 Python 编排层

#### Python Orchestration

- 执行 LangGraph 图
- 调用模型、执行结构化输出校验
- 管理图中各节点状态和恢复点
- 不拥有数据库主写权限，不持久化明文密钥

---

## 8. 端到端生命周期

## 8.1 文档导入生命周期

标准路径：

1. 用户导入 PDF / MD / TXT
2. Rust Host 创建 documents 记录，状态为 uploading
3. 解析管道生成 DocumentIR
4. Host 持久化 anchors、sections、child chunks
5. 文档状态改为 parsed
6. 异步启动 embedding 任务
7. embedding 成功后，文档状态改为 ready
8. 用户可以启动标准卡片生成工作流

异常路径：

- 解析失败 -> error
- embedding 失败 -> embedding_failed
- embedding profile 变更导致旧索引失效 -> embedding_stale

### 8.2 卡片生成生命周期

标准路径：

1. 用户在 ready 状态文档上点击生成卡片
2. 创建 workflow_run(type=card_generation)
3. LangGraph 读取文档 section 列表并切分任务
4. section draft agents 并行生成候选卡片
5. aggregate + dedupe + evaluation
6. 持久化 review batch 到 card_candidates
7. 工作流进入 waiting_confirmation 并 interrupt
8. 用户在前端审阅、接受、拒绝、编辑候选
9. 用户点击 finalize / confirm
10. 图恢复执行，将 accepted 候选物化为 cards
11. workflow_run 结束为 completed

### 8.3 知识问答生命周期

1. 用户选择知识范围并发起问题
2. 系统根据 scope 过滤 child chunks
3. 执行 FTS5 召回和向量召回
4. 使用 RRF 融合得到 top-K child hits
5. 将命中的 child chunk 提升到其 parent section 上下文
6. 用 parent context 组织回答，child anchor 作为 citation 定位源
7. 返回 RagAnswer(answer, retrievalMode, citations)

### 8.4 人工审阅生命周期

人工审阅不是图外“随便改几个 DB 字段”的行为，而是图工作流的一部分：

1. persist_review_batch 节点把候选卡片作为 pending review batch 落库
2. interrupt 点把 run 状态切换为 waiting_confirmation
3. UI 基于 workflow_run_id 读取对应候选卡片
4. 用户修改候选 front / back / tags / cardType / status
5. finalize 动作触发 run resume
6. materialize_cards 节点读取最终 accepted 候选并入 cards

---

## 9. DocumentIR -> Section/Chunk 派生设计

## 9.1 设计目标

这一步的目标不是简单“把文本切碎”，而是同时满足两种相反需求：

1. 检索时需要足够小、足够精确的命中单元。
2. 生成和问答时需要更大、更完整的上下文单元。

因此采用 Parent-Child 双层结构：

- Parent：Section，用于大上下文注入、Supervisor 分发、生成时的语义完整边界
- Child：Chunk，用于 FTS5 / 向量检索、citation 精确命中、近重复比较

## 9.2 Section 边界规则

### 9.2.1 基本规则

- heading block 是 section 的首选边界。
- 未命中 heading 的文档开头内容，归入 synthetic root section。
- heading level 应保留到 metadata 中，用于后续 section hierarchy。
- `page_header` 和 `page_footer` 默认不进入 section 正文，除非整页只有此类文本。

### 9.2.2 进入 section 的 block 类型

默认进入正文聚合的 blockType：

- heading
- paragraph
- list
- list_item
- table
- figure
- code_block
- formula
- blockquote

### 9.2.3 Section 切分规则

1. 每遇到新 heading，关闭当前 section，开启新的 section。
2. 对过长 section，不直接保持超大 parent，而是做“语义优先、窗口补切”的二级切分：
   - 若 section 预计长度 <= 1800 token，则保留单个 parent section。
   - 若超过 1800 token，则按语义块组装为多个 virtual section，每个目标 700-1200 token。
   - 相邻 virtual section 保留约 120 token 的语义 overlap。
3. 表格、公式、代码块不能被无意义拆断；若其本身过长，则允许整块独占一个 section。

### 9.2.4 hierarchy_path

每个 section 必须持久化 heading 栈，例如：

```json
["Chapter 2", "2.3 Retrieval", "2.3.1 Hybrid Search"]
```

该字段用于：

- UI 展示来源层级
- chunk metadata
- 后续图谱或 scope 过滤扩展

## 9.3 Child Chunk 派生规则

### 9.3.1 Child chunk 目标

- 默认目标大小：120-320 token
- 软上限：420 token
- 如果单个 paragraph / list_item 超过软上限，则按句子边界或窗口切开

### 9.3.2 切块流程

1. 以 paragraph / list_item / code_block / formula / table block 作为初始 child 候选。
2. 过短相邻块可合并，条件：
   - 位于同一 section 内
   - 语义类型兼容
   - 合并后不超过软上限
3. 过长块进行二次切分：
   - 优先按句子断句
   - 无法断句时用字符窗口切分
   - 每个窗口保留约 15% overlap

### 9.3.3 Anchor 关联

每个 child chunk 应尽可能关联一个首要 anchor：

- 如果 block 自带 anchorId，则直接复用
- 如果 chunk 由多个 block 合并，则使用 chunk 内首个稳定 anchor 作为主 anchor，其他 anchor 写入 metadata
- 如果缺失坐标，则以 paragraph/text-range 模式降级

### 9.3.4 token_count 计算

token_count 是近似估计值，不要求与任一 provider 完全一致，但必须满足稳定排序和阈值判断。

首选实现：

- 优先使用统一 tokenizer helper 估算
- 若 tokenizer 不可用，则使用仓库内统一启发式估算器

这里不接受“不同模块各算各的”做法，避免 chunking 阈值漂移。

---

## 10. 数据模型设计

## 10.1 documents 状态机

目标状态集合：

- uploading
- parsed
- embedding
- ready
- embedding_failed
- embedding_stale
- error

状态定义：

- uploading：文档文件刚进入系统，基础记录已创建
- parsed：DocumentIR、anchors、sections、child chunks 已持久化
- embedding：向量化任务正在运行
- ready：标准文档 -> 卡片工作流可执行
- embedding_failed：向量化失败，标准工作流不可直接进入；仅允许运维级显式降级
- embedding_stale：active embedding profile 变更后旧向量失效，等待重建
- error：解析或结构化持久化失败

### 10.1.1 标准可用性规则

标准卡片生成入口仅对 ready 文档开放。

embedding_failed 和 embedding_stale 不是 ready 的等价状态。它们表示文档结构数据存在，但不满足标准质量路径。必要时可提供显式“强制 FTS5-only 降级生成”入口，但：

- 该入口不作为默认 UI 主按钮
- 结果必须带 fallback 元信息
- 不得伪装为标准流程成功产物

## 10.2 新增表：document_sections

建议字段：

```sql
CREATE TABLE document_sections (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  section_index INTEGER NOT NULL,
  heading TEXT,
  hierarchy_path TEXT,           -- JSON array
  page_start INTEGER,
  page_end INTEGER,
  anchor_start_id TEXT REFERENCES document_anchors(id),
  anchor_end_id TEXT REFERENCES document_anchors(id),
  content TEXT NOT NULL,
  token_count INTEGER,
  metadata TEXT,                 -- JSON object
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, section_index)
);
```

用途：

- Supervisor 按 section 分配子任务
- 问答时作为 parent context 注入
- 候选卡片可回溯到 section 级来源

## 10.3 扩展表：document_chunks

需要新增字段：

- section_id TEXT NULL REFERENCES document_sections(id)
- anchor_id TEXT NULL REFERENCES document_anchors(id)
- chunk_kind TEXT NOT NULL DEFAULT 'semantic'

说明：

- section_id 建立 child -> parent 关系
- anchor_id 让 child chunk 有明确主引用点
- chunk_kind 用于区分 `semantic` / `windowed` / `fallback`

## 10.4 Embedding Profile 模型

由于 sqlite-vec 的 vec0 列是定维向量列，应用不能在一个活跃向量空间里同时混用不同 dimensions 的 embedding。

因此本设计采用“单活跃向量空间 + profile revision”机制。

建议新增表：

```sql
CREATE TABLE embedding_profiles (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  distance_metric TEXT NOT NULL DEFAULT 'cosine',
  is_active INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

规则：

1. 任一时刻只有一个 active profile。
2. 所有 ready 文档都隐含依附于当前 active profile revision。
3. 若 active profile 改变：
   - 所有已 ready 文档转为 embedding_stale
   - vec 表清空并按新 dimensions 重建
   - 后台重新计算 embeddings

### 10.4.1 为什么不用多个维度并存

因为这会让：

- 检索路径复杂化
- 融合排序失去可比性
- schema 与运维复杂度明显上升

本产品是本地优先桌面应用，不追求“多 embedding 空间长期共存”，而追求“一个当前正确可用的 embedding 空间”。

## 10.5 sqlite-vec 向量表设计

建议采用一个活跃虚表：

```sql
CREATE VIRTUAL TABLE vec_document_chunks USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding FLOAT[DIM_FROM_ACTIVE_PROFILE]
);
```

说明：

- `DIM_FROM_ACTIVE_PROFILE` 在建表或重建表时由当前 active profile 决定。
- vec 表只承载当前有效向量空间，不保存历史 profile 的旧向量。
- 历史 profile 的意义只保留在 metadata / revision 中，不保留多份并行 vec 表。

## 10.6 扩展 card_candidates

现有 card_candidates 需要至少补齐以下字段：

- section_id TEXT NULL REFERENCES document_sections(id)
- score_overall REAL NULL
- score_details TEXT NULL -- JSON
- visibility_bucket TEXT NULL -- default | expanded | hidden_low_quality
- generation_mode TEXT NOT NULL -- llm | fallback_rule | fallback_fts5_only
- fallback_reason TEXT NULL
- evaluation_summary TEXT NULL
- source_chunk_ids TEXT NULL -- JSON array

这样做的目的：

- 前端可默认展示高分候选
- fallback 不会被误认为标准模型结果
- 审阅面板可展示来源 section、评分和候选解释

## 10.7 workflow_runs / checkpoints / events 扩展

### workflow_type 需要支持

- card_generation
- document_embedding
- knowledge_qa

### status 需要覆盖

- queued
- running
- waiting_confirmation
- completed
- failed
- cancelled

### checkpoint_ref 建议约定

- bootstrap
- source_ready
- section_plan
- draft_sections
- dedupe
- evaluate
- review_batch_persisted
- human_gate
- finalize_cards

---

## 11. Provider 与 Embedding 能力约束

## 11.1 当前必须承认的现实

仓库中的 provider 契约目前存在历史包袱：

- 新契约与仓库记忆倾向于 `openai | anthropic | google | openai_compatible`
- 当前前端类型与部分 UI 仍保留 `custom`、`qianfan` 等历史别名

本文件的裁决是：

1. 工作流实现层以统一 provider 契约为目标。
2. 历史 `custom` 应规范化为 `openai_compatible`。
3. 类似 `qianfan` 这类专用入口若保留，只能作为 UI alias，底层仍必须归一到统一 provider 契约。

## 11.2 Chat Provider 与 Embedding Provider 解耦

这是本设计的重要要求。

聊天模型配置和 embedding 配置不能再被当作同一个东西。

原因：

- 某些 chat provider 不一定提供可用 embedding 能力。
- 即便都可用，也可能 dimensions 不同。
- 标准卡片生成路径要求 embedding readiness，必须有明确 embedding profile。

因此：

- Chat model config：用于草稿生成、评估、问答回答
- Embedding profile：用于向量索引和 Hybrid 检索

二者可以指向同一家 provider，也可以不是。

## 11.3 能力矩阵

首版实现按以下约束处理：

| Provider          | 聊天能力         | embedding 能力                                  | 处理策略                                            |
| ----------------- | ---------------- | ----------------------------------------------- | --------------------------------------------------- |
| openai            | 支持             | 支持                                            | 可自动推导默认 embedding profile                    |
| openai_compatible | 支持             | 条件支持                                        | 需要用户明确 embedding model，必要时要求 dimensions |
| anthropic         | 支持             | 不作为首版直接 embedding 来源                   | 需要绑定单独 embedding profile                      |
| google            | 作为目标契约预留 | 首版按未接通处理，除非明确实现 provider adapter | 需要单独完成后才能进入标准路径                      |

### 11.3.1 自动化规则

标准规则：

1. 如果默认 provider 本身可提供 embedding，且已存在 active embedding profile，则直接使用。
2. 如果默认 provider 不可提供 embedding，则在文档导入后提示用户补齐 embedding profile。
3. 如果 embedding profile 缺失，文档可以停留在 parsed，但不能进入 ready。

---

## 12. Hybrid RAG 设计

## 12.1 召回目标

Hybrid 检索的目标不是“把所有结果混在一起”，而是让：

- FTS5 负责关键词、专有名词、公式、精确措辞
- 向量召回负责同义表达、语义近邻、弱词面匹配

两者最终由统一排序器融合。

## 12.2 召回对象

检索对象必须是 child chunks，而不是 sections。

原因：

- child chunk 更适合精确命中
- citation 必须落到细粒度位置
- 向量相似度比较也更适合短文本单元

## 12.3 上下文注入对象

给 LLM 的上下文不直接是 child chunk，而是 child chunk 对应的 parent section。

这意味着：

- 检索命中对象：child chunk
- 生成上下文对象：parent section
- 引用定位对象：child anchor

## 12.4 RRF 融合

采用 Reciprocal Rank Fusion：

$$
score(d) = \frac{1}{60 + rank_{fts}(d)} + \frac{1}{60 + rank_{vec}(d)}
$$

规则：

1. FTS5 top-24
2. vector top-24
3. 合并去重后按 RRF 排序
4. 默认返回 top-8 child hits
5. 通过 section 去重和多样性约束，避免 top 结果全挤在同一段

### 12.4.1 多样性约束

默认约束：

- 同一个 section 最多贡献 2 个 top hit
- 若结果不足，再放宽限制补足到 top-K

## 12.5 降级策略

### 标准模式

- retrievalMode = hybrid

### 降级模式

若出现以下任一情况：

- sqlite-vec 扩展加载失败
- vec 表不存在
- active embedding profile 缺失
- 查询范围内文档处于 embedding_failed / embedding_stale

则检索模式降级为：

- retrievalMode = fts5

但对于文档 -> 卡片标准生成路径，不自动以这种降级模式替代 standard path，除非用户显式选择 fallback run。

---

## 13. LangGraph 卡片生成图设计

## 13.1 设计原则

图不是为了“看起来高级”，而是为了解决三个具体问题：

1. 文档可能很长，需要 section 级拆分和并行。
2. 生成、评估、人工审阅之间需要明确 checkpoint。
3. 用户确认是图内第一类事件，而不是图外旁路。

## 13.2 图中状态对象

建议定义统一状态：

```python
class CardGenerationState(TypedDict):
    run_id: str
    document_id: str
    document_status: str
    embedding_profile_revision: int | None
    section_tasks: list[dict]
    raw_drafts: list[dict]
    normalized_drafts: list[dict]
    deduped_drafts: list[dict]
    scored_drafts: list[dict]
    persisted_candidate_ids: list[str]
    accepted_candidate_ids: list[str]
    generation_mode: str
    fallback_reason: str | None
    events: list[dict]
```

## 13.3 节点定义

### 13.3.1 bootstrap

职责：

- 校验 run_id、document_id 是否存在
- 读取文档状态和 active embedding profile
- 读取生成参数（启用 card types、阈值、限额）

输出：

- 归一化初始 state

checkpoint_ref：bootstrap

### 13.3.2 ensure_source_ready

职责：

- 校验 documents.status 是否为 ready
- 若为 embedding / parsed，则返回等待型事件，不进入标准生成
- 若为 embedding_failed / embedding_stale，则拒绝标准路径

标准行为：

- 只有 ready 文档才能继续标准图执行

checkpoint_ref：source_ready

### 13.3.3 plan_sections

职责：

- 读取 document_sections
- 根据 section 数量、长度、类型做任务编排
- 估算每 section 的卡片配额

推荐配额逻辑：

- < 150 token：0-1 张
- 150-500 token：1-3 张
- 500-1200 token：2-4 张
- > 1200 token：拆成多个任务片段，每片 1-3 张

checkpoint_ref：section_plan

### 13.3.4 draft_sections

职责：

- 对每个 section task 启动子 agent 生成候选卡片
- 子 agent 只可访问：当前 section、相邻 section 简短摘要、对应 anchor/chunk 引用、允许的 card type 配置

子 agent 输出必须是结构化 `CardDraftBatch`。

规则：

- 不允许无来源地凭空扩写事实
- 不允许 choice 题伪造干扰项，除非 section 中明确存在可用选项对照
- 必须返回 source quote 或 source chunk id 列表

checkpoint_ref：draft_sections

### 13.3.5 normalize_drafts

职责：

- 统一 front/back 空白和格式
- 校验 cardType 是否有效
- 补齐 sourcePage、sourceParagraph、section_id、source_chunk_ids
- 生成 dedupe_key

checkpoint_ref：normalize

### 13.3.6 dedupe

职责：

- 批内 exact duplicate 去重
- 与历史 cards / pending candidates 做近重复检测
- 合并极度相似的候选

exact duplicate 规则：

```text
sha256(document_id :: anchor_id_or_section_id :: normalized_front :: normalized_back)
```

near duplicate 策略：

- front/back 标准化后 lexical similarity
- 必要时通过 Hybrid 检索或向量近邻比对候选语义相似度

checkpoint_ref：dedupe

### 13.3.7 evaluate

职责：

- 调用 Evaluation Agent 对候选打 6 维分数
- 计算 overall score
- 输出 visibility bucket

六个评分维度：

1. 信息密度
2. 问题清晰度
3. 答案完整性
4. 去重/唯一性
5. 学习友好性
6. 来源溯源质量

建议 overall 权重：

$$
overall = 0.18*density + 0.20*clarity + 0.18*completeness + 0.14*uniqueness + 0.18*learning + 0.12*anchor
$$

评分分桶：

- `overall >= 0.78` -> default
- `0.65 <= overall < 0.78` -> expanded
- `overall < 0.65` -> hidden_low_quality

额外拦截规则：

- `anchor_quality < 0.40` 时不得进入 default
- `completeness < 0.45` 时不得进入 default
- exact duplicate 直接进入 hidden_low_quality 或自动丢弃

checkpoint_ref：evaluate

### 13.3.8 persist_review_batch

职责：

- 把 scored_drafts 持久化到 card_candidates
- 保存 score、visibility、generation_mode、fallback_reason
- 发出 workflow event，通知前端有新候选可审阅

注意：

- 这里持久化的是 review batch，而不是正式 cards。
- 正式 cards 只能在 human gate 之后创建。

checkpoint_ref：review_batch_persisted

### 13.3.9 human_gate

职责：

- 使用 LangGraph interrupt() 中断执行
- workflow_run.status = waiting_confirmation
- 等待用户编辑与确认

恢复输入：

- accepted candidate ids
- rejected candidate ids
- edited fields（front/back/tags/cardType 等）

checkpoint_ref：human_gate

### 13.3.10 finalize_cards

职责：

- 读取 review batch 中 accepted 候选
- 应用用户编辑后的最终内容
- 创建正式 cards
- 生成 exportGuid 等稳定字段

checkpoint_ref：finalize_cards

### 13.3.11 complete_run

职责：

- 写入汇总事件
- 更新 workflow_run 为 completed
- 返回生成摘要（候选数、接受数、fallback 情况、token / cost 等）

## 13.4 fallback 路径

若模型调用失败、LangChain provider 缺失或结构化输出连续失败，可进入 fallback_rule 模式：

- 仅使用规则抽取生成少量候选
- generation_mode = fallback_rule
- fallback_reason 必须入库
- UI 必须标识该批次为规则回退结果

该模式用于系统韧性，不代表推荐体验。

---

## 14. 候选卡片质量评估与默认展示策略

## 14.1 评估输出模型

建议结构：

```python
class CardEvaluation(BaseModel):
    info_density: float
    clarity: float
    completeness: float
    uniqueness: float
    learning_fitness: float
    anchor_quality: float
    overall: float
    verdict: Literal['default', 'expanded', 'hidden_low_quality']
    reasons: list[str]
```

## 14.2 各维度定义

### 信息密度

衡量是否真正包含值得记忆的知识，而不是空泛、无效或纯改写。

### 清晰度

衡量 front 是否一眼就能理解在问什么，避免模糊、歧义或一次问太多件事。

### 完整性

衡量 back 是否真正回答了 front，是否缺关键限定条件。

### 唯一性

衡量候选和当前批次及历史卡片是否重复、近重复或过度重叠。

### 学习友好性

衡量该卡片是否适合间隔重复，不宜过长、过散、过复合。

### 溯源质量

衡量是否能稳定回跳到原文，来源 chunk / anchor 是否明确，引用是否足够具体。

## 14.3 审阅 UI 策略

前端默认只展示 `default` 分桶候选，用户可切换“显示全部候选”。

在卡片候选面板中，每个候选至少要显示：

- overall score
- generation_mode
- fallback_reason（如果有）
- section heading / hierarchy_path
- source page / paragraph / quote 摘要
- 可展开的详细评分 reasons

---

## 15. 人工审阅与中断恢复契约

## 15.1 审阅动作集

审阅阶段至少支持：

- accept
- reject
- edit front
- edit back
- edit tags
- edit cardType

## 15.2 恢复执行契约

当用户点击 finalize 时，前端向 Host 提交：

- run_id
- accepted candidate ids
- candidate edits

Host 持久化这些审批结果后，Python sidecar 通过 LangGraph resume 从 `human_gate` checkpoint 继续。

## 15.3 为什么必须图内恢复

如果把“人工审阅后物化 cards”做成图外单独命令，会导致：

- workflow_run 无法描述完整生命周期
- checkpoint 无法覆盖 human gate 之后的状态
- 审阅后的恢复和失败重试失去统一入口

因此必须保持：

- 审阅前：graph running -> waiting_confirmation
- 审阅后：graph resumed -> completed

---

## 16. 前端体验设计要求

## 16.1 文档状态呈现

Library / Documents 页面需要明确展示：

- parsed
- embedding
- ready
- embedding_failed
- embedding_stale

行为要求：

- `embedding`：默认静默进行，仅以轻量状态提示体现
- `ready`：允许生成卡片
- `embedding_failed`：主按钮禁用，并提供“查看原因”及“显式降级运行”入口
- `embedding_stale`：主按钮禁用，并提示“embedding profile 已变更，需重建索引”

## 16.2 候选面板要求

CardCandidatePanel 至少新增：

- 评分标签
- section 来源信息
- fallback 标签
- “显示全部候选”切换
- low quality 默认折叠

## 16.3 长任务体验

根据产品决策，本体系采取“后台静默处理 + 完成通知”为默认体验：

- 默认不强迫用户盯着进度条
- 但必须保留 workflow event 日志视图，便于排错和调试
- 重要状态变更需要通知，例如“文档已可生成卡片”“候选批次已就绪”“需要人工确认”

---

## 17. 安全、预算与可观测性

## 17.1 安全边界

- API keys / credentials 只存 Rust Host / Stronghold
- Python 只通过 HostGateway 获取当前执行所需的短时可用凭据，不持久化明文
- workflow event 中不得记录完整密钥、完整原始 provider 响应体

## 17.2 预算与成本

每次 run 应可聚合：

- 输入 token
- 输出 token
- embedding token
- cost_usd

这些数据应归属于 workflow_run，而不是散落在前端本地状态中。

## 17.3 关键事件与指标

至少要记录：

- 文档解析耗时
- section 数量
- child chunk 数量
- embedding 总耗时
- 向量写入数量
- Hybrid 检索是否降级
- 候选总数 / 默认展示数 / accepted 数
- fallback run 次数

---

## 18. 测试与验收矩阵

以下 acceptance ids 将作为后续开发必须覆盖的最小验收集。

| ID           | 名称                      | 验收点                                                   |
| ------------ | ------------------------- | -------------------------------------------------------- |
| D2C-IMP-01   | PDF 导入生成 sections     | 导入 PDF 后可持久化 sections、chunks、anchors            |
| D2C-IMP-02   | Markdown / 文本统一结构化 | MD/TXT 导入后也能产出合法 DocumentIR 与 sections         |
| D2C-CHUNK-01 | Parent-child 关联正确     | 每个 chunk 可追到 section_id                             |
| D2C-CHUNK-02 | 过长 section 正确补切     | 超长章节被切成多个 virtual sections                      |
| D2C-EMB-01   | active profile 建表与写入 | sqlite-vec 表按 active profile 维度创建并写入成功        |
| D2C-EMB-02   | profile 变更触发 stale    | 修改 embedding profile 后原 ready 文档变 embedding_stale |
| D2C-EMB-03   | embedding 完成进入 ready  | embedding 成功后文档状态进入 ready                       |
| D2C-EMB-04   | embedding 失败不伪装成功  | 文档状态变 embedding_failed，UI 正确提示                 |
| D2C-RAG-01   | Hybrid RRF 检索有效       | 同时命中 FTS5 与向量结果，融合排序正确                   |
| D2C-RAG-02   | child 命中 / parent 注入  | 问答上下文来自 section，citation 仍能回到 child anchor   |
| D2C-RAG-03   | FTS5 降级明确             | vec 不可用时 retrievalMode=fts5                          |
| D2C-AGT-01   | Graph checkpoint 持久化   | 各关键节点正确写 checkpoint                              |
| D2C-AGT-02   | 人工中断恢复              | waiting_confirmation 后可 resume 完成                    |
| D2C-AGT-03   | section 并行生成          | 多 section 文档可并行起草候选                            |
| D2C-EVAL-01  | 评分结果落库              | score_overall / score_details / visibility 正确保存      |
| D2C-EVAL-02  | 默认展示高分候选          | UI 默认展示 default 分桶                                 |
| D2C-FALL-01  | fallback 明确标记         | generation_mode / fallback_reason 在 UI 与 DB 中一致     |
| D2C-FIN-01   | accepted 候选物化为 cards | finalize 后 accepted 候选进入正式 cards                  |
| D2C-FIN-02   | rejected 候选不入 cards   | rejected 候选不会被 materialize                          |

---

## 19. 分阶段实施计划

## Phase A：契约与配置层对齐

目标：先消除 provider / status / schema 的基础冲突。

必须完成：

1. 文档状态枚举升级为本文件定义的目标状态集合
2. provider 命名归一与 alias 规则落地
3. chat model config 与 embedding profile 解耦
4. 相关 Zod schema / TS 类型 / Rust DTO 对齐

## Phase B：数据库迁移与存储层

目标：让 section、embedding profile、候选评分元数据有落点。

必须完成：

1. 新建 document_sections
2. 扩展 document_chunks
3. 新建 embedding_profiles
4. 扩展 card_candidates
5. sqlite-vec 扩展加载与 vec 表初始化

## Phase C：解析与层次化 chunking

目标：从 DocumentIR 派生稳定的 parent-child 结构。

必须完成：

1. PDF 路径 section / child chunk 生成
2. MD/TXT 统一派生
3. hierarchy_path、anchor 关联、chunk_kind 填充

## Phase D：Embedding 管道

目标：文档导入后能自动进入 embedding -> ready 主路径。

必须完成：

1. active embedding profile 读取
2. embedding job 创建与恢复
3. vec 写入
4. ready / embedding_failed / embedding_stale 流转

## Phase E：Hybrid 检索

目标：知识问答和去重辅助具备真实 Hybrid RRF 能力。

必须完成：

1. FTS5 + vec 并行召回
2. RRF 融合
3. child 命中 / parent context 注入
4. 降级模式明确化

## Phase F：LangGraph 文档 -> 卡片工作流

目标：线性 card_generation 升级为可恢复图工作流。

必须完成：

1. LangGraph 依赖接入
2. 节点与 checkpoint 落地
3. section 级 draft agent 并行
4. evaluate + human_gate + finalize 完整闭环

## Phase G：前端审阅与状态 UX

目标：让用户能看到正确状态、评分和回退信息。

必须完成：

1. 文档状态徽章与门禁
2. 候选评分显示
3. fallback 标签
4. 显式 finalize 恢复按钮链路

## Phase H：测试与文档对齐

目标：把实现从“能跑”提升到“可交付”。

必须完成：

1. 覆盖本文件 acceptance ids
2. 对齐 docs/spec.md、README.md、ai-orchestration.md 中的旧表述
3. 保证本文件与实现一致，不留规范债

---

## 20. 代码落点映射

以下是后续实现必须落到的主要文件区域。

### 20.1 Python 编排层

- xuejian/orchestration_service/workflows/card_generation_graph.py：新主图
- xuejian/orchestration_service/workflows/embedding.py：embedding 工作流
- xuejian/orchestration_service/workflows/knowledge_qa.py：升级为 Hybrid 检索接入
- xuejian/orchestration_service/clients/host_gateway.py：新增 sections / embeddings / hybrid_search / resume 支持
- xuejian/orchestration_service/parsing/docling_pipeline.py：section / child chunk 派生重构
- xuejian/orchestration_service/requirements.txt：加入 langgraph 等依赖

### 20.2 Rust Host / DB 层

- xuejian/src-tauri/src/db/document_repo.rs：状态扩展、sections / chunks 关联、Hybrid 查询入口
- xuejian/src-tauri/src/db/section_repo.rs：新增
- xuejian/src-tauri/src/db/vector_repo.rs：新增
- xuejian/src-tauri/src/db/workflow_repo.rs：checkpoint / workflow type 扩展
- xuejian/src-tauri/src/gateway/host_http.rs：新增 tool routes
- xuejian/src-tauri/src/commands/documents.rs：文档状态与 embedding 相关命令
- xuejian/src-tauri/src/commands/orchestration.rs：resume / finalize 相关命令对齐

### 20.3 TypeScript / UI 层

- xuejian/src/types/document.ts：状态、候选字段、embedding profile、section 类型定义
- xuejian/src/types/schema.ts：Zod 对齐
- xuejian/src/queries/documents.ts：文档状态查询与重试策略
- xuejian/src/queries/orchestration.ts：resume / event polling / review batch
- xuejian/src/components/cards/CardCandidatePanel.tsx：评分、分桶、fallback 标签
- xuejian/src/features/settings/SettingsPage.tsx：embedding profile 配置 UI
- xuejian/src/features/documents/：导入后 embedding 状态呈现

---

## 21. 明确拒绝的实现方式

以下做法明确禁止：

1. 在 Python 中直接写 SQLite。
2. 用独立向量数据库替代 sqlite-vec。
3. 让 embedding 逻辑隐式混在聊天 model config 里，无 active profile 概念。
4. 继续把 LangGraph 当“以后再说”，本次实现必须直接采用。
5. 用平面 chunk 替代 parent-child 双层结构。
6. 让候选卡片在没有评分和来源元信息的情况下直接进入默认审阅列表。
7. 在 embedding_failed 时假装文档已经 fully ready。
8. 在 fallback 结果上不打标，误导用户认为是正常模型生成。
9. 把人工审阅做成图外旁路命令，破坏 checkpoint / resume 闭环。

---

## 22. Definition Of Done

本子系统只有在以下条件全部满足时，才能被视为完成：

1. 文档导入后能稳定生成 sections、child chunks、anchors。
2. ready 的定义严格等于“结构化 + embedding 全部完成”。
3. Hybrid RRF 在 app.db 内可用，并可明确降级。
4. LangGraph 卡片生成图支持 checkpoint、interrupt、resume。
5. 候选卡片具备评分、可见性分桶、fallback 标识、来源 section / anchor 信息。
6. 用户能在 UI 中完成审阅并触发 finalize 恢复执行。
7. accepted 候选最终落为正式 cards，rejected 不落。
8. 本文件中的 acceptance ids 全部具备测试覆盖或等价自动验证。
9. 旧文档中的冲突表述已被更新或明确注明被本文件覆盖。

在以上条件没有全部满足前，不得宣布“Agent 驱动文档 -> 卡片工作流体系”开发完成。

---

## 23. 后续开发纪律

从本文件创建完成开始，后续所有相关实现都必须遵循以下纪律：

1. 任何实现步骤都必须能对应到本文件的某个 section、phase 或 acceptance id。
2. 若实现中发现本文件缺字段、缺状态、缺节点，不得私自绕开，必须先修订本文件再继续编码。
3. 若需要偏离本文件的核心决策，必须先说明偏离原因，再修订本文件，然后才能改代码。
4. 所有“暂时这么写、以后再收敛”的架构债，视为未完成而不是已完成。

本文件不是背景材料，而是实现合同。
## 0. 2026-04-24 主流程修订

本文档中关于“候选卡片、人工审阅、Human Gate、waiting_confirmation、finalize/resume 后再物化”的旧设计已被 `docs/card-system-v2.md` 的 2026-04-24 主流程修订覆盖。

当前卡片生成主路径为：

```text
文档就绪 -> Agent 生成、校验、去重与质量过滤 -> 正式 cards 自动落库 -> 用户对正式卡片增删查改
```

本文件仍可作为上游解析、RAG、section/chunk、来源追溯和质量评估设计参考，但不得再把人工审批作为卡片生成主路径要求。低质量生成结果直接丢弃，不进入用户可见草稿或候选审批队列。
