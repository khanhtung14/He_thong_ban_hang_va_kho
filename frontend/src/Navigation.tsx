import { useEffect, useState } from "react";
import {
  Layout,
  Menu,
  Drawer,
  Card,
  Tag,
  Avatar,
  Button,
  Radio,
  Typography,
  Space,
} from "antd";
import type { MenuProps } from "antd";
import {
  MenuOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface MenuItem {
  id: string;
  title: string;
  path: string;
  icon: string;
  category: string;
}

interface UserNavigation {
  username: string;
  full_name: string;
  role_code: string;
  role_name: string;
  scope: string;
}

const ROLE_OPTIONS = [
  { value: "WAREHOUSE", label: "Nhân viên kho" },
  { value: "SALES", label: "Kinh doanh" },
  { value: "SALES_MANAGER", label: "Quản lý KD" },
  { value: "WH_MANAGER", label: "Quản lý kho" },
  { value: "ACCOUNTANT", label: "Kế toán" },
  { value: "ADMIN", label: "Quản trị" },
  { value: "CUSTOMER", label: "Đại lý" },
];

export default function Navigation() {
  const [role, setRole] = useState("WAREHOUSE");
  const [user, setUser] = useState<UserNavigation>({
    username: "tranvankho",
    full_name: "Trần Văn Kho",
    role_code: "WAREHOUSE",
    role_name: "Nhân viên kho",
    scope: "Kho Tổng Hà Nội",
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("");

  useEffect(() => {
    fetch(`/api/v1/navigation/menu?role=${encodeURIComponent(role)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
        if (Array.isArray(data.menu_items)) {
          setMenuItems(data.menu_items);
          if (data.menu_items.length > 0) {
            setActiveItem(data.menu_items[0].id);
          }
        }
      })
      .catch(() => {});
  }, [role]);

  // Nhóm menu_items theo category để đưa vào Menu Ant Design
  const categories = Array.from(
    new Set(menuItems.map((item) => item.category)),
  );
  const antMenuItems: MenuProps["items"] = categories.map((cat, catIdx) => ({
    key: `group-${catIdx}`,
    type: "group",
    label: (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#94a3b8",
          letterSpacing: "0.06em",
        }}
      >
        {cat.toUpperCase()}
      </span>
    ),
    children: menuItems
      .filter((item) => item.category === cat)
      .map((item) => ({
        key: item.id,
        icon: <AppstoreOutlined style={{ fontSize: 15 }} />,
        label: (
          <span id={`nav-${item.id}`} style={{ fontWeight: 500 }}>
            {item.title}
          </span>
        ),
      })),
  }));

  const handleSelectMenu: MenuProps["onSelect"] = ({ key }) => {
    setActiveItem(key);
    setIsSidebarOpen(false);
  };

  return (
    <Layout
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Drawer menu cho màn hình di động / kiểm thử */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                backgroundColor: "#2563eb",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              WMS
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
              Danh Mục Nghiệp Vụ
            </span>
          </div>
        }
        placement="left"
        closable
        onClose={() => setIsSidebarOpen(false)}
        open={isSidebarOpen}
        styles={{ body: { padding: "12px 8px" } }}
        width={280}
      >
        <Menu
          mode="inline"
          selectedKeys={[activeItem]}
          items={antMenuItems}
          onSelect={handleSelectMenu}
          style={{ borderRight: "none" }}
        />
      </Drawer>

      {/* Header cố định */}
      <Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          width: "100%",
          height: 64,
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
        }}
      >
        {/* Nút Hamburger + Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button
            id="btnHamburger"
            icon={<MenuOutlined />}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            aria-label="Mở menu"
            style={{
              height: 40,
              width: 40,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: "#2563eb",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              WMS
            </div>
            <span
              style={{
                fontWeight: 700,
                color: "#1d4ed8",
                fontSize: 15,
                letterSpacing: "-0.2px",
              }}
            >
              OMS Bán hàng &amp; Kho
            </span>
          </div>
        </div>

        {/* Thông tin người dùng */}
        <div
          id="userHeaderProfile"
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <div style={{ textAlign: "right", lineHeight: 1.25 }}>
            <div
              id="userFullName"
              style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}
            >
              {user.full_name}
            </div>
            <div
              style={{
                display: "flex",
                gap: 4,
                justifyContent: "flex-end",
                marginTop: 2,
              }}
            >
              <Tag
                id="userRoleBadge"
                color="blue"
                style={{
                  margin: 0,
                  fontSize: 10,
                  padding: "0 6px",
                  lineHeight: "18px",
                  borderRadius: 4,
                }}
              >
                {user.role_name}
              </Tag>
              <Tag
                id="userScopeBadge"
                color="green"
                style={{
                  margin: 0,
                  fontSize: 10,
                  padding: "0 6px",
                  lineHeight: "18px",
                  borderRadius: 4,
                }}
              >
                {user.scope}
              </Tag>
            </div>
          </div>

          <Avatar
            style={{
              backgroundColor: "#2563eb",
              fontWeight: 700,
              fontSize: 13,
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.2)",
            }}
            icon={!user.full_name ? <UserOutlined /> : undefined}
          >
            {user.full_name ? user.full_name.slice(0, 2).toUpperCase() : ""}
          </Avatar>
        </div>
      </Header>

      {/* Nội dung trang kiểm thử phân quyền */}
      <Content
        style={{
          padding: "28px 16px",
          maxWidth: 920,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <Card
          style={{
            borderRadius: 16,
            border: "1px solid #e2e8f0",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
          }}
          styles={{ body: { padding: "28px" } }}
        >
          <Title
            level={4}
            style={{ margin: "0 0 6px", fontWeight: 700, color: "#0f172a" }}
          >
            SCRUM-60: Menu Điều Hướng Phân Quyền &amp; Tối Ưu Mobile 360px
          </Title>
          <Text
            type="secondary"
            style={{ fontSize: 13, display: "block", marginBottom: 18 }}
          >
            Chọn vai trò bên dưới để kiểm tra menu điều hướng động theo quyền
            thực tế từ máy chủ:
          </Text>

          {/* Bộ chọn vai trò giả lập */}
          <div
            style={{ marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}
          >
            <Radio.Group
              value={role}
              onChange={(e) => setRole(e.target.value)}
              buttonStyle="solid"
              size="middle"
            >
              <Space wrap size={[8, 8]}>
                {ROLE_OPTIONS.map((r) => (
                  <Radio.Button
                    key={r.value}
                    value={r.value}
                    style={{ borderRadius: 8, fontWeight: 500 }}
                  >
                    {r.label}
                  </Radio.Button>
                ))}
              </Space>
            </Radio.Group>
          </div>

          {/* Danh sách các chức năng hiển thị */}
          <div
            style={{
              backgroundColor: "#f8fafc",
              padding: "16px 20px",
              borderRadius: 12,
              border: "1px solid #edf2f7",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 13,
                color: "#334155",
                marginBottom: 10,
              }}
            >
              Chức năng đang hiển thị ({menuItems.length} mục):
            </div>
            <Space wrap size={[6, 8]}>
              {menuItems.map((item) => (
                <Tag
                  key={item.id}
                  color="blue"
                  icon={<CheckCircleOutlined />}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                >
                  {item.title}
                </Tag>
              ))}
              {menuItems.length === 0 && (
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Không có quyền truy cập mục nào.
                </Text>
              )}
            </Space>
          </div>

          <div style={{ marginTop: 20, textAlign: "right" }}>
            <Button
              type="primary"
              icon={<ShopOutlined />}
              onClick={() => setIsSidebarOpen(true)}
              style={{
                backgroundColor: "#2563eb",
                borderRadius: 8,
                height: 38,
              }}
            >
              Mở thanh điều hướng
            </Button>
          </div>
        </Card>
      </Content>
    </Layout>
  );
}
