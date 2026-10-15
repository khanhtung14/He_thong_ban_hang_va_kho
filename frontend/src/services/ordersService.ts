/**
 * Order Tracking Service (SCRUM-26).
 * Sử dụng axios để gọi API theo dõi đơn hàng của Đại lý.
 */

import axios from "axios";
import { getAuthToken } from "./apiClient";
import type {
  OrderTrackingListResponse,
  OrderTrackingDetailResponse,
} from "../types/orderTracking";

const getHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Lấy danh sách đơn hàng của đại lý đang đăng nhập.
 */
export async function fetchMyOrders(): Promise<OrderTrackingListResponse[]> {
  const response = await axios.get<OrderTrackingListResponse[]>(
    "/api/v1/orders/my-orders",
    {
      headers: getHeaders(),
    }
  );
  return response.data;
}

/**
 * Lấy chi tiết đơn hàng kèm các dòng sản phẩm và số lượng thực giao.
 */
export async function fetchMyOrderDetail(
  orderId: number
): Promise<OrderTrackingDetailResponse> {
  const response = await axios.get<OrderTrackingDetailResponse>(
    `/api/v1/orders/my-orders/${orderId}`,
    {
      headers: getHeaders(),
    }
  );
  return response.data;
}
