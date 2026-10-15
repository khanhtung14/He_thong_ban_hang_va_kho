from __future__ import annotations

import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

ROOT = Path(__file__).resolve().parents[2]
for target in (str(ROOT), str(ROOT / "backend")):
    if target not in sys.path:
        sys.path.insert(0, target)

try:
    from backend.main import app as app
except ImportError:
    from main import app as app  # type: ignore

__all__ = ["app"]

