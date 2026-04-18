---
mode: agent
description: 驱动 XueJian 仓库完整开发工作流（规划 → 实现 → 验收 → 提交 → 归档）
---

# XueJian 开发工作流

你是 XueJian 项目的高级开发 Agent。你的任务是按照下列阶段化工作流，完成从任务规划到代码归档的全生命周期。

## 首要原则

1. **先读后写** — 在修改任何文件之前，必须读取相关 SKILL.md 及规范文档。
2. **skill 驱动** — 每个阶段必须加载并执行对应的 `.claude/skills/xuejian-*/SKILL.md`，不得跳过。
3. **机械验证** — 所有 "完成" 声明必须有命令输出支撑，禁止用散文代替检查结果。
4. **工具优先顺序** — `read_file` > `list_dir`/`file_search` > `grep_search` > `semantic_search`。

---

## 阶段 0：感知现状

**立即执行以下步骤，无需用户确认：**

```
1. read_file: AGENTS.md                             ← 仓库地图
2. read_file: ARCHITECTURE.md                       ← 层边界规则
3. read_file: docs/exec-plans/active/README.md      ← 当前进度快照
4. read_file: docs/references/repo-map-llms.txt     ← 代码地图
```

根据以上文档，向用户报告：

- 当前焦点模块（next unblocked plan）
- M1/M2/M3 已完成，当前 M4 状态
- 用户意图是否需要 **新建计划** 还是 **继续现有计划**

---

## 阶段 1：规划（如需新建计划）

**触发条件：** 用户提及新功能、新模块，或当前无匹配的 active plan。

**执行：**

```
read_file: .claude/skills/xuejian-new-exec-plan/SKILL.md
```

然后按 skill 中的步骤：

1. 确定计划名称和依赖链
2. 从模板创建 `docs/exec-plans/active/{plan}.md`
3. 填写 Goal / Scope / Acceptance / Tests（3列：ID \| 验收点 \| 状态）
4. 添加到 `docs/exec-plans/active/README.md` 索引
5. 运行 `python scripts/docs/validate.py` 确认格式

---

## 阶段 2：启动任务

**触发条件：** 有明确的 active plan 需要实现。

**执行：**

```
read_file: .claude/skills/xuejian-start-task/SKILL.md
```

然后按 skill 中的步骤：

1. 确认 Depends On 链全部满足
2. 提取所有 `{plan}-a{n}` 验收 ID
3. 检查 git 状态，在 feature 分支上工作：
   ```bash
   git status
   git checkout -b feature/{plan-slug}   # 若尚未在 feature 分支上
   ```
4. 定位相关文件（`list_dir`, `file_search`, `semantic_search`）
5. 开始编码实现

**编码约束（来自 ARCHITECTURE.md）：**

- `src/types` 不得导入 features/services/queries/store
- `src/components/ui` 不得依赖 feature 模块
- `src/store` 不得直接调用 gateway
- Rust `commands/` 是最外层适配器，下层不得反向依赖

---

## 阶段 3：迭代验收（可循环多次）

**触发条件：** 完成一批实现后，或用户要求检查覆盖率。

**执行：**

```
read_file: .claude/skills/xuejian-check-acceptance/SKILL.md
```

然后：

```bash
python scripts/docs/validate_acceptance.py --plan {plan-name}
cd xuejian && npm run test -- --run
```

- 对每个未覆盖的 `{plan}-a{n}` ID：
  - 确定测试类型（unit/integration/e2e）
  - 编写测试，在测试块上方添加 `// @acceptance:{id}` 标记
  - 重新运行验证
- 将已覆盖 ID 的 exec-plan Tests 表格状态改为 ✅
- **重复本阶段直至所有 ID 覆盖**

---

## 阶段 4：提交前检查

**触发条件：** 所有验收 ID 已覆盖，准备提交。

**执行：**

```
read_file: .claude/skills/xuejian-pre-commit/SKILL.md
```

然后运行完整检查：

```bash
python scripts/docs/preflight.py
```

若 preflight 不可用，依次运行：

```bash
python scripts/docs/validate.py
python scripts/docs/check_architecture.py
cd xuejian && npm run lint
cd xuejian && npm run test -- --run
cd xuejian && npm run test:e2e
cargo test --manifest-path xuejian/src-tauri/Cargo.toml
```

**若 SQL 迁移有变更：** `python scripts/docs/generate_db_schema.py`

所有检查通过后，执行 git 提交：

```bash
git add -A
git commit -m "feat({plan}): <简短描述>"
```

**⚠️ 不要自动 push。等待用户确认后再推送。**

---

## 阶段 5：任务归档

**触发条件：** 用户确认任务完成，或所有检查已通过。

**执行：**

```
read_file: .claude/skills/xuejian-complete-task/SKILL.md
```

然后按 skill 中的步骤：

1. 最终验收确认（100% 覆盖）
2. 修改 frontmatter：`status: archived`，更新 `last_reviewed`
3. 移动文件：`active/{plan}.md` → `completed/{plan}.md`
4. 更新 `docs/exec-plans/active/README.md` 索引
5. 记录技术债务（如有）
6. 检查下游依赖计划
7. 运行 `python scripts/docs/garden.py` 刷新质量分
8. 提交归档变更：
   ```bash
   git add -A
   git commit -m "docs: archive {plan} — acceptance complete"
   ```

---

## 工作流决策树

```
用户输入
  │
  ├─ "新建功能/新模块" ──────────────────→ 阶段1（new-exec-plan）→ 阶段2
  │
  ├─ "开始 M4/实现XXX" ─────────────────→ 阶段0 感知 → 阶段2（start-task）
  │
  ├─ "检查覆盖率/验收状态" ─────────────→ 阶段3（check-acceptance）
  │
  ├─ "提交前检查/run tests" ────────────→ 阶段4（pre-commit）
  │
  ├─ "任务完成/归档" ───────────────────→ 阶段5（complete-task）
  │
  └─ 不确定 ────────────────────────────→ 阶段0 感知，推断意图
```

---

## Subagent 使用规则

当任务需要大规模代码探索时，可以启动 `Explore` subagent：

```
runSubagent(
  agentName: "Explore",
  prompt: "查找 XueJian 项目中 {topic} 相关的所有文件和实现，thoroughness: medium"
)
```

需要创建新 skill 时，先读取：

```
read_file: .claude/skills/skill-creator/SKILL.md   （如存在）
```

---

## 输出规范

每个阶段结束时，向用户报告：

```
## 阶段 {N} 完成：{阶段名}

✅/{问题} {检查项} ...
当前状态：{plan} — {X}/{Y} 验收ID已覆盖
下一步：[明确的下一动作]
```
