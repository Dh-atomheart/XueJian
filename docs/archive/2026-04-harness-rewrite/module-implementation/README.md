# 学笺模块实施文档索引

本目录存放 `module-implementation-plan.md` 的拆分版实施文档。目标是把总文档中的模块说明进一步细化为可直接执行的实施底稿。

## 文档分工

- [ai-architecture-decision.md](../ai-architecture-decision.md)：
  AI 编排架构的单一事实源，定义 Python 服务边界、协议复用策略与 LangChain / LangGraph 定位。
- [spec.md](../spec.md)：
  产品目标、架构边界、阶段定义、全局约束与测试总口径。
- [module-implementation-plan.md](../module-implementation-plan.md)：
  总览、阶段排期、跨模块依赖关系、总任务与总导航。
- `docs/module-implementation/**`：
  每个模块的详细实施计划，包括子任务拆分、数据流、接口契约、预计改动路径、异常边界、测试矩阵与验收清单。

## 冲突处理规则

- 若 AI 编排相关表述与 [ai-architecture-decision.md](../ai-architecture-decision.md) 冲突，以该文档为准。
- 若本目录中的模块文档与总文档在实施细节上冲突，以模块文档为准。
- 若模块文档与 `spec.md` 在阶段边界、功能范围或架构约束上冲突，以 `spec.md` 为准。
- 视觉系统相关事项遵循 MVP 已锁定的默认视觉基线，不得在模块文档中回退为通用后台模板风。

## 阅读顺序

1. 先阅读本文件和目标阶段的 `README.md`
2. 再阅读 [ai-architecture-decision.md](../ai-architecture-decision.md) 中 AI 架构决策
3. 再阅读对应模块文档
4. 实施前回查 [spec.md](../spec.md) 中对应章节
5. 联调前回查 [module-implementation-plan.md](../module-implementation-plan.md) 的依赖图和阶段计划

## 目录

- [MVP阶段](./mvp/README.md)
  - [M1 平台基础模块](./mvp/m1-platform-foundation.md)
  - [M2 文档导入与锚点模块](./mvp/m2-document-import-and-anchors.md)
  - [M3 卡片生产线模块](./mvp/m3-card-production-line.md)
  - [M4 阅读与贴笺模块](./mvp/m4-reading-and-sticky-notes.md)
  - [M5 学习调度模块](./mvp/m5-study-scheduling.md)
  - [M6 BYOK 与最小统计模块](./mvp/m6-byok-and-minimal-analytics.md)
- [V2阶段](./v2/README.md)
  - [V2-1 知识库问答模块](./v2/v2-1-rag.md)
  - [V2-2 积分系统模块](./v2/v2-2-points-system.md)
  - [V2-3 多格式文档导入模块](./v2/v2-3-multi-format-import.md)
- [V3阶段](./v3/README.md)
  - [V3-1 卡片动画生成模块](./v3/v3-1-card-animation.md)
  - [V3-2 AI播客生成模块](./v3/v3-2-ai-podcast.md)
- [V4阶段](./v4/README.md)
  - [V4-1 知识图谱模块](./v4/v4-1-knowledge-graph.md)
  - [V4-2 主题切换与扩展主题模块](./v4/v4-2-theme-switching-and-theme-packs.md)
  - [V4-3 Android能力适配评估模块](./v4/v4-3-android-capability-assessment.md)

## 命名规则

- 阶段目录使用：`mvp/`、`v2/`、`v3/`、`v4/`
- 模块文件统一使用英文 kebab-case 文件名
- 模块 ID 与总文档保持一致，例如 `M4-T3`、`V2-1-T2`
- 新增子任务统一写为 `M4-T3.1`、`V2-1-T2.2`

## 使用约定

- 每个模块文档都必须显式标注：`Module ID`、`Stage`、`Priority`、`Depends On`
- 每个模块文档都包含：交付目标、前置条件、交付物、详细任务拆分、改动路径、接口契约、数据流、异常边界、测试矩阵、验收清单
- 若某文档引入仅实施层使用的中间结构，必须标注为“模块内部实施类型”，不得冒充公共业务模型
- 涉及 AI 编排、任务恢复、模型接入、跨端协议的文档必须服从 [ai-architecture-decision.md](../ai-architecture-decision.md) 与 `spec.md`
