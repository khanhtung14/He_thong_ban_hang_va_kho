"""Backward compatibility bridge for tests importing src.backend.customers."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

import app.api.v1.endpoints.customers as _mod
from app.api.v1.endpoints.customers import *  # noqa: F401,F403

sys.modules[__name__] = _mod
