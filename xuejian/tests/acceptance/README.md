# Acceptance Test Markers

验收测试通过 `@acceptance:<ID>` 标记与 exec-plan 中的 `## Tests` 表格关联。
Agent 自由决定测试放在哪个文件、用什么类型，只需在测试代码中添加标记。

## 标记约定

在测试代码中用注释标记关联的验收 ID：

```typescript
// @acceptance:m4-a1
it('shows associated cards while reading PDF', () => {
  // ...
})
```

- 标记放在 `describe` 或 `it` 块上方
- 一个测试可标记多个 ID：`// @acceptance:m4-a1 @acceptance:m4-a2`
- 标记可出现在任意 `.test.ts` / `.spec.ts` 文件中
- ID 格式：`{plan}-a{n}`（如 `m4-a1`、`v2-1-a3`）

## 测试位置

不强制目录结构。Agent 根据测试性质自由放置：

- `tests/services/` — 服务层集成测试
- `tests/store/` — 状态管理测试
- `tests/types/` — Schema 验证测试
- `tests/e2e/` — Playwright E2E 测试
- 或任何 `tests/` 下的子目录

## 验证

```bash
python scripts/docs/validate_acceptance.py
python scripts/docs/validate_acceptance.py --plan m4-reading-and-sticky-notes
python scripts/docs/validate_acceptance.py --json
```
