/**
 * Pick List & Batch Picking Service (EP-06 / SCRUM-36 / SCRUM-40).
 * Handles API calls for batch picking and warehouse execution.
 */

import { authenticatedFetch } from "./sessionService";

export interface PendingOrder {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string;
  status: string;
  total_amount: number;
  total_items: number;
  created_at?: string;
  warehouse_id?: number;
}

export interface PickListDetail {
  id: number;
  pick_list_id: number;
  product_id: number;
  sku?: string;
  product_name?: string;
  unit_name?: string;
  location_id?: number;
  location_code?: string;
  pick_sequence: number;
  required_qty: number;
  actual_qty: number;
  missing_reason?: string | null;
  order_ids?: number[];
  is_completed: boolean;
  status: string;
}

export interface PickList {
  id: number;
  code: string;
  warehouse_id?: number;
  order_id?: number;
  order_ids?: number[];
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | string;
  total_items: number;
  total_required_qty: number;
  total_actual_qty: number;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  details: PickListDetail[];
}

export interface PickListItemExecute {
  detail_id: number;
  actual_qty: number;
  missing_reason?: string | null;
  is_completed: boolean;
}

export interface PickListExecutePayload {
  items: PickListItemExecute[];
  note?: string;
}

/**
 * 1. Lấy danh sách các đơn hàng đã duyệt sẵn sàng để gom phiếu soạn (Batch Picking)
 */
export async function getPendingApprovedOrders(
  warehouseId?: number
): Promise<PendingOrder[]> {
  const url = warehouseId
    ? `/api/pick-lists/pending-orders?warehouse_id=${warehouseId}`
    : "/api/pick-lists/pending-orders";
  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đơn hàng đã duyệt.");
  }
  return res.json();
}

/**
 * 2. Tạo phiếu soạn hàng gộp từ nhiều đơn hàng (Batch Picking)
 */
export async function createBatchPickList(
  orderIds: number[],
  warehouseId?: number,
  note?: string
): Promise<PickList> {
  const res = await authenticatedFetch("/api/pick-lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_ids: orderIds,
      warehouse_id: warehouseId,
      note,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo phiếu soạn hàng.");
  }
  return res.json();
}

/**
 * 3. Lấy danh sách phiếu soạn hàng
 */
export async function getPickLists(
  warehouseId?: number,
  status?: string
): Promise<PickList[]> {
  const params = new URLSearchParams();
  if (warehouseId) params.append("warehouse_id", String(warehouseId));
  if (status) params.append("status", status);
  const q = params.toString();
  const url = `/api/pick-lists${q ? `?${q}` : ""}`;

  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách phiếu soạn.");
  }
  return res.json();
}

/**
 * 4. Lấy chi tiết phiếu soạn hàng theo ID
 */
export async function getPickListById(id: number): Promise<PickList> {
  const res = await authenticatedFetch(`/api/pick-lists/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải chi tiết phiếu soạn hàng.");
  }
  return res.json();
}

/**
 * 5. Cập nhật tiến độ soạn hàng thực tế (Execute Pick List)
 * Có validate nghiêm ngặt nếu actual_qty < required_qty mà thiếu missing_reason.
 */
export async function executePickList(
  id: number,
  payload: PickListExecutePayload
): Promise<PickList> {
  const res = await authenticatedFetch(`/api/pick-lists/${id}/execute`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể cập nhật tiến độ soạn hàng.");
  }
  return res.json();
}
