export type TransferStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface InternalTransferItem {
  id: number;
  transfer_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  unit: string;
  sent_quantity: number;
  received_quantity: number | null;
  discrepancy_reason: string | null;

  // CamelCase support
  transferId?: number;
  productId?: number;
  productName?: string;
  productSku?: string;
  sentQuantity?: number;
  receivedQuantity?: number | null;
  discrepancyReason?: string | null;
}

export interface InternalTransfer {
  id: number;
  transfer_code: string;
  transferCode?: string;
  from_warehouse_id: number;
  fromWarehouseId?: number;
  from_warehouse_name: string;
  fromWarehouseName?: string;
  to_warehouse_id: number;
  toWarehouseId?: number;
  to_warehouse_name: string;
  toWarehouseName?: string;
  status: TransferStatus;
  created_by: string | null;
  createdBy?: string | null;
  confirmed_by: string | null;
  confirmedBy?: string | null;
  created_at: string;
  createdAt?: string;
  confirmed_at: string | null;
  confirmedAt?: string | null;
  items: InternalTransferItem[];
}

export interface CreateTransferItemPayload {
  product_id: number;
  sent_quantity: number;
}

export interface CreateTransferPayload {
  from_warehouse_id: number;
  to_warehouse_id: number;
  transfer_code?: string;
  items: CreateTransferItemPayload[];
}

export interface ConfirmTransferItemPayload {
  item_id?: number;
  product_id?: number;
  received_quantity: number;
  discrepancy_reason?: string;
}

export interface ConfirmTransferPayload {
  confirmed_by?: string;
  items: ConfirmTransferItemPayload[];
}

export interface WarehouseOption {
  id: number;
  code: string;
  name: string;
  address?: string;
  is_active: boolean;
}

export interface ProductOption {
  id: number;
  sku: string;
  name: string;
  base_unit: string;
  available_qty?: number;
}
