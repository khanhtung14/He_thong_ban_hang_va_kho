import React, { useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Space,
  message,
} from "antd";
import {
  LockOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../session";

const { Text } = Typography;

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [form] = Form.useForm();
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinish = async (values: any) => {
    setStatusMsg(null);
    setIsSubmitting(true);

    try {
      const response = await authenticatedFetch(
        "/api/v1/auth/change-password",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            current_password: values.current_password,
            new_password: values.new_password,
          }),
        },
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatusMsg({
          text:
            result.detail ??
            "Không thể đổi mật khẩu. Vui lòng kiểm tra lại mật khẩu hiện tại.",
          type: "error",
        });
        return;
      }

      message.success("Đổi mật khẩu tài khoản thành công!");
      form.resetFields();
      setStatusMsg(null);
      onClose();
    } catch {
      setStatusMsg({
        text: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setStatusMsg(null);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleCancel}
      footer={null}
      width={440}
      destroyOnClose
      centered
      title={
        <Space align="center" size={10} style={{ paddingBottom: 6 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "#eff6ff",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            <LockOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              Đổi mật khẩu tài khoản
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tối thiểu 8 ký tự để bảo đảm an toàn
            </Text>
          </div>
        </Space>
      }
    >
      <div style={{ marginTop: 14 }}>
        {statusMsg && (
          <Alert
            message={statusMsg.text}
            type={statusMsg.type}
            showIcon
            closable
            onClose={() => setStatusMsg(null)}
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          requiredMark={false}
        >
          {/* Mật khẩu hiện tại */}
          <Form.Item
            name="current_password"
            label={
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                Mật khẩu hiện tại
              </span>
            }
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu hiện tại!" },
            ]}
            style={{ marginBottom: 14 }}
          >
            <Input.Password
              prefix={<KeyOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Nhập mật khẩu đang dùng"
              style={{ borderRadius: 8, height: 40 }}
            />
          </Form.Item>

          {/* Mật khẩu mới */}
          <Form.Item
            name="new_password"
            label={
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                Mật khẩu mới
              </span>
            }
            rules={[
              { required: true, message: "Vui lòng nhập mật khẩu mới!" },
              { min: 8, message: "Mật khẩu mới phải có tối thiểu 8 ký tự!" },
            ]}
            style={{ marginBottom: 14 }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)"
              style={{ borderRadius: 8, height: 40 }}
            />
          </Form.Item>

          {/* Xác nhận mật khẩu mới */}
          <Form.Item
            name="confirm_password"
            label={
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                Xác nhận mật khẩu mới
              </span>
            }
            dependencies={["new_password"]}
            rules={[
              {
                required: true,
                message: "Vui lòng xác nhận lại mật khẩu mới!",
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("new_password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error("Mật khẩu xác nhận không khớp!"),
                  );
                },
              }),
            ]}
            style={{ marginBottom: 22 }}
          >
            <Input.Password
              prefix={<CheckCircleOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Nhập lại mật khẩu mới"
              style={{ borderRadius: 8, height: 40 }}
            />
          </Form.Item>

          {/* Footer nút bấm */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              paddingTop: 12,
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <Button
              onClick={handleCancel}
              disabled={isSubmitting}
              style={{ borderRadius: 6 }}
            >
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={isSubmitting}
              style={{
                borderRadius: 6,
                backgroundColor: "#2563eb",
                fontWeight: 600,
              }}
            >
              Cập nhật mật khẩu
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;
