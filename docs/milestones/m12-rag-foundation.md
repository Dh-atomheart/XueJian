# M12：RAG Foundation

## Summary

M12 目标是把现有知识问答骨架重构成可开发、可测试、可失败恢复的 RAG 基础链路。重点不是提升检索效果，而是建立正确契约、清理乱码、阻止伪 RAG。

## 范围

- 重构 `knowledge_qa.py` 的 prompt、JSON 输出和错误处理。
- 明确 RAG 必须 embedding，不做 FTS-only 正式回答。
- 建立 citation 校验：chunkId 必须来自本轮检索结果。
- 修复知识问答相关用户可见乱码文案。
- 保持现有 `workflow_runs + knowledge_qa_messages` 机制。

## 不做

- Reader 跳转。
- 精确高亮。
- 自动制卡。
- 多模型 rerank。
- 完整 background job/checkpoint 化。

## 实现要点

- Python 输出统一 JSON object。
- Prompt 明确只基于 retrieved passages 回答。
- 无证据返回 `answerMode: "no_relevant_content"`。
- LLM 返回 citation 后，后端二次校验并补齐 page/documentId。
- Rust/Python 错误分类至少覆盖：embedding 缺失、provider 超时、非法 JSON、引用无效。
- 前端展示 pending/answered/error/cancelled 状态不出现乱码。

## 验收

- 未配置 embedding profile 时不会调用 LLM。
- LLM 非 JSON 时不会写入伪成功回答。
- citation chunkId 不合法时会被丢弃或使回答失败。
- 成功回答写入 assistant message.answer_payload。
- 取消消息后 workflow_run 和 assistant message 状态一致。

