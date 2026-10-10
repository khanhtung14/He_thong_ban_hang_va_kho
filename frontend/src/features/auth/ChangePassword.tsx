import { useState } from "react";
import { Form, Input, Button, Typography, Alert } from "antd";
import { LockOutlined, ArrowRightOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text, Link } = Typography;

type ApiError = { detail?: string };

export default function ChangePassword() {
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: any) => {
    setMessage("");
    setIsSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await authenticatedFetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: values.currentPassword,
          new_password: values.newPassword,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ApiError;

      if (!response.ok) {
        setMessage(result.detail ?? "Không thể đổi mật khẩu. Vui lòng thử lại.");
        return;
      }

      setMessage("Đổi mật khẩu thành công.");
      setIsSuccess(true);
      form.resetFields();
    } catch {
      setMessage("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleHome = (): string => {
    const role = window.sessionStorage.getItem("user_role")?.toUpperCase();
    if (role === "CUSTOMER") return "/portal/orders";
    if (role === "SALES" || role === "SALES_REP") return "/sales/orders";
    if (role === "SALES_MANAGER") return "/manager/dashboard";
    if (role === "WAREHOUSE") return "/warehouse/picking";
    if (role === "WH_MANAGER" || role === "WAREHOUSE_MANAGER") return "/warehouse/dashboard";
    if (role === "ACCOUNTANT") return "/accounting/debt-book";
    if (role === "ADMIN" || role === "ADMINISTRATOR") return "/admin/users";
    return "/login";
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e0e7ff 0%, #dbeafe 50%, #eff6ff 100%)",
        padding: "32px 20px",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
      }}
    >
      {/* Khung Card đồng bộ viền mềm và đổ bóng */}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          backgroundColor: "#ffffff",
          borderRadius: 28,
          boxShadow:
            "0 24px 60px -15px rgba(37, 99, 235, 0.16), 0 0 0 1px rgba(37, 99, 235, 0.08)",
          padding: "40px 36px",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Brand Logo chuẩn hệ thống WMS & OMS */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: "#2563eb",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)",
            }}
          >
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "#1e3a8a",
                letterSpacing: "0.5px",
                lineHeight: 1.2,
              }}
            >
              WMS &amp; OMS
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#94a3b8",
                fontWeight: 500,
              }}
            >
              Quản lý kho &amp; Bán hàng
            </div>
          </div>
        </div>

        {/* Tiêu đề & mô tả */}
        <div style={{ marginBottom: 20 }}>
          <Title
            level={3}
            style={{
              margin: "0 0 6px",
              fontWeight: 800,
              color: "#0f172a",
              fontSize: 26,
            }}
          >
            Đổi mật khẩu
          </Title>
          <Text
            type="secondary"
            style={{
              fontSize: 13,
              display: "block",
              color: "#64748b",
            }}
          >
            Thiết lập lại mật khẩu đăng nhập để bảo mật tài khoản.
          </Text>
        </div>

        {/* Thông báo kết quả */}
        {message && (
          <Alert
            message={message}
            type={isSuccess ? "success" : "error"}
            showIcon
            style={{
              marginBottom: 20,
              borderRadius: 10,
              border: isSuccess ? "1px solid #bbf7d0" : "1px solid #fecaca",
            }}
          />
        )}

        <Form
          form={form}
          name="change_password"
          layout="vertical"
          onFinish={onFinish}
          requiredMark={false}
        >
          {/* Mật khẩu hiện tại */}
          <Form.Item
            name="currentPassword"
            label={
              <span style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}>
                Mật khẩu hiện tại
              </span>
            }
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại!" }]}
            style={{ marginBottom: 18 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Nhập mật khẩu đang dùng"
              size="large"
              style={{
                borderRadius: 10,
                borderColor: "#cbd5e1",
                height: 46,
              }}
            />
          </Form.Item>

          {/* Mật khẩu mới */}
          <Form.Item
            name="newPassword"
            label={
              <span style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}>
                Mật khẩu mới
              </span>
            }
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới!" },
              { min: 8, message: "Mật khẩu mới phải có ít nhất 8 ký tự!" },
            ]}
            style={{ marginBottom: 26 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
              size="large"
              style={{
                borderRadius: 10,
                borderColor: "#cbd5e1",
                height: 46,
              }}
            />
          </Form.Item>

          {/* Nút bấm Cập nhật mật khẩu */}
          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={isSubmitting}
              icon={<ArrowRightOutlined />}
              iconPosition="end"
              style={{
                height: 48,
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                backgroundColor: "#2563eb",
                boxShadow: "0 8px 16px -4px rgba(37, 99, 235, 0.4)",
              }}
            >
              {isSubmitting ? "Đang xử lý..." : "CẬP NHẬT MẬT KHẨU"}
            </Button>
          </Form.Item>

          {/* Điều hướng quay lại */}
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <Link
              href={getRoleHome()}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#2563eb",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ArrowLeftOutlined style={{ fontSize: 12 }} /> Quay lại giao diện chính
            </Link>
          </div>
        </Form>
      </div>
    </div>
  );
}