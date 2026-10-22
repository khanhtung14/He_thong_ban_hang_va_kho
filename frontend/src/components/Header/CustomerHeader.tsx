import React from "react";
import ProfileAvatar from "../ProfileAvatar";
import {
  Layout,
  Badge,
  Dropdown,
  Tag,
  Space,
  Typography,
  Button,
} from "antd";
import type { MenuProps } from "antd";
import {
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  CheckCircleTwoTone,
  MenuOutlined,
} from "@ant-design/icons";

const { Header } = Layout;
const { Text } = Typography;

export interface CustomerHeaderProps {
  fullName?: string;
  roleName?: string;
  avatarUrl?: string | null;
  notificationCount?: number;
  onLogout?: () => void;
  onProfileClick?: () => void;
  onChangePassword?: () => void;
  onMenuClick?: () => void;
  pageTitle?: string;
}

export const CustomerHeader: React.FC<CustomerHeaderProps> = ({
  fullName = "Đại lý khách hàng",
  roleName = "Khách hàng / Đại lý",
  avatarUrl: _avatarUrl,
  notificationCount = 0,
  onProfileClick,
  onChangePassword,
  onLogout,
  onMenuClick,
  pageTitle = "Tổng quan đại lý",
}) => {
  void _avatarUrl;
  const initials =
    fullName
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(-2)
      .join("")
      .toUpperCase() || "DL";

  const profileMenuItems: MenuProps["items"] = [
    {
      key: "user-info",
      disabled: true,
      label: (
        <div style={{ padding: "4px 0", cursor: "default" }}>
          <Text strong style={{ display: "block" }}>
            {fullName}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {roleName}
          </Text>
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
      icon: <LogoutOutlined />,
      danger: true,
      label: "Đăng xuất",
      onClick: onLogout,
    },
  ];

  return (
    <Header
      className="customer-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #f0f0f0",
        padding: "0 24px",
        height: 64,
        lineHeight: "64px",
      }}
    >
      <div className="customer-header__left">
        <Button
          className="customer-header__menu-button"
          type="text"
          icon={<MenuOutlined />}
          aria-label="Mở menu"
          onClick={onMenuClick}
        />
        <div className="customer-header__breadcrumb">
          <Text type="secondary">Đại lý</Text>
          <span>/</span>
          {pageTitle === "Theo dõi giao hàng" && <>
            <Text type="secondary">Đơn hàng</Text>
            <span>/</span>
          </>}
          <Text strong>{pageTitle}</Text>
        </div>
        <Tag
          className="customer-header__health"
          icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          color="success"
          style={{ padding: "4px 10px", borderRadius: 12, fontSize: 13 }}
        >
          Hệ thống hoạt động bình thường
        </Tag>
      </div>

      <Space className="customer-header__actions" size="middle" align="center">
        <Badge count={notificationCount} size="small" offset={[-2, 4]}>
          <Button
            type="text"
            shape="circle"
            icon={<BellOutlined style={{ fontSize: 18, color: "#595959" }} />}
            style={{ width: 40, height: 40 }}
          />
        </Badge>

        <Dropdown
          menu={{ items: profileMenuItems }}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Space className="customer-header__profile" style={{ cursor: "pointer", userSelect: "none" }} size="small">
            <ProfileAvatar editable={false} size={36} initials={initials} />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                lineHeight: 1.2,
                textAlign: "left",
              }}
            >
              <Text strong style={{ fontSize: 14 }}>
                {fullName}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {roleName}
              </Text>
            </div>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default CustomerHeader;
