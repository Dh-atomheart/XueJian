# 知识问答设计规格

> NavItemId: `knowledge` | 路由组件: `KnowledgeQaPage`（`features/knowledge/`）
> 设计令牌引用: 见总览文档 §设计令牌速查

---

## 1. 页面概述

### 1.1 定位

知识问答是基于文档的**RAG 问答交互页面**，核心职责：

- **文档搜索**：选择提问的文档范围
- **问答交互**：输入问题 → AI 检索文档 → 生成带引用的回答
- **引用跳转**：点击引用可跳转到阅读器对应位置
- **对话历史**：多轮对话上下文（当前刷新丢失，需持久化）

### 1.2 核心用户场景

| 场景 | 用户行为 | 页面响应 |
|------|----------|----------|
| 提问 | 输入问题 → 发送 | 启动 QA 工作流 → 轮询状态 → 展示回答 |
| 查看引用 | 点击引用卡片 | 打开阅读器跳转到对应页 |
| 多轮对话 | 追问 | 保留上下文继续对话 |
| 切换文档 | 更改文档范围 | 清空对话/保留对话重新搜索 |
| 导出对话 | 点击导出 | 生成 Markdown 文件 |

### 1.3 现状评估

KnowledgeQaPage 已完整接入后端，交互完善。改进点为对话持久化和导出功能。

---

## 2. 设计令牌引用

| 元素 | 令牌/组件 | 说明 |
|------|-----------|------|
| 对话区 | `bg-paper-base` | 聊天背景 |
| 用户消息 | `rounded-card bg-highlight-yellow/20` | 用户气泡 |
| AI 消息 | `rounded-card bg-paper-card border border-line-soft` | AI 气泡 |
| 引用卡片 | `rounded-item border border-line-soft bg-paper-card` | 小引用卡 |
| 输入区 | `Panel variant="toolbar"` | 底部输入栏 |
| 输入框 | `rounded-full border border-line-soft bg-paper-card` | 文本输入 |
| 发送按钮 | `Button variant="default" className="rounded-full"` | 发送 |
| 空状态 | `SketchEmptyState illustration="chat"` | 无对话时 |
| 工作流状态 | `font-ui text-xs text-ink-soft` | 排队/检索/生成 |

---

## 3. 布局线框图

```
┌──────────────────────────────────────────────────────────────────┐
│ 知识问答                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ 文档范围: [全部文档 ▼]  ·  模型: GPT-4o Mini                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  ┌─────────────────────────────────────┐                    │ │
│ │  │ 🤖 你好！我是学笺知识助手。          │                    │ │
│ │  │    基于你的文档回答问题。             │                    │ │
│ │  │    试试问我一个关于你文档的问题？     │                    │ │
│ │  └─────────────────────────────────────┘                    │ │
│ │                                                              │ │
│ │                     ┌──────────────────────────────┐         │ │
│ │                     │ 什么是反向传播算法？          │         │ │
│ │                     └──────────────────────────────┘         │ │
│ │                                                              │ │
│ │  ┌─────────────────────────────────────┐                    │ │
│ │  │ 反向传播是一种通过链式法则...         │                    │ │
│ │  │                                     │                    │ │
│ │  │ 📎 引用:                             │                    │ │
│ │  │ ┌──────────────────────────┐        │                    │ │
│ │  │ │ 机器学习基础 p.89        │        │                    │ │
│ │  │ │ "反向传播算法的核心..."   │ [查看] │                    │ │
│ │  │ └──────────────────────────┘        │                    │ │
│ │  └─────────────────────────────────────┘                    │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ [🔍 输入你的问题...                    ] [发送] [导出] [清空]│ │
│ └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. 组件树

```
KnowledgeQaPage（增强）
├── 顶部栏
│   ├── DocumentScopeSelect       ← 已有
│   └── ModelIndicator            ← 已有
│
├── 对话区（scrollable）
│   ├── WelcomeMessage            ← 已有
│   ├── ChatTurn ×N               ← 已有
│   │   ├── UserBubble            ← 已有
│   │   ├── AiBubble              ← 已有
│   │   │   ├── AnswerText        ← 已有
│   │   │   └── CitationCard ×N   ← 已有，改造：增加"在图谱中查看"链接
│   │   └── WorkflowStatus        ← 已有
│   │
│   └── SketchEmptyState          ← 已有，复用（首次进入时）
│
└── 输入区
    ├── QuestionInput             ← 已有
    ├── SendButton                ← 已有
    ├── ExportButton              ← 🆕 新增：导出对话为 Markdown
    └── ClearButton               ← 🆕 新增：清空对话历史
```

---

## 5. 组件接口规格

### 5.1 ExportButton（🆕 新增）

```typescript
interface ExportButtonProps {
  turns: ChatTurn[]
  disabled?: boolean
  className?: string
}
```

**行为**：
- 点击后生成 Markdown 格式的对话记录
- 通过 Tauri dialog 选择保存路径
- 写入文件

**视觉**：`Button variant="ghost" size="sm" className="rounded-full"` + 下载图标

### 5.2 CitationCard 改造

**新增**："在图谱中查看" 链接按钮

```typescript
// CitationCard 新增 prop
interface CitationCardProps {
  // ... 已有 props
  onGoGraph?: (nodeLabel: string) => void  // 🆕 跳转到知识图谱
}
```

**行为**：点击后 `setActiveNavItem('graph')`，并传递节点标签用于定位。

---

## 6. 交互状态矩阵

| 状态 | 触发条件 | 展示 |
|------|----------|------|
| **empty** | 无对话历史 | WelcomeMessage + SketchEmptyState |
| **loading** | QA 工作流运行中 | WorkflowStatus 动画 + skeleton |
| **hasAnswer** | 回答完成 | AI 气泡 + 引用卡片 |
| **error** | 工作流失败 | 错误提示 + 重试 |
| **noService** | 编排服务不可用 | "知识问答服务未启动" + 重试按钮 |

---

## 7. 数据绑定表

| 组件 | 数据项 | Hook | Gateway | Rust 命令 | 状态 |
|------|--------|------|---------|-----------|------|
| 文档搜索 | searchResults | `useKnowledgeSearchQuery()` | 已有 | `search_knowledge` | ✅ |
| QA 工作流 | startQA | `useStartKnowledgeQaMutation()` | 已有 | `start_knowledge_qa_workflow` | ✅ |
| 服务状态 | health | `useOrchestrationHealthQuery()` | 已有 | `get_orchestration_service_health` | ✅ |
| 对话持久化 | chatHistory | 🆕 `useChatHistoryQuery()` | 🆕 | 🆕 `list_chat_sessions` | 🆕 |

**注**：对话持久化需要新增后端支持（SQLite 存储对话记录），为后续优化方向，当前版本不实现。

---

## 8. 响应式策略

| 断点 | 布局 |
|------|------|
| **xl+** | 对话区 `max-w-3xl mx-auto`，输入区固定底部 |
| **lg** | 对话区 `max-w-2xl` |
| **md/sm** | 全宽，引用卡片折叠 |

---

## 9. 可访问性要点

| 元素 | ARIA / 键盘 |
|------|-------------|
| 对话区 | `role="log"` + `aria-live="polite"` |
| 输入框 | `aria-label="输入你的问题"` |
| 引用卡片 | `role="link"` + `aria-label="查看原文引用"` |
| 发送按钮 | Enter 键提交 |

---

## 10. 改造要点

1. **CitationCard 增加"在图谱中查看"链接**：跨页联动到 KnowledgeGraphPage
2. **增加导出按钮**：对话导出为 Markdown
3. **增加清空按钮**：清空当前对话历史
4. **对话持久化**（后续迭代）：需要新增 Rust 命令和 SQLite 表
5. **圆角修正**：硬编码圆角 → token 引用
