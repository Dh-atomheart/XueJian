# 学笺知识图谱系统设计文档

---

## 0. 文档优先级与约束

本文件是 XueJian 中"知识图谱"子系统的主设计文档。自本文件生效起，后续编码、测试、迁移、UI 调整、工作流改造，都必须以本文件为准。

**冲突处理规则**：

1. 本文件 > `docs/spec.md` 中 V4 知识图谱章节
2. 本文件 > 现有代码（`knowledge_graph.py`、`KnowledgeGraphPage.tsx` 等）
3. 本文件未覆盖的细节，由实现者按本文件的设计原则自行决定，并记录在 commit message 中
4. 如需变更本文件的设计决策，必须先更新本文件

**约束**：

- 所有外部 API 调用使用用户提供的 Key（BYOK）
- SQLite 是唯一持久化存储，Python 不直接写库
- Python orchestration service 负责管线执行，不持有明文密钥
- 前端不直接调用 Python，一切经 Rust Host IPC

---

## 1. 目标与问题定义

### 1.1 现有骨架的不足

当前知识图谱实现（V4-1 骨架）存在以下结构性不足：

1. **构建管线原始**：`knowledge_graph.py` 单次 LLM 调用，最多 20 个 chunk、8000 字符上限，无分段、无增量、无社区检测
2. **无可视化**：`KnowledgeGraphPage.tsx` 是纯列表式 UI，无图谱画布，无法一览知识结构
3. **关系类型自由文本**：`relation` 字段无约束，LLM 输出不一致，无法做结构化查询
4. **无 RAG 增强**：图谱数据未参与检索增强，知识问答和卡片生成无法利用图谱上下文
5. **无 Agent 集成**：Agent 不查询也不更新图谱，图谱是孤立的数据孤岛
6. **无社区/摘要**：缺少社区检测和摘要生成，用户无法快速理解知识主题分布

### 1.2 设计目标

1. **GraphRAG 风格构建管线**：5 阶段管线（分块→抽取→消歧→社区检测→摘要），支持智能增量更新
2. **Sigma.js 交互式可视化**：全局视图+探索式视图双模式，力导向布局，类型配色+度大小
3. **预定义关系体系**：8 种核心关系类型，LLM 抽取时约束输出
4. **全量 GraphRAG 增强**：实体检索+关系路径+社区摘要三层增强，与传统 RAG 并行融合
5. **图谱嵌入向量化**：LLM-based 实体描述嵌入，支持实体语义检索+关系推理
6. **Agent 双向集成**：所有 Agent 可查询（上下文注入+工具调用）和更新图谱
7. **两层社区+可折叠**：Leiden 社区检测，结构化摘要，社区可折叠为超级节点
8. **可编辑图谱**：用户可在可视化界面直接编辑节点和边

---

## 2. 设计原则

### 2.1 单一事实源

SQLite 是唯一持久化存储。Python orchestration service 通过 `HostGatewayClient` 读写数据，不直接操作数据库文件。

### 2.2 宿主拥有边界

Rust Host 拥有所有 IPC 命令、数据库操作和密钥存储。Python 仅负责管线执行和 LLM 调用。

### 2.3 GraphRAG 线性管线

构建管线是线性 5 阶段流程，不使用 LangGraph 的图式编排。每个阶段有明确的输入/输出和 checkpoint。

### 2.4 默认可恢复

所有长任务支持 checkpoint 断点续传、取消丢弃、预算控制。复用播客系统的长任务管理机制。

### 2.5 BYOK

所有 LLM 调用使用用户在设置中配置的 API Key，应用不内置任何密钥。

### 2.6 降级优先

LLM 抽取失败降级为规则抽取；社区检测失败降级为简单聚类；Python 不可用时 Rust 侧提供 fallback。

---

## 3. 系统架构总览

```
┌─────────────────────────── Tauri 2 窗口 ───────────────────────────┐
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  React 19 + Sigma.js + Graphology                            │   │
│  │                                                               │   │
│  │  KnowledgeGraphPage                                           │   │
│  │  ├─ GraphCanvas (Sigma.js WebGL)                              │   │
│  │  ├─ NodeDetailPanel (右侧可折叠)                               │   │
│  │  ├─ StatsBar (顶部统计)                                        │   │
│  │  ├─ SearchBar (名称搜索)                                       │   │
│  │  └─ BuildWizard (构建/增量更新)                                │   │
│  └──────────────┬───────────────────────────────────────────────┘   │
│                  │ IPC (invokeWithSchema + Zod)                      │
│  ┌──────────────▼───────────────────────────────────────────────┐   │
│  │  Rust Host (Tauri)                                           │   │
│  │  ├─ commands/knowledge_graph.rs (IPC 命令)                    │   │
│  │  ├─ db/knowledge_graph_repo.rs (Repository)                   │   │
│  │  ├─ db/community_repo.rs (Community Repository)               │   │
│  │  └─ SQLite (knowledge_nodes/edges/communities/...)            │   │
│  └──────────────┬───────────────────────────────────────────────┘   │
│                  │ HTTP (localhost)                                  │
│  ┌──────────────▼───────────────────────────────────────────────┐   │
│  │  Python Orchestration Service                                │   │
│  │  ├─ workflows/knowledge_graph.py (5阶段 GraphRAG 管线)        │   │
│  │  ├─ workflows/graph_embedding.py (实体嵌入生成)                │   │
│  │  ├─ providers/graph_rag.py (GraphRAG 增强检索)                 │   │
│  │  ├─ schemas/knowledge_graph.py (Pydantic 结构化输出)            │   │
│  │  └─ clients/host_gateway.py (HostGatewayClient)               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**数据流**：

1. 前端 → IPC → Rust Host → HTTP → Python 管线执行
2. Python 管线 → HostGatewayClient → Rust Host → SQLite 持久化
3. 前端 ← IPC ← Rust Host ← SQLite 查询
4. Agent → Tool/上下文注入 → Rust Host → SQLite 查询图谱
5. Agent → HostGatewayClient → Rust Host → SQLite 更新图谱

---

## 4. 用户交互设计

### 4.1 知识图谱页面布局

```
┌─────────────────────────────────────────────────────────────────┐
│  StatsBar: 节点数 | 边数 | 社区数 | 类型分布 | 构建记录        │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │  NodeDetailPanel   │
│                                           │  (可折叠)           │
│          GraphCanvas                      │                     │
│          (Sigma.js WebGL)                 │  ── 标签            │
│                                           │  ── 类型            │
│   [全局视图 / 探索式视图] 切换             │  ── 别名            │
│                                           │  ── 来源文档        │
│   搜索: [________]                        │                     │
│                                           │  ── 操作按钮        │
│                                           │  编辑/删除/合并     │
│                                           │  展开邻居/跳转源   │
│                                           │                     │
└───────────────────────────────────────────┴─────────────────────┘
```

### 4.2 双模式视图

**全局视图**：

- 一次性渲染所有节点和边
- Sigma.js WebGL 渲染，支持缩放/平移
- 适合中规模图谱（500-2000 节点）快速一览
- 大规模图谱（5000+）自动切换到探索式视图或提示用户筛选

**探索式视图**：

- 从用户选择的起始节点出发
- 点击节点展开其直接邻居（1-hop）
- 逐步扩展探索范围
- 适合深度理解特定知识区域

**模式切换**：顶部工具栏提供切换按钮，切换时保留当前选中节点。

### 4.3 节点操作

点击节点后，右侧详情面板展示基础信息，并提供以下操作按钮：

| 操作 | 说明 |
|------|------|
| 查看详情 | 展示标签/类型/别名/来源文档 |
| 编辑 | 修改标签/类型/别名 |
| 删除 | 删除节点及其关联边 |
| 展开邻居 | 在画布上显示该节点的直接邻居（探索式视图核心操作） |
| 跳转源文档 | 打开源文档阅读器，定位到相关段落 |
| 合并 | 选择另一个节点合并到此节点 |

### 4.4 边操作

点击边后，弹出小型 tooltip 展示：

- 关系类型（如 `is_a`、`depends_on`）
- 置信度百分比
- 来源文档名

### 4.5 搜索

顶部搜索栏，支持节点名称搜索。输入关键词后：

- 匹配的节点高亮显示
- 非匹配节点降低透明度
- 画布自动聚焦到第一个匹配节点

### 4.6 图谱构建向导

用户通过向导触发图谱构建/增量更新：

1. **选择文档**：多选文档（支持新增文档增量更新）
2. **确认构建**：展示预估规模 + "开始构建"按钮
3. **进度展示**：5 阶段进度条 + 取消按钮

### 4.7 统计栏

顶部统计栏展示：

- 总节点数 / 总边数 / 社区数
- 节点类型分布（5 种类型的小型条形图）
- 最近一次构建记录（状态/时间/节点数）

---

## 5. 可视化设计规范

### 5.1 节点配色方案

按节点类型分配颜色，基于学笺"极简学术感"视觉基线，使用柔和学术色系：

| 节点类型 | 主色 | Hex | 说明 |
|----------|------|-----|------|
| `concept` | 靛蓝 | `#5B8DEF` | 核心概念，最常见，蓝色系主色调 |
| `person` | 琥珀 | `#E8A838` | 人物，暖色区分 |
| `event` | 翠绿 | `#4CAF7D` | 事件，绿色系 |
| `formula` | 紫罗兰 | `#9C6ADE` | 公式，紫色系 |
| `term` | 珊瑚 | `#E06C75` | 术语，红色系 |

**节点大小**：

- 基础大小：`minSize = 8`
- 按连接度缩放：`size = minSize + Math.log2(degree + 1) * 4`
- 最大限制：`maxSize = 30`

**节点形状**：统一圆形（Sigma.js 的 `circle` renderer）

### 5.2 边样式

**颜色**：按关系类型分配颜色，使用比节点色更淡的变体：

| 关系类型 | 颜色 | Hex | 类别 |
|----------|------|-----|------|
| `is_a` | 靛蓝淡 | `#8BB0F5` | 层次 |
| `part_of` | 靛蓝淡 | `#8BB0F5` | 层次 |
| `depends_on` | 琥珀淡 | `#F0C06A` | 依赖 |
| `causes` | 翠绿淡 | `#7DCBA4` | 因果 |
| `related_to` | 灰色 | `#A0A0A0` | 相似 |
| `similar_to` | 灰蓝 | `#90A8C0` | 相似 |
| `uses` | 紫罗兰淡 | `#B89AE6` | 交互 |
| `produces` | 珊瑚淡 | `#E8989F` | 交互 |

**标签**：边上显示关系类型名称（Sigma.js edge labels）

**箭头**：所有边默认显示箭头（有向关系）

**透明度**：`opacity = 0.3 + confidence * 0.7`，置信度越低越透明

**线宽**：`width = 1 + confidence * 2`

### 5.3 社区可视化

**两层社区**：

- **底层社区**（Level 0）：紧密小社区，节点间关系密集
- **高层社区**（Level 1）：松散大社区，包含多个底层社区

**可视化方式**：

- 社区可折叠为超级节点（compound node）
- 折叠后显示社区摘要标题
- 展开后显示内部成员节点
- 社区超级节点大小 = 内部节点数

**社区边框**：同一社区的节点在折叠状态下，超级节点边框使用社区专属颜色（独立于节点类型配色）

### 5.4 布局策略

**力导向布局**（ForceAtlas2）：

- Graphology 的 `forceAtlas2` 算法
- 适合发现自然聚类结构
- 参数：`gravity: 1`, `scalingRatio: 2`, `barnesHutOptimize: true`

**布局触发时机**：

- 初始加载：运行 ForceAtlas2 100 次迭代
- 增量更新后：对新节点运行局部布局
- 切换视图模式：保留当前布局坐标

---

## 6. GraphRAG 构建管线

### 6.1 管线总览

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Stage 1 │───▶│ Stage 2 │───▶│ Stage 3 │───▶│ Stage 4 │───▶│ Stage 5 │
│ 文档分块 │    │ 实体/关系│    │ 实体消歧 │    │ 社区检测 │    │ 社区摘要 │
│         │    │ 抽取     │    │ +合并    │    │ (Leiden)│    │ 生成     │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
     │              │              │              │              │
     ▼              ▼              ▼              ▼              ▼
  chunks       raw_nodes      merged_nodes   communities    summaries
               raw_edges      merged_edges   (2-level)     (structured)
```

### 6.2 Stage 1: 文档分块

**输入**：

```python
document_ids: list[str]   # 用户选择的文档 ID 列表
```

**处理**：

1. 通过 `host.list_document_chunks(doc_id)` 获取每个文档的已有 chunks
2. 如果文档无 chunks，调用 `host.get_document_text(doc_id)` 获取全文并按 512 token 滑动窗口分块
3. 对 chunks 按文档分组，记录每个 chunk 的 `document_id`、`page`、`hierarchy_path`

**输出**：

```python
class ChunkInfo(TypedDict):
    chunk_id: str
    document_id: str
    content: str
    page: int | None
    hierarchy_path: list[str]
```

**分段构建**：当文档数 > 20 或预估 chunks > 200 时，按文档分组分段执行 Stage 2-3。

### 6.3 Stage 2: 实体/关系抽取

**输入**：`chunks: list[ChunkInfo]`

**处理**：

对每个 chunk（或 chunk 批次，每批 5-10 个 chunk），调用 LLM 抽取实体和关系。

**LLM System Prompt**：

```
You are a knowledge extraction assistant for a learning application.
Extract entities and relationships from the given text.

Entity types (choose exactly one):
- concept: abstract ideas, theories, principles, frameworks
- person: named individuals, researchers, historical figures
- event: named events, discoveries, historical occurrences
- formula: mathematical formulas, equations, chemical formulas
- term: technical terms, jargon, definitions

Relationship types (choose exactly one from the list):
- is_a: A is a type/kind of B
- part_of: A is a component/part of B
- depends_on: A requires/depends on B
- causes: A causes/leads to B
- related_to: A is related to B (general association)
- similar_to: A is similar/analogous to B
- uses: A uses/utilizes B
- produces: A produces/generates/outputs B

Rules:
- Only extract entities and relationships clearly supported by the text.
- Do not infer unsupported facts.
- Each entity must have a concise label (2-8 words).
- Each entity may have aliases (alternative names).
- Assign confidence 0.0-1.0 for each relationship.
- Output JSON only.
```

**LLM User Prompt Template**：

```
Extract entities and relationships from the following text.

Text:
{chunk_content}

Output JSON with this exact shape:
{
  "nodes": [
    {"label": "...", "type": "concept|person|event|formula|term", "aliases": [...], "description": "..."}
  ],
  "edges": [
    {"fromLabel": "...", "toLabel": "...", "relation": "is_a|part_of|depends_on|causes|related_to|similar_to|uses|produces", "confidence": 0.0-1.0}
  ]
}
```

**Pydantic 结构化输出**：

```python
class ExtractedNode(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: Literal["concept", "person", "event", "formula", "term"]
    aliases: list[str] = Field(default_factory=list)
    description: str = Field(default="", max_length=500)

class ExtractedEdge(BaseModel):
    from_label: str
    to_label: str
    relation: Literal["is_a", "part_of", "depends_on", "causes", "related_to", "similar_to", "uses", "produces"]
    confidence: float = Field(ge=0.0, le=1.0)

class ExtractionResult(BaseModel):
    nodes: list[ExtractedNode] = Field(default_factory=list)
    edges: list[ExtractedEdge] = Field(default_factory=list)
```

**降级策略**：LLM 不可用时，使用规则抽取（正则匹配大写名词短语为 term，"is a" 句式为 is_a 关系等）。

**Checkpoint**：每处理 10 个 chunks 后写入 checkpoint（已处理的 chunk 数 + 已抽取的 nodes/edges）。

### 6.4 Stage 3: 实体消歧与合并

**输入**：`raw_nodes: list[dict]`, `raw_edges: list[dict]`

**处理**：

1. **标签归一化**：去除首尾空白、统一大小写比较
2. **精确匹配**：相同标签（忽略大小写）的节点合并
3. **别名匹配**：节点 A 的别名包含节点 B 的标签，或反之，则合并
4. **语义匹配**：对未精确匹配的节点，计算 LLM-based embedding 余弦相似度，阈值 > 0.85 时合并
5. **合并策略**：
   - 保留较早创建的节点为 target
   - 将 source 的别名、来源文档、关联边合并到 target
   - 删除重复边（相同 from/to/relation）
   - 删除自环边

**合并冲突处理**：当新旧数据冲突时（如同名节点类型不同），取置信度更高的版本。

**输出**：`merged_nodes`, `merged_edges`（所有节点已有持久化 ID，边引用持久化 ID）

### 6.5 Stage 4: 社区检测（Leiden）

**输入**：`merged_nodes`, `merged_edges`

**处理**：

1. 使用 `leidenalg` 对图谱执行 Leiden 社区检测
2. 生成两层社区结构：
   - **底层社区**（resolution_parameter=1.0）：紧密小社区
   - **高层社区**（resolution_parameter=0.3）：松散大社区
3. 每个节点记录其所属的底层社区 ID 和高层社区 ID

**依赖**：`leidenalg` + `python-igraph`

**降级策略**：leidenalg 不可用时，使用连通分量 + K-core 分解作为简单聚类替代。

**输出**：

```python
class Community(TypedDict):
    id: str
    level: int              # 0=底层, 1=高层
    title: str              # 社区标题（暂为空，Stage 5 填充）
    member_node_ids: list[str]
    parent_community_id: str | None   # 高层社区的父社区=None，底层社区的父社区=所属高层社区
    summary_json: str | None          # Stage 5 填充
    created_at: str
```

### 6.6 Stage 5: 社区摘要生成

**输入**：`communities: list[Community]`, `merged_nodes`, `merged_edges`

**处理**：

对每个社区，收集其成员节点的标签、描述和内部关系，调用 LLM 生成结构化摘要。

**LLM Prompt**：

```
You are a knowledge summarization assistant.
Given a list of entities and their relationships within a community, generate a structured summary.

Entities: {entity_labels_and_descriptions}
Relationships: {edge_list}

Output JSON with this exact shape:
{
  "title": "concise community title (3-8 words)",
  "summary": "2-3 sentence overview of this knowledge community",
  "key_entities": ["top 3-5 most central entities"],
  "core_relations": ["top 3-5 most important relationships"],
  "knowledge_gaps": ["potential missing connections or areas for further study"]
}
```

**Pydantic Schema**：

```python
class CommunitySummary(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    summary: str = Field(min_length=20, max_length=500)
    key_entities: list[str] = Field(min_length=1, max_length=10)
    core_relations: list[str] = Field(min_length=1, max_length=10)
    knowledge_gaps: list[str] = Field(default_factory=list)
```

**优化**：高层社区的摘要基于其下属底层社区的摘要生成（而非原始节点），减少 token 消耗。

**输出**：每个社区的 `summary_json` 被填充。

### 6.7 增量更新流程

当用户新增文档并触发增量更新时：

1. **仅处理新文档**：Stage 1 仅获取新文档的 chunks
2. **执行 Stage 2-3**：对新 chunks 抽取实体/关系，与现有图谱做语义匹配消歧
3. **合并到现有图谱**：新增节点/边写入 SQLite，消歧后合并到已有节点
4. **重新执行 Stage 4-5**：社区检测和摘要需要在完整图谱上重新计算（增量社区检测质量难以保证）
5. **保留用户编辑**：用户手动编辑的节点/边标记 `user_edited=True`，增量更新时不覆盖

---

## 7. 预定义关系体系

### 7.1 关系类型定义

| 关系类型 | 中文名 | 类别 | 有向 | 逆关系 | 说明 |
|----------|--------|------|------|--------|------|
| `is_a` | 是...的一种 | 层次 | 是 | — | A 是 B 的子类型/子类 |
| `part_of` | 是...的一部分 | 层次 | 是 | `has_part` | A 是 B 的组成部分 |
| `depends_on` | 依赖于 | 依赖 | 是 | `required_by` | A 的存在/正确性依赖 B |
| `causes` | 导致 | 因果 | 是 | `caused_by` | A 导致/引起 B |
| `related_to` | 相关 | 相似 | 否 | — | A 与 B 有一般性关联 |
| `similar_to` | 相似 | 相似 | 否 | — | A 与 B 在某方面相似/类比 |
| `uses` | 使用 | 交互 | 是 | `used_by` | A 使用/利用 B |
| `produces` | 产生 | 交互 | 是 | `produced_by` | A 产生/生成 B |

### 7.2 LLM 抽取约束

LLM 在抽取关系时必须从上述 8 种中选择，不允许自由文本关系。Prompt 中明确列出所有关系类型及其定义。

如果 LLM 输出的关系类型不在列表中，映射规则：

- 包含 "type/kind/subclass" → `is_a`
- 包含 "component/contains/part" → `part_of`
- 包含 "require/need/prerequisite" → `depends_on`
- 包含 "cause/lead/result/enable" → `causes`
- 包含 "use/apply/utilize" → `uses`
- 包含 "produce/generate/create/output" → `produces`
- 包含 "similar/analogous/equivalent" → `similar_to`
- 其他 → `related_to`

### 7.3 关系置信度

LLM 为每条关系输出 0.0-1.0 的置信度。置信度语义：

| 范围 | 含义 | 可视化 |
|------|------|--------|
| 0.8-1.0 | 文本明确支持 | 实线，高透明度 |
| 0.5-0.8 | 文本隐含支持 | 实线，中等透明度 |
| 0.3-0.5 | 推断，可能不准确 | 虚线，低透明度 |
| < 0.3 | 高度不确定 | 极淡虚线 |

---

## 8. 社区检测与摘要

### 8.1 Leiden 算法配置

```python
import leidenalg
import igraph as ig

def detect_communities(nodes: list[dict], edges: list[dict]) -> list[Community]:
    """Run Leiden community detection with two resolution levels."""
    g = ig.Graph()
    g.add_vertices(len(nodes))
    g.vs["label"] = [n["label"] for n in nodes]
    g.vs["node_id"] = [n["id"] for n in nodes]

    # Build edge list with index mapping
    node_id_to_idx = {n["id"]: i for i, n in enumerate(nodes)}
    edge_tuples = []
    weights = []
    for e in edges:
        src = node_id_to_idx.get(e["fromNodeId"])
        tgt = node_id_to_idx.get(e["toNodeId"])
        if src is not None and tgt is not None:
            edge_tuples.append((src, tgt))
            weights.append(e.get("confidence", 0.5))
    g.add_edges(edge_tuples)
    g.es["weight"] = weights

    # Level 0: tight communities (high resolution)
    partition_l0 = leidenalg.find_partition(
        g,
        leidenalg.ModularityVertexPartition,
        resolution_parameter=1.0,
        seed=42,
    )

    # Level 1: loose communities (low resolution)
    partition_l1 = leidenalg.find_partition(
        g,
        leidenalg.ModularityVertexPartition,
        resolution_parameter=0.3,
        seed=42,
    )

    # Build community objects
    communities = []
    # ... (map partitions to Community objects with parent relationships)
    return communities
```

### 8.2 两层社区结构

```
Level 1 (高层): [社区A: "机器学习基础"] ──────────────────────────────┐
                    ├── Level 0 (底层): [社区A-1: "监督学习"]           │
                    ├── Level 0 (底层): [社区A-2: "无监督学习"]         │
                    └── Level 0 (底层): [社区A-3: "强化学习"]           │
Level 1 (高层): [社区B: "数学基础"] ─────────────────────────────────┤
                    ├── Level 0 (底层): [社区B-1: "线性代数"]           │
                    └── Level 0 (底层): [社区B-2: "概率统计"]           │
                                                                       │
底层社区的 parent_community_id 指向其所属的高层社区 ────────────────────┘
```

### 8.3 结构化摘要格式

```json
{
  "title": "监督学习方法论",
  "summary": "该社区涵盖监督学习的核心方法论，包括分类与回归两大任务范式，以及模型评估与选择策略。关键概念包括偏差-方差权衡、交叉验证和正则化。",
  "key_entities": ["监督学习", "分类", "回归", "交叉验证", "正则化"],
  "core_relations": [
    "分类 is_a 监督学习",
    "回归 is_a 监督学习",
    "交叉验证 uses 监督学习",
    "正则化 depends_on 偏差-方差权衡"
  ],
  "knowledge_gaps": [
    "缺乏集成学习与监督学习的关系",
    "半监督学习未出现在图谱中"
  ]
}
```

### 8.4 社区可折叠可视化

**折叠状态**：

- 社区显示为单个超级节点
- 超级节点标签 = 社区标题
- 超级节点大小 = `minSize + Math.log2(memberCount + 1) * 6`
- 超级节点颜色 = 社区专属颜色（从高层社区调色板分配）
- 社区间边 = 跨社区原始边的聚合（取最高置信度）

**展开状态**：

- 显示社区内所有成员节点（使用节点类型配色）
- 社区边界用半透明背景色块圈出
- 点击社区超级节点 → 展开/折叠切换

---

## 9. GraphRAG 增强检索

### 9.1 三层增强架构

```
┌─────────────────────────────────────────────────────┐
│                  用户查询                             │
└───────────┬─────────────────────────────────────────┘
            │
    ┌───────▼────────┐
    │  实体检索 Layer │  ← 识别查询中的实体，检索关联文档段落
    └───────┬────────┘
            │
    ┌───────▼────────────┐
    │  关系路径 Layer     │  ← 沿关系路径扩展上下文
    └───────┬────────────┘
            │
    ┌───────▼────────────┐
    │  社区摘要 Layer     │  ← 检索相关社区的宏观上下文
    └───────┬────────────┘
            │
    ┌───────▼────────────┐
    │  并行融合 (RRF)     │  ← GraphRAG 结果 + 传统 RAG 结果 RRF 融合
    └────────────────────┘
```

### 9.2 实体检索 Layer

**流程**：

1. 从用户查询中识别实体（通过 LLM 或关键词匹配图谱节点标签/别名）
2. 查询匹配实体关联的文档 chunks（通过 `source_ids` 反查）
3. 返回关联 chunks 作为上下文

**查询接口**：

```python
def search_by_entities(
    query: str,
    host: HostGatewayClient,
    top_k: int = 10,
) -> list[dict]:
    """Search document chunks by matching entities in the knowledge graph."""
```

### 9.3 关系路径 Layer

**流程**：

1. 从查询中识别核心实体 A
2. 沿关系路径扩展：A → (relation) → B → (relation) → C，最多 2-hop
3. 收集路径上所有实体关联的文档 chunks
4. 对路径上的关系做优先级排序：`is_a` > `depends_on` > `causes` > `uses` > `produces` > `part_of` > `similar_to` > `related_to`

**查询接口**：

```python
def search_by_relation_path(
    entity_id: str,
    max_hops: int = 2,
    host: HostGatewayClient,
    top_k: int = 10,
) -> list[dict]:
    """Search document chunks by expanding relation paths from an entity."""
```

### 9.4 社区摘要 Layer

**流程**：

1. 从查询中识别实体，查找其所属社区
2. 获取社区的结构化摘要
3. 将社区摘要作为宏观上下文补充

**查询接口**：

```python
def search_by_community(
    entity_id: str,
    host: HostGatewayClient,
) -> CommunitySummary | None:
    """Get the community summary for an entity's community."""
```

### 9.5 并行融合（RRF）

GraphRAG 检索结果与传统 FTS5+sqlite-vec 混合检索结果并行执行，使用 Reciprocal Rank Fusion (RRF) 融合排序：

```python
def fused_search(
    query: str,
    host: HostGatewayClient,
    top_k: int = 10,
    rrf_k: int = 60,
) -> list[dict]:
    """Hybrid search: GraphRAG + traditional RAG, fused with RRF."""
    # 1. Run traditional RAG (FTS5 + sqlite-vec)
    trad_results = host.hybrid_search(query, top_k=top_k * 2)

    # 2. Run GraphRAG layers
    entity_results = search_by_entities(query, host, top_k=top_k * 2)
    path_results = search_by_relation_path(query, host, top_k=top_k * 2)
    community_context = search_by_community(query, host)

    # 3. RRF fusion
    all_results = [trad_results, entity_results, path_results]
    fused = rrf_fuse(all_results, k=rrf_k)

    return fused[:top_k]
```

**RRF 公式**：

```
score(doc) = Σ 1/(k + rank_i(doc))
```

其中 `rank_i(doc)` 是文档在第 i 个检索结果列表中的排名。

---

## 10. 图谱嵌入与向量化

### 10.1 LLM-based 实体描述嵌入

**流程**：

1. 对每个知识节点，调用 LLM 生成实体描述（Stage 2 抽取时已生成 `description` 字段）
2. 使用现有嵌入管线（`document_embedding.py` 的 embedding profile）对描述文本生成向量
3. 向量存储在 `entity_embeddings` 表中，通过 `node_id` 关联

**优势**：

- 复用现有嵌入管线，无需引入 Node2Vec/TransE 等额外模型
- 实体描述包含语义信息，嵌入质量高
- 与文档嵌入使用同一向量空间，可直接做跨模态检索

### 10.2 实体语义检索

```python
def search_similar_entities(
    query_text: str,
    host: HostGatewayClient,
    top_k: int = 10,
    threshold: float = 0.7,
) -> list[dict]:
    """Find entities semantically similar to the query text."""
    # 1. Embed query text using the same embedding profile
    query_vec = embed_text(query_text, host)

    # 2. Search entity_embeddings via sqlite-vec
    results = host.vector_search_entity(query_vec, top_k=top_k)

    # 3. Filter by threshold
    return [r for r in results if r["similarity"] >= threshold]
```

### 10.3 关系推理

基于实体嵌入的余弦相似度，推断可能存在但未抽取的关系：

```python
def infer_relations(
    node_id: str,
    host: HostGatewayClient,
    top_k: int = 5,
    similarity_threshold: float = 0.85,
) -> list[dict]:
    """Infer potential relations for a node based on embedding similarity."""
    # 1. Get node's embedding
    node_vec = host.get_entity_embedding(node_id)

    # 2. Find similar entities
    similar = host.vector_search_entity(node_vec, top_k=top_k * 2)

    # 3. Filter out existing relations
    existing = host.list_graph_edges(node_id)
    existing_ids = {e["fromNodeId"] for e in existing} | {e["toNodeId"] for e in existing}

    # 4. Return inferred relations (not yet in graph)
    inferred = []
    for s in similar:
        if s["node_id"] not in existing_ids and s["similarity"] >= similarity_threshold:
            inferred.append({
                "fromNodeId": node_id,
                "toNodeId": s["node_id"],
                "relation": "similar_to",  # default inferred relation
                "confidence": s["similarity"] * 0.7,  # discount inferred confidence
                "inferred": True,
            })
    return inferred[:top_k]
```

推断的关系标记 `inferred=True`，在可视化中用虚线表示，不自动入库。用户可选择确认后入库。

---

## 11. Agent 双向集成

### 11.1 Agent 查询图谱

**方式一：上下文注入**

在 Agent 的 system prompt 中自动注入相关图谱上下文：

```python
def inject_graph_context(
    query: str,
    host: HostGatewayClient,
) -> str:
    """Generate graph context string for Agent system prompt."""
    # 1. Find relevant entities
    entities = search_similar_entities(query, host, top_k=5)

    if not entities:
        return ""

    # 2. Get their relations
    context_parts = []
    for entity in entities[:3]:
        edges = host.list_graph_edges(entity["id"])
        community = search_by_community(entity["id"], host)
        context_parts.append(
            f"Entity: {entity['label']} (type: {entity['type']})\n"
            f"Relations: {format_edges(edges)}\n"
            f"Community: {community.title if community else 'N/A'}\n"
        )

    return "Knowledge Graph Context:\n" + "\n".join(context_parts)
```

**方式二：工具调用**

提供 LangChain Tool 供 Agent 主动查询：

```python
from langchain_core.tools import tool

@tool
def query_knowledge_graph(action: str, **kwargs) -> str:
    """Query the knowledge graph.

    Actions:
    - search_entities: Search entities by name. Args: query (str)
    - get_neighbors: Get neighboring nodes. Args: node_id (str), depth (int, default 1)
    - get_community: Get community summary. Args: node_id (str)
    - get_relation_path: Find path between two entities. Args: from_id (str), to_id (str)
    - search_similar: Find semantically similar entities. Args: query (str)
    """
```

### 11.2 Agent 更新图谱

**自动更新机制**：

Agent 在工作流执行中发现新实体/关系时，通过 `HostGatewayClient` 写入图谱：

```python
def agent_update_graph(
    discovered_entities: list[dict],
    discovered_relations: list[dict],
    host: HostGatewayClient,
) -> dict:
    """Agent writes discovered entities/relations to the knowledge graph."""
    nodes_created = 0
    edges_created = 0

    for entity in discovered_entities:
        # Check if entity already exists (by label/alias matching)
        existing = host.find_node_by_label(entity["label"])
        if existing:
            # Merge: add new source_ids
            continue
        # Create new node
        host.create_knowledge_node(entity)
        nodes_created += 1

    for relation in discovered_relations:
        # Check for duplicate edges
        host.create_knowledge_edge(relation)
        edges_created += 1

    return {"nodesCreated": nodes_created, "edgesCreated": edges_created}
```

### 11.3 各 Agent 集成方案

| Agent | 查询方式 | 更新方式 | 说明 |
|-------|----------|----------|------|
| 卡片生成 Agent | 上下文注入 | 自动更新 | 注入文档相关实体上下文；抽取新实体写入图谱 |
| 播客 Agent | 工具调用 | 自动更新 | 主动查询实体邻居和社区摘要；脚本中的新关系写入图谱 |
| 知识问答 Agent | 上下文注入+工具调用 | 自动更新 | 注入实体/社区上下文；回答中发现的新关系写入图谱 |

---

## 12. 增量更新与消歧

### 12.1 智能增量更新流程

```
用户选择新文档 → 触发增量更新
    │
    ├─ Stage 1: 仅获取新文档 chunks
    │
    ├─ Stage 2: 对新 chunks 抽取实体/关系
    │
    ├─ Stage 3: 与现有图谱做消歧合并
    │   ├─ 精确匹配（标签/别名相同）→ 合并
    │   ├─ 语义匹配（embedding 相似度 > 0.85）→ 合并
    │   └─ 无匹配 → 新建节点
    │
    ├─ Stage 4: 在完整图谱上重新执行 Leiden 社区检测
    │
    └─ Stage 5: 重新生成所有社区摘要
```

### 12.2 语义匹配消歧

```python
def semantic_dedup(
    new_nodes: list[dict],
    existing_nodes: list[dict],
    host: HostGatewayClient,
    threshold: float = 0.85,
) -> tuple[list[dict], list[tuple[str, str]]]:
    """Deduplicate new nodes against existing nodes using embedding similarity.

    Returns:
        (unique_new_nodes, merge_pairs) where merge_pairs is [(target_id, source_id)]
    """
    merge_pairs = []
    truly_new = []

    for new_node in new_nodes:
        # 1. Exact match by label (case-insensitive)
        for existing in existing_nodes:
            if new_node["label"].lower() == existing["label"].lower():
                merge_pairs.append((existing["id"], new_node["id"]))
                break
            if new_node["label"].lower() in [a.lower() for a in existing.get("aliases", [])]:
                merge_pairs.append((existing["id"], new_node["id"]))
                break
        else:
            # 2. Semantic match by embedding similarity
            new_vec = host.get_entity_embedding(new_node["id"])
            if new_vec is not None:
                similar = host.vector_search_entity(new_vec, top_k=3)
                for s in similar:
                    if s["similarity"] >= threshold:
                        merge_pairs.append((s["node_id"], new_node["id"]))
                        break
                else:
                    truly_new.append(new_node)
            else:
                truly_new.append(new_node)

    return truly_new, merge_pairs
```

### 12.3 用户编辑保护

用户手动编辑的节点和边在 `metadata` 中标记 `user_edited: true`。增量更新时：

- `user_edited=true` 的节点：不覆盖标签、类型、别名
- `user_edited=true` 的边：不覆盖关系类型、置信度
- 新增的来源文档仍会追加到 `source_ids`

---

## 13. 数据模型规范

### 13.1 TypeScript 类型定义

替换 `src/types/knowledge-graph.ts` 中的现有定义：

```typescript
import { z } from 'zod'

// ───── Enums ─────

export type KnowledgeNodeType = 'concept' | 'person' | 'event' | 'formula' | 'term'
export type RelationType = 'is_a' | 'part_of' | 'depends_on' | 'causes' | 'related_to' | 'similar_to' | 'uses' | 'produces'
export type GraphBuildStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type CommunityLevel = 0 | 1

// ───── Domain Types ─────

export interface KnowledgeNode {
  id: string
  nodeType: KnowledgeNodeType
  label: string
  aliases: string[]
  sourceIds: string[]
  description: string           // LLM 生成的实体描述
  metadata: Record<string, unknown>
  communityId: string | null    // 所属底层社区 ID
  parentCommunityId: string | null  // 所属高层社区 ID
  degree: number                // 连接度（缓存）
  hasEmbedding: boolean         // 是否有嵌入向量
  createdAt: string
  updatedAt: string
}

export interface KnowledgeEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relation: RelationType        // 预定义关系类型
  confidence: number
  sourceIds: string[]
  inferred: boolean             // 是否为推断关系
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Community {
  id: string
  level: CommunityLevel
  title: string
  memberNodeIds: string[]
  parentCommunityId: string | null
  summaryJson: string | null    // CommunitySummary JSON
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

export interface CommunitySummary {
  title: string
  summary: string
  keyEntities: string[]
  coreRelations: string[]
  knowledgeGaps: string[]
}

export interface EntityEmbedding {
  nodeId: string
  embeddingModel: string
  updatedAt: string
}

export interface GraphBuildRun {
  id: string
  runId: string | null
  scopeDescription: string
  documentIds: string[]
  nodesCreated: number
  edgesCreated: number
  nodesMerged: number
  communitiesDetected: number
  status: GraphBuildStatus
  errorMessage: string | null
  currentStage: number          // 1-5 当前管线阶段
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas ─────

export const relationTypeSchema = z.enum([
  'is_a', 'part_of', 'depends_on', 'causes',
  'related_to', 'similar_to', 'uses', 'produces',
])

export const knowledgeNodeSchema = z.object({
  id: z.string(),
  nodeType: z.enum(['concept', 'person', 'event', 'formula', 'term']),
  label: z.string(),
  aliases: z.array(z.string()),
  sourceIds: z.array(z.string()),
  description: z.string(),
  metadata: z.record(z.unknown()),
  communityId: z.string().nullable(),
  parentCommunityId: z.string().nullable(),
  degree: z.number().int().nonnegative(),
  hasEmbedding: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const knowledgeEdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  relation: relationTypeSchema,
  confidence: z.number().min(0).max(1),
  sourceIds: z.array(z.string()),
  inferred: z.boolean(),
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const communitySummarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyEntities: z.array(z.string()),
  coreRelations: z.array(z.string()),
  knowledgeGaps: z.array(z.string()),
})

export const communitySchema = z.object({
  id: z.string(),
  level: z.union([z.literal(0), z.literal(1)]),
  title: z.string(),
  memberNodeIds: z.array(z.string()),
  parentCommunityId: z.string().nullable(),
  summaryJson: z.string().nullable(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const entityEmbeddingSchema = z.object({
  nodeId: z.string(),
  embeddingModel: z.string(),
  updatedAt: z.string(),
})

export const graphBuildRunSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  scopeDescription: z.string(),
  documentIds: z.array(z.string()),
  nodesCreated: z.number().int(),
  edgesCreated: z.number().int(),
  nodesMerged: z.number().int(),
  communitiesDetected: z.number().int(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  errorMessage: z.string().nullable(),
  currentStage: z.number().int().min(0).max(5),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

### 13.2 SQLite Schema

```sql
-- Migration: V13__knowledge_graph_v2.sql

-- 扩展 knowledge_nodes 表
ALTER TABLE knowledge_nodes ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE knowledge_nodes ADD COLUMN community_id TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN parent_community_id TEXT;
ALTER TABLE knowledge_nodes ADD COLUMN degree INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_nodes ADD COLUMN has_embedding INTEGER NOT NULL DEFAULT 0;

-- 扩展 knowledge_edges 表
ALTER TABLE knowledge_edges ADD COLUMN inferred INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_edges ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

-- 更新 relation 列约束（通过新表迁移实现，保留旧数据）

-- 新增 communities 表
CREATE TABLE IF NOT EXISTS knowledge_communities (
  id                      TEXT PRIMARY KEY NOT NULL,
  level                   INTEGER NOT NULL,           -- 0=底层, 1=高层
  title                   TEXT NOT NULL DEFAULT '',
  member_node_ids_json    TEXT NOT NULL DEFAULT '[]',
  parent_community_id     TEXT,
  summary_json            TEXT,
  node_count              INTEGER NOT NULL DEFAULT 0,
  edge_count              INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_communities_level ON knowledge_communities(level);
CREATE INDEX IF NOT EXISTS idx_communities_parent ON knowledge_communities(parent_community_id);

-- 新增 entity_embeddings 表
CREATE TABLE IF NOT EXISTS entity_embeddings (
  node_id         TEXT PRIMARY KEY NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 注意：实际向量存储在 sqlite-vec 虚拟表中，与文档 embedding 共享机制
-- entity_embeddings 表仅记录元数据，向量通过 host_gateway 存储

-- 扩展 graph_build_runs 表
ALTER TABLE graph_build_runs ADD COLUMN communities_detected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE graph_build_runs ADD COLUMN current_stage INTEGER NOT NULL DEFAULT 0;
```

### 13.3 Python Schema (Pydantic)

在 `orchestration_service/schemas/knowledge_graph.py` 中新增：

```python
"""Pydantic schemas for knowledge graph pipeline structured output."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class ExtractedNode(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    type: Literal["concept", "person", "event", "formula", "term"]
    aliases: list[str] = Field(default_factory=list)
    description: str = Field(default="", max_length=500)


class ExtractedEdge(BaseModel):
    from_label: str
    to_label: str
    relation: Literal[
        "is_a", "part_of", "depends_on", "causes",
        "related_to", "similar_to", "uses", "produces",
    ]
    confidence: float = Field(ge=0.0, le=1.0)


class ExtractionResult(BaseModel):
    nodes: list[ExtractedNode] = Field(default_factory=list)
    edges: list[ExtractedEdge] = Field(default_factory=list)


class CommunitySummary(BaseModel):
    title: str = Field(min_length=3, max_length=80)
    summary: str = Field(min_length=20, max_length=500)
    key_entities: list[str] = Field(min_length=1, max_length=10)
    core_relations: list[str] = Field(min_length=1, max_length=10)
    knowledge_gaps: list[str] = Field(default_factory=list)
```

### 13.4 Rust DTO

在 `src-tauri/src/commands/knowledge_graph.rs` 中扩展 `KnowledgeNodeDto`、`KnowledgeEdgeDto`，新增 `CommunityDto`、`EntityEmbeddingDto`，字段与 TypeScript 类型一一对应。

---

## 14. 前端组件架构

### 14.1 组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| `KnowledgeGraphPage` | `features/knowledge/KnowledgeGraphPage.tsx` | 主页面（重写） |
| `GraphCanvas` | `features/knowledge/GraphCanvas.tsx` | Sigma.js WebGL 画布 |
| `NodeDetailPanel` | `features/knowledge/NodeDetailPanel.tsx` | 右侧可折叠节点详情面板 |
| `StatsBar` | `features/knowledge/StatsBar.tsx` | 顶部统计栏 |
| `GraphSearchBar` | `features/knowledge/GraphSearchBar.tsx` | 搜索栏 |
| `GraphBuildWizard` | `features/knowledge/GraphBuildWizard.tsx` | 构建/增量更新向导 |
| `CommunityNode` | `features/knowledge/CommunityNode.tsx` | 社区超级节点渲染 |

### 14.2 GraphCanvas (Sigma.js 集成)

**技术方案**：

- 使用 `sigma` + `graphology` 作为核心渲染引擎
- `graphology` 管理图数据模型（节点/边/属性）
- `sigma` 负责 WebGL 渲染和交互事件

**核心代码结构**：

```typescript
import Graph from 'graphology'
import Sigma from 'sigma'
import { forceAtlas2 } from 'graphology-layout-forceatlas2'

export function GraphCanvas({ nodes, edges, communities }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const graphRef = useRef<Graph | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const graph = new Graph()
    // Add nodes with visual attributes
    for (const node of nodes) {
      graph.addNode(node.id, {
        label: node.label,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: computeNodeSize(node.degree),
        color: NODE_TYPE_COLORS[node.nodeType],
      })
    }
    // Add edges with visual attributes
    for (const edge of edges) {
      graph.addEdge(edge.fromNodeId, edge.toNodeId, {
        label: edge.relation,
        color: RELATION_COLORS[edge.relation],
        opacity: 0.3 + edge.confidence * 0.7,
        size: 1 + edge.confidence * 2,
        type: edge.inferred ? 'dashed' : 'arrow',
      })
    }

    // Run ForceAtlas2 layout
    forceAtlas2.assign(graph, { iterations: 100 })

    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 6,
      edgeLabelFont: '14px sans-serif',
    })

    graphRef.current = graph
    sigmaRef.current = sigma

    return () => sigma.kill()
  }, [nodes, edges])

  return <div ref={containerRef} className="h-full w-full" />
}
```

**交互事件**：

- `clickNode` → 选中节点，展示详情面板
- `clickEdge` → 展示边 tooltip
- `rightClickNode` → 上下文菜单（编辑/删除/合并/展开邻居/跳转源文档）
- `hoverNode` → 高亮节点及其邻居

### 14.3 状态管理

| 状态 | 存储位置 | 说明 |
|------|----------|------|
| 图谱数据 | TanStack Query | 节点/边/社区通过 `queries/knowledgeGraph.ts` 缓存 |
| 画布状态 | React useState | 当前视图模式、选中节点、缩放级别 |
| 构建进度 | TanStack Query + 轮询 | 每 2 秒轮询 build run 状态 |
| 搜索状态 | React useState | 搜索关键词、匹配结果 |

### 14.4 IPC 契约

更新 `services/gateway/knowledgeGraph.ts`：

```typescript
// 新增/修改的 IPC 接口

export interface StartGraphBuildInput {
  documentIds: string[]
  scopeDescription?: string
  incremental?: boolean      // 是否增量更新
}

export async function startGraphBuild(input: StartGraphBuildInput): Promise<GraphBuildRun>
export async function listGraphNodes(): Promise<KnowledgeNode[]>
export async function listAllGraphEdges(): Promise<KnowledgeEdge[]>  // 新增：获取所有边
export async function listGraphEdges(nodeId: string): Promise<KnowledgeEdge[]>
export async function getNodeSources(nodeId: string): Promise<string[]>
export async function mergeGraphNodes(input: MergeNodesInput): Promise<KnowledgeNode>
export async function deleteGraphNode(nodeId: string): Promise<void>
export async function updateKnowledgeNode(nodeId: string, updates: Partial<KnowledgeNode>): Promise<KnowledgeNode>  // 新增
export async function createKnowledgeEdge(edge: Omit<KnowledgeEdge, 'id' | 'createdAt' | 'updatedAt'>): Promise<KnowledgeEdge>  // 新增
export async function deleteKnowledgeEdge(edgeId: string): Promise<void>  // 新增
export async function updateKnowledgeEdge(edgeId: string, updates: Partial<KnowledgeEdge>): Promise<KnowledgeEdge>  // 新增
export async function listCommunities(level?: number): Promise<Community[]>  // 新增
export async function getCommunitySummary(communityId: string): Promise<CommunitySummary | null>  // 新增
export async function toggleCommunityCollapse(communityId: string, collapsed: boolean): Promise<void>  // 新增
export async function listGraphBuildRuns(): Promise<GraphBuildRun[]>
export async function cancelGraphBuild(buildRunId: string): Promise<void>  // 新增
export async function getGraphStats(): Promise<GraphStats>  // 新增

export interface GraphStats {
  totalNodes: number
  totalEdges: number
  totalCommunities: number
  nodeTypeDistribution: Record<KnowledgeNodeType, number>
  lastBuildRun: GraphBuildRun | null
}
```

### 14.5 NPM 依赖

新增：

```
sigma: ^2.5
graphology: ^0.26
graphology-layout-forceatlas2: ^2.0
graphology-types: ^0.5
```

---

## 15. Python 实现规范

### 15.1 文件结构

```
orchestration_service/
├── workflows/
│   ├── knowledge_graph.py       # 重写：5 阶段 GraphRAG 管线
│   └── graph_embedding.py       # 新增：实体嵌入生成
├── providers/
│   └── graph_rag.py             # 新增：GraphRAG 增强检索
├── schemas/
│   └── knowledge_graph.py       # 新增：Pydantic 结构化输出 schema
└── clients/
    └── host_gateway.py          # 扩展：新增图谱相关方法
```

### 15.2 主管线函数签名

```python
def run_knowledge_graph_workflow(
    run_id: str,
    build_run_id: str,
    document_ids: list[str],
    incremental: bool,
    host: HostGatewayClient,
) -> dict:
    """Execute the full 5-stage GraphRAG pipeline.

    Returns:
        {"status": "completed" | "failed" | "cancelled",
         "nodesCreated": int, "edgesCreated": int,
         "nodesMerged": int, "communitiesDetected": int}
    """
```

### 15.3 HostGatewayClient 扩展方法

```python
# 图谱 CRUD（已有）
def create_knowledge_node(self, node: dict) -> dict
def get_knowledge_node(self, node_id: str) -> dict | None
def update_knowledge_node(self, node_id: str, updates: dict) -> dict
def list_knowledge_nodes(self) -> list[dict]
def delete_knowledge_node(self, node_id: str) -> None
def find_node_by_label(self, label: str) -> dict | None

# 边 CRUD
def create_knowledge_edge(self, edge: dict) -> dict
def update_knowledge_edge(self, edge_id: str, updates: dict) -> dict
def delete_knowledge_edge(self, edge_id: str) -> None
def list_all_edges(self) -> list[dict]

# 社区
def create_community(self, community: dict) -> dict
def update_community(self, community_id: str, updates: dict) -> dict
def list_communities(self, level: int | None = None) -> list[dict]

# 实体嵌入
def save_entity_embedding(self, node_id: str, vector: list[float], model: str) -> None
def get_entity_embedding(self, node_id: str) -> list[float] | None
def vector_search_entity(self, query_vec: list[float], top_k: int = 10) -> list[dict]

# 图谱统计
def get_graph_stats(self) -> dict
```

### 15.4 依赖更新

`requirements.txt` 新增：

```
leidenalg>=0.10
python-igraph>=0.11
```

---

## 16. Rust 实现规范

### 16.1 文件结构

```
src-tauri/src/
├── commands/
│   └── knowledge_graph.rs       # 重写：完整 IPC 命令集
├── db/
│   ├── knowledge_graph_repo.rs  # 扩展：新增社区/嵌入/边 CRUD
│   └── community_repo.rs        # 新增：社区数据库操作
└── migrations/
    └── V13__knowledge_graph_v2.sql  # 新增：数据库迁移
```

### 16.2 IPC 命令清单

| 命令 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `start_graph_build_workflow` | `StartGraphBuildDto` | `GraphBuildRunDto` | 创建 build run + 启动管线 |
| `list_graph_nodes` | `{}` | `Vec<KnowledgeNodeDto>` | 列出所有节点 |
| `list_all_graph_edges` | `{}` | `Vec<KnowledgeEdgeDto>` | 列出所有边 |
| `list_graph_edges` | `nodeId` | `Vec<KnowledgeEdgeDto>` | 列出节点关联边 |
| `get_node_sources` | `nodeId` | `Vec<String>` | 获取节点来源文档 |
| `update_knowledge_node` | `nodeId, updates` | `KnowledgeNodeDto` | 更新节点 |
| `merge_graph_nodes` | `targetNodeId, sourceNodeId` | `KnowledgeNodeDto` | 合并节点 |
| `delete_graph_node` | `nodeId` | `void` | 删除节点 |
| `create_knowledge_edge` | `CreateEdgeDto` | `KnowledgeEdgeDto` | 创建边 |
| `update_knowledge_edge` | `edgeId, updates` | `KnowledgeEdgeDto` | 更新边 |
| `delete_knowledge_edge` | `edgeId` | `void` | 删除边 |
| `list_communities` | `level?` | `Vec<CommunityDto>` | 列出社区 |
| `get_community_summary` | `communityId` | `CommunitySummaryDto?` | 获取社区摘要 |
| `toggle_community_collapse` | `communityId, collapsed` | `void` | 折叠/展开社区 |
| `list_graph_build_runs` | `{}` | `Vec<GraphBuildRunDto>` | 列出构建记录 |
| `cancel_graph_build` | `buildRunId` | `void` | 取消构建 |
| `get_graph_stats` | `{}` | `GraphStatsDto` | 获取统计信息 |

### 16.3 CommunityRepository 方法

```rust
impl CommunityRepository {
    fn create_community(&self, community: NewCommunity) -> Result<Community>;
    fn get_community(&self, id: &str) -> Result<Option<Community>>;
    fn list_communities(&self, level: Option<i32>) -> Result<Vec<Community>>;
    fn update_community(&self, id: &str, updates: &CommunityUpdates) -> Result<Community>;
    fn delete_community(&self, id: &str) -> Result<()>;
    fn get_community_summary(&self, id: &str) -> Result<Option<CommunitySummaryRow>>;
}
```

---

## 17. 长任务与错误处理

### 17.1 复用播客长任务管理

图谱构建复用播客系统的长任务管理机制：

- **Checkpoint**：每个 Stage 完成后写入 checkpoint
- **取消**：用户可取消构建，丢弃中间产物
- **预算控制**：LLM token 上限、预估费用上限
- **进度报告**：通过 `emit_workflow_event` 推送进度

### 17.2 分段构建

当文档数 > 20 或预估 chunks > 200 时，按文档分组分段执行：

- 每段处理 5-10 个文档
- 每段独立执行 Stage 1-3（分块→抽取→消歧）
- 所有段完成后统一执行 Stage 4-5（社区检测+摘要）

### 17.3 降级策略

| 故障场景 | 降级方案 |
|----------|----------|
| LLM 不可用 | 规则抽取（正则匹配名词短语+关系句式） |
| leidenalg 不可用 | 连通分量 + K-core 简单聚类 |
| 嵌入服务不可用 | 跳过语义匹配消歧，仅精确匹配 |
| Python 服务不可用 | Rust 侧 fallback（每文档一个 concept 节点） |
| 增量合并冲突 | 取置信度更高的版本，用户编辑优先 |

### 17.4 Checkpoint 写入时机

| 阶段 | Checkpoint 内容 |
|------|----------------|
| Stage 1 完成 | chunk_count |
| Stage 2 每 10 chunks | extracted_nodes, extracted_edges (增量) |
| Stage 3 完成 | merged_nodes_count, merged_edges_count |
| Stage 4 完成 | communities_detected |
| Stage 5 完成 | summaries_generated |

---

## 18. 测试与验收

### 18.1 单元测试

| 测试 | 文件 | 说明 |
|------|------|------|
| `test_extraction_schema` | `tests/test_kg_schemas.py` | Pydantic 抽取 schema 校验 |
| `test_community_summary_schema` | `tests/test_kg_schemas.py` | 社区摘要 schema 校验 |
| `test_relation_type_mapping` | `tests/test_kg_relation_mapping.py` | 自由文本→预定义关系映射 |
| `test_semantic_dedup` | `tests/test_kg_dedup.py` | 语义消歧逻辑 |
| `test_rrf_fusion` | `tests/test_kg_rag.py` | RRF 融合排序 |
| `test_entity_embedding` | `tests/test_kg_embedding.py` | 实体嵌入生成与检索 |
| `test_relation_inference` | `tests/test_kg_embedding.py` | 关系推理逻辑 |
| `test_community_detection` | `tests/test_kg_community.py` | Leiden 社区检测 |
| `test_incremental_update` | `tests/test_kg_incremental.py` | 增量更新流程 |
| `test_graph_stats` | `tests/test_kg_repo.py` | Rust 数据库操作 |

### 18.2 集成测试

| 测试 | 说明 |
|------|------|
| `test_kg_pipeline_small` | 小规模端到端构建（mock LLM） |
| `test_kg_pipeline_medium` | 中规模端到端构建（mock LLM） |
| `test_kg_pipeline_incremental` | 增量更新验证 |
| `test_kg_pipeline_cancel` | 取消构建验证 |
| `test_kg_rag_fusion` | GraphRAG + 传统 RAG 融合检索 |
| `test_kg_agent_integration` | Agent 查询+更新图谱 |

### 18.3 E2E 测试

| 场景 ID | 场景 | 预期结果 |
|---------|------|----------|
| `V4-KG-01` | 构建知识图谱 | 5 阶段管线完成，生成节点/边/社区/摘要 |
| `V4-KG-02` | 增量更新图谱 | 新增文档后增量更新，不破坏既有结构 |
| `V4-KG-03` | 实体去重与消歧 | 同义概念合并合理，错误合并可修正 |
| `V4-KG-04` | 图谱可视化 | Sigma.js 渲染，双模式切换，节点/边交互正常 |
| `V4-KG-05` | 节点操作 | 查看/编辑/删除/展开邻居/跳转源文档/合并 |
| `V4-KG-06` | 边操作 | 点击边显示关系/置信度，可编辑/删除 |
| `V4-KG-07` | 社区折叠 | 社区可折叠为超级节点，展开显示内部 |
| `V4-KG-08` | GraphRAG 检索 | 实体+路径+社区三层增强，RRF 融合 |
| `V4-KG-09` | Agent 集成 | Agent 可查询图谱上下文，可更新图谱 |
| `V4-KG-10` | 图谱编辑 | 用户可在界面直接编辑节点和边 |
| `V4-KG-11` | 构建取消 | 取消后丢弃中间产物 |
| `V4-KG-12` | 降级策略 | LLM 不可用时降级为规则抽取 |

### 18.4 验收标准

知识图谱子系统"Done"意味着：

1. 5 阶段 GraphRAG 构建管线全部可用
2. Sigma.js 可视化：双模式视图、节点/边交互、社区折叠
3. 8 种预定义关系类型，LLM 抽取约束输出
4. Leiden 两层社区检测 + 结构化摘要
5. GraphRAG 增强检索：实体+路径+社区三层，RRF 融合
6. LLM-based 实体嵌入 + 实体语义检索 + 关系推理
7. Agent 双向集成：所有 Agent 可查询和更新图谱
8. 智能增量更新 + 语义消歧
9. 可编辑图谱（节点/边 CRUD）
10. 复用长任务管理 + 分段构建 + 降级策略
11. 所有 E2E 测试场景通过
12. 所有 IPC 交换通过 Zod schema 强校验

---

## 19. 实施阶段

### Phase P0: 基础设施（1-2 天）

- [ ] 新增 SQLite migration V13（扩展 knowledge_nodes/edges + 新增 communities/entity_embeddings）
- [ ] 新增 Python Pydantic schema（`schemas/knowledge_graph.py`）
- [ ] 更新 TypeScript 类型定义（替换 `types/knowledge-graph.ts`）
- [ ] 扩展 Rust `KnowledgeGraphRepository` + 新增 `CommunityRepository`
- [ ] 扩展 Rust IPC 命令

### Phase P1: GraphRAG 构建管线（3-5 天）

- [ ] 重写 `workflows/knowledge_graph.py`：5 阶段管线
- [ ] 实现 Stage 1-3（分块→抽取→消歧）
- [ ] 实现 Stage 4-5（Leiden 社区检测+摘要生成）
- [ ] 实现 8 种预定义关系的 LLM Prompt
- [ ] 实现语义消歧逻辑
- [ ] 实现增量更新流程
- [ ] 实现 HostGatewayClient 图谱相关方法
- [ ] 更新 `server.py` 的 `/workflows/knowledge-graph` 端点

### Phase P2: GraphRAG 增强检索（2-3 天）

- [ ] 实现 `providers/graph_rag.py`（三层增强检索）
- [ ] 实现实体检索 Layer
- [ ] 实现关系路径 Layer
- [ ] 实现社区摘要 Layer
- [ ] 实现 RRF 融合排序
- [ ] 实现实体嵌入生成（`workflows/graph_embedding.py`）
- [ ] 实现关系推理

### Phase P3: 前端可视化（3-4 天）

- [ ] 安装 sigma + graphology 依赖
- [ ] 重写 `KnowledgeGraphPage`
- [ ] 实现 `GraphCanvas`（Sigma.js WebGL）
- [ ] 实现 `NodeDetailPanel`
- [ ] 实现 `StatsBar`
- [ ] 实现 `GraphSearchBar`
- [ ] 实现 `GraphBuildWizard`
- [ ] 实现 `CommunityNode`（可折叠超级节点）
- [ ] 更新 `queries/knowledgeGraph.ts` + `services/gateway/knowledgeGraph.ts`
- [ ] 更新路由配置

### Phase P4: Agent 集成（2-3 天）

- [ ] 实现 LangChain Tool（`query_knowledge_graph`）
- [ ] 实现上下文注入函数（`inject_graph_context`）
- [ ] 实现自动更新函数（`agent_update_graph`）
- [ ] 集成到卡片生成 Agent
- [ ] 集成到播客 Agent
- [ ] 集成到知识问答 Agent

### Phase P5: 测试与验收（2-3 天）

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 编写 E2E 测试
- [ ] 验收场景逐项通过
- [ ] 文档最终更新

---

## 20. 已知限制与后续规划

### 20.1 当前限制

1. **无实时协作**：图谱是本地单用户，不支持多人协作编辑
2. **无图谱导出**：不支持导出为 GraphML/GEXF/JSON-LD 等格式
3. **无时间线视图**：不支持按时间维度浏览图谱演化
4. **社区检测需重算**：增量更新时社区检测需在完整图谱上重算
5. **关系推理有限**：仅基于嵌入相似度推断 `similar_to`，不推断具体关系类型

### 20.2 后续规划

| 版本 | 能力 | 说明 |
|------|------|------|
| V4.1 | 图谱导出 | 支持 GraphML/GEXF/JSON-LD 导出 |
| V4.2 | 时间线视图 | 按文档添加时间浏览图谱演化 |
| V4.3 | 增量社区检测 | 支持局部社区更新，避免全量重算 |
| V4.4 | TransE 关系推理 | 使用 TransE 模型推断具体关系类型 |
| V5 | 多人协作 | 支持图谱共享和协作编辑 |

---

## 21. 开源参考

| 项目/文档 | 参考内容 |
|-----------|----------|
| [Microsoft GraphRAG](https://github.com/microsoft/graphrag) | 两阶段管线（实体抽取+社区检测）、层次摘要、全局/局部检索 |
| [LightRAG](https://github.com/HKUDS/LightRAG) | 增量式双层级检索、轻量图构建 |
| [Sigma.js](https://github.com/jacomyal/sigma.js) | WebGL 大规模图渲染、React 集成 |
| [Graphology](https://github.com/graphology) | 图数据模型+算法（ForceAtlas2、度中心性等） |
| [leidenalg](https://github.com/vtraag/leidenalg) | Leiden 社区检测算法实现 |
| [python-igraph](https://github.com/igraph/python-igraph) | 图数据结构和算法（Leiden 依赖） |
| [react-cytoscapejs](https://github.com/plotly/react-cytoscapejs) | React 图可视化组件参考 |
| [Cytoscape.js vs Sigma.js vs vis-network](https://www.pkgpulse.com/blog/cytoscape-vs-vis-network-vs-sigma-graph-visualization-javascript-2026) | 图可视化库对比分析 |
