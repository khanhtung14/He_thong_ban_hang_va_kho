import React from "react";

export type RoleKey = "customer" | "sales" | "salesManager" | "warehouse" | "warehouseManager" | "accountant" | "admin";
export type ViewItem = { id: string; label: string; icon: React.ReactNode; section?: string };
export type Product = { sku: string; name: string; category?: string; sale_price: number; stock_available?: number; unit?: string; cost_price?: number; margin?: string };
export type InventoryItem = { sku: string; name: string; warehouse_id: number; warehouse_name: string; quantity_available: number };
export type UserRole = string | { code: string; name: string };
export type AssignmentOption = { id: number; code: string; name: string };
export type UserRow = { id: number; username: string; full_name: string; email?: string; phone?: string | null; status: string; is_active?: boolean; roles: UserRole[]; territories?: AssignmentOption[]; assigned_dealers_count?: number };

export const formatMoney = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);

export const glassCardStyle = {
  background: "rgba(255, 255, 255, 0.6)",
  backdropFilter: "blur(24px)",
  border: "1px solid rgba(255, 255, 255, 0.7)",
  boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
  borderRadius: 16,
  color: "#0F172A"
};
