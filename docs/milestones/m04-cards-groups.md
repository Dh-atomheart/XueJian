# M04：Basic 卡片与分组管理

## 目标

实现 Basic 卡片、全局分组、CRUD、软删除和基础筛选，让用户可以手动建立学习资产。

## 所属 MVP

MVP-0。

## 相对工作量

M。

## 前置条件

- M02 完成。
- M03 至少提供 Document/SourceAnchor 数据用于可选来源绑定。

## 交付内容

- Basic 卡片字段：`title/front/back/source/tags/group`。
- 手动卡来源可空。
- 卡片 CRUD。
- 分组 CRUD。
- 分组启用/暂停。
- 卡片软删除。
- 按分组、文档来源、tags 搜索或筛选。

## 任务分配

### Frontend

- 卡片页列表、筛选、新增、编辑、删除。
- 分组管理入口。
- 删除确认。
- 空、加载、失败状态。

### Rust/Tauri

- cards/card_groups 命令与仓储。
- 同一分组内 front/back 去重提示或拦截。
- 软删除实现。

### Python orchestration

- 无任务。

### Data/Schema

- 使用 cards、card_groups、source_anchors。
- 初始化手动卡的 review_states。

### Tests

- 卡片 CRUD。
- 分组 CRUD。
- 软删除。
- 分组启用/暂停。
- 重复 front/back 处理。

## 不做什么

- 不做 Cloze、Choice、Image Occlusion。
- 不做 APKG。
- 不做 media。
- 不做 card_candidates。
- 不做 AI 自动入库。

## 验收场景

- 用户可以创建一张无来源 Basic 卡片。
- 用户可以把卡片加入分组。
- 用户暂停分组。
- 用户删除卡片后列表不再展示该卡片。
- 用户可按分组筛选卡片。

## 测试要求

- Rust 命令测试覆盖 CRUD。
- 前端测试覆盖新增、编辑、删除和筛选。

## 风险与回退

- 旧复杂卡型残留：MVP UI 只显示 Basic，历史组件先冻结。
- 分组与牌组混淆：文案统一使用“分组”。

## 完成后解锁

M05：每日复习闭环。
