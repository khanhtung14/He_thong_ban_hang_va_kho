import React from "react";
import {
  HomeOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  SwapOutlined,
  BarChartOutlined,
  BookOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

interface AccountantSidebarProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  onLogout?: () => void;
}

export const AccountantSidebar: React.FC<AccountantSidebarProps> = ({
  selectedKey,
  onSelect,
  onLogout,
}) => {
  const menuItems = [
    { key: "dashboard", label: "Tổng quan", icon: <HomeOutlined /> },
    {
      key: "receivables",
      label: "Công nợ đại lý",
      icon: <DollarCircleOutlined />,
    },
    {
      key: "invoices",
      label: "Hóa đơn & Chứng từ",
      icon: <FileTextOutlined />,
    },
    {
      key: "reconciliation",
      label: "Đối soát công nợ",
      icon: <SwapOutlined />,
    },
    {
      key: "accounting-book",
      label: "Sổ sách kế toán",
      icon: <BookOutlined />,
    },
    { key: "reports", label: "Báo cáo tài chính", icon: <BarChartOutlined /> },
  ];

  return (
    <aside
      style={{
        width: 250,
        minWidth: 250,
        height: "100vh",
        backgroundColor: "#ffffff",
        borderRight: "1px solid #eef2f6",
        display: "flex",
        flexDirection: "column",
        padding: "24px 16px",
        position: "sticky",
        top: 0,
        left: 0,
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    >
      {/* Logo Brand Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 32,
          paddingLeft: 4,
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: "#2563eb",
            color: "#ffffff",
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            boxShadow: "0 8px 16px rgba(37, 99, 235, 0.25)",
          }}
        >
          <HomeOutlined />
        </div>
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#1e3a8a",
              letterSpacing: -0.3,
              lineHeight: 1.1,
            }}
          >
            WMS
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 3,
              lineHeight: 1.3,
            }}
          >
            Hệ thống quản lý kho & bán hàng
          </div>
        </div>
      </div>

      {/* Menu Section */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "#94a3b8",
          letterSpacing: "0.06em",
          marginBottom: 12,
          paddingLeft: 12,
        }}
      >
        MENU
      </div>

      <nav
        style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}
      >
        {menuItems.map((item) => {
          const isActive = selectedKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelect(item.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "11px 14px",
                border: "none",
                borderRadius: 12,
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? "#2563eb" : "#475569",
                backgroundColor: isActive ? "#eff6ff" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span
                style={{ fontSize: 16, display: "grid", placeItems: "center" }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer / Hệ thống */}
      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            letterSpacing: "0.06em",
            marginBottom: 12,
            paddingLeft: 12,
          }}
        >
          HỆ THỐNG
        </div>
        <button
          type="button"
          onClick={onLogout}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "10px 14px",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            color: "#ef4444",
            backgroundColor: "transparent",
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = "#fef2f2")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = "transparent")
          }
        >
          <LogoutOutlined style={{ fontSize: 16 }} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
};
