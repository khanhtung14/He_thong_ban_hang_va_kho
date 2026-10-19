import React, { useEffect, useState, useCallback } from "react";
import {
  Layout,
  Card,
  Table,
  Tag,
  Typography,
  Button,
  Space,
  Tooltip,
  Popconfirm,
  Modal,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  EnvironmentOutlined,
  ShoppingOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  EditOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  CopyOutlined,
} from "@ant-design/icons";

// Modals
import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import DeliveryAddressesModal from "../../components/DeliveryAddressesModal";
import CreateOrderModal from "../../components/CreateOrderModal";

// Sidebar & Header Sales
import { SalesSidebar } from "../../components/Sidebar/SalesSidebar";
import { SalesHeader } from "../../components/Header/SalesHeader";

// Customer List Module (S3-08)
import { SalesCustomerList } from "./SalesCustomerList";

// Auth & API
import { logout } from "../../services/sessionService";
import {
  fetchProfile,
  fetchCustomers,
  fetchOrders,
  submitOrderForApproval,
  cancelOrder,
  cloneOrder,
  type UserProfile,
  type CustomerItem,
  type OrderResponseItem,
} from "../../services/apiClient";

const { Content } = Layout;
const { Title, Text } = Typography;

const formatMoney = (val?: number) => {
  if (!val) return "0 ₫";
  return `${val.toLocaleString("vi-VN")} ₫`;
};

export const SalesDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [selectedKey, setSelectedKey] = useState("customers");
  const [, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [orders, setOrders] = useState<OrderResponseItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const search = "";

  // Trạng thái modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  // SCRUM-20: Trạng thái modal điểm giao hàng & tạo đơn
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedCustomerForAddress, setSelectedCustomerForAddress] = useState<CustomerItem | null>(null);

  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [selectedCustomerForOrder, setSelectedCustomerForOrder] = useState<CustomerItem | null>(null);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<OrderResponseItem | null>(null);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<OrderResponseItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [submittingOrderId, setSubmittingOrderId] = useState<number | null>(null);
  const [cloningOrderId, setCloningOrderId] = useState<number | null>(null);

  const handleCloneOrder = async (order: OrderResponseItem) => {
    setCloningOrderId(order.id);
    try {
      const cloned = await cloneOrder(order.id);
      message.success(
        `Đã sao chép đơn ${order.order_code} thành công! Đơn nháp mới (${cloned.order_code}) đã được tạo với giá và chiết khấu hiện hành.`
      );
      await loadOrders();
      if (isDetailModalOpen) {
        setIsDetailModalOpen(false);
      }
      handleEditOrder(cloned);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Sao chép đơn hàng thất bại.";
      message.error(errorMsg);
    } finally {
      setCloningOrderId(null);
    }
  };

  const formatDateTime = (dt?: string | null) => {
    if (!dt) return "-";
    try {
      const raw = String(dt).trim();
      const utcStr = raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`;
      return dayjs(utcStr).format("HH:mm:ss DD/MM/YYYY");
    } catch {
      return dt;
    }
  };

  const handleSubmitForApproval = async (orderId: number) => {
    setSubmittingOrderId(orderId);
    try {
      await submitOrderForApproval(orderId);
      message.success("Đã gửi duyệt đơn hàng thành công!");
      loadOrders();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Gửi duyệt đơn hàng thất bại.";
      message.error(errorMsg);
    } finally {
      setSubmittingOrderId(null);
    }
  };

  const handleEditOrder = (order: OrderResponseItem) => {
    setSelectedOrderForEdit(order);
    const cust = customers.find((c) => c.id === order.customer_id) || null;
    setSelectedCustomerForOrder(cust);
    setIsCreateOrderModalOpen(true);
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelOrder(orderId);
      message.success("Đã hủy đơn hàng thành công!");
      loadOrders();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Hủy đơn hàng thất bại.";
      message.error(errorMsg);
    }
  };

  const handleViewOrderDetail = (order: OrderResponseItem) => {
    setSelectedOrderForDetail(order);
    setIsDetailModalOpen(true);
  };

  const loadProfileData = useCallback(async () => {
    try {
      const data = await fetchProfile();
      if (data) {
        setProfile(data);
        localStorage.setItem("user", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Lỗi tải thông tin Sales:", err);
    }
  }, []);

  const loadMyCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCustomers({
        search: search.trim() || undefined,
      });
      setCustomers(list);
    } catch (err) {
      console.error("Lỗi tải danh sách đại lý phụ trách:", err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error("Lỗi tải danh sách đơn hàng:", err);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfileData();
    loadMyCustomers();
    if (selectedKey === "orders") {
      loadOrders();
    }

    const handleProfileSync = () => loadProfileData();
    window.addEventListener("profile-updated", handleProfileSync);
    window.addEventListener("storage", handleProfileSync);

    return () => {
      window.removeEventListener("profile-updated", handleProfileSync);
      window.removeEventListener("storage", handleProfileSync);
    };
  }, [loadProfileData, loadMyCustomers, loadOrders, selectedKey]);

  const [preselectedCustomerId, setPreselectedCustomerId] = useState<number | null>(null);

  const handleSelectCustomerForOrder = (customer: CustomerItem) => {
    // Lưu tạm khách hàng để lên đơn
    localStorage.setItem("selectedOrderCustomer", JSON.stringify(customer));
    setPreselectedCustomerId(customer.id);
    setSelectedCustomerForOrder(customer);
    setIsCreateOrderModalOpen(true);
  };

  const handleOpenCreateOrderModal = (cust?: CustomerItem) => {
    setSelectedCustomerForOrder(cust || null);
    setSelectedOrderForEdit(null);
    setIsCreateOrderModalOpen(true);
  };

  const orderColumns: ColumnsType<OrderResponseItem> = [
    {
      title: "MÃ ĐƠN HÀNG",
      dataIndex: "order_code",
      key: "order_code",
      width: 170,
      render: (code: string) => (
        <Text strong style={{ color: "#1e40af", whiteSpace: "nowrap" }}>
          {code}
        </Text>
      ),
    },
    {
      title: "ĐẠI LÝ ĐẶT HÀNG",
      dataIndex: "customer_name",
      key: "customer_name",
      width: 210,
      render: (name: string, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>ID khách: #{r.customer_id}</Text>
        </div>
      ),
    },
    {
      title: "ĐIỂM GIAO HÀNG",
      key: "delivery_address",
      width: 350,
      render: (_, r) => {
        if (!r.delivery_address) {
          return <Text type="secondary" style={{ fontStyle: "italic" }}>Chưa gán điểm giao</Text>;
        }
        const da = r.delivery_address;
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <EnvironmentOutlined style={{ color: "#ef4444" }} />
              <span style={{ fontWeight: 600 }}>{da.receiver_name}</span>
              <Text type="secondary" style={{ whiteSpace: "nowrap" }}>({da.phone})</Text>
              {da.is_default && <Tag color="success" style={{ fontSize: 10, lineHeight: "16px" }}>Mặc định</Tag>}
            </div>
            <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>{da.address}</div>
            {da.note && <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>Chỉ dẫn: {da.note}</div>}
          </div>
        );
      },
    },
    {
      title: "TỔNG GIÁ TRỊ",
      dataIndex: "total_amount",
      key: "total_amount",
      width: 140,
      align: "right",
      render: (val: number) => (
        <Text strong style={{ color: "#2563eb", whiteSpace: "nowrap" }}>{formatMoney(val)}</Text>
      ),
    },
    {
      title: "TRẠNG THÁI",
      dataIndex: "status",
      key: "status",
      width: 130,
      align: "center",
      render: (st: string) => {
        const color =
          st === "PENDING_APPROVAL" ? "warning" : st === "APPROVED" ? "success" : st === "REJECTED" ? "error" : "default";
        const label =
          st === "PENDING_APPROVAL" ? "Chờ duyệt" : st === "APPROVED" ? "Đã duyệt" : st === "REJECTED" ? "Bị từ chối" : st;
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "NGÀY TẠO",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      align: "center",
      render: (dt: string) => (
        <span style={{ fontSize: 13, color: "#334155", whiteSpace: "nowrap" }}>{formatDateTime(dt)}</span>
      ),
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 190,
      align: "center",
      render: (_, r) => {
        const isDraft = r.status === "DRAFT";
        if (isDraft) {
          return (
            <Space size={4} wrap style={{ justifyContent: "center" }}>
              <Popconfirm
                title="Gửi duyệt đơn hàng"
                description={`Xác nhận gửi đơn ${r.order_code} tới Quản lý kinh doanh để phê duyệt?`}
                onConfirm={() => handleSubmitForApproval(r.id)}
                okText="Gửi duyệt"
                cancelText="Hủy"
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<SendOutlined />}
                  loading={submittingOrderId === r.id}
                  style={{ backgroundColor: "#2563eb", fontSize: 12 }}
                >
                  Gửi duyệt
                </Button>
              </Popconfirm>

              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEditOrder(r)}
                style={{ fontSize: 12 }}
              >
                Sửa
              </Button>

              <Tooltip title="Sao chép thành đơn nháp mới">
                <Popconfirm
                  title="Sao chép đơn hàng"
                  description={`Sao chép toàn bộ dòng hàng của đơn ${r.order_code} thành đơn mới ở trạng thái Nháp?`}
                  onConfirm={() => handleCloneOrder(r)}
                  okText="Sao chép"
                  cancelText="Hủy"
                >
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    loading={cloningOrderId === r.id}
                    style={{ color: "#059669", borderColor: "#a7f3d0", fontSize: 12 }}
                  >
                    Sao chép
                  </Button>
                </Popconfirm>
              </Tooltip>

              <Popconfirm
                title="Xác nhận hủy đơn hàng"
                description={`Bạn có chắc chắn muốn hủy đơn hàng nháp ${r.order_code}?`}
                onConfirm={() => handleCancelOrder(r.id)}
                okText="Hủy đơn"
                cancelText="Đóng"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  size="small"
                  icon={<CloseCircleOutlined />}
                  style={{ fontSize: 12 }}
                >
                  Hủy
                </Button>
              </Popconfirm>
            </Space>
          );
        }

        return (
          <Space size={4} wrap style={{ justifyContent: "center" }}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewOrderDetail(r)}
              style={{ color: "#2563eb", borderColor: "#bfdbfe", fontSize: 12 }}
            >
              Xem chi tiết
            </Button>
            <Popconfirm
              title="Sao chép đơn hàng"
              description={`Sao chép toàn bộ dòng hàng của đơn ${r.order_code} thành đơn mới ở trạng thái Nháp với đơn giá & chiết khấu hiện hành?`}
              onConfirm={() => handleCloneOrder(r)}
              okText="Sao chép"
              cancelText="Hủy"
            >
              <Button
                size="small"
                icon={<CopyOutlined />}
                loading={cloningOrderId === r.id}
                style={{ color: "#059669", borderColor: "#a7f3d0", fontSize: 12 }}
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
    <Layout hasSider style={{ minHeight: "100vh", position: "relative" }}>
      {/* 1. Lớp hình nền mờ */}
      <div
        style={{
          position: "fixed",
          inset: "-20px",
          backgroundImage: "url('/bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
          transform: "scale(1.05)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(248, 250, 252, 0.7)",
          zIndex: 0,
        }}
      />

      {/* 2. Sidebar Sales */}
      <SalesSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
      />

      {/* 3. Cột nội dung */}
      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        <SalesHeader
          fullName={profile?.full_name || "Nhân viên kinh doanh"}
          roleName={profile?.role || "Chuyên viên bán hàng"}
          avatarUrl={profile?.avatar_url}
          notificationCount={0}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
        />

        <Content
          className="sales-dashboard-content"
          style={{
            padding: "20px 28px",
            maxWidth: 1500,
            width: "100%",
            margin: "0 auto",
            minWidth: 0,
          }}
        >
          {selectedKey === "orders" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Khối Header "Danh sách đơn hàng bán" */}
              <div
                style={{
                  background: "#ffffff",
                  borderRadius: 12,
                  padding: "16px 20px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      backgroundColor: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                      border: "1px solid #dbeafe",
                    }}
                  >
                    <ShoppingOutlined />
                  </div>
                  <div>
                    <Title level={4} style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 18 }}>
                      Danh sách đơn hàng bán
                    </Title>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Theo dõi và quản lý các đơn hàng của đại lý bạn phụ trách
                    </Text>
                  </div>
                </div>

                <Space size={10} wrap>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => loadOrders()}
                    loading={ordersLoading}
                    style={{ height: 38, borderRadius: 8, fontWeight: 500 }}
                  >
                    Làm mới
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    style={{
                      backgroundColor: "#2563eb",
                      height: 38,
                      borderRadius: 8,
                      fontWeight: 600,
                      boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
                    }}
                    onClick={() => handleOpenCreateOrderModal()}
                  >
                    Tạo đơn hàng mới
                  </Button>
                </Space>
              </div>

              {/* Bảng danh sách đơn hàng */}
              <Card
                style={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                  backgroundColor: "#ffffff",
                }}
                styles={{ body: { padding: 0 } }}
              >
                <Table<OrderResponseItem>
                  columns={orderColumns}
                  dataSource={orders}
                  rowKey="id"
                  loading={ordersLoading}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: 1100 }}
                  locale={{
                    emptyText: "Chưa có đơn hàng nào. Bấm '+ Tạo đơn hàng mới' để lập đơn.",
                  }}
                />
              </Card>
            </div>
          ) : (
            /* Màn hình Khách hàng & Đại lý / Tổng quan */
            <SalesCustomerList
              currentRepName={profile?.full_name}
              onSelectCustomerForOrder={handleSelectCustomerForOrder}
            />
          )}
        </Content>
      </Layout>

      {/* Modal Quản lý điểm giao hàng (SCRUM-20) */}
      <DeliveryAddressesModal
        isOpen={isAddressModalOpen}
        onClose={() => {
          setIsAddressModalOpen(false);
          setSelectedCustomerForAddress(null);
        }}
        customerId={selectedCustomerForAddress?.id || null}
        customerName={selectedCustomerForAddress?.name}
        customerCode={selectedCustomerForAddress?.code}
      />

      {/* Modal Lên đơn hàng (SCRUM-20 & SCRUM-85) */}
      <CreateOrderModal
        isOpen={isCreateOrderModalOpen}
        onClose={() => {
          setIsCreateOrderModalOpen(false);
          setSelectedCustomerForOrder(null);
          setSelectedOrderForEdit(null);
        }}
        customers={customers}
        preselectedCustomerId={selectedCustomerForOrder?.id ?? preselectedCustomerId ?? null}
        editingOrder={selectedOrderForEdit}
        onOrderCreated={() => {
          if (selectedKey === "orders") {
            loadOrders();
          }
          loadMyCustomers();
        }}
      />

      {/* Modal Xem chi tiết đơn hàng */}
      <Modal
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>Chi tiết đơn hàng {selectedOrderForDetail?.order_code}</span>
          </div>
        }
        width={800}
        footer={[
          <Popconfirm
            key="clone"
            title="Sao chép đơn hàng"
            description={`Sao chép toàn bộ dòng hàng của đơn ${selectedOrderForDetail?.order_code} thành đơn mới ở trạng thái Nháp với giá hiện hành?`}
            onConfirm={() => selectedOrderForDetail && handleCloneOrder(selectedOrderForDetail)}
            okText="Sao chép"
            cancelText="Hủy"
          >
            <Button
              key="btn-clone"
              icon={<CopyOutlined />}
              loading={cloningOrderId === selectedOrderForDetail?.id}
              style={{ color: "#059669", borderColor: "#a7f3d0" }}
            >
              Sao chép đơn này
            </Button>
          </Popconfirm>,
          <Button key="close" type="primary" onClick={() => setIsDetailModalOpen(false)}>
            Đóng
          </Button>,
        ]}
      >
        {selectedOrderForDetail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card size="small" style={{ backgroundColor: "#f8fafc" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <div>
                  <Text type="secondary">Mã đơn hàng: </Text>
                  <Text strong>{selectedOrderForDetail.order_code}</Text>
                </div>
                <div>
                  <Text type="secondary">Trạng thái: </Text>
                  <Tag
                    color={
                      selectedOrderForDetail.status === "PENDING_APPROVAL"
                        ? "warning"
                        : selectedOrderForDetail.status === "APPROVED"
                          ? "success"
                          : selectedOrderForDetail.status === "CANCELLED"
                            ? "error"
                            : "default"
                    }
                  >
                    {selectedOrderForDetail.status === "PENDING_APPROVAL"
                      ? "Chờ duyệt"
                      : selectedOrderForDetail.status === "APPROVED"
                        ? "Đã duyệt"
                        : selectedOrderForDetail.status === "CANCELLED"
                          ? "Đã hủy"
                          : selectedOrderForDetail.status}
                  </Tag>
                </div>
                <div>
                  <Text type="secondary">Đại lý đặt hàng: </Text>
                  <Text strong>{selectedOrderForDetail.customer_name || `ID #${selectedOrderForDetail.customer_id}`}</Text>
                </div>
                <div>
                  <Text type="secondary">Thời gian tạo: </Text>
                  <Text>{formatDateTime(selectedOrderForDetail.created_at)}</Text>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <Text type="secondary">Điểm giao hàng: </Text>
                  {selectedOrderForDetail.delivery_address ? (
                    <Text>
                      {selectedOrderForDetail.delivery_address.receiver_name} ({selectedOrderForDetail.delivery_address.phone}) - {selectedOrderForDetail.delivery_address.address}
                    </Text>
                  ) : (
                    <Text type="secondary" italic>Chưa gán điểm giao hàng</Text>
                  )}
                </div>
                {selectedOrderForDetail.approval_reason && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Text type="secondary">Lý do duyệt / Ghi chú: </Text>
                    <Tag color="orange">{selectedOrderForDetail.approval_reason}</Tag>
                  </div>
                )}
                {selectedOrderForDetail.note && (
                  <div style={{ gridColumn: "span 2" }}>
                    <Text type="secondary">Ghi chú đơn: </Text>
                    <Text>{selectedOrderForDetail.note}</Text>
                  </div>
                )}
              </div>
            </Card>

            <Table
              dataSource={selectedOrderForDetail.items || []}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
              columns={[
                { title: "MÃ SKU", dataIndex: "sku", width: 150 },
                { title: "TÊN SẢN PHẨM", dataIndex: "product_name" },
                { title: "SỐ LƯỢNG", dataIndex: "quantity", width: 90, align: "center" },
                {
                  title: "ĐƠN GIÁ (₫)",
                  dataIndex: "unit_price",
                  width: 130,
                  align: "right",
                  render: (p: number) => formatMoney(p),
                },
                {
                  title: "THÀNH TIỀN (₫)",
                  key: "subtotal",
                  width: 140,
                  align: "right",
                  render: (_, it) => (
                    <Text strong style={{ color: "#047857" }}>
                      {formatMoney((it.quantity || 0) * (it.unit_price || 0))}
                    </Text>
                  ),
                },
              ]}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px", backgroundColor: "#f1f5f9", borderRadius: 8 }}>
              <Text style={{ fontSize: 15 }}>
                Tổng giá trị đơn:{" "}
                <Text strong style={{ color: "#2563eb", fontSize: 18 }}>
                  {formatMoney(selectedOrderForDetail.total_amount)}
                </Text>
              </Text>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Hồ sơ cá nhân */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated: UserProfile) => {
          setProfile(updated);
          localStorage.setItem("user", JSON.stringify(updated));
        }}
      />

      {/* Modal Đổi mật khẩu */}
      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </Layout>
  );
};

export default SalesDashboard;
