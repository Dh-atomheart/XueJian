---
description: Create a new exec-plan from the standard template
---

# New Exec Plan

Use this workflow when you need to create a new implementation plan.

## Steps

1. **Copy the template** from `docs/exec-plans/active/_template.md` to a new file:
   - Naming convention: `<phase>-<short-slug>.md` (e.g., `m2-document-import-and-anchors.md`, `v2-1-rag.md`).

2. **Fill in all sections**:
   - `title`: concise English title matching the filename.
   - `status`: start as `draft`; change to `active` when work begins.
   - `owner`: `platform`, `app`, or `product`.
   - `Goal`: one paragraph in Chinese describing what this plan delivers.
   - `Depends On`: relative links to upstream plans or specs.
   - `Scope`: 3-6 bullet points of what is in scope.
   - `Acceptance`: at least 3 mechanically verifiable criteria.
   - `Tests`: create one row per Acceptance entry using the existing 3-column schema `ID | 验收点 | 状态`.
   - `Tests`: use `{plan}-a{n}` IDs and start each row at `⏳`.
   - `Relevant Files`: list expected code paths and note whether they already exist.
   - `Checks`: standard check commands.
   - `Notes`: constraints, non-goals, or risks.
   - If likely test locations are worth recording, note them elsewhere in the plan instead of adding columns to `## Tests`.

3. **Add the plan to the index** in `docs/exec-plans/active/README.md` under the correct phase heading.

4. **Run validation** to ensure frontmatter is correct:
// turbo
```
python scripts/docs/validate.py
```
