import { useState } from "react";
import { logout, getCurrentUserRole, hasValidSession } from "services/sessionService";
import Profile from "../profile/Profile";
import Error403 from "../../Error403";
import { Layout, Menu, Card, Typography, Row, Col, Statistic, Table, Tag, Alert, Dropdown, Avatar, ConfigProvider } from "antd";
import type { MenuProps } from "antd";
import { renderAdminViews, renderCustomerViews, renderSalesViews, renderWarehouseViews, renderAccountantViews, renderSalesManagerViews, renderWarehouseManagerViews } from "./RoleViewsMock";
import { HomeOutlined, ShoppingCartOutlined, UnorderedListOutlined, UserOutlined, TeamOutlined, SettingOutlined, CheckCircleOutlined, SyncOutlined, DatabaseOutlined, MoneyCollectOutlined, FileTextOutlined, LockOutlined, LogoutOutlined, EditOutlined } from "@ant-design/icons";
import type { RoleKey, ViewItem } from "./workspaceTypes";
import { formatMoney, glassCardStyle } from "./workspaceTypes";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const roleByPath: Record<string, RoleKey> = {
  "/portal/orders": "customer",
  "/sales/orders": "sales",
  "/sales/customers": "sales",
  "/manager/dashboard": "salesManager",
  "/manager/orders/approval": "salesManager",
  "/manager/pricing": "salesManager",
  "/manager/reports": "salesManager",
  "/warehouse/picking": "warehouse",
  "/warehouse/receiving": "warehouse",
  "/warehouse/inventory": "warehouse",
  "/warehouse/dashboard": "warehouseManager",
  "/accounting/debt-book": "accountant",
  "/accounting/invoices": "accountant",
  "/admin/users": "admin",
  "/admin/territory-handover": "admin",
  "/admin/audit-logs": "admin",
};

const allowedRolesByPath: Record<string, RoleKey[]> = {
  "/portal/orders": ["customer", "admin"],
  "/sales/orders": ["sales", "salesManager", "customer", "accountant", "admin"],
  "/sales/customers": ["sales", "salesManager", "admin"],
  "/manager/dashboard": ["salesManager", "admin"],
  "/manager/orders/approval": ["salesManager", "admin"],
  "/manager/pricing": ["salesManager", "admin"],
  "/manager/reports": ["salesManager", "admin"],
  "/warehouse/picking": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/receiving": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/inventory": ["warehouse", "warehouseManager", "salesManager", "admin"],
  "/warehouse/dashboard": ["warehouseManager", "admin"],
  "/accounting/debt-book": ["accountant", "admin"],
  "/accounting/invoices": ["accountant", "admin"],
  "/admin/users": ["admin"],
  "/admin/territory-handover": ["admin"],
  "/admin/audit-logs": ["admin"],
};

const roleDetails: Record<RoleKey, { name: string; title: string; description: string; initials: string; views: ViewItem[] }> = {
  customer: {
    name: "Đại lý", title: "Xin chào, đối tác", description: "Đặt hàng và theo dõi hoạt động kinh doanh của cửa hàng.", initials: "ĐL",
    views: [
      { id: "overview", label: "Tổng quan", icon: <HomeOutlined />, section: "CỬA HÀNG" },
      { id: "products", label: "Sản phẩm", icon: <DatabaseOutlined /> },
      { id: "orders", label: "Đơn hàng", icon: <ShoppingCartOutlined /> },
      { id: "debt", label: "Công nợ & hóa đơn", icon: <FileTextOutlined />, section: "TÀI CHÍNH" },
      { id: "profile", label: "Tài khoản", icon: <UserOutlined />, section: "CÁ NHÂN" },
    ],
  },
  sales: {
    name: "Nhân viên kinh doanh", title: "Bàn làm việc kinh doanh", description: "Theo dõi tuyến, tạo đơn và chăm sóc đại lý.", initials: "KD",
    views: [
      { id: "overview", label: "Tổng quan tuyến", icon: <HomeOutlined />, section: "KINH DOANH" },
      { id: "new-order", label: "Tạo đơn hàng", icon: <ShoppingCartOutlined /> },
      { id: "customers", label: "Đại lý phụ trách", icon: <TeamOutlined /> },
      { id: "orders", label: "Đơn hàng", icon: <UnorderedListOutlined /> },
      { id: "collections", label: "Thu tiền", icon: <MoneyCollectOutlined />, section: "CÔNG NỢ" },
    ],
  },
  salesManager: {
    name: "Quản lý kinh doanh", title: "Trung tâm điều hành kinh doanh", description: "Theo dõi hiệu quả, duyệt ngoại lệ.", initials: "QL",
    views: [
      { id: "overview", label: "Tổng quan", icon: <HomeOutlined />, section: "ĐIỀU HÀNH" },
      { id: "approvals", label: "Duyệt đơn", icon: <CheckCircleOutlined /> },
      { id: "reports", label: "Doanh số & lợi nhuận", icon: <FileTextOutlined />, section: "PHÂN TÍCH" },
      { id: "products", label: "Sản phẩm", icon: <DatabaseOutlined /> },
    ],
  },
  warehouse: {
    name: "Nhân viên kho", title: "Công việc trong kho", description: "Xử lý phiếu hàng và cập nhật tình hình.", initials: "K",
    views: [
      { id: "picking", label: "Phiếu soạn hàng", icon: <UnorderedListOutlined />, section: "TÁC NGHIỆP" },
      { id: "receiving", label: "Nhập hàng", icon: <SyncOutlined /> },
      { id: "inventory", label: "Tồn kho", icon: <DatabaseOutlined />, section: "KHO HÀNG" },
      { id: "count", label: "Kiểm kê", icon: <CheckCircleOutlined /> },
    ],
  },
  warehouseManager: {
    name: "Quản lý kho", title: "Điều hành kho vận", description: "Theo dõi tồn kho, điều chỉnh và luân chuyển.", initials: "KQL",
    views: [
      { id: "overview", label: "Tổng quan kho", icon: <HomeOutlined />, section: "ĐIỀU HÀNH" },
      { id: "inventory", label: "Tồn kho", icon: <DatabaseOutlined /> },
      { id: "adjustments", label: "Điều chỉnh tồn", icon: <EditOutlined /> },
      { id: "transfers", label: "Chuyển kho", icon: <SyncOutlined />, section: "KIỂM SOÁT" },
      { id: "stocktakes", label: "Kiểm kê", icon: <CheckCircleOutlined /> },
    ],
  },
  accountant: {
    name: "Kế toán công nợ", title: "Sổ công nợ & hóa đơn", description: "Đối soát khoản phải thu, thanh toán.", initials: "KT",
    views: [
      { id: "overview", label: "Tổng quan công nợ", icon: <HomeOutlined />, section: "KẾ TOÁN" },
      { id: "debts", label: "Sổ công nợ", icon: <FileTextOutlined /> },
      { id: "invoices", label: "Hóa đơn", icon: <UnorderedListOutlined />, section: "CHỨNG TỪ" },
      { id: "payments", label: "Thanh toán", icon: <MoneyCollectOutlined /> },
      { id: "reconciliation", label: "Đối soát", icon: <SyncOutlined /> },
    ],
  },
  admin: {
    name: "Quản trị hệ thống", title: "Quản trị hệ thống", description: "Quản lý tài khoản, trạng thái truy cập và nhật ký.", initials: "AD",
    views: [
      { id: "overview", label: "Tổng quan", icon: <HomeOutlined />, section: "HỆ THỐNG" },
      { id: "users", label: "Tài khoản người dùng", icon: <TeamOutlined /> },
      { id: "rbac", label: "Ma trận phân quyền", icon: <LockOutlined />, section: "QUẢN TRỊ" },
      { id: "configuration", label: "Danh mục hệ thống", icon: <SettingOutlined /> },
      { id: "audit", label: "Nhật ký hệ thống", icon: <FileTextOutlined /> },
    ],
  },
};

const demoOrders = [
  { id: "DH-240815", customer: "Tạp hóa Minh Anh", total: 12400000, status: "Chờ duyệt", tone: "orange" },
  { id: "DH-240812", customer: "Đại lý Hoàng Long", total: 8600000, status: "Đang soạn", tone: "blue" },
  { id: "DH-240809", customer: "Cửa hàng Hồng Phúc", total: 15800000, status: "Đang giao", tone: "purple" },
];

function normalizeRole(value: string | null): RoleKey | null {
  const role = (value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
  if (["CUSTOMER", "DAI_LY", "KHACH_HANG"].includes(role)) return "customer";
  if (["SALES", "SALES_REP", "KINH_DOANH"].includes(role)) return "sales";
  if (["SALES_MANAGER", "QUAN_LY_KINH_DOANH", "SALESMANAGER"].includes(role)) return "salesManager";
  if (["WAREHOUSE", "KHO"].includes(role)) return "warehouse";
  if (["WH_MANAGER", "WAREHOUSE_MANAGER", "QUAN_LY_KHO"].includes(role)) return "warehouseManager";
  if (["ACCOUNTANT", "KE_TOAN"].includes(role)) return "accountant";
  if (["ADMIN", "ADMINISTRATOR", "QUAN_TRI"].includes(role)) return "admin";
  return null;
}

export default function RoleWorkspace() {
  const [collapsed, setCollapsed] = useState(false);
  const currentUserRoleStr = getCurrentUserRole();
  const currentUserRole = normalizeRole(currentUserRoleStr);
  const currentPath = window.location.pathname;
  const [profileOpen, setProfileOpen] = useState(false);

  if (!hasValidSession()) {
    window.location.assign("/login");
    return null;
  }

  if (currentPath.startsWith("/admin/") && currentUserRole !== "admin") {
    return <Error403 />;
  }

  const allowed = allowedRolesByPath[currentPath];
  if (allowed && currentUserRole && !allowed.includes(currentUserRole) && currentUserRole !== "admin") {
    return <Error403 />;
  }

  const pathRole = roleByPath[currentPath] || null;
  const role: RoleKey | null = (currentUserRole === "admin" && pathRole) ? pathRole : (currentUserRole || pathRole);
  const details = role ? roleDetails[role] : null;
  const initialView = new URLSearchParams(window.location.search).get("view");
  const [view, setView] = useState(initialView ?? details?.views[0]?.id ?? "overview");

  if (!role || !details) return <div style={{ padding: 40 }}>Không xác định được vai trò</div>;

  const navigate = (nextView: string) => {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.pushState({}, "", url);
  };

  const username = window.sessionStorage.getItem("user_name") || "Người dùng";

  const renderContent = () => {


    if (role === "customer") {
      if (view === "overview") {
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <Card style={{...glassCardStyle, background: "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(240,245,255,0.85) 100%)", color: "#0F172A"}} bordered={false}>
              <Title level={2} style={{color: "#0F172A"}}>Xin chào, {username}</Title>
              <Text style={{color: "#334155"}}>Đặt hàng nhanh, theo dõi giao nhận và chủ động quản lý công nợ của cửa hàng.</Text>
            </Card>
            <Row gutter={[24, 24]}>
              <Col xs={24} md={8}><Card style={glassCardStyle} bordered={false}><Statistic title="Đơn đang xử lý" value={3} valueStyle={{ color: '#1890ff' }} prefix={<ShoppingCartOutlined />} /></Card></Col>
              <Col xs={24} md={8}><Card style={glassCardStyle} bordered={false}><Statistic title="Công nợ hiện tại" value={12400000} formatter={value => formatMoney(Number(value))} valueStyle={{ color: '#faad14' }} prefix={<FileTextOutlined />} /></Card></Col>
              <Col xs={24} md={8}><Card style={glassCardStyle} bordered={false}><Statistic title="Đơn đã giao tháng này" value={18} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card></Col>
            </Row>
            <Card title="Đơn hàng gần đây" style={glassCardStyle} bordered={false}>
              <Table dataSource={demoOrders} pagination={false} columns={[
                { title: "Mã đơn", dataIndex: "id", key: "id", render: text => <a>{text}</a> },
                { title: "Tổng tiền", dataIndex: "total", key: "total", render: val => formatMoney(val) },
                { title: "Trạng thái", dataIndex: "status", key: "status", render: (text, record) => <Tag color={record.tone}>{text}</Tag> }
              ]} rowKey="id" style={{ background: "transparent" }} />
            </Card>
          </div>
        );
      }
      if (view === "profile") {
        return <Profile embedded={false} />;
      }
      return renderCustomerViews(view);
    }

    if (role === "admin") {
      if (view === "overview") {
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <Card style={glassCardStyle} bordered={false}>
              <Title level={3}>Xin chào, {username}</Title>
              <Text>Trung tâm quản lý tài khoản, vai trò và bảo mật hệ thống.</Text>
            </Card>
            <Row gutter={[24, 24]}>
              <Col xs={24} md={6}><Card style={glassCardStyle} bordered={false}><Statistic title="Tổng người dùng" value={120} valueStyle={{ color: '#1890ff' }} prefix={<TeamOutlined />} /></Card></Col>
              <Col xs={24} md={6}><Card style={glassCardStyle} bordered={false}><Statistic title="Đang hoạt động" value={95} valueStyle={{ color: '#52c41a' }} /></Card></Col>
              <Col xs={24} md={6}><Card style={glassCardStyle} bordered={false}><Statistic title="Khóa / Chờ" value={25} valueStyle={{ color: '#faad14' }} /></Card></Col>
              <Col xs={24} md={6}><Card style={glassCardStyle} bordered={false}><Statistic title="Vai trò" value={7} valueStyle={{ color: '#722ed1' }} /></Card></Col>
            </Row>
            <Card title="Nhật ký hệ thống" style={glassCardStyle} bordered={false}>
              <Alert message="Dữ liệu đang được đồng bộ" type="info" showIcon />
            </Card>
          </div>
        );
      }
      return renderAdminViews(view);
    }

    if (role === "sales") {
      return renderSalesViews(view) || <Alert message="Màn hình kinh doanh chưa được thiết kế." type="info" />;
    }
    
    if (role === "salesManager") {
      return renderSalesManagerViews(view) || <Alert message="Màn hình chưa được thiết kế." type="info" />;
    }

    if (role === "warehouse") {
      return renderWarehouseViews(view) || <Alert message="Màn hình kho chưa được thiết kế." type="info" />;
    }
    
    if (role === "warehouseManager") {
      return renderWarehouseManagerViews(view) || <Alert message="Màn hình chưa được thiết kế." type="info" />;
    }
    
    if (role === "accountant") {
      return renderAccountantViews(view) || <Alert message="Màn hình kế toán chưa được thiết kế." type="info" />;
    }

    return (
      <Card style={glassCardStyle} bordered={false}>
        <Title level={4}>Giao diện đang được cấu trúc lại bằng Ant Design...</Title>
        <Text>Tính năng {view} của {details.name} đang được cập nhật thiết kế mới theo chuẩn B2B Ant Design & Glassmorphism.</Text>
      </Card>
    );
  };

  const menuItems: MenuProps['items'] = [
    { key: "profile", icon: <UserOutlined />, label: "Hồ sơ cá nhân", onClick: () => setProfileOpen(true) },
    { type: "divider" },
    { key: "logout", icon: <LogoutOutlined />, label: "Đăng xuất", onClick: () => void logout(), danger: true }
  ];

  return (
    <ConfigProvider theme={{ 
      token: {
        fontFamily: "'Inter', sans-serif",
        colorTextHeading: "#0F172A",
        colorText: "#0F172A",
        colorTextSecondary: "#1E293B",
        colorTextDescription: "#1E293B",
        fontWeightStrong: 700
      },
      components: {
        Menu: { colorItemText: "#334155", colorItemTextHover: "#0F172A", colorItemTextSelected: "#2563EB", colorItemBgSelected: "rgba(37, 99, 235, 0.1)" },
        Card: { colorTextHeading: "#0F172A" }
      }
    }}>
      <style>{`
        .ant-statistic-title {
          font-weight: 700 !important;
          color: #0F172A !important;
          font-size: 14px !important;
          letter-spacing: 0.02em;
        }
      `}</style>
      <Layout style={{ minHeight: "100vh", background: "url('/bg.jpg') center/cover no-repeat fixed" }}>
        <Sider collapsible collapsed={collapsed} onCollapse={value => setCollapsed(value)} style={{ background: "rgba(255, 255, 255, 0.65)", backdropFilter: "blur(24px)", borderRight: "1px solid rgba(255, 255, 255, 0.7)" }} theme="light">
          <div style={{ height: 32, margin: 16, background: "rgba(255,255,255,0.8)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#2563eb", letterSpacing: "1px", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            {collapsed ? "OMS" : "OMS · HỆ THỐNG"}
          </div>
          <Menu theme="light" mode="inline" selectedKeys={[view]} onClick={(e) => navigate(e.key)} style={{ background: "transparent", borderRight: 0, fontWeight: 500 }}
            items={details.views.map(v => ({ key: v.id, icon: v.icon, label: v.label }))}
          />
        </Sider>
        <Layout style={{ background: "transparent" }}>
          <Header style={{ padding: "0 24px", background: "rgba(255, 255, 255, 0.65)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255, 255, 255, 0.7)", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
            <Text strong style={{ fontSize: 18, color: "#0F172A" }}>{details.views.find(v => v.id === view)?.label || "Tổng quan"}</Text>
            <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={["click"]}>
              <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar style={{ backgroundColor: "#2563eb", fontWeight: "bold", color: "#fff" }}>{details.initials}</Avatar>
                {!collapsed && <Text strong style={{ color: "#0F172A" }}>{username}</Text>}
              </div>
            </Dropdown>
          </Header>
          <Content style={{ margin: "24px", padding: 0, minHeight: 280 }}>
            {renderContent()}
          </Content>
        </Layout>
      </Layout>
      {profileOpen && <Profile embedded onClose={() => setProfileOpen(false)} />}
    </ConfigProvider>
  );
}
