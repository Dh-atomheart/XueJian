# 学笺播客生成工作流系统设计文档

> **文档版本**：1.0.0  
> **最后更新**：2026-04-21  
> **状态**：Approved For Implementation  
> **适用范围**：XueJian 播客生成子系统——从用户输入到音频输出的完整工作流管线  
> **文档定位**：后续该子系统开发的单一实现依据  
> **实现阶段**：V3（文档先行，实现跟随 V3 节奏）

---

## 0. 文档优先级与约束

本文件是 XueJian 中"播客生成"子系统的主设计文档。自本文件生效起，后续编码、测试、迁移、UI 调整、工作流改造，都必须以本文件为准。

对于以下已有文档中的相关段落，本文件拥有更高优先级：

- `docs/spec.md` 中关于"播客生成"的 V3 简述（§2.4.2）
- `docs/spec.md` 中 `PodcastScript` / `AudioSegment` / `PodcastEpisode` 的旧类型定义
- `docs/references/ai-orchestration.md` 中关于 `content_pipeline` 的通用描述
- `README.md` 中关于"LangChain 是当前唯一正式工作流框架"的表述——本子系统沿用此决策

本文件不替代以下文档的角色，但会约束这些文档在本子系统中的用法：

- `docs/agent-driven-document-to-card-workflow.md`：卡片工作流的设计，播客不与其共享图运行时
- `docs/card-system-v2.md`：卡片数据模型，播客不依赖卡片作为输入源
- `docs/spec.md`：项目总体阶段目标与验收边界

在本文件没有完成对应实现前，不得以"局部功能可用"为理由宣布该子系统开发完成。

---

## 1. 目标与问题定义

### 1.1 要解决的问题

XueJian 当前已经具备：

- 本地文档导入与 PDF 解析（Docling + PyMuPDF）
- `document_chunks` / `document_anchors` 持久化
- SQLite FTS5 + sqlite-vec 混合检索基础设施
- Python sidecar 编排服务（LangChain 线性工作流）
- 播客工作流雏形（`workflows/podcast.py`——仅生成简单 5 段对话 JSON，无音频、无配置、无 RAG）
- 前端 `PodcastPage.tsx`——仅展示 mock 数据，未接入真实工作流
- `PodcastEpisode` / `PodcastScript` TypeScript 类型定义——缺少风格/语言/TTS 配置字段

但当前播客能力存在以下结构性不足：

1. **无知识检索**：播客脚本生成不经过 RAG，直接把文档标题和截断上下文喂给 LLM，输出质量低。
2. **无用户配置**：用户无法选择播客风格、语言、时长、TTS 声音。
3. **无音频生成**：只产出 JSON 脚本，不调用 TTS，不产出音频文件。
4. **无质量评估**：脚本无自动评估，也无人工审阅入口。
5. **无长任务管理**：不支持分段、断点续传、预算控制、取消。
6. **前端完全 mock**：`PodcastPage` 用 `setTimeout` 模拟生成，未接入任何真实 IPC。

### 1.2 本设计的目标

本设计要构建一套完整、优质、高效、用户友好的播客生成工作流系统，满足以下目标：

1. 用户选择文档 + 输入提示词 + 选择风格/语言/时长后，一键生成播客音频。
2. 基于 FTS5/sqlite-vec 混合检索获取相关知识，提升脚本质量。
3. 采用 6 阶段 LangChain 线性管线：知识检索 → 提纲生成 → 对话脚本生成 → 脚本评估与修正 → TTS 音频生成 → 音频拼接与后处理。
4. 支持自动评估 + 人工审阅，确保脚本质量。
5. 支持 3 层 TTS Provider（OpenAI / Edge-TTS / ElevenLabs+Fish Audio），按可用性和用户偏好自动选择。
6. 支持长播客分段生成（15-20 min/段），断点续传，预算中止，取消丢弃。
7. 独立播客库页面 + 内置音频播放器，支持进度/倍速/segment 跳转。
8. 保持 Rust Host 为 source of truth，Python 只负责编排，不拥有主存储和明文密钥。
9. 后续代码实现必须严格对应本文件中的结构、字段、节点、测试与验收规则。

### 1.3 结果形态

用户从选择文档到拿到可播放播客的主路径应为：

1. 用户在播客页面选择一个或多个文档
2. 输入提示词（可选，描述关注点或特殊要求）
3. 选择播客风格（深度探讨 / 知识讲解 / 访谈播客 / 轻松闲聊 / 考点速记）
4. 选择生成语言（中文 / 英文 / 日文 / 韩文 / 其他）
5. 选择时长档位（短 2-5min / 中 5-15min / 长 15-30min / 超长 30min+）
6. 选择 TTS Provider（自动 / OpenAI / Edge-TTS / ElevenLabs / Fish Audio）
7. 点击生成
8. 系统执行 6 阶段管线
9. 脚本生成后进入人工审阅（可选跳过）
10. TTS 生成音频，拼接输出
11. 播客出现在播客库页面，可播放、可删除、可重新生成

---

## 2. 设计原则

### 2.1 单一事实源

- SQLite 是唯一事实源。
- `app.db` 同时承载播客 episode、脚本、音频元数据、TTS 配置、工作流状态。
- Python 不得直接持有数据库写权限；所有持久化通过 Rust Host 提供的受控接口完成。

### 2.2 宿主拥有边界

- Rust Host 负责密钥、数据库、文件系统、预算、工具边界、日志脱敏。
- Python Orchestration 负责管线执行、模型调用、TTS 调用、结构化输出、重试与 checkpoint 协调。
- React 只负责提交请求、消费事件、呈现审阅 UI 和播放器，不直接承担编排逻辑。

### 2.3 线性管线优先

- 播客生成采用 LangChain 线性管线，不引入 LangGraph。
- 管线各阶段顺序执行，每个阶段完成后写入 checkpoint。
- 不需要 Supervisor → Subagent 的图结构，因为播客生成路径是确定性的。

### 2.4 默认可恢复

- 每个 segment 完成后写入 checkpoint。
- 中断后从最近完成的 segment 恢复，不重新生成已完成部分。
- 取消后丢弃所有 segment（包括已完成的），不保留中间产物。

### 2.5 BYOK 兼容

- 所有外部 API 调用使用用户提供的 Key。
- TTS Provider 按可用性自动降级：用户配置的优先 → 免费 Edge-TTS → 失败。
- 不硬编码任何 API Key。

### 2.6 仅文档源

- 播客输入源仅为文档（一个或多个），不依赖卡片集合。
- 知识检索复用现有 `document_chunks` + FTS5/sqlite-vec 基础设施。

---

## 3. 系统架构总览

```
┌─────────────────────────── Tauri 2 窗口 ───────────────────────────┐
│                                                                      │
│  React 19 前端                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ PodcastList  │  │ PodcastPlayer│  │  PodcastGenerateWizard   │  │
│  │    Page      │  │   Component  │  │     (Step Form)          │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘  │
│         │                 │                       │                  │
│  ┌──────▼─────────────────▼───────────────────────▼──────────────┐  │
│  │        React Query (queries/podcast.ts)                        │  │
│  └──────────────────────────┬─────────────────────────────────── ┘  │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │        podcastGateway  (services/gateway/podcast.ts)         │    │
│  │   invokeWithSchema(command, ZodSchema, payload)              │    │
│  └──────────────────────────┬────────────────────────────────── ┘   │
│                             │ Tauri IPC (JSON)                       │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │       Rust Commands  (src-tauri/src/commands/podcast.rs)      │    │
│  │   PodcastEpisodeDto ←──→ PodcastEpisode (From impl)          │    │
│  └──────────────────────────┬────────────────────────────────── ┘    │
│                             │                                        │
│  ┌──────────────────────────▼──────────────────────────────────┐    │
│  │     PodcastRepository  (src-tauri/src/db/podcast_repo.rs)     │    │
│  │   rusqlite + refinery migrations                              │    │
│  └──────────────────────────┬────────────────────────────────── ┘    │
│                             │                                        │
│                       SQLite (app.db)                                │
└─────────────────────────────────────────────────────────────────────┘

                    │ HTTP (localhost)
                    ▼

┌─────────────────────────────────────────────────────────────────────┐
│                Python Orchestration Service                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Podcast Pipeline                             │  │
│  │                                                                │  │
│  │  Stage 1: Knowledge Retrieval (FTS5 / sqlite-vec hybrid)      │  │
│  │      │                                                         │  │
│  │  Stage 2: Outline Generation (LLM structured output)          │  │
│  │      │                                                         │  │
│  │  Stage 3: Script Generation (per-segment LLM calls)           │  │
│  │      │                                                         │  │
│  │  Stage 4: Script Evaluation & Revision (LLM self-eval)       │  │
│  │      │                                                         │  │
│  │  Stage 5: TTS Audio Generation (per-segment TTS calls)        │  │
│  │      │                                                         │  │
│  │  Stage 6: Audio Stitching & Post-processing (pydub/ffmpeg)    │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ TTS: OpenAI  │  │ TTS: Edge    │  │ TTS: 11Labs  │              │
│  │   Provider   │  │   Provider   │  │  + Fish Audio │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  HostGatewayClient  (clients/host_gateway.py)                  │  │
│  │  → search_chunks / search_hybrid / get_default_config_with_key │  │
│  │  → save_podcast_episode / update_podcast_status / etc.         │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. 用户交互设计

### 4.1 播客生成向导（PodcastGenerateWizard）

用户通过分步表单提交播客生成请求。表单分为以下步骤：

#### Step 1: 选择源文档

- 展示已导入且状态为 `ready` 的文档列表
- 支持多选（1-5 个文档）
- 每个文档显示：名称、页数、导入时间
- 至少选择 1 个文档才能继续

#### Step 2: 配置播客参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `prompt` | string | 否 | `""` | 用户提示词，描述关注点或特殊要求 |
| `style` | enum | 是 | `"interview"` | 播客风格 |
| `language` | enum | 是 | `"zh-CN"` | 生成语言（脚本语言 + TTS 语言一致） |
| `durationTier` | enum | 是 | `"medium"` | 时长档位 |
| `ttsProvider` | enum | 是 | `"auto"` | TTS Provider 选择 |

#### Step 3: 确认与生成

- 展示所有配置的摘要
- 估算 token 消耗和费用（基于当前模型定价）
- 点击"开始生成"提交请求

### 4.2 播客风格预设

| 风格 ID | 名称 | 说话人数 | 描述 | 典型时长映射 |
|---------|------|----------|------|-------------|
| `deep_dive` | 深度探讨 | 2 | 两人深入分析一个概念，追问机制与原理 | 偏长 |
| `lecture` | 知识讲解 | 1 | 专家单人讲解，系统梳理知识框架 | 偏中 |
| `interview` | 访谈播客 | 2 | 主持人提问 + 嘉宾回答，问答驱动 | 灵活 |
| `casual` | 轻松闲聊 | 2 | 朋友间讨论，语气轻松自然 | 偏短 |
| `exam_prep` | 考点速记 | 1 | 精简要点播报，高效覆盖核心考点 | 偏短 |

每种风格对应一组预设角色模板：

```typescript
interface PresetRole {
  speakerId: string        // "host" | "expert" | "narrator"
  name: string             // 风格相关名称，如 "主持人小林" / "张教授"
  personality: string      // 性格描述，用于 prompt
  defaultVoiceHint: string // 推荐声音类型，如 "warm_female" / "authoritative_male"
}
```

**预设角色定义：**

| 风格 | 角色 1 | 角色 2 |
|------|--------|--------|
| `deep_dive` | 分析师（理性追问） | 专家（深度解释） |
| `lecture` | 讲师（系统讲解） | — |
| `interview` | 主持人（引导提问） | 嘉宾（专业回答） |
| `casual` | 朋友A（好奇提问） | 朋友B（分享见解） |
| `exam_prep` | 播报员（精炼播报） | — |

### 4.3 时长档位

| 档位 ID | 名称 | 目标时长 | 预估 segment 数 | 超长分段 |
|---------|------|----------|----------------|----------|
| `short` | 短 | 2-5 min | 1 | 否 |
| `medium` | 中 | 5-15 min | 1-2 | 否 |
| `long` | 长 | 15-30 min | 2-3 | 否 |
| `ultra_long` | 超长 | 30 min+ | 每 15-20 min 一段 | 是 |

### 4.4 语言选项

| 语言 ID | 名称 | TTS 可用性 |
|---------|------|-----------|
| `zh-CN` | 简体中文 | OpenAI ✅ / Edge-TTS ✅ / ElevenLabs ✅ / Fish Audio ✅ |
| `en-US` | 英语 | OpenAI ✅ / Edge-TTS ✅ / ElevenLabs ✅ / Fish Audio ✅ |
| `ja-JP` | 日语 | OpenAI ✅ / Edge-TTS ✅ / ElevenLabs ✅ / Fish Audio ✅ |
| `ko-KR` | 韩语 | OpenAI ✅ / Edge-TTS ✅ / ElevenLabs ✅ / Fish Audio ✅ |
| `other` | 其他 | 视 TTS Provider 支持情况 |

**关键规则：脚本语言跟随 TTS 语言。** 用户选择 `en-US` 时，LLM 用英文撰写脚本，TTS 用英文声音合成。中文文档生成英文播客 = 英文脚本 + 英文 TTS。

### 4.5 TTS Provider 选择

| 选项 | 说明 |
|------|------|
| `auto` | 自动选择：用户已配置的 Provider → Edge-TTS（免费兜底） |
| `openai` | 使用 OpenAI TTS API（tts-1 / tts-1-hd） |
| `edge_tts` | 使用 Microsoft Edge TTS（免费，无需 Key） |
| `elevenlabs` | 使用 ElevenLabs API（需额外 Key） |
| `fish_audio` | 使用 Fish Audio API（需额外 Key） |

### 4.6 人工审阅

脚本生成完成后，进入人工审阅环节：

- 展示完整对话脚本（按 segment 分段展示）
- 展示自动评估分数和问题列表
- 用户可以：**接受**（继续 TTS）、**编辑**（修改脚本文本后继续）、**拒绝**（终止生成）
- 用户可在设置中开启"跳过审阅"，直接进入 TTS 阶段
- 审阅超时（默认 30 分钟无操作）自动接受

---

## 5. 工作流管线设计

### 5.1 管线总览

```
用户请求
  │
  ▼
┌─────────────────────┐
│ Stage 1: 知识检索    │  FTS5 / sqlite-vec hybrid RRF
│   (Knowledge         │  输入: documentIds + prompt
│    Retrieval)        │  输出: retrieved_chunks[]
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stage 2: 提纲生成    │  LLM structured output
│   (Outline           │  输入: chunks + style + duration + prompt
│    Generation)       │  输出: PodcastOutline
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stage 3: 脚本生成    │  Per-segment LLM calls
│   (Script            │  输入: outline + chunks + style + roles
│    Generation)       │  输出: PodcastScript (segments filled)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stage 4: 脚本评估    │  LLM self-evaluation + revision
│   (Evaluation &      │  输入: full script + original chunks
│    Revision)         │  输出: evaluated script + score + revised script (if needed)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 人工审阅 (Human      │  用户: 接受 / 编辑 / 拒绝
│  Review Gate)       │  可选跳过
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stage 5: TTS 音频生成│  Per-segment TTS calls
│   (Audio             │  输入: script segments + voice config
│    Generation)       │  输出: audio_segment_files[]
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stage 6: 音频拼接    │  pydub + ffmpeg
│   (Stitching &       │  输入: audio_segment_files[]
│    Post-processing)  │  输出: final_audio_file (MP3/WAV)
└─────────┬───────────┘
          │
          ▼
      播客就绪
```

### 5.2 Stage 1: 知识检索

**目标**：从选定文档中检索与用户提示词相关的知识片段。

**流程**：

1. 如果有活跃的 embedding profile，使用 `search_hybrid`（FTS5 + sqlite-vec RRF 混合检索）
2. 否则降级为 `search_chunks`（纯 FTS5）
3. 检索 top-K chunks（K 由时长档位决定）

| 时长档位 | top-K |
|----------|-------|
| `short` | 6 |
| `medium` | 12 |
| `long` | 20 |
| `ultra_long` | 30 |

4. 将 chunks 按文档和 section 聚合，构建上下文

**输出**：

```python
retrieved_chunks: list[dict]  # 每个 chunk 含 id, documentId, content, pageStart, pageEnd, sectionId
retrieval_mode: str           # "hybrid_rrf" | "fts5"
```

**失败处理**：

- 无检索结果：返回 `no_relevant_content` 状态，提示用户更换文档或提示词
- 检索服务异常：降级为 FTS5，再失败则终止管线

### 5.3 Stage 2: 提纲生成

**目标**：基于检索到的知识和用户配置，生成结构化播客提纲。

**LLM 调用**：1 次

**时长到 segment 数的映射**：

| 时长档位 | segment 数 | 每 segment 目标时长 |
|----------|-----------|-------------------|
| `short` | 2-4 | 60-90s |
| `medium` | 4-8 | 90-180s |
| `long` | 8-15 | 120-180s |
| `ultra_long` | 15-30 | 120-180s |

**超长播客的特殊处理**：

- `ultra_long` 档位先按 15-20 min 划分为 2-N 个 `MacroSegment`
- 每个 `MacroSegment` 独立执行 Stage 2-6
- 最终所有 `MacroSegment` 的音频拼接

**输出**：

```python
outline: dict  # 含 title, description, totalTargetDurationMs, segments[]
```

### 5.4 Stage 3: 脚本生成

**目标**：按提纲逐 segment 生成对话脚本。

**LLM 调用**：N 次（N = segment 数量）

**逐段生成策略**：

1. 遍历 outline.segments
2. 每个 segment 构造 prompt，包含：
   - 全局上下文（提纲 + 风格 + 角色设定 + 语言）
   - 当前 segment 的主题和要点
   - 相关 chunks（仅与当前 segment 主题相关的 chunks）
   - 前 1 个 segment 的最后 2 轮对话（保持连贯性）
3. LLM 生成当前 segment 的对话
4. 解析为 `DialogueSegment[]`

**Checkpoint 写入**：每个 segment 完成后写入 checkpoint，记录已完成的 segment 索引。

**输出**：

```python
script: dict  # 含 title, description, speakers[], outline[], segments[]
```

### 5.5 Stage 4: 脚本评估与修正

**目标**：自动评估脚本质量，不合格则修正。

**LLM 调用**：1-2 次（1 次评估 + 最多 1 次修正）

**评估维度**：

| 维度 | 权重 | 评分范围 | 说明 |
|------|------|----------|------|
| `coherence` | 0.3 | 1-10 | 段落间逻辑连贯性 |
| `accuracy` | 0.3 | 1-10 | 知识准确性（对比原始 chunks） |
| `style_consistency` | 0.2 | 1-10 | 风格一致性 |
| `naturalness` | 0.2 | 1-10 | 对话自然度 |

**评估公式**：

```
Score = coherence × 0.3 + accuracy × 0.3 + style_consistency × 0.2 + naturalness × 0.2
```

**通过阈值**：Score ≥ 7.0

**修正策略**：

- Score < 7.0：将评估反馈 + 原始脚本 + 原始 chunks 一起喂给 LLM，要求修正
- 修正后重新评估，如果仍 < 7.0，以修正后版本继续（不再迭代）
- 最多修正 1 次，避免无限循环

**输出**：

```python
evaluation: dict  # 含各维度分数、overall_score、issues、suggestions
final_script: dict  # 评估通过或修正后的脚本
```

### 5.6 人工审阅门

**目标**：用户审阅脚本，决定是否继续。

**交互流程**：

1. 前端展示完整脚本（按 segment 折叠/展开）
2. 展示自动评估分数和问题列表
3. 用户操作：
   - **接受**：继续进入 Stage 5
   - **编辑**：用户修改脚本文本，提交修改后版本，继续进入 Stage 5
   - **拒绝**：终止管线，episode 状态设为 `cancelled`

**跳过审阅条件**：

- 用户在设置中开启了"跳过播客审阅"
- 审阅超时（30 分钟无操作）自动接受

### 5.7 Stage 5: TTS 音频生成

**目标**：按 segment 逐段调用 TTS 生成音频。

**TTS 调用**：N 次（N = 对话段落数，每个 `DialogueSegment` 一次 TTS 调用）

**流程**：

1. 解析脚本中的所有 `DialogueSegment`
2. 根据 speaker 匹配 voice ID（基于风格预设 + 语言 + TTS Provider）
3. 逐段调用 TTS API，生成音频片段
4. 每个 segment 音频保存为临时文件

**Checkpoint 写入**：每 5 个对话段落完成后写入 checkpoint。

**TTS Provider 自动降级逻辑**：

```
用户选择 auto 时:
  1. 检查用户是否配置了 OpenAI Key → 使用 OpenAI TTS
  2. 检查用户是否配置了 ElevenLabs/Fish Audio Key → 使用对应 TTS
  3. 降级为 Edge-TTS（免费，无需 Key）
  4. Edge-TTS 也失败 → 管线失败

用户选择特定 Provider 时:
  1. 尝试使用指定 Provider
  2. 失败后降级为 Edge-TTS
  3. Edge-TTS 也失败 → 管线失败
```

**输出**：

```python
audio_segments: list[str]  # 音频片段文件路径列表
```

### 5.8 Stage 6: 音频拼接与后处理

**目标**：将所有音频片段拼接为完整播客音频。

**工具链**：pydub + ffmpeg

**流程**：

1. 读取所有音频片段文件
2. 在相邻片段之间添加 300ms 交叉淡入淡出（crossfade）
3. 在不同 speaker 切换时添加 500ms 静音间隔
4. 音量归一化（normalize to -16 LUFS）
5. 输出为 MP3（默认）或 WAV（用户选择）
6. 保存到应用数据目录的 `podcasts/` 子目录

**文件命名**：

```
{app_data_dir}/podcasts/{episode_id}/{episode_id}.mp3
```

**输出**：

```python
final_audio_path: str   # 最终音频文件路径
duration_ms: int        # 实际总时长
file_size_bytes: int    # 文件大小
```

---

## 6. TTS Provider 架构

### 6.1 Provider 接口抽象

所有 TTS Provider 实现统一接口：

```python
class TTSProvider(Protocol):
    """Unified TTS provider interface."""

    async def synthesize(
        self,
        text: str,
        voice_id: str,
        language: str,
        output_path: str,
        speed: float = 1.0,
    ) -> TTSResult:
        """Synthesize text to audio file.

        Args:
            text: The text to synthesize.
            voice_id: Provider-specific voice identifier.
            language: BCP-47 language tag (e.g. "zh-CN", "en-US").
            output_path: Absolute path to write the audio file.
            speed: Speech speed multiplier (0.25 - 4.0).

        Returns:
            TTSResult with file_path, duration_ms, and provider metadata.
        """
        ...

    def list_voices(self, language: str) -> list[VoiceInfo]:
        """List available voices for a given language."""
        ...

    def is_available(self) -> bool:
        """Check if this provider is currently available (has credentials, etc.)."""
        ...


class TTSResult(TypedDict):
    file_path: str
    duration_ms: int
    provider: str
    voice_id: str
    model: str


class VoiceInfo(TypedDict):
    voice_id: str
    name: str
    language: str
    gender: str          # "male" | "female" | "neutral"
    personality: str     # "warm" | "authoritative" | "friendly" | "calm" | "energetic"
```

### 6.2 Tier 1: OpenAI TTS

**Provider ID**: `openai`

**依赖**：`openai` Python SDK（已在 requirements.txt）

**支持模型**：

| 模型 | 特点 | 单次上限 |
|------|------|----------|
| `tts-1` | 低延迟，标准质量 | 4096 字符 |
| `tts-1-hd` | 高质量，稍慢 | 4096 字符 |
| `gpt-4o-mini-tts` | 可控风格指令，多语言 | 4096 字符 |

**预设 Voice 映射**：

| 语言 | 角色 | voice_id | 说明 |
|------|------|----------|------|
| `zh-CN` | 主持人/分析师 | `nova` | 温暖女声 |
| `zh-CN` | 专家/嘉宾 | `onyx` | 沉稳男声 |
| `zh-CN` | 讲师/播报员 | `alloy` | 中性专业 |
| `en-US` | Host | `nova` | Warm female |
| `en-US` | Expert | `onyx` | Deep male |
| `en-US` | Narrator | `alloy` | Neutral |
| `ja-JP` | Host | `shimmer` | Soft female |
| `ja-JP` | Expert | `echo` | Clear male |
| `ko-KR` | Host | `nova` | Warm female |
| `ko-KR` | Expert | `onyx` | Deep male |

**长文本处理**：超过 4096 字符的段落自动拆分为多次调用，输出片段用 pydub 拼接。

**认证**：复用用户在 BYOK 设置中配置的 OpenAI API Key，通过 `HostGatewayClient.get_default_config_with_key()` 获取。

### 6.3 Tier 2: Edge-TTS

**Provider ID**: `edge_tts`

**依赖**：`edge-tts` Python 包（需新增到 requirements.txt）

**特点**：

- 免费，无需 API Key
- 中文质量优秀（使用 Microsoft Edge 的在线 TTS 服务）
- 支持多种语言和地区变体
- 异步底层，适合批量合成
- 需要网络连接

**预设 Voice 映射**：

| 语言 | 角色 | voice_id | 说明 |
|------|------|----------|------|
| `zh-CN` | 女声主持人 | `zh-CN-XiaoxiaoNeural` | 温暖自然 |
| `zh-CN` | 男声专家 | `zh-CN-YunxiNeural` | 沉稳专业 |
| `zh-CN` | 中性播报 | `zh-CN-YunjianNeural` | 新闻播报风 |
| `en-US` | Female Host | `en-US-JennyNeural` | Conversational |
| `en-US` | Male Expert | `en-US-GuyNeural` | Professional |
| `ja-JP` | Female Host | `ja-JP-NanamiNeural` | Natural |
| `ja-JP` | Male Expert | `ja-JP-KeitaNeural` | Professional |
| `ko-KR` | Female Host | `ko-KR-SunHiNeural` | Warm |
| `ko-KR` | Male Expert | `ko-KR-InJoonNeural` | Professional |

**长文本处理**：edge-tts 本身无字符上限，但建议单次不超过 5000 字符以保证质量。

### 6.4 Tier 3: ElevenLabs

**Provider ID**: `elevenlabs`

**依赖**：`elevenlabs` Python SDK（需新增到 requirements.txt）

**特点**：

- 最高质量语音合成
- 丰富的声音库和声音克隆能力
- 需要 API Key（需用户额外配置）
- 按字符计费

**预设 Voice 映射**：

| 语言 | 角色 | voice_id | 说明 |
|------|------|----------|------|
| `zh-CN` | 女声主持人 | `elevenlabs_zh_female_01` | 需从 ElevenLabs 声音库选择 |
| `zh-CN` | 男声专家 | `elevenlabs_zh_male_01` | 需从 ElevenLabs 声音库选择 |
| `en-US` | Female Host | `elevenlabs_en_female_01` | 需从 ElevenLabs 声音库选择 |
| `en-US` | Male Expert | `elevenlabs_en_male_01` | 需从 ElevenLabs 声音库选择 |

**注意**：ElevenLabs 的 voice_id 需要在用户配置时从其声音库中选择并绑定。默认映射仅作为推荐。

### 6.5 Tier 3: Fish Audio

**Provider ID**: `fish_audio`

**依赖**：`fish-audio-sdk` Python 包（需新增到 requirements.txt）

**特点**：

- 开源 TTS 模型（fish-speech），支持自部署
- 声音克隆能力（10-30 秒参考音频即可克隆）
- 中文质量顶尖（EmergentTTS-Eval 81.88% 胜率）
- 需要 API Key 或自部署端点

**预设 Voice 映射**：

| 语言 | 角色 | voice_id | 说明 |
|------|------|----------|------|
| `zh-CN` | 女声主持人 | `fish_zh_female_01` | 需从 Fish Audio 声音库选择 |
| `zh-CN` | 男声专家 | `fish_zh_male_01` | 需从 Fish Audio 声音库选择 |
| `en-US` | Female Host | `fish_en_female_01` | 需从 Fish Audio 声音库选择 |
| `en-US` | Male Expert | `fish_en_male_01` | 需从 Fish Audio 声音库选择 |

### 6.6 Voice 选择策略

当用户选择 `auto` 模式时，voice 选择流程：

```
1. 确定 language 和 style
2. 根据 style 确定角色列表（1人或2人）
3. 根据 language + 角色 查找当前 TTS Provider 的预设 voice_id
4. 如果用户在设置中自定义了 voice 映射，优先使用用户配置
5. 否则使用预设映射
```

### 6.7 TTS Provider 配置存储

TTS Provider 配置存储在 Rust Host 的 `app_settings` 中，通过 IPC 读写：

```typescript
interface TTSProviderConfig {
  provider: "auto" | "openai" | "edge_tts" | "elevenlabs" | "fish_audio"
  openaiModel: "tts-1" | "tts-1-hd" | "gpt-4o-mini-tts"  // 仅 openai
  elevenlabsApiKey?: string   // 存储在 Stronghold
  fishAudioApiKey?: string    // 存储在 Stronghold
  fishAudioEndpoint?: string  // 自部署端点
  voiceOverrides?: Record<string, string>  // 用户自定义 voice 映射
  outputFormat: "mp3" | "wav"
  skipReview: boolean         // 跳过人工审阅
}
```

---

## 7. 数据模型规范

### 7.1 TypeScript 类型定义

以下类型替换 `src/types/podcast.ts` 中的现有定义：

```typescript
// ───── Enums ─────

export type PodcastStyle = 'deep_dive' | 'lecture' | 'interview' | 'casual' | 'exam_prep'
export type PodcastDurationTier = 'short' | 'medium' | 'long' | 'ultra_long'
export type PodcastLanguage = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'other'
export type TTSProviderId = 'auto' | 'openai' | 'edge_tts' | 'elevenlabs' | 'fish_audio'
export type PodcastStatus = 'queued' | 'retrieving' | 'generating_outline' | 'generating_script' | 'evaluating' | 'awaiting_review' | 'generating_audio' | 'stitching' | 'ready' | 'failed' | 'cancelled'
export type AudioFormat = 'mp3' | 'wav'

// ───── Domain Types ─────

export interface PresetRole {
  speakerId: string
  name: string
  personality: string
  defaultVoiceHint: string
}

export interface DialogueSegment {
  id: string
  speaker: string
  text: string
  durationMs: number
}

export interface PodcastOutlineSegment {
  segmentIndex: number
  topic: string
  keyPoints: string[]
  targetDurationMs: number
  speakerAssignments: Array<{
    speakerId: string
    role: string
  }>
}

export interface PodcastOutline {
  title: string
  description: string
  totalTargetDurationMs: number
  segments: PodcastOutlineSegment[]
}

export interface PodcastScript {
  title: string
  description: string
  speakers: string[]
  outline: string[]
  segments: DialogueSegment[]
}

export interface ScriptEvaluation {
  coherence: number
  accuracy: number
  styleConsistency: number
  naturalness: number
  overallScore: number
  issues: string[]
  suggestions: string[]
  revised: boolean
}

export interface AudioSegment {
  id: string
  episodeId: string
  dialogueSegmentId: string
  speaker: string
  filePath: string
  durationMs: number
  ttsProvider: TTSProviderId
  voiceId: string
}

export interface PodcastEpisode {
  id: string
  documentIds: string[]          // 支持多文档
  runId: string | null
  title: string
  scopeDescription: string       // 用户提示词
  style: PodcastStyle
  language: PodcastLanguage
  durationTier: PodcastDurationTier
  ttsProvider: TTSProviderId
  audioFormat: AudioFormat
  scriptJson: string             // PodcastScript JSON
  outlineJson: string | null     // PodcastOutline JSON
  evaluationJson: string | null  // ScriptEvaluation JSON
  audioPath: string | null
  durationMs: number
  status: PodcastStatus
  errorMessage: string | null
  currentStage: number           // 1-6 当前管线阶段
  completedSegments: number      // 已完成的 segment 数
  totalSegments: number          // 总 segment 数
  createdAt: string
  updatedAt: string
}

// ───── Zod Schemas for IPC validation ─────

export const PodcastStyleSchema = z.enum(['deep_dive', 'lecture', 'interview', 'casual', 'exam_prep'])
export const PodcastDurationTierSchema = z.enum(['short', 'medium', 'long', 'ultra_long'])
export const PodcastLanguageSchema = z.enum(['zh-CN', 'en-US', 'ja-JP', 'ko-KR', 'other'])
export const TTSProviderIdSchema = z.enum(['auto', 'openai', 'edge_tts', 'elevenlabs', 'fish_audio'])
export const PodcastStatusSchema = z.enum([
  'queued', 'retrieving', 'generating_outline', 'generating_script',
  'evaluating', 'awaiting_review', 'generating_audio', 'stitching',
  'ready', 'failed', 'cancelled',
])
export const AudioFormatSchema = z.enum(['mp3', 'wav'])

export const DialogueSegmentSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  durationMs: z.number(),
})

export const PodcastOutlineSegmentSchema = z.object({
  segmentIndex: z.number(),
  topic: z.string(),
  keyPoints: z.array(z.string()),
  targetDurationMs: z.number(),
  speakerAssignments: z.array(z.object({
    speakerId: z.string(),
    role: z.string(),
  })),
})

export const PodcastOutlineSchema = z.object({
  title: z.string(),
  description: z.string(),
  totalTargetDurationMs: z.number(),
  segments: z.array(PodcastOutlineSegmentSchema),
})

export const PodcastScriptSchema = z.object({
  title: z.string(),
  description: z.string(),
  speakers: z.array(z.string()),
  outline: z.array(z.string()),
  segments: z.array(DialogueSegmentSchema),
})

export const ScriptEvaluationSchema = z.object({
  coherence: z.number().min(1).max(10),
  accuracy: z.number().min(1).max(10),
  styleConsistency: z.number().min(1).max(10),
  naturalness: z.number().min(1).max(10),
  overallScore: z.number().min(1).max(10),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
  revised: z.boolean(),
})

export const AudioSegmentSchema = z.object({
  id: z.string(),
  episodeId: z.string(),
  dialogueSegmentId: z.string(),
  speaker: z.string(),
  filePath: z.string(),
  durationMs: z.number(),
  ttsProvider: TTSProviderIdSchema,
  voiceId: z.string(),
})

export const PodcastEpisodeSchema = z.object({
  id: z.string(),
  documentIds: z.array(z.string()),
  runId: z.string().nullable(),
  title: z.string(),
  scopeDescription: z.string(),
  style: PodcastStyleSchema,
  language: PodcastLanguageSchema,
  durationTier: PodcastDurationTierSchema,
  ttsProvider: TTSProviderIdSchema,
  audioFormat: AudioFormatSchema,
  scriptJson: z.string(),
  outlineJson: z.string().nullable(),
  evaluationJson: z.string().nullable(),
  audioPath: z.string().nullable(),
  durationMs: z.number(),
  status: PodcastStatusSchema,
  errorMessage: z.string().nullable(),
  currentStage: z.number().int().min(0).max(6),
  completedSegments: z.number().int().nonnegative(),
  totalSegments: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
```

### 7.2 SQLite Schema

以下表通过 refinery migration 创建：

```sql
-- Migration: V12__podcast_episodes.sql

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id              TEXT PRIMARY KEY NOT NULL,
  document_ids    TEXT NOT NULL,             -- JSON array of document IDs
  run_id          TEXT,
  title           TEXT NOT NULL,
  scope_description TEXT NOT NULL DEFAULT '',
  style           TEXT NOT NULL DEFAULT 'interview',
  language        TEXT NOT NULL DEFAULT 'zh-CN',
  duration_tier   TEXT NOT NULL DEFAULT 'medium',
  tts_provider    TEXT NOT NULL DEFAULT 'auto',
  audio_format    TEXT NOT NULL DEFAULT 'mp3',
  script_json     TEXT NOT NULL DEFAULT '{}',
  outline_json    TEXT,
  evaluation_json TEXT,
  audio_path      TEXT,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'queued',
  error_message   TEXT,
  current_stage   INTEGER NOT NULL DEFAULT 0,
  completed_segments INTEGER NOT NULL DEFAULT 0,
  total_segments  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_status ON podcast_episodes(status);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_created_at ON podcast_episodes(created_at DESC);

CREATE TABLE IF NOT EXISTS podcast_audio_segments (
  id                  TEXT PRIMARY KEY NOT NULL,
  episode_id          TEXT NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  dialogue_segment_id TEXT NOT NULL,
  speaker             TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  duration_ms         INTEGER NOT NULL DEFAULT 0,
  tts_provider        TEXT NOT NULL,
  voice_id            TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_podcast_audio_segments_episode ON podcast_audio_segments(episode_id);
```

### 7.3 Python Schema (Pydantic)

在 `orchestration_service/schemas/` 下新增 `podcast.py`：

```python
"""Pydantic schemas for podcast pipeline structured output."""
from __future__ import annotations

from pydantic import BaseModel, Field


class OutlineSegment(BaseModel):
    segment_index: int = Field(ge=0)
    topic: str
    key_points: list[str]
    target_duration_ms: int = Field(ge=1000)
    speaker_assignments: list[dict[str, str]]


class PodcastOutlineSchema(BaseModel):
    title: str
    description: str
    total_target_duration_ms: int = Field(ge=1000)
    segments: list[OutlineSegment] = Field(min_length=1)


class DialogueLine(BaseModel):
    id: str
    speaker: str
    text: str
    duration_ms: int = Field(ge=500)


class PodcastScriptSchema(BaseModel):
    title: str
    description: str
    speakers: list[str]
    outline: list[str]
    segments: list[DialogueLine]


class ScriptEvaluationSchema(BaseModel):
    coherence: float = Field(ge=1, le=10)
    accuracy: float = Field(ge=1, le=10)
    style_consistency: float = Field(ge=1, le=10)
    naturalness: float = Field(ge=1, le=10)
    overall_score: float = Field(ge=1, le=10)
    issues: list[str]
    suggestions: list[str]
```

### 7.4 Rust DTO

在 `src-tauri/src/commands/podcast.rs` 中定义 `PodcastEpisodeDto`，字段与 TypeScript `PodcastEpisode` 一一对应，通过 `From<PodcastEpisode>` impl 转换。所有字段使用 `serde_json::Value` 存储 JSON 字符串字段（`scriptJson`、`outlineJson`、`evaluationJson`）。

---

## 8. 长任务、恢复与预算控制

### 8.1 超长播客分段策略

**适用条件**：`durationTier = "ultra_long"`（目标 30 min+）

**分段规则**：

- 按 15-20 min 为一个 `MacroSegment`，将整期播客拆分为 2-N 个 MacroSegment
- 每个 MacroSegment 独立执行 Stage 2-6（提纲→脚本→评估→TTS→拼接）
- 每个 MacroSegment 产出独立的中间音频文件
- 最终所有 MacroSegment 音频拼接为完整播客

**MacroSegment 元数据**：

```python
class MacroSegment(TypedDict):
    index: int               # 0-based
    target_duration_ms: int  # 目标时长
    status: str              # "pending" | "in_progress" | "completed" | "failed"
    audio_path: str | None   # 完成后的音频路径
    script_json: str | None  # 完成后的脚本 JSON
```

### 8.2 Checkpoint 机制

**Checkpoint 写入时机**：

| 阶段 | Checkpoint 内容 |
|------|----------------|
| Stage 2 完成 | outline_json |
| Stage 3 每 segment | completed_segments, script_json (增量) |
| Stage 4 完成 | evaluation_json, final script_json |
| 人工审阅完成 | reviewed_script_json |
| Stage 5 每 5 个对话段落 | completed audio segments |
| Stage 6 完成 | final_audio_path, duration_ms |

**Checkpoint 存储**：通过 `HostGatewayClient.update_podcast_status()` 写入 Rust Host 的 SQLite。

**恢复逻辑**：

```
1. 读取 episode 的 current_stage 和 completed_segments
2. 如果 current_stage == 0 → 从 Stage 1 开始
3. 如果 current_stage == 3 → 从第 completed_segments + 1 个 segment 继续
4. 如果 current_stage == 5 → 从第 completed audio segment 继续
5. 如果 current_stage == 6 → 重新执行拼接（音频文件可能已存在）
6. 其他 → 从当前 stage 重新开始
```

### 8.3 取消机制

**用户取消流程**：

1. 前端调用 `cancelPodcastEpisode(episodeId)`
2. Rust Host 设置 episode status = `cancelled`
3. Python 管线在下一个 checkpoint 检查点检测到取消信号
4. 管线停止执行
5. **丢弃所有中间产物**（临时音频文件、checkpoint 数据）
6. 删除 `podcasts/{episode_id}/` 目录下所有文件
7. episode 记录保留在数据库中，status = `cancelled`

**取消检测**：管线在每个 LLM/TTS 调用前调用 `host.is_run_cancelled(run_id)` 检查。

### 8.4 预算控制

**预算维度**：

| 维度 | 默认上限 | 说明 |
|------|----------|------|
| `max_llm_tokens` | 100,000 | LLM 调用总 token 数 |
| `max_tts_characters` | 50,000 | TTS 合成总字符数 |
| `max_estimated_cost_usd` | 1.00 | 预估总费用（美元） |

**预算检查时机**：每次 LLM/TTS 调用后累加消耗，与上限比较。

**超预算行为**：**中止**管线，episode status = `failed`，error_message 记录预算超限详情。

**预算配置**：用户可在设置中调整上限，0 表示不限制。

### 8.5 进度报告

管线通过 `HostGatewayClient.emit_workflow_event()` 向前端推送进度事件：

```python
class PodcastProgressEvent(TypedDict):
    episode_id: str
    stage: int              # 1-6
    stage_name: str         # "retrieving" | "generating_outline" | ...
    progress: float         # 0.0 - 1.0
    message: str            # 人类可读的进度描述
    estimated_remaining_ms: int | None
```

前端通过 TanStack Query 轮询或 SSE 消费进度事件，更新 UI。

---

## 9. 前端组件架构

### 9.1 页面与组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| `PodcastListPage` | `features/podcast/PodcastListPage.tsx` | 播客库列表页 |
| `PodcastGenerateWizard` | `features/podcast/PodcastGenerateWizard.tsx` | 分步生成表单 |
| `PodcastPlayer` | `features/podcast/PodcastPlayer.tsx` | 内置音频播放器 |
| `PodcastScriptReview` | `features/podcast/PodcastScriptReview.tsx` | 脚本审阅面板 |
| `PodcastEpisodeCard` | `features/podcast/PodcastEpisodeCard.tsx` | 列表中的播客卡片 |
| `PodcastProgressBar` | `features/podcast/PodcastProgressBar.tsx` | 生成进度条 |

### 9.2 PodcastListPage

**布局**：

- 顶部：标题 + "新建播客"按钮
- 主体：播客卡片网格/列表
- 每个卡片展示：标题、源文档名、风格标签、时长、状态、创建时间
- 支持操作：播放、删除、重新生成、查看脚本

**空状态**：展示引导文案"选择学习文档，生成你的第一个播客"

### 9.3 PodcastGenerateWizard

**Step Form 组件**，3 步：

1. **选择文档**：复用文档选择组件，支持多选
2. **配置参数**：5 个配置项（prompt / style / language / duration / ttsProvider），每个有合理的默认值
3. **确认生成**：摘要展示 + 费用估算 + "开始生成"按钮

**验证规则**：

- 至少选择 1 个文档
- style / language / durationTier / ttsProvider 必填
- prompt 可选，最大 500 字符

### 9.4 PodcastPlayer

**功能**：

- 播放/暂停
- 进度条（可拖拽跳转）
- 播放速度切换（0.5x / 0.75x / 1.0x / 1.25x / 1.5x / 2.0x）
- 时间显示（当前/总时长）
- segment 跳转（下拉选择或按钮切换到下一个 segment）
- 音量控制

**技术实现**：使用 HTML5 `<audio>` 元素 + React 状态管理，不引入额外播放器库。

**segment 跳转**：基于 `DialogueSegment.durationMs` 预计算每个 segment 的起始时间偏移，用户点击 segment 时跳转到对应偏移。

### 9.5 PodcastScriptReview

**功能**：

- 展示完整脚本（按 segment 折叠/展开）
- 展示自动评估分数（4 维度雷达图或进度条）
- 展示评估问题列表
- 编辑模式：用户可修改任意对话段落的文本
- 操作按钮：接受 / 编辑 / 拒绝

### 9.6 状态管理

| 状态 | 存储位置 | 说明 |
|------|----------|------|
| 播客列表 | TanStack Query | 通过 `queries/podcast.ts` 缓存 |
| 生成进度 | TanStack Query + 轮询 | 每 2 秒轮询 episode 状态 |
| 播放器状态 | Zustand | 当前播放 episode、进度、速度 |
| 向导表单状态 | React useState | 向导内的临时状态 |

### 9.7 IPC 契约

更新 `services/gateway/podcast.ts`：

```typescript
// 新增/修改的 IPC 接口

export interface StartPodcastInput {
  documentIds: string[]
  prompt?: string
  style: PodcastStyle
  language: PodcastLanguage
  durationTier: PodcastDurationTier
  ttsProvider: TTSProviderId
  audioFormat?: AudioFormat
}

export async function startPodcastWorkflow(input: StartPodcastInput): Promise<PodcastEpisode>
export async function getPodcastEpisode(episodeId: string): Promise<PodcastEpisode | null>
export async function listPodcastEpisodes(): Promise<PodcastEpisode[]>
export async function cancelPodcastEpisode(episodeId: string): Promise<void>
export async function deletePodcastEpisode(episodeId: string): Promise<void>
export async function reviewPodcastScript(episodeId: string, action: 'accept' | 'edit' | 'reject', editedScriptJson?: string): Promise<PodcastEpisode>
export async function retryPodcastEpisode(episodeId: string): Promise<PodcastEpisode>
export async function getPodcastAudioSegments(episodeId: string): Promise<AudioSegment[]>
```

---

## 10. Python 实现规范

### 10.1 文件结构

```
orchestration_service/
├── workflows/
│   ├── podcast.py              # 重写：完整 6 阶段管线
│   └── podcast_utils.py        # 新增：共享工具函数
├── providers/
│   ├── tts_base.py             # 新增：TTSProvider Protocol
│   ├── tts_openai.py           # 新增：OpenAI TTS 实现
│   ├── tts_edge.py             # 新增：Edge-TTS 实现
│   ├── tts_elevenlabs.py       # 新增：ElevenLabs 实现
│   ├── tts_fish.py             # 新增：Fish Audio 实现
│   └── tts_router.py           # 新增：TTS Provider 路由与降级
├── schemas/
│   └── podcast.py              # 新增：Pydantic 结构化输出 schema
└── clients/
    └── host_gateway.py         # 扩展：新增播客相关方法
```

### 10.2 主管线函数签名

```python
def run_podcast_workflow(
    run_id: str,
    episode_id: str,
    document_ids: list[str],
    prompt: str,
    style: str,              # PodcastStyle
    language: str,           # PodcastLanguage
    duration_tier: str,      # PodcastDurationTier
    tts_provider: str,        # TTSProviderId
    audio_format: str,        # AudioFormat
    host: HostGatewayClient,
) -> dict:
    """Execute the full 6-stage podcast generation pipeline.

    Returns:
        {"status": "completed" | "failed" | "cancelled", ...}
    """
```

### 10.3 HostGatewayClient 扩展方法

需在 `host_gateway.py` 中新增以下方法：

```python
# 播客 episode CRUD
def create_podcast_episode(self, episode: dict) -> dict
def get_podcast_episode(self, episode_id: str) -> dict | None
def update_podcast_episode(self, episode_id: str, updates: dict) -> dict
def list_podcast_episodes(self) -> list[dict]
def delete_podcast_episode(self, episode_id: str) -> None

# 播客音频 segment
def save_podcast_audio_segment(self, segment: dict) -> dict
def list_podcast_audio_segments(self, episode_id: str) -> list[dict]

# 播客审阅
def review_podcast_script(self, episode_id: str, action: str, edited_script_json: str | None) -> dict
```

### 10.4 TTS Router 实现

`tts_router.py` 负责根据用户选择和可用性路由到具体 TTS Provider：

```python
class TTSRouter:
    """Route TTS requests to the appropriate provider."""

    def __init__(self, host: HostGatewayClient):
        self._providers: dict[str, TTSProvider] = {}
        self._host = host
        self._init_providers()

    def _init_providers(self) -> None:
        """Initialize providers based on available credentials."""
        # OpenAI: check if user has OpenAI key
        # Edge-TTS: always available (free, no key needed)
        # ElevenLabs: check if user has ElevenLabs key
        # Fish Audio: check if user has Fish Audio key

    def get_provider(self, provider_id: str) -> TTSProvider:
        """Get a specific provider or auto-select the best available."""

    def resolve_voice(self, provider: TTSProvider, language: str, role: str) -> str:
        """Resolve voice ID for a given language and role."""
```

### 10.5 音频拼接实现

使用 pydub + ffmpeg：

```python
from pydub import AudioSegment

def stitch_audio_segments(
    segment_files: list[str],
    output_path: str,
    crossfade_ms: int = 300,
    speaker_gap_ms: int = 500,
    output_format: str = "mp3",
) -> dict:
    """Stitch audio segments with crossfade and speaker gaps.

    Returns:
        {"file_path": str, "duration_ms": int, "file_size_bytes": int}
    """
```

### 10.6 Prompt 模板管理

每种播客风格对应一组 system prompt + user prompt 模板，存储在 Python 代码中（不使用外部文件）：

```python
STYLE_PROMPTS: dict[str, dict[str, str]] = {
    "deep_dive": {
        "system": "你是深度探讨播客的分析师和专家...",
        "outline_system": "你是播客提纲规划师，为深度探讨风格规划结构...",
    },
    "lecture": {
        "system": "你是知识讲解播客的讲师...",
        "outline_system": "你是播客提纲规划师，为知识讲解风格规划结构...",
    },
    "interview": {
        "system": "你是访谈播客的主持人和嘉宾...",
        "outline_system": "你是播客提纲规划师，为访谈风格规划结构...",
    },
    "casual": {
        "system": "你是轻松闲聊播客的朋友...",
        "outline_system": "你是播客提纲规划师，为轻松闲聊风格规划结构...",
    },
    "exam_prep": {
        "system": "你是考点速记播客的播报员...",
        "outline_system": "你是播客提纲规划师，为考点速记风格规划结构...",
    },
}
```

### 10.7 依赖更新

`requirements.txt` 新增：

```
edge-tts>=6.0
pydub>=0.25
elevenlabs>=1.0      # 可选
fish-audio-sdk>=1.0  # 可选
```

系统依赖：`ffmpeg`（pydub 音频处理需要）

---

## 11. Rust 实现规范

### 11.1 文件结构

```
src-tauri/src/
├── commands/
│   └── podcast.rs              # 重写：完整 IPC 命令集
├── db/
│   └── podcast_repo.rs         # 新增：播客数据库操作
└── migrations/
    └── V12__podcast_episodes.sql  # 新增：数据库迁移
```

### 11.2 IPC 命令清单

| 命令 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `start_podcast_workflow` | `StartPodcastInput` | `PodcastEpisode` | 创建 episode + 启动管线 |
| `get_podcast_episode` | `episodeId: string` | `PodcastEpisode \| null` | 查询单个 episode |
| `list_podcast_episodes` | `{}` | `PodcastEpisode[]` | 列出所有 episode |
| `cancel_podcast_episode` | `episodeId: string` | `void` | 取消生成 |
| `delete_podcast_episode` | `episodeId: string` | `void` | 删除 episode + 音频文件 |
| `review_podcast_script` | `episodeId, action, editedScriptJson?` | `PodcastEpisode` | 审阅脚本 |
| `retry_podcast_episode` | `episodeId: string` | `PodcastEpisode` | 重新生成 |
| `get_podcast_audio_segments` | `episodeId: string` | `AudioSegment[]` | 获取音频段列表 |

### 11.3 PodcastRepository 方法

```rust
impl PodcastRepository {
    fn create_episode(&self, episode: NewPodcastEpisode) -> Result<PodcastEpisode>;
    fn get_episode(&self, id: &str) -> Result<Option<PodcastEpisode>>;
    fn list_episodes(&self) -> Result<Vec<PodcastEpisode>>;
    fn update_episode(&self, id: &str, updates: &PodcastEpisodeUpdates) -> Result<PodcastEpisode>;
    fn delete_episode(&self, id: &str) -> Result<()>;
    fn save_audio_segment(&self, segment: NewAudioSegment) -> Result<AudioSegment>;
    fn list_audio_segments(&self, episode_id: &str) -> Result<Vec<AudioSegment>>;
    fn delete_audio_segments_by_episode(&self, episode_id: &str) -> Result<()>;
}
```

### 11.4 管线启动流程

`start_podcast_workflow` 命令执行流程：

1. 生成 `episode_id`（UUID）
2. 生成 `run_id`（UUID）
3. 在 SQLite 中创建 episode 记录（status = `queued`）
4. 构造 HTTP 请求发送到 Python orchestration service 的 `/workflows/podcast` 端点
5. Python 管线异步执行
6. 返回初始 episode 状态给前端

---

## 12. 测试与验收

### 12.1 单元测试

| 测试 | 文件 | 说明 |
|------|------|------|
| `test_podcast_outline_schema` | `tests/test_podcast_schemas.py` | Pydantic schema 校验 |
| `test_podcast_script_schema` | `tests/test_podcast_schemas.py` | 脚本 schema 校验 |
| `test_tts_router_auto_selection` | `tests/test_tts_router.py` | TTS 自动选择逻辑 |
| `test_tts_router_fallback` | `tests/test_tts_router.py` | TTS 降级逻辑 |
| `test_audio_stitching` | `tests/test_audio_stitching.py` | 音频拼接 + crossfade |
| `test_script_evaluation_scoring` | `tests/test_script_eval.py` | 评估分数计算 |
| `test_checkpoint_recovery` | `tests/test_podcast_checkpoint.py` | 断点续传逻辑 |
| `test_budget_control` | `tests/test_podcast_budget.py` | 预算控制逻辑 |
| `test_podcast_episode_crud` | `tests/test_podcast_repo.py` | Rust 数据库操作 |

### 12.2 集成测试

| 测试 | 说明 |
|------|------|
| `test_podcast_pipeline_short` | 短播客端到端生成（mock TTS） |
| `test_podcast_pipeline_medium` | 中播客端到端生成（mock TTS） |
| `test_podcast_pipeline_cancel` | 中途取消 + 丢弃验证 |
| `test_podcast_pipeline_budget_exceeded` | 预算超限中止验证 |
| `test_podcast_pipeline_resume` | 断点续传验证 |
| `test_tts_openai_integration` | OpenAI TTS 真实调用（需 Key） |
| `test_tts_edge_integration` | Edge-TTS 真实调用 |

### 12.3 E2E 测试

| 场景 ID | 场景 | 预期结果 |
|---------|------|----------|
| `V3-POD-01` | 生成短播客脚本 | 输出结构化提纲和对话脚本 |
| `V3-POD-02` | 生成播客音频 | TTS 生成音频，可播放 |
| `V3-POD-03` | 播客生成失败 | 任务失败可回退，可重新生成 |
| `V3-POD-04` | 播客生成取消 | 取消后丢弃中间产物 |
| `V3-POD-05` | 播客审阅 | 用户可接受/编辑/拒绝脚本 |
| `V3-POD-06` | 播客列表 | 独立播客库页面，展示所有 episode |
| `V3-POD-07` | 播客播放 | 内置播放器，支持进度/倍速/segment 跳转 |
| `V3-POD-08` | 超长播客 | 分段生成 + 断点续传 |
| `V3-POD-09` | 预算控制 | 超预算中止 |
| `V3-POD-10` | 多语言 | 中文文档生成英文播客 |

### 12.4 验收标准

播客子系统"Done"意味着：

1. 用户可选择文档 + 配置参数 → 一键生成播客音频
2. 6 阶段管线全部可用（知识检索 → 提纲 → 脚本 → 评估 → TTS → 拼接）
3. 至少 OpenAI TTS + Edge-TTS 两个 Provider 可用
4. 自动评估 + 人工审阅流程可用
5. 长播客分段 + 断点续传可用
6. 预算控制 + 取消机制可用
7. 独立播客库页面 + 内置播放器可用
8. 所有 E2E 测试场景通过
9. 所有 IPC 交换通过 Zod schema 强校验

---

## 13. 实施阶段

### Phase P0: 基础设施（1-2 天）

- [ ] 新增 SQLite migration V12（podcast_episodes + podcast_audio_segments 表）
- [ ] 新增 Python Pydantic schema（`schemas/podcast.py`）
- [ ] 新增 TypeScript 类型定义（替换 `types/podcast.ts`）
- [ ] 新增 Rust `PodcastRepository` + `PodcastEpisodeDto`
- [ ] 新增 Rust IPC 命令骨架

### Phase P1: 管线核心（3-5 天）

- [ ] 重写 `workflows/podcast.py`：6 阶段管线
- [ ] 实现 Stage 1-4（知识检索 → 提纲 → 脚本 → 评估）
- [ ] 实现 5 种风格的 prompt 模板
- [ ] 实现 checkpoint 机制
- [ ] 实现 HostGatewayClient 播客相关方法
- [ ] 更新 `server.py` 的 `/workflows/podcast` 端点

### Phase P2: TTS 集成（2-3 天）

- [ ] 实现 `TTSProvider` Protocol + `TTSRouter`
- [ ] 实现 OpenAI TTS Provider
- [ ] 实现 Edge-TTS Provider
- [ ] 实现 ElevenLabs Provider（可选）
- [ ] 实现 Fish Audio Provider（可选）
- [ ] 实现音频拼接（pydub + ffmpeg + crossfade）
- [ ] 更新 `requirements.txt`

### Phase P3: 前端页面（3-4 天）

- [ ] 重写 `PodcastListPage`
- [ ] 实现 `PodcastGenerateWizard`
- [ ] 实现 `PodcastPlayer`
- [ ] 实现 `PodcastScriptReview`
- [ ] 实现 `PodcastEpisodeCard` + `PodcastProgressBar`
- [ ] 更新 `queries/podcast.ts` + `services/gateway/podcast.ts`
- [ ] 更新路由配置

### Phase P4: 长任务与预算（1-2 天）

- [ ] 实现超长播客 MacroSegment 分段策略
- [ ] 实现断点续传恢复逻辑
- [ ] 实现预算控制（token/字符/费用上限）
- [ ] 实现取消机制（丢弃中间产物）
- [ ] 实现进度报告（emit events）

### Phase P5: 测试与验收（2-3 天）

- [ ] 编写单元测试
- [ ] 编写集成测试
- [ ] 编写 E2E 测试
- [ ] 验收场景逐项通过
- [ ] 文档最终更新

---

## 14. 已知限制与后续规划

### 14.1 当前限制

1. **无声音克隆**：Tier 3 Provider 支持声音克隆，但本版本不提供 UI 入口，需用户在 Provider 平台自行配置。
2. **无实时流式播放**：TTS 生成是批量的，不支持边生成边播放。
3. **无字幕同步**：播放时不同步高亮当前对话段落。
4. **无卡片联动**：播客不基于卡片集合生成，仅基于文档。
5. **Edge-TTS 需要网络**：免费 TTS 依赖 Microsoft 在线服务，离线不可用。

### 14.2 后续规划

| 版本 | 能力 | 说明 |
|------|------|------|
| V3.1 | 字幕同步 | 播放时同步高亮当前对话段落 |
| V3.2 | 卡片联动 | 支持从卡片集合生成播客 |
| V3.3 | 声音克隆 UI | 在应用内提供声音克隆配置入口 |
| V3.4 | 实时流式 | 边生成边播放，降低等待时间 |
| V4 | 知识图谱联动 | 基于知识图谱生成更结构化的播客 |

---

## 15. 开源参考

本设计参考了以下开源项目和技术文档：

| 项目/文档 | 参考内容 |
|-----------|----------|
| [podcastfy](https://github.com/souzatharsis/podcastfy) | 多源输入、多语言、多 TTS Provider 集成模式 |
| [open-notebook](https://github.com/lfnovo/open-notebook) | EpisodeProfile + SpeakerProfile 模型、3 阶段管线（outline → transcript → audio） |
| [Together AI Open NotebookLM](https://docs.together.ai/docs/open-notebooklm-pdf-to-podcast) | Pydantic 对话 schema、Cartesia TTS 流式合成 |
| [edge-tts](https://github.com/rany2/edge-tts) | 免费 TTS Python 库，中文质量优秀 |
| [Fish Audio](https://fish.audio/) | 开源 TTS，中文质量顶尖，声音克隆 |
| [OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech) | gpt-4o-mini-tts 可控风格、多语言 |
| [ElevenLabs](https://elevenlabs.io/) | 高质量语音合成，声音克隆 |
| [pydub](https://github.com/jiaaro/pydub) | Python 音频处理，crossfade + 归一化 |
