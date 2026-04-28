# P0：必须立刻修

## 1. 项目主链路仍然把 Podcast、动画、知识图谱、APKG 混在核心里

**严重性：最高。**

你的当前架构文档仍把播客列入主链路，并且 Python Orchestration Service 中也把 `podcast`、`card_animation`、APKG import/export 都放进主服务接口。

仓库 README 也仍然写着“资料导入 -> 阅读加工 -> 卡片生成 -> 间隔复习 -> 知识问答/图谱 -> 播客生成”，并且主要文档里还列出知识图谱和播客流程。([GitHub](https://github.com/Dh-atomheart/XueJian "GitHub - Dh-atomheart/XueJian · GitHub"))

**必须修：**

主应用主链路改成：

```text
PDF 导入
-> 文档解析
-> Agent 生成闪卡
-> 卡片贴在 PDF 页边
-> FSRS 学习复习
-> 本地文档 RAG 问答
-> 学习统计
```

**暂停并移出主应用：**

```text
Podcast
Card Animation
Knowledge Graph
APKG 高级导入导出
Points
Profile
```

**具体处理：**

| 模块              | 处理                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| Podcast           | 从主导航、Rust command、Python endpoint、smoke test、requirements 中隔离 |
| Animation         | 暂停开发，从主导航和主流程移除，只保留 future plugin 文档                |
| Knowledge Graph   | 删除文档入口和主链路描述                                                 |
| APKG 高级导入导出 | 从 Python server 主接口移除                                              |
| Points            | 隐藏或删除                                                               |
| Profile           | 暂时隐藏                                                                 |

---

## 2. Podcast 和动画现在不是“插件”，而是主应用的一部分

**严重性：最高。**

当前前端 `App.tsx` 直接 import 并注册 `PodcastPage`；Rust `lib.rs` 也注册了 `commands::podcast::*` 和 `commands::animation::*`；Python `server.py` 也直接暴露 `/workflows/card-animation` 和 `/workflows/podcast`。([GitHub](https://raw.githubusercontent.com/Dh-atomheart/XueJian/master/xuejian/src/App.tsx "raw.githubusercontent.com"))

这意味着它们现在不是插件，而是**硬耦合主应用模块**。

**必须修：**

第一阶段不要做完整插件系统，先做“隔离冻结”。

### 立刻执行

| 层            | 动作                                                          |
| ------------- | ------------------------------------------------------------- |
| 前端          | 删除或隐藏 Podcast / Animation 入口                           |
| Rust commands | 从 `invoke_handler` 移除 podcast、animation command 注册      |
| Python server | 从 `/handshake` capabilities 移除 `card-animation`、`podcast` |
| Python routes | 暂停 `/workflows/card-animation`、`/workflows/podcast`        |
| DB            | 保留旧表，但不再写入新数据                                    |
| tests         | smoke/native smoke 不再跑 podcast/animation                   |
| docs          | 标记为 future plugin，不属于主应用                            |

### 后期插件化方向

不要一开始做复杂插件系统。建议分两步：

```text
阶段 1：主应用只导出数据能力
  - list_documents
  - read_document
  - search_chunks
  - list_cards
  - read_card
  - export_selected_context

阶段 2：Podcast / Animation 作为独立 app 或外部 worker 调用这些能力
```

**更靠谱的产品形态：**

| 能力      | 推荐形态                           |
| --------- | ---------------------------------- |
| Podcast   | 独立应用：XueJian Podcast Studio   |
| Animation | 独立插件：XueJian Visual Explainer |
| 主应用    | 只提供文档、卡片、RAG、复习、统计  |

理由：Podcast 和 Animation 都是“生成型内容生产线”，失败率、依赖、运行时间、产物管理都和主学习流程不同。它们不应该拖慢主应用。

---

## 3. Python Orchestration Service 启动过早、负担过重

**严重性：高。**

当前 Tauri 启动流程里会启动 Host HTTP Gateway，并初始化 Orchestration Service，之后后台预热 Python 服务。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src-tauri/src/lib.rs "XueJian/xuejian/src-tauri/src/lib.rs at master · Dh-atomheart/XueJian · GitHub"))

这对你的主应用不合理。用户只是打开 PDF、查看卡片、复习，不应该强制启动 Python、检查 AI 依赖、加载 Podcast/TTS/APKG 相关包。

**必须修：**

Python 服务改成**按需启动**。

```text
打开应用：
  React + Rust + SQLite + Stronghold

用户触发 AI 卡片生成 / 文档解析 / RAG：
  启动 Python Agent Service

用户只复习 / 阅读：
  不启动 Python
```

**具体整改：**

| 项目      | 处理                       |
| --------- | -------------------------- |
| App 启动  | 不自动 start orchestration |
| 文档解析  | 需要时启动                 |
| 卡片生成  | 需要时启动                 |
| RAG 问答  | 需要时启动                 |
| Podcast   | 不启动                     |
| Animation | 不启动                     |
| APKG      | 不启动                     |

**理由：**主应用必须保证“阅读 + 卡片 + 复习”不被 Python sidecar 影响。

---

## 4. Host HTTP Gateway 缺少本地鉴权

**严重性：高。**

当前 Host Gateway 绑定 `127.0.0.1`，随机端口启动，并向 Python 暴露 API key、文档数据、候选卡持久化等受控能力。代码里可以看到它直接监听 `127.0.0.1`，但当前结构没有体现强制 token 鉴权。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src-tauri/src/gateway/host_http.rs "XueJian/xuejian/src-tauri/src/gateway/host_http.rs at master · Dh-atomheart/XueJian · GitHub"))

Tauri 官方对 localhost 服务也明确提示有安全风险，只有清楚自己在做什么时才应使用。([Tauri](https://v2.tauri.app/plugin/localhost/?utm_source=chatgpt.com "Localhost - Tauri"))

**必须修：**

Host Gateway 必须加：

```text
X-XueJian-Gateway-Token
X-XueJian-Trace-Id
能力白名单
请求来源校验
超时限制
```

**整改标准：**

| 项目        | 要求                             |
| ----------- | -------------------------------- |
| token       | Rust 启动时生成随机 token        |
| 注入方式    | Rust 启动 Python 时通过 env 注入 |
| Python 请求 | 每次请求必须带 token             |
| Rust 校验   | 无 token / token 错误直接 401    |
| trace id    | 每个 workflow 全链路一致         |
| 权限        | Python 只能调用白名单工具        |

**理由：**`127.0.0.1` 不是权限模型。你这个 Gateway 能拿模型配置、文档内容、候选卡写入权，不能裸奔。

---

## 5. 文档删除是硬删除，存在数据丢失风险

**严重性：高。**

当前 `delete_document` 会先查文档，然后调用 `repo.delete(&id)`，之后如果文件存在就直接 `remove_file`，而且删除文件错误被忽略。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src-tauri/src/commands/documents.rs "XueJian/xuejian/src-tauri/src/commands/documents.rs at master · Dh-atomheart/XueJian · GitHub"))

`DocumentRepository::delete` 会直接删除 `document_anchors`、`document_chunks` 和 `documents`。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src-tauri/src/db/document_repo.rs "XueJian/xuejian/src-tauri/src/db/document_repo.rs at master · Dh-atomheart/XueJian · GitHub"))

这对学习应用非常危险，因为文档、卡片、来源页码、RAG chunk、复习历史之间有长期引用关系。

**必须修：**

改成软删除。

```text
documents.deleted_at
documents.status = deleted
chunks / anchors 默认保留
文件移入 trash 或仅标记
后续提供 restore / empty_trash
```

**整改标准：**

| 当前                  | 改成                  |
| --------------------- | --------------------- |
| 删除 documents 记录   | 标记 deleted_at       |
| 删除 chunks / anchors | 暂不删除              |
| 删除原文件            | 不立即删，移入 trash  |
| 删除失败              | 必须记录错误          |
| 无恢复                | 增加 restore_document |

**理由：**用户上传的是学习资产，不是临时缓存。宁可占空间，也不能误删。

---

# P1：下一批必须修

## 6. 前端 mock fallback 会掩盖真实 Tauri 错误

当前 `services/gateway/index.ts` 在非 Tauri 环境下会直接返回 mock response。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src/services/gateway/index.ts "XueJian/xuejian/src/services/gateway/index.ts at master · Dh-atomheart/XueJian · GitHub"))

这会造成：

```text
Web dev 正常
Tauri 真机失败
测试误判
IPC 契约漂移
```

**必须修：**

mock 只允许显式开启。

```text
VITE_USE_MOCK_GATEWAY=true 时才允许 mock
默认环境直接抛 TAURI_UNAVAILABLE
```

**整改标准：**

| 环境             | 行为           |
| ---------------- | -------------- |
| tauri dev        | 调真实 IPC     |
| vite dev 默认    | 报错           |
| vite --mode mock | 返回 mock      |
| test             | 按测试配置决定 |

---

## 7. Python 依赖把主应用、Podcast、APKG、TTS、Google Provider 混在一起

当前 `requirements.txt` 同时包含 LangChain、OpenAI、Anthropic、Google、LiteLLM、PydanticAI、Docling、PyMuPDF、genanki、edge-tts、pydub、ElevenLabs、Fish Audio 等。([GitHub](https://raw.githubusercontent.com/Dh-atomheart/XueJian/master/xuejian/orchestration_service/requirements.txt "raw.githubusercontent.com"))

这会导致：

```text
安装慢
启动检查复杂
打包困难
用户环境失败率高
主应用被 Podcast/TTS 依赖污染
```

**必须修：**

拆分依赖。

| 依赖组             | 内容                                           |
| ------------------ | ---------------------------------------------- |
| core               | FastAPI / Pydantic / httpx / Docling / PyMuPDF |
| agent              | LangChain / LangGraph / OpenAI / Anthropic     |
| optional-podcast   | edge-tts / pydub / elevenlabs / fish-audio-sdk |
| optional-apkg      | genanki                                        |
| optional-google    | google-genai / langchain-google-genai          |
| optional-animation | manim / MCP 相关                               |

**当前阶段：**

主应用只安装：

```text
core
agent
```

不安装：

```text
optional-podcast
optional-animation
optional-apkg
optional-google
```

---

## 8. README 和架构文档已经与真实产品方向冲突

当前 README 仍把“知识问答/图谱”和“播客生成”写成主闭环。([GitHub](https://raw.githubusercontent.com/Dh-atomheart/XueJian/master/README.md "raw.githubusercontent.com"))  
你上传的架构文档也仍然把 Podcast、Animation、APKG、TTS provider 放在主架构图和 Python Service 里。

**必须修：**

所有文档统一为：

```text
主应用：
PDF -> Agent 卡片 -> 页边贴笺 -> FSRS 复习 -> RAG 问答 -> 统计

暂停：
Animation

插件/独立应用：
Podcast
Animation Visual Explainer

删除：
Knowledge Graph
APKG 高级导入导出
```

**优先改这些文档：**

| 文档                                | 动作                               |
| ----------------------------------- | ---------------------------------- |
| README.md                           | 重写主链路                         |
| current-project-architecture.md     | 移除 Podcast/Animation 主流程      |
| docs/podcast-generation-workflow.md | 改成 plugin proposal               |
| docs/card-system-v2.md              | 聚焦 title/front/back/source/group |
| docs/byok-system.md                 | 收敛 Provider                      |
| docs/knowledge-graph-system.md      | 删除或归档                         |

---

## 9. 核心卡片模型还不够支撑“贴笺式学习”

你的产品核心不是“生成卡片”，而是：

```text
卡片贴在 PDF 对应页边
卡片能回溯到来源页码和原文
相似卡片成组
多个组由用户组合成簇
```

当前架构文档提到了 sections、chunks、anchors、cards，但没有把“卡片-页面-高亮-分组-簇”定义成主数据模型。

**必须补齐：**

| 表 / 模型       | 用途                                          |
| --------------- | --------------------------------------------- |
| card_sources    | 卡片来源：document、page、anchor、source_text |
| card_page_links | 当前页应该显示哪些卡片                        |
| card_groups     | 相似卡片组                                    |
| card_clusters   | 用户手动组合的组簇                            |
| card_highlights | 卡片对应的高亮颜色和区域                      |
| card.title      | 卡片标题                                      |

**优先级：**

```text
card_sources > card_page_links > card_groups > card_clusters
```

**理由：**没有这些，Reader 右侧贴笺功能只能做成 UI 假象，无法成为稳定产品能力。

---

## 10. 主 smoke test 覆盖范围过宽

当前 native smoke 里能看到 orchestration start、knowledge QA、podcast 等流程痕迹。([GitHub](https://github.com/Dh-atomheart/XueJian/blob/master/xuejian/src-tauri/src/lib.rs "XueJian/xuejian/src-tauri/src/lib.rs at master · Dh-atomheart/XueJian · GitHub"))

现在你要暂停 Podcast 和 Animation，主 smoke 就不应该继续覆盖它们。

**必须修：**

主 smoke 只测：

```text
app boot
db init
import PDF/fixture document
parse document
create card
link card to page
review card
query study stats
```

移出：

```text
podcast
animation
apkg
external TTS
复杂 provider discovery
```

---
