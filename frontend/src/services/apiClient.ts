/**
 * Centralized API & Authentication Client for OMS Dashboard.
 * All requests use relative URLs to support both Vite dev server (port 5173 with proxy)
 * and FastAPI direct deployment (port 8000).
 */

import { authenticatedFetch } from "./sessionService";

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

// Thêm interface Product
export interface Product {
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  base_price?: number;
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
  return Array.isArray(data) ? data : data.items || [];
}
