# XueJian (学笺) 面试高频问题

以下是从面试官视角，针对本项目可能提出的深度问题，按考察维度分类。

---

## 一、架构设计

### 1. 为什么选择 Tauri 2 而不是 Electron？在桌面应用开发中，这两者的核心取舍是什么？

**考察点**：技术选型能力，对桌面框架底层机制的理解（WebView vs Chromium，Rust vs Node.js），包体积、内存占用、原生能力的对比。

### 2. 你设计了三层架构（React → Tauri/Rust → Python sidecar），为什么把 AI 编排放在 Python 侧车中而不是直接集成到 Rust 后端？

**考察点**：架构决策，对 Rust 和 Python 生态差异的理解（LangChain/PyMuPDF 的 Python 绑定成熟度），进程间通信开销的权衡。

### 3. 前端通过 Tauri IPC 调用 Rust 命令，Rust 再通过 HTTP 与 Python sidecar 通信——为什么不直接从 React 调 Python？这中间的链路设计有什么考量？

**考察点**：安全模型理解（Tauri 的安全沙箱），IPC vs HTTP 的取舍，token 认证的设计理由。

### 4. 如果 Python sidecar 进程崩溃，系统如何保证数据一致性和用户体验？你设计了哪些容错机制？

**考察点**：进程管理（health check、restart policy），工作流断点续传（checkpoint/resume），前端的状态降级策略。

### 5. 项目中使用了 Zustand + TanStack Query 的组合，为什么不用 Redux 或者 React Router？你的状态管理边界是怎么划分的？

**考察点**：状态管理选型（服务端状态 vs 客户端状态），单页应用的路由设计哲学。

---

## 二、AI/LLM 集成

### 6. BYOK 系统中，用户的 API Key 是如何存储和保护的？如果用户的设备被物理窃取，Key 是否安全？

**考察点**：安全加密实践（Stronghold / argon2），威胁模型分析，明文密钥在内存中的生命周期管理。

### 7. 你在 LiteLLM 和原生 SDK 之间做了什么选择？为什么不直接用 LiteLLM 作为唯一入口？

**考察点**：多供应商抽象层的设计权衡，LangChain + LiteLLM 组合的冗余分析，供应商特有功能（如 Anthropic 的 tool use、OpenAI 的 JSON mode）的兼容性。

### 8. Agent-based 卡片生成（pydantic-ai agent）和规则式提取的 fallback 机制是如何协作的？什么情况下会触发 fallback？

**考察点**：容错设计，结构化输出（Pydantic schema）的可靠性，agent vs 固定流水线的取舍。

### 9. 如何评估 LLM 生成的卡片质量？有没有量化指标（准确率、用户接受率、去重率）？

**考察点**：AI 产品的质量评估方法论，SHA-256 去重策略，用户反馈闭环。

### 10. 知识问答的"Grounded Answer"是如何实现源引用的？chunk 粒度和检索精度之间如何平衡？

**考察点**：RAG 实践经验，chunk 策略（大小、重叠），FTS5 + vector 混合检索的权重调优。

---

## 三、数据与存储

### 11. 为什么选择了 sqlite-vec 做向量搜索，而不是 Pinecone/Weaviate/Milvus？sqlite-vec 的性能瓶颈在哪？

**考察点**：本地优先 vs 云服务的架构哲学，向量索引算法（ANN）的理解，规模上限的预估能力。

### 12. SQLite 在桌面应用并发场景下（前端读写 + Python sidecar 读写）如何处理锁竞争？WAL 模式是否足够？

**考察点**：SQLite 并发模型理解，WAL 模式的实际表现，多进程访问同一 SQLite 文件的坑。

### 13. FTS5 使用了 trigram tokenizer，为什么不用默认的 porter tokenizer？对中文分词的支持如何解决的？

**考察点**：全文搜索实践经验，CJK 语言的分词挑战，trigram 的优缺点（索引体积 vs 召回率）。

### 14. 24 个数据库 migration——你是如何管理 schema 变更的？有没有回滚策略？

**考察点**：数据库版本管理（refinery），向后兼容性，CI/CD 中的 migration 测试。

---

## 四、闪卡系统与算法

### 15. FSRS 和传统的 SM-2（Anki 算法）核心区别是什么？你为什么要引入 FSRS？

**考察点**：间隔重复算法的理解深度，FSRS 的三参数模型（difficulty/stability/retrievability），ts-fsrs 库的使用经验。

### 16. 卡片候选人（candidate）到正式卡片（card）的状态流转中，用户的审核操作是如何影响后续 AI 生成的？有没有反馈学习机制？

**考察点**：人机协同的产品设计，Few-shot learning 的应用可能性，用户行为数据的利用。

### 17. 卡片去重使用 SHA-256 on (document_id, front, back)——如果一道题只是改了措辞但语义相同，会去重吗？是否有更好的方案？

**考察点**：去重策略的准确性 vs 性能权衡，语义去重（embedding similarity）的可行性分析。

---

## 五、PDF 处理与前端性能

### 18. pdfjs-dist 渲染大文档（100+ 页）时遇到了哪些性能问题？你做了什么优化？

**考察点**：虚拟化渲染（TanStack Virtual），Canvas 回收策略，增量渲染的实际经验。

### 19. 文本选择高亮的 anchor 定位机制在文档被重新解析后还能准确定位吗？anchor 的设计思路是怎样的？

**考察点**：富文本标注的锚点技术（text offset、regex context、structural anchor），Docling 重解析的兼容性。

### 20. 前端如何处理高频状态更新（如 FSRS 复习进度、AI 生成事件流）而不引起性能退化和不必要的重渲染？

**考察点**：React 性能优化（selector、memo、useMemo），TanStack Query 的缓存策略，Zustand 的 selector 精确订阅。

---

## 六、工程化与测试

### 21. 你的测试策略是什么？TypeScript 和 Rust 之间的 IPC 契约如何测试？

**考察点**：端到端测试（Playwright）的覆盖范围，单元测试（Vitest）的关键路径，Rust 侧的测试集成，IPC 契约的验证方式。

### 22. 项目中有 CI/CD 吗？如何保证跨平台（Windows + macOS + Linux）构建的一致性？

**考察点**：Tauri 跨平台构建的挑战（系统依赖、Python sidecar 的打包），CI 流水线设计。

### 23. Python sidecar 的依赖管理如何与桌面应用打包配合？用户安装时需要独立安装 Python 环境吗？

**考察点**：PyInstaller/PyOxidizer 嵌入经验，Tauri sidecar 的打包机制，最终用户安装体验。

---

## 七、产品思维与项目深度

### 24. 你自己是这款产品的用户吗？你在实际使用中发现了什么 AI 生成的质量问题？这些反馈如何推动了技术改进？

**考察点**：Dogfooding 实践，产品迭代闭环，从使用者到开发者的洞察转化。

### 25. 如果要把这个项目做成商业产品，你觉得最大的技术挑战是什么？最大的产品挑战是什么？

**考察点**：技术视野和产品 sense 的平衡，对市场竞品（Anki、RemNote、Readwise）的认知。

### 26. 项目中你感到最自豪的一个技术决策是什么？最想重构的一块代码是什么？

**考察点**：技术反思能力，对自身代码的客观评价，工程成熟度。
