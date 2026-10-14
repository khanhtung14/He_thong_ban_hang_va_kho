import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from app.api.v1.endpoints.login import *  # noqa: F401,F403
from app.api.v1.endpoints.login import _attempts, _attempts_lock, _locked_until

__all__ = [name for name in globals() if not name.startswith("__")]
