from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from lib import APP_ROOT, REPO_ROOT


STEPS: list[tuple[str, list[str], Path | None]] = [
    ("Validate docs", [sys.executable, "scripts/docs/validate.py"], REPO_ROOT),
    ("Check architecture", [sys.executable, "scripts/docs/check_architecture.py"], REPO_ROOT),
    ("Lint", ["npm", "run", "lint"], APP_ROOT),
    ("Test", ["npm", "run", "test", "--", "--run"], APP_ROOT),
]


def main() -> int:
    failed: list[str] = []
    for label, cmd, cwd in STEPS:
        print(f"\n{'='*60}")
        print(f"  {label}")
        print(f"{'='*60}\n")
        result = subprocess.run(
            cmd,
            cwd=cwd or REPO_ROOT,
            check=False,
            shell=(sys.platform == "win32"),
        )
        if result.returncode != 0:
            failed.append(label)
            print(f"\n  !! {label} FAILED (exit {result.returncode})")
        else:
            print(f"\n  OK {label}")

    print(f"\n{'='*60}")
    if failed:
        print(f"  PREFLIGHT FAILED: {', '.join(failed)}")
        print(f"{'='*60}")
        return 1
    else:
        print("  ALL PREFLIGHT CHECKS PASSED")
        print(f"{'='*60}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
