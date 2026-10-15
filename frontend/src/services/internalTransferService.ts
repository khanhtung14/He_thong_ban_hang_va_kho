/**
 * Internal Warehouse Transfers API Service.
 * Handles creating, confirming, fetching, and cancelling internal transfers.
 */

import { authenticatedFetch } from "./sessionService";
import type {
  InternalTransfer,
  CreateTransferPayload,
  ConfirmTransferPayload,
  WarehouseOption,
  ProductOption,
} from "../types/internalTransfer";

export async function fetchInternalTransfers(params?: {
  warehouse_id?: number;
  status?: string;
  search?: string;
}): Promise<InternalTransfer[]> {
  const query = new URLSearchParams();
  if (params?.warehouse_id) query.set("warehouse_id", String(params.warehouse_id));
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);

  const url = `/api/internal-transfers${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách phiếu chuyển kho.");
  }
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

export async function fetchInternalTransferDetail(id: number): Promise<InternalTransfer> {
  const res = await authenticatedFetch(`/api/internal-transfers/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy phiếu chuyển kho ID ${id}.`);
  }
  const json = await res.json();
  return json.data;
}

export async function createInternalTransfer(
  payload: CreateTransferPayload
): Promise<InternalTransfer> {
  const res = await authenticatedFetch("/api/internal-transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.detail || "Không thể lập phiếu chuyển kho nội bộ.");
  }
  return json.data;
}

export async function confirmInternalTransfer(
  id: number,
  payload: ConfirmTransferPayload
): Promise<InternalTransfer> {
  const res = await authenticatedFetch(`/api/internal-transfers/${id}/confirm`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.detail || "Không thể xác nhận nhận hàng chuyển kho.");
  }
  return json.data;
}

export async function cancelInternalTransfer(id: number): Promise<InternalTransfer> {
  const res = await authenticatedFetch(`/api/internal-transfers/${id}/cancel`, {
    method: "POST",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.detail || "Không thể hủy phiếu chuyển kho.");
  }
  return json.data;
}

export async function fetchWarehouses(): Promise<WarehouseOption[]> {
  try {
    const res = await authenticatedFetch("/api/v1/warehouses");
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

export async function fetchProducts(warehouseId?: number): Promise<ProductOption[]> {
  try {
    // 1. Lấy danh sách sản phẩm cơ bản
    const res = await authenticatedFetch("/api/v1/products?limit=100");
    if (!res.ok) return [];
    const json = await res.json();
    const rawProducts = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];

    // 2. Nếu có warehouseId, lấy thêm thông tin tồn kho
    let stockMap: Record<number, number> = {};
    if (warehouseId) {
      try {
        const invRes = await authenticatedFetch(`/api/v1/inventory/items?warehouse_id=${warehouseId}`);
        if (invRes.ok) {
          const invJson = await invRes.json();
          const items = Array.isArray(invJson.data) ? invJson.data : Array.isArray(invJson) ? invJson : [];
          for (const item of items) {
            const pId = item.product_id || item.productId;
            const qty = item.quantity_available ?? item.quantityAvailable ?? item.base_quantity ?? 0;
            if (pId) stockMap[pId] = qty;
          }
        }
      } catch {
        // Fallback gracefully
      }
    }

    return rawProducts.map((p: any) => ({
      id: p.id,
      sku: p.sku || `SKU-${p.id}`,
      name: p.name || p.product_name,
      base_unit: p.base_unit || p.baseUnit || p.unit || "Cái",
      available_qty: stockMap[p.id] !== undefined ? stockMap[p.id] : (p.stock_available ?? p.stockAvailable ?? 100),
    }));
  } catch {
    return [];
  }
}
