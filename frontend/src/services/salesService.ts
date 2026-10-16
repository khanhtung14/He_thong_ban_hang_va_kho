/**
 * Service for SCRUM-11: Lịch sử mua hàng của đại lý dành cho Sales.
 * Sử dụng axios để gọi các API lấy dữ liệu gợi ý mặt hàng.
 */

import axios from "axios";
import { getAuthToken } from "./apiClient";
import type {
  PurchaseHistoryItemResponse,
  LastOrderGroupResponse,
} from "../types/sales";

const getHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Lấy danh sách các mặt hàng đại lý đã mua trong 90 ngày qua kèm số lượng bình quân.
 */
export async function fetchDealerPurchaseHistory(
  dealerId: number
): Promise<PurchaseHistoryItemResponse[]> {
  const response = await axios.get<PurchaseHistoryItemResponse[]>(
    `/api/v1/sales/dealers/${dealerId}/purchase-history`,
    {
      headers: getHeaders(),
    }
  );
  return response.data;
}

/**
 * Lấy danh sách sản phẩm từ đơn đặt hàng thành công mới nhất của đại lý.
 */
export async function fetchDealerLastOrder(
  dealerId: number
): Promise<LastOrderGroupResponse> {
  const response = await axios.get<LastOrderGroupResponse>(
    `/api/v1/sales/dealers/${dealerId}/last-order`,
    {
      headers: getHeaders(),
    }
  );
  return response.data;
}
