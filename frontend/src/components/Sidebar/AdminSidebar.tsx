import React from "react";
import { Layout, Menu, Button, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  HistoryOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

const { Sider } = Layout;
const { Text } = Typography;

export interface AdminSidebarProps {
  currentView?: string;
  onSelect?: (key: string) => void;
  onLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView = "overview",
  onSelect,
  onLogout,
}) => {
  const menuItems: MenuProps["items"] = [
    {
      key: "overview",
      icon: <HomeOutlined />,
      label: "Trang chủ",
    },
    {
      key: "users",
      icon: <TeamOutlined />,
      label: "Quản lý tài khoản",
    },
    {
      key: "rbac",
      icon: <SafetyCertificateOutlined />,
      label: "Ma trận phân quyền",
    },
    {
      key: "configuration",
      icon: <AppstoreOutlined />,
      label: "Danh mục hệ thống",
    },
    {
      key: "audit",
      icon: <HistoryOutlined />,
      label: "Nhật ký hệ thống",
    },
  ];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      window.sessionStorage.clear();
      window.localStorage.clear();
      window.location.href = "/login";
    }
  };

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (onSelect) {
      onSelect(key);
      window.history.pushState(null, "", `/admin/users?view=${key}`);
    }
  };

  return (
    <Sider
      width={250}
      theme="light"
      style={{
        height: "100vh",
        position: "sticky",
        top: 0,
        left: 0,
        borderRight: "1px solid #f1f5f9",
        background: "#ffffff",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "20px 12px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
            padding: "0 8px",
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 6px 16px -4px rgba(37, 99, 235, 0.4)",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
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
                fontSize: 17,
                color: "#1e3a8a",
                lineHeight: 1.2,
              }}
            >
              WMS
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Hệ thống quản lý kho &amp; bán hàng
            </Text>
          </div>
        </div>

        {/* Tiêu đề nhóm MENU */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            letterSpacing: "0.06em",
            padding: "0 12px",
            marginBottom: 8,
          }}
        >
          MENU
        </div>

        {/* Menu chuẩn Ant Design */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <Menu
            mode="inline"
            selectedKeys={[currentView]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ borderRight: "none" }}
          />
        </div>

        {/* Khu vực HỆ THỐNG & Nút Đăng xuất Ant Design */}
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#94a3b8",
              letterSpacing: "0.06em",
              padding: "0 12px",
              marginBottom: 8,
            }}
          >
            HỆ THỐNG
          </div>

          <Button
            type="text"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            block
            style={{
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              height: 40,
              borderRadius: 8,
              fontWeight: 500,
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </div>
    </Sider>
  );
};

export default AdminSidebar;