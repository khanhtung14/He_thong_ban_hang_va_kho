/**
 * Type definitions for Reorder feature (SCRUM-28).
 */

export interface ReorderItemPreview {
  product_id: number;
  sku: string;
  product_name: string;
  unit_id?: number | null;
  unit_name?: string | null;
  quantity: number;
  old_unit_price: number;
  new_unit_price: number;
  floor_price?: number | null;
  price_list_id?: number | null;
  price_list_code?: string | null;
  total_price: number;
  is_active: boolean;
}

export interface ReorderDiscontinuedItem {
  product_id?: number | null;
  sku: string;
  product_name: string;
  old_unit_price: number;
  quantity: number;
  reason: string;
}

export interface ReorderPreviewResponse {
  order_id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string | null;
  customer_group?: string | null;
  available_items: ReorderItemPreview[];
  discontinued_items: ReorderDiscontinuedItem[];
  has_discontinued_items: boolean;
  warning_message?: string | null;
  total_estimated_amount: number;
}

export interface ReorderCreateItem {
  product_id?: number | null;
  sku: string;
  product_name?: string | null;
  unit_id?: number | null;
  quantity: number;
  unit_price?: number | null;
}

export interface ReorderCreateRequest {
  original_order_id: number;
  items: ReorderCreateItem[];
  note?: string | null;
}

export interface ReorderCreateResponse {
  success: boolean;
  code: number;
  message: string;
  order_id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string | null;
  status: string;
  total_amount: number;
  items_count: number;
  original_order_id: number;
  original_order_code: string;
  warning_message?: string | null;
  data?: {
    id: number;
    order_id: number;
    order_code: string;
    customer_id: number;
    customer_name?: string | null;
    status: string;
    total_amount: number;
    items_count: number;
    original_order_id: number;
    original_order_code: string;
    warning_message?: string | null;
  };
}
