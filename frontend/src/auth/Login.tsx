import loginBanner from "../assets/login-banner.png";
import { useState } from "react";
import { Form, Input, Button, Alert, Typography } from "antd";
import {
  UserOutlined,
  LockOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";

const { Title, Text, Link } = Typography;

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
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const sessionExpired = searchParams.get("session") === "expired";
  const loggedOut = searchParams.get("session") === "logged-out";

  const handleFinish = async (values: any) => {
    setError("");

    const normalizedUsername = values.username?.trim();
    if (!normalizedUsername || !values.password) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: normalizedUsername,
          password: values.password,
        }),
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
          const exp = String(
            Date.now() + (result.expires_in ?? 12 * 60 * 60) * 1000,
          );
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

        const requestedRedirect = searchParams.get("redirect");
        const safeRedirect =
          requestedRedirect?.startsWith("/") &&
          !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : result.redirect_url;

        window.location.assign(safeRedirect);
        return;
      }

      const result = (await response.json().catch(() => ({}))) as ApiError;
      if (response.status === 423 && typeof result.detail === "object") {
        setError(
          result.detail?.message ??
            "Tài khoản đang bị tạm khóa. Vui lòng thử lại sau ít phút.",
        );
      } else if (response.status === 401) {
        setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
      } else if (response.status === 403) {
        setError(
          typeof result.detail === "string"
            ? result.detail
            : "Tài khoản không có quyền truy cập hệ thống.",
        );
      } else {
        setError("Hệ thống máy chủ đang bận. Vui lòng thử lại sau.");
      }
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại backend.");
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
      {/* Khung Canvas Tròn Viền Nổi (Đúng form ảnh mẫu) */}
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
        {/* Background đốm trang trí xanh mờ nhẹ kiểu pastel */}
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
        {/* CỘT TRÁI: FORM ĐĂNG NHẬP */}
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
          {/* Brand Logo góc trên chuẩn WMS */}
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

          {/* Form nội dung chính */}
          <div style={{ marginTop: 32, marginBottom: 24 }}>
            <Title
              level={2}
              style={{
                margin: "0 0 6px",
                fontWeight: 800,
                color: "#0f172a",
                fontSize: 32,
              }}
            >
              Đăng nhập
            </Title>
            <Text
              type="secondary"
              style={{
                fontSize: 13,
                display: "block",
                marginBottom: 24,
                color: "#64748b",
              }}
            >
              Chào mừng bạn trở lại hệ thống quản trị vận hành.
            </Text>

            {/* Thông báo trạng thái */}
            {sessionExpired && (
              <Alert
                message="Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại."
                type="warning"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}

            {loggedOut && (
              <Alert
                message="Đã đăng xuất tài khoản an toàn."
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}

            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError("")}
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}

            <Form
              form={form}
              layout="vertical"
              onFinish={handleFinish}
              requiredMark={false}
            >
              {/* Tên đăng nhập */}
              <Form.Item
                name="username"
                label={
                  <span
                    style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}
                  >
                    Tài khoản / Email
                  </span>
                }
                rules={[
                  { required: true, message: "Vui lòng nhập tên đăng nhập!" },
                ]}
                style={{ marginBottom: 18 }}
              >
                <Input
                  prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                  placeholder="VD: sales_mgr, accountant..."
                  size="large"
                  maxLength={100}
                  autoComplete="username"
                  style={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    height: 46,
                  }}
                />
              </Form.Item>

              {/* Mật khẩu & Quên mật khẩu riêng biệt hoàn toàn */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}
                >
                  Mật khẩu
                </span>
                <Link
                  href="/forgot-password"
                  style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}
                >
                  Quên mật khẩu?
                </Link>
              </div>

              <Form.Item
                name="password"
                rules={[{ required: true, message: "Vui lòng nhập mật khẩu!" }]}
                style={{ marginBottom: 28 }}
              >
                <Input.Password
                  prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
                  placeholder="Nhập mật khẩu"
                  size="large"
                  maxLength={128}
                  autoComplete="current-password"
                  style={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    height: 46,
                  }}
                />
              </Form.Item>

              {/* Nút bấm Đăng nhập */}
              <Form.Item style={{ marginBottom: 0 }}>
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
                  {isSubmitting ? "Đang xác thực..." : "ĐĂNG NHẬP"}
                </Button>
              </Form.Item>
            </Form>
          </div>

          {/* Chân trang thông tin trợ giúp */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, color: "#94a3b8" }}>
              Cần hỗ trợ phân quyền?{" "}
              <Text strong style={{ color: "#2563eb" }}>
                Liên hệ Quản trị viên
              </Text>
            </Text>
          </div>
        </div>
        {/* CỘT PHẢI: HÌNH ẢNH CỦA BẠN */}
        {/* CỘT PHẢI */}
        <div
          style={{
            flex: "0 0 62%", // Tăng tỉ lệ cột phải từ 58% lên 62% cho rộng rãi
            backgroundColor: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px", // Giảm padding để ảnh mở rộng ra sát mép
            borderLeft: "1px solid #f1f5f9",
            overflow: "hidden",
          }}
        >
          <img
            src={loginBanner}
            alt="WMS Banner"
            style={{
              width: "100%",
              height: "100%",
              maxHeight: "580px", // Tăng trần chiều cao lên
              objectFit: "contain",
              transform: "scale(1.08) translateX(-45px)", // Chỉnh to lên theo ý bạn (1.05 đến 1.15)
            }}
          />
        </div>
      </div>
    </div>
  );
}
