import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Table,
  Space,
  Typography,
  Divider,
  Tag,
  Alert,
  message,
  Row,
  Col,
  Statistic,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SwapOutlined,
  SendOutlined,
  ArrowRightOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type {
  WarehouseOption,
  ProductOption,
  CreateTransferPayload,
} from "../../types/internalTransfer";
import {
  createInternalTransfer,
  fetchWarehouses,
  fetchProducts,
} from "../../services/internalTransferService";

const { Title, Text } = Typography;
const { Option } = Select;

interface TransferFormItem {
  key: string;
  productId?: number;
  sentQuantity: number;
}

interface InternalTransferFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  initialFromWarehouseId?: number;
}

export const InternalTransferForm: React.FC<InternalTransferFormProps> = ({
  onSuccess,
  onCancel,
  initialFromWarehouseId,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [fromWarehouseId, setFromWarehouseId] = useState<number | undefined>(initialFromWarehouseId);
  const [toWarehouseId, setToWarehouseId] = useState<number | undefined>();
  const [items, setItems] = useState<TransferFormItem[]>([
    { key: "item-1", productId: undefined, sentQuantity: 1 },
  ]);

  // Load danh sách kho và sản phẩm
  useEffect(() => {
    async function loadInitialData() {
      setFetchingData(true);
      try {
        const whList = await fetchWarehouses();
        setWarehouses(whList);

        if (initialFromWarehouseId) {
          form.setFieldsValue({ from_warehouse_id: initialFromWarehouseId });
          setFromWarehouseId(initialFromWarehouseId);
        } else if (whList.length > 0) {
          const defaultFrom = whList[0].id;
          form.setFieldsValue({ from_warehouse_id: defaultFrom });
          setFromWarehouseId(defaultFrom);
        }
      } catch (err: any) {
        message.error("Lỗi khi tải danh sách kho: " + (err.message || ""));
      } finally {
        setFetchingData(false);
      }
    }
    loadInitialData();
  }, [initialFromWarehouseId, form]);

  // Khi thay đổi kho xuất, tải lại danh sách sản phẩm và tồn kho của kho đó
  useEffect(() => {
    async function loadProductsForWarehouse() {
      if (!fromWarehouseId) return;
      try {
        const prodList = await fetchProducts(fromWarehouseId);
        setProducts(prodList);
      } catch (err: any) {
        console.error("Lỗi tải tồn kho sản phẩm:", err);
      }
    }
    loadProductsForWarehouse();
  }, [fromWarehouseId]);

  // Thêm dòng sản phẩm mới
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { key: `item-${Date.now()}`, productId: undefined, sentQuantity: 1 },
    ]);
  };

  // Xóa dòng sản phẩm
  const handleRemoveItem = (key: string) => {
    if (items.length === 1) {
      message.warning("Phiếu chuyển kho phải có ít nhất 1 sản phẩm.");
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  // Cập nhật sản phẩm được chọn trên 1 dòng
  const handleProductChange = (key: string, productId: number) => {
    // Kiểm tra trùng sản phẩm
    const exists = items.some((i) => i.key !== key && i.productId === productId);
    if (exists) {
      message.warning("Sản phẩm này đã có trong danh sách phiếu chuyển. Vui lòng chỉnh sửa số lượng thay vì thêm dòng mới.");
      return;
    }

    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, productId } : item))
    );
  };

  // Cập nhật số lượng gửi trên 1 dòng
  const handleQuantityChange = (key: string, sentQuantity: number | null) => {
    const qty = Number(sentQuantity) > 0 ? Number(sentQuantity) : 1;
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, sentQuantity: qty } : item))
    );
  };

  // Tính toán tổng số lượng
  const totalSentQuantity = items.reduce((acc, curr) => acc + (curr.productId ? curr.sentQuantity : 0), 0);
  const validProductCount = items.filter((i) => !!i.productId).length;

  // Xử lý gửi biểu mẫu tạo phiếu
  const handleSubmit = async (values: any) => {
    if (!fromWarehouseId || !toWarehouseId) {
      message.error("Vui lòng chọn đầy đủ kho xuất và kho nhận.");
      return;
    }

    if (fromWarehouseId === toWarehouseId) {
      message.error("Kho xuất và kho nhận không được trùng nhau.");
      return;
    }

    const validItems = items.filter((i) => i.productId && i.sentQuantity > 0);
    if (validItems.length === 0) {
      message.error("Vui lòng chọn ít nhất một sản phẩm và số lượng gửi hợp lệ.");
      return;
    }

    // Kiểm tra tồn kho trước khi gửi
    for (const item of validItems) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && typeof prod.available_qty === "number" && item.sentQuantity > prod.available_qty) {
        message.error(
          `Sản phẩm '${prod.name}' yêu cầu gửi ${item.sentQuantity} ${prod.base_unit}, vượt quá tồn khả dụng (${prod.available_qty} ${prod.base_unit}).`
        );
        return;
      }
    }

    const payload: CreateTransferPayload = {
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_code: values.transfer_code?.trim() || undefined,
      items: validItems.map((item) => ({
        product_id: item.productId!,
        sent_quantity: item.sentQuantity,
      })),
    };

    setLoading(true);
    try {
      const result = await createInternalTransfer(payload);
      message.success(`Đã lập phiếu chuyển kho '${result.transfer_code}' thành công! Trạng thái: PENDING (Đang luân chuyển).`);
      form.resetFields();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      message.error(err.message || "Không thể lập phiếu chuyển kho.");
    } finally {
      setLoading(false);
    }
  };

  // Cấu hình bảng sản phẩm chuyển
  const columns = [
    {
      title: "STT",
      key: "index",
      width: 60,
      align: "center" as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Sản phẩm / SKU",
      key: "product",
      render: (_: any, record: TransferFormItem) => {
        const selectedProd = products.find((p) => p.id === record.productId);
        return (
          <Space direction="vertical" style={{ width: "100%" }} size={2}>
            <Select
              showSearch
              placeholder="-- Chọn sản phẩm cần chuyển --"
              value={record.productId}
              onChange={(val) => handleProductChange(record.key, val)}
              filterOption={(input, option) =>
                String(option?.children || "").toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: "100%" }}
            >
              {products.map((p) => (
                <Option key={p.id} value={p.id} disabled={items.some((i) => i.key !== record.key && i.productId === p.id)}>
                  [{p.sku}] {p.name}
                </Option>
              ))}
            </Select>
            {selectedProd && (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                <span>Đơn vị: <strong>{selectedProd.base_unit}</strong></span>
                <span style={{ margin: "0 8px" }}>•</span>
                <span>
                  Tồn khả dụng kho đi:{" "}
                  <strong style={{ color: (selectedProd.available_qty ?? 0) > 0 ? "#16a34a" : "#dc2626" }}>
                    {selectedProd.available_qty ?? 0} {selectedProd.base_unit}
                  </strong>
                </span>
              </div>
            )}
          </Space>
        );
      },
    },
    {
      title: "Số lượng gửi",
      key: "sentQuantity",
      width: 160,
      render: (_: any, record: TransferFormItem) => {
        const prod = products.find((p) => p.id === record.productId);
        const maxQty = prod?.available_qty;
        return (
          <Space direction="vertical" size={2}>
            <InputNumber
              min={1}
              max={typeof maxQty === "number" && maxQty > 0 ? maxQty : undefined}
              value={record.sentQuantity}
              onChange={(val) => handleQuantityChange(record.key, val)}
              style={{ width: "100%" }}
              placeholder="SL gửi"
            />
            {typeof maxQty === "number" && record.sentQuantity > maxQty && (
              <Text type="danger" style={{ fontSize: 11 }}>
                Vượt quá tồn ({maxQty})
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Đơn vị tính",
      key: "unit",
      width: 100,
      align: "center" as const,
      render: (_: any, record: TransferFormItem) => {
        const prod = products.find((p) => p.id === record.productId);
        return <Tag color="blue">{prod?.base_unit || "—"}</Tag>;
      },
    },
    {
      title: "",
      key: "action",
      width: 60,
      align: "center" as const,
      render: (_: any, record: TransferFormItem) => (
        <Tooltip title="Xóa dòng này">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveItem(record.key)}
            disabled={items.length <= 1}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      bordered={false}
      style={{
        borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.06)",
        background: "#ffffff",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Space align="center" style={{ marginBottom: 4 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
            }}
          >
            <SwapOutlined style={{ fontSize: 20 }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: "#1e293b" }}>
              Lập Phiếu Chuyển Kho Nội Bộ
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Điều chuyển hàng hóa giữa các kho trong hệ thống (Hàng sẽ đưa vào trạng thái Đang luân chuyển)
            </Text>
          </div>
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          from_warehouse_id: fromWarehouseId,
        }}
      >
        {/* Phần 1: Chọn Kho Đi và Kho Đến */}
        <div
          style={{
            background: "#f8fafc",
            padding: "16px 20px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            marginBottom: 20,
          }}
        >
          <Row gutter={24} align="middle">
            <Col xs={24} md={11}>
              <Form.Item
                name="from_warehouse_id"
                label={
                  <span style={{ fontWeight: 600, color: "#334155" }}>
                    Kho xuất hàng (Kho đi) <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                }
                rules={[{ required: true, message: "Vui lòng chọn kho xuất hàng" }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  placeholder="-- Chọn kho xuất hàng --"
                  loading={fetchingData}
                  onChange={(val) => {
                    setFromWarehouseId(val);
                    // Reset to_warehouse nếu trùng
                    if (val === toWarehouseId) {
                      form.setFieldsValue({ to_warehouse_id: undefined });
                      setToWarehouseId(undefined);
                    }
                  }}
                  size="large"
                >
                  {warehouses.map((wh) => (
                    <Option key={wh.id} value={wh.id} disabled={!wh.is_active}>
                      [{wh.code}] {wh.name} {!wh.is_active && "(Ngừng hoạt động)"}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={2} style={{ textAlign: "center", padding: "12px 0" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#e2e8f0",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#475569",
                }}
              >
                <ArrowRightOutlined />
              </div>
            </Col>

            <Col xs={24} md={11}>
              <Form.Item
                name="to_warehouse_id"
                label={
                  <span style={{ fontWeight: 600, color: "#334155" }}>
                    Kho nhận hàng (Kho đến) <span style={{ color: "#ef4444" }}>*</span>
                  </span>
                }
                rules={[
                  { required: true, message: "Vui lòng chọn kho nhận hàng" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (value && value === getFieldValue("from_warehouse_id")) {
                        return Promise.reject(new Error("Kho nhận không được trùng với kho xuất!"));
                      }
                      return Promise.resolve();
                    },
                  }),
                ]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  placeholder="-- Chọn kho nhận hàng --"
                  loading={fetchingData}
                  onChange={(val) => setToWarehouseId(val)}
                  size="large"
                >
                  {warehouses.map((wh) => (
                    <Option
                      key={wh.id}
                      value={wh.id}
                      disabled={!wh.is_active || wh.id === fromWarehouseId}
                    >
                      [{wh.code}] {wh.name} {wh.id === fromWarehouseId && "(Trùng kho xuất)"}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24} style={{ marginTop: 16 }}>
            <Col xs={24} md={12}>
              <Form.Item
                name="transfer_code"
                label={<span style={{ color: "#64748b" }}>Mã phiếu chuyển (Tùy chọn)</span>}
                tooltip="Hệ thống sẽ tự động sinh mã dạng TRF-YYYYMMDD-XXXX nếu để trống."
                style={{ marginBottom: 0 }}
              >
                <Input placeholder="Để trống để sinh mã tự động" />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* Phần 2: Danh sách sản phẩm chuyển */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text strong style={{ fontSize: 15, color: "#1e293b" }}>
              Danh Sách Sản Phẩm Chuyển Kho
            </Text>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={handleAddItem}
              style={{ borderColor: "#2563eb", color: "#2563eb" }}
            >
              Thêm sản phẩm
            </Button>
          </div>

          <Table
            dataSource={items}
            columns={columns}
            pagination={false}
            rowKey="key"
            size="middle"
            bordered
            style={{ borderRadius: 8, overflow: "hidden" }}
          />
        </div>

        {/* Phần 3: Thống kê tóm tắt & Cảnh báo */}
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" style={{ background: "#f1f5f9", borderRadius: 8 }}>
              <Statistic
                title="Số mặt hàng cần chuyển"
                value={validProductCount}
                suffix="mặt hàng"
                valueStyle={{ color: "#0f172a", fontSize: 20, fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Card size="small" style={{ background: "#f1f5f9", borderRadius: 8 }}>
              <Statistic
                title="Tổng số lượng hàng gửi"
                value={totalSentQuantity}
                suffix="đơn vị"
                valueStyle={{ color: "#2563eb", fontSize: 20, fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="Lưu ý trừ kho tạm thời"
              description="Khi tạo phiếu chuyển, tồn kho tại kho xuất sẽ lập tức được trừ tạm thời và đưa vào trạng thái Đang luân chuyển. Tồn kho kho đến chỉ được cộng khi kho nhận xác nhận thành công."
              style={{ fontSize: 12 }}
            />
          </Col>
        </Row>

        <Divider style={{ margin: "16px 0 20px 0" }} />

        {/* Nút hành động */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={loading} size="large">
              Hủy bỏ
            </Button>
          )}
          <Button
            type="primary"
            htmlType="submit"
            icon={<SendOutlined />}
            loading={loading}
            size="large"
            style={{
              background: "#2563eb",
              borderColor: "#2563eb",
              fontWeight: 600,
              minWidth: 180,
            }}
          >
            Lập phiếu chuyển kho
          </Button>
        </div>
      </Form>
    </Card>
  );
};

export default InternalTransferForm;
