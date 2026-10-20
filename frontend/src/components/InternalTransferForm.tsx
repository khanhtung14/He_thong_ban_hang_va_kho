import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Form,
  Select,
  InputNumber,
  Button,
  Table,
  Typography,
  Space,
  Alert,
  message,
  Popconfirm,
  Tag,
  Divider,
  Row,
  Col,
  Spin,
  Empty,
} from "antd";
import {
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowRightOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  createInternalTransfer,
  fetchWarehouses,
  fetchProducts,
  extractErrorMessage,
  type WarehouseOption,
  type ProductOption,
  type CreateInternalTransferPayload,
  type InternalTransfer,
} from "../services/internalTransferService";

const { Title, Text, Paragraph } = Typography;

export interface InternalTransferFormProps {
  onSuccess?: (createdTransfer: InternalTransfer) => void;
  onCancel?: () => void;
  initialFromWarehouseId?: number;
  initialToWarehouseId?: number;
}

interface TransferItemRow {
  key: string;
  productId?: number;
  quantitySent: number;
}

export const InternalTransferForm: React.FC<InternalTransferFormProps> = ({
  onSuccess,
  onCancel,
  initialFromWarehouseId,
  initialToWarehouseId,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [fromWarehouseId, setFromWarehouseId] = useState<number | undefined>(
    initialFromWarehouseId,
  );
  const [toWarehouseId, setToWarehouseId] = useState<number | undefined>(
    initialToWarehouseId,
  );

  const [items, setItems] = useState<TransferItemRow[]>([
    { key: "item-1", productId: undefined, quantitySent: 1 },
  ]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<InternalTransfer | null>(null);

  // Tải danh sách kho và sản phẩm
  const loadInitialData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [whList, prodList] = await Promise.all([
        fetchWarehouses(),
        fetchProducts(),
      ]);
      setWarehouses(whList);
      setProducts(prodList);

      if (!fromWarehouseId && whList.length > 0) {
        setFromWarehouseId(whList[0].id);
        form.setFieldValue("from_warehouse_id", whList[0].id);
      }
      if (!toWarehouseId && whList.length > 1) {
        setToWarehouseId(whList[1].id);
        form.setFieldValue("to_warehouse_id", whList[1].id);
      }
    } catch (err) {
      message.error("Không thể tải danh mục kho và sản phẩm.");
    } finally {
      setLoadingData(false);
    }
  }, [form, fromWarehouseId, toWarehouseId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Thêm dòng sản phẩm
  const handleAddItem = () => {
    const newKey = `item-${Date.now()}`;
    setItems((prev) => [...prev, { key: newKey, productId: undefined, quantitySent: 1 }]);
  };

  // Xóa dòng sản phẩm
  const handleRemoveItem = (key: string) => {
    if (items.length <= 1) {
      message.warning("Phiếu chuyển phải có ít nhất 1 mặt hàng.");
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  // Cập nhật sản phẩm cho một dòng
  const handleProductChange = (key: string, productId: number) => {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, productId } : item)),
    );
    setErrorMsg(null);
  };

  // Cập nhật số lượng cho một dòng
  const handleQuantityChange = (key: string, qty: number | null) => {
    const val = qty && qty > 0 ? qty : 1;
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantitySent: val } : item)),
    );
    setErrorMsg(null);
  };

  // Xử lý gửi form
  const handleSubmit = async () => {
    setErrorMsg(null);

    if (!fromWarehouseId || !toWarehouseId) {
      setErrorMsg("Vui lòng chọn đầy đủ kho gửi và kho nhận.");
      return;
    }

    if (fromWarehouseId === toWarehouseId) {
      setErrorMsg("Kho gửi và kho nhận không được trùng nhau. Vui lòng chọn kho đích khác.");
      return;
    }

    // Kiểm tra danh sách mặt hàng
    const unselectedItem = items.find((i) => !i.productId);
    if (unselectedItem) {
      setErrorMsg("Vui lòng chọn sản phẩm cho tất cả các dòng hàng.");
      return;
    }

    const invalidQty = items.find((i) => !i.quantitySent || i.quantitySent <= 0);
    if (invalidQty) {
      setErrorMsg("Số lượng chuyển cho mỗi mặt hàng phải lớn hơn 0.");
      return;
    }

    // Kiểm tra trùng sản phẩm trên nhiều dòng
    const productIds = items.map((i) => i.productId as number);
    const uniqueIds = new Set(productIds);
    if (uniqueIds.size !== productIds.length) {
      setErrorMsg("Có sản phẩm bị chọn trùng nhiều lần. Vui lòng gom số lượng vào 1 dòng.");
      return;
    }

    const payload: CreateInternalTransferPayload = {
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      items: items.map((i) => ({
        product_id: i.productId as number,
        quantity_sent: i.quantitySent,
      })),
    };

    setLoading(true);
    try {
      const response = await createInternalTransfer(payload);
      message.success(
        response.message || `Đã tạo phiếu chuyển kho #${response.data.id} thành công!`,
      );
      setLastCreated(response.data);

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Không thể tạo phiếu luân chuyển.");
      setErrorMsg(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Reset form để tạo phiếu tiếp theo
  const handleReset = () => {
    setLastCreated(null);
    setErrorMsg(null);
    setItems([{ key: `item-${Date.now()}`, productId: undefined, quantitySent: 1 }]);
  };

  // Định nghĩa cột bảng chọn hàng
  const columns: ColumnsType<TransferItemRow> = [
    {
      title: "STT",
      key: "index",
      width: 60,
      align: "center",
      render: (_, __, idx) => <Text strong>{idx + 1}</Text>,
    },
    {
      title: "Sản phẩm / SKU",
      key: "product",
      render: (_, record) => (
        <Select
          style={{ width: "100%" }}
          placeholder="-- Chọn mặt hàng cần chuyển --"
          value={record.productId}
          onChange={(val) => handleProductChange(record.key, val)}
          showSearch
          optionFilterProp="label"
          options={products.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.sku}) [ĐVT: ${p.base_unit || "Đơn vị"}]`,
          }))}
        />
      ),
    },
    {
      title: "Đơn vị tính",
      key: "unit",
      width: 120,
      render: (_, record) => {
        const prod = products.find((p) => p.id === record.productId);
        return <Tag color="blue">{prod?.base_unit || "—"}</Tag>;
      },
    },
    {
      title: "Số lượng gửi",
      key: "quantity",
      width: 160,
      render: (_, record) => (
        <InputNumber
          min={1}
          max={100000}
          style={{ width: "100%" }}
          value={record.quantitySent}
          onChange={(val) => handleQuantityChange(record.key, val)}
          addonAfter={products.find((p) => p.id === record.productId)?.base_unit || "cái"}
        />
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 90,
      align: "center",
      render: (_, record) => (
        <Popconfirm
          title="Xóa dòng mặt hàng này?"
          onConfirm={() => handleRemoveItem(record.key)}
          okText="Xóa"
          cancelText="Hủy"
          disabled={items.length <= 1}
        >
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={items.length <= 1}
            title="Xóa mặt hàng"
          />
        </Popconfirm>
      ),
    },
  ];

  // Tính tổng số lượng
  const totalQuantity = items.reduce((sum, i) => sum + (i.quantitySent || 0), 0);
  const selectedProductCount = items.filter((i) => i.productId).length;

  const fromWhName =
    warehouses.find((w) => w.id === fromWarehouseId)?.name || "Kho gửi";
  const toWhName =
    warehouses.find((w) => w.id === toWarehouseId)?.name || "Kho nhận";

  return (
    <Card
      style={{
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "var(--shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1))",
        background: "var(--bg-surface, #ffffff)",
      }}
      title={
        <Space direction="vertical" size={2}>
          <Space align="center">
            <SendOutlined style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 20 }} />
            <Title level={4} style={{ margin: 0, color: "var(--text-primary, #0F172A)" }}>
              Tạo Phiếu Luân Chuyển Hàng Hóa Nội Bộ
            </Title>
          </Space>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Lập phiếu điều chuyển sản phẩm giữa các kho hàng trong chuỗi cung ứng.
          </Text>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={loadInitialData}
          loading={loadingData}
          size="small"
        >
          Làm mới dữ liệu
        </Button>
      }
    >
      {lastCreated ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined style={{ fontSize: 22 }} />}
          message={
            <Text strong style={{ fontSize: 16 }}>
              Phiếu chuyển kho #{lastCreated.id} đã được tạo thành công!
            </Text>
          }
          description={
            <div style={{ marginTop: 8 }}>
              <Paragraph style={{ marginBottom: 8 }}>
                Hàng hóa đang ở trạng thái{" "}
                <Tag color="orange" style={{ fontWeight: 600 }}>
                  ĐANG TRÊN ĐƯỜNG (IN_TRANSIT)
                </Tag>
              </Paragraph>
              <div style={{ fontSize: 13, color: "var(--text-secondary, #475569)" }}>
                • Tuyến luân chuyển: <b>{lastCreated.from_warehouse_name || fromWhName}</b>{" "}
                <ArrowRightOutlined /> <b>{lastCreated.to_warehouse_name || toWhName}</b>
                <br />
                • Số mặt hàng: <b>{lastCreated.details?.length || 0} sản phẩm</b>
              </div>
              <Divider style={{ margin: "12px 0" }} />
              <Space>
                <Button type="primary" onClick={handleReset}>
                  Tạo phiếu chuyển khác
                </Button>
                {onCancel && <Button onClick={onCancel}>Đóng giao diện</Button>}
              </Space>
            </div>
          }
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      ) : null}

      {/* Thông tin quy tắc nghiệp vụ AC 1 */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Quy tắc điều chuyển hàng hóa"
        description="Khi nhấn 'Tạo phiếu chuyển', số lượng hàng hóa sẽ được trừ trực tiếp tại kho gửi và chuyển sang trạng thái 'Đang trên đường' (IN_TRANSIT). Tồn kho tại kho đích TUYỆT ĐỐI CHƯA ĐƯỢC CỘNG cho đến khi kho đích thực hiện 'Xác nhận nhận đủ hàng'."
        style={{
          marginBottom: 20,
          borderRadius: 8,
          background: "var(--info-bg, #EFF6FF)",
          borderColor: "var(--info-border, #BFDBFE)",
        }}
      />

      {errorMsg && (
        <Alert
          type="error"
          showIcon
          message="Không thể tạo phiếu chuyển"
          description={errorMsg}
          closable
          onClose={() => setErrorMsg(null)}
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      <Spin spinning={loadingData}>
        <Form form={form} layout="vertical">
          {/* Section 1: Lựa chọn Kho đi và Kho đến */}
          <Card
            type="inner"
            title="1. Tuyến đường điều chuyển"
            style={{ marginBottom: 20, background: "var(--bg-primary, #F8FAFC)" }}
          >
            <Row gutter={24} align="middle">
              <Col xs={24} md={11}>
                <Form.Item
                  label={<Text strong>Kho xuất phát (Kho gửi) *</Text>}
                  required
                >
                  <Select
                    size="large"
                    placeholder="-- Chọn kho chuyển đi --"
                    value={fromWarehouseId}
                    onChange={(val) => {
                      setFromWarehouseId(val);
                      setErrorMsg(null);
                    }}
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${w.code})`,
                      disabled: w.id === toWarehouseId,
                    }))}
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={2} style={{ textAlign: "center", marginBottom: 16 }}>
                <ArrowRightOutlined
                  style={{
                    fontSize: 24,
                    color: "var(--accent-primary, #4F46E5)",
                    transform: "rotate(0deg)",
                  }}
                />
              </Col>

              <Col xs={24} md={11}>
                <Form.Item
                  label={<Text strong>Kho tiếp nhận (Kho nhận) *</Text>}
                  required
                >
                  <Select
                    size="large"
                    placeholder="-- Chọn kho đích đến --"
                    value={toWarehouseId}
                    onChange={(val) => {
                      setToWarehouseId(val);
                      setErrorMsg(null);
                    }}
                    options={warehouses.map((w) => ({
                      value: w.id,
                      label: `${w.name} (${w.code})`,
                      disabled: w.id === fromWarehouseId,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId && (
              <Text type="danger">
                Kho gửi và kho nhận đang trùng nhau! Vui lòng chọn hai kho khác nhau.
              </Text>
            )}
          </Card>

          {/* Section 2: Danh sách mặt hàng luân chuyển */}
          <Card
            type="inner"
            title={
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <span>2. Danh sách hàng hóa cần chuyển ({items.length} dòng)</span>
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={handleAddItem}
                >
                  Thêm mặt hàng
                </Button>
              </Space>
            }
            style={{ marginBottom: 20 }}
          >
            <Table
              dataSource={items}
              columns={columns}
              pagination={false}
              rowKey="key"
              size="middle"
              locale={{
                emptyText: <Empty description="Chưa có mặt hàng nào được chọn" />,
              }}
            />

            <div
              style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "var(--bg-surface-hover, #F1F5F9)",
                borderRadius: 8,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Space split={<Divider type="vertical" />}>
                <Text>
                  Số mặt hàng: <b>{selectedProductCount} / {items.length}</b>
                </Text>
                <Text>
                  Tổng số lượng gửi:{" "}
                  <Text strong style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 16 }}>
                    {totalQuantity.toLocaleString("vi-VN")}
                  </Text>
                </Text>
              </Space>

              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddItem}
                size="small"
              >
                Thêm sản phẩm
              </Button>
            </div>
          </Card>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            {onCancel && (
              <Button size="large" onClick={onCancel} disabled={loading}>
                Hủy bỏ
              </Button>
            )}
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              onClick={handleSubmit}
              loading={loading}
              disabled={loadingData}
              style={{
                background: "var(--accent-primary, #4F46E5)",
                borderColor: "var(--accent-primary, #4F46E5)",
              }}
            >
              Tạo phiếu chuyển kho (Gửi hàng)
            </Button>
          </div>
        </Form>
      </Spin>
    </Card>
  );
};

export default InternalTransferForm;
