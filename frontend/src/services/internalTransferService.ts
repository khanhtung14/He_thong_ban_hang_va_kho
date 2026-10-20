/**
 * Internal Transfer Service (Quản lý luân chuyển hàng hóa nội bộ)
 * Giao tiếp với API Backend để xử lý tạo và xác nhận phiếu chuyển kho.
 */

import axios, { type AxiosRequestConfig } from "axios";
import { getAuthToken } from "./apiClient";

export type InternalTransferStatus = "IN_TRANSIT" | "COMPLETED" | "CANCELLED";

export interface InternalTransferDetail {
  id: number;
  transfer_id: number;
  transferId?: number;
  product_id: number;
  productId?: number;
  product_sku?: string;
  productSku?: string;
  product_name?: string;
  productName?: string;
  quantity_sent: number;
  quantitySent?: number;
  quantity_received?: number | null;
  quantityReceived?: number | null;
  discrepancy_reason?: string | null;
  discrepancyReason?: string | null;
}

export interface InternalTransfer {
  id: number;
  from_warehouse_id: number;
  fromWarehouseId?: number;
  from_warehouse_name?: string;
  fromWarehouseName?: string;
  to_warehouse_id: number;
  toWarehouseId?: number;
  to_warehouse_name?: string;
  toWarehouseName?: string;
  status: InternalTransferStatus;
  created_at: string;
  createdAt?: string;
  details: InternalTransferDetail[];
}

export interface CreateInternalTransferItem {
  product_id: number;
  quantity_sent: number;
}

export interface CreateInternalTransferPayload {
  from_warehouse_id: number;
  to_warehouse_id: number;
  items: CreateInternalTransferItem[];
}

export interface ConfirmInternalTransferItem {
  detail_id?: number;
  product_id?: number;
  quantity_received: number;
  discrepancy_reason?: string | null;
}

export interface ConfirmInternalTransferPayload {
  items: ConfirmInternalTransferItem[];
}

export interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
}

export interface WarehouseOption {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface ProductOption {
  id: number;
  sku: string;
  name: string;
  base_unit?: string;
  available_qty?: number;
}

const api = axios.create({
  baseURL: "",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token && config.headers) {
      if (typeof (config.headers as any).set === "function") {
        (config.headers as any).set("Authorization", `Bearer ${token}`);
      } else {
        (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/**
 * Trích xuất câu thông báo lỗi dễ hiểu từ AxiosError
 */
export const extractErrorMessage = (error: unknown, fallback = "Có lỗi xảy ra"): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data) {
      if (typeof data.detail === "string") return data.detail;
      if (typeof data.message === "string") return data.message;
      if (Array.isArray(data.detail) && data.detail[0]?.msg) {
        return data.detail[0].msg;
      }
    }
  }
  if (error instanceof Error) return error.message;
  return fallback;
};

/**
 * API 1: Tạo phiếu chuyển kho nội bộ (POST /api/internal-transfers)
 * - Trừ tồn kho tại kho xuất phát.
 * - Trạng thái IN_TRANSIT.
 * - Tuyệt đối CHƯA ĐƯỢC cộng tồn kho của kho đến.
 */
export async function createInternalTransfer(
  payload: CreateInternalTransferPayload,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<InternalTransfer>> {
  const response = await api.post<ApiResponse<InternalTransfer>>(
    "/api/internal-transfers",
    payload,
    config,
  );
  return response.data;
}

/**
 * API 2: Xác nhận nhận hàng tại kho đến (POST /api/internal-transfers/{id}/confirm)
 * - Nếu có chênh lệch số lượng mà không có lý do -> Báo lỗi.
 * - Nếu hợp lệ -> Trạng thái COMPLETED và cộng tồn kho cho kho đến.
 */
export async function confirmInternalTransfer(
  id: number,
  payload: ConfirmInternalTransferPayload,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<InternalTransfer>> {
  const response = await api.post<ApiResponse<InternalTransfer>>(
    `/api/internal-transfers/${id}/confirm`,
    payload,
    config,
  );
  return response.data;
}

/**
 * Lấy danh sách phiếu luân chuyển (GET /api/internal-transfers)
 */
export async function getInternalTransfers(params?: {
  status?: string;
  warehouse_id?: number;
}): Promise<ApiResponse<InternalTransfer[]>> {
  const response = await api.get<ApiResponse<InternalTransfer[]>>(
    "/api/internal-transfers",
    { params },
  );
  return response.data;
}

/**
 * Lấy thông tin chi tiết một phiếu luân chuyển (GET /api/internal-transfers/{id})
 */
export async function getInternalTransferById(
  id: number,
): Promise<ApiResponse<InternalTransfer>> {
  const response = await api.get<ApiResponse<InternalTransfer>>(
    `/api/internal-transfers/${id}`,
  );
  return response.data;
}

/**
 * Lấy danh sách kho phục vụ lựa chọn dropdown
 */
export async function fetchWarehouses(): Promise<WarehouseOption[]> {
  try {
    const res = await api.get<{ data?: WarehouseOption[]; success?: boolean }>(
      "/api/v1/warehouses",
    );
    const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
    return list.filter((w) => w.is_active !== false);
  } catch {
    // Fallback kho mặc định nếu API warehouses tạm thời chưa có dữ liệu
    return [
      { id: 1, code: "WH-HN-01", name: "Kho Tổng Hà Nội" },
      { id: 2, code: "WH-HCM-01", name: "Kho Chi nhánh TP. Hồ Chí Minh" },
    ];
  }
}

/**
 * Lấy danh mục sản phẩm phục vụ chọn hàng luân chuyển
 */
export async function fetchProducts(): Promise<ProductOption[]> {
  try {
    const res = await api.get<any>("/api/v1/products");
    const items = res.data?.data?.items || res.data?.data || res.data || [];
    if (Array.isArray(items)) {
      return items.map((p: any) => ({
        id: p.id,
        sku: p.sku || "",
        name: p.name || "",
        base_unit: p.base_unit || p.baseUnit || "Đơn vị",
        available_qty: p.available_qty ?? p.stock_available,
      }));
    }
    return [];
  } catch {
    return [
      { id: 1, sku: "SUA-VINAMILK-100", name: "Sữa tươi tiệt trùng Vinamilk 100ml", base_unit: "Hộp" },
      { id: 2, sku: "RED-BULL-250", name: "Nước tăng lực Red Bull 250ml", base_unit: "Lon" },
    ];
  }
}
