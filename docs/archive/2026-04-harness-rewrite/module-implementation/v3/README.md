# V3阶段模块实施索引

## 阶段目标

V3 为现有学习闭环增加多媒体表达能力，包括卡片动画和 AI 播客，同时保持长任务可恢复、可取消、可控预算。

本阶段的 AI 长任务默认按 `LangChain-first` 的 `PresetWorkflow` 设计，运行边界遵循 [ai-architecture-decision.md](../../ai-architecture-decision.md)。

## 模块顺序

1. [V3-1 卡片动画生成模块](./v3-1-card-animation.md)
2. [V3-2 AI播客生成模块](./v3-2-ai-podcast.md)

## 依赖关系

- `V3-1` 依赖 `M3` 的卡片数据与长任务框架
- `V3-2` 依赖 `V2-1` 的知识范围和 `WorkflowRun` / 预算控制能力

## 建议实施顺序

- 先落地 `V3-1` 的脚本生成与预览链路
- 再扩展到 `V3-2` 的提纲、脚本、TTS 与拼接链路

## 当前阶段实施重点

- 预设工作流通过 `Python Orchestration Service` 调度，Host 继续持有预算、文件和任务状态边界
- 资源文件必须可清理、任务失败必须可重试、预算中止必须保留原因和中间上下文
