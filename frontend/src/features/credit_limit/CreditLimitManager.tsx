/**
 * SCUM-21: Khai báo hạn mức công nợ và số ngày nợ cho phép.
 *
 * Tính năng:
 * - Hiển thị danh sách đại lý kèm hạn mức công nợ hiện tại và nợ hiện tại.
 * - Form cập nhật hạn mức tiền (credit_limit) và số ngày nợ (max_debt_days).
 * - Bắt buộc nhập lý do thay đổi.
 * - Hiển thị lịch sử thay đổi hạn mức (credit_limit_logs).
 * - Phân quyền: Kế toán công nợ (Accountant) và Quản lý kinh doanh (Sales Manager).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Tag,
  Space,
  Typography,
  Tooltip,
  message,
  Progress,
  Alert,
  Spin,
  Empty,
} from "antd";
import {
  EditOutlined,
  HistoryOutlined,
  SearchOutlined,
  BankOutlined,
  CalendarOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { authenticatedFetch } from "../../services/sessionService";
import { DebtLimitForm } from "./DebtLimitForm";

const { Title, Text } = Typography;
const { TextArea } = Input;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface AgencyCreditInfo {
  id: number;
  code: string;
  name: string;
  phone?: string;
  credit_limit: number;
  max_debt_days: number;
  current_debt: number;
  warning_threshold_percent: number;
  usage_percent: number;
  is_locked?: boolean;
}

interface CreditLimitLog {
  id: number;
  agency_id: number;
  old_limit: number;
  new_limit: number;
  old_debt_days: number | null;
  new_debt_days: number | null;
  reason: string;
  changed_by: string | null;
  created_at: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const formatMoney = (value: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);

function getDebtStatusColor(usagePct: number): string {
  if (usagePct >= 100) return "#ef4444";
  if (usagePct >= 80) return "#f97316";
  if (usagePct >= 60) return "#eab308";
  return "#22c55e";
}

function getDebtStatusTag(usagePct: number, isLocked?: boolean) {
  if (isLocked)
    return <Tag icon={<ExclamationCircleOutlined />} color="error">Đã khóa</Tag>;
  if (usagePct >= 100)
    return <Tag icon={<ExclamationCircleOutlined />} color="red">Vượt hạn mức</Tag>;
  if (usagePct >= 80)
    return <Tag icon={<WarningOutlined />} color="orange">Cận hạn mức</Tag>;
  return <Tag icon={<CheckCircleOutlined />} color="green">Bình thường</Tag>;
}

// ─── Main Component ─────────────────────────────────────────────────────────────

const CreditLimitManager: React.FC = () => {
  const [agencies, setAgencies] = useState<AgencyCreditInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<AgencyCreditInfo | null>(null);

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<CreditLimitLog[]>([]);

  // ── Load danh sách đại lý ──

  const loadAgencies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/v1/customers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items: any[] = Array.isArray(json) ? json : json.data || json.items || [];

      const mapped: AgencyCreditInfo[] = items.map((c: any) => {
        const creditLimit = Number(c.credit_limit ?? c.creditLimit ?? c.debt_limit ?? c.max_debt_amount ?? 0);
        const currentDebt = Number(c.current_debt ?? c.currentDebt ?? 0);
        const maxDebtDays = Number(c.max_debt_days ?? c.max_due_days ?? c.maxDueDays ?? c.maxDebtDays ?? 0);
        const warningPct = Number(c.warning_threshold_percent ?? c.warning_threshold ?? 80);
        const usagePct =
          creditLimit > 0 ? Math.round((currentDebt / creditLimit) * 100 * 10) / 10 : 0;
        return {
          id: c.id,
          code: c.code ?? "-",
          name: c.name ?? "(Chưa có tên)",
          phone: c.phone,
          credit_limit: creditLimit,
          max_debt_days: maxDebtDays,
          current_debt: currentDebt,
          warning_threshold_percent: warningPct,
          usage_percent: usagePct,
          is_locked: c.is_locked ?? false,
        };
      });
      setAgencies(mapped);
    } catch (err) {
      console.error("Lỗi tải danh sách đại lý:", err);
      message.error("Không thể tải danh sách đại lý. Vui lòng thử lại!");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgencies();
  }, [loadAgencies]);

  // ── Mở modal cập nhật hạn mức (DebtLimitForm) ──

  const openEditModal = (agency: AgencyCreditInfo) => {
    setSelectedAgency(agency);
    setIsEditModalOpen(true);
  };

  // ── Mở modal lịch sử ──

  const openHistoryModal = async (agency: AgencyCreditInfo) => {
    setSelectedAgency(agency);
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${agency.id}/debt-limit/history?limit=50`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items: CreditLimitLog[] = Array.isArray(json.data) ? json.data : [];
      setHistoryData(items);
    } catch (err) {
      console.error("Lỗi tải lịch sử:", err);
      message.error("Không thể tải lịch sử thay đổi hạn mức.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Lọc danh sách ──

  const filtered = agencies.filter(
    (a) =>
      a.name.toLowerCase().includes(searchText.toLowerCase()) ||
      a.code.toLowerCase().includes(searchText.toLowerCase())
  );

  // ── Table columns ──

  const columns = [
    {
      title: "Mã / Tên đại lý",
      dataIndex: "name",
      key: "name",
      render: (_: any, record: AgencyCreditInfo) => (
        <div>
          <Text strong style={{ color: "#1e293b", fontSize: 14 }}>
            {record.name}
          </Text>
          <br />
          <Text style={{ color: "#94a3b8", fontSize: 12 }}>
            <BankOutlined style={{ marginRight: 4 }} />
            {record.code}
          </Text>
        </div>
      ),
    },
    {
      title: (
        <span>
          <DollarOutlined style={{ marginRight: 4 }} />
          Hạn mức công nợ
        </span>
      ),
      dataIndex: "credit_limit",
      key: "credit_limit",
      render: (value: number) => (
        <Text style={{ fontWeight: 600, color: "#1d4ed8" }}>
          {formatMoney(value)}
        </Text>
      ),
      sorter: (a: AgencyCreditInfo, b: AgencyCreditInfo) => a.credit_limit - b.credit_limit,
    },
    {
      title: (
        <span>
          <CalendarOutlined style={{ marginRight: 4 }} />
          Số ngày nợ tối đa
        </span>
      ),
      dataIndex: "max_debt_days",
      key: "max_debt_days",
      render: (value: number) =>
        value > 0 ? (
          <Tag color="blue">{value} ngày</Tag>
        ) : (
          <Tag color="default">Không giới hạn</Tag>
        ),
    },
    {
      title: "Nợ hiện tại",
      dataIndex: "current_debt",
      key: "current_debt",
      render: (value: number, record: AgencyCreditInfo) => (
        <div>
          <Text
            style={{
              fontWeight: 600,
              color:
                record.usage_percent >= 100
                  ? "#ef4444"
                  : record.usage_percent >= 80
                    ? "#f97316"
                    : "#374151",
            }}
          >
            {formatMoney(value)}
          </Text>
          {record.credit_limit > 0 && (
            <Progress
              percent={Math.min(record.usage_percent, 100)}
              size="small"
              strokeColor={getDebtStatusColor(record.usage_percent)}
              showInfo={false}
              style={{ marginTop: 4 }}
            />
          )}
          <Text style={{ fontSize: 11, color: "#94a3b8" }}>
            {record.usage_percent.toFixed(1)}% hạn mức
          </Text>
        </div>
      ),
      sorter: (a: AgencyCreditInfo, b: AgencyCreditInfo) => a.current_debt - b.current_debt,
    },
    {
      title: "Trạng thái",
      key: "status",
      render: (_: any, record: AgencyCreditInfo) =>
        getDebtStatusTag(record.usage_percent, record.is_locked),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 140,
      render: (_: any, record: AgencyCreditInfo) => (
        <Space>
          <Tooltip title="Cập nhật hạn mức công nợ">
            <Button
              id={`btn-edit-credit-${record.id}`}
              type="primary"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
              style={{ borderRadius: 6 }}
            >
              Sửa
            </Button>
          </Tooltip>
          <Tooltip title="Xem lịch sử thay đổi">
            <Button
              id={`btn-history-credit-${record.id}`}
              size="small"
              icon={<HistoryOutlined />}
              onClick={() => openHistoryModal(record)}
              style={{ borderRadius: 6 }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // ── History Table columns ──

  const historyColumns = [
    {
      title: "Thời gian",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string | null) => {
        if (!v) return "—";
        const dateStr = v.endsWith("Z") || v.includes("+") ? v : `${v}Z`;
        return dayjs(dateStr).format("HH:mm:ss DD/MM/YYYY");
      },
    },
    {
      title: "Hạn mức cũ",
      dataIndex: "old_limit",
      key: "old_limit",
      render: (v: number) => (
        <Text delete style={{ color: "#94a3b8" }}>
          {formatMoney(v)}
        </Text>
      ),
    },
    {
      title: "Hạn mức mới",
      dataIndex: "new_limit",
      key: "new_limit",
      render: (v: number) => (
        <Text strong style={{ color: "#1d4ed8" }}>
          {formatMoney(v)}
        </Text>
      ),
    },
    {
      title: "Ngày nợ cũ",
      dataIndex: "old_debt_days",
      key: "old_debt_days",
      render: (v: number | null) =>
        v != null ? <Tag>{v} ngày</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "Ngày nợ mới",
      dataIndex: "new_debt_days",
      key: "new_debt_days",
      render: (v: number | null) =>
        v != null ? (
          <Tag color="blue">{v} ngày</Tag>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "Lý do thay đổi",
      dataIndex: "reason",
      key: "reason",
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text>{v}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Người thực hiện",
      dataIndex: "changed_by",
      key: "changed_by",
      render: (v: string | null) => v || "—",
    },
  ];

  // ── Render ──

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 24,
          color: "#fff",
          boxShadow: "0 8px 32px rgba(29,78,216,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(255,255,255,0.15)",
              display: "grid",
              placeItems: "center",
              fontSize: 28,
              backdropFilter: "blur(8px)",
            }}
          >
            <BankOutlined />
          </div>
          <div>
            <Title level={3} style={{ color: "#fff", margin: 0, fontWeight: 800 }}>
              Quản lý Hạn mức Công nợ
            </Title>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14 }}>
              Khai báo hạn mức tiền và số ngày nợ tối đa cho đại lý
            </Text>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card
        style={{
          marginBottom: 16,
          borderRadius: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Input
            id="credit-limit-search"
            allowClear
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            placeholder="Tìm kiếm đại lý theo tên hoặc mã..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 400, borderRadius: 8 }}
          />
          <Button
            id="btn-reload-agencies"
            onClick={loadAgencies}
            loading={loading}
            style={{ borderRadius: 8 }}
          >
            Làm mới
          </Button>
          <div style={{ marginLeft: "auto" }}>
            <Text style={{ color: "#64748b", fontSize: 13 }}>
              <InfoCircleOutlined style={{ marginRight: 6 }} />
              Chỉ Kế toán công nợ và Quản lý kinh doanh mới được sửa hạn mức
            </Text>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Table
          id="credit-limit-table"
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: true }}
          locale={{
            emptyText: (
              <Empty
                description="Chưa có đại lý nào hoặc không tìm thấy kết quả"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ),
          }}
          rowClassName={(record) =>
            record.usage_percent >= 100
              ? "row-danger"
              : record.usage_percent >= 80
                ? "row-warning"
                : ""
          }
        />
      </Card>

      {/* ── Modal Cập nhật Hạn mức (DebtLimitForm) ── */}
      <DebtLimitForm
        open={isEditModalOpen}
        agency={selectedAgency}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={async () => {
          await loadAgencies();
          setIsEditModalOpen(false);
        }}
      />

      {/* ── History Modal ── */}
      <Modal
        wrapClassName="modal-credit-limit-history"
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <HistoryOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
                Lịch sử thay đổi hạn mức
              </div>
              {selectedAgency && (
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 400 }}>
                  {selectedAgency.name} ({selectedAgency.code})
                </div>
              )}
            </div>
          </div>
        }
        open={isHistoryModalOpen}
        onCancel={() => {
          setIsHistoryModalOpen(false);
          setHistoryData([]);
        }}
        width={900}
        footer={
          <Button
            id="btn-close-history"
            onClick={() => {
              setIsHistoryModalOpen(false);
              setHistoryData([]);
            }}
            style={{ borderRadius: 8 }}
          >
            Đóng
          </Button>
        }
        destroyOnClose
      >
        {historyLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" tip="Đang tải lịch sử..." />
          </div>
        ) : historyData.length === 0 ? (
          <Empty
            description="Chưa có lịch sử thay đổi hạn mức cho đại lý này"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <Table
            id="credit-limit-history-table"
            dataSource={historyData}
            columns={historyColumns}
            rowKey="id"
            pagination={{ pageSize: 10, showSizeChanger: false }}
            size="small"
            scroll={{ x: 800 }}
          />
        )}
      </Modal>

      {/* Inline styles for row highlight */}
      <style>{`
        .row-danger td { background-color: #fff1f2 !important; }
        .row-warning td { background-color: #fff7ed !important; }
        #credit-limit-table .ant-table-row:hover td { background-color: #eff6ff !important; }
      `}</style>
    </div>
  );
};

export default CreditLimitManager;
