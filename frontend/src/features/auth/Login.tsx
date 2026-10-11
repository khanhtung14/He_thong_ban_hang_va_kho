import { useState } from "react";
import { Form, Input, Button, Alert, Typography } from "antd";
import {
  UserOutlined,
  LockOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";

// Import ảnh banner từ thư mục assets của frontend
import loginBanner from "../../assets/login-banner.png";

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
  const [imgError, setImgError] = useState(false);

  // Logic nhận diện trạng thái session từ URL của file trên
  const sessionExpired =
    new URLSearchParams(window.location.search).get("session") === "expired";
  const loggedOut =
    new URLSearchParams(window.location.search).get("session") === "logged-out";

  // Toàn bộ logic onFinish chuẩn của file trên
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

        // Dọn dẹp session cũ
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

        // Lưu session token
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

        // Lưu access token
        if (result.access_token) {
          window.sessionStorage.setItem("access_token", result.access_token);
          window.localStorage.setItem("access_token", result.access_token);
          const accExp = String(Date.now() + 58 * 60 * 1000);
          window.sessionStorage.setItem("access_token_expires_at", accExp);
          window.localStorage.setItem("access_token_expires_at", accExp);
        }

        // Lưu thông tin người dùng
        if (result.user?.username) {
          window.sessionStorage.setItem("user_name", result.user.username);
          window.localStorage.setItem("user_name", result.user.username);
        }
        if (result.user?.role_code) {
          window.sessionStorage.setItem("user_role", result.user.role_code);
          window.localStorage.setItem("user_role", result.user.role_code);
        }

        // Xử lý điều hướng an toàn
        const requestedRedirect = new URLSearchParams(
          window.location.search,
        ).get("redirect");
        const safeRedirect =
          requestedRedirect?.startsWith("/") &&
          !requestedRedirect.startsWith("//")
            ? requestedRedirect
            : result.redirect_url;

        window.location.assign(safeRedirect);
        return;
      }

      // Xử lý các mã lỗi API chi tiết của file trên
      const result = (await response.json().catch(() => ({}))) as ApiError;
      if (response.status === 423 && typeof result.detail === "object") {
        setError(
          result.detail?.message ??
            "Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.",
        );
      } else if (response.status === 401) {
        setError("Tên đăng nhập hoặc mật khẩu không chính xác.");
      } else if (response.status === 403) {
        setError(
          typeof result.detail === "string"
            ? result.detail
            : "Tài khoản không được phép truy cập.",
        );
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
      {/* Khung Canvas Tròn Viền Nổi Đồng Bộ Của Giao Diện Dưới */}
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
        {/* Họa tiết đốm tròn pastel trang trí */}
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
          {/* Brand Logo chuẩn hệ thống WMS & OMS */}
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
              Truy cập công việc theo vai trò của bạn
            </Text>

            {/* Trạng thái Session & Thông báo */}
            {sessionExpired && (
              <Alert
                message="Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục."
                type="warning"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            )}

            {loggedOut && (
              <Alert
                message="Bạn đã đăng xuất thành công."
                type="success"
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
                    Tên đăng nhập
                  </span>
                }
                rules={[
                  { required: true, message: "Vui lòng nhập tên đăng nhập!" },
                ]}
                style={{ marginBottom: 18 }}
              >
                <Input
                  prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                  placeholder="Tên đăng nhập"
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

              {/* Mật khẩu & Liên kết quên mật khẩu */}
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
                  placeholder="Mật khẩu"
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

          {/* Footer thông tin liên hệ hỗ trợ */}
          <div>
            <Text type="secondary" style={{ fontSize: 12, color: "#94a3b8" }}>
              Cần hỗ trợ phân quyền?{" "}
              <Text strong style={{ color: "#2563eb" }}>
                Liên hệ Quản trị viên
              </Text>
            </Text>
          </div>
        </div>

        {/* CỘT PHẢI: BANNER WMS MINH HỌA */}
        <div
          style={{
            flex: "0 0 58%",
            backgroundColor: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            borderLeft: "1px solid #f1f5f9",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {!imgError ? (
            <img
              src={loginBanner}
              alt="WMS Banner"
              onError={() => setImgError(true)}
              style={{
                width: "100%",
                height: "100%",
                maxHeight: "560px",
                objectFit: "contain",
                transform: "scale(1.06) translateX(-20px)",
                transition: "all 0.3s ease",
              }}
            />
          ) : (
            <div style={{ textAlign: "center", padding: 40, width: "100%" }}>
              <div
                style={{
                  width: 110,
                  height: 110,
                  borderRadius: "50%",
                  backgroundColor: "#dbeafe",
                  color: "#2563eb",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 54,
                  marginBottom: 24,
                  boxShadow: "0 10px 25px rgba(37, 99, 235, 0.15)",
                }}
              >
                📊
              </div>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#1e3a8a",
                  marginBottom: 12,
                }}
              >
                Hệ thống Quản lý Bán hàng &amp; Kho
              </h3>
              <p
                style={{
                  color: "#64748b",
                  fontSize: 14,
                  maxWidth: 360,
                  margin: "0 auto",
                  lineHeight: 1.6,
                }}
              >
                Nền tảng vận hành tập trung B2B. Quản lý danh mục hàng hóa, theo
                dõi tồn kho và phê duyệt đơn hàng theo thời gian thực.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
