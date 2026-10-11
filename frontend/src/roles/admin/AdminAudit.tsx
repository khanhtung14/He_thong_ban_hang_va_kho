import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Select,
  DatePicker,
  Button,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface AuditLog {
  id: number;
  actor_user_id: number;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_value: any;
  after_value: any;
  happened_at: string;
}

export const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<{ id: number; full_name: string }[]>([]);

  // Filters
  const [actorUserId, setActorUserId] = useState<number | undefined>(undefined);
  const [entityType, setEntityType] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);

  useEffect(() => {
    // Fetch users for the filter
    authenticatedFetch("/api/v1/admin/users?page_size=500")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUsers(data.items || []);
      })
      .catch(() => console.error("Could not fetch users"));
  }, []);

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (actorUserId) params.set("actor_user_id", String(actorUserId));
    if (entityType !== "ALL") params.set("entity_type", entityType);
    if (dateRange && dateRange[0]) params.set("start_at", dateRange[0].toISOString());
    if (dateRange && dateRange[1]) params.set("end_at", dateRange[1].toISOString());

    authenticatedFetch(`/api/v1/audit-logs?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setLogs(data || []))
      .catch(() => message.error("Không tải được nhật ký hệ thống."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
  }, [actorUserId, entityType, dateRange]);

  const columns: ColumnsType<AuditLog> = [
    {
      title: "THỜI GIAN",
      dataIndex: "happened_at",
      key: "time",
      width: 170,
      render: (val) => dayjs(val).format("DD/MM/YYYY HH:mm:ss"),
    },
    {
      title: "NGƯỜI THỰC HIỆN",
      dataIndex: "actor_name",
      key: "actor",
      width: 180,
      render: (name) => <div style={{ fontWeight: 600, color: "#1e293b" }}>{name || "Hệ thống"}</div>,
    },
    {
      title: "ĐỐI TƯỢNG",
      dataIndex: "entity_type",
      key: "entity",
      width: 150,
      render: (type) => {
        const map: Record<string, { label: string; color: string }> = {
          // Các đối tượng quản trị hệ thống
          user: { label: "Tài khoản", color: "purple" },
          role: { label: "Phân quyền", color: "geekblue" },
          auth: { label: "Xác thực", color: "cyan" },
          system: { label: "Hệ thống", color: "volcano" },
          // Các đối tượng kiểm toán dữ liệu vận hành
          inventory: { label: "Tồn kho", color: "blue" },
          price: { label: "Bảng giá", color: "orange" },
          credit_limit: { label: "Hạn mức", color: "magenta" },
          invoice: { label: "Hóa đơn", color: "green" },
          debt: { label: "Công nợ", color: "red" },
        };
        const config = map[type] || { label: type, color: "default" };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: "THAO TÁC",
      key: "action",
      render: (_, r) => (
        <div>
          <strong style={{ color: "#0f172a" }}>{r.action}</strong>
          {r.entity_id ? <span style={{ color: "#64748b" }}> ({r.entity_id})</span> : null}
        </div>
      ),
    },
    {
      title: "GIÁ TRỊ TRƯỚC",
      dataIndex: "before_value",
      key: "before",
      render: (val) => (
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: "6px 8px",
            borderRadius: 6,
            maxWidth: 220,
            maxHeight: 100,
            overflow: "auto",
          }}
        >
          {val ? JSON.stringify(val, null, 2) : "—"}
        </pre>
      ),
    },
    {
      title: "GIÁ TRỊ SAU",
      dataIndex: "after_value",
      key: "after",
      render: (val) => (
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            padding: "6px 8px",
            borderRadius: 6,
            maxWidth: 220,
            maxHeight: 100,
            overflow: "auto",
          }}
        >
          {val ? JSON.stringify(val, null, 2) : "—"}
        </pre>
      ),
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        border: "1px solid #e2e8f0",
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ margin: "0 0 6px", fontWeight: 700, color: "#0f172a" }}>
          Nhật ký hệ thống &amp; Kiểm toán vận hành
        </Title>
        <Text type="secondary">
          Theo dõi lịch sử thay đổi tài khoản, phân quyền và các biến động dữ liệu cốt lõi trên toàn hệ thống.
        </Text>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <Select
          allowClear
          placeholder="Lọc theo người thực hiện"
          value={actorUserId}
          onChange={(val) => setActorUserId(val)}
          style={{ width: 220 }}
          options={users.map((u) => ({ label: u.full_name, value: u.id }))}
        />
        <Select
          value={entityType}
          onChange={(val) => setEntityType(val)}
          style={{ width: 200 }}
          options={[
            { label: "Tất cả đối tượng", value: "ALL" },
            { label: "Tài khoản người dùng", value: "user" },
            { label: "Phân quyền & Vai trò", value: "role" },
            { label: "Đăng nhập & Xác thực", value: "auth" },
            { label: "Tồn kho", value: "inventory" },
            { label: "Bảng giá", value: "price" },
            { label: "Hạn mức công nợ", value: "credit_limit" },
            { label: "Công nợ", value: "debt" },
            { label: "Hóa đơn", value: "invoice" },
          ]}
        />
        <RangePicker
          showTime
          onChange={(dates) => setDateRange(dates as any)}
          style={{ borderRadius: 8 }}
        />
        <Button
          type="primary"
          onClick={fetchLogs}
          icon={<ReloadOutlined />}
          style={{ borderRadius: 8, backgroundColor: "#2563eb" }}
        >
          Làm mới
        </Button>
      </div>

      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 15, showTotal: (total) => `Tổng cộng ${total} bản ghi` }}
      />
    </Card>
  );
};

export default AdminAudit;