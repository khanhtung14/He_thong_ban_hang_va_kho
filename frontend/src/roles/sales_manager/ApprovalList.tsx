import React from "react";
import {
  Card,
  List,
  Tag,
  Button,
  Typography,
  Space,
  Skeleton,
  Empty,
  Popconfirm,
  Badge,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  // ExclamationCircleOutlined,
  RightOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export interface ApprovalItem {
  id: string;
  type: "price_list" | "below_floor" | "credit_limit";
  typeLabel: string;
  badgeBg?: string;
  badgeText?: string;
  title: string;
  reason: string;
  amount: string;
  code: string;
  assigneeLabel: string;
  assigneeName: string;
  approveActionLabel: string;
  priceListId?: number;
}

export interface ApprovalListProps {
  items: ApprovalItem[];
  onApprove: (item: ApprovalItem) => void;
  onReject: (item: ApprovalItem) => void;
  onViewAll?: () => void;
  loading?: boolean;
}

export const ApprovalList: React.FC<ApprovalListProps> = ({
  items,
  onApprove,
  onReject,
  onViewAll,
  loading = false,
}) => {
  // Bản đồ màu Tag dựa trên loại duyệt đơn
  const getTypeTagColor = (type: ApprovalItem["type"]) => {
    switch (type) {
      case "credit_limit":
        return "error"; // Đỏ: Vượt hạn mức nợ
      case "below_floor":
        return "warning"; // Cam: Dưới giá sàn
      case "price_list":
        return "processing"; // Xanh dương: Bảng giá mới
      default:
        return "default";
    }
  };

  return (
    <Card
      style={{
        borderRadius: 16,
        border: "1px solid #f0f0f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.02)",
      }}
      styles={{
        header: { padding: "16px 24px", borderBottom: "1px solid #f5f5f5" },
        body: { padding: "16px 24px" },
      }}
      title={
        <Space align="center" size={8}>
          <Badge color="#1677ff" />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1f1f1f" }}>
            Hộp thư phê duyệt hạn mức & đơn ngoại lệ
          </span>
        </Space>
      }
      extra={
        <Button
          type="link"
          onClick={onViewAll}
          style={{ padding: 0, fontWeight: 600, fontSize: 13 }}
        >
          Xem tất cả ({items.length.toString().padStart(2, "0")}){" "}
          <RightOutlined style={{ fontSize: 11 }} />
        </Button>
      }
    >
      {/* Loading Skeleton */}
      {loading ? (
        <List
          itemLayout="vertical"
          dataSource={[1, 2, 3]}
          renderItem={(i) => (
            <Card
              key={i}
              style={{
                marginBottom: 12,
                borderRadius: 12,
                backgroundColor: "#fafafa",
              }}
            >
              <Skeleton active avatar paragraph={{ rows: 2 }} />
            </Card>
          )}
        />
      ) : items.length === 0 ? (
        /* Empty State */
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Hiện tại không có yêu cầu phê duyệt nào cần xử lý."
          style={{ padding: "32px 0" }}
        />
      ) : (
        /* Danh sách các yêu cầu chờ duyệt */
        <List
          itemLayout="vertical"
          dataSource={items}
          split={false}
          renderItem={(item) => (
            <Card
              key={item.id}
              hoverable
              style={{
                marginBottom: 12,
                borderRadius: 12,
                borderColor: "#f0f0f0",
                transition: "all 0.2s ease",
              }}
              styles={{ body: { padding: "16px 20px" } }}
            >
              {/* Phần thông tin chính */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div
                  style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
                >
                  <Tag
                    color={getTypeTagColor(item.type)}
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {item.typeLabel}
                  </Tag>
                  <div>
                    <Text
                      strong
                      style={{
                        fontSize: 14,
                        color: "#262626",
                        display: "block",
                      }}
                    >
                      {item.title}
                    </Text>
                    <div style={{ marginTop: 6 }}>
                      <Tag
                        color="orange"
                        style={{
                          margin: 0,
                          borderRadius: 4,
                          fontSize: 12,
                          border: "1px solid #ffd591",
                        }}
                      >
                        Lý do: {item.reason}
                      </Tag>
                    </div>
                  </div>
                </div>

                {/* Số tiền & Mã đơn */}
                <div style={{ textAlign: "right", minWidth: 100 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#1f1f1f",
                      letterSpacing: "-0.2px",
                    }}
                  >
                    {item.amount}
                  </div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, fontFamily: "monospace" }}
                  >
                    {item.code}
                  </Text>
                </div>
              </div>

              {/* Footer thanh thao tác */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: 12,
                  borderTop: "1px solid #f8f8f8",
                }}
              >
                <div style={{ fontSize: 12 }}>
                  <Text type="secondary">{item.assigneeLabel}: </Text>
                  <Text strong>{item.assigneeName}</Text>
                </div>

                {/* Hai nút Phê duyệt / Từ chối kèm xác nhận an toàn */}
                <Space size="small">
                  <Popconfirm
                    title="Từ chối yêu cầu"
                    description={`Bạn có chắc muốn từ chối ${item.code}?`}
                    onConfirm={() => onReject(item)}
                    okText="Từ chối"
                    cancelText="Đóng"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      size="small"
                      icon={<CloseOutlined />}
                      style={{ borderRadius: 6, fontSize: 12 }}
                    >
                      Từ chối
                    </Button>
                  </Popconfirm>

                  <Popconfirm
                    title="Xác nhận phê duyệt"
                    description={`Duyệt yêu cầu ngoại lệ cho ${item.code}?`}
                    onConfirm={() => onApprove(item)}
                    okText="Duyệt"
                    cancelText="Hủy"
                  >
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      style={{ borderRadius: 6, fontSize: 12 }}
                    >
                      {item.approveActionLabel}
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          )}
        />
      )}
    </Card>
  );
};

export default ApprovalList;
