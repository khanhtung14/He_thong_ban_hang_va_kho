/**
 * Stock Card (Thẻ kho) Service
 * Gọi API GET /api/inventory-cards/{product_id}
 */
import { authenticatedFetch } from "./sessionService";

export type TransactionType =
  | "NHAP"
  | "XUAT"
  | "CHUYEN_XUAT"
  | "CHUYEN_NHAP"
  | "DIEU_CHINH";

export interface InventoryCardItem {
  id: string;
  date: string;
  transactionType: TransactionType;
  transaction_type?: TransactionType;
  transactionTypeLabel: string;
  transaction_type_label?: string;
  documentId: number;
  document_id?: number;
  documentCode: string;
  document_code?: string;
  documentType: string;
  document_type?: string;
  documentUrl: string;
  document_url?: string;
  warehouseId: number;
  warehouse_id?: number;
  changeQuantity: number;
  change_quantity?: number;
  balanceAfter: number;
  balance_after?: number;
  note?: string;
}

export interface InventoryCardProductInfo {
  id: number;
  sku: string;
  name: string;
  baseUnit: string;
  base_unit?: string;
}

export interface InventoryCardWarehouseInfo {
  id?: number | null;
  name: string;
  code: string;
}

export interface InventoryCardFilterState {
  warehouseId?: number;
  warehouse_id?: number;
  startDate?: string | null;
  start_date?: string | null;
  endDate?: string | null;
  end_date?: string | null;
}

export interface InventoryCardData {
  product: InventoryCardProductInfo;
  warehouse: InventoryCardWarehouseInfo;
  filter: InventoryCardFilterState;
  openingBalance: number;
  opening_balance?: number;
  totalIn: number;
  total_in?: number;
  totalOut: number;
  total_out?: number;
  closingBalance: number;
  closing_balance?: number;
  items: InventoryCardItem[];
  totalTransactions: number;
  total_transactions?: number;
}

export interface InventoryCardApiResponse {
  success: boolean;
  code: number;
  message: string;
  data: InventoryCardData;
}

export interface InventoryCardFilterParams {
  warehouseId?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Lấy lịch sử thẻ kho của một sản phẩm
 */
export async function fetchInventoryCard(
  productIdOrSku: number | string,
  params: InventoryCardFilterParams = {}
): Promise<InventoryCardData> {
  const query = new URLSearchParams();
  if (params.warehouseId) {
    query.append("warehouse_id", String(params.warehouseId));
  }
  if (params.startDate) {
    query.append("start_date", params.startDate);
  }
  if (params.endDate) {
    query.append("end_date", params.endDate);
  }

  const qs = query.toString();
  const url = `/api/inventory-cards/${encodeURIComponent(productIdOrSku)}${qs ? `?${qs}` : ""}`;
  const response = await authenticatedFetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail || errorData.message || "Không thể tải dữ liệu thẻ kho."
    );
  }

  const json: InventoryCardApiResponse = await response.json();
  return json.data;
}
