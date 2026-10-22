import React, { useState } from "react";
import { Avatar, Button, Drawer, Grid, Layout, Menu, Tooltip } from "antd";
import type { MenuProps } from "antd";
import {
  DollarCircleOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  HomeOutlined,
  LogoutOutlined,
  ShoppingCartOutlined,
  TruckOutlined,
} from "@ant-design/icons";
import BrandLogo from "../BrandLogo";

const { Sider } = Layout;

interface CustomerSidebarProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  onLogout?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  fullName?: string;
  roleName?: string;
}

export const CustomerSidebar: React.FC<CustomerSidebarProps> = ({
  selectedKey,
  onSelect,
  onLogout,
  mobileOpen = false,
  onMobileClose,
  fullName = "Đại lý",
  roleName = "Khách hàng",
}) => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [collapsed, setCollapsed] = useState(false);

  const menuItems: MenuProps["items"] = [
    {
      key: "menu-group",
      type: "group",
      label: <span className="customer-sidebar__group-label">ĐẠI LÝ</span>,
      children: [
        { key: "dashboard", icon: <HomeOutlined />, label: "Tổng quan đại lý" },
        { key: "catalog", icon: <ShoppingCartOutlined />, label: "Đặt hàng / Sản phẩm" },
        { key: "orders", icon: <HistoryOutlined />, label: "Đơn hàng của tôi" },
        { key: "delivery-tracking", icon: <TruckOutlined />, label: "Theo dõi giao hàng" },
        { key: "debt", icon: <DollarCircleOutlined />, label: "Công nợ & Hạn mức" },
        { key: "contracts", icon: <FileProtectOutlined />, label: "Hợp đồng & Chiết khấu" },
      ],
    },
    { type: "divider", style: { margin: "12px 0" } },
  ];

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    if (key === "logout") {
      onMobileClose?.();
      onLogout?.();
      return;
    }
    onSelect(key);
    if (isMobile) onMobileClose?.();
  };

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      onClick={handleMenuClick}
      items={menuItems}
      className="customer-sidebar__menu"
    />
  );

  const initials = fullName.trim().split(/\s+/).slice(-2).map((part) => part[0]).join("").toUpperCase() || "DL";
  const accountFooter = (
    <div className={`customer-sidebar__account${collapsed ? " is-collapsed" : ""}`}>
      <Avatar size={34}>{initials}</Avatar>
      {!collapsed && <div className="customer-sidebar__account-copy">
        <span className="customer-sidebar__account-name">{fullName}</span>
        <span className="customer-sidebar__account-role">{roleName}</span>
      </div>}
      <Tooltip title="Đăng xuất" placement={collapsed ? "right" : "top"}>
        <Button type="text" danger aria-label="Đăng xuất" icon={<LogoutOutlined />} onClick={() => { onMobileClose?.(); onLogout?.(); }} />
      </Tooltip>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        title={null}
        placement="left"
        width={260}
        open={mobileOpen}
        onClose={onMobileClose}
        className="customer-sidebar__drawer"
        styles={{ body: { padding: 0 } }}
      >
        <BrandLogo title="WMS" subtitle="Bán hàng & kho vận" />
        {menu}
        {accountFooter}
      </Drawer>
    );
  }

  return (
    <Sider
      width={196}
      collapsedWidth={64}
      collapsible
      collapsed={collapsed}
      onCollapse={setCollapsed}
      theme="light"
      className="customer-sidebar"
    >
      <BrandLogo title="WMS" subtitle="Bán hàng & kho vận" collapsed={collapsed} />
      {menu}
      {accountFooter}
    </Sider>
  );
};

export default CustomerSidebar;
