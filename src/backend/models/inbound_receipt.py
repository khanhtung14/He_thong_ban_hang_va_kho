"""Inbound Receipt and Location Inventory models for SCRUM-30."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.backend.models import (
    Base,
    Product,
    StorageLocation,
    Supplier,
    User,
    Warehouse,
)


class ReceiptStatus(str, Enum):
    DRAFT = "DRAFT"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class InboundReceipt(Base):
    __tablename__ = "inbound_receipts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    supplier_id: Mapped[int] = mapped_column(
        ForeignKey("suppliers.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    status: Mapped[ReceiptStatus] = mapped_column(
        SqlEnum(ReceiptStatus, native_enum=False, length=20),
        default=ReceiptStatus.DRAFT,
        nullable=False,
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    supplier: Mapped["Supplier"] = relationship("Supplier", foreign_keys=[supplier_id])
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", foreign_keys=[warehouse_id])
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    details: Mapped[List["InboundReceiptDetail"]] = relationship(
        "InboundReceiptDetail",
        back_populates="receipt",
        cascade="all, delete-orphan",
    )


class InboundReceiptDetail(Base):
    __tablename__ = "inbound_receipt_details"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    receipt_id: Mapped[int] = mapped_column(
        ForeignKey("inbound_receipts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    batch_lot: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("storage_locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    receipt: Mapped["InboundReceipt"] = relationship("InboundReceipt", back_populates="details")
    product: Mapped["Product"] = relationship("Product", foreign_keys=[product_id])
    storage_location: Mapped[Optional["StorageLocation"]] = relationship(
        "StorageLocation", foreign_keys=[storage_location_id]
    )


class LocationInventory(Base):
    """Model tracking inventory at warehouse + storage_location + batch_lot level (table inventories)."""
    __tablename__ = "inventories"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "warehouse_id",
            "storage_location_id",
            "batch_lot",
            name="uq_inventories_prod_wh_loc_batch",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    warehouse_id: Mapped[int] = mapped_column(
        ForeignKey("warehouses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_location_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("storage_locations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    batch_lot: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    product: Mapped["Product"] = relationship("Product", foreign_keys=[product_id])
    warehouse: Mapped["Warehouse"] = relationship("Warehouse", foreign_keys=[warehouse_id])
    storage_location: Mapped[Optional["StorageLocation"]] = relationship(
        "StorageLocation", foreign_keys=[storage_location_id]
    )


# Aliases for convenience
InventoryLocation = LocationInventory
Inventories = LocationInventory
