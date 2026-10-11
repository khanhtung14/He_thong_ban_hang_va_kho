import React from "react";
import ProfileAvatar from "../ProfileAvatar";
import { Layout, Dropdown, Space, Avatar, Badge, Tag } from "antd";
import type { MenuProps } from "antd";
import {
  UserOutlined,
  KeyOutlined,
  LogoutOutlined,
  DownOutlined,
  BellOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";

const { Header } = Layout;

export interface AdminHeaderProps {
  fullName?: string;
  roleName?: string;
  notificationCount?: number;
  onProfileClick?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  fullName = "Quản trị viên",
  roleName = "Quản trị hệ thống",
  notificationCount = 0,
  onProfileClick,
  onChangePassword,
  onLogout,
}) => {
  const menuItems: MenuProps["items"] = [
    {
      key: "user-info",
      disabled: true,
      label: (
        <div style={{ padding: "4px 0", cursor: "default" }}>
          <div style={{ fontWeight: 700, color: "#0f172a" }}>{fullName}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>{roleName}</div>
        </div>
      ),
    },
    { type: "divider" },
    {
      key: "profile",
      icon: <UserOutlined />,
      label: "Hồ sơ cá nhân",
      onClick: onProfileClick,
    },
    {
      key: "change-password",
      icon: <KeyOutlined />,
      label: "Đổi mật khẩu",
      onClick: onChangePassword,
    },
    { type: "divider" },
    {
      key: "logout",
      danger: true,
      icon: <LogoutOutlined />,
      label: "Đăng xuất",
      onClick:
        onLogout ||
        (() => {
          window.sessionStorage.clear();
          window.location.href = "/login";
        }),
    },
  ];

  return (
    <Header
      style={{
        background: "#ffffff",
        padding: "0 28px",
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #f1f5f9",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Badge trạng thái máy chủ bên trái */}
      <Tag
        color="success"
        icon={<CheckCircleFilled />}
        style={{
          borderRadius: 20,
          padding: "3px 12px",
          fontWeight: 600,
          fontSize: 12,
        }}
      >
        Hệ thống hoạt động bình thường
      </Tag>

      {/* Cụm thông báo & Avatar bên phải */}
      <Space size={20} align="center">
        {/* Chuông thông báo */}
        <Badge count={notificationCount} size="small" offset={[-2, 4]}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              color: "#64748b",
            }}
          >
            <BellOutlined style={{ fontSize: 16 }} />
          </div>
        </Badge>

        {/* Dropdown người dùng */}
        <Dropdown
          menu={{ items: menuItems }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Space style={{ cursor: "pointer", userSelect: "none" }} size={10}>
            <ProfileAvatar editable={false} size={36} initials={fullName.charAt(0).toUpperCase()} />
            <div style={{ textAlign: "left", lineHeight: 1.2 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                {fullName}
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{roleName}</div>
            </div>
            <DownOutlined style={{ fontSize: 10, color: "#94a3b8" }} />
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AdminHeader;
