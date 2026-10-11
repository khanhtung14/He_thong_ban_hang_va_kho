import React from "react";
import { Layout, Menu, Badge, Button } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  TagsOutlined,
  UsergroupAddOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  InboxOutlined,
  AppstoreOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { FileExcelOutlined } from "@ant-design/icons";

const { Sider } = Layout;

export interface MenuItem {
  id: string;
  title: string;
  path: string;
  icon?: string;
  badge?: number | string;
}

export interface SidebarProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  pendingApprovalCount?: number;
  menuItems?: MenuItem[];
}

export const SalesManagerSidebar: React.FC<SidebarProps> = ({
  currentPath = "/manager/dashboard",
  onNavigate,
  onLogout,
  pendingApprovalCount = 3,
  menuItems: customMenuItems,
}) => {
  const defaultMenuItems: MenuItem[] = [
    {
      id: "home",
      title: "Trang chủ",
      path: "/manager/dashboard",
      icon: "home",
    },
    {
      id: "approvals",
      title: "Phê duyệt đơn hàng",
      path: "/manager/orders/approval",
      icon: "approval",
      badge: pendingApprovalCount,
    },
    {
      id: "reports",
      title: "Báo cáo doanh số & KPI",
      path: "/manager/reports",
      icon: "chart",
    },
    {
      id: "pricing",
      title: "Chính sách giá & Chiết khấu",
      path: "/manager/pricing",
      icon: "tag",
    },
    {
      id: "excel-import",
      title: "Nhập sản phẩm (Excel)",
      path: "/manager/products/import",
      icon: "excel",
    },
  ];

  const menuItems =
    customMenuItems && customMenuItems.length > 0
      ? customMenuItems
      : defaultMenuItems;

  const getIcon = (icon?: string) => {
    switch (icon) {
      case "home":
        return <HomeOutlined />;
      case "approval":
      case "clipboard-check":
        return <CheckCircleOutlined />;
      case "chart":
      case "bar-chart":
        return <BarChartOutlined />;
      case "excel": // <-- Thêm dòng này
      case "import": // <-- Thêm dòng này
        return <FileExcelOutlined />;
      case "users":
        return <UsergroupAddOutlined />;
      case "tag":
        return <TagsOutlined />;
      case "shopping-cart":
      case "orders":
        return <ShoppingCartOutlined />;
      case "building":
      case "customers":
        return <ShopOutlined />;
      case "boxes-stacked":
      case "inventory":
        return <InboxOutlined />;
      default:
        return <AppstoreOutlined />;
    }
  };

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.pathname = path;
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  const antMenuItems: MenuProps["items"] = menuItems.map((item) => ({
    key: item.path,
    icon: getIcon(item.icon),
    label: (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <span>{item.title}</span>
        {item.badge !== undefined && Number(item.badge) > 0 && (
          <Badge
            count={Number(item.badge)}
            overflowCount={99}
            style={{
              backgroundColor: "#ff4d4f",
              boxShadow: "none",
              fontSize: 11,
            }}
          />
        )}
      </div>
    ),
    onClick: () => handleNavigate(item.path),
  }));

  const selectedKey = currentPath === "/" ? "/manager/dashboard" : currentPath;

  return (
    <Sider
      width={260}
      theme="light"
      style={{
        borderRight: "1px solid #f0f0f0",
        height: "100vh",
        position: "sticky",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", background: "#ffffff" }}>
        {/* Logo WMS & Icon ngôi nhà nguyên bản */}
        <div
          style={{
            padding: "24px 20px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* Icon ngôi nhà nền xanh bo góc đúng mẫu */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 6px 14px rgba(37, 99, 235, 0.22)",
            }}
          >
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 20,
                color: "#2563eb",
                lineHeight: 1.1,
                letterSpacing: "-0.5px",
              }}
            >
              WMS
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                marginTop: 3,
                lineHeight: 1.25,
                fontWeight: 500,
              }}
            >
              Hệ thống quản lý kho & bán hàng
            </div>
          </div>
        </div>

        {/* Tiêu đề nhóm Menu */}
        <div
          style={{
            padding: "16px 20px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Menu
        </div>

        {/* Danh sách Menu */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={antMenuItems}
          style={{
            borderRight: "none",
            padding: "0 10px",
            background: "#ffffff",
          }}
        />
      </div>

      {/* Phần chân trang: Đồng bộ 100% nền trắng (#ffffff), liền mạch tuyệt đối */}
      <div
        style={{
          padding: "16px 14px 20px",
          borderTop: "1px solid #f1f5f9",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 8,
            paddingLeft: 10,
          }}
        >
          Hệ thống
        </div>
        <Button
          danger
          type="text"
          block
          icon={<LogoutOutlined style={{ fontSize: 16 }} />}
          onClick={handleLogout}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            height: 42,
            borderRadius: 10,
            fontWeight: 600,
            fontSize: 13,
            paddingLeft: 12,
          }}
        >
          Đăng xuất tài khoản
        </Button>
      </div>
    </Sider>
  );
};

export default SalesManagerSidebar;
