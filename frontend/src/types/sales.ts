/**
 * Types for SCRUM-11: Lịch sử mua hàng của đại lý dành cho Sales.
 */

export interface PurchaseHistoryItemResponse {
  product_id: number;
  product_name: string;
  total_quantity: number;
  average_quantity: number;
}

export interface LastOrderItemResponse {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface LastOrderGroupResponse {
  order_id?: number | null;
  order_code?: string | null;
  items: LastOrderItemResponse[];
}
