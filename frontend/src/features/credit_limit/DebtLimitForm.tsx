import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Button,
  Alert,
  Space,
  Typography,
  message,
  Progress,
  Card,
  Tooltip,
} from "antd";
import {
  BankOutlined,
  DollarOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  FileTextOutlined,
  WarningOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export interface AgencyCreditData {
  id: number;
  code: string;
  name: string;
  phone?: string;
  credit_limit: number;
  max_debt_days: number;
  current_debt: number;
  warning_threshold_percent?: number;
  usage_percent?: number;
  is_locked?: boolean;
}

export interface DebtLimitFormProps {
  open: boolean;
  agency: AgencyCreditData | null;
  onClose: () => void;
  onSuccess: (updatedData?: any) => void;
}

const formatCurrency = (val: number): string =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val);

export const updateAgencyCreditLimit = async (
  agencyId: number,
  values: {
    credit_limit: number;
    max_debt_days: number;
    reason: string;
  }
) => {
  const payload = {
    credit_limit: values.credit_limit,
    max_debt_amount: values.credit_limit,
    max_debt_days: values.max_debt_days,
    max_due_days: values.max_debt_days,
    new_credit_limit: values.credit_limit,
    newCreditLimit: values.credit_limit,
    new_max_debt_days: values.max_debt_days,
    newMaxDebtDays: values.max_debt_days,
    reason: values.reason.trim(),
  };

  // Ưu tiên endpoint PUT /api/v1/customers/{id}/credit-limit (API Spec S3-05)
  // và fallback qua /api/agencies/{id}/credit-limit nếu cần
  const res = await authenticatedFetch(
    `/api/v1/customers/${agencyId}/credit-limit`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const errorMessage =
      errorData.detail ||
      errorData.message ||
      `Cập nhật hạn mức thất bại (HTTP ${res.status})`;
    throw new Error(errorMessage);
  }

  return await res.json();
};

export const DebtLimitForm: React.FC<DebtLimitFormProps> = ({
  open,
  agency,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Khi modal mở hoặc agency thay đổi, điền giá trị hiện tại vào form
  useEffect(() => {
    if (open && agency) {
      form.setFieldsValue({
        credit_limit: agency.credit_limit,
        max_debt_days: agency.max_debt_days,
        reason: "",
      });
    } else {
      form.resetFields();
    }
  }, [open, agency, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!agency) return;

      // Validate lý do bắt buộc không được chỉ toàn khoảng trắng
      const cleanReason = (values.reason || "").trim();
      if (!cleanReason) {
        form.setFields([
          {
            name: "reason",
            errors: ["Vui lòng nhập lý do thay đổi hạn mức (không được để trống)."],
          },
        ]);
        return;
      }

      // So sánh giá trị nhập vào với giá trị hiện tại của đại lý
      const newCreditLimit = Number(values.credit_limit);
      const newMaxDebtDays = Number(values.max_debt_days ?? 0);
      const currentCreditLimit = Number(agency.credit_limit ?? 0);
      const currentMaxDebtDays = Number(agency.max_debt_days ?? 0);

      if (newCreditLimit === currentCreditLimit && newMaxDebtDays === currentMaxDebtDays) {
        message.warning("Hạn mức tiền hoặc số ngày nợ mới phải khác với giá trị hiện tại!");
        return;
      }

      setSubmitting(true);
      const result = await updateAgencyCreditLimit(agency.id, {
        credit_limit: newCreditLimit,
        max_debt_days: newMaxDebtDays,
        reason: cleanReason,
      });

      message.success(result.message || "Cập nhật hạn mức công nợ thành công!");
      form.resetFields();
      onSuccess(result.data);
      onClose();
    } catch (err: any) {
      if (err?.errorFields) {
        return; // Ant Design form validation error
      }
      console.error("Lỗi cập nhật hạn mức:", err);
      message.error(err.message || "Đã xảy ra lỗi khi cập nhật hạn mức.");
    } finally {
      setSubmitting(false);
    }
  };

  // Tính toán tỷ lệ sử dụng nợ hiện tại
  const currentCredit = agency?.credit_limit ?? 0;
  const currentDebt = agency?.current_debt ?? 0;
  const currentUsagePct =
    currentCredit > 0 ? Math.round((currentDebt / currentCredit) * 100 * 10) / 10 : 0;

  const usageProgressColor =
    currentUsagePct >= 100
      ? "#ef4444"
      : currentUsagePct >= 80
      ? "#f97316"
      : currentUsagePct >= 60
      ? "#eab308"
      : "#10b981";

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
              display: "grid",
              placeItems: "center",
              color: "#ffffff",
              fontSize: 20,
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            }}
          >
            <BankOutlined />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              Khai Báo Hạn Mức Công Nợ
            </div>
            {agency && (
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>
                {agency.name} <span style={{ color: "#94a3b8" }}>({agency.code})</span>
              </div>
            )}
          </div>
        </div>
      }
      open={open}
      onCancel={() => {
        if (!submitting) {
          form.resetFields();
          onClose();
        }
      }}
      width={680}
      footer={null}
      destroyOnClose
      centered
    >
      {agency && (
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          {/* Card thông tin hạn mức và công nợ hiện tại */}
          <div
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 12,
              }}
            >
              <div>
                <Text style={{ fontSize: 12, color: "#64748b" }}>
                  <DollarOutlined style={{ marginRight: 4 }} /> Hạn mức hiện tại
                </Text>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1d4ed8" }}>
                  {formatCurrency(agency.credit_limit)}
                </div>
              </div>

              <div>
                <Text style={{ fontSize: 12, color: "#64748b" }}>
                  <CalendarOutlined style={{ marginRight: 4 }} /> Số ngày nợ hiện tại
                </Text>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#334155" }}>
                  {agency.max_debt_days > 0
                    ? `${agency.max_debt_days} ngày`
                    : "Không giới hạn"}
                </div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <Text style={{ fontSize: 12, color: "#64748b" }}>
                  Dư nợ hiện tại:{" "}
                  <strong style={{ color: currentUsagePct >= 80 ? "#ef4444" : "#0f172a" }}>
                    {formatCurrency(agency.current_debt)}
                  </strong>
                </Text>
                <Text style={{ fontSize: 12, fontWeight: 600, color: usageProgressColor }}>
                  {currentUsagePct.toFixed(1)}% hạn mức
                </Text>
              </div>

              <Progress
                percent={Math.min(currentUsagePct, 100)}
                strokeColor={usageProgressColor}
                showInfo={false}
                size="small"
              />
            </div>
          </div>

          {currentUsagePct >= 100 && (
            <Alert
              type="error"
              showIcon
              icon={<WarningOutlined />}
              message="Đại lý này hiện đang vượt quá hạn mức công nợ cho phép."
              style={{ marginTop: 12, borderRadius: 8 }}
            />
          )}
        </div>
      )}

      {/* Form cập nhật hạn mức mới */}
      <Form
        id="form-debt-limit"
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        requiredMark={false}
      >
        <Form.Item
          label={
            <span style={{ fontWeight: 600, color: "#1e293b" }}>
              <DollarOutlined style={{ marginRight: 6, color: "#2563eb" }} />
              Hạn mức công nợ mới (VND){" "}
              <span style={{ color: "#ef4444" }}>*</span>
            </span>
          }
          name="credit_limit"
          rules={[
            { required: true, message: "Vui lòng nhập hạn mức công nợ mới!" },
            { type: "number", min: 0, message: "Giá trị không được nhỏ hơn 0!" },
          ]}
        >
          <InputNumber<number>
            id="input-credit-limit"
            style={{ width: "100%", borderRadius: 8 }}
            min={0}
            step={5000000}
            formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            parser={(val) => ((val ? parseFloat(val.replace(/[,\s₫VND]/g, "")) : 0) as any)}
            placeholder="Ví dụ: 50,000,000"
            size="large"
          />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ fontWeight: 600, color: "#1e293b" }}>
              <CalendarOutlined style={{ marginRight: 6, color: "#2563eb" }} />
              Số ngày nợ tối đa mới
            </span>
          }
          name="max_debt_days"
          extra="Nhập 0 nếu không giới hạn số ngày nợ tối đa"
          rules={[{ type: "number", min: 0, message: "Giá trị không được nhỏ hơn 0!" }]}
        >
          <InputNumber
            id="input-max-debt-days"
            style={{ width: "100%", borderRadius: 8 }}
            min={0}
            max={365}
            addonAfter="ngày"
            placeholder="Ví dụ: 30"
            size="large"
          />
        </Form.Item>

        <Form.Item
          label={
            <span style={{ fontWeight: 600, color: "#1e293b" }}>
              <FileTextOutlined style={{ marginRight: 6, color: "#f97316" }} />
              Lý do thay đổi <span style={{ color: "#ef4444" }}>*</span>
            </span>
          }
          name="reason"
          rules={[
            {
              validator: (_, value) => {
                if (!value || !value.trim()) {
                  return Promise.reject(
                    new Error("Bắt buộc nhập lý do thay đổi hạn mức!")
                  );
                }
                if (value.trim().length < 5) {
                  return Promise.reject(
                    new Error("Lý do thay đổi phải có ít nhất 5 ký tự.")
                  );
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <TextArea
            id="input-debt-limit-reason"
            rows={3}
            placeholder="Ví dụ: Nâng hạn mức công nợ sau khi thẩm định năng lực tài chính đại lý đợt Q4/2026..."
            style={{ borderRadius: 8, resize: "none" }}
            showCount
            maxLength={500}
          />
        </Form.Item>

        {/* Action buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid #f1f5f9",
          }}
        >
          <Button
            id="btn-cancel-debt-limit"
            onClick={() => {
              form.resetFields();
              onClose();
            }}
            disabled={submitting}
            style={{ borderRadius: 8 }}
          >
            Hủy bỏ
          </Button>
          <Button
            id="btn-submit-debt-limit"
            type="primary"
            htmlType="submit"
            loading={submitting}
            icon={<CheckCircleOutlined />}
            style={{
              borderRadius: 8,
              background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
              border: "none",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            }}
          >
            Lưu thay đổi
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default DebtLimitForm;
