/**
 * TypeScript definitions for SCRUM-26: Theo dõi trạng thái đơn hàng cho Đại lý.
 */

export interface OrderItemTrackingResponse {
  product_name: string;
  quantity_ordered: number;
  quantity_delivered: number;
  unit_price: number;
}

export interface OrderTrackingListResponse {
  id: number;
  dealer_id: number;
  status: string;
  expected_delivery_date: string | null;
  total_amount: number;
}

export interface OrderTrackingDetailResponse extends OrderTrackingListResponse {
  items: OrderItemTrackingResponse[];
}
