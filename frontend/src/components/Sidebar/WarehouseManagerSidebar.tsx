import React from "react";
import { Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import {
  DashboardOutlined,
  InboxOutlined,
  AuditOutlined,
  AppstoreOutlined,
  AlertOutlined,
  BarChartOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import BrandLogo from "../BrandLogo";

const { Sider } = Layout;

interface WarehouseManagerSidebarProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  onLogout?: () => void;
}

export const WarehouseManagerSidebar: React.FC<
  WarehouseManagerSidebarProps
> = ({ selectedKey, onSelect, onLogout }) => {
  const menuItems: MenuProps["items"] = [
    {
      key: "menu-group",
      type: "group",
      label: (
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
          MENU
        </span>
      ),
      children: [
        {
          key: "dashboard",
          icon: <DashboardOutlined />,
          label: "Tổng quan kho vận",
        },
        {
          key: "inventory",
          icon: <AppstoreOutlined />,
          label: "Quản lý tồn kho & SKU",
        },
        {
          key: "approvals",
          icon: <AuditOutlined />,
          label: "Duyệt lệnh Nhập / Xuất",
        },
        {
          key: "stocktaking",
          icon: <InboxOutlined />,
          label: "Kế hoạch kiểm kê",
        },
        {
          key: "threshold-alerts",
          icon: <AlertOutlined />,
          label: "Cảnh báo định mức kho",
        },
        {
          key: "reports",
          icon: <BarChartOutlined />,
          label: "Báo cáo xuất nhập tồn",
        },
      ],
    },
    {
      type: "divider",
      style: { margin: "16px 0" },
    },
    {
      key: "system-group",
      type: "group",
      label: (
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>
          HỆ THỐNG
        </span>
      ),
      children: [
        {
          key: "logout",
          icon: <LogoutOutlined style={{ color: "#ef4444" }} />,
          label: (
            <span style={{ color: "#ef4444", fontWeight: 600 }}>Đăng xuất</span>
          ),
          onClick: onLogout,
        },
      ],
    },
  ];

  return (
    <Sider
      width={250}
      theme="light"
      style={{
        height: "100vh",
        position: "sticky",
        top: 0,
        left: 0,
        borderRight: "1px solid #f0f0f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <BrandLogo />

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        onClick={({ key }) => {
          if (key !== "logout") onSelect(key);
        }}
        items={menuItems}
        style={{ borderRight: "none", flex: 1, padding: "0 8px" }}
      />
    </Sider>
  );
};

export default WarehouseManagerSidebar;
