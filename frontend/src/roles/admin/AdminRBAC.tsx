import React from "react";
import { Card, Alert, Typography, Table, Tag } from "antd";

const { Title, Text } = Typography;

export const AdminRBAC: React.FC = () => {
  const rbacData = [
    {
      key: "1",
      group: "Kinh doanh",
      roles: ["Sales Rep", "Sales Manager"],
      permissions:
        "Tạo đơn hàng, quản lý danh sách đại lý, duyệt chiết khấu, báo cáo doanh số.",
    },
    {
      key: "2",
      group: "Kho vận",
      roles: ["Warehouse", "Warehouse Manager"],
      permissions:
        "Xuất/nhập kho, soạn hàng, kiểm kê, điều chuyển hàng giữa các chi nhánh.",
    },
    {
      key: "3",
      group: "Tài chính",
      roles: ["Accountant"],
      permissions:
        "Theo dõi sổ công nợ, đối soát thanh toán, xuất hóa đơn chứng từ.",
    },
    {
      key: "4",
      group: "Khách hàng",
      roles: ["Customer"],
      permissions:
        "Đặt hàng trực tuyến, kiểm tra hành trình đơn và đối chiếu công nợ của đại lý.",
    },
    {
      key: "5",
      group: "Quản trị",
      roles: ["Administrator"],
      permissions:
        "Toàn quyền quản trị tài khoản, danh mục hệ thống và nhật ký kiểm tra bảo mật.",
    },
  ];

  const columns = [
    {
      title: "NHÓM NGHIỆP VỤ",
      dataIndex: "group",
      key: "group",
      render: (text: string) => (
        <strong style={{ color: "#1e3a8a" }}>{text}</strong>
      ),
    },
    {
      title: "VAI TRÒ THÀNH VIÊN",
      dataIndex: "roles",
      key: "roles",
      render: (roles: string[]) => (
        <div style={{ display: "flex", gap: 6 }}>
          {roles.map((r) => (
            <Tag color="blue" key={r}>
              {r}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: "QUYỀN HẠN ĐƯỢC PHÂN BỔ",
      dataIndex: "permissions",
      key: "permissions",
    },
  ];

  return (
    <Card style={{ borderRadius: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: "0 0 6px", fontWeight: 700 }}>
          Ma trận phân quyền (RBAC)
        </Title>
        <Text type="secondary">
          Tổng quan vai trò nghiệp vụ và các khu vực truy cập được cấu hình.
        </Text>
      </div>

      <Alert
        type="info"
        showIcon
        message="Quyền truy cập được máy chủ xác thực theo chính sách hệ thống (Security Policy). Màn hình này hiển thị danh mục vai trò chuẩn."
        style={{ marginBottom: 20, borderRadius: 8 }}
      />

      <Table dataSource={rbacData} columns={columns} pagination={false} />
    </Card>
  );
};

export default AdminRBAC;
