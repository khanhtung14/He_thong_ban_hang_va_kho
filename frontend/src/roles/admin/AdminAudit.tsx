import React from "react";
import {
  Card,
  Alert,
  Row,
  Col,
  List,
  Tag,
  Button,
  Typography,
  Space,
} from "antd";
import {
  ArrowRightOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

export const AdminAudit: React.FC = () => {
  const auditLogs = [
    {
      title: "Đăng nhập quản trị thành công",
      time: "Vừa xong",
      role: "Quản trị hệ thống",
      color: "green",
    },
    {
      title: "Đã thu hồi 2 phiên hết hạn",
      time: "09:42",
      role: "Quản trị hệ thống",
      color: "blue",
    },
    {
      title: "Cập nhật quyền truy cập cho user",
      time: "Hôm qua",
      role: "Quản trị hệ thống",
      color: "orange",
    },
    {
      title: "Khóa tài khoản vi phạm chính sách",
      time: "3 ngày trước",
      role: "Quản trị hệ thống",
      color: "red",
    },
  ];

  return (
    <Card style={{ borderRadius: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: "0 0 6px", fontWeight: 700 }}>
          Nhật ký &amp; bảo mật
        </Title>
        <Text type="secondary">
          Theo dõi thao tác quản trị, khóa tài khoản và các phiên đăng nhập.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Nhật ký chi tiết các thay đổi cấu hình tài khoản và phân quyền được lưu trữ phục vụ đối soát an ninh."
        style={{ marginBottom: 24, borderRadius: 8 }}
      />

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card title="Sự kiện bảo mật gần đây" style={{ borderRadius: 12 }}>
            <List
              dataSource={auditLogs}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    avatar={<Tag color={item.color}>●</Tag>}
                    title={
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                    }
                    description={`${item.time} · ${item.role}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <ExclamationCircleOutlined style={{ color: "#d97706" }} />
                <span>Tài khoản cần chú ý</span>
              </Space>
            }
            style={{
              borderRadius: 12,
              border: "1px solid #fed7aa",
              background: "#fffbeb",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Kiểm tra định kỳ tài khoản bị khóa
            </div>
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 16, fontSize: 13 }}
            >
              Mở mục tài khoản để xem nhật ký hoạt động và trạng thái bàn giao
              đại lý phụ trách của nhân sự.
            </Text>
            <Button
              type="primary"
              href="/admin/users?view=users"
              style={{ backgroundColor: "#2563eb", borderRadius: 8 }}
            >
              Đi tới danh sách tài khoản <ArrowRightOutlined />
            </Button>
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default AdminAudit;
