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
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  UserAddOutlined,
  SearchOutlined,
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../session";

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

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // State Modal Sửa & Khóa
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [lockUser, setLockUser] = useState<UserRow | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchUsers = () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: "10",
    });
    if (search.trim()) params.set("search", search.trim());
    if (roleFilter !== "ALL") params.set("role", roleFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);

    authenticatedFetch(`/api/v1/admin/users?${params}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUsers(data.items || []);
        setTotal(data.total || 0);
      })
      .catch(() => message.error("Không tải được danh sách tài khoản."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

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
        fetchUsers();
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
        fetchUsers();
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
        fetchUsers();
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
          <div style={{ fontSize: 12, color: "#64748b" }}>{r.username}</div>
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
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          href="/admin/users/create"
          style={{ backgroundColor: "#2563eb", borderRadius: 8 }}
        >
          Tạo tài khoản
        </Button>
      }
    >
      {/* Bộ lọc & Tìm kiếm */}
      <div
        style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}
      >
        <Input
          prefix={<SearchOutlined />}
          placeholder="Tìm theo tên, username, số điện thoại..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => {
            setPage(1);
            fetchUsers();
          }}
          style={{ width: 280, borderRadius: 8 }}
        />
        <Select
          value={roleFilter}
          onChange={(val) => {
            setRoleFilter(val);
            setPage(1);
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
            setPage(1);
          }}
          style={{ width: 170 }}
          options={[
            { label: "Mọi trạng thái", value: "ALL" },
            { label: "Đang hoạt động", value: "ACTIVE" },
            { label: "Đã khóa", value: "LOCKED" },
            { label: "Chờ kích hoạt", value: "PENDING_ACTIVATION" },
          ]}
        />
        <Button
          type="primary"
          onClick={() => {
            setPage(1);
            fetchUsers();
          }}
          style={{ borderRadius: 8 }}
        >
          Tìm kiếm
        </Button>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: (p) => setPage(p),
          showTotal: (t) => `Tổng cộng ${t} tài khoản`,
        }}
      />

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
          <Form.Item name="phone" label="Số điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select
              options={[
                { label: "Đang hoạt động", value: "ACTIVE" },
                { label: "Chờ kích hoạt", value: "PENDING_ACTIVATION" },
                { label: "Đã khóa", value: "LOCKED" },
              ]}
            />
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
    </Card>
  );
};

export default AdminUsers;
