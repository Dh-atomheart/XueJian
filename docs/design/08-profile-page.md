# 我的设计规范

## 定位

“我的”是学习结果页，用于汇总学习进度、热力图、掌握结构和积分流水。

## 页面结构

- 顶部：总览标题与回到任务的 CTA
- 指标带：学习天数、文档数、卡片总量、连续记录
- 主区：概览、掌握进度、热力图、积分台账
- 右侧：当前状态与下一步动作

## 数据绑定

- `useStudyStatsQuery`
- `useMasteryBreakdownQuery`
- `useReviewHeatmapQuery`
- `usePointsSummaryQuery`
- `usePointsLedgerQuery`
- `useDocumentsQuery`

## 设计要求

- 指标与下一步动作并重
- 不做重装饰型仪表盘，优先可读性与回流效率
