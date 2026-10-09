import { useEffect, useState } from "react";
import { authenticatedFetch } from "./session";

export interface OrderItemData {
  id: number;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface OrderData {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string | null;
  status: "DRAFT" | "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  total_amount: number;
  note?: string | null;
  created_at?: string | null;
  has_warning: boolean;
  warning_message?: string | null;
  items?: OrderItemData[];
}

export interface OrderManagementProps {
  onNewOrderClick?: () => void;
  userRole?: string;
}

export default function OrderManagement({ onNewOrderClick }: OrderManagementProps) {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Selected Order Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  async function loadOrders() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);

      const res = await authenticatedFetch(`/api/v1/orders?${params.toString()}`);
      if (res.ok) {
        const data: OrderData[] = await res.json();
        setOrders(data);
      }
    } catch {
      // Handle error
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(orderId: number, nextStatus: string) {
    setIsUpdatingStatus(true);
    try {
      const res = await authenticatedFetch(`/api/v1/orders/${orderId}/status?new_status=${nextStatus}`, {
        method: "PUT",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Không thể cập nhật trạng thái đơn.");

      setNotice({ text: `Đã cập nhật trạng thái đơn ${data.order_code} sang ${nextStatus}.`, type: "success" });
      setSelectedOrder(data);
      loadOrders();
    } catch (err: any) {
      setNotice({ text: err.message, type: "error" });
    } finally {
      setIsUpdatingStatus(false);
    }
  }

  function getStatusTone(st: string) {
    switch (st) {
      case "DRAFT":
        return { label: "Đơn dở dang / Nháp", bg: "#fef3c7", color: "#b45309" };
      case "PENDING":
        return { label: "Chờ duyệt", bg: "#e0e7ff", color: "#4338ca" };
      case "PROCESSING":
        return { label: "Đang xử lý kho", bg: "#e0f2fe", color: "#0369a1" };
      case "COMPLETED":
        return { label: "Hoàn tất", bg: "#dcfce7", color: "#15803d" };
      case "CANCELLED":
        return { label: "Đã hủy", bg: "#fee2e2", color: "#b91c1c" };
      default:
        return { label: st, bg: "#f3f4f6", color: "#374151" };
    }
  }

  return (
    <div className="workspace-panel" style={{ padding: 24 }}>
      <div className="workspace-page-heading" style={{ marginBottom: 20 }}>
        <div>
          <h2>Quản Lý Đơn Hàng & Đơn Dở Dang (SCRUM-85)</h2>
          <p>Theo dõi xử lý đơn hàng. Các đơn dở dang của đại lý đang bị khóa giao dịch sẽ được cảnh báo nổi bật.</p>
        </div>
        {onNewOrderClick && (
          <button type="button" className="workspace-button" onClick={onNewOrderClick}>
            ＋ Tạo đơn mới
          </button>
        )}
      </div>

      {notice && (
        <div className={`workspace-alert is-${notice.type}`} style={{ marginBottom: 16 }}>
          {notice.text}
        </div>
      )}

      {/* Filter Toolbar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Lọc theo trạng thái:</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Đơn nháp / Dở dang (DRAFT)</option>
          <option value="PENDING">Chờ duyệt (PENDING)</option>
          <option value="PROCESSING">Đang xử lý (PROCESSING)</option>
          <option value="COMPLETED">Đã hoàn tất (COMPLETED)</option>
          <option value="CANCELLED">Đã hủy (CANCELLED)</option>
        </select>
        <button type="button" className="workspace-button is-secondary" onClick={() => loadOrders()} style={{ minHeight: 34 }}>
          ↻ Làm mới
        </button>
      </div>

      {/* Table */}
      <div className="workspace-table-wrap">
        <table className="workspace-table order-management-table">
          <thead>
            <tr>
              <th>Mã đơn</th>
              <th>Đại lý đặt</th>
              <th>Tổng tiền</th>
              <th>Trạng thái</th>
              <th>Cảnh báo SCRUM-85</th>
              <th style={{ textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#374151", fontSize: 14, fontWeight: 600 }}>
                  Đang tải đơn hàng...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#374151", fontSize: 14, fontWeight: 600 }}>
                  Không có đơn hàng nào.
                </td>
              </tr>
            ) : (
              orders.map((ord) => {
                const tone = getStatusTone(ord.status);
                return (
                  <tr
                    key={ord.id}
                    style={{
                      backgroundColor: ord.has_warning ? "#fffbf0" : "transparent",
                    }}
                  >
                    <td>
                      <strong style={{ color: "#2563eb", fontFamily: "monospace" }}>{ord.order_code}</strong>
                    </td>
                    <td>
                      <strong>{ord.customer_name || `Đại lý #${ord.customer_id}`}</strong>
                    </td>
                    <td>
                      <strong>
                        {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(ord.total_amount)}
                      </strong>
                    </td>
                    <td>
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 700,
                          backgroundColor: tone.bg,
                          color: tone.color,
                        }}
                      >
                        {tone.label}
                      </span>
                    </td>
                    <td>
                      {ord.has_warning ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            backgroundColor: "#fee2e2",
                            color: "#b91c1c",
                            border: "1px solid #fca5a5",
                          }}
                          title={ord.warning_message || ""}
                        >
                          ⚠️ ĐẠI LÝ BỊ KHÓA
                        </span>
                      ) : (
                        <span style={{ color: "#4b5563", fontSize: 14 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="workspace-link-button"
                        style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8" }}
                        onClick={() => setSelectedOrder(ord)}
                      >
                        Xem chi tiết →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* CHI TIẾT ĐƠN HÀNG VÀ BANNER CẢNH BÁO NỔI BẬT NẾU HAS_WARNING == TRUE */}
      {selectedOrder && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedOrder(null);
          }}
        >
          <section className="workspace-modal is-wide" role="dialog" aria-modal="true" style={{ maxWidth: 640 }}>
            <button className="workspace-modal-close" onClick={() => setSelectedOrder(null)}>
              ×
            </button>

            {/* BANNER CẢNH BÁO NỔI BẬT ĐẦU TRANG CHI TIẾT (SCRUM-85) */}
            {selectedOrder.has_warning && (
              <div
                role="alert"
                style={{
                  backgroundColor: "#fff7ed",
                  border: "2px solid #f97316",
                  borderRadius: 10,
                  padding: "16px 20px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  boxShadow: "0 4px 14px rgba(249, 115, 22, 0.15)",
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>⚠️</span>
                <div>
                  <h4 style={{ margin: "0 0 6px", color: "#c2410c", fontSize: 16, fontWeight: 700 }}>
                    CẢNH BÁO NGHIỆP VỤ: ĐƠN HÀNG THUỘC ĐẠI LÝ ĐANG BỊ KHÓA!
                  </h4>
                  <p style={{ margin: 0, color: "#9a3412", fontSize: 13, lineHeight: 1.5 }}>
                    {selectedOrder.warning_message}
                  </p>
                  <p style={{ margin: "8px 0 0", color: "#7c2d12", fontSize: 12, fontStyle: "italic" }}>
                    Theo quy định SCRUM-85: Đơn dở dang này vẫn có thể xử lý tiếp tục, nhưng nhân viên kinh doanh / kế toán
                    cần đối soát thu hồi công nợ trước khi chuyển sang bước giao hàng hoặc hoàn tất.
                  </p>
                </div>
              </div>
            )}

            <h2>Chi tiết Đơn hàng: {selectedOrder.order_code}</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 10, fontSize: 13 }}>
              <div><strong>Đại lý đặt hàng:</strong> {selectedOrder.customer_name || `#${selectedOrder.customer_id}`}</div>
              <div>
                <strong>Trạng thái hiện tại:</strong>{" "}
                <span
                  style={{
                    padding: "3px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: getStatusTone(selectedOrder.status).bg,
                    color: getStatusTone(selectedOrder.status).color,
                  }}
                >
                  {getStatusTone(selectedOrder.status).label}
                </span>
              </div>
              <div>
                <strong>Tổng giá trị:</strong>{" "}
                <span style={{ color: "#2563eb", fontWeight: 700, fontSize: 16 }}>
                  {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(selectedOrder.total_amount)}
                </span>
              </div>
              {selectedOrder.note && <div><strong>Ghi chú:</strong> {selectedOrder.note}</div>}

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <strong>Danh sách mặt hàng:</strong>
                  <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                      <thead style={{ backgroundColor: "#f9fafb" }}>
                        <tr>
                          <th style={{ padding: 8, textAlign: "left" }}>Sản phẩm</th>
                          <th style={{ padding: 8, textAlign: "center" }}>Số lượng</th>
                          <th style={{ padding: 8, textAlign: "right" }}>Đơn giá</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedOrder.items.map((it) => (
                          <tr key={it.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                            <td style={{ padding: 8 }}>{it.product_name} ({it.sku})</td>
                            <td style={{ padding: 8, textAlign: "center" }}>{it.quantity}</td>
                            <td style={{ padding: 8, textAlign: "right" }}>
                              {new Intl.NumberFormat("vi-VN").format(it.unit_price)} ₫
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Chuyển trạng thái đơn dở dang */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e7eb" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Cập nhật tiến độ xử lý đơn dở:</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedOrder.status === "DRAFT" && (
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus(selectedOrder.id, "PROCESSING")}
                  >
                    Chuyển sang "Đang xử lý kho"
                  </button>
                )}
                {selectedOrder.status === "PROCESSING" && (
                  <button
                    type="button"
                    className="workspace-button"
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus(selectedOrder.id, "COMPLETED")}
                  >
                    Hoàn tất đơn hàng
                  </button>
                )}
                {selectedOrder.status !== "CANCELLED" && selectedOrder.status !== "COMPLETED" && (
                  <button
                    type="button"
                    className="workspace-button is-ghost"
                    style={{ color: "#dc2626" }}
                    disabled={isUpdatingStatus}
                    onClick={() => handleUpdateStatus(selectedOrder.id, "CANCELLED")}
                  >
                    Hủy đơn hàng
                  </button>
                )}
              </div>
            </div>

            <div className="workspace-modal-actions" style={{ marginTop: 20 }}>
              <button type="button" className="workspace-button is-ghost" onClick={() => setSelectedOrder(null)}>
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
