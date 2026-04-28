基于你给的架构文档，主要问题如下：

## 致命问题

1. **三套运行时太重**
   React + Rust + Python + SQLite + Stronghold + sidecar + 本地 HTTP Gateway，复杂度高。桌面应用会面临安装、升级、打包、进程管理、环境兼容、日志追踪困难。

2. **跨语言契约维护成本过高**
   TypeScript 类型、Zod、Rust DTO、Pydantic、SQLite migration 五套契约并存，极易漂移。越到后期，改一个字段会牵动太多层。

3. **Python sidecar 是稳定性风险点**
   Python runtime 探测、端口分配、健康检查、启动失败、依赖缺失、进程残留、杀不干净，都会影响桌面端体验。

4. **Host HTTP Gateway 是潜在安全边界薄弱点**
   绑定 `127.0.0.1` 还不够。文档没有明确说明认证 token、请求签名、端口暴露保护、重放防护、权限隔离。

5. **Workflow Runtime 过于自研**
   `workflow_runs/events/checkpoints` 看起来像自己实现了轻量任务引擎，但没有明确状态机、幂等、重试策略、取消语义、并发限制、失败恢复规则。

## 架构层问题

6. **Rust Host 职责过重**
   Rust 同时管 IPC、DB、Secret、Gateway、workflow、sidecar、日志、文件系统。它会变成“大泥球中枢”。

7. **Python 只做编排，但边界仍然模糊**
   Python 不写 SQLite，但通过 HostGateway 间接写 workflow、卡片、播客状态。实际仍然深度影响持久化状态，责任没有完全隔离。

8. **前端 mock fallback 有风险**
   mock fallback 容易掩盖真实 IPC 问题，尤其是非 Tauri 环境测试通过、真实桌面端失败。

9. **缺少统一领域模型**
   文档、section、chunk、anchor、card、candidate、review、QA、podcast 之间关系很多，但没有看到清晰的 domain model 边界。

10. **缺少模块化边界**
    `documents/cards/knowledge/podcast/settings` 是按功能分目录，但不是严格 bounded context。后期互相引用会越来越多。

## 数据层问题

11. **SQLite 承载过多**
    文档元数据、chunks、vectors、workflow、QA、cards、review、podcast、budget、points 全塞 SQLite。短期方便，长期迁移、备份、性能、膨胀都会麻烦。

12. **向量数据版本管理不足**
    没看到 embedding model version、chunk strategy version、index rebuild policy、过期向量清理策略。

13. **文件系统与数据库一致性风险**
    文档本体、音频、导出物在文件系统，元数据在 SQLite。缺少事务式一致性设计，容易出现 DB 有记录但文件丢失，或文件存在但 DB 无引用。

14. **删除策略不清楚**
    文档删除后，chunks、vectors、anchors、cards、podcast、QA 引用怎么处理，没有看到明确级联、软删除、归档策略。

15. **缺少备份/迁移/恢复设计**
    本地优先应用必须考虑数据库损坏、迁移失败、用户换机、导出完整学习库。

## AI 工作流问题

16. **RAG 质量评估缺失**
    有 RAG 链路，但没有看到 retrieval eval、citation accuracy、answer faithfulness、chunk recall、回归测试集。

17. **卡片生成质量闭环不足**
    有生成、候选、复习，但没有明确“复习表现反哺卡片质量”的机制。

18. **播客生成链路太长**
    检索、提纲、脚本、评审、TTS、拼接都在一个 workflow 内，失败点太多。需要拆成更小的可恢复阶段。

19. **Provider 抽象可能过度复杂**
    LiteLLM + 多 Provider + BYOK + model discovery + workflow assignment + budget usage，复杂度高。早期容易拖慢核心体验。

20. **Fallback 机制危险**
    虽然要求显式标记 fallback，但 fallback 仍可能污染用户学习内容。AI 学习产品里，低质量 fallback 比失败更危险。

## 前端问题

21. **页面导航靠 `activeNavItem`，扩展性弱**
    没有真正路由体系，深链接、恢复状态、浏览器式历史、打开指定文档/卡片/QA 都会受限。

22. **Reader 状态特殊处理会变复杂**
    `reader.documentId` 控制进入 ReaderPage，这种全局状态驱动页面切换，后期容易和导航、弹窗、上下文面板冲突。

23. **Feature 和 component 边界不清**
    `components/documents`、`features/documents`、`services/renderer` 都涉及文档能力，后期容易重复逻辑。

24. **前端状态来源太多**
    TanStack Query、Zustand、gateway mock、Reader state、workflow state 并存，容易出现缓存不一致。

## 可观测性问题

25. **日志分散**
    前端日志、Rust 日志、Python 日志、workflow events 四套系统。没有统一 trace id 贯穿一次用户操作。

26. **缺少性能指标**
    没看到导入耗时、解析耗时、embedding 耗时、RAG latency、token 成本、TTS 耗时、DB 查询耗时的统一指标。

27. **缺少用户可见诊断**
    本地 AI 桌面应用失败概率高，但架构没有说明诊断包、错误报告、用户自助修复。

## 测试问题

28. **E2E 不等于跨进程可靠性**
    你有 Playwright、unit、smoke，但真正风险在 React-Rust-Python-SQLite-文件系统-Provider 的组合路径。

29. **缺少契约测试中心**
    既然多语言契约这么多，应该有单一 schema source 或自动生成机制。现在靠规则同步，容易漏。

30. **缺少失败注入测试**
    没看到：Python 崩溃、Provider 超时、SQLite locked、文件缺失、migration 失败、网络断开、Stronghold 解锁失败。

## 产品架构问题

31. **主链路过长**
    导入 → 解析 → RAG → 卡片 → 复习 → 播客。链路完整，但太宽。MVP 风险是每个模块都不够深。

32. **核心价值焦点不够尖**
    阅读、RAG、卡片、复习、播客、动画、积分、BYOK 都在做。架构上已经像大产品，但早期应先压缩主战场。

33. **学习系统闭环没有被建模为核心**
    现在更像“功能集合”，不是“学习状态机”。文档、卡片、复习、问答、播客之间缺少统一学习进度模型。

## 额外问题：

1.问题：Python 服务改成“按需启动”，不要 App 启动就预热

现在 Tauri 启动时就启动 Host HTTP Gateway，然后后台启动 Python orchestration service。这对个人项目太重，用户只是打开资料库或复习卡片时，不应该启动 Python、探测依赖、占端口

2.Host HTTP Gateway 加本地 token
Host Gateway 绑定 127.0.0.1，手写 HTTP 解析，只读取 Content-Length，然后直接进入 route_request(method, path, body, state)。 127.0.0.1 不是安全边界，本机其他进程也能扫端口请求。

3.前端 mock fallback 改成显式 dev-only
当前 invoke() 在非 Tauri 环境会直接返回 mock 数据。
这会导致“网页开发环境看起来正常，真实 Tauri 失败”。

5.删除文档改成软删除，不要直接删 DB + 文件
现在 delete*document 先从 DB 删除，再 remove_file，而且文件删除错误被 let * = 吞掉。
DocumentRepository::delete 也直接删除 anchors、chunks、documents。

6.文件入库加 asset 表，至少管住原文档现在导入时会计算 hash、准备 target path、copy 到应用目录。
但文件和 DB 的关系仍然主要绑在 documents.file_path 上。后面音频、媒体、导出物一多，会失控。

8.
