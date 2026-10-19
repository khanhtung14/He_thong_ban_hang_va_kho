import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  Input,
  Button,
  Tag,
  Badge,
  Drawer,
  Space,
  Select,
  DatePicker,
  Divider,
  Alert,
  Spin,
  Empty,
  InputNumber,
  message,
  Tooltip,
} from "antd";
import {
  ShoppingCartOutlined,
  SearchOutlined,
  PlusOutlined,
  MinusOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SendOutlined,
  ShopOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  DollarOutlined,
  CreditCardOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import {
  fetchPortalCustomerProfile,
  fetchCustomerProducts,
  fetchCategoriesList,
  simulateOrder,
  createOrder,
  type PortalCustomerInfo,
  type PortalProductItem,
  type PortalDeliveryAddress,
  type OrderSimulateResponseData,
} from "../../services/apiClient";

const { Title, Text, Paragraph } = Typography;

interface CartItem {
  product: PortalProductItem;
  quantity: number;
}

interface CustomerCatalogProps {
  onOrderSuccess?: () => void;
}

export const CustomerCatalog: React.FC<CustomerCatalogProps> = ({ onOrderSuccess }) => {
  // State thông tin đại lý
  const [customer, setCustomer] = useState<PortalCustomerInfo | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);

  // State danh mục & sản phẩm
  const [products, setProducts] = useState<PortalProductItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; code?: string }>>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);

  // Bộ lọc
  const [keyword, setKeyword] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<number | "ALL">("ALL");

  // Giỏ hàng
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Form đặt hàng
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [desiredDate, setDesiredDate] = useState<Dayjs>(() => dayjs().add(1, "day"));
  const [orderNote, setOrderNote] = useState<string>("");

  // Mô phỏng tính tiền & công nợ
  const [simulating, setSimulating] = useState<boolean>(false);
  const [simulation, setSimulation] = useState<OrderSimulateResponseData | null>(null);

  // Gửi đơn
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Nhận diện kích thước màn hình
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== "undefined" && window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 1. Tải thông tin đại lý (bao gồm hạn mức, dư nợ, điểm giao hàng)
  const loadCustomerProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const data = await fetchPortalCustomerProfile();
      setCustomer(data);
      if (data.delivery_addresses && data.delivery_addresses.length > 0) {
        const defaultAddr = data.delivery_addresses.find((a) => a.is_default);
        setSelectedAddressId(defaultAddr ? defaultAddr.id : data.delivery_addresses[0].id);
      }
    } catch (err: any) {
      console.error("Lỗi tải thông tin đại lý:", err);
      message.error(err.message || "Không thể tải thông tin đại lý.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // 2. Tải danh mục & sản phẩm theo nhóm giá của đại lý
  const loadCatalogData = useCallback(async () => {
    setProductsLoading(true);
    try {
      const [cats, prods] = await Promise.all([
        fetchCategoriesList().catch(() => []),
        fetchCustomerProducts({
          keyword: keyword.trim() || undefined,
          categoryId: selectedCategory === "ALL" ? undefined : selectedCategory,
        }),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err: any) {
      console.error("Lỗi tải danh mục sản phẩm:", err);
      message.error(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setProductsLoading(false);
    }
  }, [keyword, selectedCategory]);

  useEffect(() => {
    loadCustomerProfile();
  }, [loadCustomerProfile]);

  useEffect(() => {
    loadCatalogData();
  }, [loadCatalogData]);

  // Thao tác giỏ hàng
  const handleAddToCart = (product: PortalProductItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const avail = product.available_quantity ?? product.available_qty ?? product.stock_available ?? 9999;
      if (existing) {
        if (existing.quantity >= avail) {
          message.warning(`Sản phẩm '${product.name}' chỉ còn ${avail} đơn vị khả dụng!`);
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      if (avail <= 0) {
        message.warning(`Sản phẩm '${product.name}' hiện đang hết hàng!`);
        return prev;
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (productId: number, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        return prev.filter((item) => item.product.id !== productId);
      }
      const existing = prev.find((item) => item.product.id === productId);
      if (existing) {
        const avail =
          existing.product.available_quantity ??
          existing.product.available_qty ??
          existing.product.stock_available ??
          9999;
        if (qty > avail) {
          message.warning(`Sản phẩm '${existing.product.name}' chỉ còn ${avail} đơn vị khả dụng!`);
          return prev.map((item) =>
            item.product.id === productId ? { ...item, quantity: avail } : item
          );
        }
      }
      return prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item
      );
    });
  };

  const handleRemoveFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const rawCartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = item.product.sale_price ?? item.product.basePrice ?? 0;
      return sum + price * item.quantity;
    }, 0);
  }, [cart]);

  // Tự động mô phỏng đơn hàng khi mở giỏ hoặc thay đổi số lượng
  useEffect(() => {
    if (!customer || cart.length === 0) {
      setSimulation(null);
      return;
    }

    let isMounted = true;
    const runSimulation = async () => {
      setSimulating(true);
      try {
        const res = await simulateOrder({
          customer_id: customer.id,
          warehouse_id: customer.warehouse_id,
          items: cart.map((c) => ({
            product_id: c.product.id,
            productId: c.product.id,
            sku: c.product.sku,
            quantity: c.quantity,
            unit_price: c.product.sale_price ?? c.product.basePrice,
            unitPrice: c.product.sale_price ?? c.product.basePrice,
          })),
        });
        if (isMounted) {
          setSimulation(res);
        }
      } catch (err) {
        console.warn("Không thể mô phỏng đơn hàng:", err);
      } finally {
        if (isMounted) setSimulating(false);
      }
    };

    const timer = setTimeout(runSimulation, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [customer, cart]);

  // Xử lý gửi đơn hàng
  const handleSubmitOrder = async () => {
    if (!customer) {
      message.error("Không tìm thấy thông tin đại lý.");
      return;
    }
    if (customer.is_locked) {
      message.error(
        `Đại lý đang bị khóa giao dịch (${customer.lock_reason || "Chưa rõ lý do"}). Không thể gửi đơn hàng!`
      );
      return;
    }
    if (cart.length === 0) {
      message.warning("Giỏ hàng của bạn đang trống!");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer_id: customer.id,
        customerId: customer.id,
        delivery_address_id: selectedAddressId,
        deliveryAddressId: selectedAddressId,
        warehouse_id: customer.warehouse_id,
        warehouseId: customer.warehouse_id,
        deliveryDateExpected: desiredDate ? desiredDate.format("YYYY-MM-DD") : undefined,
        desired_delivery_date: desiredDate ? desiredDate.format("YYYY-MM-DD") : undefined,
        note: orderNote.trim() || undefined,
        status: "PENDING_APPROVAL",
        submit_for_approval: true,
        submitForApproval: true,
        items: cart.map((c) => ({
          product_id: c.product.id,
          productId: c.product.id,
          sku: c.product.sku,
          product_name: c.product.name,
          quantity: c.quantity,
          unit_price: c.product.sale_price ?? c.product.basePrice ?? 0,
          unitPrice: c.product.sale_price ?? c.product.basePrice ?? 0,
          unit: c.product.unit ?? c.product.baseUnit ?? "Cái",
        })),
      };

      const result = await createOrder(payload as any);
      message.success(
        `Đơn hàng #${result.order_code || result.id} đã được gửi thành công! Đơn đang ở trạng thái 'Chờ duyệt' do nhân viên phụ trách xác nhận.`
      );
      setCart([]);
      setIsCartOpen(false);
      if (onOrderSuccess) {
        onOrderSuccess();
      }
    } catch (err: any) {
      console.error("Lỗi tạo đơn hàng đại lý:", err);
      message.error(err.message || "Không thể gửi đơn hàng. Vui lòng thử lại!");
    } finally {
      setSubmitting(false);
    }
  };

  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null) return "0 ₫";
    return `${Math.round(val).toLocaleString("vi-VN")} ₫`;
  };

  // Tính toán công nợ còn lại
  const currentDebt = customer?.current_debt ?? customer?.currentDebt ?? 0;
  const creditLimit = customer?.credit_limit ?? customer?.creditLimit ?? 0;
  const orderTotal = simulation?.grandTotal ?? rawCartSubtotal;
  const remainingDebtCapacity = Math.max(0, creditLimit - currentDebt - orderTotal);
  const isCreditExceeded = creditLimit > 0 && currentDebt + orderTotal > creditLimit;

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* 1. Header Đại lý & Tổng quan hạn mức */}
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 20,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
        }}
      >
        {profileLoading ? (
          <Spin tip="Đang tải dữ liệu đại lý..." />
        ) : (
          <div>
            <Row gutter={[16, 16]} align="middle" justify="space-between">
              <Col xs={24} md={12}>
                <Space align="center" size={12}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: "#eff6ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#2563eb",
                      fontSize: 22,
                    }}
                  >
                    <ShopOutlined />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Title level={4} style={{ margin: 0, color: "#1e293b" }}>
                        {customer?.name || "Đại lý khách hàng"}
                      </Title>
                      <Tag color="blue" style={{ fontWeight: 600 }}>
                        {customer?.code}
                      </Tag>
                      <Tag color="purple">
                        Bảng giá: {customer?.customer_group || "Tiêu chuẩn"}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Kho xuất hàng: <strong>{customer?.warehouse_name || "Kho Tổng"}</strong>
                    </Text>
                  </div>
                </Space>
              </Col>

              {/* Thẻ nhanh công nợ */}
              <Col xs={24} md={12}>
                <Row gutter={12}>
                  <Col span={8}>
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#f1f5f9",
                        borderRadius: 10,
                        textAlign: "center",
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                        Hạn mức nợ
                      </Text>
                      <Text strong style={{ fontSize: 13, color: "#0284c7" }}>
                        {formatMoney(creditLimit)}
                      </Text>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#fff1f2",
                        borderRadius: 10,
                        textAlign: "center",
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                        Dư nợ hiện tại
                      </Text>
                      <Text strong style={{ fontSize: 13, color: "#e11d48" }}>
                        {formatMoney(currentDebt)}
                      </Text>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#ecfdf5",
                        borderRadius: 10,
                        textAlign: "center",
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                        Hạn mức còn lại
                      </Text>
                      <Text strong style={{ fontSize: 13, color: "#059669" }}>
                        {formatMoney(Math.max(0, creditLimit - currentDebt))}
                      </Text>
                    </div>
                  </Col>
                </Row>
              </Col>
            </Row>

            {customer?.is_locked && (
              <Alert
                type="error"
                icon={<WarningOutlined />}
                showIcon
                style={{ marginTop: 16, borderRadius: 8 }}
                message={
                  <span>
                    <strong>Tài khoản đại lý đang bị khóa giao dịch:</strong> {customer.lock_reason || "Nợ quá hạn hoặc kiểm soát nội bộ"}. Bạn không thể gửi đơn hàng lúc này!
                  </span>
                }
              />
            )}
          </div>
        )}
      </Card>

      {/* 2. Thanh tìm kiếm & Bộ lọc ngành hàng */}
      <Card
        style={{
          borderRadius: 14,
          marginBottom: 20,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
        }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} sm={14} md={16}>
            <Input
              size="large"
              placeholder="Tìm theo tên sản phẩm hoặc mã SKU..."
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              style={{ borderRadius: 10 }}
            />
          </Col>
          <Col xs={24} sm={10} md={8}>
            <Select
              size="large"
              style={{ width: "100%", borderRadius: 10 }}
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              options={[
                { value: "ALL", label: "Tất cả ngành hàng" },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* 3. Danh sách sản phẩm (Lưới Responsive tối ưu điện thoại) */}
      {productsLoading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Spin size="large" tip="Đang nạp bảng giá và sản phẩm cho đại lý..." />
        </div>
      ) : products.length === 0 ? (
        <Card style={{ borderRadius: 16, textAlign: "center", padding: "40px 0" }}>
          <Empty
            description={
              <div>
                <Paragraph strong style={{ fontSize: 16, color: "#475569" }}>
                  Không tìm thấy sản phẩm nào phù hợp
                </Paragraph>
                <Text type="secondary">
                  Chỉ các sản phẩm nằm trong Bảng giá của nhóm <strong>{customer?.customer_group}</strong> mới được hiển thị.
                </Text>
              </div>
            }
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {products.map((p) => {
            const inCart = cart.find((item) => item.product.id === p.id);
            const qtyInCart = inCart ? inCart.quantity : 0;
            const availStock =
              p.available_quantity ?? p.available_qty ?? p.stock_available ?? 0;
            const isOutOfStock = availStock <= 0;
            const price = p.sale_price ?? p.basePrice ?? 0;

            return (
              <Col xs={24} sm={12} md={8} lg={6} key={p.id}>
                <Card
                  hoverable
                  style={{
                    borderRadius: 14,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    border: qtyInCart > 0 ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                    transition: "all 0.2s ease-in-out",
                    backgroundColor: "#ffffff",
                  }}
                  bodyStyle={{ padding: "16px", display: "flex", flexDirection: "column", height: "100%" }}
                >
                  <div style={{ flex: 1 }}>
                    {/* Badge ngành hàng & SKU */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Tag color="cyan" style={{ fontSize: 11, borderRadius: 6, margin: 0 }}>
                        {p.category || "Hàng hóa"}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 11, fontFamily: "monospace" }}>
                        {p.sku}
                      </Text>
                    </div>

                    {/* Tên sản phẩm */}
                    <Title
                      level={5}
                      style={{
                        margin: "4px 0 8px 0",
                        fontSize: 15,
                        lineHeight: 1.35,
                        color: "#0f172a",
                        minHeight: 40,
                      }}
                      ellipsis={{ rows: 2 }}
                    >
                      {p.name}
                    </Title>

                    {/* ĐVT & Tồn kho */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Tag style={{ fontSize: 11, margin: 0 }}>
                        ĐVT: {p.unit || p.baseUnit || "Cái"}
                      </Tag>
                      {isOutOfStock ? (
                        <Tag color="error" style={{ fontSize: 11, margin: 0 }}>
                          Tạm hết hàng
                        </Tag>
                      ) : availStock <= 10 ? (
                        <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>
                          Chỉ còn {availStock}
                        </Tag>
                      ) : (
                        <Tag color="success" style={{ fontSize: 11, margin: 0 }}>
                          Sẵn có: {availStock}
                        </Tag>
                      )}
                    </div>
                  </div>

                  {/* Giá & Bộ điều khiển thêm giỏ */}
                  <div
                    style={{
                      borderTop: "1px dashed #f1f5f9",
                      paddingTop: 12,
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: "block" }}>
                        Giá đại lý
                      </Text>
                      <Text strong style={{ fontSize: 16, color: "#2563eb" }}>
                        {formatMoney(price)}
                      </Text>
                    </div>

                    {/* Nút thao tác to bản, thân thiện ngón tay trên điện thoại */}
                    {qtyInCart > 0 ? (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          backgroundColor: "#eff6ff",
                          borderRadius: 8,
                          padding: 2,
                          border: "1px solid #bfdbfe",
                        }}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<MinusOutlined />}
                          onClick={() => handleUpdateQuantity(p.id, qtyInCart - 1)}
                          style={{ width: 28, height: 28, color: "#1d4ed8" }}
                        />
                        <span
                          style={{
                            padding: "0 8px",
                            fontWeight: 700,
                            fontSize: 14,
                            color: "#1d4ed8",
                            minWidth: 24,
                            textAlign: "center",
                          }}
                        >
                          {qtyInCart}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined />}
                          disabled={qtyInCart >= availStock}
                          onClick={() => handleUpdateQuantity(p.id, qtyInCart + 1)}
                          style={{ width: 28, height: 28, color: "#1d4ed8" }}
                        />
                      </div>
                    ) : (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={isOutOfStock || customer?.is_locked}
                        onClick={() => handleAddToCart(p)}
                        style={{
                          borderRadius: 8,
                          fontWeight: 600,
                          backgroundColor: isOutOfStock ? undefined : "#2563eb",
                        }}
                      >
                        Chọn mua
                      </Button>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* 4. Thanh giỏ hàng nổi cố định ở đáy (Floating Cart Bar - Thiết kế Pill gọn gàng, tinh tế cho di động) */}
      {cart.length > 0 && (
        <div
          onClick={() => setIsCartOpen(true)}
          style={{
            position: "fixed",
            bottom: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(calc(100% - 24px), 520px)",
            backgroundColor: "#1e293b",
            color: "#ffffff",
            padding: "8px 10px 8px 14px",
            borderRadius: 9999,
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 1000,
            cursor: "pointer",
            transition: "all 0.2s ease-in-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Badge count={totalItemsCount} overflowCount={99} color="#ef4444" offset={[-2, 2]}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  backgroundColor: "#334155",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: 18,
                }}
              >
                <ShoppingCartOutlined />
              </div>
            </Badge>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
              <span
                style={{
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {formatMoney(orderTotal)}
              </span>
              {simulation?.discountAmount && simulation.discountAmount > 0 ? (
                <Tag color="success" style={{ margin: 0, fontSize: 11, padding: "0 6px", borderRadius: 4, fontWeight: 600 }}>
                  Giảm {formatMoney(simulation.discountAmount)}
                </Tag>
              ) : null}
              <span
                style={{
                  color: "#94a3b8",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                ({totalItemsCount} món)
              </span>
            </div>
          </div>

          <Button
            type="primary"
            size="middle"
            onClick={(e) => {
              e.stopPropagation();
              setIsCartOpen(true);
            }}
            style={{
              backgroundColor: "#2563eb",
              borderRadius: 9999,
              fontWeight: 600,
              fontSize: 13,
              height: 36,
              padding: "0 14px",
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            Xem giỏ <ArrowRightOutlined style={{ fontSize: 11 }} />
          </Button>
        </div>
      )}

      {/* 5. Drawer Giỏ hàng & Kiểm tra hạn mức công nợ (Side Drawer trên Desktop, Bottom Drawer trên Mobile) */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShoppingCartOutlined style={{ color: "#2563eb", fontSize: 18 }} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                Giỏ hàng của bạn ({totalItemsCount} món)
              </span>
            </div>
            {cart.length > 0 && (
              <Button
                type="text"
                danger
                size="small"
                onClick={() => setCart([])}
                style={{ fontSize: 12, padding: "0 6px", height: 26 }}
              >
                Xóa tất cả
              </Button>
            )}
          </div>
        }
        placement={isMobile ? "bottom" : "right"}
        height={isMobile ? "85vh" : undefined}
        width={isMobile ? "100%" : 580}
        zIndex={1200}
        onClose={() => setIsCartOpen(false)}
        open={isCartOpen}
        styles={{
          body: { padding: isMobile ? "10px 12px" : "14px 16px", backgroundColor: "#f8fafc" },
          content: isMobile
            ? { borderTopLeftRadius: 18, borderTopRightRadius: 18 }
            : { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
        }}
        footer={
          <div style={{ padding: "4px 0" }}>
            {/* Khối tóm tắt tính tiền chiết khấu & giá cuối */}
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              {/* Dòng 1: Tiền hàng tạm tính */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  color: "#64748b",
                  marginBottom: 6,
                }}
              >
                <span>Tiền hàng tạm tính:</span>
                <span style={{ fontWeight: 600, color: "#1e293b" }}>
                  {formatMoney(simulation?.subTotal ?? rawCartSubtotal)}
                </span>
              </div>

              {/* Dòng 2: Số tiền chiết khấu sản lượng */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <span style={{ color: simulation?.discountAmount && simulation.discountAmount > 0 ? "#059669" : "#64748b" }}>
                  Chiết khấu sản lượng:
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: simulation?.discountAmount && simulation.discountAmount > 0 ? "#059669" : "#64748b",
                  }}
                >
                  {simulation?.discountAmount && simulation.discountAmount > 0
                    ? `-${formatMoney(simulation.discountAmount)}`
                    : "0 ₫"}
                </span>
              </div>

              <div style={{ height: 1, backgroundColor: "#f1f5f9", margin: "6px 0 8px 0" }} />

              {/* Dòng 3: Giá cuối cùng sau chiết khấu */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                    Tổng thanh toán:
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    (Đã áp dụng chiết khấu)
                  </div>
                </div>
                <Text
                  strong
                  style={{
                    fontSize: 19,
                    color: simulation?.discountAmount && simulation.discountAmount > 0 ? "#059669" : "#2563eb",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatMoney(orderTotal)}
                </Text>
              </div>
            </div>

            {/* Dòng 2: Cụm nút hành động thân thiện cả mobile và desktop */}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                onClick={() => setIsCartOpen(false)}
                size="middle"
                style={{
                  flex: 1,
                  borderRadius: 8,
                  fontWeight: 500,
                  fontSize: 13,
                  height: 40,
                }}
              >
                Tiếp tục chọn
              </Button>
              <Button
                type="primary"
                size="middle"
                icon={<SendOutlined />}
                loading={submitting}
                disabled={cart.length === 0 || customer?.is_locked}
                onClick={handleSubmitOrder}
                style={{
                  flex: 2,
                  borderRadius: 8,
                  backgroundColor: "#2563eb",
                  fontWeight: 600,
                  fontSize: 13,
                  height: 40,
                }}
              >
                Gửi đơn đặt hàng
              </Button>
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Banner thông báo chiết khấu nếu có */}
          {simulation?.discountAmount && simulation.discountAmount > 0 ? (
            <Alert
              type="success"
              showIcon
              message={
                <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                  Đơn hàng của bạn được chiết khấu tổng cộng{" "}
                  <strong style={{ color: "#059669" }}>
                    {formatMoney(simulation.discountAmount)}
                  </strong>{" "}
                  theo chính sách sản lượng!
                </div>
              }
              style={{ borderRadius: 10, border: "1px solid #a7f3d0" }}
            />
          ) : null}

          {/* Khối 1: Danh sách mặt hàng đã chọn */}
          <Card
            size="small"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}>Chi tiết sản phẩm đã chọn</span>}
            style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
            bodyStyle={{ padding: "8px 12px" }}
          >
            {cart.map((item) => {
              const p = item.product;
              const price = p.sale_price ?? p.basePrice ?? 0;
              const rawLineTotal = price * item.quantity;
              const avail = p.available_quantity ?? p.available_qty ?? p.stock_available ?? 9999;

              const itemSim = simulation?.itemsValidation?.find(
                (v) => (v.productId && v.productId === p.id) || (v.sku && p.sku && v.sku.toUpperCase() === p.sku.toUpperCase())
              );
              const discAmount = itemSim?.discountAmount ?? 0;
              const discPercent = itemSim?.discountPercent ?? 0;
              const finalLineTotal = itemSim?.lineTotal ?? (rawLineTotal - discAmount);
              const hasDiscount = discAmount > 0;
              const appliedPolicy = itemSim?.appliedPolicyName;

              return (
                <div
                  key={p.id}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  {/* Hàng 1: Tên sản phẩm + SKU + Nút xoá */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.35 }}>
                        {p.name}
                      </Text>
                      {p.sku && (
                        <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 2 }}>
                          SKU: {p.sku}
                        </div>
                      )}
                    </div>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined style={{ fontSize: 13 }} />}
                      onClick={() => handleRemoveFromCart(p.id)}
                      style={{ color: "#ef4444", padding: "0 4px", height: 22 }}
                    />
                  </div>

                  {/* Hàng 2: Đơn giá, Bộ đếm số lượng */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {formatMoney(price)} / {p.unit || p.baseUnit || "Cái"}
                    </span>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        backgroundColor: "#f1f5f9",
                        borderRadius: 6,
                        padding: 2,
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MinusOutlined style={{ fontSize: 10 }} />}
                        onClick={() => handleUpdateQuantity(p.id, item.quantity - 1)}
                        style={{ width: 24, height: 24, padding: 0 }}
                      />
                      <span
                        style={{
                          padding: "0 6px",
                          fontWeight: 600,
                          fontSize: 12,
                          minWidth: 20,
                          textAlign: "center",
                        }}
                      >
                        {item.quantity}
                      </span>
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusOutlined style={{ fontSize: 10 }} />}
                        disabled={item.quantity >= avail}
                        onClick={() => handleUpdateQuantity(p.id, item.quantity + 1)}
                        style={{ width: 24, height: 24, padding: 0 }}
                      />
                    </div>
                  </div>

                  {/* Hàng 3: Chiết khấu và Giá cuối hiển thị sau chiết khấu */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 8,
                      paddingTop: 6,
                      borderTop: "1px dashed #f1f5f9",
                      fontSize: 12,
                    }}
                  >
                    <div>
                      {hasDiscount ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          <Tag
                            color="success"
                            style={{
                              margin: 0,
                              fontSize: 11,
                              borderRadius: 4,
                              fontWeight: 600,
                            }}
                          >
                            Chiết khấu: -{formatMoney(discAmount)} {discPercent > 0 ? `(-${discPercent}%)` : ""}
                          </Tag>
                          {appliedPolicy && (
                            <span style={{ fontSize: 11, color: "#059669", fontStyle: "italic" }}>
                              ({appliedPolicy})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: 11 }}>
                          Tạm tính: {formatMoney(rawLineTotal)}
                        </span>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      {hasDiscount ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span
                            style={{
                              textDecoration: "line-through",
                              color: "#94a3b8",
                              fontSize: 11,
                              lineHeight: 1.2,
                            }}
                          >
                            {formatMoney(rawLineTotal)}
                          </span>
                          <span style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            Giá cuối:{" "}
                            <strong style={{ color: "#059669", fontSize: 14 }}>
                              {formatMoney(finalLineTotal)}
                            </strong>
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span style={{ fontSize: 11, color: "#64748b", marginRight: 4 }}>
                            Thành tiền:
                          </span>
                          <Text strong style={{ color: "#0f172a", fontSize: 13 }}>
                            {formatMoney(finalLineTotal)}
                          </Text>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Khối 2: Thông tin nhận hàng */}
          <Card
            size="small"
            title={<span style={{ fontSize: 13, fontWeight: 600 }}>Thông tin nhận hàng</span>}
            style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
            bodyStyle={{ padding: 12 }}
          >
            <div style={{ marginBottom: 10 }}>
              <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                <EnvironmentOutlined style={{ marginRight: 4, color: "#2563eb" }} />
                Điểm giao hàng:
              </Text>
              {customer?.delivery_addresses && customer.delivery_addresses.length > 0 ? (
                <Select
                  style={{ width: "100%" }}
                  size="middle"
                  value={selectedAddressId}
                  onChange={(val) => setSelectedAddressId(val)}
                  options={customer.delivery_addresses.map((a) => ({
                    value: a.id,
                    label: `${a.receiver_name} - ${a.phone} (${a.address})${a.is_default ? " [Mặc định]" : ""}`,
                  }))}
                />
              ) : (
                <Alert
                  type="warning"
                  message="Đại lý chưa có điểm giao hàng cụ thể, đơn hàng sẽ giao về địa chỉ công ty đăng ký."
                  style={{ borderRadius: 8, fontSize: 12, padding: "6px 10px" }}
                />
              )}
            </div>

            <Row gutter={8}>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    <CalendarOutlined style={{ marginRight: 4, color: "#2563eb" }} />
                    Ngày nhận mong muốn:
                  </Text>
                  <DatePicker
                    style={{ width: "100%" }}
                    value={desiredDate}
                    onChange={(d) => d && setDesiredDate(d)}
                    format="DD/MM/YYYY"
                    minDate={dayjs()}
                  />
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
                    Ghi chú đơn hàng:
                  </Text>
                  <Input
                    placeholder="VD: Giao trước 10h sáng..."
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                  />
                </div>
              </Col>
            </Row>
          </Card>

          {/* Khối 3: Bảng kê công nợ & Trạng thái duyệt */}
          <Card
            size="small"
            title={
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                  <CreditCardOutlined style={{ marginRight: 6, color: "#2563eb" }} />
                  Kiểm tra Hạn mức & Công nợ
                </span>
                {simulating && <Spin size="small" />}
              </div>
            }
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              backgroundColor: "#ffffff",
            }}
            bodyStyle={{ padding: "12px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Tạm tính tiền hàng:</Text>
              <Text strong style={{ fontSize: 13 }}>{formatMoney(simulation?.subTotal ?? rawCartSubtotal)}</Text>
            </div>

            {simulation?.discountAmount ? (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Chiết khấu bậc thang:</Text>
                <Text strong style={{ color: "#10b981", fontSize: 13 }}>
                  -{formatMoney(simulation.discountAmount)}
                </Text>
              </div>
            ) : null}

            <Divider style={{ margin: "8px 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Hạn mức công nợ:</Text>
              <Text strong style={{ fontSize: 13 }}>{formatMoney(creditLimit)}</Text>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Dư nợ hiện tại:</Text>
              <Text strong style={{ color: "#e11d48", fontSize: 13 }}>
                {formatMoney(currentDebt)}
              </Text>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Dư nợ sau đơn này:</Text>
              <Text strong style={{ color: isCreditExceeded ? "#ef4444" : "#0284c7", fontSize: 13 }}>
                {formatMoney(currentDebt + orderTotal)}
              </Text>
            </div>

            <div
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                backgroundColor: isCreditExceeded ? "#fef2f2" : "#f0fdf4",
                border: `1px solid ${isCreditExceeded ? "#fecaca" : "#bbf7d0"}`,
                marginTop: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 11, color: isCreditExceeded ? "#b91c1c" : "#166534" }}>
                  Khả dụng còn lại:
                </Text>
                <Text strong style={{ fontSize: 13, color: isCreditExceeded ? "#b91c1c" : "#166534" }}>
                  {formatMoney(remainingDebtCapacity)}
                </Text>
              </div>
            </div>

            {isCreditExceeded && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                style={{ marginTop: 8, borderRadius: 6, fontSize: 11, padding: "6px 8px" }}
                message="Đơn vượt hạn mức nợ và sẽ chuyển sang trạng thái Chờ duyệt đặc cách."
              />
            )}
          </Card>

          {/* Khối 4: Thông báo quy trình duyệt */}
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              backgroundColor: "#f1f5f9",
              border: "1px dashed #cbd5e1",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <ClockCircleOutlined style={{ color: "#f59e0b", fontSize: 15 }} />
            <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.3 }}>
              Đơn hàng từ Cổng đại lý sẽ tự động chuyển sang <strong>Chờ duyệt</strong> để NVKD xác nhận.
            </Text>
          </div>
        </div>
      </Drawer>
    </div>
  );
};

export default CustomerCatalog;
