import React from "react";
import { Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import {
  BarcodeOutlined,
  ImportOutlined,
  ExportOutlined,
  CheckSquareOutlined,
  EnvironmentOutlined,
  LogoutOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import BrandLogo from "../BrandLogo";

const { Sider } = Layout;

interface WarehouseStaffSidebarProps {
  selectedKey: string;
  onSelect: (key: string) => void;
  onLogout?: () => void;
}

export const WarehouseStaffSidebar: React.FC<WarehouseStaffSidebarProps> = ({
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
          MENU THỰC THI
        </span>
      ),
      children: [
        {
          key: "scan",
          icon: <BarcodeOutlined />,
          label: "Quét mã Barcode / QR",
        },
        {
          key: "inbound",
          icon: <ImportOutlined />,
          label: "Thực hiện Nhập kho",
        },
        {
          key: "outbound",
          icon: <ExportOutlined />,
          label: "Thực hiện Xuất kho",
        },
        {
          key: "unit-conversion", // <-- Key mới cho chức năng này
          icon: <SwapOutlined />,
          label: "Đơn vị tính & Quy đổi",
        },
        {
          key: "stocktake-exec",
          icon: <CheckSquareOutlined />,
          label: "Đếm hàng kiểm kê",
        },
        {
          key: "locations",
          icon: <EnvironmentOutlined />,
          label: "Tra cứu vị trí / Kệ hàng",
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

export default WarehouseStaffSidebar;
