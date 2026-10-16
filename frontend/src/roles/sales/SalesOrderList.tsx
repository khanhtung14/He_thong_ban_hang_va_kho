import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Popconfirm,
  message,
  Typography,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CopyOutlined,
  SearchOutlined,
  ReloadOutlined,
  ShoppingCartOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { fetchOrders, cloneOrder, type OrderResponse } from "../../services/apiClient";

const { Text, Title } = Typography;

interface SalesOrderListProps {
  onOrderCloned?: (newOrder: OrderResponse) => void;
}

export const SalesOrderList: React.FC<SalesOrderListProps> = ({ onOrderCloned }) => {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [cloningId, setCloningId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrders({
        status: statusFilter === "ALL" ? undefined : statusFilter,
      });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error("Lỗi tải danh sách đơn hàng:", err);
      const errMsg = err instanceof Error ? err.message : "Không thể tải danh sách đơn hàng.";
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    let ignore = false;
    const fetchInitial = async () => {
      try {
        const data = await fetchOrders({
          status: statusFilter === "ALL" ? undefined : statusFilter,
        });
        if (!ignore) {
          setOrders(Array.isArray(data) ? data : []);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const errMsg = err instanceof Error ? err.message : "Không thể tải danh sách đơn hàng.";
          message.error(errMsg);
        }
      }
    };
    void fetchInitial();
    return () => {
      ignore = true;
    };
  }, [statusFilter]);

  const handleClone = async (record: OrderResponse) => {
    if (cloningId !== null) return; // Prevent duplicate concurrent requests
    setCloningId(record.id);
    try {
      const clonedOrder = await cloneOrder(record.id);
      message.success(
        `Đã sao chép thành công đơn hàng ${record.order_code} thành đơn nháp mới ${clonedOrder.order_code}! Đơn giá và chiết khấu đã được tính theo chính sách hiện hành.`,
        5,
      );
      if (onOrderCloned) {
        onOrderCloned(clonedOrder);
      }
      await loadOrders();
    } catch (err: unknown) {
      console.error("Lỗi sao chép đơn hàng:", err);
      const errMsg = err instanceof Error ? err.message : "Sao chép đơn hàng thất bại.";
      message.error(errMsg);
    } finally {
      setCloningId(null);
    }
  };

  const formatCurrency = (val?: number) => {
    return (val || 0).toLocaleString("vi-VN") + " ₫";
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case "DRAFT":
        return <Tag color="default">Nháp</Tag>;
      case "PENDING":
      case "PENDING_APPROVAL":
        return <Tag color="warning">Chờ duyệt</Tag>;
      case "APPROVED":
        return <Tag color="processing">Đã duyệt</Tag>;
      case "PROCESSING":
        return <Tag color="cyan">Đang xử lý</Tag>;
      case "COMPLETED":
        return <Tag color="success">Hoàn thành</Tag>;
      case "CANCELLED":
        return <Tag color="error">Đã hủy</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const filteredOrders = orders.filter((ord) => {
    if (!searchText) return true;
    const kw = searchText.toLowerCase();
    const matchCode = ord.order_code?.toLowerCase().includes(kw);
    const matchCust = ord.customer_name?.toLowerCase().includes(kw);
    const matchNote = ord.note?.toLowerCase().includes(kw);
    return matchCode || matchCust || matchNote;
  });

  const columns: ColumnsType<OrderResponse> = [
    {
      title: "Mã đơn",
      dataIndex: "order_code",
      key: "order_code",
      render: (code: string, record: OrderResponse) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: "#1677ff" }}>
            {code}
          </Text>
          {record.has_warning && (
            <Tooltip title={record.warning_message || "Đại lý bị khóa"}>
              <Tag icon={<ExclamationCircleOutlined />} color="error" style={{ fontSize: 11 }}>
                Đại lý bị khóa
              </Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: "Khách hàng / Đại lý",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (name: string, record: OrderResponse) => (
        <div>
          <div>{name || `Đại lý #${record.customer_id}`}</div>
          {record.note && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.note}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "Số dòng hàng",
      key: "items_count",
      align: "center",
      render: (_: unknown, record: OrderResponse) => (
        <Text>{record.items?.length || 0} mặt hàng</Text>
      ),
    },
    {
      title: "Tổng tiền",
      dataIndex: "total_amount",
      key: "total_amount",
      align: "right",
      render: (total: number) => (
        <Text strong style={{ color: "#0f766e" }}>
          {formatCurrency(total)}
        </Text>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (status: string) => getStatusTag(status),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (dt: string) =>
        dt ? new Date(dt).toLocaleDateString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—",
    },
    {
      title: "Thao tác",
      key: "action",
      align: "center",
      render: (_: unknown, record: OrderResponse) => {
        const isCloningThis = cloningId === record.id;
        return (
          <Space orientation="horizontal" size={8}>
            <Popconfirm
              title="Sao chép đơn hàng"
              description={`Bạn có chắc muốn sao chép đơn ${record.order_code} thành đơn nháp mới? Giá và chiết khấu sẽ được tính lại theo bảng giá hiện hành.`}
              okText="Sao chép"
              cancelText="Hủy"
              onConfirm={() => handleClone(record)}
              disabled={isCloningThis}
            >
              <Button
                id={`btn-clone-order-${record.id}`}
                type="primary"
                ghost
                size="small"
                icon={<CopyOutlined />}
                loading={isCloningThis}
                disabled={cloningId !== null && !isCloningThis}
                style={{
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                Sao chép
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 16,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.04)",
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(12px)",
      }}
      title={
        <Space size={12}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(135deg, #1677ff 0%, #0958d9 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 18,
            }}
          >
            <ShoppingCartOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Danh sách & Sao chép đơn hàng
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Tạo đơn định kỳ cho khách quen trong vài giây bằng cách sao chép đơn cũ (SCRUM-16)
            </Text>
          </div>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>
          Làm mới
        </Button>
      }
    >
      {/* Thanh lọc & tìm kiếm */}
      <Space
        style={{
          marginBottom: 18,
          width: "100%",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <Space size={12} wrap>
          <Input
            placeholder="Tìm theo mã đơn, tên khách..."
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 170 }}
            options={[
              { value: "ALL", label: "Tất cả trạng thái" },
              { value: "DRAFT", label: "Nháp (Draft)" },
              { value: "PENDING", label: "Chờ duyệt (Pending)" },
              { value: "APPROVED", label: "Đã duyệt (Approved)" },
              { value: "PROCESSING", label: "Đang xử lý" },
              { value: "COMPLETED", label: "Hoàn thành" },
              { value: "CANCELLED", label: "Đã hủy" },
            ]}
          />
        </Space>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Tổng số: <strong>{filteredOrders.length}</strong> đơn hàng
        </Text>
      </Space>

      <Table
        rowKey="id"
        dataSource={filteredOrders}
        columns={columns}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50"],
          showTotal: (total) => `Tổng ${total} đơn hàng`,
        }}
        bordered={false}
        style={{ borderRadius: 8 }}
      />
    </Card>
  );
};

export default SalesOrderList;
