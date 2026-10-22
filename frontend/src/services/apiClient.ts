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
    let msg = "Không thể tạo bảng giá mới.";
    if (typeof err.detail === "string") {
      msg = err.detail;
    } else if (Array.isArray(err.detail)) {
      msg = err.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
    } else if (err.message) {
      msg = err.message;
    }
    throw new Error(msg);
  }
  return res.json();
};

export const fetchPriceListDetail = async (
  priceListId: number,
): Promise<PriceListItem> => {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/price-lists/${priceListId}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải chi tiết bảng giá.");
  }
  return res.json();
};

export const updatePriceList = async (
  priceListId: number,
  payload: {
    code: string;
    customer_group: string;
    start_date: string;
    end_date: string;
    items: PriceListLine[];
  },
): Promise<PriceListItem> => {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/price-lists/${priceListId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    let msg = "Không thể cập nhật bảng giá.";
    if (typeof err.detail === "string") {
      msg = err.detail;
    } else if (Array.isArray(err.detail)) {
      msg = err.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
    } else if (err.message) {
      msg = err.message;
    }
    throw new Error(msg);
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
  sale_price?: number | null;
  costPrice?: number | null;
  status?: string;
  imageUrl?: string | null;
}

// Hàm gọi API lấy danh sách sản phẩm từ backend
export async function getProducts(): Promise<Product[]> {
  const headers = getAuthHeaders();

  const response = await fetch("/api/v1/products", {
    method: "GET",
    headers,
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

  const url = `/api/v1/suppliers${searchParams.toString() ? `?${searchParams.toString()}` : ""
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
  region?: string | null;
  address?: string | null;
  customer_group?: string;
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
  phone?: string;
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
  customerGroupId?: number | string;
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
  if (params?.customerGroupId !== undefined && params.customerGroupId !== "ALL") {
    query.set("customerGroupId", String(params.customerGroupId));
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
  frOMSalesRepId?: number;
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

export interface UpdateManagerCustomerPayload {
  name?: string;
  phone?: string;
  customer_group?: string;
  region?: string;
  territory_id?: number | null;
  status?: string;
  is_active?: boolean;
}

export async function updateManagerCustomer(
  id: number,
  payload: UpdateManagerCustomerPayload
): Promise<CustomerItem> {
  const res = await authenticatedFetch(`/api/v1/manager/customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể cập nhật đại lý #${id}.`);
  }
  return res.json();
}

// ----------------------------------------------------------------------
// SCRUM-20: Delivery Address Management & Order Placement
// ----------------------------------------------------------------------

export interface DeliveryAddressItem {
  id: number;
  customer_id: number;
  receiver_name: string;
  phone: string;
  address: string;
  is_default: boolean;
  note?: string | null;
}

export interface CreateDeliveryAddressPayload {
  receiverName?: string;
  receiver_name?: string;
  phone: string;
  address: string;
  isDefault?: boolean;
  is_default?: boolean;
  note?: string;
}

export interface UpdateDeliveryAddressPayload {
  receiverName?: string;
  receiver_name?: string;
  phone?: string;
  address?: string;
  isDefault?: boolean;
  is_default?: boolean;
  note?: string;
}

export interface OrderItemInput {
  sku: string;
  product_name?: string;
  quantity: number;
  unit_price?: number;
}

export interface CreateOrderPayload {
  customer_id: number;
  customerId?: number;
  warehouse_id?: number | null;
  warehouseId?: number | null;
  delivery_address_id?: number | null;
  deliveryAddressId?: number | null;
  items: OrderItemInput[];
  note?: string;
  status?: string;
  submit_for_approval?: boolean;
  submitForApproval?: boolean;
}

export interface OrderItemView {
  id: number;
  sku: string;
  product_name: string;
  unit?: string;
  unit_name?: string;
  quantity: number;
  ordered_quantity?: number;
  delivered_quantity?: number;
  actual_quantity?: number;
  unit_price: number;
  floor_price?: number | null;
  available_qty?: number | null;
  total_price?: number;
  subtotal?: number;
  is_partially_delivered?: boolean;
}

export interface OrderResponseItem {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string;
  total_amount: number;
  status: string;
  warning_type?: string | null;
  delivery_address_id?: number | null;
  delivery_point_name?: string | null;
  delivery_address?: any;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  has_warning?: boolean;
  warning_message?: string | null;
  expected_delivery_date?: string | null;
  items?: OrderItemView[];
  approval_reason?: string | null;
  note?: string | null;
  created_at: string;
  is_partially_delivered?: boolean;
  is_stock_reserved?: boolean;
  isStockReserved?: boolean;
  approved_at?: string | null;
  reservation_expires_at?: string | null;
}

export async function fetchDeliveryAddresses(
  customerId: number,
): Promise<DeliveryAddressItem[]> {
  const res = await authenticatedFetch(
    `/api/v1/customers/${customerId}/delivery-addresses`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách điểm giao hàng.");
  }
  return res.json();
}

export async function createDeliveryAddress(
  customerId: number,
  payload: CreateDeliveryAddressPayload,
): Promise<DeliveryAddressItem> {
  const res = await authenticatedFetch(
    `/api/v1/customers/${customerId}/delivery-addresses`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể thêm điểm giao hàng.");
  }
  return res.json();
}

export async function updateDeliveryAddress(
  customerId: number,
  addressId: number,
  payload: UpdateDeliveryAddressPayload,
): Promise<DeliveryAddressItem> {
  const res = await authenticatedFetch(
    `/api/v1/customers/${customerId}/delivery-addresses/${addressId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể cập nhật điểm giao hàng.");
  }
  return res.json();
}

export async function deleteDeliveryAddress(
  customerId: number,
  addressId: number,
): Promise<{ message: string; reallocated_default_id?: number | null }> {
  const res = await authenticatedFetch(
    `/api/v1/customers/${customerId}/delivery-addresses/${addressId}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể xóa điểm giao hàng.");
  }
  return res.json();
}

export async function setDefaultDeliveryAddress(
  customerId: number,
  addressId: number,
): Promise<DeliveryAddressItem> {
  const res = await authenticatedFetch(
    `/api/v1/customers/${customerId}/delivery-addresses/${addressId}/default`,
    {
      method: "PATCH",
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể đặt làm điểm giao mặc định.");
  }
  return res.json();
}

export async function fetchOrders(): Promise<OrderResponseItem[]> {
  const res = await authenticatedFetch("/api/v1/orders");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đơn hàng.");
  }
  return res.json();
}

export async function fetchPortalOrders(): Promise<OrderResponseItem[]> {
  const res = await authenticatedFetch("/api/v1/portal/orders");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đơn hàng.");
  }
  return res.json();
}

export async function fetchPortalOrderDetail(
  orderId: number,
): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/portal/orders/${orderId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể tải chi tiết đơn hàng #${orderId}.`);
  }
  return res.json();
}

export interface ReorderItemDetail {
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  current_price: number;
  old_price: number;
  price_changed: boolean;
  subtotal: number;
  floor_price?: number | null;
  available_qty: number;
  stock_available: number;
  is_available: boolean;
  is_selected?: boolean;
}

export interface RemovedReorderItem {
  product_id?: number | null;
  sku: string;
  product_name: string;
  quantity: number;
  old_price?: number | null;
  reason: string;
}

export interface ReorderPreparationResponse {
  success: boolean;
  order_id: number;
  original_order_code: string;
  customer_id: number;
  customer_name: string;
  default_delivery_point_id?: number | null;
  delivery_address_id?: number | null;
  items: ReorderItemDetail[];
  removed_items: RemovedReorderItem[];
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  warning_message?: string | null;
}

export async function fetchReorderItems(
  orderId: number,
): Promise<ReorderPreparationResponse> {
  const res = await authenticatedFetch(
    `/api/v1/portal/orders/${orderId}/reorder-items`,
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể lấy thông tin đặt lại đơn hàng.");
  }
  return res.json();
}


export async function createOrder(
  payload: CreateOrderPayload,
): Promise<OrderResponseItem> {
  const res = await authenticatedFetch("/api/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo đơn hàng.");
  }
  return res.json();
}

export async function fetchOrderById(orderId: number): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải chi tiết đơn hàng.");
  }
  return res.json();
}

export async function fetchOrdersPendingApproval(): Promise<OrderResponseItem[]> {
  const res = await authenticatedFetch("/api/v1/orders/pending-approval");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách đơn chờ duyệt.");
  }
  return res.json();
}

export async function approveOrder(orderId: number, overrideReason?: string): Promise<OrderResponseItem> {
  const options: RequestInit = {
    method: "POST",
  };
  if (overrideReason) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ overrideReason });
  }
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}/approve`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể phê duyệt đơn hàng.");
  }
  return res.json();
}

export async function triggerReleaseExpiredReservations(): Promise<{
  success: boolean;
  count: number;
  released_order_ids: number[];
}> {
  const res = await authenticatedFetch(`/api/v1/orders/release-expired-reservations`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể giải phóng đơn quá hạn giữ chỗ.");
  }
  return res.json();
}

export async function rejectOrder(
  orderId: number,
  reason: string = "Không được phê duyệt",
): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể từ chối đơn hàng.");
  }
  return res.json();
}

export async function submitOrderForApproval(orderId: number): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}/submit`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể gửi duyệt đơn hàng.");
  }
  return res.json();
}

export async function updateOrder(
  orderId: number,
  payload: CreateOrderPayload,
): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể cập nhật đơn hàng.");
  }
  return res.json();
}

export async function cancelOrder(orderId: number): Promise<OrderResponseItem> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể hủy đơn hàng.");
  }
  return res.json();
}

export async function deleteOrder(orderId: number): Promise<{ message: string }> {
  const res = await authenticatedFetch(`/api/v1/orders/${orderId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể xóa đơn hàng.");
  }
  return res.json();
}

export interface DealerPurchaseHistoryItem {
  product_id: number;
  sku: string;
  product_name: string;
  unit: string;
  total_orders_count: number;
  total_quantity: number;
  avg_quantity: number;
  average_quantity?: number;
  last_price: number;
  last_ordered_at: string | null;
  available_quantity: number;
}

export async function fetchDealerPurchaseHistory(
  dealerId: number
): Promise<DealerPurchaseHistoryItem[]> {
  const res = await authenticatedFetch(`/api/v1/dealers/${dealerId}/purchase-history`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải lịch sử mua hàng của đại lý này.");
  }
  return res.json();
}

// -------------------------------------------------------------
// Customer Portal Ordering Interfaces & Services
// -------------------------------------------------------------

export interface PortalDeliveryAddress {
  id: number;
  receiver_name: string;
  receiverName?: string;
  phone: string;
  address: string;
  is_default: boolean;
  isDefault?: boolean;
  note?: string;
}

export interface PortalCustomerInfo {
  id: number;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  customer_group: string;
  customerGroup?: string;
  credit_limit: number;
  creditLimit?: number;
  current_debt: number;
  currentDebt?: number;
  available_credit: number;
  availableCredit?: number;
  is_locked: boolean;
  isLocked?: boolean;
  lock_reason?: string;
  lockReason?: string;
  warehouse_id: number;
  warehouse_name: string;
  delivery_addresses: PortalDeliveryAddress[];
}

export interface PortalProductItem {
  id: number;
  sku: string;
  name: string;
  category_id?: number | null;
  categoryId?: number | null;
  category?: string | null;
  baseUnit?: string;
  unit?: string;
  basePrice?: number;
  sale_price?: number;
  costPrice?: number;
  cost_price?: number;
  status?: string;
  imageUrl?: string | null;
  available_quantity?: number;
  available_qty?: number;
  stock_available?: number;
}

export interface SimulateOrderPayloadItem {
  product_id?: number;
  productId?: number;
  sku?: string;
  quantity: number;
  unit_price?: number;
  unitPrice?: number;
}

export interface SimulateOrderPayload {
  customer_id: number;
  customerId?: number;
  warehouse_id?: number;
  warehouseId?: number;
  items: SimulateOrderPayloadItem[];
}

export interface OrderSimulateItemValidation {
  productId?: number;
  sku?: string;
  productName?: string;
  requestedQty: number;
  availableQty: number;
  isAvailable: boolean;
  unitPrice: number;
  floorPrice?: number;
  isBelowFloorPrice?: boolean;
  discountPercent?: number;
  discountAmount?: number;
  lineSubtotal?: number;
  lineTotal?: number;
  appliedPolicyName?: string;
}

export interface OrderSimulateResponseData {
  subTotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  currentDebt: number;
  creditLimit: number;
  debtAfterOrder: number;
  isCreditLimitExceeded: boolean;
  warehouseId?: number;
  warehouseName?: string;
  itemsValidation?: OrderSimulateItemValidation[];
}

export async function fetchPortalCustomerProfile(): Promise<PortalCustomerInfo> {
  const res = await authenticatedFetch("/api/v1/portal/customer");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải thông tin đại lý.");
  }
  const json = await res.json();
  return json.customer || json;
}

export async function fetchCustomerProducts(params?: {
  keyword?: string;
  categoryId?: number;
}): Promise<PortalProductItem[]> {
  const query = new URLSearchParams();
  if (params?.keyword) query.set("keyword", params.keyword);
  if (params?.categoryId) query.set("categoryId", String(params.categoryId));

  const url = `/api/v1/products${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách sản phẩm.");
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

export async function simulateOrder(
  payload: SimulateOrderPayload
): Promise<OrderSimulateResponseData> {
  const res = await authenticatedFetch("/api/v1/orders/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tính toán đơn hàng.");
  }
  const json = await res.json();
  return json.data || json;
}

export async function fetchCategoriesList(): Promise<Array<{ id: number; name: string; code?: string }>> {
  const res = await authenticatedFetch("/api/v1/categories");
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export interface CalculateDiscountResult {
  sku: string;
  product_name: string;
  quantity: number;
  base_price: number;
  discount_per_unit: number;
  discount_amount: number;
  final_unit_price: number;
  final_total: number;
  policy_id?: number | null;
  policy_name?: string | null;
  discount_type?: string | null;
  discount_value?: number;
  tier_id?: number | null;
}

export async function calculateBestDiscount(payload: {
  sku: string;
  quantity: number;
  base_price?: number;
}): Promise<CalculateDiscountResult> {
  const res = await authenticatedFetch("/api/v1/discounts/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tính chiết khấu sản phẩm.");
  }
  const json = await res.json();
  return json.data || json;
}

