/**
 * Supplier Management Service (SCRUM-79)
 * Handles API calls for Supplier Catalog in Warehouse module.
 */

import { authenticatedFetch } from "./sessionService";
import type {
  Supplier,
  SupplierPayload,
  SupplierListParams,
  SupplierListResponse,
} from "../types/supplier";

export type SupplierCreate = SupplierPayload;
export type SupplierUpdate = Partial<SupplierPayload>;

export interface SupplierDetailResponse {
  success: boolean;
  code: number;
  message: string;
  data: Supplier;
}

export interface SupplierDeleteResponse {
  success: boolean;
  code: number;
  message: string;
  data?: { id: number };
}

/**
 * 1. Lấy danh sách nhà cung cấp (hỗ trợ tìm kiếm, lọc trạng thái, phân trang)
 */
export async function getSuppliers(
  params?: SupplierListParams,
): Promise<SupplierListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.search) searchParams.append("search", params.search.trim());
  if (params?.is_active !== undefined) {
    searchParams.append("is_active", String(params.is_active));
  }
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.limit) searchParams.append("limit", String(params.limit));

  const queryStr = searchParams.toString();
  const url = `/api/v1/suppliers${queryStr ? `?${queryStr}` : ""}`;

  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách nhà cung cấp.");
  }

  return res.json();
}

/**
 * 2. Lấy thông tin chi tiết một nhà cung cấp theo ID
 */
export async function getSupplierDetail(id: number): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/v1/suppliers/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy nhà cung cấp #${id}.`);
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 3. Thêm mới nhà cung cấp
 */
export async function createSupplier(payload: SupplierCreate): Promise<Supplier> {
  const res = await authenticatedFetch("/api/v1/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể thêm mới nhà cung cấp.");
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 4. Cập nhật thông tin nhà cung cấp
 */
export async function updateSupplier(
  id: number,
  payload: SupplierUpdate,
): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/v1/suppliers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể cập nhật nhà cung cấp #${id}.`);
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 5. Cập nhật trạng thái hoạt động / ngừng giao dịch (PATCH /api/v1/suppliers/{id}/status)
 */
export async function updateSupplierStatus(
  id: number,
  is_active: boolean,
): Promise<Supplier> {
  const res = await authenticatedFetch(`/api/v1/suppliers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active }),
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

/**
 * 6. Xóa nhà cung cấp (DELETE /api/v1/suppliers/{id})
 * Nếu nhà cung cấp đã có phiếu nhập kho, backend trả về HTTP 400 kèm thông báo rõ ràng.
 */
export async function deleteSupplier(
  id: number,
): Promise<SupplierDeleteResponse> {
  const res = await authenticatedFetch(`/api/v1/suppliers/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorMsg =
      err.detail || "Không thể xóa nhà cung cấp do ràng buộc hệ thống.";
    const error: any = new Error(errorMsg);
    error.status = res.status;
    error.hasReceiptsConstraint = res.status === 400;
    throw error;
  }

  return res.json();
}

export default {
  getSuppliers,
  getSupplierDetail,
  createSupplier,
  updateSupplier,
  updateSupplierStatus,
  deleteSupplier,
};
