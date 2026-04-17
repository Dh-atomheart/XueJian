# MVP阶段模块实施索引

## 阶段目标

MVP 阶段的目标是完整打通“上传文档 -> 生成卡片 -> 贴笺阅读 -> 学习复习 -> 查看反馈”的本地学习闭环，并同步落地桌面端默认视觉系统。

## 模块顺序

1. [M1 平台基础模块](./m1-platform-foundation.md)
2. [M2 文档导入与锚点模块](./m2-document-import-and-anchors.md)
3. [M3 卡片生产线模块](./m3-card-production-line.md)
4. [M4 阅读与贴笺模块](./m4-reading-and-sticky-notes.md)
5. [M5 学习调度模块](./m5-study-scheduling.md)
6. [M6 BYOK 与最小统计模块](./m6-byok-and-minimal-analytics.md)

## 依赖关系

- `M1` 是所有 MVP 模块的基础。
- `M2` 产出 `Document / DocumentAnchor / DocumentChunk`，为 `M3`、`M4` 提供输入。
- `M3` 依赖 `M1` 与 `M2`；其中运行时骨架可先于完整文档处理落地，但 `chunk / save / confirm` 必须在 `M2` 基础稳定后接入。
- `M4` 依赖 `M2` 和 `M3`，负责阅读与贴笺联动。
- `M5` 依赖 `M3` 的 `Card` 与 `ReviewLog` 相关存储。
- `M6` 依赖 `M1` 的 Stronghold、ModelGateway 与统计仓库能力。

## 建议实施顺序

- 第1周先完成 `M1`
- 第2周并行推进 `M2` 基础上传链路与 `M3` 运行时骨架
- 第3周收口 `M2/M3`，再完成 `M4/M5`
- 第4周完成 `M6`、E2E 和整体验收

## 当前阶段实施重点

- 桌面端默认视觉系统已在 MVP 锁定，`M1`、`M4`、`M5`、`M6` 均需遵循统一的纸感壳层与手绘细墨线语言
- `M3` 的人工确认与任务恢复必须支持幂等，不得产生重复正式卡片
- `M4` 和 `M5` 的界面不能退化为移动端复刻布局或企业后台模板风
