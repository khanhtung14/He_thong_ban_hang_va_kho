/**
 * Inbound Receipt TypeScript Definitions (SCRUM-30)
 * Matching 100% with Pydantic Schemas
 */

export type ReceiptStatus = "DRAFT" | "COMPLETED" | "CANCELLED";

export interface InboundReceiptDetailBase {
  product_id: number;
  batch_lot: string;
  quantity: number;
  storage_location_id?: number | null;
}

export interface InboundReceiptDetailCreate extends InboundReceiptDetailBase {}

export interface InboundReceiptDetailResponse extends InboundReceiptDetailBase {
  id: number;
  receipt_id: number;
  product_name?: string | null;
  product_sku?: string | null;
  storage_location_name?: string | null;
  storage_location_code?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InboundReceiptBase {
  supplier_id: number;
  warehouse_id: number;
  notes?: string | null;
}

export interface InboundReceiptCreate extends InboundReceiptBase {
  code?: string | null;
  details: InboundReceiptDetailCreate[];
}

export interface InboundReceiptUpdate {
  supplier_id?: number | null;
  warehouse_id?: number | null;
  notes?: string | null;
  details?: InboundReceiptDetailCreate[] | null;
}

export interface InboundReceiptResponse extends InboundReceiptBase {
  id: number;
  code: string;
  status: ReceiptStatus;
  created_by?: number | null;
  creator_name?: string | null;
  supplier_name?: string | null;
  supplier_code?: string | null;
  warehouse_name?: string | null;
  warehouse_code?: string | null;
  total_quantity: number;
  details: InboundReceiptDetailResponse[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface InboundReceiptListResponse {
  items: InboundReceiptResponse[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ReceiptFormOptions {
  suppliers: Array<{ id: number; code: string; name: string }>;
  warehouses: Array<{ id: number; code: string; name: string }>;
  products: Array<{ id: number; sku?: string | null; name: string; unit?: string | null }>;
  storage_locations: Array<{
    id: number;
    warehouse_id: number;
    code: string;
    name: string;
    level: string;
  }>;
}

export interface InboundReceiptFilterParams {
  status?: ReceiptStatus | "";
  warehouse_id?: number;
  supplier_id?: number;
  search?: string;
  page?: number;
  page_size?: number;
}
