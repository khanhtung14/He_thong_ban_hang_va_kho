import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  InputNumber,
  Input,
  Tag,
  Space,
  Typography,
  message,
  Tabs,
  Badge,
  Row,
  Col,
  Statistic,
  Alert,
} from "antd";
import {
  SendOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  FileTextOutlined,
  LockOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface OrderItemInfo {
  id: number;
  product_id?: number;
  sku: string;
  product_name: string;
  quantity: number;
  quantity_delivered: number;
  backorder_quantity: number;
  unit_price: number;
}

interface OrderInfo {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name?: string;
  warehouse_id: number;
  status: string;
  total_amount: number;
  has_backorder: boolean;
  approved_at?: string;
  created_at?: string;
  items: OrderItemInfo[];
}

interface DispatchItemInfo {
  id: number;
  product_id?: number;
  sku: string;
  product_name: string;
  ordered_quantity: number;
  dispatched_quantity: number;
  remaining_backorder_quantity: number;
}

interface DispatchInfo {
  id: number;
  dispatch_code: string;
  order_id: number;
  warehouse_id: number;
  status: string;
  note?: string;
  dispatched_at?: string;
  confirmed_at?: string;
  created_at?: string;
  items: DispatchItemInfo[];
}

export const DispatchManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("ready");
  const [loading, setLoading] = useState<boolean>(false);
  const [readyOrders, setReadyOrders] = useState<OrderInfo[]>([]);
  const [backorders, setBackorders] = useState<OrderInfo[]>([]);
  const [dispatches, setDispatches] = useState<DispatchInfo[]>([]);

  // Modal create/confirm dispatch
  const [selectedOrder, setSelectedOrder] = useState<OrderInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  const [dispatchNote, setDispatchNote] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Detail dispatch modal
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchInfo | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const fetchReadyOrders = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/warehouse/orders/ready-to-dispatch");
      if (res.ok) {
        const data = await res.json();
        setReadyOrders(data);
      }
    } catch (err) {
      console.error("Lỗi tải đơn sẵn sàng xuất kho:", err);
    }
  };

  const fetchBackorders = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/warehouse/orders/backorders");
      if (res.ok) {
        const data = await res.json();
        setBackorders(data);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách nợ hàng:", err);
    }
  };

  const fetchDispatches = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/warehouse/dispatches");
      if (res.ok) {
        const data = await res.json();
        setDispatches(data);
      }
    } catch (err) {
      console.error("Lỗi tải danh sách phiếu xuất kho:", err);
    }
  };

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchReadyOrders(), fetchBackorders(), fetchDispatches()]);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [refreshTrigger]);

  const refreshAll = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleOpenDispatchModal = (order: OrderInfo) => {
    setSelectedOrder(order);
    const initialQty: Record<string, number> = {};
    order.items.forEach((it) => {
      const remaining = Math.max(0, it.quantity - (it.quantity_delivered || 0));
      initialQty[it.sku] = remaining; // Mặc định xuất đủ phần còn lại
    });
    setDispatchQuantities(initialQty);
    setDispatchNote("");
    setIsModalOpen(true);
  };

  const handleConfirmDispatch = async () => {
    if (!selectedOrder) return;

    // Validate ít nhất 1 sản phẩm có số lượng > 0
    let totalQty = 0;
    const itemsPayload = selectedOrder.items
      .map((it) => {
        const qty = dispatchQuantities[it.sku] || 0;
        totalQty += qty;
        return {
          product_id: it.product_id,
          sku: it.sku,
          product_name: it.product_name,
          dispatched_quantity: qty,
        };
      })
      .filter((it) => it.dispatched_quantity > 0);

    if (totalQty <= 0) {
      message.error("Vui lòng nhập số lượng xuất > 0 cho ít nhất một sản phẩm!");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Tạo phiếu xuất kho
      const createRes = await authenticatedFetch("/api/v1/warehouse/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selectedOrder.id,
          note: dispatchNote,
          items: itemsPayload,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json();
        throw new Error(errJson.detail || "Không thể tạo phiếu xuất kho");
      }

      const dispatchData = await createRes.json();
      const dispatchId = dispatchData.id;

      // 2. Xác nhận xuất kho (chuyển tồn giữ chỗ thành xuất thực)
      const confirmRes = await authenticatedFetch(
        `/api/v1/warehouse/dispatches/${dispatchId}/confirm`,
        {
          method: "POST",
        }
      );

      if (!confirmRes.ok) {
        const errJson = await confirmRes.json();
        throw new Error(errJson.detail || "Không thể xác nhận xuất kho");
      }

      const confirmedData = await confirmRes.json();
      message.success(
        `Xác nhận xuất kho thành công phiếu ${confirmedData.dispatch_code}! ${
          confirmedData.has_backorder ? "Đơn hàng có nợ lại một phần hàng." : "Đã giao đủ."
        }`
      );
      setIsModalOpen(false);
      refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi xử lý xuất kho!";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Tính toán xem lượt xuất này có nợ hàng không
  const isPartialDispatch = () => {
    if (!selectedOrder) return false;
    return selectedOrder.items.some((it) => {
      const remaining = Math.max(0, it.quantity - (it.quantity_delivered || 0));
      const dispatched = dispatchQuantities[it.sku] || 0;
      return dispatched < remaining;
    });
  };

  const orderColumns = [
    {
      title: "Mã đơn hàng",
      dataIndex: "order_code",
      key: "order_code",
      render: (code: string) => <Text strong style={{ color: "#1d4ed8" }}>{code}</Text>,
    },
    {
      title: "Đại lý",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (name: string, record: OrderInfo) => name || `Đại lý #${record.customer_id}`,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (st: string, record: OrderInfo) => {
        if (st === "PARTIALLY_DELIVERED" || record.has_backorder) {
          return <Tag color="warning" icon={<ClockCircleOutlined />}>Giao một phần (Nợ hàng)</Tag>;
        }
        if (st === "APPROVED") {
          return <Tag color="processing" icon={<CheckCircleOutlined />}>Đã duyệt (Chờ xuất)</Tag>;
        }
        return <Tag color="default">{st}</Tag>;
      },
    },
    {
      title: "Sản phẩm & Số lượng",
      key: "items_summary",
      render: (_: unknown, record: OrderInfo) => (
        <Space direction="vertical" size={2}>
          {record.items.map((it) => {
            const delivered = it.quantity_delivered || 0;
            const remaining = Math.max(0, it.quantity - delivered);
            return (
              <div key={it.sku} style={{ fontSize: 13 }}>
                <Text>{it.product_name} ({it.sku}): </Text>
                <Tag color="blue">{delivered}/{it.quantity}</Tag>
                {remaining > 0 && <Tag color="volcano">Còn thiếu: {remaining}</Tag>}
              </div>
            );
          })}
        </Space>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_: unknown, record: OrderInfo) => (
        <Button
          type="primary"
          icon={<SendOutlined />}
          style={{ background: "#2563eb" }}
          onClick={() => handleOpenDispatchModal(record)}
        >
          {record.has_backorder ? "Xuất bù hàng thiếu" : "Xác nhận xuất kho"}
        </Button>
      ),
    },
  ];

  const dispatchColumns = [
    {
      title: "Mã phiếu xuất",
      dataIndex: "dispatch_code",
      key: "dispatch_code",
      render: (code: string) => <Text strong style={{ color: "#059669" }}>{code}</Text>,
    },
    {
      title: "Đơn hàng ID",
      dataIndex: "order_id",
      key: "order_id",
      render: (id: number) => `Đơn #${id}`,
    },
    {
      title: "Thời gian xuất",
      dataIndex: "confirmed_at",
      key: "confirmed_at",
      render: (val: string, r: DispatchInfo) =>
        dayjs(val || r.dispatched_at || r.created_at).format("DD/MM/YYYY HH:mm"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (st: string) => (
        <Tag color="success" icon={<LockOutlined />}>
          {st === "CONFIRMED" ? "Đã xác nhận (Khóa)" : st}
        </Tag>
      ),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (note: string) => note || <Text type="secondary">-</Text>,
    },
    {
      title: "Chi tiết",
      key: "action",
      render: (_: unknown, r: DispatchInfo) => (
        <Button
          size="small"
          icon={<FileTextOutlined />}
          onClick={() => {
            setSelectedDispatch(r);
            setIsDetailModalOpen(true);
          }}
        >
          Xem phiếu
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Thẻ thống kê nhanh */}
      <Row gutter={16}>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#eff6ff", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#1e40af", fontWeight: 600 }}>Đơn chờ xuất kho</span>}
              value={readyOrders.length}
              prefix={<InboxOutlined style={{ color: "#3b82f6" }} />}
              valueStyle={{ color: "#1e3a8a", fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#fff7ed", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#9a3412", fontWeight: 600 }}>Đơn còn nợ hàng (Giao thiếu)</span>}
              value={backorders.length}
              prefix={<ClockCircleOutlined style={{ color: "#f97316" }} />}
              valueStyle={{ color: "#c2410c", fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card bordered={false} style={{ background: "#f0fdf4", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#166534", fontWeight: 600 }}>Phiếu xuất đã xác nhận</span>}
              value={dispatches.length}
              prefix={<CheckCircleOutlined style={{ color: "#22c55e" }} />}
              valueStyle={{ color: "#15803d", fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Space>
              <SendOutlined style={{ color: "#2563eb", fontSize: 20 }} />
              <Title level={4} style={{ margin: 0 }}>
                Quản lý Xuất kho & Xử lý Giao thiếu (SCRUM-46)
              </Title>
            </Space>
            <Button icon={<SyncOutlined />} onClick={refreshAll} loading={loading}>
              Làm mới
            </Button>
          </div>
        }
        bordered={false}
        style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "ready",
              label: (
                <Badge count={readyOrders.length} offset={[10, 0]}>
                  <span>Đơn sẵn sàng xuất kho</span>
                </Badge>
              ),
              children: (
                <Table
                  dataSource={readyOrders}
                  columns={orderColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 8 }}
                  locale={{ emptyText: "Không có đơn hàng nào chờ xuất kho." }}
                />
              ),
            },
            {
              key: "backorders",
              label: (
                <Badge count={backorders.length} offset={[10, 0]}>
                  <span style={{ color: backorders.length > 0 ? "#ea580c" : undefined }}>
                    Đơn còn nợ hàng (Theo dõi giao bù)
                  </span>
                </Badge>
              ),
              children: (
                <div>
                  <Alert
                    type="warning"
                    showIcon
                    message="Quy trình giao thiếu (SCRUM-46)"
                    description="Các đơn hàng dưới đây đã được xuất kho một phần nhưng chưa đủ số lượng. Phần hàng còn thiếu được hệ thống tự động ghi nhận là nợ hàng để nhân viên kho tiếp tục xuất ở các lượt giao sau."
                    style={{ marginBottom: 16 }}
                  />
                  <Table
                    dataSource={backorders}
                    columns={orderColumns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 8 }}
                    locale={{ emptyText: "Không có đơn hàng nào còn nợ hàng." }}
                  />
                </div>
              ),
            },
            {
              key: "dispatches",
              label: <span>Lịch sử phiếu xuất kho</span>,
              children: (
                <div>
                  <Alert
                    type="info"
                    showIcon
                    message="Tính bất biến của phiếu xuất kho"
                    description="Theo quy định SCRUM-46, phiếu xuất kho sau khi đã được nhân viên kho bấm xác nhận sẽ lập tức khóa vĩnh viễn (immutable), không được phép chỉnh sửa hoặc xóa để đảm bảo toàn vẹn dữ liệu sổ kho."
                    style={{ marginBottom: 16 }}
                  />
                  <Table
                    dataSource={dispatches}
                    columns={dispatchColumns}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 8 }}
                    locale={{ emptyText: "Chưa có phiếu xuất kho nào." }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal xác nhận xuất kho */}
      <Modal
        title={
          <Space>
            <SendOutlined style={{ color: "#2563eb" }} />
            <span>Xác nhận xuất kho cho đơn #{selectedOrder?.order_code}</span>
          </Space>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleConfirmDispatch}
        okText="Xác nhận xuất kho thực tế"
        confirmLoading={submitting}
        width={750}
        destroyOnClose
      >
        {selectedOrder && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isPartialDispatch() && (
              <Alert
                type="warning"
                showIcon
                icon={<ExclamationCircleOutlined />}
                message="Cảnh báo xuất thiếu (Giao một phần)"
                description="Bạn đang nhập số lượng xuất nhỏ hơn số lượng còn lại của đơn hàng. Hệ thống sẽ trừ tồn kho thực tế tương ứng và ghi nhận số lượng thiếu vào danh sách 'Đơn còn nợ hàng' để giao đợt sau."
              />
            )}

            <Table
              dataSource={selectedOrder.items}
              rowKey="sku"
              pagination={false}
              size="middle"
              columns={[
                {
                  title: "Sản phẩm",
                  dataIndex: "product_name",
                  key: "product_name",
                  render: (name: string, it: OrderItemInfo) => (
                    <div>
                      <Text strong>{name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>SKU: {it.sku}</Text>
                    </div>
                  ),
                },
                {
                  title: "Đặt hàng",
                  dataIndex: "quantity",
                  key: "quantity",
                  width: 90,
                  align: "right",
                },
                {
                  title: "Đã giao",
                  dataIndex: "quantity_delivered",
                  key: "quantity_delivered",
                  width: 90,
                  align: "right",
                  render: (val: number) => val || 0,
                },
                {
                  title: "Còn thiếu",
                  key: "remaining",
                  width: 100,
                  align: "right",
                  render: (_: unknown, it: OrderItemInfo) => {
                    const remaining = Math.max(0, it.quantity - (it.quantity_delivered || 0));
                    return <Tag color="volcano">{remaining}</Tag>;
                  },
                },
                {
                  title: "Xuất đợt này",
                  key: "dispatch_qty",
                  width: 140,
                  align: "center",
                  render: (_: unknown, it: OrderItemInfo) => {
                    const remaining = Math.max(0, it.quantity - (it.quantity_delivered || 0));
                    return (
                      <InputNumber
                        min={0}
                        max={remaining}
                        value={dispatchQuantities[it.sku]}
                        onChange={(val) => {
                          setDispatchQuantities((prev) => ({
                            ...prev,
                            [it.sku]: val || 0,
                          }));
                        }}
                        style={{ width: "100%" }}
                      />
                    );
                  },
                },
              ]}
            />

            <div>
              <Text strong>Ghi chú xuất kho:</Text>
              <TextArea
                rows={2}
                placeholder="Nhập ghi chú xuất kho (nếu có)..."
                value={dispatchNote}
                onChange={(e) => setDispatchNote(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Modal xem chi tiết phiếu xuất */}
      <Modal
        title={`Chi tiết phiếu xuất kho #${selectedDispatch?.dispatch_code}`}
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalOpen(false)}>
            Đóng
          </Button>,
        ]}
        width={700}
      >
        {selectedDispatch && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Text>Đơn hàng liên kết: <b>#{selectedDispatch.order_id}</b></Text>
              <Tag color="success" icon={<LockOutlined />}>Phiếu đã khóa vĩnh viễn</Tag>
            </div>
            <Table
              dataSource={selectedDispatch.items}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: "Sản phẩm", dataIndex: "product_name", key: "product_name" },
                { title: "SKU", dataIndex: "sku", key: "sku" },
                { title: "SL Đặt", dataIndex: "ordered_quantity", key: "ordered_quantity" },
                {
                  title: "SL Xuất thực",
                  dataIndex: "dispatched_quantity",
                  key: "dispatched_quantity",
                  render: (v: number) => <Tag color="green"><b>{v}</b></Tag>,
                },
                {
                  title: "Nợ lại",
                  dataIndex: "remaining_backorder_quantity",
                  key: "remaining_backorder_quantity",
                  render: (v: number) => (v > 0 ? <Tag color="volcano">{v}</Tag> : <Tag color="default">0</Tag>),
                },
              ]}
            />
            {selectedDispatch.note && (
              <Text type="secondary">Ghi chú: {selectedDispatch.note}</Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DispatchManagement;
