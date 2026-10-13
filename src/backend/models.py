"""Backward compatibility bridge for tests importing src.backend."""
try:
    from app.models.models import *
except ModuleNotFoundError:
    import sys
    from pathlib import Path

    backend_path = str(Path(__file__).resolve().parents[2] / "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    from app.models.models import *
