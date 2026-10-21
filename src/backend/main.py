import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
for target in (str(ROOT), str(ROOT / "backend")):
    if target not in sys.path:
        sys.path.insert(0, target)

from backend.main import *  # noqa: F401,F403
