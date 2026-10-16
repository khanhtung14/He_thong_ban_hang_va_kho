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
  Tooltip,
  Checkbox,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  WarningOutlined,
  UserOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import {
  fetchDeliveryAddresses,
  createDeliveryAddress,
  createOrder,
  updateOrder,
  type CustomerItem,
  type DeliveryAddressItem,
  type OrderItemInput,
  type CreateOrderPayload,
  type OrderResponseItem,
} from "../services/apiClient";
import { authenticatedFetch } from "../services/sessionService";

const { Text } = Typography;
const { Option } = Select;

export interface ProductOptionItem {
  id: number;
  sku: string;
  name: string;
  sale_price?: number;
  basePrice?: number;
  unit?: string;
  baseUnit?: string;
  stock_available?: number;
  stock?: number;
  status?: string;
}

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerItem[];
  preselectedCustomerId?: number | null;
  onOrderCreated?: () => void;
  editingOrder?: OrderResponseItem | null;
}

interface OrderItemRow extends OrderItemInput {
  key: string;
  unit?: string;
}

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({
  isOpen,
  onClose,
  customers,
  preselectedCustomerId,
  onOrderCreated,
  editingOrder,
}) => {
  const [form] = Form.useForm();
  const [addressForm] = Form.useForm();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [deliveryAddresses, setDeliveryAddresses] = useState<DeliveryAddressItem[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isAddAddressModalOpen, setIsAddAddressModalOpen] = useState(false);
  const [submittingAddress, setSubmittingAddress] = useState(false);

  // Danh mục sản phẩm load từ API
  const [products, setProducts] = useState<ProductOptionItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Danh sách dòng sản phẩm trong đơn hàng
  const [items, setItems] = useState<OrderItemRow[]>([
    { key: "1", sku: "", product_name: "", quantity: 1, unit_price: 0 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gọi API lấy danh mục sản phẩm từ backend
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const res = await authenticatedFetch("/api/v1/products");
      if (res.ok) {
        const json = await res.json();
        const list: ProductOptionItem[] = Array.isArray(json)
          ? json
          : json.data && Array.isArray(json.data)
            ? json.data
            : [];
        // Ưu tiên sản phẩm đang hoạt động ACTIVE
        const activeList = list.filter((p) => !p.status || p.status === "ACTIVE");
        setProducts(activeList.length > 0 ? activeList : list);
      }
    } catch (err: unknown) {
      console.error("Lỗi khi tải danh mục sản phẩm:", err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadCustomerAddresses = useCallback(
    async (cust: CustomerItem) => {
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
    },
    [form]
  );

  useEffect(() => {
    let ignore = false;
    if (isOpen) {
      loadProducts();

      if (editingOrder) {
        // Chế độ chỉnh sửa đơn hàng
        const cust = customers.find((c) => c.id === editingOrder.customer_id) || null;
        if (cust) {
          setSelectedCustomer(cust);
          loadCustomerAddresses(cust);
        }
        form.setFieldsValue({
          customer_id: editingOrder.customer_id,
          delivery_address_id: editingOrder.delivery_address_id || undefined,
          note: editingOrder.note || "",
          submit_for_approval: editingOrder.status === "PENDING_APPROVAL",
        });
        setSelectedAddressId(editingOrder.delivery_address_id || null);

        if (editingOrder.items && editingOrder.items.length > 0) {
          setItems(
            editingOrder.items.map((it, idx) => ({
              key: String(it.id || idx + 1),
              sku: it.sku,
              product_name: it.product_name,
              quantity: it.quantity,
              unit_price: it.unit_price,
            }))
          );
        }
      } else {
        // Reset items về trạng thái sạch sẽ chờ chọn sản phẩm mới
        setItems([{ key: String(Date.now()), sku: "", product_name: "", quantity: 1, unit_price: 0 }]);

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
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, preselectedCustomerId, editingOrder, customers, form, loadProducts, loadCustomerAddresses]);

  const handleClose = () => {
    form.resetFields();
    addressForm.resetFields();
    setIsAddAddressModalOpen(false);
    setSelectedCustomer(null);
    setDeliveryAddresses([]);
    setSelectedAddressId(null);
    setErrorMsg(null);
    setItems([{ key: "1", sku: "", product_name: "", quantity: 1, unit_price: 0 }]);
    onClose();
  };

  const handleOpenAddAddressModal = () => {
    if (!selectedCustomer) {
      message.warning("Vui lòng chọn đại lý trước.");
      return;
    }
    addressForm.resetFields();
    addressForm.setFieldsValue({
      receiver_name: "",
      phone: "",
      address: "",
      note: "",
      is_default: deliveryAddresses.length === 0,
    });
    setIsAddAddressModalOpen(true);
  };

  const handleSaveDeliveryAddress = async () => {
    if (!selectedCustomer) return;
    try {
      const values = await addressForm.validateFields();
      setSubmittingAddress(true);
      const newAddr = await createDeliveryAddress(selectedCustomer.id, {
        receiver_name: values.receiver_name.trim(),
        receiverName: values.receiver_name.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        note: values.note ? values.note.trim() : undefined,
        is_default: Boolean(values.is_default),
        isDefault: Boolean(values.is_default),
      });

      message.success("Thêm điểm giao hàng thành công!");
      setIsAddAddressModalOpen(false);
      addressForm.resetFields();

      // Tự động gọi lại danh sách điểm giao của đại lý này để làm mới dropdown
      const freshAddrs = await fetchDeliveryAddresses(selectedCustomer.id);
      setDeliveryAddresses(freshAddrs);

      // Tự động gán (select) điểm giao vừa tạo làm giá trị được chọn hiện tại trên form lập đơn hàng
      setSelectedAddressId(newAddr.id);
      form.setFieldValue("delivery_address_id", newAddr.id);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "errorFields" in err) {
        return;
      }
      const msg = err instanceof Error ? err.message : "Không thể thêm điểm giao hàng.";
      message.error(msg);
    } finally {
      setSubmittingAddress(false);
    }
  };

  const handleCustomerChange = async (custId: number) => {
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      loadCustomerAddresses(cust);
      // Khi đổi đại lý, tự động cập nhật lại đơn giá các mặt hàng đã chọn theo bảng giá đại lý mới (hoặc fallback base_price)
      if (cust.customer_group && items.some((it) => it.sku)) {
        const updated = await Promise.all(
          items.map(async (it) => {
            if (!it.sku) return it;
            const prod = products.find((p) => p.sku === it.sku);
            let price = Number(prod?.sale_price ?? prod?.basePrice ?? it.unit_price ?? 0);
            try {
              const res = await authenticatedFetch(
                `/api/v1/price-lists/effective/${encodeURIComponent(it.sku)}?customer_group=${encodeURIComponent(
                  cust.customer_group
                )}&fallback=true`
              );
              if (res.ok) {
                const data = await res.json();
                if (data && data.sale_price !== undefined && data.sale_price !== null) {
                  price = Number(data.sale_price);
                }
              }
            } catch {
              // fallback to base_price
            }
            return { ...it, unit_price: price };
          })
        );
        setItems(updated);
      }
    }
  };

  // Thêm một dòng sản phẩm mới
  const handleAddItem = () => {
    const newKey = String(Date.now() + Math.random());
    setItems((prev) => [
      ...prev,
      { key: newKey, sku: "", product_name: "", quantity: 1, unit_price: 0 },
    ]);
  };

  // Xóa dòng sản phẩm
  const handleRemoveItem = (key: string) => {
    if (items.length <= 1) {
      message.warning("Đơn hàng phải có ít nhất 1 sản phẩm.");
      return;
    }
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  // Xử lý khi chọn sản phẩm từ dropdown
  const handleSelectProduct = async (key: string, selectedSku: string) => {
    const prod = products.find((p) => p.sku === selectedSku);
    if (!prod) return;

    let price = Number(prod.sale_price ?? prod.basePrice ?? 0);
    const unit = prod.unit || prod.baseUnit || "";

    // Ưu tiên tra cứu giá theo bảng giá của nhóm đại lý nếu có
    if (selectedCustomer?.customer_group) {
      try {
        const res = await authenticatedFetch(
          `/api/v1/price-lists/effective/${encodeURIComponent(prod.sku)}?customer_group=${encodeURIComponent(
            selectedCustomer.customer_group
          )}&fallback=true`
        );
        if (res.ok) {
          const priceData = await res.json();
          if (priceData && priceData.sale_price !== undefined && priceData.sale_price !== null) {
            price = Number(priceData.sale_price);
          }
        }
      } catch {
        // Tự động fallback về base_price niêm yết của sản phẩm
      }
    }

    // Chỉ hiển thị cảnh báo nhẹ nếu sản phẩm hoàn toàn không có giá nào trong hệ thống
    if (!price || price <= 0) {
      message.warning(
        `Sản phẩm [${prod.sku}] hiện chưa có giá nào trong hệ thống. Vui lòng nhập đơn giá thủ công.`
      );
    }

    setItems((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          return {
            ...it,
            sku: prod.sku,
            product_name: prod.name,
            unit_price: price,
            unit: unit,
          };
        }
        return it;
      })
    );
  };

  // Thay đổi trường cụ thể (số lượng hoặc đơn giá)
  const handleItemChange = (key: string, field: keyof OrderItemRow, value: string | number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          return { ...it, [field]: value };
        }
        return it;
      })
    );
  };

  const selectedAddress = deliveryAddresses.find((a) => a.id === selectedAddressId);
  // Tính toán tổng giá trị đơn tự động theo thời gian thực
  const totalAmount = items.reduce(
    (sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0),
    0
  );
  const isCustomerLocked = selectedCustomer?.is_locked;

  // Xác nhận tạo đơn hàng
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

      // Kiểm tra mọi dòng hàng đều đã chọn sản phẩm hợp lệ
      if (items.some((it) => !it.sku || !it.product_name)) {
        message.error("Vui lòng chọn sản phẩm cho tất cả các dòng hàng!");
        return;
      }

      setSubmitting(true);
      setErrorMsg(null);

      const chosenAddressId = values.delivery_address_id || selectedAddressId || null;
      const isSubmitForApproval = values.submit_for_approval !== false;
      const payload: CreateOrderPayload = {
        customer_id: selectedCustomer.id,
        customerId: selectedCustomer.id,
        delivery_address_id: chosenAddressId,
        deliveryAddressId: chosenAddressId,
        items: items.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
        note: values.note ? values.note.trim() : undefined,
        status: isSubmitForApproval ? "PENDING_APPROVAL" : "DRAFT",
        submit_for_approval: isSubmitForApproval,
        submitForApproval: isSubmitForApproval,
      };

      if (editingOrder) {
        await updateOrder(editingOrder.id, payload);
        message.success(
          isSubmitForApproval
            ? "Cập nhật và đã gửi yêu cầu duyệt đơn hàng thành công!"
            : "Cập nhật đơn hàng thành công!"
        );
      } else {
        await createOrder(payload);
        message.success(
          isSubmitForApproval
            ? "Tạo đơn hàng thành công và đã gửi yêu cầu phê duyệt tới Quản lý kinh doanh!"
            : "Tạo đơn hàng thành công (Lưu nháp)!"
        );
      }
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
      width: 170,
      render: (val: string, r) => (
        <Select
          showSearch
          placeholder="Chọn mã SKU..."
          value={val || undefined}
          onChange={(selectedSku) => handleSelectProduct(r.key, selectedSku)}
          filterOption={(input, option) => {
            const label = String(option?.label || "");
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={products.map((p) => ({
            value: p.sku,
            label: p.sku,
          }))}
          size="small"
          loading={loadingProducts}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "sku",
      key: "product_name",
      width: 250,
      render: (val: string, r) => (
        <Select
          showSearch
          placeholder="Chọn tên sản phẩm..."
          value={val || undefined}
          onChange={(selectedSku) => handleSelectProduct(r.key, selectedSku)}
          filterOption={(input, option) => {
            const label = String(option?.label || "");
            return label.toLowerCase().includes(input.toLowerCase());
          }}
          options={products.map((p) => {
            const unitText = p.unit || p.baseUnit ? ` (${p.unit || p.baseUnit})` : "";
            return {
              value: p.sku,
              label: `${p.name}${unitText}`,
            };
          })}
          size="small"
          loading={loadingProducts}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "ĐƠN VỊ TÍNH",
      dataIndex: "unit",
      key: "unit",
      width: 100,
      align: "center",
      render: (val: string) =>
        val ? (
          <Tag color="cyan" style={{ margin: 0, fontWeight: 600, borderRadius: 4 }}>
            {val}
          </Tag>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        ),
    },
    {
      title: "SỐ LƯỢNG",
      dataIndex: "quantity",
      key: "quantity",
      width: 100,
      render: (val: number, r) => (
        <InputNumber
          min={1}
          defaultValue={1}
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
      width: 130,
      render: (val: number, r) => (
        <InputNumber
          min={0}
          step={1000}
          value={val}
          onChange={(num) => handleItemChange(r.key, "unit_price", num || 0)}
          size="small"
          style={{ width: "100%" }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number(v?.replace(/\$\s?|(,*)/g, "") || 0)}
        />
      ),
    },
    {
      title: "THÀNH TIỀN (₫)",
      key: "subtotal",
      width: 130,
      align: "right",
      render: (_, r) => (
        <Text strong style={{ color: "#047857" }}>
          {((r.quantity || 0) * (r.unit_price || 0)).toLocaleString("vi-VN")} ₫
        </Text>
      ),
    },
    {
      title: "XÓA",
      key: "action",
      width: 50,
      align: "center",
      render: (_, r) => (
        <Tooltip title="Xóa dòng sản phẩm">
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveItem(r.key)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingOutlined style={{ color: "#2563eb", fontSize: 22 }} />
            <span>
              {editingOrder
                ? `Chỉnh sửa đơn hàng ${editingOrder.order_code}`
                : "Lập đơn hàng bán (SCRUM-20 & SCRUM-85)"}
            </span>
          </div>
        }
        open={isOpen}
        onCancel={handleClose}
        width={950}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingOrder ? "Lưu thay đổi" : "Xác nhận tạo đơn"}
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
              description={`Lý do: ${selectedCustomer?.lock_reason || "Chặn công nợ quá hạn"
                }. Hệ thống chặn toàn bộ thao tác lên đơn hàng mới cho đại lý này.`}
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
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "rgba(0, 0, 0, 0.88)", fontSize: 14 }}>
                      Điểm giao hàng của đại lý
                    </span>
                    {deliveryAddresses.length === 0 && !loadingAddresses && selectedCustomer && (
                      <Text type="danger" style={{ fontSize: 12 }}>
                        (Chưa có điểm giao hàng)
                      </Text>
                    )}
                  </div>
                  <Tooltip title={!selectedCustomer ? "Vui lòng chọn đại lý trước" : "Khai báo điểm giao hàng mới cho đại lý"}>
                    <Button
                      type="link"
                      size="small"
                      disabled={!selectedCustomer}
                      onClick={handleOpenAddAddressModal}
                      style={{ padding: 0, height: "auto", fontSize: 13 }}
                    >
                      + Thêm điểm giao mới
                    </Button>
                  </Tooltip>
                </div>
                <Form.Item name="delivery_address_id" style={{ marginBottom: 0 }}>
                  <Select
                    placeholder="Chọn điểm giao hàng (hoặc để trống nhận mặc định)"
                    loading={loadingAddresses}
                    value={selectedAddressId}
                    onChange={(val) => {
                      setSelectedAddressId(val);
                      form.setFieldValue("delivery_address_id", val);
                    }}
                    allowClear
                    dropdownRender={(menu) => (
                      <>
                        {menu}
                        <Divider style={{ margin: "4px 0" }} />
                        <div style={{ padding: "4px 8px" }}>
                          <Tooltip title={!selectedCustomer ? "Vui lòng chọn đại lý trước" : ""}>
                            <Button
                              type="link"
                              size="small"
                              icon={<PlusOutlined />}
                              disabled={!selectedCustomer}
                              onClick={handleOpenAddAddressModal}
                              style={{ width: "100%", textAlign: "left", padding: 0 }}
                            >
                              Thêm địa chỉ mới
                            </Button>
                          </Tooltip>
                        </div>
                      </>
                    )}
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
                scroll={{ x: 930 }}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginTop: 12,
                  padding: "8px 16px",
                  backgroundColor: "#f1f5f9",
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 15 }}>
                  Tổng giá trị đơn:{" "}
                  <Text strong style={{ color: "#047857", fontSize: 17 }}>
                    {totalAmount.toLocaleString("vi-VN")} ₫
                  </Text>
                </Text>
              </div>
            </div>

            {/* Ghi chú đơn hàng */}
            <Form.Item name="note" label="Ghi chú đơn hàng" style={{ marginTop: 16, marginBottom: 12 }}>
              <Input.TextArea rows={2} placeholder="Ghi chú đơn hàng..." />
            </Form.Item>

            {/* Gửi phê duyệt ngay cho Quản lý kinh doanh */}
            <Form.Item
              name="submit_for_approval"
              valuePropName="checked"
              initialValue={true}
              style={{ marginBottom: 4 }}
            >
              <Checkbox defaultChecked>
                <Text strong style={{ color: "#2563eb" }}>
                  Gửi phê duyệt ngay cho Quản lý kinh doanh
                </Text>
              </Checkbox>
            </Form.Item>
          </Form>
        </div>
      </Modal>

      {/* Modal con: Thêm điểm giao hàng mới trực tiếp trên modal đơn hàng */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EnvironmentOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              Thêm điểm giao hàng mới
              {selectedCustomer ? ` — ${selectedCustomer.name}` : ""}
            </span>
          </div>
        }
        open={isAddAddressModalOpen}
        onCancel={() => {
          setIsAddAddressModalOpen(false);
          addressForm.resetFields();
        }}
        onOk={handleSaveDeliveryAddress}
        confirmLoading={submittingAddress}
        okText="Lưu điểm giao"
        cancelText="Hủy"
        destroyOnClose
        zIndex={1050}
      >
        <Form
          form={addressForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="receiver_name"
            label="Tên người nhận"
            rules={[
              { required: true, message: "Vui lòng nhập tên người nhận" },
              { max: 150, message: "Tên người nhận không vượt quá 150 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: Anh Nguyễn Văn Tuấn (Kho A)" prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại" },
              {
                pattern: /^0[1235789]\d{8,9}$/,
                message: "Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 03, 05, 07, 08, 09, 01, 02)",
              },
            ]}
          >
            <Input placeholder="Ví dụ: 0912345678" prefix={<PhoneOutlined />} />
          </Form.Item>

          <Form.Item
            name="address"
            label="Địa chỉ chi tiết / Tên kho"
            rules={[{ required: true, message: "Vui lòng nhập địa chỉ chi tiết / tên kho" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ví dụ: Lô B4 KCN Quang Minh, Mê Linh, Hà Nội"
            />
          </Form.Item>

          <Form.Item
            name="note"
            label="Ghi chú giao hàng / hướng dẫn đường đi"
          >
            <Input.TextArea
              rows={2}
              placeholder="Ví dụ: Xe tải 5 tấn vào được, giao giờ hành chính, gọi trước 30 phút..."
            />
          </Form.Item>

          <Form.Item
            name="is_default"
            valuePropName="checked"
            style={{ marginBottom: 0 }}
          >
            <Checkbox>
              Đặt làm địa chỉ mặc định
            </Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default CreateOrderModal;
