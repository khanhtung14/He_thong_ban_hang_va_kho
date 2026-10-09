import { useState } from "react";
import { Form, Input, Button, Card, Typography, Alert } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "url('/bg.jpg') center/cover no-repeat", padding: "24px 16px" }}>
      <Card style={{ width: "100%", maxWidth: 440, borderRadius: 16, boxShadow: "0 12px 32px rgba(0,0,0,0.1)", background: "rgba(255, 255, 255, 0.45)", backdropFilter: "blur(16px)", border: "1px solid rgba(255, 255, 255, 0.4)" }} bordered={false}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Text strong style={{ color: "#1890ff", fontSize: 14, textTransform: "uppercase", letterSpacing: 1.5 }}>
            OMS · Bán hàng & Kho
          </Text>
          <Title level={2} style={{ marginTop: 8, marginBottom: 8 }}>Đổi mật khẩu</Title>
          <Text type="secondary">Nhập mật khẩu hiện tại và mật khẩu mới của bạn.</Text>
        </div>

        {message && (
          <Alert
            message={isSuccess ? "Thành công" : "Lỗi"}
            description={message}
            type={isSuccess ? "success" : "error"}
            showIcon
            style={{ marginBottom: 24 }}
          />
        )}

        <Form form={form} name="change_password" layout="vertical" onFinish={onFinish} size="large">
          <Form.Item
            name="currentPassword"
            label={<span style={{ fontWeight: 600 }}>Mật khẩu hiện tại</span>}
            rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại!" }]}
          >
            <Input.Password prefix={<LockOutlined style={{ color: "rgba(0,0,0,.25)" }} />} />
          </Form.Item>

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

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" block loading={isSubmitting} style={{ height: 48, borderRadius: 8, fontWeight: 600 }}>
              Cập nhật mật khẩu
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            <a href={getRoleHome()} style={{ color: "#1890ff", fontWeight: 500 }}>
              Quay lại giao diện chính
            </a>
          </div>
        </Form>
      </Card>
    </div>
  );
}
