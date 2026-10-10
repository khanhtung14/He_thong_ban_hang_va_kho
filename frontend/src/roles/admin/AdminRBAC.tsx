import React from "react";
import { Card, Alert, Typography, Table, Tag } from "antd";
import { CheckCircleFilled, CloseCircleOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export const AdminRBAC: React.FC = () => {
  const roles = [
    { key: "sales", title: "Sales Rep", color: "blue" },
    { key: "salesMgr", title: "Sales Mgr", color: "cyan" },
    { key: "warehouse", title: "Kho (Staff)", color: "green" },
    { key: "warehouseMgr", title: "Kho (Mgr)", color: "lime" },
    { key: "accountant", title: "Kế toán", color: "orange" },
    { key: "customer", title: "Khách hàng", color: "purple" },
    { key: "admin", title: "Quản trị viên", color: "red" },
  ];

  const rbacData = [
    {
      key: "1",
      feature: "Tạo đơn hàng / Mua hàng",
      sales: true, salesMgr: true, warehouse: false, warehouseMgr: false, accountant: false, customer: true, admin: true,
    },
    {
      key: "2",
      feature: "Duyệt chiết khấu & Giá",
      sales: false, salesMgr: true, warehouse: false, warehouseMgr: false, accountant: false, customer: false, admin: true,
    },
    {
      key: "3",
      feature: "Xem danh sách đại lý",
      sales: true, salesMgr: true, warehouse: false, warehouseMgr: false, accountant: true, customer: false, admin: true,
    },
    {
      key: "4",
      feature: "Nhập / Xuất hàng hóa",
      sales: false, salesMgr: false, warehouse: true, warehouseMgr: true, accountant: false, customer: false, admin: true,
    },
    {
      key: "5",
      feature: "Kiểm kê & Điều chuyển",
      sales: false, salesMgr: false, warehouse: false, warehouseMgr: true, accountant: false, customer: false, admin: true,
    },
    {
      key: "6",
      feature: "Công nợ & Thanh toán",
      sales: false, salesMgr: false, warehouse: false, warehouseMgr: false, accountant: true, customer: false, admin: true,
    },
    {
      key: "7",
      feature: "Báo cáo doanh số / Lợi nhuận",
      sales: false, salesMgr: true, warehouse: false, warehouseMgr: false, accountant: true, customer: false, admin: true,
    },
    {
      key: "8",
      feature: "Quản lý Tài khoản & Cấu hình",
      sales: false, salesMgr: false, warehouse: false, warehouseMgr: false, accountant: false, customer: false, admin: true,
    },
  ];

  const renderIcon = (hasPermission: boolean) =>
    hasPermission ? (
      <CheckCircleFilled style={{ color: "#52c41a", fontSize: 18 }} />
    ) : (
      <CloseCircleOutlined style={{ color: "#d9d9d9", fontSize: 18 }} />
    );

  const columns: any = [
    {
      title: "Chức năng / Nghiệp vụ",
      dataIndex: "feature",
      key: "feature",
      fixed: "left",
      width: 250,
      render: (text: string) => <strong style={{ color: "#1e3a8a" }}>{text}</strong>,
    },
    ...roles.map((role) => ({
      title: <Tag color={role.color}>{role.title}</Tag>,
      dataIndex: role.key,
      key: role.key,
      align: "center",
      render: (val: boolean) => renderIcon(val),
    })),
  ];

  return (
    <Card style={{ borderRadius: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: "0 0 6px", fontWeight: 700 }}>
          Ma trận phân quyền (RBAC)
        </Title>
        <Text type="secondary">
          Chi tiết quyền hạn được cấp cho từng vai trò trên hệ thống.
        </Text>
      </div>

      <Table 
        dataSource={rbacData} 
        columns={columns} 
        pagination={false} 
        scroll={{ x: 1000 }}
        bordered
      />
    </Card>
  );
};

export default AdminRBAC;
