import React from "react";
import { Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  ShoppingCartOutlined,
  HistoryOutlined,
  DollarCircleOutlined,
  FileProtectOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import BrandLogo from "../BrandLogo";

const { Sider } = Layout;

interface CustomerSidebarProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  onLogout?: () => void;
}

export const CustomerSidebar: React.FC<CustomerSidebarProps> = ({
  selectedKey,
  onSelect,
  onLogout,
}) => {
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
          icon: <HomeOutlined />,
          label: "Tổng quan đại lý",
        },
        {
          key: "catalog",
          icon: <ShoppingCartOutlined />,
          label: "Đặt hàng / Sản phẩm",
        },
        {
          key: "orders",
          icon: <HistoryOutlined />,
          label: "Đơn hàng của tôi",
        },
        {
          key: "debt",
          icon: <DollarCircleOutlined />,
          label: "Công nợ & Hạn mức",
        },
        {
          key: "contracts",
          icon: <FileProtectOutlined />,
          label: "Hợp đồng & Chiết khấu",
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
      {/* Brand Header */}
      <BrandLogo />

      {/* Menu Ant Design */}
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

export default CustomerSidebar;
