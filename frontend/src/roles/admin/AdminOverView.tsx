import React, { useEffect, useState } from "react";
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Tag,
  Typography,
  Space,
  List,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UserOutlined,
  CheckCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserAddOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../session";

const { Title, Text } = Typography;

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  status: string;
  roles: Array<string | { code: string; name: string }>;
  territories?: Array<{ id: number; name: string }>;
}

export const AdminOverview: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    authenticatedFetch("/api/v1/admin/users?page=1&page_size=5")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUsers(data.items || []);
        setTotalUsers(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<UserRow> = [
    {
      title: "Người dùng",
      key: "user",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.full_name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.username}
          </Text>
        </div>
      ),
    },
    {
      title: "Vai trò",
      key: "roles",
      render: (_, r) =>
        r.roles
          ?.map((x) => (typeof x === "string" ? x : x.name || x.code))
          .join(", ") || "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : "red"}>
          {status === "ACTIVE" ? "Hoạt động" : status}
        </Tag>
      ),
    },
    {
      title: "Địa bàn phụ trách",
      key: "territories",
      render: (_, r) => r.territories?.map((t) => t.name).join(", ") || "—",
    },
  ];

  const auditEvents = [
    {
      title: "Đăng nhập quản trị thành công",
      time: "Vừa xong",
      color: "green",
    },
    { title: "Đã thu hồi 2 phiên hết hạn", time: "09:42", color: "blue" },
    { title: "Cập nhật quyền truy cập", time: "Hôm qua", color: "orange" },
  ];

  const roleGroups = [
    { title: "Kinh doanh", desc: "Sales Rep · Sales Manager", color: "blue" },
    { title: "Kho vận", desc: "Warehouse · WH Manager", color: "purple" },
    { title: "Tài chính", desc: "Accountant", color: "green" },
    { title: "Khách hàng", desc: "Customer", color: "orange" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Banner Chào mừng */}
      {/* Phần tiêu đề chào mừng đồng bộ phong cách Quản lý kinh doanh */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <Title
            level={2}
            style={{
              margin: 0,
              fontWeight: 700,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 26,
            }}
          >
            Xin chào, Quản trị hệ thống{" "}
            <span
              role="img"
              aria-label="smile"
              style={{ color: "#eab308" }}
            ></span>
          </Title>
          <Text
            type="secondary"
            style={{ fontSize: 13, display: "block", marginTop: 4 }}
          >
            Bàn làm việc Quản trị hệ thống · Quản lý tài khoản, phân quyền và
            nhật ký bảo mật
          </Text>
        </div>

        {/* Nút hành động bên phải */}
        <Space size={12}>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            href="/admin/users/create"
            style={{
              backgroundColor: "#2563eb",
              borderRadius: 8,
              height: 40,
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
            }}
          >
            Tạo tài khoản mới
          </Button>
        </Space>
      </div>

      {/* 4 Thẻ chỉ số Thống kê */}
      <Row gutter={16}>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Tổng người dùng"
              value={totalUsers}
              prefix={<UserOutlined style={{ color: "#2563eb" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Đang hoạt động"
              value={users.filter((u) => u.status === "ACTIVE").length}
              prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Khóa / chờ kích hoạt"
              value={users.filter((u) => u.status !== "ACTIVE").length}
              prefix={<LockOutlined style={{ color: "#d97706" }} />}
            />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card style={{ borderRadius: 12 }}>
            <Statistic
              title="Vai trò nghiệp vụ"
              value={7}
              prefix={
                <SafetyCertificateOutlined style={{ color: "#7c3aed" }} />
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Khu vực Bảng tài khoản & Cột tin tức bên phải */}
      <Row gutter={20}>
        <Col xs={24} lg={15}>
          <Card
            title={<span style={{ fontWeight: 700 }}>Tài khoản gần đây</span>}
            extra={
              <Button type="link" href="/admin/users?view=users">
                Mở danh sách <ArrowRightOutlined />
              </Button>
            }
            style={{ borderRadius: 14 }}
          >
            <Table
              dataSource={users}
              columns={columns}
              rowKey="id"
              pagination={false}
              loading={loading}
              size="middle"
            />
          </Card>
        </Col>

        <Col xs={24} lg={9}>
          <Space orientation="vertical" size={20} style={{ width: "100%" }}>
            <Card
              title={
                <span style={{ fontWeight: 700 }}>
                  Nhật ký thao tác gần nhất
                </span>
              }
              extra={
                <Button type="link" href="/admin/users?view=audit">
                  Xem tất cả
                </Button>
              }
              style={{ borderRadius: 14 }}
            >
              <List
                dataSource={auditEvents}
                renderItem={(item) => (
                  <List.Item style={{ padding: "10px 0" }}>
                    <List.Item.Meta
                      avatar={<Tag color={item.color}>●</Tag>}
                      title={<span style={{ fontSize: 13 }}>{item.title}</span>}
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.time} · Quản trị
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>

            <Card
              title={
                <span style={{ fontWeight: 700 }}>Vai trò &amp; phạm vi</span>
              }
              extra={
                <Button type="link" href="/admin/users?view=rbac">
                  Ma trận RBAC
                </Button>
              }
              style={{ borderRadius: 14 }}
            >
              <List
                dataSource={roleGroups}
                renderItem={(item) => (
                  <List.Item style={{ padding: "8px 0" }}>
                    <List.Item.Meta
                      avatar={
                        <Tag color={item.color}>{item.title.charAt(0)}</Tag>
                      }
                      title={
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {item.title}
                        </span>
                      }
                      description={
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.desc}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default AdminOverview;
