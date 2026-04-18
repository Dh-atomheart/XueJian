---
description: Complete a task and close its exec-plan
---

# Complete Task

Use this workflow when a task is finished and ready to be closed.

## Steps

1. **Verify acceptance test coverage**:
   - Run the advisory marker-based validation for the plan:
   ```
   python scripts/docs/validate_acceptance.py --plan {plan-name}
   ```
   - Confirm all acceptance IDs have `@acceptance:` markers in test code.
   - Run tests to confirm they pass:
   ```
   cd xuejian && npm run test -- --run
   ```
   - Update the exec-plan `## Tests` table — all statuses should be ✅.

2. **Run the full pre-commit workflow** — invoke `/pre-commit` and ensure all checks pass.

3. **Update the exec-plan frontmatter**:
   ```yaml
   status: archived
   last_reviewed: <today's date>
   ```

4. **Move the exec-plan** from `docs/exec-plans/active/` to `docs/exec-plans/completed/`.

5. **Update `docs/exec-plans/active/README.md`** — remove the link to the completed plan.

6. **Check for new tech debt** introduced during implementation:
   - If any, add an entry to `docs/exec-plans/tech-debt-tracker.md`.

7. **Check downstream plans** — if other exec-plans had `Depends On` pointing to this plan, note that the dependency is now satisfied.

8. **Run doc garden** to refresh quality score:
```
python scripts/docs/garden.py
```
