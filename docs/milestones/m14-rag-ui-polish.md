# M14：RAG UI Polish

## Summary

M14 目标是把知识问答页面打磨到可用状态。重点是状态表达、引用展示、错误引导和取消体验。

## 范围

- 知识问答页展示可用文档、已选文档、向量状态。
- 未向量化或 embedding 过期时，引导用户先生成向量。
- 回答区域展示结构化答案。
- 引用区域展示页面和相关内容片段。
- 支持 pending、answered、error、cancelled 状态。
- 清理用户可见乱码文案。

## 不做

- Reader 跳转。
- PDF 高亮。
- 引用定位动画。
- 自动生成卡片。
- 推荐追问。

## 实现要点

- 文档选择器只允许已向量化文档进入正式问答。
- 如果用户选择了不可用文档，提交按钮禁用并展示原因。
- citations 展示格式：

```text
P.12
相关内容片段...
```

- `answerMode: "no_relevant_content"` 使用明确的学习型文案。
- provider timeout、invalid JSON、cancelled 都要有可读提示。
- 不承诺未实现的 Reader 跳转。

## 验收

- 所有知识问答可见文案无乱码。
- 未 embedding 文档不会被误认为可问答。
- 有引用答案展示页面号和片段。
- 无引用或无证据答案不显示虚假来源。
- 取消后 UI 不继续显示 pending。

