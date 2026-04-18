---
description: Run all pre-commit checks before pushing code
---

# Pre-commit Checks

Run this workflow before every commit or push to catch regressions early.

## Steps

1. **Run the preflight script**:
// turbo
```
python scripts/docs/preflight.py
```
   It currently runs:
   - `python scripts/docs/validate.py`
   - `python scripts/docs/check_architecture.py`
   - `cd xuejian && npm run lint`
   - `cd xuejian && npm run test -- --run`

2. If preflight is not available, run checks individually:

// turbo
```
python scripts/docs/validate.py
```

// turbo
```
python scripts/docs/check_architecture.py
```

// turbo
```
cd xuejian && npm run lint
```

// turbo
```
cd xuejian && npm run test -- --run
```

3. **Run additional manual checks when relevant**:
   - If Rust code changed:
   ```
   cargo test --manifest-path xuejian/src-tauri/Cargo.toml
   ```
   - If E2E coverage or app-shell behavior changed:
   ```
   cd xuejian && npm run test:e2e
   ```

4. **If you changed SQL migrations**, also run:
```
python scripts/docs/generate_db_schema.py
```

5. **If you changed `xuejian/package.json` scripts**, verify command sync:
   - Check that `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, and `xuejian/AGENTS.md` all reflect the new scripts.

6. **Review any failing checks** and fix before committing. Do not suppress or skip checks.
