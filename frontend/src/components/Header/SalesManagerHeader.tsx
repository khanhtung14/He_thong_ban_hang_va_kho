import React from "react";
import ProfileAvatar from "../ProfileAvatar";
import {
  Layout,
  Avatar,
  Badge,
  Dropdown,
  Tag,
  Space,
  Typography,
  Button,
  Empty,
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

export interface HeaderProps {
  fullName?: string;
  roleName?: string;
  avatarUrl?: string;
  notificationCount?: number;
  onProfileClick?: () => void;
  onChangePassword?: () => void;
  onLogout?: () => void;
}

export interface SalesManagerHeaderProps {
  fullName?: string;
  roleName?: string;
  avatarUrl?: string | null;
  notificationCount?: number;
  onLogout?: () => void;
  onProfileClick?: () => void;
  onChangePasswordClick?: () => void; // Thêm prop này
}

export const SalesManagerHeader: React.FC<HeaderProps> = ({
  fullName = "Lê Quản Lý Kinh Doanh",
  roleName = "Quản lý kinh doanh",
  avatarUrl,
  notificationCount = 3,
  onProfileClick,
  onChangePassword,
  onLogout,
}) => {
  // Lấy 2 chữ cái đầu nếu không có avatarUrl
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .slice(-2)
    .join("")
    .toUpperCase();

  // Menu thao tác khi click vào Profile
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
      icon: <KeyOutlined />, // hoặc icon ổ khóa
      label: "Đổi mật khẩu",
      onClick: onChangePassword, // Gọi hàm onChangePassword khi click
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

  // Nội dung Dropdown khi click vào chuông Thông báo
  const notificationDropdown = (
    <div
      style={{
        width: 320,
        backgroundColor: "#fff",
        boxShadow:
          "0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12)",
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Text strong style={{ fontSize: 13, textTransform: "uppercase" }}>
          Thông báo cần xử lý
        </Text>
        <Tag color="processing">Hệ thống</Tag>
      </div>

      {notificationCount > 0 ? (
        <div style={{ textAlign: "center", padding: "12px 0" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Bạn có{" "}
            <Text strong type="warning">
              {notificationCount}
            </Text>{" "}
            đơn hàng đang chờ duyệt hạn mức / chiết khấu.
          </Text>
        </div>
      ) : (
        <Empty
          description="Không có thông báo mới"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </div>
  );

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
      }}
    >
      {/* Góc trái: Trạng thái hệ thống & Vai trò */}
      <Space orientation="horizontal" size="middle">
        <Tag
          icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
          color="success"
          style={{ padding: "4px 10px", borderRadius: 12, fontSize: 13 }}
        >
          Trực tuyến · {roleName}
        </Tag>
      </Space>

      {/* Góc phải: Chuông thông báo & Profile cá nhân */}
      <Space size="large" align="center">
        {/* Chuông thông báo có Badge số lượng */}
        <Dropdown
          dropdownRender={() => notificationDropdown}
          trigger={["click"]}
          placement="bottomRight"
        >
          <Badge count={notificationCount} size="small" offset={[-2, 4]}>
            <Button
              type="text"
              shape="circle"
              icon={<BellOutlined style={{ fontSize: 18, color: "#595959" }} />}
              style={{ width: 40, height: 40 }}
            />
          </Badge>
        </Dropdown>

        {/* Dropdown Menu Profile */}
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

export default SalesManagerHeader;
