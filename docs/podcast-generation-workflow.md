# 学笺播客工作流规范

> 文档版本：2.0.0  
> 最后更新：2026-04-23  
> 状态：Needs Reconciliation  
> 适用范围：XueJian 播客生成子系统  
> 基线：以 2026-04-23 仓库代码为准

## 1. 文档定位

本文档用于把播客子系统重新收敛为“适合当前项目继续开发”的正式规范。

本次修订的目标不是重新设计整套播客系统，而是：

- 承认旧文档与代码漂移
- 用当前代码真相重建规范基线
- 收敛首版范围，避免技术与产品口径继续分叉

### 1.1 优先级

- 本文档高于 README 中关于播客子系统的旧描述
- 本文档高于历史总规范中对播客系统的旧章节；[`docs/archive/spec.md`](./archive/spec.md) 仅作历史参考
- 本文档必须与 [`docs/frontend-system-extension.md`](./frontend-system-extension.md) 和 [`docs/byok-system.md`](./byok-system.md) 保持一致

### 1.2 本次修订结论

- 保留主架构：`Rust Host + Python orchestration + React + SQLite`
- 保留当前线性编排实现，不在本次修订里强制切换到 LangGraph
- 不再把“禁止 LangGraph”写死；LangGraph 是后续增强路径，不是禁区
- 首版 TTS 正式范围收敛为：`auto | openai | edge_tts`
- `ElevenLabs` 与 `Fish Audio` 保留为内部扩展适配器，不计入首版 UI、Done 标准和测试基线

## 2. 当前实现基线

以下能力在当前仓库中已经存在，不应再被描述为“待实现”：

- 前端已有 [`xuejian/src/features/podcast/PodcastPage.tsx`](../xuejian/src/features/podcast/PodcastPage.tsx)，并已接入后端查询与操作，不是纯 mock 页面
- 前端网关已有：
  - `start_podcast_workflow`
  - `get_podcast_episode`
  - `list_podcast_episodes`
  - `cancel_podcast_episode`
  - `delete_podcast_episode`
  - `retry_podcast_episode`
  - `review_podcast_script`
  - `get_podcast_audio_segments`
- Rust 已有播客命令与数据访问层：
  - [`xuejian/src-tauri/src/commands/podcast.rs`](../xuejian/src-tauri/src/commands/podcast.rs)
  - [`xuejian/src-tauri/src/db/podcast_repo.rs`](../xuejian/src-tauri/src/db/podcast_repo.rs)
- Python 已有播客编排与 schema：
  - [`xuejian/orchestration_service/workflows/podcast.py`](../xuejian/orchestration_service/workflows/podcast.py)
  - [`xuejian/orchestration_service/workflows/podcast_utils.py`](../xuejian/orchestration_service/workflows/podcast_utils.py)
  - [`xuejian/orchestration_service/schemas/podcast.py`](../xuejian/orchestration_service/schemas/podcast.py)
  - [`xuejian/orchestration_service/providers/tts_router.py`](../xuejian/orchestration_service/providers/tts_router.py)
- 长任务基础设施已存在并被多个工作流复用：
  - `workflow_runs`
  - `workflow_events`
  - `workflow_checkpoints`
- 播客迁移链已存在：
  - [`xuejian/src-tauri/src/migrations/V6__podcast_episodes.sql`](../xuejian/src-tauri/src/migrations/V6__podcast_episodes.sql)
  - [`xuejian/src-tauri/src/migrations/V16__podcast_workflow_v3.sql`](../xuejian/src-tauri/src/migrations/V16__podcast_workflow_v3.sql)

## 3. 适合当前项目的技术栈结论

### 3.1 保留项

- `SQLite + Rust Host` 继续作为唯一持久化事实源
- `Python orchestration service` 继续负责播客检索、提纲、脚本、评估和音频生成阶段推进
- `pydub + ffmpeg` 继续作为 v1 音频拼接方案
- `TanStack Query + 单页面播客路由` 继续作为前端查询与状态刷新方案

### 3.2 编排框架结论

- 当前实现保持 `LangChain` 线性编排
- 本文档不再声明“播客系统明确不引入 LangGraph”
- 若未来需要更强的人审恢复、可视化阶段管理、分支执行和 durable execution，可迁移到 LangGraph Functional API
- 该迁移不是本次修订的前置条件

### 3.3 TTS 技术栈结论

- `OpenAI TTS` 是首版主 Provider
- `Edge-TTS` 是首版免费 fallback
- `ElevenLabs` 与 `Fish Audio` 保留为扩展适配器，不进入首版公开承诺

## 4. 产品范围收敛

### 4.1 v1 正式范围

v1 只承诺以下能力：

- 选择一个或多个已准备好的文档
- 配置播客参数
- 进行知识检索
- 生成提纲
- 生成脚本
- 自动评估脚本
- 人工审阅脚本
- 生成音频
- 浏览历史列表
- 播放成品
- 取消、重试、删除

### 4.2 v1 非目标

以下能力不属于 v1 完成标准：

- ElevenLabs 真实集成通过
- Fish Audio 真实集成通过
- 实时边生成边播放
- 字幕同步
- 卡片联动生成播客
- 知识图谱联动生成播客

## 5. 架构与边界

### 5.1 系统结构

- `React`：负责表单提交、列表浏览、脚本审阅、播放器展示
- `Rust Host`：负责数据库、运行状态、文件系统、工作流事件、预算记录、BYOK 读取
- `Python Orchestration`：负责检索、提纲、脚本、评估、TTS、拼接

### 5.2 工作流运行时

播客系统复用统一工作流运行时，但保持独立业务表与状态对象：

- 运行时元数据：`workflow_runs / workflow_events / workflow_checkpoints`
- 播客业务数据：`podcast_episodes / podcast_audio_segments`

本文档不再描述为“播客不与卡片共享图运行时”，因为当前项目已经在共享统一长任务基础设施。

## 6. 前端规范

### 6.1 页面入口

播客页面正式入口继续为单路由 `PodcastPage`：

- 创建播客 Tab
- 我的播客 Tab

不再以一个新的 `PodcastListPage` 作为主入口设计。

### 6.2 状态刷新

- 播客列表：TanStack Query
- 单条详情：TanStack Query
- 生成中状态：轮询 episode 与 audio segments
- 播放器局部状态：前端本地状态或局部 store

### 6.3 设置页

设置页中的默认播客风格需要和运行时枚举统一，不再使用另一套命名。

## 7. 公共接口与类型

### 7.1 播客样式

统一以运行时枚举为准：

```ts
type PodcastStyle =
  | 'deep_dive'
  | 'lecture'
  | 'interview'
  | 'casual'
  | 'exam_prep'
```

历史设置页值：

- `knowledge_popularization` -> `lecture`
- `deep_analysis` -> `deep_dive`
- `friendly_conversation` -> `casual`
- `exam_coaching` -> `exam_prep`

### 7.2 语言

v1 公共语言范围收敛为：

```ts
type PodcastLanguage = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR'
```

文档不再把 `other` 作为公开承诺值。

### 7.3 TTS Provider

v1 公共 TTS 范围收敛为：

```ts
type TTSProviderId = 'auto' | 'openai' | 'edge_tts'
```

内部实现仍可保留扩展适配器，但它们不是 v1 公共契约的一部分。

### 7.4 关键接口

当前继续使用以下网关接口：

```ts
export interface StartPodcastInput {
  documentIds: string[]
  prompt?: string
  style: PodcastStyle
  language: PodcastLanguage
  durationTier: PodcastDurationTier
  ttsProvider: TTSProviderId
  audioFormat?: AudioFormat
}
```

```ts
startPodcastWorkflow(input)
getPodcastEpisode(episodeId)
listPodcastEpisodes()
cancelPodcastEpisode(episodeId)
deletePodcastEpisode(episodeId)
reviewPodcastScript(episodeId, action, editedScriptJson?)
retryPodcastEpisode(episodeId)
getPodcastAudioSegments(episodeId)
```

## 8. 编排流程

### 8.1 当前阶段定义

当前实现按以下阶段推进：

1. `retrieving`
2. `generating_outline`
3. `generating_script`
4. `evaluating`
5. `awaiting_review`
6. `generating_audio`
7. `stitching`
8. `ready | failed | cancelled`

### 8.2 审阅与恢复

- 脚本审阅是正式流程的一部分
- 运行状态、事件和 checkpoint 统一写入 Host 管理的数据结构
- 恢复、取消、删除的行为必须以统一 workflow runtime 与播客业务表保持一致

### 8.3 音频处理

- v1 继续使用 `pydub + ffmpeg`
- v1 不引入更复杂的音频引擎
- v1 明确不承诺实时流式播放

## 9. Prompt 与配置管理

- Prompt 模板继续保留在代码模块中版本化管理
- 设计文档不再内嵌大段 prompt 正文
- 文档只约束：
  - 模板归属位置
  - 模板版本化原则
  - 输入变量
  - 评估维度
  - 风格与角色边界

## 10. 测试与验收

### 10.1 文档一致性检查

- README 中引用的文档路径必须真实存在
- 本文档中出现的命令、类型、迁移、路径必须在仓库中真实存在
- 本文档不得再引用不存在的 `docs/spec.md`

### 10.2 类型一致性检查

以下内容必须在 TS、Rust DTO、Python workflow 与文档中保持一致：

- `PodcastStyle`
- `PodcastLanguage`
- `PodcastStatus`
- `TTSProviderId`

### 10.3 v1 功能验收

- 可从文档发起播客生成并产出可播放音频
- 脚本审阅支持接受、编辑、拒绝三条路径
- 取消、重试、删除与恢复逻辑与共享 workflow runtime 一致
- `OpenAI` 与 `Edge-TTS` 两条路径可验证

### 10.4 非目标验证

以下不作为 v1 必过项：

- ElevenLabs 集成测试
- Fish Audio 集成测试
- 实时流式播放
- 字幕同步
- 卡片联动

## 11. 实施顺序

### Phase 1

- 文档对齐
- README 引用修复
- 公共类型收敛
- 设置页默认值和播客枚举统一
- v1 验收口径收缩

### Phase 2

- 增强 `PodcastPage`
- 完成创建播客 / 我的播客双 Tab 体验
- 完善进度显示、历史浏览、审阅体验

### Phase 3

- 评估是否引入 LangGraph 增强长任务能力
- 评估是否开放 ElevenLabs / Fish Audio 为正式扩展能力

## 12. 后续扩展

后续版本可以考虑：

- ElevenLabs 与 Fish Audio 正式接入
- 字幕同步
- 卡片联动
- 知识图谱联动
- 流式边生成边播放

但这些内容必须以独立增量方案推进，不得回写为当前 v1 的既定承诺。
