# 前后端联通整改计划

日期：2026-04-25  
基于报告：`docs/audit/2026-04-25-full-frontend-backend-connectivity-report.md`

## 1. 目标

把当前项目从：

- `Web 页面和 mock 契约基本可用`

推进到：

- `Tauri 原生链路真实可执行`
- `Python orchestration 依赖齐备`
- `关键 workflow 不再被 fallback 掩盖`
- `关键 workflow 不再被 fallback 掩盖`

## 2. P0：先把“假联通”与“真阻塞”清干净

### P0-1. 给前端显式标注当前运行模式

问题：

- 目前浏览器环境下自动回退 mock，但页面层并不会持续明确告知“当前不是 Tauri 真后端”

实施：

1. 在应用全局增加运行模式标识：
   - `Web Mock`
   - `Tauri Native`
2. 在 Home、Library、Knowledge QA、Podcast、Graph、Settings 页顶部或状态区显示模式信息。
3. 对所有依赖真实后端的 CTA，在 `Web Mock` 模式下标注“仅 mock 演示”。

验收：

- Playwright 中可稳定看到 mock 模式提示
- 在 Tauri 中该提示自动切换为 native 模式

### P0-2. 补齐 Python orchestration 依赖

问题：

- 当前缺失至少 10 个关键包，直接阻断真实 workflow

实施：

1. 依据 `xuejian/orchestration_service/requirements.txt` 安装缺失依赖。
2. 增加一个仓库脚本，例如 `scripts/ci/check-orchestration-deps.py`，启动前先做 import 检查。
3. 在 Tauri 启动时将依赖检查结果写入日志与健康状态。

验收：

- 依赖检查脚本输出全绿
- `python orchestration_service/main.py --port 8787` 无缺包异常

### P0-3. 把 host gateway 缺失从“隐含失败”改成“可见失败”

问题：

- 当前 Python service 单独启动后 workflow 会返回 `503 host_gateway_unavailable`
- 前端和 Rust 对这一点没有形成统一、用户可理解的错误语义

实施：

1. 在 `get_orchestration_service_health` 返回中补充 host gateway 是否可用的字段，或在 `errorMessage` 中标准化描述。
2. 前端对 `503 host_gateway_unavailable` 做统一翻译，不直接暴露底层错误串。
3. 在 Knowledge QA、Library、Podcast、Graph 页面将此错误展示为“原生后端未完成握手”。

验收：

- 人工断开 host gateway 时，前端能给出稳定、可理解的提示
- 日志中能清晰定位为 host gateway 缺失，而不是泛化为内部错误

### P0-4. 给 fallback 结果打上显式标记

问题：

- 当前 UI 很容易让人误以为真实模型已成功运行

实施：

1. 在 Rust workflow 返回结果中增加统一字段：
   - `generationMode`
   - `fallbackReason`
   - `isFallback`
2. 前端在 Card Studio、Graph、Podcast、AnimationPreview 中显示“降级结果”徽标。
3. workflow event 和 checkpoint 里记录 fallback 原因。

验收：

- 人工制造 orchestration 不可用时，页面仍可运行，但结果明确标记为 fallback
- 自动化测试覆盖 fallback 标签展示

## 3. P1：打通真实主链路

### P1-1. 文档导入 -> 解析 -> 嵌入 -> 卡片生成

问题：

- Library 和 ImportDocumentButton 是主入口，但真实闭环最脆弱

实施：

1. 先单独打通 `pick_and_import_document`
2. 再验证 `run_document_parse_workflow`
3. 再验证 `run_document_embedding_workflow`
4. 最后验证 `start_card_generation_workflow`
5. 每一步都把文档状态写回 UI，不允许只停留在 toast

验收：

- 在 Tauri 中导入一个真实文档后，状态能经历：
  - `imported`
  - `parsed`
  - `retrieval_ready` 或等价值
  - `card generation started/completed`
- Card Studio 能看到与该文档真实关联的 candidate/card

### P1-2. Knowledge QA 真链路

问题：

- Knowledge QA 没有可靠 fallback，是真阻塞项

实施：

1. 先验证本地检索 `search_knowledge`
2. 再验证 `start_knowledge_qa_workflow`
3. 接通 workflow run / events / checkpoint 的前端展示
4. 对缺 embedding profile、缺 provider、orchestration 不健康三种错误做分流提示

验收：

- 用已嵌入文档发起真实问答
- 页面能看到非 mock 的 run/event 更新
- 问答结果包含真实来源引用

### P1-3. Graph Build 真链路

问题：


实施：

1. 在 graph build 完成后，把是否 fallback 的信息写入 build run
2. 前端 build panel 明确展示：
   - orchestration success
   - fallback shell graph
   - failed
3. Node/source/community 数据源与 build run 绑定显示

验收：

- 构建成功时能确认不是 fallback
- fallback 与真实构建在 UI 和日志里可区分

### P1-4. Podcast 真链路

问题：

- 当前播客页可能返回 fallback script/result，但音频并未真实生成

实施：

1. 补齐 TTS 相关依赖
2. 对 episode stage 细化：
   - retrieval
   - outline
   - script
   - review
   - audio
   - ready
   - fallback
   - failed
3. `PodcastPlayerModal` 只在真实音频路径存在时显示可播放态

验收：

- 真实 episode 能生成音频段并可播放
- fallback script 与真实 audio ready 态可清晰区分

### P1-5. Animation 真链路

问题：

- `quick_preview` 可 fallback，`video_render` 当前并未证实可用

实施：

1. 将动画结果状态标准化：
   - `ready_quick_preview`
   - `ready_video`
   - `fallback_preview`
   - `failed`
2. 在 `AnimationPreviewModal` 中分别展示脚本预览、视频预览、失败原因。
3. 为 `video_render` 增加依赖探测与日志输出。

验收：

- 快速预览与视频渲染的来源和状态可区分
- 渲染器不可用时给出稳定错误，而不是静默回退

## 4. P2：把 BYOK 与原生测试做成可回归能力

### P2-1. Settings/BYOK 最小真实 smoke

问题：

- 设置页后端命令面完整，但没有真实 provider 级验证

实施：

1. 选择最小支持矩阵：
   - `OpenAI`
   - `Anthropic`
2. 针对每个 provider 固定执行：
   - 保存 key
   - `test_api_connection`
   - `fetch_provider_models`
   - 绑定 workflow assignment
   - 运行一个最小 workflow
3. 将 smoke 结果写入独立文档或 CI 手册。

验收：

- 两个 provider 至少各有一条真实 smoke 路径
- 失败时能明确定位为密钥、网络、模型、provider 返回错误中的哪一种

### P2-2. 增加 Tauri 原生 smoke 清单

问题：

- 目前自动化主要停留在 Web 层

实施：

1. 新增原生 smoke 清单：
   - 启动应用
   - 读取设置
   - 拉起 orchestration
   - 导入文档
   - 解析/嵌入
   - 生成卡片
   - 提交复习
2. 允许先以手工脚本 + 记录文档形式存在，再逐步自动化。

验收：

- 每次重要改动后能执行一轮原生 smoke
- smoke 结果能进入 `docs/audit`

### P2-3. 报警与可观测性

问题：

- 当前很多失败只能从底层日志看出

实施：

1. 为 workflow 统一错误码：
   - `host_gateway_unavailable`
   - `provider_not_configured`
   - `dependency_missing`
   - `orchestration_unhealthy`
   - `fallback_used`
2. 将错误码写入 workflow events、checkpoint、前端反馈层。
3. 在 logs 中保留 requestId / runId / documentId / episodeId 等关联键。

验收：

- 任一失败都能通过页面提示和日志快速定位

## 5. P3：收尾与质量治理

### P3-1. 缩小“Web mock”和“native real”之间的语义差距

实施：

1. 统一 mock 数据结构与真实 schema
2. 让 mock 明确暴露自己不是生产结果
3. 避免 mock 中提供过于乐观的高级能力结果

验收：

- mock 不再制造“真联通错觉”

### P3-2. 建立页面级联通文档与测试映射

实施：

1. 为每个页面维护：
   - query
   - gateway
   - command
   - workflow
   - fallback
   - smoke
2. 将这份映射作为未来审计模板保留在 `docs/audit`

验收：

- 新人或后续代理无需重新人工梳理整套接线图

### P3-3. 包体积与无用代码治理

问题：

- `vite build` 仍有 chunk size warning
- Rust 有多处 unused warning

实施：

1. 对重型页面做按需分包
2. 清理未使用 repo/method/import
3. 将 warning 从“已知噪音”压缩到“真正异常”

验收：

- 构建 warning 明显下降
- 不影响当前功能回归

## 6. 推荐执行顺序

### 里程碑 M1：去假联通

包含：

- P0-1 运行模式显式化
- P0-2 Python 依赖补齐
- P0-3 host gateway 错误标准化
- P0-4 fallback 明示

通过条件：

- 前端不会再把 mock/fallback 误呈现为真成功

### 里程碑 M2：打通主链路

包含：

- P1-1 导入闭环
- P1-2 Knowledge QA
- P1-3 Graph Build
- P1-4 Podcast
- P1-5 Animation

通过条件：

- 至少一条文档 -> 卡片 -> 复习 -> 问答 的真实原生链路可走通

### 里程碑 M3：做成可回归系统

包含：

- P2-1 BYOK smoke
- P2-2 Tauri native smoke
- P2-3 可观测性
- P3 系列治理项

通过条件：

- 后续改动不会再次把项目拉回“页面能打开但真后端不通”的状态

## 7. 本轮之后建议立即执行的命令

1. 安装并校验 Python orchestration 缺失依赖
2. 在 Tauri 环境中手工完成一轮：
   - 启动应用
   - 查看 orchestration health
   - 导入文档
   - 解析/嵌入
   - 生成卡片
3. 使用可用的 OpenAI/Anthropic key 各跑一条最小 smoke
4. 将 M1 的“mock/fallback 显式化”优先落地，再做高级能力宣传或扩展
