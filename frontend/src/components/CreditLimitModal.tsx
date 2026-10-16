import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Table,
  Tag,
  Typography,
  Space,
  Row,
  Col,
  Card,
  Divider,
  message,
  Empty,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DollarOutlined,
  CalendarOutlined,
  HistoryOutlined,
  UserOutlined,
  ArrowRightOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { authenticatedFetch } from "../services/sessionService";

const { Text, Title } = Typography;
const { TextArea } = Input;

export interface CreditLimitCustomer {
  id: number | string;
  code?: string;
  name: string;
  credit_limit?: number;
  max_due_days?: number;
  max_debt_days?: number;
  debt_limit?: number;
  warning_threshold?: number;
  warning_threshold_percent?: number;
}

export interface CreditLimitLogItem {
  id: number;
  customer_id: number;
  old_credit_limit: number;
  new_credit_limit: number;
  old_max_debt_days: number;
  new_max_debt_days: number;
  reason: string;
  changed_by_user_id?: number | null;
  changed_by_name?: string | null;
  created_at?: string;
}

export interface CreditLimitModalProps {
  visible: boolean;
  customer: CreditLimitCustomer | null;
  onClose: () => void;
  onSuccess?: (updatedData: any) => void;
}

export const CreditLimitModal: React.FC<CreditLimitModalProps> = ({
  visible,
  customer,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [logs, setLogs] = useState<CreditLimitLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Lấy các giá trị hiện tại của đại lý
  const currentCreditLimit =
    customer?.credit_limit ?? customer?.debt_limit ?? 0;
  const currentMaxDebtDays =
    customer?.max_debt_days ?? customer?.max_due_days ?? 30;

  // Lấy danh sách lịch sử điều chỉnh hạn mức từ API
  const fetchLogs = useCallback(async (customerId: number | string) => {
    setLoadingLogs(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${customerId}/credit-limit-logs`,
      );
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setLogs(list);
      } else {
        setLogs([]);
      }
    } catch {
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // Khởi tạo form và gọi API lịch sử mỗi khi modal mở
  useEffect(() => {
    if (visible && customer) {
      form.setFieldsValue({
        new_credit_limit: currentCreditLimit,
        new_max_debt_days: currentMaxDebtDays,
        reason: "",
      });
      fetchLogs(customer.id);
    } else {
      form.resetFields();
      setLogs([]);
    }
  }, [visible, customer, currentCreditLimit, currentMaxDebtDays, form, fetchLogs]);

  // Xử lý gửi form cập nhật hạn mức
  const handleFormSubmit = async () => {
    if (!customer) return;
    try {
      const values = await form.validateFields();
      const newCredit = Number(values.new_credit_limit);
      const newDays = Number(values.new_max_debt_days ?? 0);
      const currentCredit = Number(currentCreditLimit ?? 0);
      const currentDays = Number(currentMaxDebtDays ?? 0);

      if (newCredit === currentCredit && newDays === currentDays) {
        message.warning("Hạn mức tiền hoặc số ngày nợ mới phải khác với giá trị hiện tại!");
        return;
      }

      setSubmitting(true);

      const payload = {
        new_credit_limit: newCredit,
        new_max_debt_days: newDays,
        credit_limit: newCredit,
        max_debt_days: newDays,
        max_due_days: newDays,
        max_debt_amount: newCredit,
        reason: values.reason.trim(),
      };

      const res = await authenticatedFetch(
        `/api/v1/customers/${customer.id}/credit-limit`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.detail || "Không thể cập nhật hạn mức công nợ.",
        );
      }

      const resData = await res.json();
      message.success(
        `Điều chỉnh hạn mức công nợ cho đại lý "${customer.name}" thành công!`,
      );

      if (onSuccess) {
        onSuccess(resData.data || resData);
      }
      onClose();
    } catch (err: any) {
      if (err.errorFields) return; // Antd validation error
      message.error(err.message || "Đã xảy ra lỗi khi lưu hạn mức.");
    } finally {
      setSubmitting(false);
    }
  };

  // Cấu hình bảng lịch sử điều chỉnh
  const logColumns: ColumnsType<CreditLimitLogItem> = [
    {
      title: "Thời gian",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (val: string) => {
        if (!val) return "—";
        const dateStr = val.endsWith("Z") || val.includes("+") ? val : `${val}Z`;
        return (
          <Text style={{ fontSize: 12 }}>
            {dayjs(dateStr).format("HH:mm:ss DD/MM/YYYY")}
          </Text>
        );
      },
    },
    {
      title: "Người thực hiện",
      dataIndex: "changed_by_name",
      key: "changed_by_name",
      width: 150,
      render: (name: string) => (
        <Space size={4}>
          <UserOutlined style={{ color: "#64748b", fontSize: 12 }} />
          <Text strong style={{ fontSize: 13, color: "#334155" }}>
            {name || "Hệ thống"}
          </Text>
        </Space>
      ),
    },
    {
      title: "Hạn mức tiền (VND)",
      key: "credit_limit_change",
      width: 220,
      render: (_, record) => (
        <Space size={6} align="center">
          <Text type="secondary" style={{ fontSize: 12, textDecoration: "line-through" }}>
            {record.old_credit_limit.toLocaleString("vi-VN")} ₫
          </Text>
          <ArrowRightOutlined style={{ fontSize: 10, color: "#94a3b8" }} />
          <Text strong style={{ color: "#059669", fontSize: 13 }}>
            {record.new_credit_limit.toLocaleString("vi-VN")} ₫
          </Text>
        </Space>
      ),
    },
    {
      title: "Số ngày nợ",
      key: "debt_days_change",
      width: 140,
      render: (_, record) => (
        <Space size={4} align="center">
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.old_max_debt_days}d
          </Text>
          <ArrowRightOutlined style={{ fontSize: 10, color: "#94a3b8" }} />
          <Tag color="blue" style={{ borderRadius: 4, fontWeight: 600 }}>
            {record.new_max_debt_days} ngày
          </Tag>
        </Space>
      ),
    },
    {
      title: "Lý do thay đổi",
      dataIndex: "reason",
      key: "reason",
      ellipsis: { showTitle: false },
      render: (reason: string) => (
        <Tooltip placement="topLeft" title={reason}>
          <Text style={{ fontSize: 13, color: "#475569" }}>{reason}</Text>
        </Tooltip>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space align="center" size={8}>
          <SafetyCertificateOutlined style={{ color: "#0284c7", fontSize: 20 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
              Điều chỉnh hạn mức tín dụng & ngày nợ
            </div>
            {customer && (
              <div style={{ fontSize: 12, fontWeight: 400, color: "#64748b" }}>
                Đại lý: <b style={{ color: "#1e293b" }}>{customer.name}</b>{" "}
                {customer.code && (
                  <Tag color="blue" style={{ borderRadius: 4, margin: "0 4px" }}>
                    {customer.code}
                  </Tag>
                )}
              </div>
            )}
          </div>
        </Space>
      }
      open={visible}
      onOk={handleFormSubmit}
      onCancel={onClose}
      confirmLoading={submitting}
      okText="Lưu thay đổi"
      cancelText="Đóng"
      width={960}
      centered
      destroyOnClose
      style={{ maxWidth: "calc(100vw - 32px)" }}
    >
      {/* Thẻ hiển thị hạn mức hiện tại */}
      <Card
        size="small"
        bordered={false}
        style={{
          background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
          borderRadius: 8,
          marginBottom: 10,
          border: "1px solid #bae6fd",
        }}
        styles={{ body: { padding: "8px 16px" } }}
      >
        <Row gutter={[16, 4]} align="middle">
          <Col span={12}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              <DollarOutlined style={{ marginRight: 6, color: "#059669" }} />
              Hạn mức nợ tối đa hiện tại:
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#047857" }}>
              {currentCreditLimit.toLocaleString("vi-VN")} ₫
            </div>
          </Col>
          <Col span={12}>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              <CalendarOutlined style={{ marginRight: 6, color: "#0284c7" }} />
              Số ngày nợ cho phép hiện tại:
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0369a1" }}>
              {currentMaxDebtDays} ngày
            </div>
          </Col>
        </Row>
      </Card>

      {/* Form cập nhật hạn mức */}
      <Form form={form} layout="vertical" requiredMark="optional">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              style={{ marginBottom: 10 }}
              label={
                <span style={{ fontWeight: 600 }}>
                  Hạn mức tiền tối đa mới (VND) <span style={{ color: "#ef4444" }}>*</span>
                </span>
              }
              name="new_credit_limit"
              rules={[
                { required: true, message: "Vui lòng nhập hạn mức tiền tối đa mới!" },
                {
                  type: "number",
                  min: 0,
                  message: "Giá trị không được nhỏ hơn 0!",
                },
              ]}
            >
              <InputNumber
                min={0}
                style={{ width: "100%" }}
                formatter={(value) =>
                  `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                }
                parser={
                  ((value: string | undefined) => {
                    if (value === "" || value === undefined || value === null) return undefined as any;
                    const parsed = Number(value.replace(/\$\s?|(,*)/g, ""));
                    return isNaN(parsed) ? (undefined as any) : parsed;
                  }) as any
                }
                addonAfter="₫"
                placeholder="Ví dụ: 100,000,000"
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              style={{ marginBottom: 10 }}
              label={
                <span style={{ fontWeight: 600 }}>
                  Số ngày nợ tối đa mới (Ngày) <span style={{ color: "#ef4444" }}>*</span>
                </span>
              }
              name="new_max_debt_days"
              rules={[
                { required: true, message: "Vui lòng nhập số ngày nợ tối đa mới!" },
                {
                  type: "number",
                  min: 0,
                  max: 365,
                  message: "Giá trị không được nhỏ hơn 0!",
                },
              ]}
            >
              <InputNumber
                min={0}
                max={365}
                style={{ width: "100%" }}
                addonAfter="ngày"
                placeholder="Ví dụ: 30"
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          style={{ marginBottom: 8 }}
          label={
            <span style={{ fontWeight: 600 }}>
              Lý do thay đổi <span style={{ color: "#ef4444" }}>*</span>
            </span>
          }
          name="reason"
          rules={[
            {
              required: true,
              message: "Vui lòng nhập lý do điều chỉnh hạn mức!",
            },
            {
              min: 3,
              message: "Lý do điều chỉnh cần ít nhất 3 ký tự!",
            },
          ]}
        >
          <TextArea
            rows={2}
            placeholder="Nhập lý do thay đổi hạn mức tín dụng hoặc ngày nợ (Bắt buộc để lưu lịch sử kiểm toán...)"
            maxLength={500}
            showCount
          />
        </Form.Item>
      </Form>

      <Divider style={{ margin: "10px 0 10px 0" }} />

      {/* Lịch sử điều chỉnh hạn mức */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Space size={6}>
            <HistoryOutlined style={{ color: "#0284c7", fontSize: 15 }} />
            <Text strong style={{ fontSize: 14 }}>
              Lịch sử điều chỉnh hạn mức
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tổng cộng: {logs.length} lần điều chỉnh
          </Text>
        </div>

        <Table
          columns={logColumns}
          dataSource={logs}
          rowKey="id"
          size="small"
          loading={loadingLogs}
          pagination={false}
          scroll={{ y: 190, x: 750 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có lịch sử điều chỉnh hạn mức nào"
                style={{ margin: "12px 0" }}
              />
            ),
          }}
        />
      </div>
    </Modal>
  );
};

export default CreditLimitModal;
