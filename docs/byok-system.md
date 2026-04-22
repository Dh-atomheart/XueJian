# 学笺 BYOK（Bring Your Own Key）系统设计文档

> **版本**: v1.0  
> **日期**: 2026-04-22  
> **状态**: 设计阶段  
> **依据**: 9 轮深度访谈决策 + CherryStudio/RikkaHub 开源项目研究 + 现有代码库分析

---

## 目录

1. [概述](#1-概述)
2. [现有系统分析](#2-现有系统分析)
3. [供应商体系设计](#3-供应商体系设计)
4. [模型发现与选择](#4-模型发现与选择)
5. [工作流模型分配](#5-工作流模型分配)
6. [API Key 管理](#6-api-key-管理)
7. [连接测试](#7-连接测试)
8. [预算管理](#8-预算管理)
9. [数据模型](#9-数据模型)
10. [后端架构](#10-后端架构)
11. [前端架构](#11-前端架构)
12. [迁移策略](#12-迁移策略)
13. [实施路线图](#13-实施路线图)

---

## 1. 概述

### 1.1 系统目标

学笺 BYOK 系统旨在为用户提供一套完整的、高效的、对用户友好的 AI 模型密钥管理体验。核心目标：

- **多供应商统一管理**：预置 OpenAI / Anthropic / Google / DeepSeek 四大供应商，同时支持多协议自定义端点
- **智能模型发现**：预置已知热门模型 + 可选从服务器 API 拉取可用模型列表，用户无需手动输入模型 ID
- **按工作流独立配置**：五种工作流类型（卡片生成、文档嵌入、知识问答、播客生成、知识图谱）各自独立配置模型，互不干扰
- **安全密钥管理**：API Key 本地安全存储，智能识别供应商，格式校验，掩码展示，状态指示
- **预算管控**：按供应商设置预算上限，分级连接测试，轻量验证优先

### 1.2 设计哲学

| 原则 | 说明 |
|------|------|
| **本地优先** | API Key 仅存储在用户本地设备，绝不上传至任何服务器 |
| **渐进发现** | 预置已知模型降低入门门槛，API 拉取满足高级用户需求 |
| **分工明确** | 每种工作流独立配置模型，避免"一刀切"导致的成本/质量失衡 |
| **简洁克制** | 不引入过度复杂的功能（如 QR 码导入、用量追踪），聚焦核心体验 |
| **向后兼容** | 自动迁移旧 zustand 配置，Python 编排服务双模式运行 |

### 1.3 参考项目

| 项目 | 借鉴点 |
|------|--------|
| **CherryStudio** | 供应商类型选择（OpenAI/Gemini/Anthropic/Azure）、手动模型管理 + 可选拉取、连接测试按钮、启用/禁用开关 |
| **RikkaHub** | 预置供应商快速配置、自定义 base URL + headers、Material You 卡片式 UI、QR 码导入导出（本设计不采用） |

### 1.4 访谈决策汇总

| # | 主题 | 决策 |
|---|------|------|
| 1 | 系统范围 | 全面 BYOK 体系 + 完全替换 zustand localStorage aiConfig |
| 2 | 供应商体系 | 4 大预置（OpenAI/Anthropic/Google/DeepSeek）+ 多协议自定义 + 品牌图标 |
| 3 | 模型发现 | 手动+发现：预置已知热门模型 + 可选从服务器拉取；展示 ID + 能力标签 |
| 4 | 工作流分配 | 按工作流类型独立配置，5 种工作流各自必须有模型配置 |
| 5 | API Key 管理 | 前缀识别 + 格式校验 + 安全展示 + 状态指示；单 Key/供应商；工作流共享 Key |
| 6 | 测试与预算 | 分级测试（轻量验证 + 可选完整测试）；仅预算上限；按供应商统计 |
| 7 | UI/UX | 分区卡片式布局；不需要导入导出；直接展示空配置页 |
| 8 | 数据模型 | 新表 `workflow_model_assignments`；Rust 后端拉取模型；硬编码预置模型随版本更新 |
| 9 | 迁移兼容 | 首次启动自动迁移 zustand；新增 `get_config_for_workflow()`；EmbeddingProfile 保持独立 |

---

## 2. 现有系统分析

### 2.1 当前架构概览

学笺当前的 AI 模型配置系统存在**新旧两套并行**的问题：

```
┌─────────────────────────────────────────────────────────┐
│                    前端 (React/TS)                       │
│                                                         │
│  ┌──────────────────┐    ┌───────────────────────────┐  │
│  │  旧系统 (zustand)  │    │  新系统 (api_configs)      │  │
│  │  LocalAiConfig    │    │  useApiConfigsQuery()     │  │
│  │  localStorage     │    │  useCreateApiConfig...    │  │
│  │  单配置            │    │  useStoreApiKeyMutation   │  │
│  └──────────────────┘    └───────────────────────────┘  │
│           │                          │                   │
│           │ (SettingsPage 混用两者)    │                   │
│           ▼                          ▼                   │
│  ┌─────────────────────────────────────────────────────┐│
│  │              SettingsPage.tsx                        ││
│  │  - providers 硬编码 (openai/anthropic/compatible)   ││
│  │  - models 硬编码 (gpt-4, claude-3-opus 等过时列表)  ││
│  │  - 无 Google 供应商                                  ││
│  │  - 无工作流分配                                      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                         │
                    Tauri IPC
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                后端 (Rust/Tauri)                         │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ api_configs   │  │ SecretStore  │  │ AppSettings  │  │
│  │ SQLite 表     │  │ OS 密钥链    │  │ SQLite 表    │  │
│  │ 完整 CRUD     │  │ 安全存储     │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Host HTTP Gateway (localhost:port)                │   │
│  │ /model-gateway/configs                           │   │
│  │ /model-gateway/api-key/{id}                      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         │
                    HTTP (localhost)
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│            Python 编排服务                               │
│                                                         │
│  HostGatewayClient                                      │
│  - get_default_config_with_key()                        │
│  - get_config_with_key_by_provider()                   │
│  - build_langchain_chat_model(config, api_key)         │
│                                                         │
│  providers/runtime.py                                   │
│  - normalize_provider() → openai/anthropic/google/     │
│    openai_compatible                                    │
│  - default_model_for_provider()                         │
│  - resolve_model_runtime()                              │
└─────────────────────────────────────────────────────────┘
```

### 2.2 现有代码清单

#### 2.2.1 前端

| 文件 | 说明 | 问题 |
|------|------|------|
| `src/features/settings/SettingsPage.tsx` | 设置页主组件 | 混用 zustand aiConfig 和 api_configs；硬编码 3 供应商；硬编码过时模型列表；无 Google 供应商 |
| `src/lib/store.ts` | Zustand 全局状态 | `LocalAiConfig` 接口仅支持单配置；`aiConfig` 字段通过 localStorage persist 存储 |
| `src/services/gateway/models.ts` | API 配置网关 | 已有完整 CRUD + testConnection + storeApiKey + setDefault |
| `src/queries/apiConfigs.ts` | React Query hooks | 已有完整的 mutation/query hooks |
| `src/types/document.ts` | 类型定义 | `ApiConfig`、`ApiProvider`、`ApiAuthMode` 已定义 |
| `src/types/schema.ts` | Zod schemas | `apiConfigSchema`、`apiProviderSchema` 已定义 |

#### 2.2.2 后端 (Rust)

| 文件 | 说明 | 问题 |
|------|------|------|
| `src-tauri/src/commands/settings.rs` | IPC 命令 | 完整 CRUD + test_connection + store_api_key；test_connection 消耗 token（发送真实请求） |
| `src-tauri/src/db/settings_repo.rs` | 数据库仓库 | 完整 api_configs CRUD；normalize_provider 支持 4 种供应商 |
| `src-tauri/src/secrets/mod.rs` | 密钥存储 | OS 密钥链安全存储（gitignored） |
| `src-tauri/src/app_state.rs` | 应用状态 | AppState 包含 db + secrets + orchestration |
| `src-tauri/src/gateway/host_http.rs` | HTTP 网关 | 暴露 configs + api-key 端点给 Python 编排服务 |

#### 2.2.3 Python 编排服务

| 文件 | 说明 | 问题 |
|------|------|------|
| `orchestration_service/clients/host_gateway.py` | 宿主网关客户端 | `get_default_config_with_key()` 仅按默认/启用状态查找；无按工作流查找 |
| `orchestration_service/providers/runtime.py` | 模型运行时 | `build_langchain_chat_model()` 支持 4 种供应商；所有工作流共用同一配置 |

### 2.3 核心问题清单

| # | 问题 | 影响 | 严重度 |
|---|------|------|--------|
| P1 | 前端双系统并存（zustand + api_configs） | 配置不一致、用户体验混乱 | 🔴 高 |
| P2 | 模型列表硬编码且过时 | 用户无法使用新模型（如 GPT-4o、Claude 3.5） | 🔴 高 |
| P3 | 无模型自动发现 | 用户必须手动输入模型 ID，易出错 | 🔴 高 |
| P4 | 无 Google 供应商 | Google Gemini 用户无法配置 | 🟡 中 |
| P5 | 无按工作流模型分配 | 所有工作流共用同一模型，成本/质量失衡 | 🔴 高 |
| P6 | 连接测试消耗 token | 每次 test 浪费真实 token | 🟡 中 |
| P7 | budgetLimit 字段未使用 | 预算管控形同虚设 | 🟡 中 |
| P8 | 无 API Key 状态指示 | 用户不知道 Key 是否有效/过期 | 🟡 中 |

---

## 3. 供应商体系设计

### 3.1 供应商分类

学笺 BYOK 系统将供应商分为两大类：

```
供应商体系
├── 预置供应商 (Preset Providers)
│   ├── OpenAI        — GPT 系列，标准 OpenAI API
│   ├── Anthropic     — Claude 系列，原生 Anthropic API
│   ├── Google        — Gemini 系列，Google AI API
│   └── DeepSeek      — DeepSeek 系列，OpenAI 兼容 API
│
└── 自定义供应商 (Custom Providers)
    ├── OpenAI 协议兼容   — 任意 OpenAI 兼容端点 (Ollama, vLLM, LM Studio...)
    ├── Anthropic 协议兼容 — Anthropic 兼容端点
    └── Google 协议兼容   — Gemini 兼容端点
```

### 3.2 供应商注册表

供应商注册表是一个 TypeScript 常量对象，定义每个供应商的元数据：

```typescript
// src/types/providers.ts

export type ProviderProtocol = 'openai' | 'anthropic' | 'google'
export type ProviderKind = 'preset' | 'custom'

export interface ProviderDefinition {
  /** 供应商唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 供应商分类 */
  kind: ProviderKind
  /** 通信协议 */
  protocol: ProviderProtocol
  /** 默认 Base URL（预置供应商有固定值） */
  defaultBaseUrl: string | null
  /** 是否需要 Base URL（自定义供应商必须填写） */
  requiresBaseUrl: boolean
  /** API Key 前缀模式（用于自动识别） */
  keyPrefixes: string[]
  /** API Key 格式校验正则 */
  keyPattern: RegExp | null
  /** 品牌图标标识 */
  iconKey: string
  /** 供应商描述 */
  description: string
  /** 预置模型列表 */
  presetModels: PresetModel[]
  /** 模型列表 API 端点（用于自动发现） */
  modelsEndpoint: string | null
  /** 连接测试策略 */
  testStrategy: 'lightweight' | 'full' | 'tiered'
  /** 轻量测试端点 */
  lightweightTestEndpoint: string | null
}

export interface PresetModel {
  /** 模型 ID */
  id: string
  /** 显示名称 */
  displayName: string
  /** 能力标签 */
  capabilities: ModelCapabilities
  /** 是否为推荐默认模型 */
  isRecommended?: boolean
}

export interface ModelCapabilities {
  /** 支持视觉输入 */
  vision: boolean
  /** 支持函数调用 */
  functionCalling: boolean
  /** 最大上下文长度（token 数） */
  maxContext: number
  /** 支持流式输出 */
  streaming: boolean
  /** 支持 JSON 模式 */
  jsonMode: boolean
}
```

### 3.3 预置供应商定义

#### 3.3.1 OpenAI

```typescript
const openaiProvider: ProviderDefinition = {
  id: 'openai',
  name: 'OpenAI',
  kind: 'preset',
  protocol: 'openai',
  defaultBaseUrl: 'https://api.openai.com/v1',
  requiresBaseUrl: false,
  keyPrefixes: ['sk-'],
  keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
  iconKey: 'openai',
  description: 'GPT-4o、GPT-4o-mini、o1 等模型',
  presetModels: [
    {
      id: 'gpt-4o',
      displayName: 'GPT-4o',
      capabilities: { vision: true, functionCalling: true, maxContext: 128000, streaming: true, jsonMode: true },
      isRecommended: true,
    },
    {
      id: 'gpt-4o-mini',
      displayName: 'GPT-4o Mini',
      capabilities: { vision: true, functionCalling: true, maxContext: 128000, streaming: true, jsonMode: true },
    },
    {
      id: 'o1',
      displayName: 'o1',
      capabilities: { vision: true, functionCalling: false, maxContext: 200000, streaming: true, jsonMode: false },
    },
    {
      id: 'o1-mini',
      displayName: 'o1 Mini',
      capabilities: { vision: false, functionCalling: false, maxContext: 128000, streaming: true, jsonMode: false },
    },
    {
      id: 'o3-mini',
      displayName: 'o3 Mini',
      capabilities: { vision: false, functionCalling: true, maxContext: 200000, streaming: true, jsonMode: true },
    },
    {
      id: 'gpt-4.1',
      displayName: 'GPT-4.1',
      capabilities: { vision: true, functionCalling: true, maxContext: 1047576, streaming: true, jsonMode: true },
    },
    {
      id: 'gpt-4.1-mini',
      displayName: 'GPT-4.1 Mini',
      capabilities: { vision: true, functionCalling: true, maxContext: 1047576, streaming: true, jsonMode: true },
    },
    {
      id: 'gpt-4.1-nano',
      displayName: 'GPT-4.1 Nano',
      capabilities: { vision: true, functionCalling: true, maxContext: 1047576, streaming: true, jsonMode: true },
    },
  ],
  modelsEndpoint: '/models',       // 相对于 base_url: GET {base_url}/models
  testStrategy: 'tiered',
  lightweightTestEndpoint: '/models', // GET 请求，不消耗 token
}
```

#### 3.3.2 Anthropic

```typescript
const anthropicProvider: ProviderDefinition = {
  id: 'anthropic',
  name: 'Anthropic',
  kind: 'preset',
  protocol: 'anthropic',
  defaultBaseUrl: 'https://api.anthropic.com',
  requiresBaseUrl: false,
  keyPrefixes: ['sk-ant-'],
  keyPattern: /^sk-ant-api03-[A-Za-z0-9_-]{20,}$/,
  iconKey: 'anthropic',
  description: 'Claude 3.5/4 系列模型',
  presetModels: [
    {
      id: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet 4',
      capabilities: { vision: true, functionCalling: true, maxContext: 200000, streaming: true, jsonMode: true },
      isRecommended: true,
    },
    {
      id: 'claude-opus-4-20250514',
      displayName: 'Claude Opus 4',
      capabilities: { vision: true, functionCalling: true, maxContext: 200000, streaming: true, jsonMode: true },
    },
    {
      id: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      capabilities: { vision: true, functionCalling: true, maxContext: 200000, streaming: true, jsonMode: true },
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet',
      capabilities: { vision: true, functionCalling: true, maxContext: 200000, streaming: true, jsonMode: true },
    },
  ],
  modelsEndpoint: null, // Anthropic 无公开模型列表 API
  testStrategy: 'tiered',
  lightweightTestEndpoint: null, // Anthropic 无轻量测试端点，需完整测试
}
```

#### 3.3.3 Google

```typescript
const googleProvider: ProviderDefinition = {
  id: 'google',
  name: 'Google',
  kind: 'preset',
  protocol: 'google',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  requiresBaseUrl: false,
  keyPrefixes: ['AIza'],
  keyPattern: /^AIza[A-Za-z0-9_-]{30,}$/,
  iconKey: 'google',
  description: 'Gemini 系列模型',
  presetModels: [
    {
      id: 'gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      capabilities: { vision: true, functionCalling: true, maxContext: 1048576, streaming: true, jsonMode: true },
      isRecommended: true,
    },
    {
      id: 'gemini-2.5-pro',
      displayName: 'Gemini 2.5 Pro',
      capabilities: { vision: true, functionCalling: true, maxContext: 1048576, streaming: true, jsonMode: true },
    },
    {
      id: 'gemini-2.0-flash',
      displayName: 'Gemini 2.0 Flash',
      capabilities: { vision: true, functionCalling: true, maxContext: 1048576, streaming: true, jsonMode: true },
    },
    {
      id: 'gemini-2.0-flash-lite',
      displayName: 'Gemini 2.0 Flash Lite',
      capabilities: { vision: true, functionCalling: false, maxContext: 1048576, streaming: true, jsonMode: false },
    },
  ],
  modelsEndpoint: '/models', // GET {base_url}/models?key={api_key}
  testStrategy: 'tiered',
  lightweightTestEndpoint: '/models',
}
```

#### 3.3.4 DeepSeek

```typescript
const deepseekProvider: ProviderDefinition = {
  id: 'deepseek',
  name: 'DeepSeek',
  kind: 'preset',
  protocol: 'openai', // DeepSeek 使用 OpenAI 兼容协议
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  requiresBaseUrl: false,
  keyPrefixes: ['sk-'],
  keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
  iconKey: 'deepseek',
  description: 'DeepSeek-V3/R1 系列模型',
  presetModels: [
    {
      id: 'deepseek-chat',
      displayName: 'DeepSeek-V3',
      capabilities: { vision: false, functionCalling: true, maxContext: 65536, streaming: true, jsonMode: true },
      isRecommended: true,
    },
    {
      id: 'deepseek-reasoner',
      displayName: 'DeepSeek-R1',
      capabilities: { vision: false, functionCalling: false, maxContext: 65536, streaming: true, jsonMode: false },
    },
  ],
  modelsEndpoint: '/models',
  testStrategy: 'tiered',
  lightweightTestEndpoint: '/models',
}
```

### 3.4 自定义供应商模板

自定义供应商基于三种协议模板，用户选择协议后系统自动适配请求格式：

```typescript
const customProviderTemplates: ProviderDefinition[] = [
  {
    id: 'custom_openai',
    name: '自定义 (OpenAI 协议)',
    kind: 'custom',
    protocol: 'openai',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    iconKey: 'custom-openai',
    description: '兼容 OpenAI API 的服务（Ollama, vLLM, LM Studio, One API 等）',
    presetModels: [],
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
    lightweightTestEndpoint: '/models',
  },
  {
    id: 'custom_anthropic',
    name: '自定义 (Anthropic 协议)',
    kind: 'custom',
    protocol: 'anthropic',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    iconKey: 'custom-anthropic',
    description: '兼容 Anthropic API 的服务',
    presetModels: [],
    modelsEndpoint: null,
    testStrategy: 'tiered',
    lightweightTestEndpoint: null,
  },
  {
    id: 'custom_google',
    name: '自定义 (Google 协议)',
    kind: 'custom',
    protocol: 'google',
    defaultBaseUrl: null,
    requiresBaseUrl: true,
    keyPrefixes: [],
    keyPattern: null,
    iconKey: 'custom-google',
    description: '兼容 Google Gemini API 的服务（Vertex AI 等）',
    presetModels: [],
    modelsEndpoint: '/models',
    testStrategy: 'tiered',
    lightweightTestEndpoint: '/models',
  },
]
```

### 3.5 供应商品牌图标

品牌图标使用 SVG 内联组件，存放在 `src/components/icons/providers/` 目录：

| 图标 Key | 文件 | 说明 |
|----------|------|------|
| `openai` | `OpenAiIcon.tsx` | OpenAI 官方 Logo（简化版） |
| `anthropic` | `AnthropicIcon.tsx` | Anthropic 官方 Logo |
| `google` | `GoogleAiIcon.tsx` | Google AI / Gemini Logo |
| `deepseek` | `DeepSeekIcon.tsx` | DeepSeek Logo |
| `custom-openai` | `CustomOpenAiIcon.tsx` | 通用 OpenAI 兼容图标（插头+齿轮） |
| `custom-anthropic` | `CustomAnthropicIcon.tsx` | 通用 Anthropic 兼容图标 |
| `custom-google` | `CustomGoogleIcon.tsx` | 通用 Google 兼容图标 |

图标组件接口：

```typescript
interface ProviderIconProps {
  iconKey: string
  size?: number
  className?: string
}
```

### 3.6 供应商注册表实现

```typescript
// src/types/providers.ts

const PROVIDER_REGISTRY: Record<string, ProviderDefinition> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
  deepseek: deepseekProvider,
  custom_openai: customProviderTemplates[0],
  custom_anthropic: customProviderTemplates[1],
  custom_google: customProviderTemplates[2],
}

export function getProviderDefinition(providerId: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY[providerId]
}

export function getAllPresetProviders(): ProviderDefinition[] {
  return Object.values(PROVIDER_REGISTRY).filter(p => p.kind === 'preset')
}

export function getCustomProviderTemplates(): ProviderDefinition[] {
  return Object.values(PROVIDER_REGISTRY).filter(p => p.kind === 'custom')
}

/** 根据 API Key 前缀自动识别供应商 */
export function detectProviderFromKey(apiKey: string): string | null {
  for (const [id, def] of Object.entries(PROVIDER_REGISTRY)) {
    if (def.keyPrefixes.some(prefix => apiKey.startsWith(prefix))) {
      return id
    }
  }
  return null
}
```

### 3.7 供应商与现有 ApiConfig 的映射

现有 `ApiConfig.provider` 字段的值域为 `'openai' | 'anthropic' | 'google' | 'openai_compatible'`。新系统需要扩展此值域：

| 旧值 | 新值 | 说明 |
|------|------|------|
| `openai` | `openai` | 不变 |
| `anthropic` | `anthropic` | 不变 |
| `google` | `google` | 不变（当前 UI 未展示，后端已支持） |
| `openai_compatible` | `deepseek` / `custom_openai` / `custom_anthropic` / `custom_google` | 拆分为具体类型 |

**迁移策略**：旧的 `openai_compatible` 记录根据 `base_url` 和 `protocol` 字段判断归属：
- `base_url` 包含 `deepseek.com` → 迁移为 `deepseek`
- `protocol` = `anthropic` 或 base_url 包含 `anthropic` → 迁移为 `custom_anthropic`
- 其他 → 迁移为 `custom_openai`

### 3.8 Rust 侧供应商规范化

`settings_repo.rs` 中的 `normalize_provider()` 需要扩展：

```rust
fn normalize_provider(raw: String) -> String {
    let value = raw.trim().to_lowercase();
    match value.as_str() {
        "openai" | "anthropic" | "google" | "deepseek" => value,
        "custom_openai" | "custom_anthropic" | "custom_google" => value,
        // 向后兼容旧值
        "openai_compatible" | "custom" | "qianfan" => {
            log::warn!("Deprecated provider '{}' normalized to 'custom_openai'", value);
            "custom_openai".to_string()
        }
        _ => {
            log::warn!("Unknown provider '{}' defaulting to 'custom_openai'", value);
            "custom_openai".to_string()
        }
    }
}

fn normalize_protocol(provider: &str, raw_protocol: Option<String>) -> Option<String> {
    // 根据供应商自动推断协议
    match provider {
        "openai" | "deepseek" | "custom_openai" => Some("openai-compatible".to_string()),
        "anthropic" | "custom_anthropic" => Some("native".to_string()),
        "google" | "custom_google" => Some("native".to_string()),
        _ => raw_protocol,
    }
}
```

---

## 4. 模型发现与选择

### 4.1 设计概述

模型发现采用**手动 + 发现**双轨策略：

- **手动轨道**：供应商注册表中预置已知热门模型，用户可直接选择
- **发现轨道**：用户可点击"从服务器拉取模型"按钮，系统调用供应商的模型列表 API 获取可用模型

这种策略平衡了**新手友好性**（预置模型即开即用）和**高级用户需求**（拉取完整模型列表）。

### 4.2 模型发现流程

```
用户选择供应商
       │
       ▼
┌──────────────────┐
│ 展示预置模型列表   │  ← 来自 ProviderDefinition.presetModels
│ + "拉取更多模型"   │
└──────────────────┘
       │
       │ 用户点击"拉取更多模型"
       ▼
┌──────────────────────────────┐
│ 检查供应商是否有 modelsEndpoint │
│                              │
│  有 → 调用 fetch_provider_models │
│  无 → 提示"该供应商不支持自动发现" │
│       （如 Anthropic）         │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 合并预置模型 + 拉取模型    │
│ 去重（以 model id 为键）  │
│ 预置模型的能力标签优先     │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 展示完整模型列表           │
│ 每个模型显示：             │
│  - 模型 ID                │
│  - 显示名称               │
│  - 能力标签               │
└──────────────────────────┘
```

### 4.3 各供应商模型列表 API

#### 4.3.1 OpenAI

```
GET https://api.openai.com/v1/models
Authorization: Bearer sk-...

Response:
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1715367049,
      "owned_by": "system"
    },
    ...
  ]
}
```

**处理逻辑**：
- 提取 `data[].id` 作为模型 ID
- 过滤掉非聊天模型（如 `dall-e-*`, `whisper-*`, `tts-*`, `text-embedding-*`）
- 过滤掉已弃用模型（如 `gpt-3.5-turbo` 前缀中非 instruct 版本）
- 预置模型的能力标签覆盖 API 返回的推断标签

#### 4.3.2 Anthropic

Anthropic **无公开模型列表 API**。处理策略：
- 仅展示预置模型列表
- "拉取更多模型"按钮灰显，提示"Anthropic 不支持自动模型发现"
- 用户可手动输入模型 ID（自由文本）

#### 4.3.3 Google Gemini

```
GET https://generativelanguage.googleapis.com/v1beta/models?key=AIza...

Response:
{
  "models": [
    {
      "name": "models/gemini-2.5-flash",
      "displayName": "Gemini 2.5 Flash",
      "inputTokenLimit": 1048576,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": ["generateContent", ...]
    },
    ...
  ]
}
```

**处理逻辑**：
- 提取 `name` 字段，去掉 `models/` 前缀作为模型 ID
- 从 `inputTokenLimit` 推断 `maxContext`
- 从 `supportedGenerationMethods` 推断能力（含 `generateContent` → 支持聊天）
- 过滤掉嵌入专用模型（仅含 `embedContent` 方法）

#### 4.3.4 DeepSeek

```
GET https://api.deepseek.com/v1/models
Authorization: Bearer sk-...

Response: (OpenAI 兼容格式)
{
  "object": "list",
  "data": [
    { "id": "deepseek-chat", "object": "model", ... },
    { "id": "deepseek-reasoner", "object": "model", ... }
  ]
}
```

**处理逻辑**：与 OpenAI 相同，提取 `data[].id`。

#### 4.3.5 自定义供应商（OpenAI 协议兼容）

```
GET {base_url}/models
Authorization: Bearer {api_key}

Response: (OpenAI 兼容格式)
```

**处理逻辑**：与 OpenAI 相同。部分兼容服务可能不提供此端点，需优雅降级。

### 4.4 模型信息数据结构

```typescript
// src/types/providers.ts

export interface DiscoveredModel {
  /** 模型 ID（供应商原始值） */
  id: string
  /** 显示名称（优先使用预置值，否则用 ID） */
  displayName: string
  /** 来源：预置 or API 拉取 */
  source: 'preset' | 'fetched'
  /** 能力标签 */
  capabilities: ModelCapabilities
  /** 是否为预置推荐模型 */
  isRecommended: boolean
}

/** 从供应商 API 原始响应转换为 DiscoveredModel */
export interface FetchedModelRaw {
  id: string
  owned_by?: string
  created?: number
  // Google 特有字段
  name?: string
  displayName?: string
  inputTokenLimit?: number
  outputTokenLimit?: number
  supportedGenerationMethods?: string[]
}
```

### 4.5 模型选择器 UI

模型选择器组件 `ModelSelector` 的交互设计：

```
┌─────────────────────────────────────────┐
│ 模型                                     │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 搜索模型...                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ★ 推荐模型                              │
│ ┌─────────────────────────────────────┐ │
│ │ ● GPT-4o                            │ │
│ │   👁 视觉  🔧 函数调用  📏 128K      │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ○ GPT-4o Mini                       │ │
│ │   👁 视觉  🔧 函数调用  📏 128K      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 其他模型                                │
│ ┌─────────────────────────────────────┐ │
│ │ ○ o1                                │ │
│ │   👁 视觉  📏 200K                   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ○ o3-mini                           │ │
│ │   🔧 函数调用  📏 200K               │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔄 从服务器拉取更多模型              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ✏️ 手动输入模型 ID                   │ │
│ │ ┌─────────────────────────────────┐ │ │
│ │ │ my-custom-model                 │ │ │
│ │ └─────────────────────────────────┘ │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**能力标签图标**：

| 能力 | 图标 | 标签文本 |
|------|------|----------|
| vision | 👁 | 视觉 |
| functionCalling | 🔧 | 函数调用 |
| maxContext ≥ 100K | 📏 | `${maxContext/1000}K` |
| streaming | ⚡ | 流式 |
| jsonMode | `{ }` | JSON |

### 4.6 模型发现缓存

拉取的模型列表缓存在前端，避免重复请求：

```typescript
// 缓存策略
interface ModelFetchCache {
  /** 缓存键：provider_id + base_url (如有) */
  key: string
  /** 拉取到的模型列表 */
  models: DiscoveredModel[]
  /** 缓存时间 */
  fetchedAt: Date
  /** 缓存有效期（默认 30 分钟） */
  ttlMs: number
}

// 使用 React Query 管理缓存
const MODEL_FETCH_CACHE_KEY = ['providerModels', providerId, baseUrl]
const MODEL_FETCH_STALE_TIME = 30 * 60 * 1000 // 30 分钟
```

### 4.7 预置模型维护策略

预置模型清单硬编码在 TypeScript 代码中，随应用版本更新。维护原则：

1. **每个大版本更新时**刷新预置模型列表
2. **新增模型**：当供应商发布新模型时，在下个版本中加入
3. **弃用模型**：保留但标记为 `deprecated: true`，UI 上灰色展示
4. **推荐模型**：每个供应商仅标记 1 个 `isRecommended` 模型

```typescript
// 版本化预置模型
const PRESET_MODELS_VERSION = '2026.04' // 年.月 标识

interface PresetModel {
  // ... 原有字段
  /** 是否已弃用 */
  deprecated?: boolean
  /** 弃用说明 */
  deprecationNote?: string
}
```

---

## 5. 工作流模型分配

### 5.1 设计概述

学笺的 5 种工作流类型各自独立配置模型，**不存在全局默认配置**。每种工作流必须绑定一个 `api_config` 记录。

这种设计确保：
- **成本优化**：卡片生成可用 GPT-4o，知识问答可用 Haiku
- **质量匹配**：知识图谱构建需要高能力模型，嵌入仅需轻量模型
- **供应商分散**：不同工作流可使用不同供应商，降低单一供应商风险

### 5.2 工作流类型定义

```typescript
// src/types/workflow.ts

export type WorkflowType =
  | 'card_generation'      // 卡片生成
  | 'document_embedding'   // 文档嵌入
  | 'knowledge_qa'         // 知识问答
  | 'podcast_generation'   // 播客生成
  | 'knowledge_graph'      // 知识图谱构建

export interface WorkflowDefinition {
  type: WorkflowType
  name: string
  description: string
  iconKey: string
  /** 推荐的模型能力需求 */
  recommendedCapabilities: Partial<ModelCapabilities>
  /** 是否必须配置（所有工作流都必须） */
  required: true
}

export const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    type: 'card_generation',
    name: '卡片生成',
    description: '从文档内容生成学习卡片（QA、填空、事实等）',
    iconKey: 'cards',
    recommendedCapabilities: { functionCalling: true, maxContext: 32000 },
    required: true,
  },
  {
    type: 'document_embedding',
    name: '文档嵌入',
    description: '将文档内容向量化用于语义检索',
    iconKey: 'embedding',
    recommendedCapabilities: { maxContext: 8192 },
    required: true,
  },
  {
    type: 'knowledge_qa',
    name: '知识问答',
    description: '基于文档内容的 RAG 问答',
    iconKey: 'qa',
    recommendedCapabilities: { functionCalling: true, maxContext: 64000 },
    required: true,
  },
  {
    type: 'podcast_generation',
    name: '播客生成',
    description: '生成学习播客脚本并合成语音',
    iconKey: 'podcast',
    recommendedCapabilities: { functionCalling: true, maxContext: 64000, jsonMode: true },
    required: true,
  },
  {
    type: 'knowledge_graph',
    name: '知识图谱构建',
    description: '从文档中抽取实体和关系构建知识图谱',
    iconKey: 'graph',
    recommendedCapabilities: { functionCalling: true, maxContext: 128000, jsonMode: true },
    required: true,
  },
]
```

### 5.3 工作流-模型分配数据模型

新增 `workflow_model_assignments` 表，建立工作流类型到 `api_config` 的映射：

```sql
CREATE TABLE workflow_model_assignments (
    workflow_type TEXT PRIMARY KEY,      -- 工作流类型标识
    api_config_id TEXT NOT NULL,         -- 关联的 api_config 记录 ID
    assigned_at TEXT NOT NULL,           -- 分配时间 (ISO 8601)
    updated_at TEXT NOT NULL,           -- 更新时间 (ISO 8601)
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
);
```

**设计说明**：
- `workflow_type` 为主键，确保每种工作流仅绑定一个配置
- `ON DELETE CASCADE`：删除 api_config 时自动清除关联的工作流分配
- 无全局默认配置——所有工作流必须显式分配

### 5.4 分配查询逻辑

```typescript
// 前端查询逻辑
async function getWorkflowAssignment(workflowType: WorkflowType): Promise<ApiConfig | null> {
  const assignment = await invoke<WorkflowAssignment | null>('get_workflow_assignment', { workflowType })
  if (!assignment) return null
  return assignment.apiConfig
}

// Python 编排服务查询逻辑
def get_config_for_workflow(self, workflow_type: str) -> tuple[dict, str] | None:
    """获取指定工作流类型的 API 配置和密钥。"""
    assignment = self._get(f"/model-gateway/workflow-assignments/{workflow_type}")
    if not assignment:
        return None
    config_id = assignment.get("apiConfigId")
    api_key = self.get_api_key(config_id)
    if not api_key:
        return None
    config = self.get_api_config(config_id)
    if not config or not config.get("isEnabled"):
        return None
    return config, api_key
```

### 5.5 工作流分配 UI

在设置页中，工作流分配面板展示 5 种工作流及其当前绑定的模型：

```
┌─────────────────────────────────────────────────────┐
│ 工作流模型分配                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│ 🃏 卡片生成                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ OpenAI · GPT-4o                        [更换]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ 📄 文档嵌入                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 未配置                                  [配置]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ❓ 知识问答                                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Anthropic · Claude 3.5 Haiku           [更换]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ 🎙️ 播客生成                                         │
│ ┌─────────────────────────────────────────────────┐ │
│ │ OpenAI · GPT-4o Mini                  [更换]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ 🕸️ 知识图谱构建                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Anthropic · Claude Sonnet 4           [更换]   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ⚡ 快速设置：全部使用同一模型                      │ │
│ │    选择模型: [GPT-4o ▼]  [应用]                  │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**"快速设置"功能**：允许用户一次性将所有工作流设为同一模型，满足"用户可置为同样的模型"的需求。点击"应用"后，系统为所有 5 种工作流创建/更新 `workflow_model_assignments` 记录，指向同一个 `api_config`。

### 5.6 分配变更校验

当用户更改工作流分配时，系统需校验：

1. **目标 api_config 必须存在且已启用**：`isEnabled = true`
2. **目标 api_config 必须已存储密钥**：`hasStoredKey = true` 或 `authMode = 'adc'`
3. **目标 api_config 的供应商必须支持该工作流**：例如 Google 的嵌入模型需特殊处理
4. **删除 api_config 前检查**：如果该配置被工作流引用，需提示用户先重新分配

### 5.7 工作流分配与 Python 编排服务的集成

当前 Python 编排服务通过 `get_default_config_with_key()` 获取配置。新系统需要适配：

```python
# orchestration_service/clients/host_gateway.py

def get_config_for_workflow(self, workflow_type: str) -> tuple[dict, str] | None:
    """按工作流类型获取 API 配置和密钥。
    
    查找顺序：
    1. workflow_model_assignments 中该工作流类型的绑定配置
    2. 如果绑定配置存在但已禁用，回退到 get_default_config_with_key()
    3. 如果无绑定配置，回退到 get_default_config_with_key()
    """
    try:
        assignment = self._get(f"/model-gateway/workflow-assignments/{workflow_type}")
        config_id = assignment.get("apiConfigId")
        config = self.get_api_config(config_id)
        if not config or not config.get("isEnabled"):
            return self.get_default_config_with_key()
        api_key = self.get_api_key(config_id)
        if not api_key:
            return self.get_default_config_with_key()
        return config, api_key
    except urllib.error.HTTPError:
        return self.get_default_config_with_key()
```

**双模式运行**：旧代码继续使用 `get_default_config_with_key()`，新代码使用 `get_config_for_workflow()`。两者并存直到所有工作流代码迁移完毕。

---

## 6. API Key 管理

### 6.1 设计概述

API Key 管理遵循**单 Key / 供应商 / 共享**模型：

- 每个供应商配置（`api_config` 记录）绑定一个 API Key
- 同一供应商的所有工作流共享该 Key
- Key 仅存储在本地 OS 密钥链，绝不上传

### 6.2 Key 前缀自动识别

当用户在 API Key 输入框中粘贴 Key 时，系统自动识别供应商：

| Key 前缀 | 识别为供应商 | 说明 |
|----------|-------------|------|
| `sk-proj-` | OpenAI | OpenAI 项目 Key |
| `sk-` (非 `sk-ant-`) | OpenAI / DeepSeek | 通用 OpenAI 格式（需结合上下文判断） |
| `sk-ant-api03-` | Anthropic | Anthropic API Key |
| `sk-ant-` | Anthropic | Anthropic 通用前缀 |
| `AIza` | Google | Google AI API Key |

```typescript
// src/features/settings/keyDetection.ts

interface KeyDetectionResult {
  /** 识别到的供应商 ID */
  providerId: string | null
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low'
  /** 识别说明 */
  message: string
}

export function detectProviderFromApiKey(key: string): KeyDetectionResult {
  const trimmed = key.trim()
  
  if (trimmed.startsWith('sk-ant-')) {
    return {
      providerId: 'anthropic',
      confidence: 'high',
      message: '检测到 Anthropic API Key 前缀',
    }
  }
  
  if (trimmed.startsWith('AIza')) {
    return {
      providerId: 'google',
      confidence: 'high',
      message: '检测到 Google AI API Key 前缀',
    }
  }
  
  if (trimmed.startsWith('sk-proj-')) {
    return {
      providerId: 'openai',
      confidence: 'high',
      message: '检测到 OpenAI 项目 Key 前缀',
    }
  }
  
  if (trimmed.startsWith('sk-')) {
    return {
      providerId: 'openai', // 也可能是 DeepSeek
      confidence: 'medium',
      message: '检测到 OpenAI 兼容 Key 前缀（也可能是 DeepSeek 等兼容服务）',
    }
  }
  
  return {
    providerId: null,
    confidence: 'low',
    message: '无法识别 Key 类型，请手动选择供应商',
  }
}
```

**交互行为**：当用户粘贴 Key 后，如果当前供应商选择为空或为"自定义"，系统自动切换到识别到的供应商，并显示提示消息。

### 6.3 Key 格式校验

实时校验用户输入的 Key 格式：

```typescript
// src/features/settings/keyValidation.ts

export interface KeyValidationResult {
  valid: boolean
  message: string
  severity: 'error' | 'warning' | 'info'
}

export function validateApiKey(key: string, providerId: string): KeyValidationResult {
  const trimmed = key.trim()
  
  if (!trimmed) {
    return { valid: false, message: '请输入 API Key', severity: 'error' }
  }
  
  // 检查空白字符
  if (trimmed !== key) {
    return { valid: false, message: 'Key 前后包含空白字符，已自动去除', severity: 'warning' }
  }
  
  const definition = getProviderDefinition(providerId)
  if (!definition) {
    return { valid: true, message: '自定义供应商无法校验 Key 格式', severity: 'info' }
  }
  
  // 前缀校验
  if (definition.keyPrefixes.length > 0) {
    const hasValidPrefix = definition.keyPrefixes.some(prefix => trimmed.startsWith(prefix))
    if (!hasValidPrefix) {
      return {
        valid: false,
        message: `${definition.name} 的 Key 通常以 ${definition.keyPrefixes.join(' 或 ')} 开头`,
        severity: 'warning',
      }
    }
  }
  
  // 正则校验
  if (definition.keyPattern) {
    if (!definition.keyPattern.test(trimmed)) {
      return {
        valid: false,
        message: `Key 格式不符合 ${definition.name} 的标准格式，请检查是否正确`,
        severity: 'error',
      }
    }
  }
  
  // 长度校验
  if (trimmed.length < 20) {
    return { valid: false, message: 'Key 长度过短，可能不完整', severity: 'error' }
  }
  
  return { valid: true, message: 'Key 格式校验通过', severity: 'info' }
}
```

### 6.4 Key 安全展示

API Key 在 UI 中始终以掩码形式展示，用户可切换显示：

```
┌──────────────────────────────────────────┐
│ API Key                                   │
│ ┌────────────────────────────┬──────────┐ │
│ │ sk-...7xYz                 │ 👁 显示   │ │
│ └────────────────────────────┴──────────┘ │
│                                           │
│ 状态: ✅ 已存储 · 已验证                    │
│                                           │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│ │ 更新 Key  │  │ 验证连接 │  │ 删除 Key  │ │
│ └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────┘
```

**掩码规则**：
- 已存储的 Key：显示前缀 + `...` + 末 4 位（如 `sk-...7xYz`）
- 前缀长度：OpenAI `sk-`（3 字符），Anthropic `sk-ant-`（7 字符），Google `AIza`（4 字符）
- 切换显示时：完整展示 Key，3 秒后自动恢复掩码（防止截图泄露）

```typescript
// src/features/settings/keyMasking.ts

export function maskApiKey(key: string, providerId: string): string {
  const definition = getProviderDefinition(providerId)
  const prefixLen = definition?.keyPrefixes[0]?.length ?? 3
  
  if (key.length <= prefixLen + 4) {
    return `${key.slice(0, prefixLen)}...`
  }
  
  return `${key.slice(0, prefixLen)}...${key.slice(-4)}`
}

export type KeyState = 'none' | 'stored' | 'verified' | 'invalid' | 'expired'

export interface KeyStatus {
  /** Key 存储状态 */
  state: KeyState
  /** 掩码展示的 Key（如 sk-...7xYz） */
  maskedKey: string | null
  /** 上次验证时间 */
  lastVerifiedAt: Date | null
  /** 上次验证结果消息 */
  lastVerifyMessage: string | null
}

export function getApiKeyDisplayState(
  hasStoredKey: boolean,
  keyStatus: KeyStatus | null
): { displayText: string; statusBadge: string } {
  if (!hasStoredKey) {
    return { displayText: '未配置', statusBadge: '⚠️ 未存储' }
  }
  
  if (!keyStatus) {
    return { displayText: 'sk-••••', statusBadge: '📦 已存储' }
  }
  
  switch (keyStatus.state) {
    case 'verified':
      return { displayText: keyStatus.maskedKey ?? 'sk-••••', statusBadge: '✅ 已验证' }
    case 'stored':
      return { displayText: keyStatus.maskedKey ?? 'sk-••••', statusBadge: '📦 已存储 · 未验证' }
    case 'invalid':
      return { displayText: keyStatus.maskedKey ?? 'sk-••••', statusBadge: '❌ 无效' }
    case 'expired':
      return { displayText: keyStatus.maskedKey ?? 'sk-••••', statusBadge: '⚠️ 可能已过期' }
    default:
      return { displayText: '未知', statusBadge: '' }
  }
}
```

### 6.5 Key 状态指示

Key 状态通过连接测试结果和存储状态综合判断：

**状态流转**：

```
none ──存储Key──▶ stored ──验证成功──▶ verified
  ▲                 │                    │
  │                 │验证失败             │长时间未验证
  │                 ▼                    ▼
  └──删除Key──── invalid              expired
                     │                    │
                     └──重新存储/验证──────┘
```

**过期判断逻辑**：
- Key 存储超过 90 天且未重新验证 → 标记为 `expired`
- 上次验证超过 30 天 → 提示"建议重新验证"

### 6.6 Key 存储安全模型

```
┌─────────────────────────────────────────────────┐
│                  前端 (React)                    │
│                                                 │
│  用户输入 Key                                    │
│       │                                         │
│       ▼                                         │
│  store_api_key(configId, apiKey)                │
│       │  Tauri IPC                               │
│       ▼                                         │
├─────────────────────────────────────────────────┤
│              Rust 后端 (Tauri)                   │
│                                                 │
│  store_api_key()                                │
│       │                                         │
│       ▼                                         │
│  SecretStore::store_api_key()                   │
│       │                                         │
│       ▼                                         │
│  OS 密钥链存储                                   │
│  - macOS: Keychain                              │
│  - Windows: Credential Manager                  │
│  - Linux: Secret Service (libsecret)            │
│                                                 │
│  Key 绝不写入 SQLite 或日志                       │
│  Key 绝不通过网络传输（除用户主动测试连接）           │
└─────────────────────────────────────────────────┘
```

**安全原则**：
1. API Key 仅存储在 OS 原生密钥链中
2. 前端永远不缓存 Key 明文（仅展示掩码）
3. Key 仅在以下场景离开密钥链：
   - 连接测试时（用户主动触发）
   - Python 编排服务请求时（通过本地 HTTP gateway）
4. 删除 api_config 时同步删除密钥链中的 Key

### 6.7 Key 与工作流的共享关系

由于采用**单 Key / 供应商 / 共享**模型，Key 管理与工作流分配的关系如下：

```
供应商配置 (api_config)
├── id: "cfg-001"
├── provider: "openai"
├── model: "gpt-4o"
├── api_key: "sk-...7xYz"  ← 存储在 SecretStore
│
├── 工作流分配 (workflow_model_assignments)
│   ├── card_generation → cfg-001    ← 共享同一 Key
│   ├── knowledge_qa → cfg-001      ← 共享同一 Key
│   └── podcast_generation → cfg-001 ← 共享同一 Key
│
└── 另一供应商配置 (api_config)
    ├── id: "cfg-002"
    ├── provider: "anthropic"
    ├── model: "claude-3-5-haiku-20241022"
    ├── api_key: "sk-ant-...xYz"
    │
    └── 工作流分配
        ├── document_embedding → cfg-002
        └── knowledge_graph → cfg-002
```

**关键约束**：
- 一个 `api_config` 可被多个工作流引用
- 一个工作流仅引用一个 `api_config`
- 更改 `api_config` 的 Key 影响所有引用该配置的工作流
- 更改工作流分配仅影响该工作流，不影响其他工作流

---

## 7. 连接测试

### 7.1 设计概述

连接测试采用**分级测试**策略：

1. **轻量测试（第一级）**：仅验证 API Key 有效性，不消耗 token
2. **完整测试（第二级）**：发送真实 chat completion 请求，验证端到端可用性

用户可自主选择测试级别。轻量测试为默认，完整测试为可选。

### 7.2 当前系统问题

当前 `test_api_connection` 函数（`src-tauri/src/commands/settings.rs:358-508`）仅支持完整测试：

```rust
// 当前实现：发送真实 chat completion 请求，消耗 token
let body = serde_json::json!({
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "ping"}],
    "max_tokens": 1,
});
```

**问题**：
- 每次测试消耗至少 1 个 token（实际更多，因为 prompt 本身有 token）
- 对 Anthropic 等无轻量端点的供应商，无法避免消耗
- 对 OpenAI/Google/DeepSeek 等有 `/models` 端点的供应商，完全没必要消耗 token

### 7.3 分级测试策略

#### 7.3.1 轻量测试（Level 1）

仅验证 Key 有效性，不消耗 token：

| 供应商 | 端点 | 方法 | 成功判断 |
|--------|------|------|----------|
| OpenAI | `GET {base_url}/models` | Bearer Auth | HTTP 200 |
| DeepSeek | `GET {base_url}/models` | Bearer Auth | HTTP 200 |
| Google | `GET {base_url}/models?key={api_key}` | Query Auth | HTTP 200 |
| Anthropic | ❌ 无轻量端点 | — | — |
| 自定义 OpenAI | `GET {base_url}/models` | Bearer Auth | HTTP 200 |
| 自定义 Anthropic | ❌ 无轻量端点 | — | — |
| 自定义 Google | `GET {base_url}/models?key={api_key}` | Query Auth | HTTP 200 |

**轻量测试的优势**：
- 零 token 消耗
- 响应更快（通常 < 500ms）
- 可频繁执行（如每次打开设置页时自动验证）

**轻量测试的局限**：
- 仅验证 Key 是否有效，不验证模型是否可用
- 不验证 base_url 是否指向正确的聊天端点

#### 7.3.2 完整测试（Level 2）

发送真实 chat completion 请求，验证端到端可用性：

| 供应商 | 端点 | 请求体 |
|--------|------|--------|
| OpenAI | `POST {base_url}/chat/completions` | `{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":1}` |
| DeepSeek | `POST {base_url}/chat/completions` | `{"model":"deepseek-chat","messages":[{"role":"user","content":"ping"}],"max_tokens":1}` |
| Google | `POST {base_url}/models/{model}:generateContent` | `{"contents":[{"parts":[{"text":"ping"}]}]}` |
| Anthropic | `POST {base_url}/v1/messages` | `{"model":"claude-3-5-haiku-20241022","messages":[{"role":"user","content":"ping"}],"max_tokens":1}` |
| 自定义 OpenAI | `POST {base_url}/chat/completions` | 同 OpenAI 格式 |
| 自定义 Anthropic | `POST {base_url}/v1/messages` | 同 Anthropic 格式 |
| 自定义 Google | `POST {base_url}/models/{model}:generateContent` | 同 Google 格式 |

**完整测试的优势**：
- 验证端到端可用性（Key + 模型 + 端点）
- 确认模型确实支持聊天功能

**完整测试的局限**：
- 消耗 token（约 3-5 token）
- 响应较慢（通常 1-3 秒）

### 7.4 测试命令接口

```rust
// src-tauri/src/commands/settings.rs

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestApiConnectionDto {
    pub provider: String,
    pub auth_mode: String,
    pub api_key: String,
    pub base_url: Option<String>,
    pub model: Option<String>,       // 新增：完整测试需要模型名
    pub test_level: Option<String>,   // 新增："lightweight" | "full"
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiConnectionTestResultDto {
    pub success: bool,
    pub message: String,
    pub test_level: String,           // 新增：实际执行的测试级别
    pub latency_ms: Option<u64>,      // 新增：响应延迟
}
```

### 7.5 测试流程

```
用户点击"验证连接"
       │
       ▼
┌──────────────────────────┐
│ 选择测试级别               │
│ ○ 快速验证（不消耗 token） │  ← 默认
│ ○ 完整测试（消耗少量token） │
└──────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│ 检查供应商是否支持轻量测试             │
│                                      │
│  支持 → 执行轻量测试                  │
│  不支持（Anthropic）→ 自动升级为完整测试 │
│          并提示"该供应商不支持快速验证"  │
└──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 展示测试结果               │
│ ✅ 连接成功 (234ms)       │
│    级别: 快速验证          │
│    Key 有效，可访问 47 个模型 │
│                           │
│ ❌ 认证失败 (401)          │
│    Key 无效或已过期         │
└──────────────────────────┘
```

### 7.6 自动验证触发时机

轻量测试可在以下时机自动执行（无需用户手动触发）：

| 时机 | 测试级别 | 说明 |
|------|----------|------|
| 存储/更新 Key 后 | 轻量 | 确认新 Key 有效 |
| 打开设置页时 | 轻量 | 刷新 Key 状态（仅对 30 分钟未验证的 Key） |
| 更改 base_url 后 | 轻量 | 确认新端点可达 |
| 更改模型后 | 不自动测试 | 用户手动触发完整测试 |

### 7.7 测试结果缓存

测试结果缓存在前端，避免频繁请求：

```typescript
interface ConnectionTestCache {
  configId: string
  testLevel: 'lightweight' | 'full'
  success: boolean
  message: string
  latencyMs: number
  testedAt: Date
}

// 缓存有效期
const TEST_RESULT_TTL = 30 * 60 * 1000 // 30 分钟
```

---

## 8. 预算管理

### 8.1 设计概述

预算管理采用**仅预算上限 + 按供应商统计**的轻量策略：

- 每个供应商配置可设置月度预算上限（`budgetLimit` 字段已存在）
- 超限时自动禁用该配置
- 不追踪实际用量（避免复杂的 token 计费逻辑）
- 统计维度为按供应商

### 8.2 预算上限机制

#### 8.2.1 数据模型

`budgetLimit` 字段已在 `api_configs` 表中存在（`REAL` 类型，可为 NULL），无需新增字段。

```typescript
// ApiConfig.budgetLimit 的语义
// null  → 无限制（默认）
// 0     → 禁止使用（已停用）
// > 0   → 月度预算上限（美元）
```

#### 8.2.2 预算检查时机

```
工作流启动前
       │
       ▼
┌──────────────────────────────┐
│ 查询该工作流绑定的 api_config  │
│                              │
│  budgetLimit == null → 放行   │
│  budgetLimit == 0    → 拒绝   │
│  budgetLimit > 0     →        │
│    查询本月该供应商已用金额     │
│    已用 >= 上限 → 拒绝        │
│    已用 < 上限  → 放行         │
└──────────────────────────────┘
```

#### 8.2.3 预算超限行为

当预算超限时：

1. **工作流启动被拒绝**：返回错误"供应商 {name} 的月度预算已达上限 (${budgetLimit})"
2. **UI 提示**：设置页中该供应商卡片显示"⚠️ 预算已超限"标记
3. **不自动降级**：不自动切换到其他供应商（避免意外成本）
4. **用户手动处理**：用户可选择提高预算上限或等待下月重置

### 8.3 按供应商统计

#### 8.3.1 统计数据来源

由于不追踪实际 token 用量，统计数据来自工作流运行记录：

```sql
-- 新增表：按供应商的月度预算使用统计
CREATE TABLE provider_budget_usage (
    id TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    period TEXT NOT NULL,           -- 'YYYY-MM' 格式的月份
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    workflow_runs_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE,
    UNIQUE(api_config_id, period)
);
```

**估算成本**：每次工作流运行完成后，根据供应商和模型估算成本：

```rust
// 简化的成本估算（不追踪精确 token 数）
fn estimate_workflow_cost(provider: &str, model: &str) -> f64 {
    match provider {
        "openai" => match model {
            "gpt-4o" => 0.03,       // 估算每次运行 ~$0.03
            "gpt-4o-mini" => 0.002,  // 估算每次运行 ~$0.002
            "o1" => 0.10,
            _ => 0.01,
        },
        "anthropic" => match model {
            "claude-sonnet-4-20250514" => 0.03,
            "claude-3-5-haiku-20241022" => 0.002,
            _ => 0.01,
        },
        "google" => match model {
            m if m.contains("pro") => 0.02,
            m if m.contains("flash") => 0.001,
            _ => 0.005,
        },
        "deepseek" => 0.002,
        _ => 0.01, // 自定义供应商默认估算
    }
}
```

> **注意**：此估算是粗粒度的，仅用于预算预警，不作为精确计费依据。精确 token 计费需要解析各供应商的 API 响应中的 `usage` 字段，属于后续优化方向。

#### 8.3.2 统计展示

设置页中按供应商展示预算使用情况：

```
┌─────────────────────────────────────────────┐
│ OpenAI                                       │
│ ┌─────────────────────────────────────────┐  │
│ │ 月度预算: $10.00                        │  │
│ │ ████████░░░░░░░░░░░  $3.42 / $10.00    │  │
│ │ 本月运行: 47 次                         │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ Anthropic                                    │
│ ┌─────────────────────────────────────────┐  │
│ │ 月度预算: 无限制                         │  │
│ │ 本月运行: 23 次                         │  │
│ └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 8.4 预算重置

预算按月度周期自动重置：

- 每月 1 日 UTC 00:00，`provider_budget_usage` 表开始新周期
- 旧周期数据保留 6 个月供历史查看
- 用户可手动重置当月预算（"重置预算"按钮）

---

## 9. 数据模型

### 9.1 完整数据库 Schema

#### 9.1.1 现有表变更

**`api_configs` 表**（扩展）：

```sql
-- 现有字段（不变）
-- id, user_id, provider, protocol, auth_mode, name, base_url, model, budget_limit, is_enabled, is_default, created_at

-- 新增字段
ALTER TABLE api_configs ADD COLUMN key_verified_at TEXT;      -- Key 上次验证时间
ALTER TABLE api_configs ADD COLUMN key_status TEXT DEFAULT 'none';  -- Key 状态: none/stored/verified/invalid/expired
ALTER TABLE api_configs ADD COLUMN display_name TEXT;          -- 供应商显示名称（自定义供应商的别名）
```

**`api_configs` provider 值域扩展**：

```
旧值域: openai | anthropic | google | openai_compatible
新值域: openai | anthropic | google | deepseek | custom_openai | custom_anthropic | custom_google
```

#### 9.1.2 新增表

**`workflow_model_assignments` 表**：

```sql
CREATE TABLE workflow_model_assignments (
    workflow_type TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_wma_api_config_id ON workflow_model_assignments(api_config_id);
```

**`provider_budget_usage` 表**：

```sql
CREATE TABLE provider_budget_usage (
    id TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    period TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    workflow_runs_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE,
    UNIQUE(api_config_id, period)
);

-- 索引
CREATE INDEX idx_pbu_config_period ON provider_budget_usage(api_config_id, period);
```

### 9.2 迁移 SQL

```sql
-- V11__byok_system.sql

-- 1. 扩展 api_configs 表
ALTER TABLE api_configs ADD COLUMN key_verified_at TEXT;
ALTER TABLE api_configs ADD COLUMN key_status TEXT DEFAULT 'none';
ALTER TABLE api_configs ADD COLUMN display_name TEXT;

-- 2. 迁移旧 openai_compatible 记录
-- 根据 base_url 和 protocol 判断归属
UPDATE api_configs
SET provider = 'deepseek',
    protocol = 'openai-compatible'
WHERE provider = 'openai_compatible'
  AND base_url LIKE '%deepseek.com%';

UPDATE api_configs
SET provider = 'custom_anthropic',
    protocol = 'native'
WHERE provider = 'openai_compatible'
  AND (protocol = 'native' OR base_url LIKE '%anthropic%');

UPDATE api_configs
SET provider = 'custom_openai',
    protocol = 'openai-compatible'
WHERE provider = 'openai_compatible';

-- 3. 创建 workflow_model_assignments 表
CREATE TABLE workflow_model_assignments (
    workflow_type TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_wma_api_config_id ON workflow_model_assignments(api_config_id);

-- 4. 创建 provider_budget_usage 表
CREATE TABLE provider_budget_usage (
    id TEXT PRIMARY KEY,
    api_config_id TEXT NOT NULL,
    period TEXT NOT NULL,
    estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
    workflow_runs_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (api_config_id) REFERENCES api_configs(id) ON DELETE CASCADE,
    UNIQUE(api_config_id, period)
);

CREATE INDEX idx_pbu_config_period ON provider_budget_usage(api_config_id, period);

-- 5. 将现有默认配置分配给所有工作流类型
-- （仅当存在默认配置时执行）
INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'card_generation', id, datetime('now'), datetime('now')
FROM api_configs WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'document_embedding', id, datetime('now'), datetime('now')
FROM api_configs WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'knowledge_qa', id, datetime('now'), datetime('now')
FROM api_configs WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'podcast_generation', id, datetime('now'), datetime('now')
FROM api_configs WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;

INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
SELECT 'knowledge_graph', id, datetime('now'), datetime('now')
FROM api_configs WHERE is_default = TRUE AND is_enabled = TRUE
LIMIT 1;
```

### 9.3 TypeScript 类型扩展

```typescript
// src/types/document.ts 扩展

export type ApiProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'custom_openai'
  | 'custom_anthropic'
  | 'custom_google'

export type KeyStatus = 'none' | 'stored' | 'verified' | 'invalid' | 'expired'

export interface ApiConfig {
  id: string
  provider: ApiProvider
  protocol: 'native' | 'openai-compatible' | null
  authMode: ApiAuthMode
  name: string
  model: string | null
  baseUrl: string | null
  budgetLimit: number | null
  isDefault: boolean
  isEnabled: boolean
  hasStoredCredential: boolean
  hasStoredKey: boolean
  // 新增字段
  keyVerifiedAt: Date | null
  keyStatus: KeyStatus
  displayName: string | null
  createdAt: Date
}

export type WorkflowType =
  | 'card_generation'
  | 'document_embedding'
  | 'knowledge_qa'
  | 'podcast_generation'
  | 'knowledge_graph'

export interface WorkflowModelAssignment {
  workflowType: WorkflowType
  apiConfigId: string
  assignedAt: Date
  updatedAt: Date
  // 关联的 ApiConfig（查询时填充）
  apiConfig?: ApiConfig
}

export interface ProviderBudgetUsage {
  id: string
  apiConfigId: string
  period: string          // 'YYYY-MM'
  estimatedCostUsd: number
  workflowRunsCount: number
  updatedAt: Date
}
```

### 9.4 Zod Schema 扩展

```typescript
// src/types/schema.ts 扩展

export const apiProviderSchema = z.enum([
  'openai',
  'anthropic',
  'google',
  'deepseek',
  'custom_openai',
  'custom_anthropic',
  'custom_google',
])

export const keyStatusSchema = z.enum(['none', 'stored', 'verified', 'invalid', 'expired'])

export const apiConfigSchema = z.object({
  id: z.string().uuid(),
  provider: apiProviderSchema,
  protocol: z.enum(['native', 'openai-compatible']).nullable(),
  authMode: apiAuthModeSchema,
  name: z.string().min(1),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  budgetLimit: z.number().nullable(),
  isDefault: z.boolean(),
  isEnabled: z.boolean(),
  hasStoredCredential: z.boolean(),
  hasStoredKey: z.boolean(),
  keyVerifiedAt: z.date().nullable(),
  keyStatus: keyStatusSchema,
  displayName: z.string().nullable(),
  createdAt: dateValueSchema,
}) as z.ZodType<ApiConfig>

export const workflowTypeSchema = z.enum([
  'card_generation',
  'document_embedding',
  'knowledge_qa',
  'podcast_generation',
  'knowledge_graph',
])

export const workflowModelAssignmentSchema = z.object({
  workflowType: workflowTypeSchema,
  apiConfigId: z.string().uuid(),
  assignedAt: dateValueSchema,
  updatedAt: dateValueSchema,
  apiConfig: apiConfigSchema.optional(),
}) as z.ZodType<WorkflowModelAssignment>

export const providerBudgetUsageSchema = z.object({
  id: z.string(),
  apiConfigId: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  estimatedCostUsd: z.number().nonnegative(),
  workflowRunsCount: z.number().int().nonnegative(),
  updatedAt: dateValueSchema,
}) as z.ZodType<ProviderBudgetUsage>

// 模型发现相关 Schema
export const discoveredModelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  source: z.enum(['preset', 'fetched']),
  capabilities: z.object({
    vision: z.boolean(),
    functionCalling: z.boolean(),
    maxContext: z.number().int().positive(),
    streaming: z.boolean(),
    jsonMode: z.boolean(),
  }),
  isRecommended: z.boolean(),
}) as z.ZodType<DiscoveredModel>
```

### 9.5 Rust 数据结构扩展

```rust
// src-tauri/src/db/settings_repo.rs

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    pub id: String,
    pub provider: String,
    pub protocol: Option<String>,
    pub auth_mode: String,
    pub name: String,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub budget_limit: Option<f64>,
    pub is_enabled: bool,
    pub is_default: bool,
    pub created_at: String,
    // 新增字段
    pub key_verified_at: Option<String>,
    pub key_status: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowModelAssignment {
    pub workflow_type: String,
    pub api_config_id: String,
    pub assigned_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBudgetUsage {
    pub id: String,
    pub api_config_id: String,
    pub period: String,
    pub estimated_cost_usd: f64,
    pub workflow_runs_count: i32,
    pub updated_at: String,
}
```

### 9.6 实体关系图

```
┌────────────────────┐       ┌─────────────────────────────┐
│    api_configs      │       │  workflow_model_assignments   │
├────────────────────┤       ├─────────────────────────────┤
│ id (PK)            │◀──────│ api_config_id (FK)           │
│ provider           │       │ workflow_type (PK)           │
│ protocol           │       │ assigned_at                  │
│ auth_mode          │       │ updated_at                   │
│ name               │       └─────────────────────────────┘
│ base_url           │
│ model              │       ┌─────────────────────────────┐
│ budget_limit       │       │  provider_budget_usage       │
│ is_enabled         │       ├─────────────────────────────┤
│ is_default         │◀──────│ api_config_id (FK)           │
│ key_verified_at    │       │ period                       │
│ key_status         │       │ estimated_cost_usd           │
│ display_name       │       │ workflow_runs_count          │
│ created_at         │       │ updated_at                   │
└────────────────────┘       └─────────────────────────────┘
         │
         │ 1:1 (per config_id)
         ▼
┌────────────────────┐
│   SecretStore      │
│ (OS 密钥链)        │
├────────────────────┤
│ config_id → api_key│
└────────────────────┘
```

---

## 10. 后端架构

### 10.1 新增 Tauri IPC 命令

#### 10.1.1 模型发现命令

```rust
// src-tauri/src/commands/settings.rs

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchProviderModelsDto {
    pub provider: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfoDto {
    pub id: String,
    pub display_name: String,
    pub source: String,           // "preset" | "fetched"
    pub capabilities: ModelCapabilitiesDto,
    pub is_recommended: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilitiesDto {
    pub vision: bool,
    pub function_calling: bool,
    pub max_context: i32,
    pub streaming: bool,
    pub json_mode: bool,
}

#[tauri::command]
pub async fn fetch_provider_models(
    data: FetchProviderModelsDto,
) -> CommandResult<Vec<ModelInfoDto>> {
    // 1. 获取供应商定义
    // 2. 根据 protocol 构造 GET /models 请求
    // 3. 解析响应，转换为 ModelInfoDto 列表
    // 4. 合并预置模型（预置能力标签优先）
    // 5. 去重
}
```

**各协议的请求构造**：

```rust
async fn fetch_models_from_api(
    provider: &str,
    api_key: &str,
    base_url: Option<&str>,
) -> Result<Vec<ModelInfoDto>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()?;

    match provider {
        "openai" | "deepseek" | "custom_openai" => {
            let url = format!("{}/models", base_url.unwrap_or("https://api.openai.com/v1"));
            let resp = client.get(&url)
                .header("Authorization", format!("Bearer {api_key}"))
                .send().await?;
            // 解析 OpenAI 格式: { "data": [{ "id": "..." }] }
            parse_openai_models(resp).await
        }
        "google" | "custom_google" => {
            let url = format!("{}/models?key={api_key}",
                base_url.unwrap_or("https://generativelanguage.googleapis.com/v1beta"));
            let resp = client.get(&url).send().await?;
            // 解析 Google 格式: { "models": [{ "name": "models/..." }] }
            parse_google_models(resp).await
        }
        "anthropic" | "custom_anthropic" => {
            // Anthropic 无模型列表 API，返回空列表
            Ok(vec![])
        }
        _ => Ok(vec![]),
    }
}
```

#### 10.1.2 工作流分配命令

```rust
#[tauri::command]
pub fn list_workflow_assignments(
    state: State<'_, AppState>,
) -> CommandResult<Vec<WorkflowAssignmentDto>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.list_workflow_assignments()
}

#[tauri::command]
pub fn get_workflow_assignment(
    state: State<'_, AppState>,
    workflow_type: String,
) -> CommandResult<Option<WorkflowAssignmentDto>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.get_workflow_assignment(&workflow_type)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWorkflowAssignmentDto {
    pub workflow_type: String,
    pub api_config_id: String,
}

#[tauri::command]
pub fn set_workflow_assignment(
    state: State<'_, AppState>,
    data: SetWorkflowAssignmentDto,
) -> CommandResult<WorkflowAssignmentDto> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);

    // 校验 api_config 存在且可用
    let config = repo.get_api_config(&data.api_config_id)?
        .ok_or(CommandError::NotFound)?;
    if !config.is_enabled {
        return Err(CommandError::InvalidInput("该供应商配置已禁用".to_string()));
    }

    // 校验 Key 已存储
    let secrets = state.lock_secrets()?;
    if !secrets.has_api_key(&data.api_config_id)? && config.auth_mode != "adc" {
        return Err(CommandError::InvalidInput("该供应商配置未存储 API Key".to_string()));
    }

    repo.upsert_workflow_assignment(&data.workflow_type, &data.api_config_id)
}

#[tauri::command]
pub fn set_all_workflow_assignments(
    state: State<'_, AppState>,
    api_config_id: String,
) -> CommandResult<Vec<WorkflowAssignmentDto>> {
    // "快速设置"：将所有工作流类型设为同一 api_config
    let workflow_types = [
        "card_generation",
        "document_embedding",
        "knowledge_qa",
        "podcast_generation",
        "knowledge_graph",
    ];

    // 校验同上...

    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let mut results = Vec::new();
    for wt in &workflow_types {
        results.push(repo.upsert_workflow_assignment(wt, &api_config_id)?);
    }
    Ok(results)
}

#[tauri::command]
pub fn delete_workflow_assignment(
    state: State<'_, AppState>,
    workflow_type: String,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.delete_workflow_assignment(&workflow_type)
}
```

#### 10.1.3 预算使用命令

```rust
#[tauri::command]
pub fn get_provider_budget_usage(
    state: State<'_, AppState>,
    api_config_id: String,
    period: Option<String>,  // 'YYYY-MM'，默认当月
) -> CommandResult<Option<ProviderBudgetUsageDto>> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    let period = period.unwrap_or_else(|| {
        chrono::Utc::now().format("%Y-%m").to_string()
    });
    repo.get_budget_usage(&api_config_id, &period)
}

#[tauri::command]
pub fn record_workflow_cost(
    state: State<'_, AppState>,
    api_config_id: String,
    estimated_cost_usd: f64,
) -> CommandResult<()> {
    let db = state.lock_db()?;
    let repo = SettingsRepository::new(&db);
    repo.increment_budget_usage(&api_config_id, estimated_cost_usd)
}
```

#### 10.1.4 命令注册

```rust
// src-tauri/src/lib.rs 新增注册

invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    commands::settings::fetch_provider_models,
    commands::settings::list_workflow_assignments,
    commands::settings::get_workflow_assignment,
    commands::settings::set_workflow_assignment,
    commands::settings::set_all_workflow_assignments,
    commands::settings::delete_workflow_assignment,
    commands::settings::get_provider_budget_usage,
    commands::settings::record_workflow_cost,
])
```

### 10.2 Host HTTP Gateway 扩展

新增端点供 Python 编排服务查询工作流分配：

```rust
// src-tauri/src/gateway/host_http.rs 新增路由

// GET /model-gateway/workflow-assignments
// → 返回所有工作流分配列表

// GET /model-gateway/workflow-assignments/{workflow_type}
// → 返回指定工作流分配及其关联的 api_config + api_key

// POST /model-gateway/workflow-cost
// Body: { "apiConfigId": "...", "estimatedCostUsd": 0.03 }
// → 记录工作流运行成本
```

**工作流分配端点实现**：

```rust
fn handle_workflow_assignment(
    state: &AppState,
    workflow_type: &str,
) -> GatewayResponse {
    let db = match state.lock_db() {
        Ok(db) => db,
        Err(e) => return GatewayResponse::InternalError(json!({"error": e.to_string()})),
    };
    let repo = SettingsRepository::new(&db);

    match repo.get_workflow_assignment(workflow_type) {
        Ok(Some(assignment)) => {
            let config = repo.get_api_config(&assignment.api_config_id);
            let secrets = state.lock_secrets();
            // 构造响应包含 apiConfig + apiKey
            GatewayResponse::Ok(json!({
                "workflowType": assignment.workflow_type,
                "apiConfigId": assignment.api_config_id,
                "apiConfig": config.map(|c| api_config_to_json(&c)),
                "assignedAt": assignment.assigned_at,
            }))
        }
        Ok(None) => GatewayResponse::NotFound(json!({"error": "No assignment found"})),
        Err(e) => GatewayResponse::InternalError(json!({"error": e.to_string()})),
    }
}
```

### 10.3 Python 编排服务适配

#### 10.3.1 HostGatewayClient 扩展

```python
# orchestration_service/clients/host_gateway.py

class HostGatewayClient:
    # ... 现有方法 ...

    def list_workflow_assignments(self) -> list[dict]:
        """获取所有工作流模型分配。"""
        return self._get("/model-gateway/workflow-assignments")

    def get_workflow_assignment(self, workflow_type: str) -> dict | None:
        """获取指定工作流类型的模型分配。"""
        try:
            return self._get(f"/model-gateway/workflow-assignments/{workflow_type}")
        except urllib.error.HTTPError:
            return None

    def get_config_for_workflow(self, workflow_type: str) -> tuple[dict, str] | None:
        """按工作流类型获取 API 配置和密钥。

        查找顺序：
        1. workflow_model_assignments 中的绑定配置
        2. 回退到 get_default_config_with_key()
        """
        assignment = self.get_workflow_assignment(workflow_type)
        if not assignment:
            return self.get_default_config_with_key()

        config_id = assignment.get("apiConfigId")
        if not config_id:
            return self.get_default_config_with_key()

        config = self.get_api_config(config_id)
        if not config or not config.get("isEnabled"):
            return self.get_default_config_with_key()

        api_key = self.get_api_key(config_id)
        if not api_key:
            return self.get_default_config_with_key()

        return config, api_key

    def record_workflow_cost(self, api_config_id: str, estimated_cost_usd: float) -> dict:
        """记录工作流运行成本。"""
        return self._post("/model-gateway/workflow-cost", {
            "apiConfigId": api_config_id,
            "estimatedCostUsd": estimated_cost_usd,
        })
```

#### 10.3.2 工作流代码迁移

各工作流需要从 `get_default_config_with_key()` 迁移到 `get_config_for_workflow()`：

```python
# 迁移前
config_with_key = host.get_default_config_with_key()

# 迁移后
config_with_key = host.get_config_for_workflow("card_generation")
# 或
config_with_key = host.get_config_for_workflow("knowledge_graph")
```

**迁移清单**：

| 文件 | 工作流类型 | 当前调用 | 迁移后调用 |
|------|-----------|----------|-----------|
| `workflows/card_gen.py` | `card_generation` | `get_default_config_with_key()` | `get_config_for_workflow("card_generation")` |
| `workflows/embedding.py` | `document_embedding` | `get_default_config_with_key()` | `get_config_for_workflow("document_embedding")` |
| `workflows/qa.py` | `knowledge_qa` | `get_default_config_with_key()` | `get_config_for_workflow("knowledge_qa")` |
| `workflows/podcast.py` | `podcast_generation` | `get_config_with_key_by_provider()` | `get_config_for_workflow("podcast_generation")` |
| `workflows/knowledge_graph.py` | `knowledge_graph` | `get_default_config_with_key()` | `get_config_for_workflow("knowledge_graph")` |

### 10.4 SettingsRepository 扩展

```rust
// src-tauri/src/db/settings_repo.rs 新增方法

impl SettingsRepository<'_>> {
    // ===== Workflow Model Assignments =====

    pub fn list_workflow_assignments(&self) -> Result<Vec<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             ORDER BY workflow_type"
        )?;
        stmt.query_map([], |row| Ok(WorkflowModelAssignment {
            workflow_type: row.get(0)?,
            api_config_id: row.get(1)?,
            assigned_at: row.get(2)?,
            updated_at: row.get(3)?,
        }))?.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get_workflow_assignment(&self, workflow_type: &str) -> Result<Option<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             WHERE workflow_type = ?1"
        )?;
        stmt.query_row(params![workflow_type], |row| Ok(WorkflowModelAssignment {
            workflow_type: row.get(0)?,
            api_config_id: row.get(1)?,
            assigned_at: row.get(2)?,
            updated_at: row.get(3)?,
        })).optional().map_err(Into::into)
    }

    pub fn upsert_workflow_assignment(
        &self,
        workflow_type: &str,
        api_config_id: &str,
    ) -> Result<WorkflowModelAssignment> {
        let now = chrono::Utc::now().to_rfc3339();
        self.db.connection().execute(
            "INSERT INTO workflow_model_assignments (workflow_type, api_config_id, assigned_at, updated_at)
             VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(workflow_type) DO UPDATE SET
                api_config_id = excluded.api_config_id,
                updated_at = excluded.updated_at",
            params![workflow_type, api_config_id, now],
        )?;
        self.get_workflow_assignment(workflow_type).map(|o| o.unwrap())
    }

    pub fn delete_workflow_assignment(&self, workflow_type: &str) -> Result<()> {
        self.db.connection().execute(
            "DELETE FROM workflow_model_assignments WHERE workflow_type = ?1",
            params![workflow_type],
        )?;
        Ok(())
    }

    pub fn get_assignments_by_config_id(&self, api_config_id: &str) -> Result<Vec<WorkflowModelAssignment>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT workflow_type, api_config_id, assigned_at, updated_at
             FROM workflow_model_assignments
             WHERE api_config_id = ?1"
        )?;
        stmt.query_map(params![api_config_id], |row| Ok(WorkflowModelAssignment {
            workflow_type: row.get(0)?,
            api_config_id: row.get(1)?,
            assigned_at: row.get(2)?,
            updated_at: row.get(3)?,
        }))?.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    // ===== Budget Usage =====

    pub fn get_budget_usage(&self, api_config_id: &str, period: &str) -> Result<Option<ProviderBudgetUsage>> {
        let mut stmt = self.db.connection().prepare(
            "SELECT id, api_config_id, period, estimated_cost_usd, workflow_runs_count, updated_at
             FROM provider_budget_usage
             WHERE api_config_id = ?1 AND period = ?2"
        )?;
        stmt.query_row(params![api_config_id, period], |row| Ok(ProviderBudgetUsage {
            id: row.get(0)?,
            api_config_id: row.get(1)?,
            period: row.get(2)?,
            estimated_cost_usd: row.get(3)?,
            workflow_runs_count: row.get(4)?,
            updated_at: row.get(5)?,
        })).optional().map_err(Into::into)
    }

    pub fn increment_budget_usage(&self, api_config_id: &str, cost: f64) -> Result<()> {
        let period = chrono::Utc::now().format("%Y-%m").to_string();
        let now = chrono::Utc::now().to_rfc3339();

        self.db.connection().execute(
            "INSERT INTO provider_budget_usage (id, api_config_id, period, estimated_cost_usd, workflow_runs_count, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5)
             ON CONFLICT(api_config_id, period) DO UPDATE SET
                estimated_cost_usd = estimated_cost_usd + ?4,
                workflow_runs_count = workflow_runs_count + 1,
                updated_at = ?5",
            params![
                &Uuid::new_v4().to_string(),
                api_config_id,
                &period,
                cost,
                &now,
            ],
        )?;
        Ok(())
    }

    pub fn check_budget_exceeded(&self, api_config_id: &str) -> Result<bool> {
        let config = self.get_api_config(api_config_id)?
            .ok_or(DbError::NotFound)?;
        let budget = match config.budget_limit {
            Some(b) if b > 0.0 => b,
            _ => return Ok(false), // 无限制或 0
        };
        let period = chrono::Utc::now().format("%Y-%m").to_string();
        let usage = self.get_budget_usage(api_config_id, &period)?;
        let used = usage.map(|u| u.estimated_cost_usd).unwrap_or(0.0);
        Ok(used >= budget)
    }
}
```

---

## 11. 前端架构

### 11.1 设置页重构

#### 11.1.1 页面布局

设置页从单页长滚动重构为分区卡片式布局：

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚙️ 设置                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🤖 AI 模型配置                                              │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ 供应商配置                                               │ │ │
│ │ │                                                         │ │ │
│ │ │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │ │ │
│ │ │ │  OpenAI   │ │ Anthropic │ │  Google   │ │ DeepSeek │ │ │ │
│ │ │ │  ✅ 已配置 │ │ ✅ 已配置 │ │ ⚠️ 未配置 │ │ ✅ 已配置│ │ │ │
│ │ │ └───────────┘ └───────────┘ └───────────┘ └──────────┘ │ │ │
│ │ │                                                         │ │ │
│ │ │ ┌───────────┐ ┌───────────────────┐                     │ │ │
│ │ │ │ 自定义     │ │ 自定义            │  [+ 添加供应商]     │ │ │
│ │ │ │ (OpenAI)   │ │ (Anthropic)       │                     │ │ │
│ │ │ │ ✅ 已配置  │ │ ⚠️ 未配置         │                     │ │ │
│ │ │ └───────────┘ └───────────────────┘                     │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │                                                             │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ 工作流模型分配                                           │ │ │
│ │ │                                                         │ │ │
│ │ │ 🃏 卡片生成    OpenAI · GPT-4o              [更换]       │ │ │
│ │ │ 📄 文档嵌入    Anthropic · Claude 3.5 Haiku [更换]       │ │ │
│ │ │ ❓ 知识问答    OpenAI · GPT-4o Mini        [更换]       │ │ │
│ │ │ 🎙️ 播客生成   DeepSeek · DeepSeek-V3     [更换]       │ │ │
│ │ │ 🕸️ 知识图谱   Anthropic · Claude Sonnet 4 [更换]       │ │ │
│ │ │                                                         │ │ │
│ │ │ ⚡ 快速设置：全部使用 [GPT-4o ▼] [应用]                  │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🎙️ 播客设置  (现有设置，保持不变)                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📚 学习设置  (现有设置，保持不变)                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### 11.1.2 组件树

```
SettingsPage
├── AiModelSection                    ← 新组件
│   ├── ProviderConfigGrid            ← 新组件：供应商卡片网格
│   │   ├── ProviderCard              ← 新组件：单个供应商卡片
│   │   │   ├── ProviderIcon          ← 新组件：供应商品牌图标
│   │   │   ├── KeyStatusBadge        ← 新组件：Key 状态徽章
│   │   │   └── BudgetProgressBar     ← 新组件：预算进度条
│   │   └── AddProviderButton         ← 新组件：添加供应商按钮
│   │
│   ├── WorkflowAssignmentPanel       ← 新组件：工作流分配面板
│   │   ├── WorkflowAssignmentRow     ← 新组件：单行工作流分配
│   │   └── QuickSetupBar             ← 新组件：快速设置栏
│   │
│   └── ProviderConfigDialog          ← 新组件：供应商配置弹窗
│       ├── ProviderTypeSelector      ← 新组件：供应商类型选择
│       ├── ApiKeyInput               ← 新组件：Key 输入（含前缀识别+校验）
│       ├── BaseUrlInput              ← 新组件：Base URL 输入
│       ├── ModelSelector             ← 新组件：模型选择器
│       ├── ConnectionTestButton      ← 新组件：连接测试按钮
│       └── BudgetLimitInput          ← 新组件：预算上限输入
│
├── PodcastSection                    ← 现有组件（保持）
└── LearningSection                   ← 现有组件（保持）
```

### 11.2 核心组件设计

#### 11.2.1 ProviderCard

```typescript
interface ProviderCardProps {
  config: ApiConfig
  onClick: () => void
}

// 展示内容：
// - 供应商图标 (ProviderIcon)
// - 供应商名称
// - 当前模型名
// - Key 状态徽章 (✅ 已验证 / ⚠️ 未配置 / ❌ 无效)
// - 预算状态（如有设置）
// - 启用/禁用开关
```

#### 11.2.2 ProviderConfigDialog

```typescript
interface ProviderConfigDialogProps {
  open: boolean
  onClose: () => void
  config?: ApiConfig | null  // null = 新建模式
}

// 弹窗内容：
// 1. 供应商类型选择（新建模式）
//    - 预置供应商：OpenAI / Anthropic / Google / DeepSeek
//    - 自定义供应商：OpenAI 协议 / Anthropic 协议 / Google 协议
//
// 2. 配置字段
//    - 名称（自定义供应商可改名）
//    - API Key（含前缀识别 + 格式校验 + 掩码展示）
//    - Base URL（仅自定义供应商必填，预置供应商自动填充）
//    - 模型选择（ModelSelector）
//    - 预算上限（可选）
//
// 3. 操作按钮
//    - 验证连接（分级测试）
//    - 保存配置
//    - 删除配置（编辑模式）
```

#### 11.2.3 ModelSelector

```typescript
interface ModelSelectorProps {
  providerId: string
  baseUrl?: string | null
  apiKey?: string
  value: string | null
  onChange: (modelId: string) => void
}

// 内部状态：
// - presetModels: PresetModel[]  ← 来自 ProviderDefinition
// - fetchedModels: DiscoveredModel[]  ← 来自 fetch_provider_models
// - searchQuery: string
// - showManualInput: boolean
// - isFetching: boolean

// 交互：
// 1. 展示预置模型列表（分组：推荐 / 其他）
// 2. 搜索过滤
// 3. "从服务器拉取更多模型"按钮 → 调用 fetch_provider_models
// 4. "手动输入"切换 → 自由文本输入
// 5. 选中的模型高亮显示
```

#### 11.2.4 ApiKeyInput

```typescript
interface ApiKeyInputProps {
  providerId: string
  value: string
  onChange: (value: string) => void
  onProviderDetected?: (providerId: string) => void
  hasStoredKey: boolean
  keyStatus: KeyStatus | null
}

// 功能：
// 1. 输入时实时校验格式
// 2. 粘贴时前缀识别 → 自动切换供应商
// 3. 已存储 Key 掩码展示 + 显示/隐藏切换
// 4. 校验结果提示（error/warning/info）
// 5. Key 状态徽章
```

### 11.3 前端 Gateway 扩展

```typescript
// src/services/gateway/models.ts 扩展

export const apiConfigGateway = {
  // ... 现有方法 ...

  async fetchProviderModels(data: {
    provider: string
    apiKey: string
    baseUrl?: string | null
  }): Promise<DiscoveredModel[]> {
    return invokeWithSchema('fetch_provider_models', z.array(discoveredModelSchema), { data })
  },
}

export const workflowAssignmentGateway = {
  async list(): Promise<WorkflowModelAssignment[]> {
    return invokeWithSchema('list_workflow_assignments', z.array(workflowModelAssignmentSchema))
  },

  async get(workflowType: string): Promise<WorkflowModelAssignment | null> {
    return invokeWithSchema('get_workflow_assignment', workflowModelAssignmentSchema.nullable(), { workflowType })
  },

  async set(data: { workflowType: string; apiConfigId: string }): Promise<WorkflowModelAssignment> {
    return invokeWithSchema('set_workflow_assignment', workflowModelAssignmentSchema, { data })
  },

  async setAll(apiConfigId: string): Promise<WorkflowModelAssignment[]> {
    return invokeWithSchema('set_all_workflow_assignments', z.array(workflowModelAssignmentSchema), { apiConfigId })
  },

  async delete(workflowType: string): Promise<void> {
    return invokeWithSchema('delete_workflow_assignment', z.void(), { workflowType })
  },
}

export const budgetUsageGateway = {
  async get(apiConfigId: string, period?: string): Promise<ProviderBudgetUsage | null> {
    return invokeWithSchema('get_provider_budget_usage', providerBudgetUsageSchema.nullable(), { apiConfigId, period })
  },
}
```

### 11.4 React Query Hooks 扩展

```typescript
// src/queries/apiConfigs.ts 扩展

export const workflowAssignmentQueryKeys = {
  all: ['workflowAssignments'] as const,
  detail: (workflowType: string) => ['workflowAssignments', workflowType] as const,
}

export function useWorkflowAssignmentsQuery() {
  return useQuery({
    queryKey: workflowAssignmentQueryKeys.all,
    queryFn: () => workflowAssignmentGateway.list(),
  })
}

export function useSetWorkflowAssignmentMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { workflowType: string; apiConfigId: string }) =>
      workflowAssignmentGateway.set(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowAssignmentQueryKeys.all })
    },
  })
}

export function useSetAllWorkflowAssignmentsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (apiConfigId: string) =>
      workflowAssignmentGateway.setAll(apiConfigId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowAssignmentQueryKeys.all })
    },
  })
}

export function useFetchProviderModelsMutation() {
  return useMutation({
    mutationFn: (data: {
      provider: string
      apiKey: string
      baseUrl?: string | null
    }) => apiConfigGateway.fetchProviderModels(data),
  })
}

export function useProviderBudgetUsageQuery(apiConfigId: string) {
  return useQuery({
    queryKey: ['budgetUsage', apiConfigId],
    queryFn: () => budgetUsageGateway.get(apiConfigId),
    enabled: !!apiConfigId,
  })
}
```

---

## 12. 迁移策略

### 12.1 Zustand localStorage → api_configs 自动迁移

#### 12.1.1 迁移触发时机

应用启动时（`App.tsx` 或 `main.tsx`），检测 localStorage 中是否存在旧的 `xuejian-app-store` 数据，且其中 `aiConfig` 不为 null。

```typescript
// src/lib/migration.ts

export async function migrateZustandAiConfig(): Promise<boolean> {
  const STORE_KEY = 'xuejian-app-store'

  // 1. 读取 localStorage
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) return false

  try {
    const store = JSON.parse(raw)
    const aiConfig = store?.state?.aiConfig
    if (!aiConfig) return false

    // 2. 检查是否已迁移
    const migrationFlag = localStorage.getItem('xuejian-byok-migrated')
    if (migrationFlag === 'true') return false

    // 3. 创建 api_config 记录
    const provider = mapOldProvider(aiConfig.provider)
    const newConfig = await apiConfigGateway.create({
      provider,
      authMode: 'api_key',
      name: getProviderName(provider),
      baseUrl: aiConfig.baseUrl || null,
      model: aiConfig.model || null,
      budgetLimit: null,
      isDefault: true,
    })

    // 4. 存储 API Key
    if (aiConfig.apiKey) {
      await apiConfigGateway.storeApiKey(newConfig.id, aiConfig.apiKey)
    }

    // 5. 为所有工作流分配该配置
    await workflowAssignmentGateway.setAll(newConfig.id)

    // 6. 标记已迁移
    localStorage.setItem('xuejian-byok-migrated', 'true')

    // 7. 清除旧 aiConfig
    store.state.aiConfig = null
    localStorage.setItem(STORE_KEY, JSON.stringify(store))

    return true
  } catch (e) {
    console.error('BYOK migration failed:', e)
    return false
  }
}

function mapOldProvider(oldProvider: string): string {
  switch (oldProvider) {
    case 'openai': return 'openai'
    case 'anthropic': return 'anthropic'
    case 'google': return 'google'
    case 'openai_compatible': return 'custom_openai'
    default: return 'custom_openai'
  }
}
```

#### 12.1.2 迁移 UI 反馈

迁移成功后，在设置页顶部显示一次性提示：

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ 您的 AI 模型配置已自动迁移到新系统。                      │
│    原配置 (OpenAI · gpt-4) 已导入为供应商配置。              │
│    您现在可以在"工作流模型分配"中为不同功能设置不同模型。      │
│                                                          [×] │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 组件引用迁移

#### 12.2.1 旧引用清理

需要清理所有引用 `useAppStore().aiConfig` / `setAiConfig` / `setAIConfig` 的组件：

```bash
# 搜索旧引用
grep -rn "aiConfig\|setAiConfig\|setAIConfig\|LocalAiConfig" src/
```

**预期需要修改的文件**：
- `src/lib/store.ts` — 删除 `aiConfig`、`setAiConfig`、`setAIConfig`、`LocalAiConfig`
- `src/features/settings/SettingsPage.tsx` — 全面重构（见 11.1 节）
- 其他引用 `aiConfig` 的组件 — 改为使用 `useApiConfigsQuery()` 或 `useWorkflowAssignmentsQuery()`

#### 12.2.2 迁移优先级

| 优先级 | 文件 | 变更 |
|--------|------|------|
| P0 | `SettingsPage.tsx` | 全面重构为新的卡片式布局 |
| P0 | `store.ts` | 删除旧 aiConfig 相关代码 |
| P1 | 引用 aiConfig 的其他组件 | 改用新的 query hooks |
| P2 | `gateway/models.ts` | 新增 fetchProviderModels 等方法 |
| P2 | `queries/apiConfigs.ts` | 新增 workflow/budget hooks |

### 12.3 Python 编排服务双模式运行

迁移期间，Python 编排服务同时支持新旧两种配置获取方式：

```python
# 旧方式（继续工作）
config_with_key = host.get_default_config_with_key()

# 新方式（逐步迁移）
config_with_key = host.get_config_for_workflow("card_generation")
```

`get_config_for_workflow` 内部已实现回退逻辑：如果无工作流分配，自动回退到 `get_default_config_with_key()`，确保迁移期间零中断。

### 12.4 EmbeddingProfile 保持独立

`EmbeddingProfile` 与 `ApiConfig` 是不同的概念：

- `ApiConfig`：描述 LLM 供应商配置（Key + 模型 + 协议）
- `EmbeddingProfile`：描述嵌入模型配置（模型 + 维度 + 距离度量）

两者保持独立管理，原因：
1. 嵌入模型与 LLM 模型是不同类型的模型
2. `EmbeddingProfile` 涉及向量数据库的维度匹配，变更影响更大
3. 当前 `EmbeddingProfile` 已有独立的管理 UI 和 CRUD 命令

---

## 13. 实施路线图

### 13.1 阶段划分

```
Phase 1: 基础设施 (2-3 天)
├── 数据库迁移 (V11__byok_system.sql)
├── Rust 数据结构扩展 (ApiConfig, WorkflowModelAssignment, ProviderBudgetUsage)
├── Rust normalize_provider 扩展
└── TypeScript 类型 + Zod Schema 扩展

Phase 2: 后端命令 (3-4 天)
├── fetch_provider_models 命令实现
├── 工作流分配 CRUD 命令
├── 预算使用命令
├── 连接测试分级改造
├── Host HTTP Gateway 新增端点
└── SettingsRepository 新增方法

Phase 3: 前端核心组件 (4-5 天)
├── 供应商注册表 (ProviderDefinition 常量)
├── 供应商图标组件
├── ProviderCard 组件
├── ProviderConfigDialog 组件
├── ModelSelector 组件
├── ApiKeyInput 组件（含前缀识别+校验+掩码）
├── WorkflowAssignmentPanel 组件
└── BudgetProgressBar 组件

Phase 4: 设置页重构 (3-4 天)
├── SettingsPage 全面重构
├── Zustand aiConfig 自动迁移
├── 旧引用清理
└── Gateway + Query hooks 扩展

Phase 5: Python 编排适配 (2-3 天)
├── HostGatewayClient 扩展
├── 各工作流迁移到 get_config_for_workflow
├── 预算记录集成
└── 端到端测试

Phase 6: 测试与优化 (2-3 天)
├── 单元测试 (Rust + TypeScript)
├── 集成测试
├── 预算估算校准
└── 性能优化
```

### 13.2 依赖关系

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4
                │                        │
                ▼                        ▼
            Phase 5 (Python)      Phase 6 (测试)
```

- Phase 1 是所有后续阶段的前置条件
- Phase 3 依赖 Phase 2 的 IPC 命令
- Phase 4 依赖 Phase 3 的组件
- Phase 5 依赖 Phase 2 的 Gateway 端点
- Phase 6 依赖所有前序阶段

### 13.3 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 供应商 API 变更导致模型列表解析失败 | 模型发现不可用 | 优雅降级到预置模型；错误提示清晰 |
| SQLite 迁移失败 | 应用无法启动 | 迁移在事务中执行；失败时回滚并记录日志 |
| Zustand 迁移丢失 Key | 用户需重新配置 | 迁移前备份 localStorage；迁移后提示确认 |
| 预算估算不准确 | 预算预警失效 | 明确标注"估算值"；后续版本接入精确 token 计费 |
| Anthropic 无模型列表 API | 用户无法发现新模型 | 硬编码预置列表 + 手动输入；版本更新时刷新 |

### 13.4 后续优化方向

以下功能不在本次实施范围内，作为后续优化方向记录：

1. **精确 token 计费**：解析 API 响应中的 `usage` 字段，实现精确用量追踪
2. **预算告警通知**：接近预算上限时推送系统通知
3. **配置 JSON 导入导出**：导出供应商配置（不含 Key）为 JSON 文件
4. **远程模型清单热更新**：从 CDN 拉取最新预置模型列表，无需发版
5. **供应商健康监控**：定时检测供应商 API 可用性，异常时自动切换
6. **多 Key 支持**：同一供应商支持多个 API Key（主备/轮询）
7. **Azure OpenAI 供应商**：独立供应商类型，支持 deployment + api-version 参数
8. **模型性能基准**：记录各模型在工作流中的实际表现（延迟、质量评分）

---

> **文档结束**  
> 本文档为学笺 BYOK 系统的完整设计规格，涵盖 9 轮访谈决策、供应商体系、模型发现、工作流分配、Key 管理、连接测试、预算管控、数据模型、后端架构、前端架构、迁移策略及实施路线图。后续开发应严格遵循本文档，任何变更需经设计评审。

