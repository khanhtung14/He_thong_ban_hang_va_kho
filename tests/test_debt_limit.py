"""Tests for 'Kiểm soát hạn mức công nợ' (Debt Limit Control)."""

from __future__ import annotations

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_path = Path(__file__).resolve().parents[1] / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from backend.tests.test_debt_limit import *  # Re-export all tests
