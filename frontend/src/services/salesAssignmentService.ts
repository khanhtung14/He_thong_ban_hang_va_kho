/**
 * Service for Sales Assignment & Bulk Handover APIs.
 */

import { getAuthHeaders } from "./apiClient";

export interface CustomerItem {
  id: number;
  code: string;
  name: string;
  phone?: string | null;
  sales_rep_id?: number | null;
  region?: string | null;
  territory_id?: number | null;
  customer_group?: string;
  is_active: boolean;
  is_locked: boolean;
  lock_reason?: string | null;
  current_debt?: number;
  debt_limit?: number;
  pending_orders_count?: number;
}

export interface SalesRepUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
}

export interface HandoverRecord {
  id: number;
  code: string;
  handover_date: string;
  created_at: string;
  from_user_id: number;
  from_user_name: string;
  to_user_id: number;
  to_user_name: string;
  transferred_by_id?: number | null;
  transferred_by_name?: string | null;
  customer_count: number;
  customer_ids: number[];
  reason: string;
  notes?: string | null;
}

export interface AssignSalesPayload {
  sales_user_id: number;
  region?: string;
}

export interface BulkHandoverPayload {
  from_user_id: number;
  to_user_id: number;
  customer_ids?: number[] | null;
  reason: string;
  notes?: string;
}

export interface HandoverHistoryResponse {
  items: HandoverRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Lấy danh sách đại lý (hỗ trợ lọc theo NVKD phụ trách, khu vực, từ khóa).
 */
export async function fetchCustomers(params?: {
  is_locked?: boolean;
  search?: string;
  sales_rep_id?: number;
  region?: string;
}): Promise<CustomerItem[]> {
  const query = new URLSearchParams();
  if (params?.is_locked !== undefined) query.set("is_locked", String(params.is_locked));
  if (params?.search) query.set("search", params.search);
  if (params?.sales_rep_id !== undefined) query.set("sales_rep_id", String(params.sales_rep_id));
  if (params?.region) query.set("region", params.region);

  const url = `/api/v1/customers${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đại lý.");
  }
  const data = await res.json();
  // Format could be array or envelope
  return Array.isArray(data) ? data : data.data || [];
}

/**
 * Lấy danh sách nhân viên kinh doanh để chọn trong dropdown.
 */
export async function fetchSalesReps(): Promise<SalesRepUser[]> {
  const res = await fetch("/api/v1/sales/reps", { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách nhân viên kinh doanh.");
  }
  const json = await res.json();
  return json.data || [];
}

/**
 * Gán / Cập nhật người phụ trách chính cho một đại lý.
 */
export async function assignSalesToCustomer(
  customerId: number,
  payload: AssignSalesPayload
): Promise<any> {
  const res = await fetch(`/api/v1/customers/${customerId}/assign-sales`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể phân công đại lý.");
  }
  return res.json();
}

/**
 * Gán hàng loạt danh sách đại lý cho một nhân viên kinh doanh.
 */
export async function assignSalesBatch(
  customerIds: number[],
  salesUserId: number,
  region?: string
): Promise<any> {
  // Gán lần lượt từng đại lý hoặc qua API
  const results = await Promise.all(
    customerIds.map((id) =>
      assignSalesToCustomer(id, { sales_user_id: salesUserId, region })
    )
  );
  return results;
}

/**
 * Bàn giao địa bàn / đại lý hàng loạt khi nhân viên nghỉ hoặc chuyển công tác.
 */
export async function bulkHandoverSales(payload: BulkHandoverPayload): Promise<any> {
  const res = await fetch("/api/v1/sales/handover/batch", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể chuyển giao danh sách đại lý.");
  }
  return res.json();
}

/**
 * Lấy lịch sử chuyển giao địa bàn / đại lý.
 */
export async function fetchHandoverHistory(params?: {
  page?: number;
  limit?: number;
  from_user_id?: number;
  to_user_id?: number;
}): Promise<HandoverHistoryResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.from_user_id) query.set("from_user_id", String(params.from_user_id));
  if (params?.to_user_id) query.set("to_user_id", String(params.to_user_id));

  const url = `/api/v1/sales/handover/history${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải lịch sử bàn giao.");
  }
  const json = await res.json();
  return {
    items: json.data || [],
    total: json.pagination?.totalRecords || (json.data ? json.data.length : 0),
    page: json.pagination?.page || 1,
    limit: json.pagination?.limit || 20,
    totalPages: json.pagination?.totalPages || 1,
  };
}
