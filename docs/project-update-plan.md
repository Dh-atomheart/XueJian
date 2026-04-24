
## 一、核心功能整改方案

### 1.1 卡片生成引擎（Card Generation Pipeline）

**现状评估**：卡片系统V2采用“候选→审核→正式”三阶段管线，主线设计合理，但缺失预处理层的**PDF类型探测**与**语义分块**能力，同时缺乏对LLM输出质量的系统化工序验证。

**改进建议（合计 12-16 人天）**：

**1. 增加 PDFTypeDetector 预处理层**

- **实现内容**：在执行任何解析之前，先判断 PDF 是否含有可提取文本层。若有，主路径走 PyMuPDF（速度最快，保真度最高）；若无文本层（扫描件/图片型 PDF），路由至 Docling 解析管道，利用其内置 OCR 能力处理；对混合型 PDF，逐页判断并动态组合两条路径。
- **难度预估**：中等（3-4 人天）
- **参考实现**：Docling 支持 Tesseract、EasyOCR、RapidOCR 三种 OCR 引擎可替换

**2. 引入 SemanticChunker 语义分块器**

- **实现内容**：替换固定大小分块，基于文档的结构化特征（标题层级、段落边界、表格边界）切割分块，每个分块自动附带来源页码信息，保证每个分块是一个“语义完整”的单元。
- **难度预估**：中等（3-4 人天）

**3. 增加 LLM 输出 Schema 约束与异常兜底**

- **实现内容**：在 Prompt 中强制要求 LLM 输出符合 JSON Schema 的 `{front, back, source_page, group}` 格式。在 Python 侧使用 Pydantic 模型验证：拒绝少于 5 个单词的卡片；拒绝内容与原文分块 embedding 余弦相似度 < 0.3 的“僵尸卡片”。
- **难度预估**：简单（2-3 人天）

**4. 引入 CardClusterer 自动归类工具**

- **实现内容**：对同一份文档生成的卡片，计算其内容 embedding 向量，使用 HDBSCAN 进行无监督聚类，聚类结果作为“组”和“簇”的初始建议，用户在 UI 里再做微调。
- **难度预估**：中等（3-5 人天）

**文件落点建议**：`python_services/orchestration_service/agents/card_generation_agent.py`


### 1.2 本地知识库对话（RAG/GraphRAG 问答）

**现状评估**：前端问答页面基础框架已搭建，但 RAG 检索系统与引用追溯功能尚未完成，当前仅有向量相似度匹配，缺乏处理多步推理问题的能力。

**改进建议（合计 10-14 人天）**：

**1. 架构升级为“三层检索”**

- **第一层（必做）** ：密集段落检索——在用户选中的文档集合上，对提问执行 embedding 相似度检索，召回 top-k 段落。
- **第二层（推荐）** ：图增强锚定（GraphRAG）——在知识图谱（功能#10）落地后，将问题解析为实体，在图数据库中查找 1-hop/2-hop 相邻实体，将其文本片段作为额外上下文注入 LLM。
- **第三层（可选）** ：查询分解与多跳推理——对复杂问题，LLM 先将问题拆解为子问题，依次执行多次检索并聚合结果，再给出综合回答。
- **难度预估**：困难（5-7 人天）

**2. 引入引用溯源强制机制**

- **实现内容**：系统后台对用于回答的每个段落，强制记录 `(source_document, source_page, chunk_id)` 三元组；前端回答气泡中对应句子尾部显示“📄 第X页”标记，点击直接跳转至 PDF 对应页。该强制检查在后端实现（不依赖 LLM 自觉）。
- **难度预估**：中等（3-4 人天）

**3. 对话持久化与连续学习**

- **实现内容**：完整保留每轮对话的问答对及引用信息；用户可对回答给出“有帮助/有误”评价，作为后续调优 embedding 或优化检索策略的信号。
- **难度预估**：简单（2-3 人天）

**文件落点建议**：`python_services/rag_service/retrieval_pipeline.py`


### 1.3 动画演示生成器（Manim Animation）

**现状评估**：功能完全空白（项目总览中未独立列出，归入“卡片工坊系统”的动画效果子项）。你此前担心 Manim MCP Server “项目有点旧”，该仓库在 2025 年 8 月仍有版本发布，2026 年 3 月仍有维护活动，社区认可度较高。

**改进建议（合计 10-14 人天）**：

**1. 复用 Manim MCP Server 作为渲染胶水层**

- **实现内容**：直接复用 `manim-mcp-server` 作为 Sidecar 进程嵌入 Tauri 应用，通过 MCP 协议传递脚本与接收视频输出，无需从零改造。
- **难度预估**：简单（2-3 人天）

**2. 自建 AnimationPlanner 任务规划器**

- **实现内容**：在给 Manim 发送任何代码前，LLM 先输出一份“分镜描述”（storyboard），包含场景数量、视觉元素、过渡方式。这大幅降低生成失败的概率。
- **难度预估**：困难（4-5 人天）

**3. 自建 AnimationValidator 代码静态检查器**

- **实现内容**：在发送到 Manim 渲染之前，静态检查 AI 生成的代码：阻止危险调用（`import os`、`subprocess`、`eval` 等）；检查场景类是否存在且继承自 `Scene`；验证至少包含一个 `play`/`wait` 方法调用。
- **难度预估**：中等（2-3 人天）

**4. 知识域限定策略**

- **实现内容**：严格限定 Manim 动画的知识域范围（数学公式、数据结构、物理图示、流程图等）。超出范围的卡片直接给出提示：“该知识暂不支持 Manim 演示，建议切换为问答模式”。
- **难度预估**：简单（2-3 人天）

**文件落点建议**：`python_services/orchestration_service/agents/animation_agent.py`


### 1.4 FSRS 调度策略

**现状评估**：项目已使用 `ts-fsrs 4.1.0`，但学习计划制定、复习提醒、成就系统等功能尚未完成。

**改进建议（合计 4-7 人天）**：

**1. 以 ts-fsrs 承担日常调度主力**

- **理由：** FSRS 调度计算本质上是对 17 个参数的数学公式运算，TypeScript V8 引擎完全胜任；调度结果（下一次复习时间、难度、稳定性）需要实时显示在 UI 上，使用 ts-fsrs 可实现前端立即计算、即时刷新，无跨进程通信开销。
- **动作实施**：将 fsrs-rs 降级为**可插拔的后台训练引擎**——仅在用户导入大量历史卡片数据、需要一次性优化 FSRS 模型参数时，通过 Tauri `invoke` 调用 Rust 侧的 fsrs-rs 完成计算，计算结果传给前端 ts-fsrs 使用。开放方已经正式推荐开发者迁移至 ts-fsrs。
- **难度预估**：简单（1-2 人天）

**2. 实现学习日程调度器**

- **实现内容**：基于 FSRS 的 `due_at` 字段，每日生成用户的复习队列；支持手动调整每日新卡片学习上限。
- **难度预估**：简单（1-2 人天）

**3. 实现复习提醒系统**

- **实现内容**：利用 Tauri 的 Notification 插件，在卡片到达复习时间时推送系统通知。
- **难度预估**：中等（2-3 人天）

**文件落点建议**：`services/scheduler.ts`（前端） + `src-tauri/src/scheduler/`（Rust 优化引擎）


### 1.5 AI 播客生成工作流

**现状评估**：`podcast-generation-workflow.md` 工作流合理，TTS 收敛为 `auto/openai/edge_tts` 三选一策略正确，但当前评分显示仅达到“可工作”水平，距离优秀体验仍有距离。

**改进建议（合计 7-10 人天）**：

**1. 对话稿生成升级为“多角色声音系统”**

- **实现内容**：借鉴 NotebookLM 的开源平替项目（如 `notebooklm-oss`、`podcastfy`），将对话稿设计为 **2 个主持人 + 1 个专家嘉宾** 的三方对话格式。LLM 生成对话稿时，为每句台词标注说话人、语调，以及偶尔的插话（打断、爽朗笑声等副语言）。
- **难度预估**：中等（3-4 人天）

**2. 增加“脚本审查”中间态**

- **实现内容**：在生成最终音频前，增设一个对话脚本预览态：用户在 UI 上看到完整的对话文本稿，提供导出、手改、重新生成等操作。确认后系统才进入 TTS 合成，节省 TTS 调用成本。
- **难度预估**：简单（1-2 人天）

**3. 预留分段合成与合并能力**

- **实现内容**：对于较长的播客（>10 分钟），后端设计为分段 TTS、再将各段拼接为完整音频，降低单次 TTS 失败的风险。
- **难度预估**：中等（2-3 人天）

**4. 边缘语音降级策略增强**

- **实现内容**：在现有的 `auto/openai/edge_tts` 降级链基础上，增加一项本地终极回退方案：当用户无网络或所有付费 Key 未配置时，降级到浏览器内置的 Web Speech API 直接发声。
- **难度预估**：简单（1-2 人天）

**文件落点建议**：`python_services/podcast_service/script_generator.py`


### 1.6 向量存储方案（sqlite-vec 的定位与升级路径）

**现状评估**：项目使用 `sqlite-vec 0.1.9`，设计动机合理（统一数据库、避免独立向量数据库的运维负担）。

**sqlite-vec 的三个固有局限**：

- **纯向量搜索速度相对较慢**：`sqlite-vec` 采用暴力 KNN，在纯向量搜索场景下慢于 Chroma 或 LanceDB。
- **无原生近似索引结构**：不同于 Chroma（基于 hnswlib）或 LanceDB（基于 IVF-PQ），sqlite-vec 不使用近似索引，当向量规模上升到 100 万级别以上时性能将显著恶化。
- **仅在 SQL+向量混合查询时才有优势**：sqlite-vec 的真正优势体现在需要将向量检索与 SQL 过滤条件深度结合的场景。

**改进建议（合计 4-6 人天）**：

**短期（里程碑 1 和 2）：保持 sqlite-vec**

- **动作实施**：在 Python 侧增加一个轻量级的向量大小监控器，当单用户向量超过 50,000 条时打印后台日志预警。绝大多数个人用户的文档库向量数远低于此阈值。
- **难度预估**：简单（1-2 人天）

**长期（里程碑 3 及以后）：预留 LanceDB 迁移接口**

- **动作实施**：在向量存储层引入抽象接口 `VectorStoreInterface`，当前实现为 `SqliteVecBackend`，未来可替换为 `LanceDBBackend`。LanceDB 是目前唯一同时提供 Python、JavaScript/Node.js、Rust 一等公民支持的嵌入式向量数据库，基于 Lance 列式格式，随机访问比 Parquet 快约 100 倍，且提供 IVF-PQ 近似索引。
- **难度预估**：中等（3-4 人天）

**文件落点建议**：`src-tauri/src/vector_store/sqlite_vec_backend.rs`；`python_services/vector_store/interface.py`


## 二、安全保障体系（BYOK 系统缺陷整改）

### 2.1 API Key 安全存储落地

**现状评估**：`byok-system.md` 声明使用 Tauri Stronghold 加密存储密钥，但当前仅有接口定义，缺少实现。Stronghold 插件基于 IOTA 引擎，使用 argon2 算法对主密码哈希，采用零读取设计——只能通过 `execute_procedure` 操作数据，无法直接读取原始明文。

**实施步骤**：

- **Step 1**：在 `src-tauri/src/crypto/` 下实现 `SecretStore` 模块，初始化 Stronghold 并用 argon2 派生主密码。
- **Step 2**：API 配置页面增加“🔒 验证主密码”解锁按钮，用户输入主密码后才能查看或修改 API Key。
- **Step 3**：接入 Tauri 的 `Store` 插件存储非敏感配置（provider_id、base_url 等），与 Stronghold 各司其职。
- **难度预估**：中等（3-5 人天）

**文件落点建议**：`src-tauri/src/crypto/secret_store.rs`

### 2.2 Provider 连接校验与自动容灾

**实施步骤**：

- **Step 1**：设计 `ConnectionTest` 流程——用户每添加一个 Provider，系统自动发送一个最小测试请求（内容为"ping"），验证 API Key 是否有效、模型是否在线。
- **Step 2**：实现自动降级链——当主 Provider 不可用时（网络超时、余额不足等），自动切换至次选 Provider，无需用户手动干预。
- **Step 3**：连接失败的 Provider 在 UI 上主动标红提示，并记录故障原因和时间戳。
- **难度预估**：中等（3-4 人天）

**文件落点建议**：`python_services/provider_manager/connection_validator.py`


## 三、AI 编排服务架构优化：明确三大 Agent 边界

### 3.1 三大 Agent 职责定义

| Agent 名称 | 所属进程 | 核心职责 | 输入 → 输出 | 独立决策自由度 |
|-----------|---------|---------|------------|--------------|
| **CardGenerationAgent** | Python 管道 | 文档→卡片转化、自动分组 | 语义分块 → `CardCandidate[]` | 低（仅做格式检查，人类审核最终控制） |
| **AnimationAgent** | Python 管道 | 卡片→Manim 分镜→视频 | 卡片内容 → `Storyboard` → `ManimScript` → `MP4` | 中（自动分镜，代码验证器硬拦截） |
| **PodcastAgent** | Python 管道 | 文档段落→对话脚本→多角色音频 | 知识库段落 → `PodcastScript` → segment 批次 → `PodcastAudio` | 中（自动分句+角色分配，人类审核脚本） |

**设计原则**：AI 负责提供大量初稿（卡片、动画、音频），**人类对每一个产出享有最终控制权**（审核、编辑、重试）。

### 3.2 实施要点

- **Agent 注册机制**：在 `orchestration_service/` 下建立统一的 Agent 注册机制，每个 Agent 需声明其“输入契约”、“输出契约”和“资源需求”。
- **Agent 间通信**：Agent 之间不直接通信，统一通过 Orchestrator 调度，避免循环依赖。
- **文件落点建议**：`python_services/orchestration_service/agents/` 下分别为三个 Agent 创建独立文件。


## 四、前端架构优化：手绘组件库落地

**现状**：项目已引入 `roughjs 4.6.6`，设计令牌体系完整，但手绘组件分散在多处，缺少统一封装。`react-rough-fiber` 是 Rough.js 的官方 React 渲染器（418 star），能将 SVG 图形以手绘风格渲染，其 `<RoughSVG>` 组件支持 `roughness`、`strokeWidth`、`fillStyle` 等选项，可完美实现项目设计规范中“抖动边缘”“粗糙填充”等效果。此外，`handwritten-ui` 是一个基于 Rough.js 的完整组件库，可提供快速原型参考。

**实施步骤**：

- **Step 1**：在 `src/components/sketch/` 下集中封装手绘组件集（`SketchButton`、`SketchCard`、`SketchProgress`、`SketchDivider` 等）。
- **Step 2**：使用 `react-rough-fiber` 作为底层渲染引擎，```npm install react-rough-fiber react-reconciler```。
- **Step 3**：在 App 入口 `export * from './sketch'` 全局注册，便于所有页面调用。
- **难度预估**：中等（3-5 人天）

**文件落点建议**：`src/components/sketch/index.ts`


## 五、优先级路线图与工作分解

基于项目进度评估显示的 🔴/🟡 状态，结合改进方案的难度与依赖关系，建议以下三个里程碑：

### 里程碑 1：“学习闭环可跑”（预计 15-20 人天）

**目标**：用户能从头走完“文档上传→卡片生成→卡片复习”的完整流程。

| 交付项 | 对应功能 | 涉及改进 | 优先级 |
|--------|---------|---------|--------|
| PDF 类型检测 + 语义分块 + 卡片候选生成 | #1 卡片生成 | 1.1.1 / 1.1.2 / 1.1.3 | 🔴 P0 |
| BYOK Stronghold 加密存储 + 连接校验 | #9 BYOK | 2.1 / 2.2 | 🔴 P0 |
| FSRS 调度服务（ts-fsrs） | #7 FSRS | 1.4.1 / 1.4.2 | 🔴 P0 |
| PDF 侧笺（页面-卡片高亮联动） | #2 侧笺 | 基础版本 | 🔴 P0 |
| 前端手绘组件库初始化 | #11 UI | 四（Step 1-3） | 🔴 P0 |

### 里程碑 2：“AI 增强与知识网络”（预计 15-20 人天）

**目标**：知识问答、动画演示、播客生成三大 AI 能力上线。

| 交付项 | 对应功能 | 涉及改进 | 优先级 |
|--------|---------|---------|--------|
| 三层检索 + 引用溯源 | #3 RAG 问答 | 1.2.1 / 1.2.2 | 🟡 P1 |
| Manim 动画演示（Sidecar + Validator） | #5 动画 | 1.3.1 / 1.3.2 / 1.3.3 | 🟡 P1 |
| 多角色播客 + 脚本预览 | #6 播客 | 1.5.1 / 1.5.2 / 1.5.3 | 🟡 P1 |
| 知识图谱实体抽取 + 可视化 | #10 图谱 | 基础版本（1-hop） | 🟡 P1 |

### 里程碑 3：“体验打磨与性能调优”（预计 10-15 人天）

**目标**：学习仪表盘、卡片翻转动画、性能优化、sqlite-vec 扩容监控。

| 交付项 | 对应功能 | 优先级 |
|--------|---------|--------|
| 学习仪表盘 + 热力图 | #8 仪表盘 | 🟢 P2 |
| 卡片翻转动画完善 | #4 卡片 | 🟢 P2 |
| LanceDB 迁移接口预留 + 向量量监控 | #1 / #3 | 🟢 P2 |
| 手绘组件库全面铺开 | #11 UI | 🟢 P2 |
| 性能基准测试 + 离线模式 | 技术债务 | 🟢 P2 |


## 六、工程体系完善建议

### 6.1 测试策略强化

项目目前仅有基础单元测试框架（Vitest + Playwright），建议针对性补充：

| 测试场景 | 工具 | 范围 |
|---------|------|------|
| 卡片生成 Pipeline 端到端测试 | `pytest` | 从 PDF 输入到卡片输出的完整链路 |
| Pydantic Schema 校验单元测试 | `pytest` | 对异常卡片拒绝逻辑的覆盖 |
| FSRS 调度正确性测试 | `vitest` | 与 fsrs-rs 交叉验证相同参数下的调度结果 |
| Tauri Command 集成测试 | `cargo test` | Rust 侧命令的正确性与安全性 |

### 6.2 离线模式与容错设计

- **离线模式**：核心学习闭环（卡片复习、局部检索）应在无网络时仍可工作。AI 相关功能（卡片生成、问答、播客）在无网络时优雅降级，显示“离线不可用”提示。
- **AI 服务降级链**：OpenAI → Anthropic → 通用接口 → 本地缓存结果。降级时前端给出可视化提示，告知用户当前使用的模型。

### 6.3 日志与监控体系

- **结构化日志**：在 Python 和 Rust 侧统一使用结构化日志格式（JSON Lines），包含 `timestamp`、`level`、`module`、`user_id`、`trace_id` 字段。
- **关键指标监控**：卡片生成平均耗时、向量检索 P95 延迟、FSRS 复习队列积压量。
- **异常报警**：对连续 3 次卡片生成失败、Provider 连接超时等异常场景进行日志标记。
- **隐私考量**：务必确保日志中不包含用户 API Key、文档内容原文等敏感信息。

### 6.4 手绘风格一致性保障

- **设计令牌统一管理**：在 `design-system/tokens.ts` 中定义所有粗糙度参数（`roughness`、`bowing`、`strokeWidth`），全局可引用。
- **P0 核心组件（里程碑 1 完成）** ：SketchButton、SketchCard、SketchProgress。
- **P1 扩展组件（里程碑 2 完成）** ：SketchInput、SketchDivider、SketchTooltip。
- **P2 完整覆盖（里程碑 3 完成）** ：SketchChart、SketchGraph（知识图谱节点）、SketchHeatmap。


## 附录：改进方案总览清单

| 编号 | 改进项 | 难度 | 预估人天 | 里程碑 | 涉及文件落点 |
|------|--------|------|---------|--------|------------|
| 1.1.1 | PDFTypeDetector 预处理层 | 中 | 3-4 | M1 | `python_services/document_parser/` |
| 1.1.2 | SemanticChunker 语义分块器 | 中 | 3-4 | M1 | `python_services/vector_store/` |
| 1.1.3 | LLM 输出 Schema 约束 | 简 | 2-3 | M1 | `agents/card_generation_agent.py` |
| 1.1.4 | CardClusterer 自动归类 | 中 | 3-5 | M1 | `agents/card_generation_agent.py` |
| 1.2.1 | 三层检索架构 | 难 | 5-7 | M2 | `rag_service/retrieval_pipeline.py` |
| 1.2.2 | 引用溯源强制机制 | 中 | 3-4 | M2 | `rag_service/citation_manager.py` |
| 1.3.1 | Manim MCP Server 复用 | 简 | 2-3 | M2 | `mcp/manim_server_adapter.py` |
| 1.3.2 | AnimationPlanner 规划器 | 难 | 4-5 | M2 | `agents/animation_agent.py` |
| 1.3.3 | AnimationValidator 检查器 | 中 | 2-3 | M2 | `agents/animation_validator.py` |
| 1.4.1 | ts-fsrs 调度集成 | 简 | 1-2 | M1 | `services/scheduler.ts` |
| 1.5.1 | 多角色声音系统 | 中 | 3-4 | M2 | `podcast_service/script_generator.py` |
| 1.5.2 | 脚本审查中间态 | 简 | 1-2 | M2 | `podcast_service/review_workflow.py` |
| 1.6.1 | sqlite-vec 监控器 | 简 | 1-2 | M1 | `vector_store/vector_monitor.py` |
| 1.6.2 | LanceDB 迁移接口 | 中 | 3-4 | M3 | `vector_store/interface.py` |
| 2.1 | Stronghold API Key 加密存储 | 中 | 3-5 | M1 | `src-tauri/src/crypto/` |
| 2.2 | Provider 连接校验与容灾 | 中 | 3-4 | M1 | `provider_manager/connection_validator.py` |
| 3.1 | 三大 Agent 边界定义与注册机制 | 简 | 2-3 | M1 | `orchestration_service/agents/` |
| 四 | 手绘组件库落地 | 中 | 3-5 | M1 | `src/components/sketch/` |
| 6.1 | 测试策略强化 | 中 | 3-4 | M1-M3 | 各测试目录 |
| 6.3 | 日志与监控体系 | 中 | 2-3 | M1-M2 | `src-tauri/src/logging/` |

> **文档版本**: v1.0 | **编制日期**: 2026-04-24 | **适用范围**: 学笺项目 v0.1.0 → v0.2.0 升级路径