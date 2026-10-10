import React from "react";
import { Card, Row, Col, Alert, Typography } from "antd";
import {
  AppstoreOutlined,
  CompassOutlined,
  ShopOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

export const AdminConfiguration: React.FC = () => {
  const configs = [
    {
      icon: <AppstoreOutlined style={{ fontSize: 24, color: "#2563eb" }} />,
      title: "Vai trò",
      value: "7 vai trò nghiệp vụ",
      desc: "Phân quyền cố định theo chính sách hệ thống OMS/WMS.",
    },
    {
      icon: <CompassOutlined style={{ fontSize: 24, color: "#16a34a" }} />,
      title: "Địa bàn",
      value: "4 khu vực",
      desc: "Toàn quốc · Miền Bắc (Hà Nội) · Miền Nam (TP.HCM) · Miền Trung (Đà Nẵng).",
    },
    {
      icon: <ShopOutlined style={{ fontSize: 24, color: "#d97706" }} />,
      title: "Kho hàng",
      value: "2 kho vận hành",
      desc: "Kho Tổng Hà Nội · Kho Chi nhánh TP. Hồ Chí Minh.",
    },
  ];

  return (
    <Card style={{ borderRadius: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: "0 0 6px", fontWeight: 700 }}>
          Danh mục hệ thống
        </Title>
        <Text type="secondary">
          Vai trò chuẩn, địa bàn và kho được phân bổ cho các nhóm người dùng.
        </Text>
      </div>

      <Row gutter={20}>
        {configs.map((c) => (
          <Col xs={24} md={8} key={c.title}>
            <Card
              style={{
                borderRadius: 12,
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <div style={{ display: "flex", gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    {c.title}
                  </Text>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      margin: "2px 0 6px",
                      color: "#0f172a",
                    }}
                  >
                    {c.value}
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {c.desc}
                  </Text>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </Card>
  );
};

export default AdminConfiguration;
