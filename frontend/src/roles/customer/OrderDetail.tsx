import React, { useEffect, useState } from "react";
import {
  Modal,
  Table,
  Tag,
  Typography,
  Descriptions,
  Spin,
  Alert,
  Card,
  Space,
  Button,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  DollarOutlined,
  CalendarOutlined,
  NumberOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { fetchMyOrderDetail } from "../../services/ordersService";
import type {
  OrderTrackingDetailResponse,
  OrderItemTrackingResponse,
} from "../../types/orderTracking";

const { Title, Text } = Typography;

interface OrderDetailProps {
  orderId: number | null;
  open: boolean;
  onClose: () => void;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(val || 0);
};

export const getOrderStatusTag = (status: string) => {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "COMPLETED":
      return (
        <Tag icon={<CheckCircleOutlined />} color="success">
          ĐÃ HOÀN THÀNH
        </Tag>
      );
    case "PROCESSING":
    case "SHIPPED":
      return (
        <Tag icon={<SyncOutlined spin />} color="processing">
          ĐANG GIAO HÀNG / XỬ LÝ
        </Tag>
      );
    case "APPROVED":
      return (
        <Tag icon={<CheckCircleOutlined />} color="cyan">
          ĐÃ DUYỆT
        </Tag>
      );
    case "PENDING":
    case "PENDING_APPROVAL":
      return (
        <Tag icon={<ClockCircleOutlined />} color="warning">
          CHỜ PHÊ DUYỆT
        </Tag>
      );
    case "CANCELLED":
    case "REJECTED":
      return (
        <Tag icon={<CloseCircleOutlined />} color="error">
          ĐÃ HỦY / TỪ CHỐI
        </Tag>
      );
    case "DRAFT":
    default:
      return <Tag color="default">BẢN NHÁP</Tag>;
  }
};

export const OrderDetail: React.FC<OrderDetailProps> = ({
  orderId,
  open,
  onClose,
}) => {
  const [detail, setDetail] = useState<OrderTrackingDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOrderDetail = async (id: number) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchMyOrderDetail(id);
      setDetail(data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Không thể tải chi tiết đơn hàng.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      loadOrderDetail(orderId);
    } else {
      setDetail(null);
      setErrorMsg(null);
    }
  }, [open, orderId]);

  // Kiểm tra xem đơn hàng có mặt hàng nào bị giao thiếu không
  const hasShortage = detail?.items?.some(
    (item) => item.quantity_delivered < item.quantity_ordered
  );

  const columns: ColumnsType<OrderItemTrackingResponse> = [
    {
      title: "STT",
      key: "index",
      width: 65,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "Tên mặt hàng / Sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      render: (name, record) => {
        const isShortage = record.quantity_delivered < record.quantity_ordered;
        return (
          <Space orientation="vertical" size={2}>
            <Text strong style={{ color: isShortage ? "#cf1322" : "#1e293b" }}>
              {name}
            </Text>
            {isShortage && (
              <span style={{ fontSize: 12, color: "#cf1322" }}>
                ⚠️ Giao thiếu {record.quantity_ordered - record.quantity_delivered} đơn vị
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: "Đơn giá",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 130,
      align: "right",
      render: (price) => formatCurrency(price),
    },
    {
      title: "Số lượng đặt",
      dataIndex: "quantity_ordered",
      key: "quantity_ordered",
      width: 120,
      align: "center",
      render: (qty) => <Text strong>{qty}</Text>,
    },
    {
      title: "Thực tế đã giao",
      dataIndex: "quantity_delivered",
      key: "quantity_delivered",
      width: 140,
      align: "center",
      render: (delivered, record) => {
        const isShortage = delivered < record.quantity_ordered;
        return (
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              fontWeight: 700,
              backgroundColor: isShortage ? "#fff1f0" : "#f6ffed",
              color: isShortage ? "#cf1322" : "#389e0d",
              border: `1px solid ${isShortage ? "#ffa39e" : "#b7eb8f"}`,
            }}
          >
            {delivered} / {record.quantity_ordered}
          </span>
        );
      },
    },
    {
      title: "Tình trạng giao",
      key: "status",
      width: 150,
      align: "center",
      render: (_, record) => {
        const isShortage = record.quantity_delivered < record.quantity_ordered;
        if (isShortage) {
          return (
            <Tag color="error" icon={<WarningOutlined />}>
              Thiếu {record.quantity_ordered - record.quantity_delivered} sp
            </Tag>
          );
        }
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đã giao đủ
          </Tag>
        );
      },
    },
    {
      title: "Thành tiền",
      key: "subtotal",
      width: 150,
      align: "right",
      render: (_, record) => (
        <Text strong>
          {formatCurrency(record.quantity_ordered * record.unit_price)}
        </Text>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button
          key="reload"
          icon={<ReloadOutlined />}
          onClick={() => orderId && loadOrderDetail(orderId)}
          loading={loading}
        >
          Làm mới
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Title level={4} style={{ margin: 0, color: "#1e293b" }}>
            Chi tiết đơn hàng #{orderId || ""}
          </Title>
          {detail?.status && getOrderStatusTag(detail.status)}
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Spin size="large" tip="Đang tải dữ liệu chi tiết đơn hàng..." />
        </div>
      ) : errorMsg ? (
        <Alert
          type="error"
          message="Lỗi tải dữ liệu"
          description={errorMsg}
          showIcon
          style={{ margin: "20px 0" }}
        />
      ) : detail ? (
        <div>
          {/* Cảnh báo nổi bật nếu có dòng sản phẩm bị giao thiếu hàng */}
          {hasShortage && (
            <Alert
              type="error"
              showIcon
              icon={<WarningOutlined style={{ fontSize: 20 }} />}
              message="CẢNH BÁO: ĐƠN HÀNG BỊ GIAO THIẾU HÀNG"
              description="Một số mặt hàng trong đơn chưa được giao đủ số lượng đặt. Các dòng giao thiếu được đánh dấu màu đỏ bên dưới."
              style={{
                marginBottom: 20,
                border: "1px solid #ff4d4f",
                backgroundColor: "#fff2f0",
              }}
            />
          )}

          {/* Khối thông tin chung của đơn hàng */}
          <Card
            bordered={false}
            style={{
              backgroundColor: "#f8fafc",
              borderRadius: 8,
              marginBottom: 20,
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="middle">
              <Descriptions.Item
                label={
                  <Space>
                    <NumberOutlined /> Mã đơn hàng
                  </Space>
                }
              >
                <Text strong>#{detail.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <Space>
                    <CalendarOutlined /> Ngày dự kiến giao
                  </Space>
                }
              >
                {detail.expected_delivery_date ? (
                  <Tag color="blue">{detail.expected_delivery_date}</Tag>
                ) : (
                  <Text type="secondary">Chưa xác định</Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item
                label={
                  <Space>
                    <DollarOutlined /> Tổng giá trị đơn
                  </Space>
                }
              >
                <Text strong style={{ color: "#0958d9", fontSize: 16 }}>
                  {formatCurrency(detail.total_amount)}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* Bảng chi tiết các mặt hàng */}
          <Title level={5} style={{ marginBottom: 12 }}>
            Danh sách sản phẩm ({detail.items?.length || 0} mặt hàng):
          </Title>

          <Table<OrderItemTrackingResponse>
            columns={columns}
            dataSource={detail.items || []}
            rowKey={(rec, index) => `${rec.product_name}-${index}`}
            pagination={false}
            bordered
            rowClassName={(record) =>
              record.quantity_delivered < record.quantity_ordered
                ? "shortage-row"
                : ""
            }
            summary={() => (
              <Table.Summary.Row style={{ backgroundColor: "#fafafa" }}>
                <Table.Summary.Cell index={0} colSpan={6} align="right">
                  <Text strong>Tổng cộng đơn hàng:</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <Text strong style={{ color: "#d4380d", fontSize: 15 }}>
                    {formatCurrency(detail.total_amount)}
                  </Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />

          <style>{`
            .shortage-row {
              background-color: #fff1f0 !important;
            }
            .shortage-row:hover > td {
              background-color: #ffccc7 !important;
            }
          `}</style>
        </div>
      ) : null}
    </Modal>
  );
};

export default OrderDetail;
