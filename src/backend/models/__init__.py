import sys
from pathlib import Path

from sqlalchemy.orm import synonym

ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = ROOT / "backend"
for target in (str(ROOT), str(BACKEND_ROOT)):
    if target not in sys.path:
        sys.path.insert(0, target)

from app.models.models import *  # noqa: F401,F403


class InventoryStock(Inventory):
    __table__ = Inventory.__table__
    base_quantity = synonym("physical_qty")
    quantity_available = synonym("available_qty")

    @property
    def available_quantity(self):
        return self.quantity_available

    @available_quantity.setter
    def available_quantity(self, value):
        self.quantity_available = value


__all__ = [
    name for name in globals()
    if not name.startswith("_")
]
