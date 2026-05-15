# Chunking 优化策略

本文档定义 XueJian 后续 chunking 优化的策略基础。它不是立即重构方案，也不要求马上修改数据库或解析代码；它用于统一后续改进方向，让分块同时服务 RAG 问答质量、引用忠实度、智能制卡质量和 source quote 可追溯性。

全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md) 为准。本文负责其中 Phase 1: RAG Data Foundation 的证据单元生成与结构落库前提；Parent/Child Auto-Merge 的执行逻辑属于后续 RAG Quality 2.0 阶段，但依赖本文定义的数据结构。

本文与 [RAG 检索质量升级蓝图](./rag-retrieval-upgrade.md) 的分工：

- 本文负责“文档如何被切成可检索、可引用、可制卡的结构化证据单元”。
- `rag-retrieval-upgrade.md` 负责“这些证据单元如何被检索、合并、rerank、门控、打包和展示 trace”。

## 1. 定位与非目标

chunking 是 Documents、RAG 和 AI 制卡的共同基础。分块质量不好时，后续 rerank、RAG trace、citation audit 和制卡 critic 都只能补救一部分问题，无法从根上解决“命中片段不完整”“引用片段过宽”“一张卡跨多个知识点”等质量缺陷。

目标：

- 让 child chunk 成为 embedding、检索、citation 和制卡 source quote 的最小稳定证据单元。
- 让 parent/section 成为回答上下文扩展和语义边界来源。
- 让同一套分块同时支持 RAG 问答和智能制卡，而不是为两个功能维护两套切分逻辑。
- 让后续开发可以用 chunking profile、评估集和可重复测试持续改进。

非目标：

- 不立即重构代码或数据库。
- 不引入第二套文档解析服务。
- 不依赖 LLM 作为第一版边界判断。
- 不做扫描版 PDF OCR、复杂表格结构化、公式语义解析或知识图谱。
- 不把 parent context、metadata、memory 或模型判断当作 citation source。

## 2. 当前状态诊断

当前项目已经具备一部分正确方向：

- Python 解析侧已有 `Section -> Parent -> Child` 雏形。
- `docling_pipeline.py` 会构建 sections，并为每个 section 生成 parent chunk 和 child chunks。
- child chunk 默认上限接近 900 字符，parent chunk 默认上限接近 6000 字符。
- document embedding workflow 已优先选择 `chunkKind == "child"` 的 chunks。

当前主要问题：

- Rust MVP0 入库路径没有完整保留 Python 输出的结构信息。
- `sections`、`sectionId`、`anchorId`、chunk `metadata` 等信息在保存时可能被丢弃。
- `chunkKind` 主要被编码进 `parser`，而不是作为完整检索和上下文扩展契约稳定使用。
- RAG 检索目前仍主要像 flat/child chunk 检索，没有真正的 parent/child auto-merge。
- 智能制卡还没有稳定利用 chunk metadata 判断定义、步骤、例子、对比等知识类型。

这些问题说明：下一步重点不应先上更复杂模型，而应先把结构化分块契约落稳。

## 3. 目标分块模型

推荐长期模型：

```text
Document
-> Section
-> Parent Chunk
-> Child Chunk
-> Source Anchor
```

职责划分：

- `Document`：文档级元数据、文件路径、解析状态、chunking profile。
- `Section`：章节级语义边界，保留 heading、hierarchy path、页码范围和完整局部内容。
- `Parent Chunk`：section 的局部上下文摘要或裁剪内容，用于 RAG auto-merge 和回答理解。
- `Child Chunk`：检索、embedding、citation、source quote、制卡的主要工作单元。
- `Source Anchor`：页码、quote、bbox 等可追溯定位信息。

硬边界：

- citations 只能来自 child chunk 或可直接映射到 child chunk 的 source quote。
- parent/section 可以帮助回答，但不能直接替代 child chunk 成为引用来源。
- metadata 可以帮助排序和制卡，但不能作为事实证据。
- 每次重解析都必须产生稳定、可重复、可回归的 chunking 结果。

## 4. 推荐规则策略

第一版智能 chunking 应规则优先，避免把核心数据质量绑定到 LLM 成本、延迟和不稳定输出上。

### 4.1 Section 构建

section 应优先根据以下信号构建：

- heading/title 层级。
- PDF block 的页码连续性。
- Markdown 标题。
- 明显的列表、表格、代码块、公式块边界。
- 最小内容长度。

没有明确 heading 的内容进入 preamble 或相邻 section，但必须保留 hierarchy path 和页码范围。

### 4.2 Parent Chunk

parent chunk 承载 section 级局部上下文：

- 默认每个 section 生成一个 parent chunk。
- parent 内容上限建议约 6000 字符。
- parent 主要用于 RAG auto-merge 和解释上下文，不直接用于 citation。
- section 太长时，parent 可以是裁剪内容或局部窗口，而不是整篇无界塞入。

### 4.3 Child Chunk

child chunk 是主要证据单元：

- 默认目标粒度为 500-900 字符。
- 按 block/paragraph/list item/code block/table block 等结构边界切分。
- 保留少量 overlap，第一版可沿用 1 个 block overlap。
- 不为了满足长度强行切开定义、公式、代码块、表格行组或步骤列表。
- child chunk 应尽量自包含：读者看到该片段时能理解它讲的是哪个局部主题。

### 4.4 特殊内容

第一版采用结构保守保留：

- 列表：尽量保持同一列表或连续步骤在同一 child 内。
- 表格：保留表格标题、列名和相关行组，不做深度表格问答解析。
- 代码：保持函数、类、配置片段或连续代码块完整。
- 公式：保留公式及其前后解释，不单独切成孤立符号。
- 图注：如果可抽取文本，和相邻解释块保持在同一局部上下文。

如果特殊内容超过 child 上限，应优先按语义块拆分，而不是按字符硬切。

## 5. Metadata 策略

metadata 的目标是支持检索诊断、制卡排序和后续评估，不作为事实来源。

建议 child metadata 至少包含：

```text
chunkingProfile
hierarchyPath
sectionHeading
sourceBlockIds
anchorIds
anchorHashes
blockTypes
childIndex
characterCount
```

建议增加轻量知识类型弱标签：

```text
candidateKnowledgeType:
  definition
  mechanism
  step_list
  comparison
  example
  formula
  code
  table
  narrative
  unknown
```

弱标签规则：

- 允许为空或 `unknown`。
- 可由规则推断，不要求模型判断。
- 可用于制卡候选排序和 UI/诊断展示。
- 不得作为 citation 或事实依据。
- 后续可用人工标注或评估结果修正规则。

## 6. 与 RAG 的关系

RAG 使用 chunking 的推荐方式：

```text
query
-> retrieve child chunks
-> expand parent/section context
-> rerank evidence
-> pack citation evidence + expanded context
-> answer
-> audit citations against child chunks
```

关键约束：

- embedding 优先打 child chunks。
- search/hybrid retrieval 返回 child chunks 作为主要候选。
- parent/section context 只在检索后扩展。
- answer prompt 应区分“可引用 evidence”和“扩展上下文”。
- citation audit 只接受 child chunk set。

好 chunking 对 RAG 的直接收益：

- 更高 retrieval relevance。
- 更少无关长片段进入 prompt。
- 更少答案引用不支持的问题。
- 更稳定的 no evidence 判断。
- 更容易诊断“召回失败”还是“上下文不足”。

## 7. 与智能制卡的关系

制卡使用 chunking 的推荐方式：

- child chunk 是制卡候选的主要来源。
- parent/section 只为卡片解释提供背景。
- source quote 必须能回到 child chunk 或 source anchor。
- `candidateKnowledgeType` 可帮助决定卡片类型：定义卡、步骤卡、对比卡、例子卡、公式卡、代码卡。

好 chunking 对制卡的直接收益：

- 一张卡更容易对应一个知识点。
- source quote 更短、更准确。
- 低质量卡片和机械复制原文减少。
- 重复卡更容易检测。
- 用户后续删除和大改比例下降。

制卡侧应避免：

- 用 parent 整段直接生成多知识点大卡。
- 用多个相距很远的 child chunk 拼出无法追溯的答案。
- 把 metadata 标签当作原文事实。

## 8. 后续工程路线

### Phase 1：结构落库修复

- 保留 parser 输出的 sections、sectionId、anchorId、chunkKind 和 metadata。
- 使用现有 `document_sections` 与 `document_chunks` 结构优先落地。
- 保证 host gateway 和前端 DTO 能读到必要结构字段。

### Phase 2：Parent/Child Auto-merging

- RAG 检索先命中 child chunks。
- 根据 sectionId 或 parent relation 扩展 parent/section context。
- packing 时区分 citation evidence 和 expanded context。
- citation audit 仍只校验 child chunks。

说明：本文只定义 auto-merge 所需的数据前提和结构边界；具体检索后合并、rerank、gate 和 trace 实现在总纲 Phase 3: RAG Quality 2.0 中落地。

### Phase 3：Chunking Profile

- 引入 `chunkingProfile` 或等价版本标记。
- 新 profile 生效后，旧文档标记为需要重解析和重新 embedding。
- 不从旧 flat chunks 自动推断结构，避免错误迁移。

### Phase 4：双指标评估

- RAG 评估：retrieval relevance、citation valid rate、no evidence accuracy、context precision。
- 制卡评估：有效卡片率、source quote 匹配率、重复率、手工大改率。
- 建立小型 golden corpus，覆盖定义、列表、表格、公式、代码、多页 section 和长叙述。

### Phase 5：模型辅助智能分块

在规则版稳定后，再考虑模型辅助：

- 主题边界建议。
- 知识类型标签修正。
- 长 section 的概念级切分建议。
- 表格/公式/图注的语义摘要。

模型辅助必须异步、可失败回退、可评估，不得成为解析主链路的硬依赖。

## 9. 验收指标

RAG 指标：

- 正确 child chunk 命中率。
- citation valid rate。
- no evidence 正确率。
- parent expansion 后回答完整度。
- Ragas/LangSmith context precision 和 faithfulness。

制卡指标：

- source quote 匹配率。
- 单卡知识点原子性。
- 自动生成卡片有效率。
- 重复卡比例。
- 用户删除/大改比例。

工程指标：

- chunking profile 可追踪。
- 解析结果可重复。
- 旧文档 stale 状态可识别。
- reparse + re-embedding 链路可恢复。
- trace 中能定位 chunking、retrieval、packing 或 citation 哪一层出问题。

## 10. 实施约束

- 第一版规则优先，不依赖 LLM。
- 保持 Rust/SQLite 为数据权威。
- Python parser 只提交结构化 analysis，不直接写库。
- 不新增第二套 RAG 服务。
- 不保存完整敏感正文作为长期诊断 artifact。
- 不改变 RAG 的 embedding gate、no FTS-only 正式回答、citation 只来自本轮检索证据等底线。
