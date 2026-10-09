/**
 * Centralized API & Authentication Client for OMS Dashboard.
 * All requests use relative URLs to support both Vite dev server (port 5173 with proxy)
 * and FastAPI direct deployment (port 8000).
 */

export interface UserProfile {
  username: string;
  email?: string;
  full_name: string;
  role: string;
  phone?: string;
  avatar_url?: string;
  warehouse?: string;
  area?: string;
}

export interface ProductMarginDetail {
  sku: string;
  name: string;
  units_sold: number;
  revenue: number;
  cost_price: number;
  margin: string;
}

export interface SalesMarginReport {
  report_name?: string;
  generated_by?: string;
  role?: string;
  period: string;
  total_revenue: number;
  total_cogs: number;
  gross_profit: number;
  margin: string;
  details?: ProductMarginDetail[];
}

export interface PriceListLine {
  sku: string;
  sale_price: number;
  floor_price: number;
}

export interface PriceListItem {
  id: number;
  code: string;
  customer_group: string;
  start_date: string;
  end_date: string;
  version: number;
  published: boolean;
  items: PriceListLine[];
}

export interface ManagerCustomer { id:number; code:string; name:string; customer_group:string; }
export interface PendingOrder { id:number; order_code:string; customer_id:number; customer_name?:string; status:string; total_amount:number; approval_reason?:string; items: Array<{sku:string;quantity:number;unit_price:number}>; }

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
  const localToken = window.localStorage?.getItem("token") || window.localStorage?.getItem("session_token");
  if (localToken) return localToken;

  // 3. Document Cookie
  if (typeof document !== "undefined" && document.cookie) {
    const cookies = document.cookie.split("; ");
    for (const cookie of cookies) {
      const [name, val] = cookie.split("=");
      if (name === "access_token" || name === "token" || name === "session_token") {
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
  const headers = getAuthHeaders();
  const res = await fetch("/api/v1/profile", { headers });
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
    throw new Error(err.detail || "Không thể tải báo cáo doanh số & biên lợi nhuận.");
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

export const publishPriceList = async (priceListId: number): Promise<PriceListItem> => {
  const headers = getAuthHeaders();
  const res = await fetch(`/api/v1/price-lists/${priceListId}/publish`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể phát hành bảng giá #${priceListId}.`);
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

export const deleteDraftPriceList = async (priceListId:number): Promise<void> => {
  const res = await fetch(`/api/v1/price-lists/${priceListId}`, {method:"DELETE", headers:getAuthHeaders()});
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).detail || "Không xóa được bảng giá nháp.");
};

export const fetchManagerCustomers = async (): Promise<ManagerCustomer[]> => {
  const res = await fetch("/api/v1/customers", { headers: getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Không tải được đại lý.");
  return res.json();
};

export const updateCustomerGroup = async (id:number, customer_group:string): Promise<ManagerCustomer> => {
  const res = await fetch(`/api/v1/customers/${id}/pricing-group`, { method:"PATCH", headers:getAuthHeaders(), body:JSON.stringify({customer_group}) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Không cập nhật được nhóm giá.");
  return res.json();
};

export const fetchPendingOrders = async (): Promise<PendingOrder[]> => {
  const res = await fetch("/api/v1/orders/pending-approval", { headers:getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Không tải được đơn chờ duyệt.");
  return res.json();
};

const orderDecision = async (id:number, action:"approve"|"reject"): Promise<PendingOrder> => {
  const res = await fetch(`/api/v1/orders/${id}/${action}`, { method:"POST", headers:getAuthHeaders(), ...(action === "reject" ? {body:JSON.stringify({reason:"Không duyệt giá dưới sàn"})} : {}) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Không xử lý được đơn hàng.");
  return res.json();
};
export const approveOrder = (id:number) => orderDecision(id,"approve");
export const rejectOrder = (id:number) => orderDecision(id,"reject");

export const fetchProducts = async (): Promise<Array<{sku:string;name:string;sale_price:number}>> => {
  const res = await fetch("/api/v1/products", { headers:getAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Không tải được danh mục sản phẩm.");
  return res.json();
};

export const fetchNavigationMenu = async (role = "SALES_MANAGER"): Promise<any[]> => {
  try {
    const headers = getAuthHeaders();
    const res = await fetch(`/api/v1/navigation/menu?role=${encodeURIComponent(role)}`, { headers });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data.menu_items) ? data.menu_items : [];
    }
  } catch (err) {
    console.warn("Could not load navigation menu:", err);
  }
  return [];
};
