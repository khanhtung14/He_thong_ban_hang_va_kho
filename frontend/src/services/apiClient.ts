/**
 * Centralized API & Authentication Client for OMS Dashboard.
 * All requests use relative URLs to support both Vite dev server (port 5173 with proxy)
 * and FastAPI direct deployment (port 8000).
 */

import { authenticatedFetch } from "./sessionService";

import type { components } from "../types/api.generated";

export type UserProfile = components["schemas"]["UserProfileResponse"];
export type ProductMarginDetail = components["schemas"]["ProductMarginDetail"];
export type SalesMarginReport = components["schemas"]["SalesMarginReportResponse"];
export type PriceListLine = components["schemas"]["PriceLine"];
export type PriceListItem = components["schemas"]["PriceListView"];

export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;

  // 1. Session Storage
  const sessionAccess = window.sessionStorage?.getItem("access_token");
  if (sessionAccess) return sessionAccess;
  const sessionToken = window.sessionStorage?.getItem("session_token");
  if (sessionToken) return sessionToken;

  // 2. Local Storage
  const localAccess = window.localStorage?.getItem("access_token");
  if (localAccess) return localAccess;
  const localToken =
    window.localStorage?.getItem("token") ||
    window.localStorage?.getItem("session_token");
  if (localToken) return localToken;

  // 3. Document Cookie
  if (typeof document !== "undefined" && document.cookie) {
    const cookies = document.cookie.split("; ");
    for (const cookie of cookies) {
      const [name, val] = cookie.split("=");
      if (
        name === "access_token" ||
        name === "token" ||
        name === "session_token"
      ) {
        return decodeURIComponent(val || "");
      }
    }
  }

  return null;
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export const fetchProfile = async (): Promise<UserProfile> => {
  const res = await authenticatedFetch("/api/v1/profile");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải thông tin tài khoản.");
  }
  return res.json();
};

export const fetchSalesMarginReport = async (): Promise<SalesMarginReport> => {
  const headers = getAuthHeaders();
  const res = await fetch("/api/v1/reports/sales-margin", { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || "Không thể tải báo cáo doanh số & biên lợi nhuận.",
    );
  }
  return res.json();
};

export const fetchPriceLists = async (): Promise<PriceListItem[]> => {
  const headers = getAuthHeaders();
  const res = await fetch("/api/v1/price-lists", { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách bảng giá.");
  }
  return res.json();
};

export const publishPriceList = async (
  priceListId: number,
): Promise<PriceListItem> => {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/price-lists/${priceListId}/publish`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || `Không thể phát hành bảng giá #${priceListId}.`,
    );
  }
  return res.json();
};

export const createPriceList = async (payload: {
  code: string;
  customer_group: string;
  start_date: string;
  end_date: string;
  items: PriceListLine[];
}): Promise<PriceListItem> => {
  const headers = getAuthHeaders();
  const res = await fetch("/api/v1/price-lists", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo bảng giá mới.");
  }
  return res.json();
};

export const fetchNavigationMenu = async (
  role = "SALES_MANAGER",
): Promise<any[]> => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(
      `/api/v1/navigation/menu?role=${encodeURIComponent(role)}`,
      { headers },
    );
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.menu_items) ? data.menu_items : [];
    }
  } catch (err) {
    console.warn("Could not load navigation menu:", err);
  }
  return [];
};

// Interface Product tương thích với ProductBase của backend /api/v1/products
export interface Product {
  id?: number;
  sku: string;
  name: string;
  categoryId?: number | null;
  baseUnit?: string;
  manageByLot?: boolean;
  minStock?: number;
  basePrice?: number | null;
  costPrice?: number | null;
  status?: string;
  imageUrl?: string | null;
}

// Hàm gọi API lấy danh sách sản phẩm từ backend
export async function getProducts(): Promise<Product[]> {
  const token =
    localStorage.getItem("token") || sessionStorage.getItem("token");

  const response = await fetch("/api/v1/products", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error("Không thể tải danh sách sản phẩm từ hệ thống.");
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.data || [];
}

// ==========================================
// SCRUM-79: QUẢN LÝ NHÀ CUNG CẤP (SUPPLIERS)
// ==========================================
import type {
  Supplier,
  SupplierPayload,
  SupplierListParams,
  SupplierListResponse,
} from "../types/supplier";

export type { Supplier, SupplierPayload, SupplierListParams, SupplierListResponse };

export async function fetchSuppliers(
  params?: SupplierListParams,
): Promise<SupplierListResponse> {
  const headers = getAuthHeaders();
  const searchParams = new URLSearchParams();

  if (params?.search) searchParams.append("search", params.search);
  if (params?.is_active !== undefined)
    searchParams.append("is_active", String(params.is_active));
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.limit) searchParams.append("limit", String(params.limit));

  const url = `/api/v1/suppliers${
    searchParams.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách nhà cung cấp.");
  }

  return res.json();
}

export async function fetchSupplierDetail(id: number): Promise<Supplier> {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/suppliers/${id}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy nhà cung cấp #${id}.`);
  }
  const result = await res.json();
  return result.data || result;
}

export async function createSupplier(payload: SupplierPayload): Promise<Supplier> {
  const headers = getAuthHeaders();
  const res = await fetch("/api/v1/suppliers", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo mới nhà cung cấp.");
  }

  const result = await res.json();
  return result.data || result;
}

export async function updateSupplier(
  id: number,
  payload: Partial<SupplierPayload>,
): Promise<Supplier> {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/suppliers/${id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể cập nhật nhà cung cấp #${id}.`);
  }

  const result = await res.json();
  return result.data || result;
}

export async function updateSupplierStatus(
  id: number,
  isActive: boolean,
): Promise<Supplier> {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/suppliers/${id}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ is_active: isActive }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || `Không thể cập nhật trạng thái nhà cung cấp #${id}.`,
    );
  }

  const result = await res.json();
  return result.data || result;
}

export async function deleteSupplier(
  id: number,
): Promise<{ success: boolean; message: string }> {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/suppliers/${id}`, {
    method: "DELETE",
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorMsg =
      err.detail || "Không thể xóa nhà cung cấp do ràng buộc hệ thống.";
    const error = new Error(errorMsg);
    // Gắn thêm HTTP status code để frontend nhận diện mã lỗi 400
    (error as any).status = res.status;
    (error as any).hasReceiptsConstraint = res.status === 400;
    throw error;
  }

  return res.json();
}

export interface CustomerItem {
  id: number;
  code: string;
  name: string;
  phone?: string | null;
  sales_rep_id?: number | null;
  sales_rep_name?: string | null;
  territory_id?: number | null;
  territory_name?: string | null;
  address?: string | null;
  customer_group: string;
  is_active: boolean;
  is_locked: boolean;
  lock_reason?: string | null;
  current_debt?: number;
  debt_limit?: number;
  max_due_days?: number;
  warning_threshold_percent?: number;
  pending_orders_count?: number;
  created_at?: string;
}

export interface TerritoryItem {
  id: number;
  code: string;
  name: string;
  parent_id?: number | null;
}

export interface CreateCustomerPayload {
  code: string;
  name: string;
  customerGroup?: string;
  salesRepId?: number | null;
  territoryId?: number | null;
  creditLimit?: number;
  maxDueDays?: number;
  warningThresholdPercent?: number;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
}

export interface SalesRepUser {
  id: number;
  username: string;
  full_name: string;
  email?: string;
}

export interface HandoverLogItem {
  id: number;
  customer_id: number;
  customer_code?: string;
  customer_name?: string;
  from_sales_rep_id?: number;
  from_sales_rep_name?: string;
  to_sales_rep_id: number;
  to_sales_rep_name?: string;
  transferred_by_name?: string;
  reason?: string;
  created_at?: string;
}

export interface FetchCustomersParams {
  is_locked?: boolean;
  status?: string;
  search?: string;
  keyword?: string;
  assignedRepId?: number | string;
  regionId?: number | string;
  customerGroup?: string;
  page?: number;
  limit?: number;
  pageSize?: number;
}

export interface FetchCustomersResult {
  data: CustomerItem[];
  total: number;
}

export async function fetchCustomersWithTotal(
  params?: FetchCustomersParams
): Promise<FetchCustomersResult> {
  const query = new URLSearchParams();
  if (params?.is_locked !== undefined) query.set("is_locked", String(params.is_locked));
  if (params?.status && params.status !== "ALL") query.set("status", params.status);
  if (params?.search && params.search.trim()) query.set("search", params.search.trim());
  if (params?.keyword && params.keyword.trim()) query.set("keyword", params.keyword.trim());
  if (params?.assignedRepId !== undefined && params.assignedRepId !== "ALL") {
    query.set("assignedRepId", String(params.assignedRepId));
  }
  if (params?.regionId !== undefined && params.regionId !== "ALL") {
    query.set("regionId", String(params.regionId));
  }
  if (params?.customerGroup && params.customerGroup !== "ALL") {
    query.set("customerGroup", params.customerGroup);
  }
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.pageSize) query.set("pageSize", String(params.pageSize));

  const url = `/api/v1/customers${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) {
    throw new Error("Không thể tải danh sách đại lý.");
  }
  const totalHeader = res.headers.get("x-total-count");
  const data: CustomerItem[] = await res.json();
  const total = totalHeader ? parseInt(totalHeader, 10) : data.length;
  return { data, total: isNaN(total) ? data.length : total };
}

export async function fetchCustomers(params?: FetchCustomersParams): Promise<CustomerItem[]> {
  const result = await fetchCustomersWithTotal(params);
  return result.data;
}

export async function fetchSalesReps(): Promise<SalesRepUser[]> {
  const res = await authenticatedFetch("/api/v1/sales-reps");
  if (!res.ok) {
    throw new Error("Không thể tải danh sách nhân viên kinh doanh.");
  }
  return res.json();
}

export async function assignSalesRep(
  customerId: number,
  salesRepId: number,
): Promise<CustomerItem> {
  const res = await authenticatedFetch(`/api/v1/customers/${customerId}/assign-sales-rep`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ salesRepId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể phân công nhân viên cho đại lý này.");
  }
  return res.json();
}

export async function handoverCustomers(payload: {
  fromSalesRepId?: number;
  toSalesRepId: number;
  customerIds?: number[];
  reason: string;
}): Promise<{ success: boolean; message: string; transferred_count: number }> {
  const res = await authenticatedFetch("/api/v1/customers/handover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể thực hiện chuyển giao địa bàn.");
  }
  return res.json();
}

export async function fetchHandoverHistory(): Promise<HandoverLogItem[]> {
  const res = await authenticatedFetch("/api/v1/customers/handover-history");
  if (!res.ok) {
    throw new Error("Không thể tải lịch sử bàn giao.");
  }
  return res.json();
}

export async function fetchTerritories(): Promise<TerritoryItem[]> {
  const res = await authenticatedFetch("/api/v1/territories");
  if (!res.ok) {
    throw new Error("Không thể tải danh sách địa bàn.");
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.data || [];
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<CustomerItem> {
  const res = await authenticatedFetch("/api/v1/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo đại lý mới.");
  }
  return res.json();
}
