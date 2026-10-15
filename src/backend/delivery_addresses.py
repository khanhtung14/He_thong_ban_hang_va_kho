"""Bridge module for delivery_addresses endpoints."""
try:
    from app.api.v1.endpoints.delivery_addresses import *
except ModuleNotFoundError:
    import sys
    from pathlib import Path
    backend_path = str(Path(__file__).resolve().parents[2] / "backend")
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    from app.api.v1.endpoints.delivery_addresses import *
