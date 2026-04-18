---
description: Start a new implementation task following the harness workflow
---

# Start Task

Use this workflow when beginning any new feature, bugfix, or refactor.

## Steps

1. **Identify the truth layer** you are about to change:
   - Product scope / phase boundaries → `docs/product-specs/`
   - UI/UX / design system → `docs/design-docs/`
   - One-off implementation task → `docs/exec-plans/active/`
   - Architecture / AI orchestration → `ARCHITECTURE.md`, `docs/references/ai-orchestration.md`

2. **Read the relevant canonical docs** (never skip):
   ```
   AGENTS.md
   ARCHITECTURE.md
   docs/README.md
   ```
   Then read the layer-specific files identified in step 1.

3. **Check for an existing exec-plan** in `docs/exec-plans/active/`:
   - If one exists for your task, read it and verify its `Depends On` chain.
   - If none exists, create one using the template at `docs/exec-plans/active/_template.md`.

4. **Set the exec-plan status to `active`** if it is still `draft`:
   ```yaml
   status: active
   ```

5. **Locate the code** using the `Relevant Files` section of the exec-plan and `docs/references/repo-map-llms.txt`.

6. **Verify dependencies are met** — check that upstream exec-plans listed in `Depends On` are `active` or `archived`.

7. **Review acceptance IDs** — read the `## Tests` table in the exec-plan. Note each `{plan}-a{n}` ID that needs coverage.

8. Begin implementation. Remember:
   - Only edit files in the correct layer.
   - Do not put implementation detail back into `product-specs`.
   - Follow dependency rules in `ARCHITECTURE.md`.
   - Add `// @acceptance:{id}` markers above relevant test blocks as you write tests.
   - Update `## Tests` status from ⏳ to ✅ as criteria are met.
   - Use `/check-acceptance` mid-task to verify progress.
