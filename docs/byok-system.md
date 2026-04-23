# BYOK 系统主规范

## 1. 文档定位与冲突规则

### 1.1 文档角色

本文档是雪见仓库中 BYOK 系统的主规范。这里的 BYOK 明确指 **Bring Your Own Provider Credentials**，即用户自带模型服务商凭据并在本地宿主中完成配置、校验、路由与治理；**不**指云厂商语境中的 CMEK / KMS / Customer-Managed Encryption Keys。

本文档用于驱动以下实现与评审工作：

- 本地模型凭据管理
- Provider / protocol / auth 设计
- 工作流到模型配置的分配
- 连接校验、模型发现、能力校验
- 预算统计与最小审计
- legacy `aiConfig` 迁移

### 1.2 适用范围

本文档覆盖：

- `api_configs`
- workflow assignments
- `EmbeddingProfile`
- SecretStore / Stronghold 密钥落点
- BYOK 设置页与相关宿主命令
- 连接测试与模型发现命令

本文档不覆盖：

- 卡片系统业务规则
- 播客业务编排细节
- 知识图谱业务语义
- 通用云端 IAM / RBAC 架构
- 企业级多租户密钥托管方案

### 1.3 与其他文档的关系

- 若其他文档涉及 BYOK 的边界、状态、字段含义、工作流分配、密钥存储，以本文档为准。
- 若实现代码与旧文档冲突，以当前代码真相为基线，并在本文档的“当前实现差距与修复优先级”中记录。
- 若评审或测试口径与本文档冲突，应修订评审口径，而不是让文档继续跟随过时约定漂移。

## 2. 术语与代码映射

### 2.1 术语定义

- `provider family`
  - 对外服务商家族或协议来源，例如 `openai`、`anthropic`、`google`、`deepseek`。
- `protocol adapter`
  - 当前宿主用于调用接口的协议适配层，例如 OpenAI-compatible、Anthropic-compatible、Google Generative Language-compatible。
- `auth mode`
  - 凭据使用方式。当前规范概念上允许 `api_key`、`adc` 等；当前真正可用的 GA 模式仅为 `api_key`。
- `api config`
  - 一个可被工作流引用的生成式模型配置，包含 provider、protocol、auth mode、base URL、默认 model、预算上限、启用状态、验证状态等元数据。
- `workflow assignment`
  - 某个工作流到某个 `api config` 的绑定关系。
- `embedding profile`
  - 向量嵌入专用配置，独立于 generative workflow assignment，包含 provider、model、dimensions、distance metric、revision 等。
- `credential validation`
  - 验证凭据是否可被 provider 接受。
- `model discovery`
  - 通过 provider 元数据接口获取模型列表。
- `capability validation`
  - 针对某一项能力做额外探测，例如视觉、JSON 输出、函数调用或特定模型可调用性。

### 2.2 概念与当前代码字段映射

| 规范概念 | 当前代码 / 类型 | 说明 |
| --- | --- | --- |
| provider family | `ApiConfig.provider` | 当前字段既承载 provider 家族，也包含 `custom_*` 协议适配器实例标识，因此不能把它直接等同于纯概念层 provider family。 |
| protocol adapter | `ApiConfig.protocol` | 当前值体现为 `native` 或 `openai-compatible` 等输入/落库字段，用于表达接口协议类型。 |
| auth mode | `ApiConfig.authMode` | 当前 UI / 类型层已经暴露 `api_key` 与 `adc`。宿主端只有 `api_key` 可实际完成校验与运行。 |
| api config | `ApiConfig` | 生成式调用的主配置对象。 |
| workflow assignment | `WorkflowType` + workflow assignment commands | 当前按工作流类型单独分配到 `api_config_id`。 |
| embedding profile | `EmbeddingProfile` | 独立表意，非 workflow assignment 的别名。 |
| credential state | `ApiConfig.keyStatus`, `ApiConfig.keyVerifiedAt`, `hasStoredKey` | 当前已经有状态与最近验证时间字段。 |

### 2.3 当前公开接口映射

| 规范能力 | 当前接口 |
| --- | --- |
| 读取 / 创建 / 更新 API 配置 | `apiConfigGateway` |
| 存储 API key | `apiConfigGateway.storeApiKey` |
| 删除 API key | `apiConfigGateway.deleteApiKey` |
| 测试连接 | `test_api_connection` / `apiConfigGateway.testConnection` |
| 拉取模型列表 | `fetch_provider_models` / `apiConfigGateway.fetchProviderModels` |
| 设置单个工作流分配 | `set_workflow_assignment` |
| 批量设置工作流分配 | `set_all_workflow_assignments` |
| 记录预算消耗 | `record_workflow_cost` |
| 嵌入配置管理 | `embeddingProfileGateway` |

### 2.4 目标接口拆分方向

当前接口仍把多类职责耦合在单个命令内。后续优先拆分方向如下，但本轮仅作为目标设计，不宣称已实现：

- `validate_credentials`
- `discover_models`
- `probe_capabilities`

## 3. 系统目标与非目标

### 3.1 目标

BYOK 系统的目标是：

- 让用户在本地宿主中安全保存 provider 凭据
- 让生成式工作流显式绑定到某个可审计的 API 配置
- 让 embedding 能力独立配置并管理向量索引兼容性
- 在不泄露明文密钥的前提下提供连接测试、模型发现与状态反馈
- 提供最低限度预算治理与使用归因
- 支持从 legacy `aiConfig` 启动迁移到新配置体系
- 为上层页面提供“能力启用状态”，而不是页面访问门禁

与页面交互相关的统一规则：

- `页面访问权限` 与 `AI 能力可执行性` 必须分离描述。
- `no_ai_config` 表示 AI 能力未启用，不等于页面不可进入。
- `workflow_unassigned` 表示部分 AI 工作流未就绪，不等于整站不可用。
- `service_unavailable` 表示服务异常，应显示告警与重试，不自动改写导航。
- 任意“前往设置”CTA 都是可选引导，不是改写导航的全局 guard。

### 3.2 非目标

以下内容不是 BYOK 主规范目标：

- 定义卡片系统、播客系统、知识图谱系统的业务行为
- 设计完整云端 IAM、组织级 RBAC、审计平台
- 承诺所有 provider 都具备统一能力模型
- 承诺所有 auth mode 都已完成宿主端实现
- 承诺所有 provider 都已具备自动模型发现与能力探测

## 4. 当前基线快照

本节描述的是 **2026-04-23** 仓库当前可观察到的实现真相，不等于推荐目标。

### 4.1 已存在的核心对象

- `api_configs` 已存在，承载 provider、protocol、auth mode、base URL、默认 model、budget limit、默认配置、启用状态、`key_status`、`key_verified_at` 等元数据。
- workflow assignments 已存在，Rust 宿主通过统一命令管理生成式工作流到 `api_config_id` 的绑定。
- `EmbeddingProfile` 已存在，且与生成式工作流分配分离。
- provider budget usage 已存在，当前以 `api_config_id` + period 记账。

### 4.2 已存在的宿主安全存储

- 当前仓库已接入 Tauri Stronghold。
- `xuejian/src-tauri/Cargo.toml` 已包含 `tauri-plugin-stronghold = "2"` 与 `iota_stronghold = "2.1.0"`。
- 当前正式密钥落点在 Rust SecretStore / Stronghold，而非前端长期持久化。

### 4.3 当前统一工作流集合

Rust 当前统一分配集合为：

- `card_generation`
- `document_embedding`
- `knowledge_qa`
- `podcast_generation`
- `knowledge_graph`
- `card_animation`
`card_animation` is now part of the Rust unified workflow assignment set and is backfilled by migration plus `set_all_workflow_assignments`.

### 4.4 当前 provider 兼容归一化

Rust 当前会将以下输入兼容别名统一归一化为 `custom_openai`：

- `openai_compatible`
- `custom`
- `qianfan`

这说明 `openai_compatible` 在当前系统中更接近历史输入兼容层，而不是未来规范主语。

### 4.5 当前连接测试与模型发现行为

当前宿主行为如下：

- OpenAI / DeepSeek / `custom_openai`
  - 连接测试：`GET /models`
  - 模型发现：`GET /models`
- Anthropic / `custom_anthropic`
  - ?????????? `GET /v1/models`??? `x-api-key` ? `anthropic-version`
  - ?????????? `GET /v1/models`
- Google / `custom_google`
  - 连接测试：当前走 `GET /models?key=...`
  - 模型发现：当前走 `GET /models?key=...`
- `authMode=adc`
  - UI / ??????
  - Rust ????? Google ADC ?????????????? `GOOGLE_APPLICATION_CREDENTIALS`????????? ADC ??
  - ????????????? GA ?????????????????????????????

### 4.6 当前 legacy 迁移行为

前端启动时会尝试迁移 legacy `aiConfig`：

- legacy 存储源：`localStorage['xuejian-app-store']`
- 迁移标记：`xuejian-byok-migrated`
- 若新 `api_configs` 已存在，则 legacy 配置只执行 retirement / 清理，不重复创建
- 若迁移成功，会创建新配置、存储 API key，并对 Rust 当前统一工作流集合执行 `set_all_workflow_assignments`
- 迁移失败不会阻塞启动，但会向用户反馈错误

## 5. 信任边界与安全原则

本节定义规范层规则。除非另有明确说明，以下规则默认适用于所有 provider。

### 5.1 信任边界

- 前端表单层属于短暂输入边界，不是密钥的正式持久化边界。
- Tauri IPC 是前后端通信边界，不得用来把明文密钥回传给前端展示。
- Rust SecretStore / Stronghold 是当前唯一正式密钥持久化边界。
- SQLite / 应用数据库可持久化配置元数据，但不是密钥本体落点。

### 5.2 MUST 级别规则

- API key 只能在前端输入流程中短暂驻留，不能写入前端持久化状态作为长期来源。
- 持久化密钥的唯一正式落点必须是 Rust SecretStore / Stronghold。
- 前端不得通过 IPC 读取明文 API key。
- `localStorage` 中的 legacy `aiConfig` 只允许作为一次性迁移源，迁移完成后必须清空。
- 数据库只允许持久化以下元数据：provider、protocol、auth mode、display name、base URL、默认 model、budget limit、key status、verified time、created at、assignment、budget usage。
- 连接测试、模型发现、能力探测命令不得把原始密钥写入日志、错误消息或前端调试输出。

### 5.3 SHOULD 级别规则

- 连接测试应优先使用 provider 的 metadata endpoint，而不是默认发送最小生成请求。
- 推荐在 provider 支持时使用受限权限、可审计、可单独轮换的凭据。
- 推荐将预算、最后验证时间、工作流绑定情况暴露为只读审计信息。
- 推荐对失败测试结果区分为认证失败、网络失败、协议不兼容、模型不存在四类。

## 6. 密钥生命周期与 SecretStore 规范

### 6.1 规范状态机

`credential state` 规范定义为：

- `none`
  - 未存储任何有效凭据
- `stored`
  - 已存储凭据，但尚未完成成功验证，或验证信息未知
- `verified`
  - 最近一次凭据验证成功
- `invalid`
  - 最近一次校验明确失败，例如 key 被拒绝、权限不足、签名不合法
- `expired`
  - 凭据本身失效、被撤销，或宿主明确可判定其不可继续使用

### 6.2 与当前实现的关系

- 当前仓库已经有 `key_status` 与 `key_verified_at` 字段，因此文档中的生命周期不是凭空新造。
- “轮换提醒”不应建模为新的持久化状态；它属于基于 `verified_at`、预算或运维策略推导出的提示。

### 6.3 SecretStore 规范

- 存储密钥时必须只向宿主发送一次明文输入，并立即交给 SecretStore / Stronghold。
- 列表接口返回的 `ApiConfigDto` 只能带 `hasStoredCredential`、`hasStoredKey`、`keyStatus`、`keyVerifiedAt` 等只读元数据。
- `from_config_without_key` 这类 DTO 变换必须继续保证前端无法读回明文 key。

## 7. Provider / Protocol / Auth 设计矩阵

### 7.1 设计原则

- `provider family` 用来表达用户理解的服务来源。
- `protocol adapter` 用来表达宿主如何与该服务通信。
- `custom_*` 应视为协议兼容适配器，而不是“不确定的自定义厂商”。
- 历史别名如 `openai_compatible` 仅作为输入兼容层保留，不再作为规范主语。

### 7.2 Provider 设计矩阵

| Provider | 官方协议 / 兼容协议 | 当前支持 auth mode | 模型发现方式 | 连接校验方式 | 默认 base URL 策略 | 生产建议 |
| --- | --- | --- | --- | --- | --- | --- |
| `openai` | OpenAI 官方 API | `api_key` | `GET /models` | `GET /models` | 默认 `https://api.openai.com/v1` | 使用独立 key、避免前端暴露、优先固定到稳定模型快照或明确模型标识。 |
| `anthropic` | Anthropic 官方 API | `api_key` | 官方 `GET /v1/models` | 推荐 `GET /v1/models`；必要时再做 capability probe | 默认 `https://api.anthropic.com/v1` | 不再把“最小生成请求”作为默认连通性测试；请求需带 `x-api-key` 与 `anthropic-version`。 |
| `google` | Google Generative Language API | `api_key` 为当前 GA；`adc` 为预留 | `GET /v1beta/models` | 推荐 metadata 校验；必要时再做能力探测 | 默认 `https://generativelanguage.googleapis.com/v1beta` | API key 与 ADC 是两套不同认证语义。长期推荐 header / 官方 client library / key restrictions；当前 query param 仅视为实现现状。 |
| `deepseek` | OpenAI-compatible | `api_key` | `GET /models` | `GET /models` | 默认 `https://api.deepseek.com/v1` | 作为 OpenAI 协议家族处理，但仍保留单独 provider family 以表达默认 base URL 与推荐模型。 |
| `custom_openai` | OpenAI-compatible adapter | `api_key` | 优先 `GET /models` | 优先 `GET /models` | 必须显式提供 base URL | 面向私有网关、代理、兼容服务；兼容失败应归因为协议不兼容，而非 provider 不存在。 |
| `custom_anthropic` | Anthropic-compatible adapter | `api_key` | 优先 `GET /v1/models`，无该接口时退化 | 优先 metadata endpoint；缺失时才使用 capability probe | 必须显式提供 base URL | 兼容层不应默认假设官方接口全部存在，应允许以 fallback 方式校验。 |
| `custom_google` | Google-compatible adapter | `api_key` | 优先 `GET /v1beta/models` | 优先 metadata endpoint | 必须显式提供 base URL | 适用于兼容 Google Generative Language 协议的私有网关。 |

### 7.3 关于 auth mode

- `api_key`
  - 当前唯一真正可用于创建、存储、连接测试与运行时调用的 GA 方案。
- `adc`
  - 当前只处于类型 / UI / 契约暴露状态。
  - 文档必须按“预留 / 未 GA”处理。
  - 只有在宿主完成 ADC 发现、校验、错误分类、运行时凭据读取后，才可升级为正式支持。

## 8. 工作流分配与 EmbeddingProfile 边界

### 8.1 当前工作流路由模型

当前统一分配模型以 Rust `WORKFLOW_TYPES` 为准：

- `card_generation`
- `document_embedding`
- `knowledge_qa`
- `podcast_generation`
- `knowledge_graph`

每个生成式工作流都可以绑定到某个 `api_config_id`。该绑定关系属于可持久化配置，不应隐含依赖“默认 provider”或“最后一次测试成功的 provider”。

### 8.2 `card_animation` 的当前定位

- Python 侧可能已经存在按 workflow 取配置的痕迹。
- 但当前它不在 Rust 统一工作流分配集合中。
- 因此它属于“实现边界未完全收敛的扩展项”，不能写成主体系已完成能力。

### 8.3 为什么 `EmbeddingProfile` 仍独立存在

`EmbeddingProfile` 不能简单等同于一个普通 generative workflow assignment，原因包括：

- 它需要 `dimensions`
- 它需要 `distance metric`
- 它有 `revision`
- 它会直接影响向量索引兼容性、失效与重建代价
- 它与生成式模型切换的运维成本不同

### 8.4 未来统一的准入条件

若未来要把 embedding 与 workflow assignment 进一步统一，至少满足以下条件：

- 统一对象可表达 dimensions / metric / revision
- 向量索引重建与兼容性影响可被显式建模
- UI 与宿主命令不会因为统一而隐藏这些高成本变更
- 生成式模型切换与 embedding 变更仍能被单独审计

在达到这些条件前，`EmbeddingProfile` 保持独立是正确基线。

## 9. 连接校验、模型发现与能力校验

### 9.1 三类动作必须分开

BYOK 文档必须区分以下三类动作，不能再混写：

- `credential validation`
  - 验证凭据是否被 provider 接受
- `model discovery`
  - 枚举 provider 当前可见模型
- `capability validation`
  - 验证某个具体模型是否满足特定能力

### 9.2 推荐连接校验策略

- OpenAI / DeepSeek / OpenAI-compatible
  - 默认使用 `GET /models`
- Anthropic
  - 默认使用 `GET /v1/models`，并带 `anthropic-version`
  - 仅在需要验证具体消息能力或兼容 endpoint 缺失时才退化为最小 generation probe
- Gemini / Google-compatible
  - 默认使用 `GET /v1beta/models`
  - API key 推荐通过 header 或官方 client library 管理；当前 query param 属于现状兼容实现

### 9.3 模型发现与推荐模型策略

系统需要区分三类模型来源：

- `preset models`
  - 由产品内置的推荐清单提供，用于首屏体验、空状态引导和断网回退
- `fetched models`
  - 从 provider 元数据接口获取，代表当前账号 / endpoint 可见集合
- `recommended models`
  - 在 `preset` 或 `fetched` 中被产品标记为推荐的模型

规范要求：

- 生产环境推荐 pin 到稳定模型快照或显式模型标识。
- 不应长期依赖 `latest`、模糊别名或无法审计的自动漂移别名。
- 若 provider 返回的能力信息不完整，前端可显示“推断能力”，但必须在文档中标明其不是 provider 原生承诺。

### 9.4 当前实现与推荐口径差异

- Anthropic 官方已有 `GET /v1/models`，因此“Anthropic 无 lightweight metadata endpoint”的旧说法已失效。
- “最小生成请求”不应再作为默认连接测试。
- capability probe 只应用于：
  - provider 没有元数据接口
  - 需要验证某项能力
  - custom adapter 明确不实现模型枚举

## 10. 预算治理、审计与可观测性

### 10.1 当前基线

当前仓库已经支持：

- 按 `api_config_id` + period 读取预算使用量
- 通过 `record_workflow_cost` 记录估算成本
- 配置级 `budget_limit`

### 10.2 规范定义

建议将预算治理术语固定为：

- `period`
  - 统计周期。当前推荐使用月度周期。
- `soft limit`
  - 达到阈值后提示，但不强制阻断。
- `warning`
  - 接近或超过软限额时向用户展示的提醒。
- `reset`
  - 重置指定周期统计值。
- `per-workflow attribution`
  - 某次成本记录可以归因到具体 workflow，而不仅仅是 provider config。

### 10.3 当前最小审计要求

系统至少应能回答以下问题：

- 谁创建或更新了某个 config
- 某个 config 何时验证成功
- 某个 config 预算何时累计增长
- 哪个 workflow 当前绑定到哪个 config

当前仓库已经具备其中部分能力，但“谁创建 / 更新”仍偏向本地单用户场景，可先以本地事件记录或更新时间补足，而不是伪装成完整审计平台。

### 10.4 非当前已实现项

以下能力可作为扩展，但不得写成当前已完成：

- 硬性熔断
- 多维度预算策略
- 组织级审计归因
- 自动化轮换策略执行

## 11. legacy `aiConfig` 迁移规范

### 11.1 迁移目标

迁移的目标是把旧前端本地配置升级为新 BYOK 主模型，而不是长期并存两套系统。

### 11.2 迁移规则

- 启动时可检测 legacy `aiConfig`
- 若新 `api_configs` 已存在，则 legacy 配置只执行 retirement，不重复创建新配置
- 若不存在新配置且 legacy 数据可解析，则：
  - 创建新的 `ApiConfig`
  - 把 API key 写入 SecretStore / Stronghold
  - 将 Rust 当前统一工作流集合指向该配置
- 迁移失败不阻塞启动，但必须提示用户
- 迁移成功或 retirement 完成后，必须清理 legacy 存储与迁移 flag 语义保持一致

### 11.3 兼容别名处理

- legacy `openai_compatible`
  - 应归一化为 `custom_openai`
- 兼容层目标是保证迁移成功，而不是把旧术语继续升级为规范主语

## 12. 当前实现差距与修复优先级

本节只记录当前与推荐规范之间的真实差距，作为整改基线。

### 12.1 A 类：真实实现缺口
1. Google ?? `authMode=adc` ???????????? JSON ?????????????????????????? GA?
2. Google ?????????????? query param ? key????????? header / client-library ???

### 12.2 B ???? / ????

1. `custom_*` ????????????????? provider??????????????????????
2. ????????????????????? provider ???????????????

1. 旧文档中把 Anthropic 描述为“无 lightweight metadata endpoint”，该说法已被官方文档推翻。
2. `custom_*` 在部分描述中仍被写成“自定义 provider”，弱化了其本质上是协议兼容适配器这一事实。
3. `openai_compatible` 在概念层被过度放大，实际应退回为输入兼容别名。
4. 模型能力字段中有一部分属于产品推断值，而非 provider 原生返回值；文档必须显式区分。

### 12.3 C ????????

1. `openai_compatible` ??? legacy ????????????????????????????
2. Google ???????? query param ? key???????????????????
3. ?? provider ????????????????????? provider ???????

### 12.4 ?????

????????

1. P0: ? Google ADC ?????????????????????? GA?
2. P1: ?? Google provider ? header / client-library ?????? query param ??????
3. P1: ???? `validate_credentials` / `discover_models` / `probe_capabilities` ??????
4. P2: ???? `openai_compatible` ? legacy ???????????????

## 13. 设计决策摘要

- BYOK 在本仓库中指 provider credentials 管理，不是云 KMS 语境。
- `api_configs` 是生成式模型主配置；`EmbeddingProfile` 保持独立。
- Stronghold 是当前正式密钥存储基线，不再泛泛表述为“安全存储”。
- 前端不能读取回明文 API key。
- 连接校验、模型发现、能力校验是三件不同的事情。
- Anthropic ???????????????????????????????
- Google ? `adc` ???????????????????? GA ?????
- `card_animation` ????? workflow assignment ???
- `custom_*` ???????`openai_compatible` ???????

## 14. 外部参考资料

以下仅列官方或权威来源，用于支撑本文档中的推荐做法：

- OpenAI Models API Reference
  - https://platform.openai.com/docs/api-reference/models/list
- OpenAI API key safety best practices
  - https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- OpenAI production best practices
  - https://platform.openai.com/docs/guides/production-best-practices
- Anthropic List Models
  - https://docs.claude.com/en/api/models-list
- Anthropic API reference / model retrieve
  - https://platform.claude.com/docs/en/api/models/retrieve
- Google Gemini Models REST API
  - https://ai.google.dev/api/rest/generativelanguage/models/list
- Google Application Default Credentials
  - https://cloud.google.com/docs/authentication/application-default-credentials
- Google API key guidance
  - https://docs.cloud.google.com/docs/authentication/api-keys
- Tauri Stronghold plugin reference
  - https://v2.tauri.app/reference/javascript/stronghold/
- OWASP Secrets Management Cheat Sheet
  - https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html

