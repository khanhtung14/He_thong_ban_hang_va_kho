import React, { useEffect, useState } from "react";
import {
  Modal,
  Button,
  Table,
  Tag,
  Typography,
  Card,
  Space,
  Spin,
  Alert,
  Popconfirm,
  Input,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileTextOutlined,
  CheckOutlined,
  CloseOutlined,
  WarningOutlined,
  ShoppingOutlined,
  EnvironmentOutlined,
  UserOutlined,
  CalendarOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import {
  fetchOrderById,
  type OrderResponseItem,
  type OrderItemView,
} from "../../services/apiClient";

const { Text, Title } = Typography;

export interface OrderDetailModalProps {
  isOpen: boolean;
  orderId?: number | null;
  initialOrder?: OrderResponseItem | null;
  onClose: () => void;
  onApprove?: (order: OrderResponseItem) => void | Promise<void>;
  onReject?: (order: OrderResponseItem, reason?: string) => void | Promise<void>;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  orderId,
  initialOrder,
  onClose,
  onApprove,
  onReject,
}) => {
  const [order, setOrder] = useState<OrderResponseItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setOrder(null);
      setError(null);
      setRejectReason("");
      setIsRejecting(false);
      return;
    }

    const currentId = orderId || initialOrder?.id;
    if (initialOrder && initialOrder.items && initialOrder.items.length > 0) {
      setOrder(initialOrder);
    }

    if (currentId) {
      setLoading(true);
      setError(null);
      fetchOrderById(currentId)
        .then((data) => {
          setOrder(data);
        })
        .catch((err: any) => {
          console.error("Lỗi khi tải chi tiết đơn hàng:", err);
          if (!initialOrder) {
            setError(err.message || "Không thể tải chi tiết đơn hàng.");
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, orderId, initialOrder]);

  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null) return "0 ₫";
    return `${Number(val).toLocaleString("vi-VN")} ₫`;
  };

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const handleConfirmApprove = async () => {
    if (!order || !onApprove) return;
    try {
      setActionLoading(true);
      await onApprove(order);
      onClose();
    } catch (err: any) {
      message.error(err.message || "Lỗi khi phê duyệt đơn hàng.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!order || !onReject) return;
    try {
      setActionLoading(true);
      const reason = rejectReason.trim() || "Quản lý kinh doanh không phê duyệt đơn hàng";
      await onReject(order, reason);
      onClose();
    } catch (err: any) {
      message.error(err.message || "Lỗi khi từ chối đơn hàng.");
    } finally {
      setActionLoading(false);
      setIsRejecting(false);
    }
  };

  const columns: ColumnsType<OrderItemView> = [
    {
      title: "MÃ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 115,
      render: (sku: string, r: any) => (
        <Text strong style={{ color: "#1e3a8a", fontFamily: "monospace", fontSize: 12 }}>
          {sku || r.sku || r.product_sku || "--"}
        </Text>
      ),
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "product_name",
      key: "product_name",
      minWidth: 240,
      render: (name: string, row: any) => {
        const pName = name || row.product_name || row.name || "--";
        const price = row.unit_price ?? row.price ?? 0;
        const isBelowFloor =
          row.floor_price !== undefined &&
          row.floor_price !== null &&
          price < row.floor_price;
        return (
          <div style={{ wordBreak: "break-word" }}>
            <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13, lineHeight: 1.4 }}>{pName}</div>
            {isBelowFloor && (
              <Tag color="error" style={{ fontSize: 11, marginTop: 4 }}>
                <WarningOutlined /> Giá bán thấp hơn giá sàn ({formatMoney(row.floor_price)})
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "ĐVT",
      key: "unit",
      width: 65,
      align: "center",
      render: (_, r: any) => (
        <span style={{ fontSize: 12 }}>{r.unit || r.unit_name || r.base_unit || "Cái"}</span>
      ),
    },
    {
      title: "SỐ LƯỢNG",
      dataIndex: "quantity",
      key: "quantity",
      width: 75,
      align: "center",
      render: (qty: number, r: any) => (
        <Text strong style={{ fontSize: 13 }}>
          {qty ?? r.quantity ?? r.ordered_quantity ?? 0}
        </Text>
      ),
    },
    {
      title: "ĐƠN GIÁ BÁN",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 105,
      align: "right",
      render: (p: number, r: any) => {
        const price = p ?? r.unit_price ?? r.price ?? 0;
        const isBelowFloor =
          r.floor_price !== undefined &&
          r.floor_price !== null &&
          price < r.floor_price;
        return (
          <span style={{ color: isBelowFloor ? "#dc2626" : "#0f172a", fontWeight: isBelowFloor ? 700 : 500, fontSize: 12 }}>
            {formatMoney(price)}
          </span>
        );
      },
    },
    {
      title: "GIÁ SÀN",
      dataIndex: "floor_price",
      key: "floor_price",
      width: 95,
      align: "right",
      render: (fp: any, r: any) => {
        const val = fp ?? r.floor_price;
        return val !== undefined && val !== null && val > 0 ? (
          <Text type="secondary" style={{ fontSize: 12 }}>{formatMoney(val)}</Text>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12 }}>
            --
          </Text>
        );
      },
    },
    {
      title: "THÀNH TIỀN",
      key: "subtotal",
      width: 110,
      align: "right",
      render: (_, r: any) => {
        const qty = r.quantity ?? r.ordered_quantity ?? 0;
        const price = r.unit_price ?? r.price ?? 0;
        const sub = r.subtotal && r.subtotal > 0 ? r.subtotal : qty * price;
        return (
          <Text strong style={{ color: "#059669", fontSize: 12 }}>
            {formatMoney(sub)}
          </Text>
        );
      },
    },
    {
      title: "TỒN KHẢ DỤNG",
      key: "available_qty",
      width: 100,
      align: "center",
      render: (_, r: any) => {
        const avail = r.available_qty ?? r.availableQty;
        if (avail === undefined || avail === null) {
          return <Tag color="default" style={{ fontSize: 11 }}>--</Tag>;
        }
        const qty = r.quantity ?? r.ordered_quantity ?? 0;
        const isEnough = avail >= qty;
        return (
          <Tag color={isEnough ? "success" : "error"} style={{ fontWeight: 500, fontSize: 11, margin: 0 }}>
            {avail > 0 ? `${avail}` : "Hết (0)"}
          </Tag>
        );
      },
    },
  ];

  const totalQuantity = (order?.items || []).reduce(
    (sum, it) => sum + (it.quantity || 0),
    0
  );

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      width={950}
      style={{ top: 24 }}
      styles={{
        header: { padding: "16px 24px", borderBottom: "1px solid #f1f5f9" },
        body: { padding: "20px 24px" },
        footer: { padding: "12px 24px", borderTop: "1px solid #f1f5f9" },
      }}
      title={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
          <Space size={10} align="center">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
                fontSize: 18,
              }}
            >
              <ShoppingOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Chi tiết đơn hàng {order?.order_code || (orderId ? `#${orderId}` : "")}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                Kiểm tra thông tin chi tiết, mặt hàng và giá sàn trước khi phê duyệt
              </div>
            </div>
          </Space>
          {order?.status && (
            <Tag
              color={
                order.status === "PENDING" || order.status === "PENDING_APPROVAL"
                  ? "orange"
                  : order.status === "APPROVED"
                    ? "green"
                    : order.status === "CANCELLED"
                      ? "red"
                      : "blue"
              }
              style={{ padding: "4px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6 }}
            >
              {order.status === "PENDING" || order.status === "PENDING_APPROVAL"
                ? "Chờ phê duyệt"
                : order.status === "APPROVED"
                  ? "Đã phê duyệt"
                  : order.status === "CANCELLED"
                    ? "Đã từ chối / Hủy"
                    : order.status}
            </Tag>
          )}
        </div>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: 12 }}>
          {/* Thay nút đóng bằng hiển thị tổng giá trị đơn hàng */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 14, color: "#475569" }}>Tổng giá trị đơn hàng:</Text>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.5px" }}>
              {formatMoney(order?.total_amount)}
            </span>
          </div>

          {order && (order.status === "PENDING" || order.status === "PENDING_APPROVAL") && (
            <Space size="middle">
              {isRejecting ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Input
                    placeholder="Nhập lý do từ chối..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    style={{ width: 260 }}
                    size="middle"
                  />
                  <Button
                    danger
                    type="primary"
                    loading={actionLoading}
                    onClick={handleConfirmReject}
                  >
                    Xác nhận từ chối
                  </Button>
                  <Button onClick={() => setIsRejecting(false)}>Hủy</Button>
                </div>
              ) : (
                <Button
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => setIsRejecting(true)}
                  disabled={actionLoading}
                >
                  Từ chối đơn
                </Button>
              )}

              {!isRejecting && (
                <Popconfirm
                  title="Xác nhận phê duyệt đơn hàng"
                  description={`Bạn có chắc muốn phê duyệt đơn hàng ${order.order_code}?`}
                  onConfirm={handleConfirmApprove}
                  okText="Duyệt đơn"
                  cancelText="Hủy"
                  okButtonProps={{ loading: actionLoading, style: { backgroundColor: "#16a34a" } }}
                >
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={actionLoading}
                    style={{ backgroundColor: "#16a34a", borderColor: "#16a34a", fontWeight: 600 }}
                  >
                    Phê duyệt đơn
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )}
        </div>
      }
    >
      {loading && !order ? (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Spin size="large" tip="Đang tải dữ liệu đơn hàng..." />
        </div>
      ) : error ? (
        <Alert message="Không thể tải chi tiết đơn hàng" description={error} type="error" showIcon />
      ) : !order ? (
        <Alert message="Không tìm thấy dữ liệu đơn hàng" type="warning" showIcon />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Khối thông tin chung */}
          <Card
            size="small"
            style={{
              backgroundColor: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "12px 20px",
                fontSize: 13,
              }}
            >
              <div>
                <Text type="secondary" style={{ display: "block" }}>
                  <UserOutlined style={{ marginRight: 4 }} /> Khách hàng / Đại lý:
                </Text>
                <Text strong style={{ fontSize: 14, color: "#0f172a" }}>
                  {order.customer_name || `Đại lý #${order.customer_id}`}
                </Text>
              </div>

              <div>
                <Text type="secondary" style={{ display: "block" }}>
                  <CalendarOutlined style={{ marginRight: 4 }} /> Thời gian tạo đơn:
                </Text>
                <Text strong style={{ color: "#0f172a" }}>
                  {formatDateTime(order.created_at)}
                </Text>
              </div>

              <div>
                <Text type="secondary" style={{ display: "block" }}>
                  <ShopOutlined style={{ marginRight: 4 }} /> Kho phục vụ:
                </Text>
                <Text strong style={{ color: "#0f172a" }}>
                  {order.warehouse_name || (order.warehouse_id ? `Kho #${order.warehouse_id}` : "Kho mặc định")}
                </Text>
              </div>

              <div>
                <Text type="secondary" style={{ display: "block" }}>
                  <EnvironmentOutlined style={{ marginRight: 4 }} /> Điểm giao hàng:
                </Text>
                {order.delivery_address ? (
                  <Text style={{ color: "#0f172a" }}>
                    {order.delivery_address.receiver_name && `${order.delivery_address.receiver_name} `}
                    {order.delivery_address.phone && `(${order.delivery_address.phone}) - `}
                    {order.delivery_address.address}
                  </Text>
                ) : (
                  <Text type="secondary" italic>
                    {order.delivery_point_name || "Địa chỉ chính của đại lý"}
                  </Text>
                )}
              </div>

              {order.note && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <Text type="secondary" style={{ display: "block" }}>
                    Ghi chú đơn hàng:
                  </Text>
                  <Text italic style={{ color: "#334155" }}>
                    "{order.note}"
                  </Text>
                </div>
              )}
            </div>
          </Card>

          {/* Bảng danh sách mặt hàng */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
                Danh sách sản phẩm trong đơn ({order.items?.length || 0} mặt hàng)
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Tổng số lượng: <strong style={{ color: "#2563eb" }}>{totalQuantity}</strong> sản phẩm
              </Text>
            </div>

            <Table<OrderItemView>
              dataSource={order.items || []}
              columns={columns}
              rowKey={(r, idx) => r.id || `${r.sku}_${idx}`}
              pagination={false}
              size="middle"
              bordered
              scroll={{ x: 800, y: 280 }}
              style={{ borderRadius: 8, overflow: "hidden" }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
};

export default OrderDetailModal;
