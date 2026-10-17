import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Empty,
  Spin,
  Descriptions,
  Divider,
  Alert,
  InputNumber,
  Input,
  message,
  notification,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  HistoryOutlined,
  EyeOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  RedoOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  fetchPortalOrders,
  fetchReorderItems,
  createOrder,
  type OrderResponseItem,
  type OrderItemView,
  type ReorderItemDetail,
  type ReorderPreparationResponse,
  type CreateOrderPayload,
} from "../../services/apiClient";

const { Title, Text } = Typography;

interface CustomerOrdersProps {
  onNavigateToProducts?: () => void;
}

export const CustomerOrders: React.FC<CustomerOrdersProps> = ({
  onNavigateToProducts,
}) => {
  const [orders, setOrders] = useState<OrderResponseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderResponseItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  // State cho tính năng Đặt lại đơn hàng (Reorder)
  const [reorderModalOpen, setReorderModalOpen] = useState<boolean>(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [reorderSubmitting, setReorderSubmitting] = useState<boolean>(false);
  const [reorderData, setReorderData] = useState<ReorderPreparationResponse | null>(null);
  const [reorderItems, setReorderItems] = useState<ReorderItemDetail[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<React.Key[]>([]);
  const [reorderNote, setReorderNote] = useState<string>("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPortalOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Lỗi tải danh sách đơn hàng đại lý:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const formatDateTime = (dt?: string | null) => {
    if (!dt) return "-";
    try {
      const raw = String(dt).trim();
      const utcStr = raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`;
      return dayjs(utcStr).format("HH:mm DD/MM/YYYY");
    } catch {
      return dt;
    }
  };

  const formatMoney = (val?: number) => {
    if (!val && val !== 0) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  const renderStatusTag = (status: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "DRAFT":
        return <Tag color="default">Đơn nháp</Tag>;
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Tag color="warning" icon={<ClockCircleOutlined />}>
            Chờ duyệt
          </Tag>
        );
      case "APPROVED":
        return (
          <Tag color="cyan" icon={<CheckCircleOutlined />}>
            Đã duyệt
          </Tag>
        );
      case "PROCESSING":
      case "SHIPPING":
      case "IN_TRANSIT":
        return (
          <Tag color="processing" icon={<SyncOutlined spin />}>
            Đang giao
          </Tag>
        );
      case "COMPLETED":
      case "DELIVERED":
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Hoàn thành
          </Tag>
        );
      case "CANCELLED":
      case "REJECTED":
        return (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            Đã hủy
          </Tag>
        );
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  const handleOpenDetail = (order: OrderResponseItem) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
  };

  // Khởi chạy quy trình Đặt lại đơn hàng (Reorder)
  const handleStartReorder = async (orderId: number) => {
    setReorderLoadingId(orderId);
    try {
      const data = await fetchReorderItems(orderId);
      setReorderData(data);
      setReorderItems(data.items || []);
      // Mặc định chọn tất cả các mặt hàng còn kinh doanh
      setSelectedProductIds((data.items || []).map((it) => it.product_id));
      setReorderNote(`Đặt lại từ đơn hàng #${data.original_order_code}`);

      // Nếu có sản phẩm bị loại bỏ do ngừng kinh doanh, hiển thị cảnh báo
      if (data.removed_items && data.removed_items.length > 0) {
        notification.warning({
          message: "Thông báo điều chỉnh danh mục hàng",
          description: "Một số mặt hàng đã ngừng kinh doanh và được tự động bỏ qua.",
          duration: 6,
          placement: "topRight",
        });
      }

      if (!data.items || data.items.length === 0) {
        message.warning("Tất cả mặt hàng trong đơn hàng cũ đã ngừng kinh doanh hoặc không còn khả dụng.");
        return;
      }

      setReorderModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể lấy thông tin đặt lại đơn hàng.";
      message.error(msg);
    } finally {
      setReorderLoadingId(null);
    }
  };

  // Cập nhật số lượng của từng dòng hàng
  const handleQuantityChange = (productId: number, val: number | null) => {
    const qty = Math.max(1, Number(val) || 1);
    setReorderItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: qty, subtotal: qty * item.current_price }
          : item
      )
    );
  };

  // Gửi tạo đơn hàng mới từ các mặt hàng đã chọn
  const handleConfirmReorder = async () => {
    if (!reorderData) return;
    const selectedItems = reorderItems.filter((it) => selectedProductIds.includes(it.product_id));
    if (selectedItems.length === 0) {
      message.warning("Vui lòng chọn ít nhất 1 mặt hàng để đặt lại!");
      return;
    }

    setReorderSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        customer_id: reorderData.customer_id,
        warehouse_id: reorderData.warehouse_id || undefined,
        delivery_address_id: reorderData.default_delivery_point_id || undefined,
        items: selectedItems.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.current_price,
        })),
        note: reorderNote,
        submit_for_approval: true,
      };

      await createOrder(payload);
      message.success("Đặt lại đơn hàng thành công! Đơn hàng mới đã được gửi duyệt.");
      setReorderModalOpen(false);
      setIsDetailModalOpen(false);
      await loadOrders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo đơn hàng đặt lại.";
      message.error(msg);
    } finally {
      setReorderSubmitting(false);
    }
  };

  const columns: ColumnsType<OrderResponseItem> = [
    {
      title: "MÃ ĐƠN HÀNG",
      dataIndex: "order_code",
      key: "order_code",
      width: 170,
      render: (code: string) => (
        <Text strong style={{ color: "#2563eb", fontSize: 14 }}>
          {code}
        </Text>
      ),
    },
    {
      title: "NGÀY ĐẶT HÀNG",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (dt: string) => (
        <span style={{ color: "#475569", fontSize: 13 }}>{formatDateTime(dt)}</span>
      ),
    },
    {
      title: "TỔNG TIỀN (VNĐ)",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 170,
      align: "right",
      render: (amount: number) => (
        <Text strong style={{ color: "#0f172a", fontSize: 15 }}>
          {formatMoney(amount)}
        </Text>
      ),
    },
    {
      title: "TRẠNG THÁI ĐƠN",
      dataIndex: "status",
      key: "status",
      width: 150,
      align: "center",
      render: (status: string) => renderStatusTag(status),
    },
    {
      title: "THAO TÁC",
      key: "action",
      width: 220,
      align: "center",
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            icon={<EyeOutlined />}
            style={{ fontWeight: 500, color: "#2563eb", padding: "4px 8px" }}
            onClick={() => handleOpenDetail(record)}
          >
            Chi tiết
          </Button>
          <Button
            type="link"
            icon={<RedoOutlined />}
            style={{ fontWeight: 500, color: "#059669", padding: "4px 8px" }}
            loading={reorderLoadingId === record.id}
            onClick={() => handleStartReorder(record.id)}
          >
            Đặt lại đơn
          </Button>
        </Space>
      ),
    },
  ];

  const modalItemColumns: ColumnsType<OrderItemView> = [
    {
      title: "#",
      key: "index",
      width: 50,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "MÃ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 120,
      render: (sku: string) => <Tag color="blue">{sku}</Tag>,
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: "SỐ LƯỢNG",
      dataIndex: "quantity",
      key: "quantity",
      width: 110,
      align: "center",
      render: (qty: number) => (
        <Tag color="purple" style={{ fontWeight: 600 }}>
          {qty.toLocaleString("vi-VN")}
        </Tag>
      ),
    },
    {
      title: "ĐƠN GIÁ",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 130,
      align: "right",
      render: (p: number) => formatMoney(p),
    },
    {
      title: "THÀNH TIỀN",
      key: "subtotal",
      width: 140,
      align: "right",
      render: (_, r) => {
        const sub = r.subtotal !== undefined ? r.subtotal : r.quantity * r.unit_price;
        return (
          <Text strong style={{ color: "#2563eb" }}>
            {formatMoney(sub)}
          </Text>
        );
      },
    },
  ];

  const selectedItems = reorderItems.filter((it) => selectedProductIds.includes(it.product_id));
  const totalReorderQuantity = selectedItems.reduce((sum, it) => sum + it.quantity, 0);
  const totalReorderAmount = selectedItems.reduce((sum, it) => sum + it.quantity * it.current_price, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 1. Header Khối "Đơn hàng của tôi" */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 14,
          padding: "20px 24px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              backgroundColor: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              border: "1px solid #dbeafe",
            }}
          >
            <HistoryOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 18 }}>
              Đơn hàng của tôi
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Theo dõi tiến độ xử lý và lịch sử đặt hàng
            </Text>
          </div>
        </div>

        <Space size={10} wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadOrders()}
            loading={loading}
            style={{ height: 38, borderRadius: 8, fontWeight: 500 }}
          >
            Làm mới
          </Button>
          {onNavigateToProducts && (
            <Button
              type="primary"
              icon={<ShoppingOutlined />}
              style={{
                backgroundColor: "#2563eb",
                height: 38,
                borderRadius: 8,
                fontWeight: 600,
                boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
              }}
              onClick={onNavigateToProducts}
            >
              Đặt hàng ngay
            </Button>
          )}
        </Space>
      </div>

      {/* 2. Nội dung bảng hoặc Empty state */}
      <Card
        style={{
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          backgroundColor: "#ffffff",
          overflow: "hidden",
        }}
        styles={{ body: { padding: orders.length === 0 && !loading ? 40 : 0 } }}
      >
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <Spin size="large" tip="Đang tải danh sách đơn hàng..." />
          </div>
        ) : orders.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>
                  Bạn chưa có đơn hàng nào
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Hãy chọn sản phẩm để tạo đơn hàng đầu tiên của đại lý
                </div>
              </div>
            }
          >
            {onNavigateToProducts && (
              <Button
                type="primary"
                icon={<ShoppingOutlined />}
                style={{
                  backgroundColor: "#2563eb",
                  height: 40,
                  borderRadius: 8,
                  fontWeight: 600,
                  padding: "0 24px",
                  marginTop: 12,
                }}
                onClick={onNavigateToProducts}
              >
                Đặt hàng / Sản phẩm
              </Button>
            )}
          </Empty>
        ) : (
          <Table<OrderResponseItem>
            columns={columns}
            dataSource={orders}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
            }}
            scroll={{ x: 800 }}
          />
        )}
      </Card>

      {/* 3. Modal Xem Chi Tiết Đơn Hàng */}
      <Modal
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false);
          setSelectedOrder(null);
        }}
        footer={[
          <Button
            key="close"
            onClick={() => {
              setIsDetailModalOpen(false);
              setSelectedOrder(null);
            }}
          >
            Đóng
          </Button>,
          <Button
            key="reorder"
            type="primary"
            icon={<RedoOutlined />}
            style={{ backgroundColor: "#059669", borderColor: "#059669", fontWeight: 600 }}
            loading={reorderLoadingId === selectedOrder?.id}
            onClick={() => {
              if (selectedOrder) {
                handleStartReorder(selectedOrder.id);
              }
            }}
          >
            Đặt lại đơn này
          </Button>,
        ]}
        width={760}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShoppingOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 17 }}>
              Chi tiết đơn hàng {selectedOrder?.order_code}
            </span>
          </div>
        }
      >
        {selectedOrder && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="Mã đơn hàng">
                <Text strong style={{ color: "#2563eb" }}>
                  {selectedOrder.order_code}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày đặt hàng">
                {formatDateTime(selectedOrder.created_at)}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {renderStatusTag(selectedOrder.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Tổng giá trị">
                <Text strong style={{ color: "#059669", fontSize: 15 }}>
                  {formatMoney(selectedOrder.total_amount)}
                </Text>
              </Descriptions.Item>
              {selectedOrder.note && (
                <Descriptions.Item label="Ghi chú đơn" span={2}>
                  {selectedOrder.note}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* Điểm giao hàng */}
            {selectedOrder.delivery_address && (
              <div
                style={{
                  background: "#f8fafc",
                  borderRadius: 8,
                  padding: "12px 16px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#1e293b", marginBottom: 6 }}>
                  <EnvironmentOutlined style={{ color: "#ef4444" }} />
                  Địa chỉ nhận hàng:
                </div>
                <div style={{ fontSize: 13, color: "#334155" }}>
                  <strong>{selectedOrder.delivery_address.receiver_name}</strong> -{" "}
                  {selectedOrder.delivery_address.phone}
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  {selectedOrder.delivery_address.address}
                </div>
              </div>
            )}

            <Divider style={{ margin: "8px 0" }} />

            <div>
              <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 10, fontSize: 15 }}>
                Danh sách sản phẩm trong đơn ({selectedOrder.items?.length || 0})
              </div>
              <Table<OrderItemView>
                columns={modalItemColumns}
                dataSource={selectedOrder.items || []}
                rowKey={(r, idx) => r.id || idx || 0}
                pagination={false}
                size="small"
                locale={{ emptyText: "Không có thông tin chi tiết sản phẩm" }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* 4. Modal Đặt Lại Đơn Hàng (Reorder) */}
      <Modal
        open={reorderModalOpen}
        onCancel={() => setReorderModalOpen(false)}
        width={920}
        destroyOnClose
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              <RedoOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#1e293b" }}>
                Đặt lại đơn hàng (Reorder)
              </div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                Tạo đơn hàng mới dựa trên đơn #{reorderData?.original_order_code} với bảng giá hiện hành
              </div>
            </div>
          </div>
        }
        footer={[
          <Button key="cancel" onClick={() => setReorderModalOpen(false)} disabled={reorderSubmitting}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<CheckOutlined />}
            loading={reorderSubmitting}
            disabled={selectedProductIds.length === 0}
            style={{
              backgroundColor: "#059669",
              borderColor: "#059669",
              fontWeight: 600,
              height: 38,
            }}
            onClick={handleConfirmReorder}
          >
            Xác nhận đặt lại ({selectedProductIds.length} món)
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
          {/* Cảnh báo các sản phẩm ngừng kinh doanh nếu có */}
          {reorderData?.removed_items && reorderData.removed_items.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={
                <span style={{ fontWeight: 600 }}>
                  Một số mặt hàng đã ngừng kinh doanh và được tự động bỏ qua:
                </span>
              }
              description={
                <div style={{ marginTop: 6 }}>
                  {reorderData.removed_items.map((it, idx) => (
                    <div key={idx} style={{ fontSize: 13, color: "#92400e", marginBottom: 2 }}>
                      • <strong>{it.product_name}</strong> (SKU: {it.sku}) - {it.reason}
                    </div>
                  ))}
                </div>
              }
            />
          )}

          {/* Bảng danh sách mặt hàng đặt lại */}
          <Table<ReorderItemDetail>
            rowKey="product_id"
            rowSelection={{
              selectedRowKeys: selectedProductIds,
              onChange: (keys) => setSelectedProductIds(keys),
            }}
            dataSource={reorderItems}
            pagination={false}
            size="middle"
            columns={[
              {
                title: "MÃ SKU",
                dataIndex: "sku",
                key: "sku",
                width: 110,
                render: (sku: string) => <Tag color="blue">{sku}</Tag>,
              },
              {
                title: "TÊN SẢN PHẨM",
                dataIndex: "product_name",
                key: "product_name",
                render: (name: string, record) => (
                  <div>
                    <Text strong>{name}</Text>
                    {record.unit && (
                      <span style={{ color: "#64748b", fontSize: 12, marginLeft: 6 }}>
                        ({record.unit})
                      </span>
                    )}
                  </div>
                ),
              },
              {
                title: "ĐƠN GIÁ MỚI",
                key: "price",
                width: 160,
                align: "right",
                render: (_, r) => (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <Text strong style={{ color: "#0f172a" }}>
                      {formatMoney(r.current_price)}
                    </Text>
                    {r.price_changed && (
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>
                        Giá cũ: <span style={{ textDecoration: "line-through" }}>{formatMoney(r.old_price)}</span>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                title: "TỒN KHO",
                key: "stock",
                width: 120,
                align: "center",
                render: (_, r) => (
                  <Tag color={r.stock_available > 0 ? "cyan" : "error"}>
                    {r.stock_available > 0 ? `Còn ${r.stock_available.toLocaleString("vi-VN")}` : "Hết hàng"}
                  </Tag>
                ),
              },
              {
                title: "SỐ LƯỢNG",
                key: "quantity",
                width: 120,
                align: "center",
                render: (_, r) => (
                  <InputNumber
                    min={1}
                    value={r.quantity}
                    onChange={(val) => handleQuantityChange(r.product_id, val)}
                    style={{ width: 80 }}
                  />
                ),
              },
              {
                title: "THÀNH TIỀN",
                key: "subtotal",
                width: 140,
                align: "right",
                render: (_, r) => (
                  <Text strong style={{ color: "#2563eb" }}>
                    {formatMoney(r.quantity * r.current_price)}
                  </Text>
                ),
              },
            ]}
          />

          {/* Ghi chú đơn hàng & Tóm tắt giá trị */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              background: "#f8fafc",
              padding: "16px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                Ghi chú đơn hàng:
              </div>
              <Input.TextArea
                rows={2}
                value={reorderNote}
                onChange={(e) => setReorderNote(e.target.value)}
                placeholder="Nhập ghi chú cho đơn hàng đặt lại này..."
              />
            </div>

            <div style={{ textAlign: "right", minWidth: 200 }}>
              <div style={{ fontSize: 13, color: "#64748b" }}>
                Số mặt hàng chọn:{" "}
                <Text strong style={{ color: "#1e293b" }}>
                  {selectedItems.length} / {reorderItems.length}
                </Text>
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                Tổng số lượng:{" "}
                <Text strong style={{ color: "#1e293b" }}>
                  {totalReorderQuantity.toLocaleString("vi-VN")}
                </Text>
              </div>
              <Divider style={{ margin: "10px 0" }} />
              <div style={{ fontSize: 13, color: "#475569" }}>Tổng tiền thanh toán dự kiến:</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#059669", marginTop: 2 }}>
                {formatMoney(totalReorderAmount)}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerOrders;
