/**
 * Batch & Expiry Date Tracking Service
 * Kết nối API backend cho tính năng Theo dõi lô và hạn sử dụng của hàng hoá.
 */
import axios, { type AxiosRequestConfig } from "axios";
import { getAuthToken } from "./apiClient";

export type BatchStatus = "EXPIRED" | "EXPIRING_SOON" | "ACTIVE";

export interface ProductBatchItem {
  id: number;
  product_id: number;
  productId?: number;
  product_sku?: string;
  productSku?: string;
  product_name?: string;
  productName?: string;
  batch_number: string;
  batchNumber?: string;
  mfg_date?: string | null;
  mfgDate?: string | null;
  exp_date: string;
  expDate?: string;
  remaining_quantity: number;
  remainingQuantity?: number;
  warehouse_id?: number | null;
  warehouseId?: number | null;
  warehouse_name?: string | null;
  warehouseName?: string | null;
  days_until_expiry: number;
  daysUntilExpiry?: number;
  is_expired: boolean;
  isExpired?: boolean;
  is_expiring_soon: boolean;
  isExpiringSoon?: boolean;
  status: BatchStatus;
}

export interface CreateBatchPayload {
  product_id: number;
  batch_number: string;
  mfg_date?: string | null;
  exp_date: string;
  remaining_quantity: number;
  warehouse_id?: number | null;
}

export interface BatchFilterParams {
  productId?: number;
  warehouseId?: number;
  warningDays?: number;
  status?: string;
}

export interface OutboundDispatchPayload {
  product_id: number;
  warehouse_id: number;
  quantity: number;
  batch_id?: number | null;
  batch_number?: string | null;
  override_expired?: boolean;
  override_reason?: string | null;
  note?: string | null;
}

export interface ApiResponse<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
  warningDays?: number;
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

export const extractErrorMessage = (error: unknown, fallback = "Có lỗi xảy ra"): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data) {
      if (typeof data.detail === "string") return data.detail;
      if (typeof data.detail === "object" && data.detail?.message) {
        return data.detail.message;
      }
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
 * Lấy danh sách lô hàng (kèm phân tích hạn dùng và cảnh báo)
 */
export async function getBatches(
  params?: BatchFilterParams,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<ProductBatchItem[]>> {
  const res = await api.get<ApiResponse<ProductBatchItem[]>>(
    "/api/v1/inventory/batches",
    { params, ...config },
  );
  return res.data;
}

/**
 * Tạo mới lô hàng cho sản phẩm
 */
export async function createBatch(
  payload: CreateBatchPayload,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<any>> {
  const res = await api.post<ApiResponse<any>>(
    "/api/v1/inventory/batches",
    payload,
    config,
  );
  return res.data;
}

/**
 * Bật hoặc tắt tính năng quản lý lô theo từng sản phẩm (SKU)
 */
export async function toggleSkuBatchManagement(
  productId: number,
  isBatchManaged: boolean,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<any>> {
  const res = await api.patch<ApiResponse<any>>(
    `/api/v1/products/${productId}/batch-management`,
    { isBatchManaged },
    config,
  );
  return res.data;
}

/**
 * Xuất kho có kiểm tra ràng buộc lô và hạn sử dụng
 */
export async function dispatchOutbound(
  payload: OutboundDispatchPayload,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<any>> {
  const res = await api.post<ApiResponse<any>>(
    "/api/v1/inventory/outbound",
    payload,
    config,
  );
  return res.data;
}
