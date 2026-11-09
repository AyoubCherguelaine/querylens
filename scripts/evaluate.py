#!/usr/bin/env python3
"""CLI entrypoint for running the QueryLens Agent Evaluation Framework."""

import os
import sys
from pathlib import Path

# Auto-detect project .venv if dependencies are not in current Python environment
venv_python = Path(__file__).resolve().parent.parent / ".venv" / "bin" / "python"
if venv_python.exists() and sys.executable != str(venv_python):
    try:
        import asyncpg  # noqa: F401
    except ImportError:
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.evaluation.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
