import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  message,
  Popconfirm,
  Typography,
  Pagination,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UserAddOutlined,
  SearchOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";
import UserExcelImportModal from "./UserExcelImportModal";

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  email?: string;
  phone?: string | null;
  status: string;
  roles: Array<string | { code: string; name: string }>;
  assigned_dealers_count?: number;
}

export interface AdminUsersProps {
  onNavigateToImport?: () => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({ onNavigateToImport }) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // State Modal Nhập Excel
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // State Modal Sửa & Khóa
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [lockUser, setLockUser] = useState<UserRow | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [form] = Form.useForm();

  const { Text } = Typography;

  const fetchUsers = (
    targetPage = page,
    currentSearch = search,
    currentRole = roleFilter,
    currentStatus = statusFilter
  ) => {
    setLoading(true);
    const limit = 20;
    const params = new URLSearchParams({
      page: String(targetPage),
      page_size: String(limit),
      limit: String(limit),
    });
    if (currentSearch.trim()) params.set("search", currentSearch.trim());
    if (currentRole !== "ALL") params.set("role", currentRole);
    if (currentStatus !== "ALL") params.set("status", currentStatus);

    authenticatedFetch(`/api/v1/admin/users?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUsers(data.items || []);
        setTotal(data.total || 0);
        setPage(targetPage);
      })
      .catch(() => message.error("Không tải được danh sách tài khoản."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers(1);
  }, []);

  const handleSearch = () => {
    fetchUsers(1, search, roleFilter, statusFilter);
  };

  const handleResetFilter = () => {
    setSearch("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    fetchUsers(1, "", "ALL", "ALL");
  };

  const handleEditSubmit = async (values: any) => {
    if (!editUser) return;
    setActionLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/admin/users/${editUser.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      if (res.ok) {
        message.success("Cập nhật tài khoản thành công!");
        setEditUser(null);
        fetchUsers(page);
      } else {
        message.error("Lỗi cập nhật tài khoản.");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleLockSubmit = async () => {
    if (!lockUser) return;
    setActionLoading(true);
    try {
      const res = await authenticatedFetch("/api/users/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: String(lockUser.id),
          reason: lockReason,
        }),
      });
      if (res.ok) {
        message.success("Đã khóa tài khoản thành công!");
        setLockUser(null);
        setLockReason("");
        fetchUsers(page);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlock = async (user: UserRow) => {
    try {
      const res = await authenticatedFetch(`/api/users/unlock/${user.id}`, {
        method: "POST",
      });
      if (res.ok) {
        message.success(`Đã mở khóa tài khoản ${user.username}`);
        fetchUsers(page);
      }
    } catch {
      message.error("Không thể mở khóa tài khoản.");
    }
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: "NGƯỜI DÙNG",
      key: "user",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#0f172a" }}>{r.full_name}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            @{r.username} {r.email && <span style={{ color: "#2563eb" }}>· {r.email}</span>}
          </div>
        </div>
      ),
    },
    {
      title: "VAI TRÒ",
      key: "roles",
      render: (_, r) =>
        r.roles
          ?.map((x) => (typeof x === "string" ? x : x.name || x.code))
          .join(", ") || "—",
    },
    {
      title: "TRẠNG THÁI",
      dataIndex: "status",
      key: "status",
      render: (status: string) => (
        <Tag color={status === "ACTIVE" ? "green" : "red"}>
          {status === "ACTIVE" ? "Hoạt động" : status}
        </Tag>
      ),
    },
    {
      title: "ĐẠI LÝ PHỤ TRÁCH",
      dataIndex: "assigned_dealers_count",
      key: "dealers",
      render: (count) => count ?? "—",
    },
    {
      title: "THAO TÁC",
      key: "actions",
      render: (_, r) => (
        <Space size={6}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditUser(r);
              form.setFieldsValue({
                full_name: r.full_name,
                email: r.email,
                phone: r.phone,
                status: r.status,
              });
            }}
          >
            Sửa
          </Button>
          {r.status === "ACTIVE" ? (
            <Button
              size="small"
              danger
              icon={<LockOutlined />}
              onClick={() => setLockUser(r)}
            >
              Khóa
            </Button>
          ) : (
            <Popconfirm
              title={`Mở khóa tài khoản ${r.username}?`}
              onConfirm={() => handleUnlock(r)}
            >
              <Button
                size="small"
                type="primary"
                ghost
                icon={<UnlockOutlined />}
              >
                Mở
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      style={{ borderRadius: 16 }}
      title={
        <div style={{ padding: "6px 0" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            Tài khoản người dùng
          </div>
          <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
            Tìm kiếm, cập nhật thông tin, vai trò và trạng thái tài khoản.
          </div>
        </div>
      }
      extra={
        <Space>
          <Button
            icon={<FileExcelOutlined />}
            onClick={() => {
              if (onNavigateToImport) {
                onNavigateToImport();
              } else {
                window.location.href = "/admin/users/import";
              }
            }}
            style={{ borderRadius: 8 }}
          >
            Nhập người dùng từ Excel
          </Button>
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            href="/admin/users/create"
            style={{ backgroundColor: "#2563eb", borderRadius: 8 }}
          >
            Tạo tài khoản
          </Button>
        </Space>
      }
    >
      {/* Bộ lọc & Tìm kiếm */}
      <div
        style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}
      >
        <Input
          prefix={<SearchOutlined />}
          placeholder="Tìm theo tên, username, email, số điện thoại..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={handleSearch}
          style={{ width: 320, borderRadius: 8 }}
        />
        <Select
          value={roleFilter}
          onChange={(val) => {
            setRoleFilter(val);
            fetchUsers(1, search, val, statusFilter);
          }}
          style={{ width: 180 }}
          options={[
            { label: "Mọi vai trò", value: "ALL" },
            { label: "Quản trị hệ thống", value: "ADMIN" },
            { label: "Quản lý kinh doanh", value: "SALES_MANAGER" },
            { label: "Nhân viên kinh doanh", value: "SALES_REP" },
            { label: "Quản lý kho", value: "WH_MANAGER" },
            { label: "Nhân viên kho", value: "WAREHOUSE" },
            { label: "Kế toán", value: "ACCOUNTANT" },
            { label: "Đại lý", value: "CUSTOMER" },
          ]}
        />
        <Select
          value={statusFilter}
          onChange={(val) => {
            setStatusFilter(val);
            fetchUsers(1, search, roleFilter, val);
          }}
          style={{ width: 170 }}
          options={[
            { label: "Mọi trạng thái", value: "ALL" },
            { label: "Đang hoạt động", value: "ACTIVE" },
            { label: "Đã khóa", value: "LOCKED" },
            { label: "Chờ kích hoạt", value: "PENDING_ACTIVATION" },
          ]}
        />
        <Space>
          <Button
            type="primary"
            onClick={handleSearch}
            style={{ borderRadius: 8 }}
          >
            Tìm kiếm
          </Button>
          <Button
            onClick={handleResetFilter}
            style={{ borderRadius: 8 }}
          >
            Đặt lại
          </Button>
        </Space>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        bordered
        size="middle"
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Text type="secondary">
          Hiển thị <strong>{users.length}</strong> tài khoản trên trang này | Tổng cộng:{" "}
          <strong>{total}</strong> tài khoản ({Math.ceil(total / 20) || 1} trang)
        </Text>
        <Pagination
          current={page}
          pageSize={20}
          total={total}
          showSizeChanger={false}
          onChange={(p) => {
            fetchUsers(p, search, roleFilter, statusFilter);
          }}
        />
      </div>

      {/* Modal Cập nhật User */}
      <Modal
        title={`Cập nhật: ${editUser?.username}`}
        open={Boolean(editUser)}
        onCancel={() => setEditUser(null)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleEditSubmit}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="full_name"
            label="Họ và tên"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: "email" }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Số điện thoại"
            rules={[
              {
                pattern: /^0[1235789][0-9]{8}$/,
                message: "Số điện thoại gồm 10 chữ số với đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02)!",
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Trạng thái">
            <Tag
              color={
                editUser?.status === "ACTIVE"
                  ? "green"
                  : editUser?.status === "LOCKED"
                    ? "red"
                    : "orange"
              }
              style={{ fontSize: 13, padding: "4px 8px" }}
            >
              {editUser?.status === "ACTIVE"
                ? "Hoạt động"
                : editUser?.status === "LOCKED"
                  ? "Đã khóa"
                  : "Chờ kích hoạt"}
            </Tag>
          </Form.Item>
          <div style={{ textAlign: "right", marginTop: 20 }}>
            <Space>
              <Button onClick={() => setEditUser(null)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={actionLoading}
                style={{ backgroundColor: "#2563eb" }}
              >
                Lưu thay đổi
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Modal Khóa User */}
      <Modal
        title={`Khóa tài khoản ${lockUser?.username}`}
        open={Boolean(lockUser)}
        onCancel={() => setLockUser(null)}
        onOk={handleLockSubmit}
        confirmLoading={actionLoading}
        okText="Xác nhận khóa"
        okButtonProps={{ danger: true }}
      >
        <p>Phiên đăng nhập của tài khoản này sẽ bị thu hồi ngay lập tức.</p>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do khóa (bắt buộc)..."
          value={lockReason}
          onChange={(e) => setLockReason(e.target.value)}
        />
      </Modal>

      {/* Modal Nhập danh sách người dùng từ Excel */}
      <UserExcelImportModal
        open={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => fetchUsers()}
      />
    </Card>
  );
};

export default AdminUsers;
