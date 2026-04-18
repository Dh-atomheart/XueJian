---
description: Check acceptance test coverage for the current plan
---

# Check Acceptance

Lightweight mid-implementation check. Use this to see which acceptance IDs are covered by `@acceptance:` markers in test code.

## Steps

1. **Identify the current exec-plan** — find the plan you are working on in `docs/exec-plans/active/`.

2. **Run the acceptance coverage check** for the specific plan:
// turbo
```
python scripts/docs/validate_acceptance.py --plan {plan-name}
```

3. **Review uncovered IDs** — for each missing ID, decide:
   - Is this acceptance point testable at the current stage?
   - What test type fits best (Vitest integration, E2E, or script)?
   - Where should the test live?

4. **Run existing marked tests** to confirm they pass:
// turbo
```
cd xuejian && npm run test -- --run
```

5. **Update the exec-plan** `## Tests` table — change status from ⏳ to ✅ for newly covered IDs.
