"""Backward compatibility bridge for tests importing src.backend.products."""
import sys
import app.api.v1.endpoints.products as _mod

sys.modules[__name__] = _mod
from app.api.v1.endpoints.products import *
