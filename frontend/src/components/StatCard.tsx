import React from "react";
import { Card, Tag, Typography, Space, Skeleton } from "antd";
import {
  RiseOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  AlertOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export interface StatCardProps {
  title: string;
  value: string;
  target?: string;
  badgeText?: string;
  badgeTone?: "green" | "blue" | "amber" | "rose" | "purple";
  subText?: string;
  tagText?: string;
  iconType?: "trend-up" | "shield" | "clock" | "alert";
  isUrgent?: boolean;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  target,
  badgeText,
  badgeTone = "blue",
  subText,
  tagText,
  iconType = "trend-up",
  isUrgent = false,
  loading = false,
}) => {
  // Trạng thái Loading với Skeleton của antd
  if (loading) {
    return (
      <Card style={{ borderRadius: 12, border: "1px solid #f0f0f0" }}>
        <Skeleton active paragraph={{ rows: 2 }} />
      </Card>
    );
  }

  // Render Icon tương ứng
  const renderIcon = () => {
    const iconStyle = { fontSize: 16 };
    let bg = "#e6f4ff";
    let color = "#1677ff";
    let IconComponent = RiseOutlined;

    switch (iconType) {
      case "shield":
        bg = "#f6ffed";
        color = "#52c41a";
        IconComponent = SafetyCertificateOutlined;
        break;
      case "clock":
        bg = "#fffbe6";
        color = "#faad14";
        IconComponent = ClockCircleOutlined;
        break;
      case "alert":
        bg = "#fff1f0";
        color = "#ff4d4f";
        IconComponent = AlertOutlined;
        break;
      case "trend-up":
      default:
        break;
    }

    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: bg,
          color: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconComponent style={iconStyle} />
      </div>
    );
  };

  // Màu sắc badge của Ant Design
  const getBadgeColor = (tone: string) => {
    switch (tone) {
      case "green":
        return "success";
      case "amber":
        return "warning";
      case "rose":
        return "error";
      case "purple":
        return "purple";
      case "blue":
      default:
        return "processing";
    }
  };

  return (
    <Card
      hoverable
      style={{
        borderRadius: 12,
        borderColor: isUrgent ? "#ffccc7" : "#f0f0f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.02)",
      }}
      styles={{ body: { padding: 20 } }}
    >
      {/* Tiêu đề & Icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Text
          type={isUrgent ? "danger" : "secondary"}
          strong
          style={{ fontSize: 12 }}
        >
          {title}
        </Text>
        {renderIcon()}
      </div>

      {/* Giá trị chính & Mục tiêu so sánh */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 800,
            lineHeight: 1.1,
            color: isUrgent ? "#cf1322" : "#1f1f1f",
          }}
        >
          {value}
        </span>
        {target && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {target}
          </Text>
        )}
      </div>

      {/* Footer: Badge, subText, tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid #f5f5f5",
          fontSize: 12,
        }}
      >
        <Space size={6} wrap>
          {badgeText && (
            <Tag
              color={getBadgeColor(badgeTone)}
              style={{ marginInlineEnd: 0, borderRadius: 4 }}
            >
              {badgeText}
            </Tag>
          )}
          {subText && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {subText}
            </Text>
          )}
        </Space>

        {tagText && (
          <Tag color="blue" style={{ marginInlineEnd: 0, fontWeight: 500 }}>
            {tagText}
          </Tag>
        )}
      </div>
    </Card>
  );
};

export default StatCard;
