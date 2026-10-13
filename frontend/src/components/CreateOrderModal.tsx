import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Select,
  Input,
  InputNumber,
  Button,
  Table,
  Typography,
  Alert,
  Card,
  Tag,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  fetchDeliveryAddresses,
  createOrder,
  type CustomerItem,
  type DeliveryAddressItem,
  type OrderItemInput,
  type CreateOrderPayload,
} from "../services/apiClient";

const { Text } = Typography;
const { Option } = Select;

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerItem[];
  preselectedCustomerId?: number | null;
  onOrderCreated?: () => void;
}

interface OrderItemRow extends OrderItemInput {
  key: string;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  customers,
  preselectedCustomerId,
  onOrderCreated,
}) => {
  const [form] = Form.useForm();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [items, setItems] = useState<OrderItemRow[]>([
    { key: "1", sku: "SKU-001", product_name: "Sản phẩm A", quantity: 1, unit_price: 100000 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadCustomerAddresses = useCallback(async (cust: CustomerItem) => {
    setSelectedCustomer(cust);
    setSelectedAddressId(null);
    setLoadingAddresses(true);
    try {
      const addrs = await fetchDeliveryAddresses(cust.id);
      setDeliveryAddresses(addrs);
      // Tự động chọn điểm giao hàng mặc định nếu có
      const defaultAddr = addrs.find((a) => a.is_default);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
        form.setFieldValue("delivery_address_id", defaultAddr.id);
      } else if (addrs.length > 0) {
        setSelectedAddressId(addrs[0].id);
        form.setFieldValue("delivery_address_id", addrs[0].id);
      } else {
        form.setFieldValue("delivery_address_id", undefined);
      }
    } catch (err: unknown) {
      console.error("Lỗi tải điểm giao hàng:", err);
      setDeliveryAddresses([]);
    } finally {
      setLoadingAddresses(false);
    }
  }, [form]);

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      const custId = preselectedCustomerId || (customers.length > 0 ? customers[0].id : null);
      if (custId) {
        const cust = customers.find((c) => c.id === custId);
        if (cust) {
          form.setFieldValue("customer_id", cust.id);
          fetchDeliveryAddresses(cust.id)
            .then((addrs) => {
              if (!ignore) {
                setSelectedCustomer(cust);
                setDeliveryAddresses(addrs);
                const defaultAddr = addrs.find((a) => a.is_default);
                if (defaultAddr) {
                  setSelectedAddressId(defaultAddr.id);
                  form.setFieldValue("delivery_address_id", defaultAddr.id);
                } else if (addrs.length > 0) {
                  setSelectedAddressId(addrs[0].id);
                  form.setFieldValue("delivery_address_id", addrs[0].id);
                } else {
                  form.setFieldValue("delivery_address_id", undefined);
                }
              }
            })
            .catch((err: unknown) => {
              if (!ignore) {
                console.error("Lỗi tải điểm giao hàng:", err);
                setSelectedCustomer(cust);
                setDeliveryAddresses([]);
              }
            });
        }
      }
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, preselectedCustomerId, customers, form]);

  const handleClose = () => {
    form.resetFields();
    setSelectedCustomer(null);
    setDeliveryAddresses([]);
    setSelectedAddressId(null);
    setErrorMsg(null);
    onClose();
  };

  const handleCustomerChange = (custId: number) => {
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      loadCustomerAddresses(cust);
    }
  };

  const handleAddItem = () => {
    const newKey = String(Date.now());
    setItems([
      ...items,
      { key: newKey, sku: `SKU-${items.length + 1}`, product_name: "Sản phẩm", quantity: 1, unit_price: 50000 },
    ]);
  };

  const handleRemoveItem = (key: string) => {
    if (items.length <= 1) {
      message.warning("Đơn hàng phải có ít nhất 1 sản phẩm.");
      return;
    }
    setItems(items.filter((it) => it.key !== key));
  };

  const handleItemChange = (key: string, field: keyof OrderItemRow, value: string | number) => {
    setItems(
      items.map((it) => {
        if (it.key === key) {
          return { ...it, [field]: value };
        }
        return it;
      })
    );
  };

  const selectedAddress = deliveryAddresses.find((a) => a.id === selectedAddressId);
  const totalAmount = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);
  const isCustomerLocked = selectedCustomer?.is_locked;

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedCustomer) {
        message.error("Vui lòng chọn đại lý đặt hàng.");
        return;
      }

      if (selectedCustomer.is_locked) {
        message.error("Đại lý đang bị khóa giao dịch, không thể lên đơn hàng!");
        return;
      }

      if (items.length === 0) {
        message.error("Vui lòng thêm ít nhất một sản phẩm.");
        return;
      }

      setSubmitting(true);
      setErrorMsg(null);

      const payload: CreateOrderPayload = {
        customer_id: selectedCustomer.id,
        delivery_address_id: values.delivery_address_id || null,
        items: items.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
        note: values.note ? values.note.trim() : undefined,
      };

      await createOrder(payload);
      message.success("Tạo đơn hàng thành công!");
      if (onOrderCreated) onOrderCreated();
      handleClose();
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "errorFields" in err) return;
      const messageText = err instanceof Error ? err.message : "Tạo đơn hàng thất bại.";
      setErrorMsg(messageText);
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<OrderItemRow> = [
    {
      title: "MÃ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (val: string, r) => (
        <Input
          value={val}
          onChange={(e) => handleItemChange(r.key, "sku", e.target.value)}
          placeholder="SKU-001"
          size="small"
        />
      ),
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "product_name",
      key: "product_name",
      render: (val: string, r) => (
        <Input
          value={val}
          onChange={(e) => handleItemChange(r.key, "product_name", e.target.value)}
          placeholder="Tên sản phẩm"
          size="small"
        />
      ),
    },
    {
      title: "SỐ LƯỢNG",
      dataIndex: "quantity",
      key: "quantity",
      width: 110,
      render: (val: number, r) => (
        <InputNumber
          min={1}
          value={val}
          onChange={(num) => handleItemChange(r.key, "quantity", num || 1)}
          size="small"
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "ĐƠN GIÁ (₫)",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 140,
      render: (val: number, r) => (
        <InputNumber
          min={0}
          step={1000}
          value={val}
          onChange={(num) => handleItemChange(r.key, "unit_price", num || 0)}
          size="small"
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "THÀNH TIỀN (₫)",
      key: "subtotal",
      width: 140,
      align: "right",
      render: (_, r) => (
        <Text strong>{((r.quantity || 0) * (r.unit_price || 0)).toLocaleString("vi-VN")} ₫</Text>
      ),
    },
    {
      title: "",
      key: "action",
      width: 50,
      align: "center",
      render: (_, r) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(r.key)}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShoppingOutlined style={{ color: "#2563eb", fontSize: 22 }} />
          <span>Lập đơn hàng bán (SCRUM-20 & SCRUM-85)</span>
        </div>
      }
      open={isOpen}
      onCancel={handleClose}
      width={880}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okText="Xác nhận tạo đơn"
      cancelText="Hủy"
      okButtonProps={{ disabled: isCustomerLocked }}
      destroyOnClose
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {errorMsg && <Alert type="error" message={errorMsg} showIcon closable />}

        {isCustomerLocked && (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined />}
            message="Đại lý đang bị khóa giao dịch (SCRUM-85)"
            description={`Lý do: ${selectedCustomer?.lock_reason || "Chặn công nợ quá hạn"}. Hệ thống chặn toàn bộ thao tác lên đơn hàng mới cho đại lý này.`}
          />
        )}

        <Form form={form} layout="vertical">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Chọn đại lý */}
            <Form.Item
              name="customer_id"
              label="Chọn Đại lý / Khách hàng"
              rules={[{ required: true, message: "Vui lòng chọn đại lý" }]}
            >
              <Select
                showSearch
                placeholder="Chọn đại lý"
                onChange={handleCustomerChange}
                optionFilterProp="children"
              >
                {customers.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.code} — {c.name} {c.is_locked ? "(BỊ KHÓA)" : ""}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {/* Chọn điểm giao hàng */}
            <Form.Item
              name="delivery_address_id"
              label={
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span>Điểm giao hàng của đại lý (SCRUM-20)</span>
                  {deliveryAddresses.length === 0 && !loadingAddresses && selectedCustomer && (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      Chưa có điểm giao hàng
                    </Text>
                  )}
                </div>
              }
            >
              <Select
                placeholder="Chọn điểm giao hàng (hoặc để trống nhận mặc định)"
                loading={loadingAddresses}
                value={selectedAddressId}
                onChange={(val) => setSelectedAddressId(val)}
                allowClear
              >
                {deliveryAddresses.map((addr) => (
                  <Option key={addr.id} value={addr.id}>
                    {addr.is_default ? "★ [MẶC ĐỊNH] " : ""}
                    {addr.receiver_name} - {addr.phone} ({addr.address})
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          {/* Chi tiết điểm giao hàng được chọn */}
          {selectedAddress && (
            <Card
              size="small"
              style={{
                backgroundColor: "#f8fafc",
                borderColor: "#e2e8f0",
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <EnvironmentOutlined style={{ color: "#2563eb", fontSize: 18, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Text strong>{selectedAddress.receiver_name}</Text>
                    <Text type="secondary">({selectedAddress.phone})</Text>
                    {selectedAddress.is_default && <Tag color="success">Mặc định</Tag>}
                  </div>
                  <div style={{ color: "#334155", marginTop: 2 }}>{selectedAddress.address}</div>
                  {selectedAddress.note && (
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                      Ghi chú: {selectedAddress.note}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Danh sách sản phẩm trong đơn */}
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text strong style={{ fontSize: 15 }}>
                Danh sách sản phẩm
              </Text>
              <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddItem}>
                Thêm sản phẩm
              </Button>
            </div>

            <Table
              columns={columns}
              dataSource={items}
              pagination={false}
              bordered
              size="small"
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 12,
                padding: "8px 12px",
                backgroundColor: "#f1f5f9",
                borderRadius: 6,
              }}
            >
              <Text style={{ fontSize: 15 }}>
                Tổng giá trị đơn:{" "}
                <Text strong style={{ color: "#2563eb", fontSize: 16 }}>
                  {totalAmount.toLocaleString("vi-VN")} ₫
                </Text>
              </Text>
            </div>
          </div>

          {/* Ghi chú đơn hàng */}
          <Form.Item name="note" label="Ghi chú đơn hàng" style={{ marginTop: 16 }}>
            <Input.TextArea rows={2} placeholder="Ghi chú đơn hàng..." />
          </Form.Item>
        </Form>
      </div>
    </Modal>
  );
};

export default CreateOrderModal;
