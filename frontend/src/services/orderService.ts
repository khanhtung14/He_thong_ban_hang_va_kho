/**
 * Order & Reorder Service (SCRUM-28).
 */

import { authenticatedFetch } from "./sessionService";
import { getAuthHeaders } from "./apiClient";
import type {
  ReorderPreviewResponse,
  ReorderCreateRequest,
  ReorderCreateResponse,
} from "../types/reorder";

export interface OrderItemView {
  id: number;
  product_id?: number | null;
  sku: string;
  product_name: string;
  unit_id?: number | null;
  unit_name?: string | null;
  quantity: number;
  unit_price: number;
  floor_price?: number | null;
  total_price: number;
}

export interface OrderDetailView {
  id: number;
  order_id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string | null;
  customer_code?: string | null;
  status: string;
  total_amount: number;
  note?: string | null;
  created_at?: string | null;
  items: OrderItemView[];
}

/**
 * Lấy danh sách xem trước đặt lại đơn hàng (Reorder Preview).
 * Tự động lọc sản phẩm ngừng kinh doanh và lấy giá mới nhất từ PriceLists.
 */
export async function fetchReorderPreview(
  orderId: number
): Promise<ReorderPreviewResponse> {
  const headers = getAuthHeaders();
  const res = await authenticatedFetch(
    `/api/v1/orders/${orderId}/reorder-preview`,
    {
      method: "GET",
      headers,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || `Không thể xem trước đơn đặt lại #${orderId}.`
    );
  }

  return res.json();
}

/**
 * Xác nhận tạo đơn hàng mới từ đơn hàng cũ (Create Reorder).
 */
export async function submitReorder(
  payload: ReorderCreateRequest
): Promise<ReorderCreateResponse> {
  const headers = getAuthHeaders();
  const res = await authenticatedFetch("/api/v1/orders/reorder", {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể đặt lại đơn hàng.");
  }

  return res.json();
}

/**
 * Lấy thông tin chi tiết một đơn hàng theo ID.
 */
export async function fetchOrderDetail(
  orderId: number
): Promise<OrderDetailView> {
  const headers = getAuthHeaders();
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy đơn hàng #${orderId}.`);
  }

  const json = await res.json();
  return json.data || json;
}

/**
 * Lấy danh sách đơn hàng của hệ thống hoặc đại lý.
 */
export async function fetchOrdersList(): Promise<any[]> {
  const headers = getAuthHeaders();
  const res = await authenticatedFetch("/api/v1/orders", {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đơn hàng.");
  }

  const json = await res.json();
  return Array.isArray(json) ? json : json.data || [];
}
