# Deprecated Workspace Artifacts

This folder keeps files that were removed from active project locations during the 2026-05-15 repository cleanup.

The cleanup policy is conservative:

- Runtime artifacts and isolated scripts are archived before deletion.
- Source files listed in `docs/unused-code-delete-list.md` are not moved in this pass.
- Local assistant and browser cache files are untracked through Git instead of physically deleted.

Contents:

- `runtime-smoke/`: old smoke-test audio outputs from `runtime/smoke/`.
- `scripts/`: isolated scripts with no current package, CI, README, or workflow references.
