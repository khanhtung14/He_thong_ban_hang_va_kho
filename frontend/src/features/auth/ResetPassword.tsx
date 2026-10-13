import { useState, useEffect } from "react";
import { Form, Input, Button, Card, Typography, Alert, Spin } from "antd";
import { LockOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export default function ResetPassword() {
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (!tokenParam) {
      setMessage("Không tìm thấy mã xác thực (token) trong liên kết.");
      setIsValidating(false);
      return;
    }
    setToken(tokenParam);

    fetch(`/api/v1/auth/verify-reset-token/${tokenParam}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Liên kết không hợp lệ hoặc đã hết hạn.");
        }
      })
      .catch((err) => {
        setMessage(err.message);
      })
      .finally(() => {
        setIsValidating(false);
      });
  }, []);

  const onFinish = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      setMessage("Mật khẩu xác nhận không khớp.");
      return;
    }

    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          new_password: values.newPassword,
          confirm_password: values.confirmPassword,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.detail ?? "Không thể đặt lại mật khẩu. Vui lòng thử lại.");
        return;
      }

      setMessage("Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bây giờ.");
      setIsSuccess(true);
    } catch {
      setMessage("Không thể kết nối đến máy chủ.");
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
          <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Đặt lại mật khẩu</Title>
        </div>

        {isValidating ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}><Text type="secondary">Đang kiểm tra liên kết...</Text></div>
          </div>
        ) : message && !isSuccess && !token ? (
          <>
            <Alert message="Lỗi" description={message} type="error" showIcon style={{ marginBottom: 24 }} />
            <div style={{ textAlign: "center" }}>
              <a href="/forgot-password" style={{ color: "#1890ff", fontWeight: 500 }}>Yêu cầu lại liên kết</a>
            </div>
          </>
        ) : isSuccess ? (
          <>
            <Alert message="Thành công" description={message} type="success" showIcon style={{ marginBottom: 24 }} />
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <Button type="primary" href="/login" size="large" style={{ borderRadius: 8 }}>
                Quay lại đăng nhập
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <Text type="secondary">Vui lòng nhập mật khẩu mới của bạn.</Text>
            </div>
            <Form name="reset_password" layout="vertical" onFinish={onFinish} size="large">
              <Form.Item
                name="newPassword"
                label={<span style={{ fontWeight: 600 }}>Mật khẩu mới</span>}
                rules={[
                  { required: true, message: "Vui lòng nhập mật khẩu mới!" },
                  { min: 8, message: "Mật khẩu mới phải có ít nhất 8 ký tự!" }
                ]}
              >
                <Input.Password prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />} />
              </Form.Item>

              <Form.Item
                name="confirmPassword"
                label={<span style={{ fontWeight: 600 }}>Xác nhận mật khẩu</span>}
                rules={[
                  { required: true, message: "Vui lòng xác nhận mật khẩu!" },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('Mật khẩu xác nhận không khớp!'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />} />
              </Form.Item>

              {message && <Alert message={message} type="error" showIcon style={{ marginBottom: 16 }} />}

              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block loading={isSubmitting} style={{ height: 48, borderRadius: 8, fontWeight: 600 }}>
                  Xác nhận đặt lại
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
}
