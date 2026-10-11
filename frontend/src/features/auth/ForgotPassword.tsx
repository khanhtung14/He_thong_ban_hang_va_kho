import { useState } from "react";
import { Form, Input, Button, Alert, Typography } from "antd";
import {
  MailOutlined,
  ArrowLeftOutlined,
  SendOutlined,
} from "@ant-design/icons";

import loginBanner from "../../assets/login-banner.png";

const { Title, Text, Link } = Typography;

type ForgotPasswordResponse = {
  message?: string;
  demo_mode?: boolean;
};

type ApiError = { detail?: string };

export default function ForgotPassword() {
  const [form] = Form.useForm();
  const [message, setMessage] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinish = async (values: any) => {
    setMessage("");
    setIsDemoMode(false);
    setIsError(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email?.trim() }),
      });

      const result = (await response
        .json()
        .catch(() => ({}))) as ForgotPasswordResponse & ApiError;

      if (!response.ok) {
        setIsError(true);
        setMessage(
          result.detail ??
            "Không thể gửi yêu cầu. Vui lòng kiểm tra địa chỉ email.",
        );
        return;
      }

      setIsError(false);
      setMessage(
        result.message ||
          "Yêu cầu đã được gửi. Vui lòng kiểm tra email.",
      );
      setIsDemoMode(!!result.demo_mode);
    } catch {
      setIsError(true);
      setMessage("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #e0e7ff 0%, #dbeafe 50%, #eff6ff 100%)",
        padding: "32px 20px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Khung Canvas Tròn Viền Nổi Đồng Bộ Hoàn Toàn Với Login */}
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          minHeight: 640,
          backgroundColor: "#ffffff",
          borderRadius: 36,
          boxShadow:
            "0 24px 60px -15px rgba(37, 99, 235, 0.18), 0 0 0 1px rgba(37, 99, 235, 0.08)",
          display: "flex",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background đốm mây trang trí nhẹ */}
        <div
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(191, 219, 254, 0.45) 0%, rgba(255, 255, 255, 0) 70%)",
            top: -120,
            right: -100,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 350,
            height: 350,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(219, 234, 254, 0.5) 0%, rgba(255, 255, 255, 0) 70%)",
            bottom: -80,
            left: 300,
            pointerEvents: "none",
          }}
        />

        {/* CỘT TRÁI: FORM KHÔI PHỤC MẬT KHẨU */}
        <div
          style={{
            flex: "0 0 42%",
            padding: "56px 48px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            zIndex: 2,
          }}
        >
          {/* Logo nhận diện WMS */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#2563eb",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 10px rgba(37, 99, 235, 0.3)",
              }}
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
                }}
              >
                WMS &amp; OMS
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#94a3b8",
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                Quản lý kho &amp; Bán hàng
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div style={{ marginTop: 28, marginBottom: 20 }}>
            <Title
              level={2}
              style={{
                margin: "0 0 6px",
                fontWeight: 800,
                color: "#0f172a",
                fontSize: 30,
              }}
            >
              Quên mật khẩu?
            </Title>
            <Text
              type="secondary"
              style={{
                fontSize: 13,
                display: "block",
                marginBottom: 24,
                color: "#64748b",
                lineHeight: 1.5,
              }}
            >
              Nhập email tài khoản. Nếu email tồn tại, liên kết đặt lại mật khẩu
              có hiệu lực trong 30 phút sẽ được gửi cho bạn.
            </Text>

            {/* Thông báo kết quả / lỗi */}
            {message && (
              <Alert
                message={
                  isDemoMode ? "Chế độ Demo" : isError ? "Lỗi" : "Thành công"
                }
                description={message}
                type={isError ? "error" : isDemoMode ? "warning" : "success"}
                showIcon
                closable
                onClose={() => setMessage("")}
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}

            {/* Chế độ demo */}
            {message && !isError && isDemoMode && (
              <Alert
                type="info"
                showIcon
                message="Môi trường Demo"
                description={
                  <span>
                    Chưa kích hoạt SMTP gửi email thật. Bạn có thể kiểm tra hòm
                    thư giả lập tại{" "}
                    <code style={{ color: "#1d4ed8" }}>/dev/mock-outbox</code>.
                  </span>
                }
                style={{ marginBottom: 16, borderRadius: 8, fontSize: 12 }}
              />
            )}

            <Form
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              requiredMark={false}
            >
              <Form.Item
                name="email"
                label={
                  <span
                    style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}
                  >
                    Email đăng ký tài khoản
                  </span>
                }
                rules={[
                  { required: true, message: "Vui lòng nhập địa chỉ email!" },
                  {
                    type: "email",
                    message: "Địa chỉ email không đúng định dạng!",
                  },
                ]}
                style={{ marginBottom: 26 }}
              >
                <Input
                  prefix={<MailOutlined style={{ color: "#94a3b8" }} />}
                  placeholder="VD: user@example.com"
                  size="large"
                  maxLength={254}
                  autoComplete="email"
                  style={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    height: 46,
                  }}
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={isSubmitting}
                  icon={<SendOutlined />}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 15,
                    backgroundColor: "#2563eb",
                    boxShadow: "0 8px 16px -4px rgba(37, 99, 235, 0.4)",
                  }}
                >
                  {isSubmitting
                    ? "Đang gửi yêu cầu..."
                    : "GỬI LIÊN KẾT ĐẶT LẠI"}
                </Button>
              </Form.Item>
            </Form>
          </div>

          {/* Quay lại login */}
          <div>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#2563eb",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ArrowLeftOutlined style={{ fontSize: 12 }} />
              Quay lại đăng nhập
            </Link>
          </div>
        </div>

        {/* CỘT PHẢI: BANNER ĐỒNG BỘ */}
        <div
          style={{
            flex: "0 0 58%",
            backgroundColor: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px",
            borderLeft: "1px solid #f1f5f9",
            overflow: "hidden",
          }}
        >
          <img
            src={loginBanner}
            alt="WMS Banner"
            style={{
              width: "100%",
              maxHeight: "540px",
              objectFit: "contain",
              transform: "scale(1.08) translateX(-45px)",
              transition: "transform 0.3s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
