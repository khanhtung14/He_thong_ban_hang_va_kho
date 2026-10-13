import React, { useEffect, useState, useCallback } from "react";
import {
  Layout,
  Card,
  Table,
  Input,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
  Button,
  Space,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ShoppingOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

// Modals
import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import DeliveryAddressesModal from "../../components/DeliveryAddressesModal";
import CreateOrderModal from "../../components/CreateOrderModal";

// Sidebar & Header Sales
import { SalesSidebar } from "../../components/Sidebar/SalesSidebar";
import { SalesHeader } from "../../components/Header/SalesHeader";

// Auth & API
import { logout } from "../../services/sessionService";
import {
  fetchProfile,
  fetchCustomers,
  fetchOrders,
  type UserProfile,
  type CustomerItem,
  type OrderResponseItem,
} from "../../services/apiClient";

const { Content } = Layout;
const { Title, Text } = Typography;

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
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [orders, setOrders] = useState<OrderResponseItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Trạng thái modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  // SCRUM-20: Trạng thái modal điểm giao hàng & tạo đơn
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedCustomerForAddress, setSelectedCustomerForAddress] = useState<CustomerItem | null>(null);

  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const [selectedCustomerForOrder, setSelectedCustomerForOrder] = useState<CustomerItem | null>(null);

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

  const formatMoney = (val?: number) => {
    if (!val) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  const totalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);
  const activeCount = customers.filter((c) => !c.is_locked).length;

  const handleOpenAddressModal = (cust: CustomerItem) => {
    setSelectedCustomerForAddress(cust);
    setIsAddressModalOpen(true);
  };

  const handleOpenCreateOrderModal = (cust?: CustomerItem) => {
    setSelectedCustomerForOrder(cust || null);
    setIsCreateOrderModalOpen(true);
  };

  const customerColumns: ColumnsType<CustomerItem> = [
    {
      title: "MÃ ĐẠI LÝ",
      dataIndex: "code",
      key: "code",
      width: 110,
      render: (code: string) => <Text strong style={{ color: "#1e40af" }}>{code}</Text>,
    },
    {
      title: "TÊN ĐẠI LÝ",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          {record.phone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              SĐT: {record.phone}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "PHÂN CẤP ĐẠI LÝ",
      dataIndex: "customer_group",
      key: "customer_group",
      width: 140,
      render: (grp: string) => {
        const color =
          grp === "DEALER_LEVEL_1" ? "blue" : grp === "DEALER_LEVEL_2" ? "cyan" : "default";
        const label =
          grp === "DEALER_LEVEL_1" ? "Đại lý Cấp 1" : grp === "DEALER_LEVEL_2" ? "Đại lý Cấp 2" : "Khách lẻ";
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "HẠN MỨC CÔNG NỢ",
      dataIndex: "debt_limit",
      key: "debt_limit",
      width: 150,
      render: (limit) => formatMoney(limit),
    },
    {
      title: "DƯ NỢ HIỆN TẠI",
      dataIndex: "current_debt",
      key: "current_debt",
      width: 150,
      render: (debt) => (
        <span style={{ color: debt > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
          {formatMoney(debt)}
        </span>
      ),
    },
    {
      title: "TRẠNG THÁI GIAO DỊCH",
      key: "is_locked",
      width: 170,
      render: (_, r) => (
        <Tag color={r.is_locked ? "error" : "success"}>
          {r.is_locked ? `Bị khóa (${r.lock_reason || "Chặn nợ"})` : "Đang giao dịch"}
        </Tag>
      ),
    },
    {
      title: "ĐIỂM GIAO & LÊN ĐƠN (SCRUM-20)",
      key: "action",
      width: 220,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Khai báo & quản lý các điểm giao hàng cho đại lý">
            <Button
              size="small"
              icon={<EnvironmentOutlined />}
              onClick={() => handleOpenAddressModal(r)}
              style={{ color: "#2563eb", borderColor: "#93c5fd" }}
            >
              Điểm giao
            </Button>
          </Tooltip>
          <Tooltip title={r.is_locked ? "Đại lý bị khóa không thể tạo đơn" : "Tạo đơn hàng mới cho đại lý"}>
            <Button
              type="primary"
              size="small"
              icon={<ShoppingOutlined />}
              disabled={r.is_locked}
              onClick={() => handleOpenCreateOrderModal(r)}
              style={{ backgroundColor: r.is_locked ? undefined : "#16a34a", borderColor: r.is_locked ? undefined : "#16a34a" }}
            >
              Lên đơn
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const orderColumns: ColumnsType<OrderResponseItem> = [
    {
      title: "MÃ ĐƠN HÀNG",
      dataIndex: "order_code",
      key: "order_code",
      width: 140,
      render: (code: string) => <Text strong style={{ color: "#1e40af" }}>{code}</Text>,
    },
    {
      title: "ĐẠI LÝ ĐẶT HÀNG",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (name: string, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>ID khách: #{r.customer_id}</Text>
        </div>
      ),
    },
    {
      title: "ĐIỂM GIAO HÀNG (SCRUM-20)",
      key: "delivery_address",
      render: (_, r) => {
        if (!r.delivery_address) {
          return <Text type="secondary" style={{ fontStyle: "italic" }}>Chưa gán điểm giao</Text>;
        }
        const da = r.delivery_address;
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <EnvironmentOutlined style={{ color: "#ef4444" }} />
              <span style={{ fontWeight: 600 }}>{da.receiver_name}</span>
              <Text type="secondary">({da.phone})</Text>
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
      width: 150,
      align: "right",
      render: (val: number) => (
        <Text strong style={{ color: "#2563eb" }}>{formatMoney(val)}</Text>
      ),
    },
    {
      title: "TRẠNG THÁI",
      dataIndex: "status",
      key: "status",
      width: 150,
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
      render: (dt: string) => {
        try {
          return new Date(dt).toLocaleString("vi-VN");
        } catch {
          return dt;
        }
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
          backgroundColor: "rgba(248, 250, 252, 0.5)",
          zIndex: 0,
        }}
      />

      {/* 1. Sidebar Sales */}
      <SalesSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
      />

      {/* 2. Cột nội dung */}
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
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header chào mừng */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Title level={3} style={{ margin: 0 }}>
                  {selectedKey === "orders" ? "Quản lý đơn hàng & Điểm giao hàng" : "Đại lý phụ trách của tôi"}
                </Title>
                <Text type="secondary">
                  {selectedKey === "orders"
                    ? "Theo dõi đơn hàng, địa chỉ giao kho đại lý (SCRUM-20) và cảnh báo công nợ (SCRUM-85)."
                    : `Danh sách đại lý thuộc địa bàn được phân công chăm sóc bởi ${profile?.full_name || "Nhân viên kinh doanh"}.`}
                </Text>
              </div>
              <Space>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleOpenCreateOrderModal()}
                  style={{ backgroundColor: "#2563eb" }}
                >
                  Tạo đơn hàng mới
                </Button>
              </Space>
            </div>

            {/* Thông báo phân quyền */}
            <Alert
              message="Chính sách giao nhận & hạn mức (SCRUM-20 & SCRUM-85)"
              description="Mỗi đại lý có thể khai báo nhiều điểm giao hàng (kho, chi nhánh) kèm người nhận và SĐT. Đơn hàng chỉ được phép giao về đúng kho thuộc đại lý đó. Đại lý bị khóa công nợ sẽ bị chặn tạo đơn."
              type="info"
              showIcon
            />

            {/* Thẻ thống kê nhanh */}
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8}>
                <Card style={{ borderRadius: 12 }}>
                  <Statistic
                    title="Tổng số đại lý phụ trách"
                    value={customers.length}
                    prefix={<ShopOutlined style={{ color: "#2563eb" }} />}
                    suffix="đại lý"
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card style={{ borderRadius: 12 }}>
                  <Statistic
                    title="Đại lý đang hoạt động"
                    value={activeCount}
                    prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
                    suffix="đại lý"
                  />
                </Card>
              </Col>
              <Col xs={24} sm={8}>
                <Card style={{ borderRadius: 12 }}>
                  <Statistic
                    title="Tổng dư nợ khách hàng phụ trách"
                    value={formatMoney(totalDebt)}
                    prefix={<DollarOutlined style={{ color: "#f59e0b" }} />}
                  />
                </Card>
              </Col>
            </Row>

            {/* Bảng dữ liệu: Đơn hàng hoặc Khách hàng */}
            {selectedKey === "orders" ? (
              <Card style={{ borderRadius: 12 }}>
                <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Title level={4} style={{ margin: 0 }}>
                    Danh sách đơn hàng bán
                  </Title>
                  <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={ordersLoading}>
                    Làm mới
                  </Button>
                </div>

                <Table
                  columns={orderColumns}
                  dataSource={orders}
                  rowKey="id"
                  loading={ordersLoading}
                  pagination={{ pageSize: 15, showTotal: (t) => `Tổng cộng: ${t} đơn hàng` }}
                  bordered
                  size="middle"
                />
              </Card>
            ) : (
              <Card style={{ borderRadius: 12 }}>
                <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
                  <Input
                    prefix={<SearchOutlined />}
                    placeholder="Tìm kiếm theo mã, tên đại lý..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onPressEnter={() => loadMyCustomers()}
                    style={{ maxWidth: 360, borderRadius: 8 }}
                    allowClear
                  />
                  <Button icon={<ReloadOutlined />} onClick={loadMyCustomers} loading={loading}>
                    Làm mới
                  </Button>
                </div>

                <Table
                  columns={customerColumns}
                  dataSource={customers}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 15, showTotal: (t) => `Tổng cộng: ${t} đại lý` }}
                  bordered
                  size="middle"
                />
              </Card>
            )}
          </div>
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
        }}
        customers={customers}
        preselectedCustomerId={selectedCustomerForOrder?.id || null}
        onOrderCreated={() => {
          if (selectedKey === "orders") {
            loadOrders();
          }
          loadMyCustomers();
        }}
      />

      {/* Modal Hồ sơ cá nhân */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated: any) => {
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
