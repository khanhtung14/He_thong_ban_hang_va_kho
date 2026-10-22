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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  DollarOutlined,
} from "@ant-design/icons";

// Modals
import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";

// Sidebar & Header Sales
import { SalesSidebar } from "../../components/Sidebar/SalesSidebar";
import { SalesHeader } from "../../components/Header/SalesHeader";
import SalesOrderDraft from "./SalesOrderDraft";
import DeliveryConfirmation from "../warehouse_staff/DeliveryConfirmation";

// Auth & API
import { logout } from "../../services/sessionService";
import {
  fetchProfile,
  fetchCustomers,
  type UserProfile,
  type CustomerItem,
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
  const [search, setSearch] = useState("");

  // Trạng thái modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

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

  useEffect(() => {
    loadProfileData();
    loadMyCustomers();

    const handleProfileSync = () => loadProfileData();
    window.addEventListener("profile-updated", handleProfileSync);
    window.addEventListener("storage", handleProfileSync);

    return () => {
      window.removeEventListener("profile-updated", handleProfileSync);
      window.removeEventListener("storage", handleProfileSync);
    };
  }, [loadProfileData, loadMyCustomers]);

  const formatMoney = (val?: number) => {
    if (!val) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  const totalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);
  const activeCount = customers.filter((c) => !c.is_locked).length;

  const columns: ColumnsType<CustomerItem> = [
    {
      title: "MÃ ĐẠI LÝ",
      dataIndex: "code",
      key: "code",
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
      render: (limit) => formatMoney(limit),
    },
    {
      title: "DƯ NỢ HIỆN TẠI",
      dataIndex: "current_debt",
      key: "current_debt",
      render: (debt) => (
        <span style={{ color: debt > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
          {formatMoney(debt)}
        </span>
      ),
    },
    {
      title: "TRẠNG THÁI GIAO DỊCH",
      key: "is_locked",
      render: (_, r) => (
        <Tag color={r.is_locked ? "error" : "success"}>
          {r.is_locked ? `Bị khóa (${r.lock_reason || "Chặn nợ"})` : "Đang giao dịch"}
        </Tag>
      ),
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
          className="sales-dashboard-content"
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
            minWidth: 0,
          }}
        >
          {selectedKey === "delivery-confirmation" ? (
            <DeliveryConfirmation />
          ) : selectedKey === "orders" ? (
            <SalesOrderDraft />
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Header chào mừng */}
            <div>
              <Title level={3} style={{ margin: 0 }}>
                Đại lý phụ trách của tôi
              </Title>
              <Text type="secondary">
                Danh sách đại lý thuộc địa bàn được phân công chăm sóc bởi{" "}
                <Text strong>{profile?.full_name || "Nhân viên kinh doanh"}</Text>.
              </Text>
            </div>

            {/* Thông báo phân quyền */}
            <Alert
              message="Phân quyền địa bàn kinh doanh"
              description="Theo quy chế bảo mật OMS, bạn chỉ có quyền truy cập và tạo đơn hàng cho các đại lý được phân công phụ trách chính."
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

            {/* Bảng danh sách đại lý */}
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
              </div>

              <Table
                columns={columns}
                dataSource={customers}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 15, showTotal: (t) => `Tổng cộng: ${t} đại lý` }}
                bordered
                size="middle"
              />
            </Card>
          </div>
          )}
        </Content>
      </Layout>

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
