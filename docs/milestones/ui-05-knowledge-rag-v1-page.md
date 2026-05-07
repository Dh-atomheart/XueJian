# UI-05：Knowledge / RAG V1 页面

## 目标

在 MVP UI 稳定后交付独立学习型 RAG 页面，符合 M14 边界。

## 所属阶段

UI 改造路线，V1 / MVP-3 RAG UI。

## 相对工作量

M。

## 前置条件

- UI-01 到 UI-04 完成。
- M12 RAG Foundation 完成。
- M13 RAG Retrieval Quality 完成。
- 如需进入正式主导航，必须同步 `docs/spec.md`；未同步前入口按 `Proposal` 管理。

## 交付内容

- Knowledge/RAG 页面。
- 文档范围选择。
- 可用文档、已选文档、向量状态展示。
- 不可用文档禁用提交并说明原因。
- 问题输入、提交、取消、重试。
- pending、answered、error、cancelled、no_relevant_content 状态。
- 结构化中文回答。
- 引用卡片展示页码和相关内容片段。

## 接口与类型变化

- 前端导航可新增 `knowledge`，但仅在产品路线同步后作为正式主导航项。
- 复用现有 Knowledge QA gateway 和 answer payload，不新增第二套 RAG API。
- citations UI 只依赖 `page/snippet/documentId/chunkId` 等现有回答字段。

## 任务分配

### Frontend

- 打磨 Knowledge QA 页面为独立学习型问答界面。
- 展示文档可用性和向量状态。
- 按 answer payload 渲染结构化回答和 citations。
- 覆盖 pending、cancelled、error、no_relevant_content。
- 清理知识问答可见乱码文案。

### Rust/Tauri

- 复用现有 Knowledge commands 和 gateway。
- 不新增第二套 RAG API。

### Python orchestration

- 复用 M12/M13 的 RAG workflow。

### Data/Schema

- 复用 knowledge conversations/messages 和 answer payload。

### Tests

- Knowledge QA 页面测试。
- answer payload 渲染测试。
- embedding missing 测试。
- no evidence 测试。
- cancelled/error 状态测试。
- citations 不显示虚假来源测试。

## 不做什么

- 不做 Reader 跳转。
- 不做 PDF 高亮。
- 不做自动制卡。
- 不做推荐追问。
- 不做开放域聊天。
- 不做 FTS-only 正式回答。

## 验收场景

- 未向量化文档不会被误认为可问答。
- 有引用答案展示页码和片段。
- 无证据回答不显示虚假来源。
- 取消后 UI 不继续 pending。
- 所有知识问答可见文案无乱码。

## 风险与回退

- `knowledge` 导航与 `spec.md` 冲突：未同步路线前保持 Proposal，不进入正式主导航验收。
- RAG 状态不完整：以 M14 的 pending、answered、error、cancelled、no_relevant_content 为最小验收。

## 完成后解锁

后续可评估 VNext：Reader 跳转、引用定位、自动制卡、推荐追问；这些能力必须另立路线，不并入 UI-05。
