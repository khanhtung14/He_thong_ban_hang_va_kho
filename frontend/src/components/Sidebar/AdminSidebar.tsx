import React from "react";
import { Layout } from "antd";
import {
  HomeOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
  HistoryOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

const { Sider } = Layout;

export interface AdminSidebarProps {
  currentView?: string;
  onLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  currentView = "users",
  onLogout,
}) => {
  const menuItems = [
    {
      key: "overview",
      icon: <HomeOutlined style={{ fontSize: 16 }} />,
      label: "Trang chủ",
      href: "/admin/users?view=overview",
    },
    {
      key: "users",
      icon: <TeamOutlined style={{ fontSize: 16 }} />,
      label: "Quản lý tài khoản",
      href: "/admin/users?view=users",
    },
    {
      key: "rbac",
      icon: <SafetyCertificateOutlined style={{ fontSize: 16 }} />,
      label: "Ma trận phân quyền",
      href: "/admin/users?view=rbac",
    },
    {
      key: "configuration",
      icon: <AppstoreOutlined style={{ fontSize: 16 }} />,
      label: "Danh mục hệ thống",
      href: "/admin/users?view=configuration",
    },
    {
      key: "audit",
      icon: <HistoryOutlined style={{ fontSize: 16 }} />,
      label: "Nhật ký hệ thống",
      href: "/admin/users?view=audit",
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
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "24px 16px 20px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 28,
            padding: "0 6px",
          }}
        >
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
              boxShadow: "0 8px 20px -4px rgba(37, 99, 235, 0.45)",
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
                fontSize: 18,
                color: "#1e3a8a",
                lineHeight: 1.15,
              }}
            >
              WMS
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
              Hệ thống quản lý kho &amp; bán hàng
            </div>
          </div>
        </div>

        {/* Nhãn MENU */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#94a3b8",
            letterSpacing: "0.08em",
            padding: "0 8px",
            marginBottom: 10,
          }}
        >
          MENU
        </div>

        {/* Danh sách mục chọn bo tròn */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
        >
          {menuItems.map((item) => {
            const isActive = currentView === item.key;
            return (
              <a
                key={item.key}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#2563eb" : "#475569",
                  backgroundColor: isActive ? "#eff6ff" : "transparent",
                  textDecoration: "none",
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    fontSize: 17,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>

        {/* Nhãn HỆ THỐNG & Đăng xuất */}
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            letterSpacing: "0.06em",
            padding: "0 10px",
            marginTop: 22,
            marginBottom: 6,
          }}
        >
          HỆ THỐNG
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "9px 12px",
            borderRadius: 8,
            fontSize: 13.5,
            fontWeight: 500,
            color: "#ef4444",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#fef2f2";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <LogoutOutlined style={{ fontSize: 16 }} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </Sider>
  );
};

export default AdminSidebar;
