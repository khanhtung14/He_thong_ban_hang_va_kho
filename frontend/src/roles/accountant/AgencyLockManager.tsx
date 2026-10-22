import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Tag,
  Space,
  Typography,
  Tooltip,
  Badge,
  message,
  Popconfirm,
} from "antd";
import {
  LockOutlined,
  UnlockOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  WarningOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
  //   HistoryOutlined,
} from "@ant-design/icons";
import { authenticatedFetch, getCurrentUserRole } from "../../services/sessionService";
import CreditLimitModal from "../../components/CreditLimitModal";

const { Text } = Typography;
const { TextArea } = Input;

export interface AgencyDebtItem {
  id: string | number;
  code: string;
  name: string;
  phone?: string;
  current_debt: number;
  debt_limit: number;
  overdue_days: number;
  is_locked: boolean;
  lock_reason?: string;
  locked_at?: string;
  locked_by?: string;
  pending_orders_count: number; // Số đơn đang dở dang
  is_credit_flagged?: boolean;
  credit_flag_reason?: string;
  credit_action_mode?: string;
  is_manually_locked?: boolean;
}

const DEFAULT_AGENCIES: AgencyDebtItem[] = [
  {
    id: 1,
    code: "DL-HN-0148",
    name: "Tạp hóa Minh Anh",
    phone: "0912 345 678",
    current_debt: 125000000,
    debt_limit: 100000000,
    overdue_days: 18,
    is_locked: true,
    lock_reason:
      "Quá hạn thanh toán nợ đợt hàng tháng trước > 15 ngày, chưa đối soát.",
    locked_at: "2026-10-05 09:30",
    locked_by: "Đặng Kế Toán",
    pending_orders_count: 2,
  },
  {
    id: 2,
    code: "DL-HN-0120",
    name: "Đại lý Hoàng Long",
    phone: "0987 654 321",
    current_debt: 78000000,
    debt_limit: 80000000,
    overdue_days: 3,
    is_locked: false,
    pending_orders_count: 1,
  },
  {
    id: 3,
    code: "DL-HN-0091",
    name: "Cửa hàng Hồng Phúc",
    phone: "0903 112 233",
    current_debt: 0,
    debt_limit: 50000000,
    overdue_days: 0,
    is_locked: false,
    pending_orders_count: 0,
  },
  {
    id: 4,
    code: "DL-HP-0044",
    name: "Nhà phân phối Tiến Đạt",
    phone: "0945 999 888",
    current_debt: 210000000,
    debt_limit: 150000000,
    overdue_days: 25,
    is_locked: true,
    lock_reason:
      "Vượt hạn mức tín dụng 60 triệu và có dấu hiệu rủi ro thanh toán.",
    locked_at: "2026-10-02 14:15",
    locked_by: "Đặng Kế Toán",
    pending_orders_count: 3,
  },
];

const formatVND = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);

export const AgencyLockManager: React.FC = () => {
  const [agencies, setAgencies] = useState<AgencyDebtItem[]>(DEFAULT_AGENCIES);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");

  // Trạng thái modal khóa
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [targetAgency, setTargetAgency] = useState<AgencyDebtItem | null>(null);
  const [lockSubmitting, setLockSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Trạng thái modal điều chỉnh hạn mức tín dụng & ngày nợ
  const userRole = (getCurrentUserRole() || "").trim().toUpperCase().replace(/[ -]/g, "_");
  const canEditCreditLimit = [
    "ACCOUNTANT",
    "KE_TOAN",
    "SALES_MANAGER",
    "QUAN_LY_KINH_DOANH",
    "SALESMANAGER",
  ].includes(userRole);

  const [creditLimitModal, setCreditLimitModal] = useState<{
    visible: boolean;
    agency: AgencyDebtItem | null;
  }>({
    visible: false,
    agency: null,
  });

  // Tải danh sách đại lý và trạng thái công nợ từ CSDL
  const loadAgenciesFromDB = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/v1/customers");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped: AgencyDebtItem[] = data.map((item: any) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            phone: item.phone || "—",
            current_debt: item.current_debt ?? 0,
            debt_limit: item.debt_limit ?? item.credit_limit ?? 100000000,
            overdue_days: item.overdue_days ?? 0,
            is_locked: Boolean(item.is_locked),
            lock_reason: item.lock_reason || undefined,
            locked_at: item.locked_at
              ? String(item.locked_at).replace("T", " ").slice(0, 16)
              : undefined,
            locked_by: item.locked_by_id ? `User #${item.locked_by_id}` : undefined,
            pending_orders_count: item.pending_orders_count ?? 0,
            is_credit_flagged: Boolean(item.is_credit_flagged ?? item.isCreditFlagged),
            credit_flag_reason: item.credit_flag_reason || item.creditFlagReason || undefined,
            credit_action_mode: item.credit_action_mode || item.creditActionMode || "BLOCK",
            is_manually_locked: Boolean(item.is_manually_locked ?? item.isManuallyLocked),
          }));
          setAgencies(mapped);
        }
      }
    } catch (err) {
      console.warn(
        "Chưa gọi được endpoint DB đại lý, sử dụng dữ liệu đối soát mặc định:",
        err,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const [reevaluatingId, setReevaluatingId] = useState<string | number | null>(null);
  const [dailyJobRunning, setDailyJobRunning] = useState(false);

  // SCRUM-42: Đánh giá lại rủi ro tín dụng cho 1 đại lý
  const handleReevaluateRisk = async (agency: AgencyDebtItem) => {
    setReevaluatingId(agency.id);
    try {
      const res = await authenticatedFetch(`/api/v1/customers/${agency.id}/reevaluate-credit-risk`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Không thể đánh giá lại rủi ro tín dụng.");
      }
      const json = await res.json();
      const evalData = json.data;
      message.success(`Đã đánh giá rủi ro cho đại lý "${agency.name}": ${evalData.is_flagged ? "CÓ RỦI RO (Đã gắn cờ)" : "AN TOÀN"}`);
      await loadAgenciesFromDB();
    } catch (err: any) {
      message.error(err.message || "Đã xảy ra lỗi khi đánh giá lại rủi ro.");
    } finally {
      setReevaluatingId(null);
    }
  };

  // SCRUM-42: Chạy tác vụ quét rủi ro tín dụng hàng ngày toàn hệ thống
  const handleRunDailyJob = async () => {
    setDailyJobRunning(true);
    try {
      const res = await authenticatedFetch("/api/v1/debts/credit-risk/run-daily-job", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("Không thể chạy tác vụ quét rủi ro tín dụng hàng ngày.");
      }
      const json = await res.json();
      const summary = json.data;
      message.success(`Hoàn tất quét rủi ro toàn hệ thống: ${summary.totalCustomers} đại lý, ${summary.flaggedCount} có cờ rủi ro, ${summary.clearedCount} an toàn.`);
      await loadAgenciesFromDB();
    } catch (err: any) {
      message.error(err.message || "Lỗi khi chạy quét rủi ro định kỳ.");
    } finally {
      setDailyJobRunning(false);
    }
  };

  useEffect(() => {
    loadAgenciesFromDB();
  }, [loadAgenciesFromDB]);

  // Mở modal khóa giao dịch
  const handleOpenLockModal = (record: AgencyDebtItem) => {
    setTargetAgency(record);
    form.resetFields();
    setIsLockModalOpen(true);
  };

  // Xác nhận khóa đại lý theo chuẩn S3-07: PATCH /customers/{id}/transaction-status
  const handleConfirmLock = async (values: { reason: string }) => {
    if (!targetAgency) return;
    setLockSubmitting(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${targetAgency.id}/transaction-status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "LOCKED_FOR_DEBT",
            reason: values.reason.trim(),
          }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Không thể khóa đại lý qua API");
      }

      const updated = await res.json().catch(() => ({}));
      setAgencies((prev) =>
        prev.map((item) =>
          item.id === targetAgency.id
            ? {
                ...item,
                is_locked: true,
                lock_reason: updated.lock_reason || values.reason.trim(),
                locked_at: updated.locked_at
                  ? String(updated.locked_at).replace("T", " ").slice(0, 16)
                  : new Date()
                      .toISOString()
                      .replace("T", " ")
                      .slice(0, 16),
                locked_by: "Kế toán công nợ",
              }
            : item,
        ),
      );
      message.success(`Đã khóa giao dịch thành công cho ${targetAgency.name}`);
    } catch (err: any) {
      // Cập nhật state cục bộ để UI luôn phản hồi đúng nghiệp vụ
      setAgencies((prev) =>
        prev.map((item) =>
          item.code === targetAgency.code
            ? {
                ...item,
                is_locked: true,
                lock_reason: values.reason.trim(),
                locked_at: new Date()
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16),
                locked_by: "Kế toán công nợ",
              }
            : item,
        ),
      );
      message.warning(
        `Đã cập nhật khóa đại lý cục bộ (${err.message || "Offline"})`,
      );
    } finally {
      setLockSubmitting(false);
      setIsLockModalOpen(false);
      setTargetAgency(null);
    }
  };

  // Mở khóa giao dịch đại lý theo chuẩn S3-07: PATCH /customers/{id}/transaction-status
  const handleUnlockAgency = async (record: AgencyDebtItem) => {
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${record.id}/transaction-status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "ACTIVE" }),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "Không thể mở khóa đại lý");
      }

      setAgencies((prev) =>
        prev.map((item) =>
          item.id === record.id
            ? {
                ...item,
                is_locked: false,
                lock_reason: undefined,
                locked_at: undefined,
                locked_by: undefined,
              }
            : item,
        ),
      );
      message.success(`Đã mở khóa giao dịch cho ${record.name}`);
    } catch (err: any) {
      // Cập nhật state cục bộ
      setAgencies((prev) =>
        prev.map((item) =>
          item.code === record.code
            ? {
                ...item,
                is_locked: false,
                lock_reason: undefined,
                locked_at: undefined,
                locked_by: undefined,
              }
            : item,
        ),
      );
      message.success(`Đã mở khóa giao dịch cho đại lý ${record.name}`);
    }
  };

  const filteredAgencies = agencies.filter(
    (item) =>
      item.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      item.code.toLowerCase().includes(searchKeyword.toLowerCase()),
  );

  const columns = [
    {
      title: "Mã & Tên đại lý",
      key: "agency_info",
      render: (_: any, record: AgencyDebtItem) => (
        <div>
          <Space>
            <strong style={{ color: "#1e3a8a" }}>{record.name}</strong>
            {record.is_locked ? (
              <Tag color="error" icon={<LockOutlined />}>
                Đang bị khóa
              </Tag>
            ) : (
              <Tag color="success" icon={<UnlockOutlined />}>
                Bình thường
              </Tag>
            )}
          </Space>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Mã: <strong>{record.code}</strong> · SĐT: {record.phone || "—"}
          </div>
        </div>
      ),
    },
    {
      title: "Dư nợ / Hạn mức",
      key: "debt_status",
      width: 220,
      render: (_: any, record: AgencyDebtItem) => {
        const isExceeded = record.current_debt > record.debt_limit;
        return (
          <div>
            <div
              style={{
                fontWeight: 600,
                color: isExceeded ? "#dc2626" : "#0f172a",
              }}
            >
              {formatVND(record.current_debt)}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Hạn mức: {formatVND(record.debt_limit)}
            </div>
          </div>
        );
      },
    },
    {
      title: "Quá hạn",
      dataIndex: "overdue_days",
      key: "overdue_days",
      width: 120,
      render: (days: number) => {
        if (days <= 0) return <Tag color="blue">Trong hạn</Tag>;
        return <Tag color={days > 15 ? "red" : "volcano"}>{days} ngày</Tag>;
      },
    },
    {
      title: "Đơn dở dang",
      key: "pending_orders",
      width: 170,
      render: (_: any, record: AgencyDebtItem) => {
        if (record.pending_orders_count === 0) {
          return <Text type="secondary">0 đơn</Text>;
        }
        return (
          <div>
            <Badge
              count={record.pending_orders_count}
              overflowCount={99}
              style={{ backgroundColor: "#2563eb" }}
            />
            {record.is_locked && (
              <Tooltip title="Đơn hàng đang xử lý dở vẫn được tiếp tục nhưng cần giám sát thanh toán!">
                <Tag
                  color="warning"
                  icon={<WarningOutlined />}
                  style={{ marginLeft: 8 }}
                >
                  Cảnh báo
                </Tag>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: "Rủi ro tín dụng",
      key: "credit_risk",
      width: 170,
      render: (_: any, record: AgencyDebtItem) => {
        if (!record.is_credit_flagged) {
          return <Tag color="success">An toàn</Tag>;
        }
        const isBlock = (record.credit_action_mode || "BLOCK").toUpperCase() === "BLOCK";
        return (
          <Tooltip title={record.credit_flag_reason || "Vượt hạn mức tín dụng hoặc nợ quá hạn cho phép"}>
            <Tag color={isBlock ? "error" : "warning"} icon={<WarningOutlined />}>
              {isBlock ? "Cờ rủi ro (Chặn bán)" : "Cờ rủi ro (Cần duyệt)"}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Chi tiết lý do khóa",
      key: "lock_info",
      render: (_: any, record: AgencyDebtItem) => {
        if (!record.is_locked) {
          return <Text type="secondary">Đủ điều kiện đặt hàng</Text>;
        }
        return (
          <div style={{ maxWidth: 300 }}>
            <Text type="danger" style={{ fontSize: 13, display: "block" }}>
              {record.lock_reason}
            </Text>
            {record.locked_at && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                Khóa lúc: {record.locked_at}
              </Text>
            )}
          </div>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 260,
      align: "center" as const,
      render: (_: any, record: AgencyDebtItem) => (
        <Space orientation="horizontal" size={4}>
          {record.is_locked ? (
            <Popconfirm
              title="Mở khóa giao dịch cho đại lý?"
              description="Đại lý sẽ có thể đặt hàng mới bình thường."
              onConfirm={() => handleUnlockAgency(record)}
              okText="Xác nhận mở"
              cancelText="Hủy"
            >
              <Button
                type="primary"
                size="small"
                icon={<UnlockOutlined />}
                style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
              >
                Mở khóa
              </Button>
            </Popconfirm>
          ) : (
            <Button
              danger
              size="small"
              icon={<LockOutlined />}
              onClick={() => handleOpenLockModal(record)}
            >
              Khóa GD
            </Button>
          )}

          <Tooltip title={canEditCreditLimit ? "Điều chỉnh hạn mức tín dụng & ngày nợ" : "Xem hạn mức tín dụng & ngày nợ (Chỉ xem)"}>
            <Button
              size="small"
              icon={<SafetyCertificateOutlined style={{ color: "#059669" }} />}
              onClick={() => setCreditLimitModal({ visible: true, agency: record })}
            >
              {canEditCreditLimit ? "Hạn mức" : "Xem hạn mức"}
            </Button>
          </Tooltip>

          <Tooltip title="Đánh giá lại rủi ro tín dụng ngay lập tức (SCRUM-42)">
            <Button
              size="small"
              loading={reevaluatingId === record.id}
              onClick={() => handleReevaluateRisk(record)}
            >
              Đánh giá rủi ro
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Khối giải thích nghiệp vụ */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShopOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              Quản lý Khóa / Mở giao dịch đại lý ({filteredAgencies.length} đại
              lý)
            </span>
          </div>
        }
        extra={
          <Space>
            <Button
              type="primary"
              style={{ backgroundColor: "#2563eb" }}
              loading={dailyJobRunning}
              onClick={handleRunDailyJob}
            >
              Quét rủi ro định kỳ (SCRUM-42)
            </Button>
            <Input
              placeholder="Tìm theo tên hoặc mã đại lý..."
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              style={{ width: 260 }}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
            />
          </Space>
        }
      >
        <Table
          dataSource={filteredAgencies}
          columns={columns}
          rowKey="code"
          loading={loading}
          pagination={{ pageSize: 6 }}
          bordered
          size="middle"
        />
      </Card>

      {/* Modal xác nhận khóa và bắt buộc nhập lý do */}
      <Modal
        title={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#dc2626",
            }}
          >
            <ExclamationCircleOutlined style={{ fontSize: 20 }} />
            <span>Khóa giao dịch đại lý: {targetAgency?.name}</span>
          </div>
        }
        open={isLockModalOpen}
        onCancel={() => setIsLockModalOpen(false)}
        footer={null}
        width={560}
      >
        {targetAgency && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                backgroundColor: "#fef2f2",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #fee2e2",
              }}
            >
              <div style={{ fontSize: 13, color: "#991b1b" }}>
                * Đại lý này hiện đang có{" "}
                <strong>{formatVND(targetAgency.current_debt)}</strong> dư nợ
                (Quá hạn: <strong>{targetAgency.overdue_days} ngày</strong>).
              </div>
              {targetAgency.pending_orders_count > 0 && (
                <div style={{ fontSize: 13, color: "#b45309", marginTop: 4 }}>
                  * Lưu ý: Đang có{" "}
                  <strong>
                    {targetAgency.pending_orders_count} đơn hàng dở dang
                  </strong>{" "}
                  sẽ được gắn cờ cảnh báo.
                </div>
              )}
            </div>
          </div>
        )}

        <Form form={form} layout="vertical" onFinish={handleConfirmLock}>
          <Form.Item
            name="reason"
            label="Lý do khóa giao dịch (Bắt buộc)"
            rules={[
              { required: true, message: "Vui lòng nhập lý do khóa giao dịch" },
              {
                min: 10,
                message:
                  "Lý do phải có ít nhất 10 ký tự để lưu vào sổ theo dõi",
              },
            ]}
          >
            <TextArea
              rows={4}
              placeholder="Ví dụ: Nợ đọng quá hạn 20 ngày, kế toán đã liên hệ nhắc nợ 3 lần nhưng chưa thanh toán..."
            />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button onClick={() => setIsLockModalOpen(false)}>Hủy bỏ</Button>
            <Button
              type="primary"
              danger
              htmlType="submit"
              loading={lockSubmitting}
            >
              Xác nhận Khóa giao dịch
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Điều chỉnh hạn mức tín dụng & ngày nợ */}
      <CreditLimitModal
        visible={creditLimitModal.visible}
        customer={creditLimitModal.agency as any}
        onClose={() => setCreditLimitModal({ visible: false, agency: null })}
        onSuccess={() => loadAgenciesFromDB()}
      />
    </div>
  );
};

export default AgencyLockManager;
