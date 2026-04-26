# 首页设计规范

## 定位

首页是默认落地页，承担“今日任务概览 + 快速入口 + 最近资料 + 轻量信号面板”。

## 页面结构

- Hero：今日任务、积分、连续天数与主 CTA
- 学习概览：今日/本周学习数据
- 热力图：过去一段时间的行为密度
- 最近文档：继续阅读入口
- 右侧栏：Weekly Signal / Workbench State / Desk Note

## 数据绑定

- `useDailyStatsQuery`
- `useStudyStatsQuery`
- `usePointsSummaryQuery`
- `useReviewHeatmapQuery`
- `useDocumentsQuery`
- `useApiConfigsQuery`

## 状态

- 无文档：强调导入入口
- 有任务：主 CTA 为“开始学习”
- 无 AI 配置：右侧栏显示配置入口，不阻断页面浏览
