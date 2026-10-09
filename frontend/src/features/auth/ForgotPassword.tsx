import { useState } from "react";
import { Form, Input, Button, Card, Typography, Alert } from "antd";
import { MailOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

type ApiError = { detail?: string };
type ForgotPasswordResponse = { message?: string; demo_mode?: boolean };

export default function ForgotPassword() {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const onFinish = async (values: any) => {
    setMessage("");
    setIsError(false);
    setIsDemoMode(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email.trim() }),
      });
      const result = (await response.json().catch(() => ({}))) as ForgotPasswordResponse & ApiError;

      if (!response.ok) {
        setIsError(true);
        setMessage(result.detail ?? "Không thể gửi yêu cầu. Vui lòng kiểm tra địa chỉ email.");
        return;
      }

      setIsError(false);
      setMessage(result.message || "Yêu cầu đã được gửi. Vui lòng kiểm tra email.");
      setIsDemoMode(!!result.demo_mode);
    } catch {
      setIsError(true);
      setMessage("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "url('/bg.jpg') center/cover no-repeat", padding: "24px 16px" }}>
      <Card style={{ width: "100%", maxWidth: 440, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.1)", background: "rgba(255, 255, 255, 0.45)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.4)" }} bordered={false}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Text strong style={{ color: "#1890ff", fontSize: 14, textTransform: "uppercase", letterSpacing: 1.5 }}>
            OMS · Bán hàng & Kho
          </Text>
          <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Quên mật khẩu</Title>
          <Text type="secondary">Nhập email tài khoản. Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu có hiệu lực trong 30 phút.</Text>
        </div>

        {message && (
          <Alert
            message={isDemoMode ? "Chế độ Demo" : isError ? "Lỗi" : "Thành công"}
            description={message}
            type={isError ? "error" : isDemoMode ? "warning" : "success"}
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Form name="forgot_password" layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="email"
            label={<span style={{ fontWeight: 600 }}>Email tài khoản</span>}
            rules={[
              { required: true, message: "Vui lòng nhập email!" },
              { type: "email", message: "Email không hợp lệ!" }
            ]}
          >
            <Input prefix={<MailOutlined style={{ color: "rgba(0,0,0,.25)" }} />} placeholder="ví dụ: user@example.com" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" block loading={isSubmitting} style={{ height: 48, borderRadius: 8, fontWeight: 600 }}>
              Gửi liên kết đặt lại mật khẩu
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            <a href="/login" style={{ color: "#1890ff", fontWeight: 500 }}>
              Quay lại đăng nhập
            </a>
          </div>
        </Form>
      </Card>
    </div>
  );
}
