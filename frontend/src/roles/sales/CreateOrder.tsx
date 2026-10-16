import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Select,
  Typography,
  Button,
  Table,
  InputNumber,
  Input,
  DatePicker,
  Space,
  Tag,
  Alert,
  Spin,
  Tooltip,
  Divider,
  message,
  Empty,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ShoppingCartOutlined,
  HistoryOutlined,
  PlusOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  DollarCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { fetchCustomers, type CustomerItem } from "../../services/apiClient";
import {
  fetchDealerPurchaseHistory,
  fetchDealerLastOrder,
} from "../../services/salesService";
import type {
  PurchaseHistoryItemResponse,
  LastOrderGroupResponse,
} from "../../types/sales";

const { Title, Text } = Typography;
const { TextArea } = Input;

export interface OrderItemForm {
  key: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
}

const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(val || 0);
};

export const CreateOrder: React.FC = () => {
  const [dealers, setDealers] = useState<CustomerItem[]>([]);
  const [loadingDealers, setLoadingDealers] = useState<boolean>(false);
  const [selectedDealerId, setSelectedDealerId] = useState<number | null>(null);

  // Dữ liệu SCRUM-11
  const [historyItems, setHistoryItems] = useState<PurchaseHistoryItemResponse[]>([]);
  const [lastOrderGroup, setLastOrderGroup] = useState<LastOrderGroupResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);

  // Form đơn hàng
  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([]);
  const [note, setNote] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState<any>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 1. Tải danh sách đại lý của nhân viên
  const loadDealers = useCallback(async () => {
    setLoadingDealers(true);
    try {
      const data = await fetchCustomers();
      setDealers(data || []);

      // Kiểm tra nếu có đại lý được chọn từ màn hình danh sách
      const cached = localStorage.getItem("selectedOrderCustomer");
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.id) {
            setSelectedDealerId(parsed.id);
            localStorage.removeItem("selectedOrderCustomer");
          }
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error("Lỗi tải danh sách đại lý:", err);
    } finally {
      setLoadingDealers(false);
    }
  }, []);

  useEffect(() => {
    loadDealers();
  }, [loadDealers]);

  // 2. Lắng nghe sự kiện chọn Đại lý -> Tự động gọi 2 API SCRUM-11
  const handleDealerChange = useCallback(async (dealerId: number) => {
    setSelectedDealerId(dealerId);
    setLoadingHistory(true);
    setErrorHistory(null);
    setHistoryItems([]);
    setLastOrderGroup(null);

    try {
      const [historyData, lastOrderData] = await Promise.all([
        fetchDealerPurchaseHistory(dealerId),
        fetchDealerLastOrder(dealerId),
      ]);
      setHistoryItems(historyData || []);
      setLastOrderGroup(lastOrderData || null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Không thể tải lịch sử mua hàng của đại lý này.";
      setErrorHistory(msg);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDealerId) {
      handleDealerChange(selectedDealerId);
    }
  }, [selectedDealerId, handleDealerChange]);

  // 3. Thêm 1 mặt hàng từ bảng gợi ý xuống form đơn hàng
  const handleAddSuggestedItem = (item: PurchaseHistoryItemResponse) => {
    setOrderItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.product_id === item.product_id);
      const addQty = Math.max(1, Math.round(item.average_quantity));
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += addQty;
        message.info(
          `Đã tăng thêm ${addQty} ${item.product_name} vào đơn hàng!`
        );
        return updated;
      }
      message.success(`Đã thêm "${item.product_name}" vào đơn hàng!`);
      return [
        ...prev,
        {
          key: `${item.product_id}-${Date.now()}`,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: addQty,
          unit_price: 100000, // Giá mặc định hoặc từ hệ thống
        },
      ];
    });
  };

  // 4. Quick Add: Nút "Thêm lại đơn gần nhất"
  const handleQuickAddLastOrder = () => {
    if (!lastOrderGroup || !lastOrderGroup.items || lastOrderGroup.items.length === 0) {
      message.warning("Đại lý này chưa có đơn hàng thành công trước đó.");
      return;
    }

    const newItems: OrderItemForm[] = lastOrderGroup.items.map((item, idx) => ({
      key: `${item.product_id}-${Date.now()}-${idx}`,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    setOrderItems(newItems);
    message.success(
      `Đã nạp toàn bộ ${newItems.length} mặt hàng từ đơn gần nhất (${lastOrderGroup.order_code || "thành công"}) vào đơn hiện tại!`
    );
  };

  // 5. Cập nhật số lượng / đơn giá trong form
  const handleUpdateItem = (
    key: string,
    field: "quantity" | "unit_price",
    value: number
  ) => {
    setOrderItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item
      )
    );
  };

  const handleRemoveItem = (key: string) => {
    setOrderItems((prev) => prev.filter((i) => i.key !== key));
  };

  // Tính tổng tiền đơn hàng
  const totalAmount = orderItems.reduce(
    (acc, cur) => acc + cur.quantity * cur.unit_price,
    0
  );

  const selectedDealer = dealers.find((d) => d.id === selectedDealerId);

  // Cột cho Bảng Gợi Ý (3 tháng qua)
  const suggestionColumns: ColumnsType<PurchaseHistoryItemResponse> = [
    {
      title: "Mặt hàng thường mua",
      dataIndex: "product_name",
      key: "product_name",
      render: (name) => (
        <Text strong style={{ color: "#1e293b" }}>
          {name}
        </Text>
      ),
    },
    {
      title: "Tổng 90 ngày",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 110,
      align: "center",
      render: (qty) => (
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {qty}
        </Tag>
      ),
    },
    {
      title: "Bình quân / lần",
      dataIndex: "average_quantity",
      key: "average_quantity",
      width: 120,
      align: "center",
      render: (avg) => (
        <Tag color="cyan" style={{ fontWeight: 600 }}>
          {avg}
        </Tag>
      ),
    },
    {
      title: "Hành động",
      key: "action",
      width: 130,
      align: "center",
      render: (_, record) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<PlusOutlined />}
          onClick={() => handleAddSuggestedItem(record)}
        >
          Thêm vào đơn
        </Button>
      ),
    },
  ];

  // Cột cho Bảng Đơn Hàng Hiện Tại
  const orderColumns: ColumnsType<OrderItemForm> = [
    {
      title: "STT",
      key: "index",
      width: 60,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "Sản phẩm / Mặt hàng",
      dataIndex: "product_name",
      key: "product_name",
      render: (name) => <Text strong>{name}</Text>,
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      width: 120,
      align: "center",
      render: (val, record) => (
        <InputNumber
          min={1}
          value={val}
          onChange={(v) => handleUpdateItem(record.key, "quantity", v || 1)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Đơn giá (VNĐ)",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 150,
      align: "right",
      render: (val, record) => (
        <InputNumber
          min={0}
          step={1000}
          value={val}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number(v?.replace(/\$\s?|(,*)/g, "") || 0)}
          onChange={(v) => handleUpdateItem(record.key, "unit_price", v || 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Thành tiền",
      key: "subtotal",
      width: 150,
      align: "right",
      render: (_, record) => (
        <Text strong style={{ color: "#0958d9" }}>
          {formatCurrency(record.quantity * record.unit_price)}
        </Text>
      ),
    },
    {
      title: "Xóa",
      key: "delete",
      width: 60,
      align: "center",
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(record.key)}
        />
      ),
    },
  ];

  const handleSubmitOrder = async () => {
    if (!selectedDealerId) {
      message.error("Vui lòng chọn đại lý trước khi tạo đơn!");
      return;
    }
    if (orderItems.length === 0) {
      message.error("Đơn hàng phải có ít nhất 1 mặt hàng!");
      return;
    }

    setSubmitting(true);
    try {
      // Giả lập lưu đơn hoặc gọi API tạo đơn
      await new Promise((r) => setTimeout(r, 800));
      message.success("Tạo đơn hàng thành công! Đơn đã được chuyển sang trạng thái chờ duyệt.");
      setOrderItems([]);
      setNote("");
    } catch {
      message.error("Có lỗi xảy ra khi tạo đơn hàng.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", paddingBottom: 40 }}>
      {/* Tiêu đề & Chọn Đại lý */}
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 20,
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={12}>
            <Title level={3} style={{ margin: 0, color: "#1e293b" }}>
              <ShoppingCartOutlined style={{ color: "#1677ff", marginRight: 10 }} />
              Tạo đơn hàng cho Đại lý (Sales Order)
            </Title>
            <Text type="secondary">
              Xem lịch sử 3 tháng và đơn gần nhất để tư vấn đặt hàng nhanh chóng, chuẩn xác.
            </Text>
          </Col>
          <Col xs={24} md={12} style={{ textAlign: "right" }}>
            <Space align="center" size="middle">
              <Text strong style={{ fontSize: 14 }}>
                <ShopOutlined style={{ marginRight: 6 }} /> Chọn Đại lý:
              </Text>
              <Select
                showSearch
                style={{ width: 340, textAlign: "left" }}
                placeholder="Chọn đại lý để lên đơn..."
                optionFilterProp="children"
                value={selectedDealerId}
                loading={loadingDealers}
                onChange={handleDealerChange}
                filterOption={(input, option: any) =>
                  (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                }
                options={dealers.map((d) => ({
                  value: d.id,
                  label: `${d.code} - ${d.name} (${d.phone || "Không SĐT"})`,
                }))}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Hiển thị lỗi phân quyền nếu có */}
      {errorHistory && (
        <Alert
          type="error"
          showIcon
          message="Lỗi truy cập dữ liệu đại lý"
          description={errorHistory}
          style={{ marginBottom: 20 }}
        />
      )}

      {/* Thông tin đại lý & Nút Thêm lại đơn gần nhất (Quick Add) */}
      {selectedDealer && (
        <Card
          style={{
            borderRadius: 12,
            marginBottom: 20,
            background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
            border: "1px solid #bbf7d0",
          }}
        >
          <Row gutter={[20, 16]} align="middle" justify="space-between">
            <Col xs={24} md={14}>
              <Space direction="vertical" size={2}>
                <Space align="center">
                  <Title level={4} style={{ margin: 0, color: "#065f46" }}>
                    {selectedDealer.name} ({selectedDealer.code})
                  </Title>
                  <Tag color="green">Đang giao dịch</Tag>
                </Space>
                <Text type="secondary" style={{ color: "#334155" }}>
                  Khu vực: <b>{selectedDealer.territory_name || selectedDealer.address || "Chưa phân vùng"}</b> |
                  Nhóm khách: <b>{selectedDealer.customer_group}</b> | SĐT:{" "}
                  <b>{selectedDealer.phone || "N/A"}</b>
                </Text>
              </Space>
            </Col>

            <Col xs={24} md={10} style={{ textAlign: "right" }}>
              {/* Nút Thêm lại đơn gần nhất (SCRUM-11) */}
              <Tooltip title="Lập tức điền toàn bộ danh sách mặt hàng của lần mua thành công trước vào đơn">
                <Button
                  type="primary"
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={handleQuickAddLastOrder}
                  disabled={
                    !lastOrderGroup ||
                    !lastOrderGroup.items ||
                    lastOrderGroup.items.length === 0
                  }
                  style={{
                    backgroundColor: "#10b981",
                    borderColor: "#10b981",
                    fontWeight: 600,
                    boxShadow: "0 4px 10px rgba(16, 185, 129, 0.3)",
                  }}
                >
                  Thêm lại đơn gần nhất{" "}
                  {lastOrderGroup?.items?.length
                    ? `(${lastOrderGroup.items.length} món)`
                    : ""}
                </Button>
              </Tooltip>
            </Col>
          </Row>
        </Card>
      )}

      {/* Khu vực 2 cột: Bảng gợi ý 90 ngày (bên trái) và Form Đơn hàng (bên phải) */}
      <Row gutter={[24, 24]}>
        {/* CỘT TRÁI: Bảng Gợi ý (Suggestion Panel) - SCRUM-11 */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <HistoryOutlined style={{ color: "#1677ff" }} />
                <span>Mặt hàng mua trong 3 tháng qua</span>
                <Tag color="blue">{historyItems.length} gợi ý</Tag>
              </Space>
            }
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
              height: "100%",
            }}
          >
            {loadingHistory ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <Spin tip="Đang phân tích dữ liệu mua hàng 90 ngày..." />
              </div>
            ) : !selectedDealerId ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Vui lòng chọn Đại lý ở trên để xem gợi ý mặt hàng"
              />
            ) : historyItems.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Đại lý chưa có lịch sử mua hàng trong 90 ngày qua"
              />
            ) : (
              <div>
                <Alert
                  type="info"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  message="Gợi ý số lượng:"
                  description="Bấm '(+) Thêm vào đơn' sẽ tự động điền sản phẩm kèm số lượng bình quân vào form."
                  style={{ marginBottom: 12, fontSize: 12 }}
                />
                <Table<PurchaseHistoryItemResponse>
                  columns={suggestionColumns}
                  dataSource={historyItems}
                  rowKey="product_id"
                  size="small"
                  pagination={{ pageSize: 6 }}
                />
              </div>
            )}
          </Card>
        </Col>

        {/* CỘT PHẢI: Form tạo đơn hàng */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <CheckCircleOutlined style={{ color: "#52c41a" }} />
                <span>Danh sách mặt hàng trong đơn</span>
                <Tag color="purple">{orderItems.length} mặt hàng</Tag>
              </Space>
            }
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
            }}
          >
            <Table<OrderItemForm>
              columns={orderColumns}
              dataSource={orderItems}
              rowKey="key"
              pagination={false}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="Chưa có mặt hàng nào. Hãy chọn từ bảng gợi ý hoặc bấm 'Thêm lại đơn gần nhất'."
                  />
                ),
              }}
              summary={() =>
                orderItems.length > 0 ? (
                  <Table.Summary.Row style={{ backgroundColor: "#fafafa" }}>
                    <Table.Summary.Cell index={0} colSpan={4} align="right">
                      <Text strong style={{ fontSize: 15 }}>
                        Tổng giá trị đơn hàng:
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong style={{ fontSize: 17, color: "#d4380d" }}>
                        {formatCurrency(totalAmount)}
                      </Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2} />
                  </Table.Summary.Row>
                ) : null
              }
            />

            <Divider style={{ margin: "20px 0" }} />

            {/* Thông tin bổ sung */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Text strong>
                  <CalendarOutlined style={{ marginRight: 6 }} /> Ngày giao hàng dự kiến:
                </Text>
                <DatePicker
                  style={{ width: "100%", marginTop: 6 }}
                  placeholder="Chọn ngày giao dự kiến"
                  value={expectedDate}
                  onChange={(d) => setExpectedDate(d)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text strong>Ghi chú đơn hàng:</Text>
                <TextArea
                  rows={2}
                  placeholder="Ghi chú giao hàng, dặn dò kho..."
                  style={{ marginTop: 6 }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </Col>
            </Row>

            <Divider style={{ margin: "20px 0" }} />

            {/* Tổng tiền & Nút tạo đơn */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div>
                <Text type="secondary">Tổng thanh toán dự kiến:</Text>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#0958d9" }}>
                  {formatCurrency(totalAmount)}
                </div>
              </div>

              <Space>
                <Button onClick={() => setOrderItems([])} disabled={orderItems.length === 0}>
                  Xóa trắng đơn
                </Button>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  loading={submitting}
                  onClick={handleSubmitOrder}
                  disabled={orderItems.length === 0 || !selectedDealerId}
                >
                  Xác nhận tạo đơn hàng
                </Button>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CreateOrder;
