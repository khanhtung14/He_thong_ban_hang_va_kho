/**
 * Inbound Receipt Service (SCRUM-30)
 * API client methods using authenticatedFetch
 */

import { authenticatedFetch } from "./sessionService";
import type {
  InboundReceiptCreate,
  InboundReceiptFilterParams,
  InboundReceiptListResponse,
  InboundReceiptResponse,
  InboundReceiptUpdate,
  ReceiptFormOptions,
} from "../types/inboundReceipt";

/**
 * 1. Lấy danh sách phiếu nhập kho phân trang
 */
export async function getInboundReceipts(
  params?: InboundReceiptFilterParams,
): Promise<InboundReceiptListResponse> {
  const searchParams = new URLSearchParams();

  if (params?.status) searchParams.append("status", params.status);
  if (params?.warehouse_id) searchParams.append("warehouse_id", String(params.warehouse_id));
  if (params?.supplier_id) searchParams.append("supplier_id", String(params.supplier_id));
  if (params?.search) searchParams.append("search", params.search.trim());
  if (params?.page) searchParams.append("page", String(params.page));
  if (params?.page_size) searchParams.append("page_size", String(params.page_size));

  const queryStr = searchParams.toString();
  const url = `/api/v1/inbound-receipts${queryStr ? `?${queryStr}` : ""}`;

  const res = await authenticatedFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh sách phiếu nhập kho.");
  }

  return res.json();
}

/**
 * 2. Lấy chi tiết một phiếu nhập kho
 */
export async function getInboundReceiptById(id: number): Promise<InboundReceiptResponse> {
  const res = await authenticatedFetch(`/api/v1/inbound-receipts/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Không tìm thấy phiếu nhập kho #${id}.`);
  }
  return res.json();
}

/**
 * 3. Tạo mới phiếu nhập kho (trạng thái DRAFT)
 */
export async function createInboundReceipt(
  payload: InboundReceiptCreate,
): Promise<InboundReceiptResponse> {
  const res = await authenticatedFetch("/api/v1/inbound-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tạo phiếu nhập kho.");
  }

  return res.json();
}

/**
 * 4. Cập nhật phiếu nhập kho (DRAFT)
 */
export async function updateInboundReceipt(
  id: number,
  payload: InboundReceiptUpdate,
): Promise<InboundReceiptResponse> {
  const res = await authenticatedFetch(`/api/v1/inbound-receipts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể cập nhật phiếu nhập kho.");
  }

  return res.json();
}

/**
 * 5. Hoàn tất phiếu nhập kho (cộng tồn kho thực tế)
 */
export async function completeInboundReceipt(id: number): Promise<InboundReceiptResponse> {
  const res = await authenticatedFetch(`/api/v1/inbound-receipts/${id}/complete`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể hoàn tất phiếu nhập kho.");
  }

  return res.json();
}

/**
 * 6. Hủy phiếu nhập kho
 */
export async function cancelInboundReceipt(id: number): Promise<InboundReceiptResponse> {
  const res = await authenticatedFetch(`/api/v1/inbound-receipts/${id}/cancel`, {
    method: "POST",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể hủy phiếu nhập kho.");
  }

  return res.json();
}

/**
 * 7. Lấy danh mục dữ liệu khởi tạo form (NCC, Kho, SP, Vị trí)
 */
export async function getReceiptFormOptions(
  warehouseId?: number,
): Promise<ReceiptFormOptions> {
  const query = warehouseId ? `?warehouse_id=${warehouseId}` : "";
  const res = await authenticatedFetch(`/api/v1/inbound-receipts/options${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể tải danh mục dữ liệu tạo phiếu nhập.");
  }
  return res.json();
}
