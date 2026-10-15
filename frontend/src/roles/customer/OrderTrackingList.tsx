import React, { useEffect, useState, useCallback } from "react";
import {
  Table,
  Card,
  Typography,
  Button,
  Space,
  Input,
  Tag,
  Alert,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  EyeOutlined,
  ReloadOutlined,
  SearchOutlined,
  ShoppingOutlined,
  CalendarOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import { fetchMyOrders } from "../../services/ordersService";
import type { OrderTrackingListResponse } from "../../types/orderTracking";
import { OrderDetail, getOrderStatusTag } from "./OrderDetail";

const { Title, Text } = Typography;

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(val || 0);
};

export const OrderTrackingList: React.FC = () => {
  const [orders, setOrders] = useState<OrderTrackingListResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchText, setSearchText] = useState<string>("");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchMyOrders();
      setOrders(data || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Không thể tải danh sách đơn hàng.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleViewDetail = (orderId: number) => {
    setSelectedOrderId(orderId);
    setIsDetailOpen(true);
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchText) return true;
    const query = searchText.toLowerCase().trim();
    return (
      String(o.id).includes(query) ||
      (o.status && o.status.toLowerCase().includes(query)) ||
      (o.expected_delivery_date && o.expected_delivery_date.includes(query))
    );
  });

  const columns: ColumnsType<OrderTrackingListResponse> = [
    {
      title: "Mã đơn hàng",
      dataIndex: "id",
      key: "id",
      width: 130,
      render: (id) => (
        <Space>
          <ShoppingOutlined style={{ color: "#1677ff" }} />
          <Text strong style={{ color: "#1677ff" }}>
            #{id}
          </Text>
        </Space>
      ),
    },
    {
      title: "Trạng thái đơn",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (status) => getOrderStatusTag(status),
      filters: [
        { text: "Bản nháp (DRAFT)", value: "DRAFT" },
        { text: "Chờ phê duyệt (PENDING)", value: "PENDING" },
        { text: "Đã duyệt (APPROVED)", value: "APPROVED" },
        { text: "Đang giao / Xử lý (PROCESSING)", value: "PROCESSING" },
        { text: "Đã hoàn thành (COMPLETED)", value: "COMPLETED" },
        { text: "Đã hủy (CANCELLED)", value: "CANCELLED" },
      ],
      onFilter: (value, record) =>
        record.status?.toUpperCase() === String(value).toUpperCase(),
    },
    {
      title: "Ngày giao dự kiến",
      dataIndex: "expected_delivery_date",
      key: "expected_delivery_date",
      width: 180,
      sorter: (a, b) =>
        (a.expected_delivery_date || "").localeCompare(
          b.expected_delivery_date || ""
        ),
      render: (dateStr) =>
        dateStr ? (
          <Space>
            <CalendarOutlined style={{ color: "#0958d9" }} />
            <Tag color="geekblue" style={{ fontSize: 13 }}>
              {dateStr}
            </Tag>
          </Space>
        ) : (
          <Text type="secondary">Chưa xác định</Text>
        ),
    },
    {
      title: "Tổng tiền đơn hàng",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 180,
      align: "right",
      sorter: (a, b) => a.total_amount - b.total_amount,
      render: (amount) => (
        <Space>
          <DollarOutlined style={{ color: "#52c41a" }} />
          <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
            {formatCurrency(amount)}
          </Text>
        </Space>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 140,
      align: "center",
      render: (_, record) => (
        <Tooltip title="Xem thông tin chi tiết và tình trạng giao các mặt hàng">
          <Button
            type="primary"
            ghost
            icon={<EyeOutlined />}
            size="small"
            onClick={() => handleViewDetail(record.id)}
          >
            Xem chi tiết
          </Button>
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        border: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: "#1e293b" }}>
            Theo dõi trạng thái đơn hàng
          </Title>
          <Text type="secondary">
            Tra cứu hành trình, ngày giao hàng dự kiến và kiểm tra chi tiết các
            mặt hàng thực giao.
          </Text>
        </div>

        <Space>
          <Input
            placeholder="Tìm theo mã đơn hoặc trạng thái..."
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={loadOrders}
            loading={loading}
          >
            Làm mới
          </Button>
        </Space>
      </div>

      {errorMsg && (
        <Alert
          type="error"
          message="Lỗi tải danh sách"
          description={errorMsg}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table<OrderTrackingListResponse>
        columns={columns}
        dataSource={filteredOrders}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} của ${total} đơn hàng`,
        }}
        locale={{
          emptyText: (
            <div style={{ padding: "40px 0" }}>
              <ShoppingOutlined
                style={{ fontSize: 48, color: "#cbd5e1", marginBottom: 12 }}
              />
              <p style={{ color: "#64748b" }}>
                Chưa có đơn hàng nào trong hệ thống của bạn.
              </p>
            </div>
          ),
        }}
      />

      {/* Modal chi tiết đơn hàng */}
      <OrderDetail
        orderId={selectedOrderId}
        open={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedOrderId(null);
        }}
      />
    </Card>
  );
};

export default OrderTrackingList;
