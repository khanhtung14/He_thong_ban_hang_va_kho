import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Typography,
  Space,
  Spin,
  Descriptions,
  Row,
  Col,
  Statistic,
  Breadcrumb,
  Empty,
  notification,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ReloadOutlined,
  ArrowLeftOutlined,
  FileTextOutlined,
  DollarCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { fetchOrderDetail, type OrderDetailView, type OrderItemView } from "../../services/orderService";
import ReorderPreviewModal from "../../components/ReorderPreviewModal";

const { Title, Text } = Typography;

interface OrderDetailsProps {
  orderId: number;
  onBack?: () => void;
  onReorderSuccess?: (newOrderData: any) => void;
}

export const OrderDetails: React.FC<OrderDetailsProps> = ({
  orderId,
  onBack,
  onReorderSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderDetailView | null>(null);
  const [isReorderModalOpen, setIsReorderModalOpen] = useState(false);

  const loadData = async (id: number) => {
    setLoading(true);
    try {
      const data = await fetchOrderDetail(id);
      setOrder(data);
    } catch (err: any) {
      notification.error({
        message: "Lỗi tải chi tiết đơn hàng",
        description: err.message || "Không thể tải thông tin đơn hàng.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      loadData(orderId);
    }
  }, [orderId]);

  const getStatusTag = (status: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "COMPLETED":
        return <Tag icon={<CheckCircleOutlined />} color="success">Hoàn thành</Tag>;
      case "APPROVED":
        return <Tag icon={<CheckCircleOutlined />} color="blue">Đã duyệt</Tag>;
      case "PROCESSING":
        return <Tag icon={<ClockCircleOutlined />} color="processing">Đang xử lý</Tag>;
      case "PENDING":
      case "PENDING_APPROVAL":
        return <Tag icon={<ClockCircleOutlined />} color="warning">Chờ duyệt</Tag>;
      case "DRAFT":
        return <Tag color="default">Bản nháp</Tag>;
      case "CANCELLED":
      case "REJECTED":
        return <Tag icon={<CloseCircleOutlined />} color="error">Đã hủy / Từ chối</Tag>;
      default:
        return <Tag color="blue">{status}</Tag>;
    }
  };

  const columns: ColumnsType<OrderItemView> = [
    {
      title: "STT",
      key: "index",
      width: 60,
      align: "center",
      render: (_, __, index) => index + 1,
    },
    {
      title: "Tên mặt hàng",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string, record: OrderItemView) => (
        <div>
          <Text strong style={{ color: "#1e293b", fontSize: 14 }}>
            {name || "Sản phẩm"}
          </Text>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            SKU: <Tag color="blue">{record.sku}</Tag>
            {record.unit_name && <span style={{ marginLeft: 6 }}>ĐVT: {record.unit_name}</span>}
          </div>
        </div>
      ),
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      width: 110,
      align: "center",
      render: (qty: number) => <Text strong>{qty}</Text>,
    },
    {
      title: "Đơn giá lịch sử",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 170,
      align: "right",
      render: (price: number) => (
        <Text>{price ? price.toLocaleString("vi-VN") + " ₫" : "0 ₫"}</Text>
      ),
    },
    {
      title: "Thành tiền",
      key: "total_price",
      width: 180,
      align: "right",
      render: (_, record: OrderItemView) => {
        const total = (record.quantity || 0) * (record.unit_price || 0);
        return (
          <Text strong style={{ color: "#0f172a" }}>
            {total.toLocaleString("vi-VN")} ₫
          </Text>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0" }}>
        <Spin size="large" tip="Đang tải chi tiết đơn hàng..." />
      </div>
    );
  }

  if (!order) {
    return (
      <Card style={{ borderRadius: 12, marginTop: 16 }}>
        <Empty description="Không tìm thấy thông tin đơn hàng này">
          {onBack && (
            <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
              Quay lại danh sách
            </Button>
          )}
        </Empty>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 40 }}>
      {/* Navigation Breadcrumb & Back */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          {onBack && (
            <Button icon={<ArrowLeftOutlined />} onClick={onBack} style={{ borderRadius: 6 }}>
              Quay lại danh sách
            </Button>
          )}
          <Breadcrumb
            items={[
              { title: "Đại lý" },
              { title: "Đơn hàng của tôi" },
              { title: `Chi tiết đơn #${order.order_code}` },
            ]}
          />
        </Space>

        {/* Primary Action Button: "Đặt lại đơn này" (SCRUM-28) */}
        <Button
          type="primary"
          size="large"
          icon={<ReloadOutlined />}
          onClick={() => setIsReorderModalOpen(true)}
          style={{
            backgroundColor: "#2563eb",
            borderColor: "#2563eb",
            fontWeight: 600,
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
            height: 42,
            padding: "0 22px",
          }}
        >
          Đặt lại đơn này (Reorder)
        </Button>
      </div>

      {/* Main Order Information Card */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          border: "1px solid #e2e8f0",
          marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
                Đơn hàng #{order.order_code}
              </Title>
              {getStatusTag(order.status)}
            </div>
            <Text type="secondary" style={{ marginTop: 4, display: "block" }}>
              Mã ID: #{order.id} | Ngày tạo: {order.created_at ? new Date(order.created_at).toLocaleString("vi-VN") : "N/A"}
            </Text>
          </div>

          <Statistic
            title={<span style={{ fontSize: 13, color: "#64748b" }}>Tổng giá trị đơn hàng</span>}
            value={order.total_amount}
            precision={0}
            formatter={(val) => Number(val).toLocaleString("vi-VN") + " ₫"}
            valueStyle={{ color: "#2563eb", fontWeight: 700, fontSize: 24 }}
            prefix={<DollarCircleOutlined />}
          />
        </div>

        <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="Đại lý đặt mua">
            <strong>{order.customer_name || "Đại lý"}</strong>
            {order.customer_code && <span style={{ color: "#64748b", marginLeft: 4 }}>({order.customer_code})</span>}
          </Descriptions.Item>
          <Descriptions.Item label="Trạng thái đơn">
            {getStatusTag(order.status)}
          </Descriptions.Item>
          <Descriptions.Item label="Số lượng mặt hàng">
            <strong>{order.items?.length || 0}</strong> dòng sản phẩm
          </Descriptions.Item>
          <Descriptions.Item label="Ghi chú đơn hàng" span={3}>
            {order.note || <span style={{ color: "#94a3b8" }}>Không có ghi chú</span>}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Items Table Card */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileTextOutlined style={{ color: "#2563eb" }} />
            <span>Danh sách sản phẩm trong đơn</span>
          </div>
        }
        extra={
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={() => setIsReorderModalOpen(true)}
            style={{ fontWeight: 600, color: "#2563eb" }}
          >
            Đặt lại đơn hàng này
          </Button>
        }
        style={{
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Table
          dataSource={order.items || []}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
        />

        <div style={{ marginTop: 24, padding: "16px 20px", backgroundColor: "#f8fafc", borderRadius: 8 }}>
          <Row justify="end">
            <Col xs={24} sm={12} md={8}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Text type="secondary">Tổng số lượng:</Text>
                <Text strong>
                  {(order.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0)}
                </Text>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Text type="secondary">Tạm tính:</Text>
                <Text strong>{order.total_amount?.toLocaleString("vi-VN")} ₫</Text>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: 8,
                  borderTop: "1px dashed #cbd5e1",
                }}
              >
                <Text strong style={{ fontSize: 16 }}>
                  Tổng thanh toán:
                </Text>
                <Text strong style={{ fontSize: 18, color: "#2563eb" }}>
                  {order.total_amount?.toLocaleString("vi-VN")} ₫
                </Text>
              </div>
            </Col>
          </Row>
        </div>
      </Card>

      {/* Reorder Modal Component (SCRUM-28) */}
      <ReorderPreviewModal
        open={isReorderModalOpen}
        orderId={order.id}
        orderCode={order.order_code}
        onClose={() => setIsReorderModalOpen(false)}
        onSuccess={(newOrder) => {
          onReorderSuccess?.(newOrder);
        }}
      />
    </div>
  );
};

export default OrderDetails;
