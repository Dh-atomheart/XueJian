# 前后端联通全面测试报??
日期??026-04-25  
执行人：Codex  
仓库：`E:\XueJianProject`  
前端应用：`xuejian/`  
审计范围：Web 前端、Tauri IPC、Rust commands、host HTTP gateway、Python orchestration service、真??provider 接入可行??
## 1. 执行摘要

本轮审计确认??
- 前端 Web 层自动化回归是绿色的：`build`、`Vitest`、`Playwright Web`、`cargo check`、`cargo test health_roundtrip_succeeds` 均通过??- 但这不等于“前端已完全与后端联通”??- 浏览器环境下，`src/services/gateway/index.ts` 会在??Tauri 环境自动回退??`mockData`，因??Web 端测试主要证明页面和 mock 契约可用，不能证明真实后端链路已打通??- Python orchestration service 可以独立启动并通过 `/health` ??`/handshake`，但在未连接 Rust host HTTP gateway 时，真实 workflow endpoint 会直接返??`503 host_gateway_unavailable`??- 当前 Python 运行环境缺失多项关键依赖，直接阻断知识问答、文档解析、嵌入、播客、导出、TTS 等高阶能力的真实闭环??- Tauri/Rust 层已经为大多数页面提供了真实 command 承接；其中一部分能力??fallback，因??UI 可能“看起来能跑”，但实际上走的是降级逻辑，而不是真实模型链路??
综合评级：`Amber`

原因??
- 核心基础层可编译、可测试、可启动??- 真正的“原??+ Python + provider”全链路仍未完成闭环验证??- 多个高级页面存在“mock 可用”或“fallback 可用”掩盖真断链的情况??
## 2. 测试方法与证??
### 2.1 已执行命??
1. `npm.cmd run build`
2. `npm.cmd test -- --run`
3. `npm.cmd run test:e2e`
4. `cargo check`
5. `cargo test health_roundtrip_succeeds -- --nocapture`
6. `python --version`
7. Python 依赖导入检查脚??8. `python orchestration_service/main.py --port 8787`
9. 独立启动 orchestration service 后访问：
   - `GET /health`
   - `GET /handshake`
   - `POST /workflows/knowledge-qa`

### 2.2 关键结果

#### 自动化层

- `npm run build`：通过
- `npm test -- --run`：`42/42` 测试文件通过，`240/240` 测试通过
- `npm run test:e2e`：`13/13` 通过
- `cargo check`：通过
- `cargo test health_roundtrip_succeeds`：通过

#### Python/orchestration ??
- `python --version`：`Python 3.11.5`
- `python orchestration_service/main.py --port 8787`??  - 服务可启??  - 日志明确提示：`No --host-port provided; workflow endpoints will return 503`
- `GET /health`：返??`healthy`
- `GET /handshake`：返回协议版??`xuejian-orchestration/v1` 及能力列??- `POST /workflows/knowledge-qa`：返??`{"error":"host_gateway_unavailable"}`，HTTP `503`

#### Python 依赖导入检??
可导入：

- `langchain`
- `langchain_openai`
- `langchain_google_genai`
- `google.genai`
- `openai`
- `pydantic`
- `httpx`

缺失??
- `langchain_anthropic`
- `litellm`
- `pydantic_ai`
- `docling`
- `fitz` / `PyMuPDF`
- `genanki`
- `edge_tts`
- `pydub`
- `elevenlabs`
- `fish_audio_sdk`

## 3. 关键架构事实

### 3.1 浏览器环境默认不连真后端

`xuejian/src/services/gateway/index.ts` 中：

- ??Tauri 环境下，`invoke(...)` 不调用原生命??- 直接返回 `getMockGatewayResponse(...)`

这意味着??
- Playwright Web 通过，只能证明页面与 mock 契约一??- 不能据此得出“已与真??Rust/Tauri/Python 后端联通”的结论

### 3.2 Tauri 是真实后端入??
真实链路为：

前端页面  
-> React Query hooks  
-> `services/gateway/*`  
-> Tauri `invoke(...)`  
-> Rust `commands/*`  
-> SQLite / Secret Store / Host HTTP Gateway / Python orchestration service  
-> 可选的外部 provider

### 3.3 Python service 自身并不等于完整后端

Python 侧即使启动成功，也仍依赖??
- Rust host gateway 端口 `--host-port`
- 对应 workflow 需要的 Python ??- provider 凭据与模型配??
否则 workflow endpoint 会失败或??Rust ??fallback 掩盖??
## 4. 页面与关键组件联通矩??
说明??
- `Web`：浏览器环境/Playwright 验证结果
- `Native`：Tauri command ??Rust 后端承接情况
- `Python`：是否依??orchestration service
- `Provider`：是否依赖真??AI/TTS/embedding provider
- `结论`??  - `绿`：真实后端主要在 Rust 本地，链路清晰，风险??  - `黄`：存在真实接线但本轮未完成原生实测，或存??fallback/mask 风险
  - `红`：真联通明确受阻或高度依赖缺失环境

| 页面/组件 | 前端数据入口 | Rust/Tauri command 承接 | Python/Provider 依赖 | 当前结论 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Home | `useDocumentsQuery` `useDailyStatsQuery` `useStudyStatsQuery` `usePointsSummaryQuery` `useReviewHeatmapQuery` `useApiConfigsQuery` | `list_documents` `get_daily_stats` `get_study_stats` `get_points_summary` `get_review_heatmap` `list_api_configs` | ??| ??| Web 已通过；真实命令已存在，主要是本地 DB/配置查询，但本轮未在 GUI 中逐页点验??|
| Library | `useDocumentsQuery` `useDocumentImport` | `list_documents` `pick_and_import_document` `run_document_parse_workflow` `run_document_embedding_workflow` `start_card_generation_workflow` | 解析/嵌入/生成依赖 Python，生成可能进一步依??provider | ??| 列表查询本地可行，但导入后的解析、嵌入、生成链路未完成真闭环；Python 缺包会直接影响??|
| Reader | `useDocumentQuery` `useDocumentAnchorsQuery` `useCardsQuery` `useHighlightsQuery` `read_document_binary` | `get_document` `list_document_anchors` `list_cards` `list_highlights` `read_document_binary` | 无硬??Python 依赖 | ??| 读取页本身主要依赖本??DB/文件；若上游导入解析没打通，真实数据样本会不足??|
| Card Studio | `useDocumentsQuery` `useCardsQuery` `useRecentWorkflowRunsQuery` `useWorkflowEventsQuery` `useCardCandidatesQuery` | `list_documents` `list_cards` `list_workflow_runs` `list_workflow_events` `list_card_candidates` `create_card` `update_card` `delete_card` `start_card_generation_workflow` `finalize_card_generation_workflow` | 生成依赖 Python；失败时 Rust ??fallback 到本地规则生??| ??| CRUD ??run/event/candidate 通路存在；但“能生成”不等于模型链路通，fallback 会掩??orchestration 故障??|
| Review | `useDueCardsQuery` `useDailyStatsQuery` `usePointsSummaryQuery` `useSubmitReviewMutation` | `list_due_cards` `update_card_review` `create_review_log` `record_points` | ??| ??| 全部??Rust/DB 承接，自动化通过，真实后端依赖最清晰??|
| Knowledge QA | `useKnowledgeSearchQuery` `useStartKnowledgeQaMutation` `useOrchestrationServiceHealthQuery` | `search_knowledge` `start_knowledge_qa_workflow` `get_orchestration_service_health` `get_workflow_run` `list_workflow_events` | 强依??Python；通常依赖 embedding/provider | ??| `search_knowledge` 可由本地检索承接，但问??workflow ??fallback；独立测试已证实??host gateway 时返??503??|
| Podcast | `usePodcastEpisodesQuery` `usePodcastEpisodeQuery` `usePodcastAudioSegmentsQuery` `useStartPodcastMutation` | `list_podcast_episodes` `get_podcast_episode` `get_podcast_audio_segments` `start_podcast_workflow` `review_podcast_script` `retry_podcast_episode` | 强依??Python；音频阶段依??TTS/provider/音频??| ??| 列表与状态管理命令完备，但真实生成依赖缺包与 provider；Rust 存在 fallback 脚本结果，不能视为已打通??|
| Settings | `useApiConfigsQuery` `useModelProfilesQuery` `useWorkflowAssignmentsQuery` `useAppSettingsQuery` | `get_settings` `update_settings` `list_api_configs` `create_api_config` `test_api_connection` `fetch_provider_models` `list_workflow_assignments` ??| provider 验证依赖真实密钥与网??| ??| 设置页后端面很完整，但本轮未持有可用 key，因此“连接测??模型发现”未做真验证??|
| Profile | `useDocumentsQuery` `useStudyStatsQuery` `useMasteryBreakdownQuery` `useReviewHeatmapQuery` `usePointsSummaryQuery` `usePointsLedgerQuery` | `list_documents` `get_study_stats` `get_mastery_breakdown` `get_review_heatmap` `get_points_summary` `list_points_ledger` | ??| ??| 本地统计/账本类接口完整，依赖低??|
| `ImportDocumentButton` | `useDocumentImport` | ??Library 导入链路 | 依赖 Python/embedding/provider | ??| UI 已接线，但真实导入闭环仍??Python ??host gateway 阻塞??|
| `StickyNotesPanel` | `useDocumentQuery` `useCardsQuery` `useHighlightsQuery` `useUpdateCardMutation` `useDeleteCardMutation` | `get_document` `list_cards` `list_highlights` `update_card` `delete_card` | 无硬??Python 依赖 | ??| 本地命令齐全，但依赖前置文档/卡片真实存在??|
| `CardEditorModal` | ??Card Studio / StickyNotes 驱动 | `create_card` `update_card` | ??| ??| 真实后端主要??Rust DB??|
| `AnimationPreviewModal` | `useCardAnimationQuery` `useStartCardAnimationMutation` `useDeleteCardAnimationMutation` | `get_card_animation` `start_card_animation_workflow` `delete_card_animation` | 依赖 Python；`quick_preview` ??fallback，`video_render` 失败时显式报??| ??| “快速预览”可在失败时生成本地脚本；“视频渲染”未证实可用??|
| `PodcastPlayerModal` | `usePodcastEpisodeQuery` `usePodcastAudioSegmentsQuery` | `get_podcast_episode` `get_podcast_audio_segments` | 依赖上游播客生成结果 | ??| 播放层有命令承接，但真实音频资源生成未闭环??|

## 5. 高风险发??
### F1. Web 自动化通过，但大面积走 mock，不足以证明真实后端联??
严重级别：`P0`

证据??
- `Vitest` stderr 多次出现：`[Gateway] Tauri not available, command "..." will return mock data`
- `src/services/gateway/index.ts` ??Tauri 环境直接??`mockData`

影响??
- 目前任何“页面能打开、测试能通过”的结论，都必须先排??mock??- 如果不区分环境，极易误判项目已经联通??
### F2. Python orchestration service 缺失关键依赖

严重级别：`P0`

缺失项：

- `langchain_anthropic`
- `litellm`
- `pydantic_ai`
- `docling`
- `PyMuPDF`
- `genanki`
- `edge_tts`
- `pydub`
- `elevenlabs`
- `fish_audio_sdk`

影响??
### F3. Python service 单独启动??workflow endpoint 固定 503

严重级别：`P0`

证据??
- `/health` 正常
- `/handshake` 正常
- `/workflows/knowledge-qa` 返回 `503 host_gateway_unavailable`

影响??
- 说明 orchestration service 不是独立闭环服务，必须依??Rust host gateway??- 原生启动链路??host gateway 未成功拉起，所??workflow 都会失败??
### F4. 多个高级页面存在 fallback，容易掩盖真链路问题

严重级别：`P1`

已确认存??fallback 的能力：

- 卡片生成：Python 失败时回退到本??rule-based generation
- 播客生成：Python 失败时回退??fallback script/result
- 动画生成：`quick_preview` 失败时回退到本地脚??
影响??
- 页面“有结果”不代表真实模型链路可用??- 需要在 UI 和日志中明确标识当前是否??fallback 结果??
### F5. Knowledge QA 没有等价 fallback，是真阻塞能??
严重级别：`P1`

证据??
- Rust `knowledge.rs` 直接依赖 orchestration health ??`/workflows/knowledge-qa`
- 本轮独立 workflow 请求已明确返??`503`

影响??
- 知识问答是最接近“前端看起来有入口，但真实能力并未证实”的页面??
### F6. Settings/BYOK 页面后端承接完整，但 provider 真连接未验证

严重级别：`P1`

证据??
- Rust commands 已提??`test_api_connection`、`fetch_provider_models`、workflow assignment ??- 但本轮没有可??key，无法完??OpenAI/Anthropic ??smoke

影响??
- 不能宣称“BYOK 已打通??- 只能宣称“设置页后端面完整，待真??provider 验证??
## 6. 分层结论

### 6.1 已证实为绿色的层

- 前端构建
- Web UI 自动化回??- Rust 编译
- Rust 内部 orchestration health roundtrip 测试
- 本地 DB/统计/复习/配置类命令的代码承接??
### 6.2 已证实存在真实阻塞的??
- Python 依赖安装完整??- Python workflow 独立可执行??- host gateway ??Python workflow 联动完整??- Knowledge QA 真链??- Podcast/TTS 真链??- 导出能力??`genanki` / `PyMuPDF` 的真实依??
### 6.3 目前最容易被误判的??
- 卡片生成
- 播客生成
- 动画快速预??
共同问题??
- 页面可能返回“看起来合理的结果??- 但真实模??真实 Python 工作流并未成功执??
## 7. 建议结论

当前项目不应表述为“前端已经完全与后端联通”??
更准确的表述应为??
- 基础前端、Rust/Tauri 本地命令层已经基本接通并可回??- 浏览器态测试主要验证了 mock 契约

## 8. 附录：与本轮结论直接相关的代码位??
- Web/mock 分流：`xuejian/src/services/gateway/index.ts`
- 页面入口：`xuejian/src/App.tsx`
- 页面查询层：`xuejian/src/queries/*.ts`
- Tauri command 注册：`xuejian/src-tauri/src/lib.rs`
- orchestration 启停：`xuejian/src-tauri/src/tasks/orchestration_service.rs`
- Python server：`xuejian/orchestration_service/server.py`
- 卡片生成 fallback：`xuejian/src-tauri/src/commands/cards.rs`
- 播客 fallback：`xuejian/src-tauri/src/commands/podcast.rs`
- 动画 fallback：`xuejian/src-tauri/src/commands/animation.rs`
- 文档解析/嵌入强依??orchestration：`xuejian/src-tauri/src/commands/documents.rs`
- Knowledge QA 强依??orchestration：`xuejian/src-tauri/src/commands/knowledge.rs`
