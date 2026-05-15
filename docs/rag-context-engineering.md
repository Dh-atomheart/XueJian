# RAG Context Engineering

## 1. 定位

本文档是 XueJian RAG 知识问答的 Context Engineering 架构原则文档，补充 [RAG 知识问答设计文档](./rag-knowledge-qa.md)。

全局路线以 [RAG -> Agent -> Multi-Agent 升级总路线图](./rag-agent-upgrade-roadmap.md) 为准。本文服务总纲中的 Phase 3-5：先约束 RAG Quality 2.0 的 query rewrite、context packing 与 evidence boundary，再支持 Single Agent QA 的上下文治理，最后才扩展 memory 与工具化场景。

`rag-knowledge-qa.md` 负责定义学习型 RAG 的基础链路、检索要求、回答契约和引用校验；本文档专门约束多轮问答中的上下文组织、单会话记忆、长上下文预算、自动压缩和 query rewrite。

当前目标是把知识问答从“单轮 grounded RAG”增强为“学习导师型 RAG”：

- 能理解一条会话内的连续追问、指代和学习目标。
- 能在长会话中保留必要的学习线索。
- 仍然只基于用户已导入、已解析并已向量化的文档回答。
- 不变成通用聊天助手，也不把历史回答当作文档事实。

本文档面向未来开发者。它不替代具体实现设计，不锁死数据库字段或 API schema；它定义后续实现必须遵守的上下文工程边界。

## 2. 当前状态诊断

当前知识问答链路已经具备第一版 RAG 的关键基础：

- 使用 embedding gate 判断文档是否可进入正式问答。
- 使用 hybrid retrieval 获取候选 chunks。
- 使用 chunk packing 控制本轮 retrieved passages 的数量和长度。
- 使用引用校验确保 citations 来自本轮检索结果。
- 使用会话和消息表持久化问答记录，支持前端回放。

但从 Context Engineering 角度看，当前系统仍主要是：

```text
单轮 grounded RAG + 会话记录 UI
```

它还缺少以下能力：

- 历史消息没有进入 RAG workflow，无法稳定理解“它”“刚才那个概念”“上一点”等指代。
- 会话记录只是 transcript，不是 memory；没有单会话摘要、压缩点或记忆边界。
- 没有 query rewrite，检索 query 基本等同于用户当前输入。
- 没有模型 context window 抽象，也没有按 token budget 分配上下文。
- 长会话没有自动压缩策略，无法在窗口接近上限时保持可控。
- 现有 Ragas 评估主要覆盖单轮 faithfulness、answer relevancy 和 context precision，不能充分验证多轮记忆能力。

这些不足不否定当前 RAG 基础链路。它们说明下一阶段的重点不只是“检索更多内容”，而是要把进入模型窗口的内容组织成可控、可解释、可评估的上下文。

## 3. 核心原则

### 3.1 证据边界优先

历史记忆只用于理解用户意图，不作为事实依据。

RAG 回答中的事实、结论和 citations 必须来自本轮 retrieved chunks。历史对话、会话摘要和 query rewrite 结果都不能生成 citations，也不能替代文档证据。

### 3.2 每轮必须重新检索

多轮问答不是把历史回答继续喂给模型让它续写。每一轮都必须基于当前问题和会话线索重新执行检索。

即使用户问的是“继续解释”“它和刚才那个有什么区别”，系统也应该先把问题改写成可检索的 standalone query，再检索文档证据。

### 3.3 记忆服务于意图，不服务于编造

单会话记忆应该帮助系统理解：

- 用户正在学习什么主题。
- “它”“这个概念”“上一点”指向什么。
- 用户已经问过哪些方向。
- 哪些问题仍未解决。
- 用户偏好的解释风格或学习目标。

单会话记忆不应该保存为“事实缓存”，也不应该让模型绕过本轮检索直接回答。

### 3.4 检索证据优先于会话记忆

当模型窗口有限时，优先保留 retrieved passages，其次保留当前问题、系统规则、最近轮次和会话摘要。

如果历史上下文与检索证据争夺预算，应该压缩或裁剪历史上下文，而不是牺牲本轮证据。

### 3.5 长上下文不是无限拼接

256k 或 1m context window 不能被理解为“可以把所有历史都塞进去”。长上下文仍然需要 token budget、重要性分层和自动压缩。

窗口越长，越需要明确：

- 哪些内容有资格进入 prompt。
- 哪些内容应该变成摘要。
- 哪些内容只能作为诊断元数据。
- 哪些内容必须被丢弃。

### 3.6 压缩必须保留边界

压缩不是简单缩短文本。压缩后的 memory 必须继续区分：

- 用户意图和学习目标。
- 对话中的指代关系。
- 已讨论主题。
- 未解决问题。
- 不可作为证据的历史回答摘要。

压缩后的内容仍然只是 memory，不是 citation source。

## 4. 上下文分层

后续 RAG prompt 应按层组织上下文，而不是把所有文本拼成一个平面字符串。

推荐分层如下：

### 4.1 系统规则

系统规则定义不可违反的行为边界：

- 只基于 retrieved passages 回答。
- 不使用模型常识补全文档没有的信息。
- citations 只能来自本轮 retrieved chunks。
- 历史 memory 只能用于理解意图。
- 证据不足时明确拒答。

### 4.2 当前用户问题

当前问题是本轮回答的主任务。

即使存在 query rewrite，最终回答也应该回应用户原始问题，而不是只回应改写后的检索 query。

### 4.3 单会话记忆摘要

单会话记忆摘要保存旧轮次压缩后的学习线索。

它应该短、稳定、可迭代更新，并明确被标记为“conversation memory”。它不应混入 retrieved passages 区域。

### 4.4 最近 2-3 轮原始问答

最近轮次用于保留尚未进入摘要的短期上下文，尤其是代词、比较对象和连续追问。

最近轮次可以帮助 query rewrite，但不应直接成为答案事实来源。

### 4.5 本轮 retrieved passages

retrieved passages 是唯一可作为事实依据和 citations 来源的上下文层。

该层必须保留 chunk id、document id、页面信息、片段内容和检索分数等必要元数据，便于后续 citation 校验和诊断。

### 4.6 诊断元数据

诊断元数据用于排查和评估，但不应直接进入最终回答内容。

可记录的信息包括：

- 是否发生 query rewrite。
- token 估算。
- 使用的模型窗口预算。
- 是否触发异步压缩。
- 是否触发应急阻塞压缩。
- 截断或压缩原因。

诊断元数据不应记录完整 API key、完整文档内容或不必要的敏感文本。

### 4.7 证据层级上下文

后续检索质量升级应把“召回粒度”和“回答上下文粒度”分开处理：

- child/leaf chunk 负责 embedding 和精确召回。
- parent/section context 负责补足回答所需的局部语义边界。
- Parent/Child Auto-merging 只能把本轮命中的 child chunk 扩展为相邻 parent/section 上下文。
- citations 仍只能来自本轮 retrieved child chunks，不能直接引用 parent context、conversation memory 或 rewrite 结果。
- parent context 进入 prompt 前必须经过 token budget 和去重，不得把整篇文档无界塞入模型窗口。

这意味着 retrieved passages 可以包含两类信息：可引用的 child evidence，以及不可直接引用但可帮助理解的 expanded context。最终 citation audit 必须验证引用落在 child evidence 集合内。

### 4.8 Rerank、相关性门控与 trace 边界

Rerank 和 relevance gate 属于证据选择层，不属于事实生成层：

- rerank 只改变候选证据排序、保留集合和诊断分数，不生成事实、不生成 citation。
- relevance gate 只决定进入回答、触发二次检索或返回 `no_relevant_content`。
- 二次检索可以使用 rewritten query、step-back query 或 HyDE-style query，但仍必须重新经过 embedding gate、hybrid retrieval、auto-merge、rerank、packing 和 citation audit。
- 如果二次检索仍没有足够证据，必须拒答，不能用 memory 或模型常识补全。

RAG trace 应分为两层：

- 用户可见层：当前阶段、检索模式、命中文档数、是否启用 rerank、引用校验状态和可理解失败原因。
- 开发诊断层：chunk refs、RRF score、rerank score、parent merge 摘要、relevance gate 决策、context budget 和 citation audit 摘要。

trace 不得包含完整 prompt、完整 chain-of-thought、API key、未裁剪敏感正文或完整长会话历史。

## 5. 推荐链路

多轮 RAG 的推荐链路如下：

```text
用户问题
-> 读取会话摘要和最近 2-3 轮
-> 判断上下文预算
-> 必要时执行应急阻塞压缩
-> query rewrite 生成 standalone retrieval query
-> 使用改写 query 执行 embedding 和 hybrid retrieval
-> chunk packing 构造本轮 retrieved passages
-> grounded answer 基于用户原问题和本轮 retrieved passages 生成回答
-> citation validation 校验引用
-> answer 写回会话
-> 若达到压缩阈值，回答后异步压缩旧轮次
```

### 5.1 Query Rewrite

query rewrite 的目标是把依赖历史的用户输入改写为可检索问题。

与总纲保持一致：query rewrite 第一版按需触发，而不是每次强制触发。典型触发条件包括多轮指代、问题过短、术语表达不完整、首轮检索低相关；无论是否 rewrite，原始 query 都应保留并参与召回。

示例：

```text
最近上下文：上一轮讨论了 retrieval practice 和 spaced repetition。
用户问题：它和刚才那个概念区别是什么？
改写 query：retrieval practice 和 spaced repetition 的区别是什么？
```

query rewrite 的结果用于检索，不直接展示给用户。最终回答仍应回应用户原始问题。

### 5.2 Grounded Answer

最终回答 prompt 可以使用 conversation memory 理解用户意图，但只能使用 retrieved passages 支撑事实。

如果 memory 指向某个主题，但本轮检索没有找到足够证据，系统应返回无证据回答，而不是根据历史回答或模型常识补全。

## 6. 长上下文与压缩原则

### 6.1 模型窗口识别

系统应优先自动识别当前 `knowledge_qa` 模型的 context window。

推荐优先级：

```text
显式模型能力配置
-> 内置 provider/model context window 映射
-> 默认 256k
```

第一阶段默认支持两个主要档位：

- `256k`
- `1m`

未知模型默认按 `256k` 规划。这个默认值是产品取舍：优先匹配现代长上下文模型体验，而不是按最保守的小窗口处理。

### 6.2 Token Budget

Context Engineering 应使用 token budget 思维，而不是只按字符数截断。

推荐预算优先级：

```text
系统规则
-> 当前用户问题
-> 本轮 retrieved passages
-> 最近 2-3 轮
-> 单会话记忆摘要
-> 诊断元数据
```

retrieved passages 的预算优先级高于历史记忆。历史越长，越应该被摘要，而不是无限追加。

### 6.3 90% 预备压缩

当估算上下文达到模型 context window 的 90% 时，应进入预备压缩状态。

第一阶段推荐使用回答后异步压缩：

```text
本轮回答完成
-> 写回 assistant message
-> 后台压缩旧轮次
-> 更新单会话摘要和压缩点
```

这样可以避免每次触发压缩都阻塞用户提问。

### 6.4 应急阻塞压缩

如果发送前估算已经超过模型窗口硬上限，系统不应继续向模型发送超窗 prompt。

此时允许执行应急阻塞压缩：

```text
发送前估算超窗
-> 压缩旧轮次到安全点
-> 保留最近 2-3 轮原文
-> 重新估算预算
-> 继续 query rewrite 和 retrieval
```

如果应急压缩失败，系统可以降级为只保留最近 2-3 轮和已有摘要，但仍必须保证本轮 retrieved passages 的预算。

### 6.5 压缩对象

压缩应主要处理旧轮次。

推荐策略：

- 保留最近 2-3 轮原始问答。
- 将更旧的 user/assistant turns 合并进滚动摘要。
- 摘要覆盖到一个明确的压缩点。
- 后续压缩从上次压缩点继续，而不是每次全量重写。

## 7. 记忆内容边界

单会话 memory 应保留以下内容：

- 用户当前学习目标。
- 本会话反复出现的主题。
- 已讨论概念的名称和关系线索。
- 代词和省略表达的可能指向。
- 用户偏好的解释方式。
- 用户明确表示仍未理解或希望稍后继续的问题。

单会话 memory 不应保留为可引用事实：

- “模型上一轮说过的结论”。
- 未经本轮检索支持的综合判断。
- 没有来源的数字、定义、比较和因果结论。
- 模型自由发挥的背景知识。

推荐摘要风格：

```text
本会话正在围绕《文档 A》中的学习方法主题展开。
用户关注 retrieval practice、spaced repetition 的区别，以及如何用于复习计划。
最近的指代线索：“它”可能指 retrieval practice；“刚才那个概念”可能指 spaced repetition。
用户偏好：希望回答结构化、先给直接结论，再解释区别。
未解决问题：如何把两个方法组合进每日复习流程。
注意：以上为对话记忆，不是文档证据；回答必须重新检索。
```

## 8. 正反例

### 8.1 连续追问

正例：

```text
用户：retrieval practice 是什么？
系统：检索文档并回答。
用户：它和刚才那个概念区别是什么？
系统：根据最近轮次把问题改写为“retrieval practice 和 spaced repetition 的区别是什么”，重新检索，再基于本轮证据回答。
```

反例：

```text
用户：它和刚才那个概念区别是什么？
系统：直接根据上一轮回答和模型常识编造区别，没有重新检索，也没有新的 citations。
```

### 8.2 压缩后追问

正例：

```text
长会话被压缩后，memory 保留用户正在比较 retrieval practice 和 spaced repetition。
用户：那我应该先用哪个？
系统：用 memory 理解“哪个”指两个学习方法，再重新检索相关文档证据回答。
```

反例：

```text
压缩摘要中写过“retrieval practice 更适合长期记忆”。
用户：那我应该先用哪个？
系统：直接引用摘要结论回答，并把摘要当作 citation 来源。
```

### 8.3 无证据问题

正例：

```text
用户：作者有没有推荐每天晚上 10 点复习？
系统：检索后没有找到相关证据，返回“当前资料中没有足够证据回答这个问题”。
```

反例：

```text
用户：作者有没有推荐每天晚上 10 点复习？
系统：根据学习常识建议晚上复习，并给出没有来源的解释。
```

### 8.4 记忆冲突

正例：

```text
memory 暗示用户关注 A 概念，但本轮检索证据指向 B 概念。
系统：优先说明本轮检索结果，并在必要时提示“如果你指的是 A，请换一种问法或限定文档范围”。
```

反例：

```text
系统为了迎合 memory，忽略本轮检索证据，把答案强行解释成 A 概念。
```

## 9. 评估原则

Context Engineering 的评估不能只依赖单轮 Ragas。

现有 Ragas 评估仍然有价值，继续用于诊断：

- `faithfulness`
- `answer_relevancy`
- `llm_context_precision_without_reference`

但它主要评估单轮问题、回答和 retrieved contexts 的关系。多轮能力还需要新增确定性测试和专门样本。

### 9.1 多轮确定性测试

第一阶段应优先补充确定性测试，覆盖：

- 指代消解：用户使用“它”“这个概念”“上一点”时，query rewrite 能生成可检索问题。
- 证据边界：历史中出现过但本轮 retrieved passages 没有支持的内容，不得进入事实回答。
- 压缩后追问：旧轮次被压缩后，系统仍能保留学习目标和比较对象。
- 无证据拒答：memory 暗示某个方向，但文档没有证据时仍拒答。
- citations 校验：任何来自 memory 或历史回答的 citation 都应被拒绝。

### 9.2 评估输出

多轮评估应关注以下诊断信号：

- 是否发生 query rewrite。
- 改写是否保留用户真实意图。
- 检索 query 是否比原始问题更可检索。
- 历史 memory 是否污染事实回答。
- 压缩前后回答质量是否明显退化。
- citations 是否全部来自本轮 retrieved chunks。

### 9.3 与 Ragas 的关系

Ragas 单轮评估和多轮 Context Engineering 测试是互补关系：

- Ragas 适合发现回答忠实度和检索上下文质量问题。
- 多轮确定性测试适合发现记忆、压缩和证据边界问题。
- 后续可以扩展多轮评估集，但不应把 Ragas 分数作为第一阶段多轮记忆能力的唯一门禁。

## 10. 演进路线

### V1：单会话记忆

V1 目标是让一条知识问答会话具备基本连续性。

能力范围：

- 单会话 memory summary。
- 最近 2-3 轮上下文注入。
- query rewrite。
- 模型 context window 识别。
- token budget 估算。
- 90% 预备压缩。
- 回答后异步压缩。
- 超窗时应急阻塞压缩。

不做：

- 跨会话长期记忆。
- 用户可编辑 memory UI。
- 把历史回答作为事实依据。
- 复杂 agent planning。

### V2：多轮评估与诊断

V2 目标是让 Context Engineering 的效果可评估、可回归、可定位。

能力范围：

- 多轮确定性评估集。
- query rewrite 失败分类。
- 压缩质量诊断。
- memory 污染检测。
- 压缩前后回答质量对比。
- 与 Ragas 报告并行的多轮诊断报告。

### V3：跨会话长期记忆

V3 才考虑跨会话长期记忆。

跨会话 memory 必须引入额外治理：

- 用户可查看。
- 用户可编辑或删除。
- 过期策略。
- 来源追踪。
- 隐私边界。
- 与文档证据的清晰分离。

在这些治理能力之前，不应把跨会话 memory 默认注入 RAG 回答链路。

## 11. 后续实现约束

后续实现可以自由选择具体字段、函数和任务拆分，但不得违反以下约束：

- 每轮问答必须重新检索。
- 历史 memory 不得作为 citations 来源。
- citations 只能来自本轮 retrieved chunks。
- query rewrite 只服务检索，不替代用户原始问题。
- 证据不足时必须允许拒答。
- 长会话必须有预算和压缩策略，不能无限拼接历史。
- 压缩摘要必须明确标记为 conversation memory，而不是 document evidence。
- 第一阶段 memory 只覆盖单会话。
- 摘要先仅内部使用，不设计用户可见编辑 UI。
- 压缩复用 `knowledge_qa` 模型配置。
- 未知模型 context window 默认 `256k`。
