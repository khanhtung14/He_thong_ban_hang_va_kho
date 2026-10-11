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
} from "@ant-design/icons";

const { Header } = Layout;
const { Text } = Typography;

export interface AccountantHeaderProps {
  fullName?: string;
  roleName?: string;
  avatarUrl?: string | null;
  notificationCount?: number;
  onLogout?: () => void;
  onProfileClick?: () => void;
  onChangePassword?: () => void;
}

export const AccountantHeader: React.FC<AccountantHeaderProps> = ({
  fullName = "Đặng Kế Toán",
  roleName = "Kế toán tài chính",
  avatarUrl: _avatarUrl,
  notificationCount = 0,
  onProfileClick,
  onChangePassword,
  onLogout,
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
      .toUpperCase() || "KT";

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
      {/* Trạng thái hệ thống */}
      <Space align="center">
        <Tag
          icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          color="success"
          style={{ padding: "4px 10px", borderRadius: 12, fontSize: 13 }}
        >
          Hệ thống hoạt động bình thường
        </Tag>
      </Space>

      {/* Chuông & Profile */}
      <Space size="large" align="center">
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
          <Space style={{ cursor: "pointer", userSelect: "none" }} size="small">
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

export default AccountantHeader;
