import { useState } from "react";
import { Form, Input, Button, Card, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

type LoginResponse = {
  redirect_url: string;
  session_token?: string;
  expires_in?: number;
  access_token?: string;
  user?: { username?: string; role_code?: string };
};

type ApiError = {
  detail?: string | { message?: string; retry_after_seconds?: number };
};

export default function Login() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const sessionExpired = new URLSearchParams(window.location.search).get("session") === "expired";
  const loggedOut = new URLSearchParams(window.location.search).get("session") === "logged-out";

  const onFinish = async (values: any) => {
    setError("");
    const normalizedUsername = values.username.trim();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizedUsername, password: values.password }),
      });

      if (response.ok) {
        const result = (await response.json()) as LoginResponse;
        for (const key of [
          "session_token",
          "session_expires_at",
          "access_token",
          "access_token_expires_at",
          "user_role",
          "user_name",
          "token",
        ]) {
          window.sessionStorage.removeItem(key);
          window.localStorage.removeItem(key);
        }
        if (result.session_token) {
          window.sessionStorage.setItem("session_token", result.session_token);
          window.localStorage.setItem("session_token", result.session_token);
          window.localStorage.setItem("token", result.session_token);
          const exp = String(Date.now() + (result.expires_in ?? 12 * 60 * 60) * 1000);
          window.sessionStorage.setItem("session_expires_at", exp);
          window.localStorage.setItem("session_expires_at", exp);
        }
        if (result.access_token) {
          window.sessionStorage.setItem("access_token", result.access_token);
          window.localStorage.setItem("access_token", result.access_token);
          const accExp = String(Date.now() + 58 * 60 * 1000);
          window.sessionStorage.setItem("access_token_expires_at", accExp);
          window.localStorage.setItem("access_token_expires_at", accExp);
        }
        if (result.user?.username) {
          window.sessionStorage.setItem("user_name", result.user.username);
          window.localStorage.setItem("user_name", result.user.username);
        }
        if (result.user?.role_code) {
          window.sessionStorage.setItem("user_role", result.user.role_code);
          window.localStorage.setItem("user_role", result.user.role_code);
        }
        const requestedRedirect = new URLSearchParams(window.location.search).get("redirect");
        const safeRedirect = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//")
          ? requestedRedirect
          : result.redirect_url;
        window.location.assign(safeRedirect);
        return;
      }

      const result = (await response.json().catch(() => ({}))) as ApiError;
      if (response.status === 423 && typeof result.detail === "object") {
        setError(result.detail?.message ?? "Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.");
      } else if (response.status === 401) {
        setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
      } else if (response.status === 403) {
        setError(typeof result.detail === "string" ? result.detail : "Tài khoản không được phép truy cập.");
      } else {
        setError("Hệ thống đang bận. Vui lòng thử lại sau ít phút.");
      }
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "url('/bg.jpg') center/cover no-repeat" }}>
      <Card style={{ width: "100%", maxWidth: 440, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.1)", background: "rgba(255, 255, 255, 0.45)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.4)" }} bordered={false}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Text strong style={{ color: "#1890ff", fontSize: 14, textTransform: "uppercase", letterSpacing: 1.5 }}>
            OMS · Bán hàng & Kho
          </Text>
          <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Đăng nhập</Title>
          <Text type="secondary">Truy cập công việc theo vai trò của bạn</Text>
        </div>

        {sessionExpired && (
          <Alert message="Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục." type="warning" showIcon style={{ marginBottom: 24 }} />
        )}
        {loggedOut && (
          <Alert message="Bạn đã đăng xuất thành công." type="success" showIcon style={{ marginBottom: 24 }} />
        )}
        {error && (
          <Alert message={error} type="error" showIcon style={{ marginBottom: 24 }} />
        )}

        <Form name="login" layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: "Vui lòng nhập tên đăng nhập!" }]}
          >
            <Input prefix={<UserOutlined style={{ color: "rgba(0,0,0,.25)" }} />} placeholder="Tên đăng nhập" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />} placeholder="Mật khẩu" />
          </Form.Item>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
            <a href="/forgot-password" style={{ color: "#1890ff", fontWeight: 500 }}>
              Quên mật khẩu?
            </a>
          </div>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={isSubmitting} style={{ height: 48, borderRadius: 8, fontWeight: 600 }}>
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
