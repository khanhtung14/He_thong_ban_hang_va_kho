/**
 * Agency / Customer Management Service
 * Handles API calls for Agency profiles, credit & price list inspection.
 */

import { authenticatedFetch } from "./sessionService";
import type {
  Agency,
  AgencyCreatePayload,
  AgencyUpdatePayload,
  AgencyListParams,
  AgencyListResponse,
  SalesRepUser,
} from "../types/agency";

/**
 * 1. Lấy danh sách hồ sơ đại lý (hỗ trợ tìm kiếm, lọc theo nhóm, khu vực, trạng thái, phân trang)
 */
export async function getAgencies(
  params?: AgencyListParams,
): Promise<AgencyListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.search) searchParams.append("search", params.search.trim());
  if (params?.keyword) searchParams.append("keyword", params.keyword.trim());
  if (params?.customer_group) searchParams.append("customer_group", params.customer_group.trim());
  if (params?.region) searchParams.append("region", params.region.trim());
  if (params?.is_active !== undefined) {
    searchParams.append("is_active", String(params.is_active));
  }
  if (params?.status) searchParams.append("status", params.status.trim());
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.limit) searchParams.append("limit", String(params.limit));

  const queryStr = searchParams.toString();
  const url = `/api/v1/customers${queryStr ? `?${queryStr}` : ""}`;

  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách hồ sơ đại lý.");
  }

  const result = await res.json();
  if (Array.isArray(result)) {
    return {
      success: true,
      code: 200,
      message: "Thành công",
      data: result,
      pagination: {
        page: params?.page || 1,
        limit: params?.limit || result.length,
        totalRecords: result.length,
        totalPages: 1,
      },
    };
  }

  return result;
}

/**
 * 2. Lấy thông tin chi tiết một đại lý theo ID kèm bảng giá hiện hành áp dụng
 */
export async function getAgencyDetail(id: number): Promise<Agency> {
  const res = await authenticatedFetch(`/api/v1/customers/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy hồ sơ đại lý #${id}.`);
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 3. Khai báo thêm mới hồ sơ đại lý
 */
export async function createAgency(payload: AgencyCreatePayload): Promise<Agency> {
  const res = await authenticatedFetch("/api/v1/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo mới hồ sơ đại lý.");
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 4. Cập nhật thông tin đại lý
 */
export async function updateAgency(
  id: number,
  payload: AgencyUpdatePayload,
): Promise<Agency> {
  const res = await authenticatedFetch(`/api/v1/customers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không thể cập nhật đại lý #${id}.`);
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 5. Chuyển đổi trạng thái hoạt động / ngừng giao dịch
 */
export async function updateAgencyStatus(
  id: number,
  is_active: boolean,
): Promise<Agency> {
  const res = await authenticatedFetch(`/api/v1/customers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active, status: is_active ? "ACTIVE" : "INACTIVE" }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể cập nhật trạng thái đại lý.");
  }

  const result = await res.json();
  return result.data || result;
}

/**
 * 6. Xóa hồ sơ đại lý (áp dụng ràng buộc giao dịch)
 */
export async function deleteAgency(
  id: number,
): Promise<{ success: boolean; message: string }> {
  const res = await authenticatedFetch(`/api/v1/customers/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error: any = new Error(
      err.detail || "Không thể xóa hồ sơ đại lý này khỏi hệ thống.",
    );
    error.status = res.status;
    error.hasTransactionsConstraint =
      res.status === 400 &&
      typeof err.detail === "string" &&
      err.detail.includes("phát sinh giao dịch");
    throw error;
  }

  return res.json().catch(() => ({
    success: true,
    message: "Xóa hồ sơ đại lý thành công.",
  }));
}

/**
 * 7. Lấy danh sách nhân viên kinh doanh (Sales Reps) để phân công đại lý
 */
export async function getSalesReps(): Promise<SalesRepUser[]> {
  const res = await authenticatedFetch("/api/v1/sales/reps");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail || "Không thể tải danh sách nhân viên kinh doanh.",
    );
  }
  const result = await res.json();
  if (Array.isArray(result)) return result;
  return result.data || [];
}
