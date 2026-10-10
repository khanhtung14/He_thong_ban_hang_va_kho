import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Button, Alert, Tag, Spin, message } from "antd";
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  ShopOutlined,
  CompassOutlined,
  EditOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../services/sessionService";
import { fetchProfile, type UserProfile } from "../services/apiClient";
import ProfileAvatar from "./ProfileAvatar";

export interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
}) => {
  const [form] = Form.useForm();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const loadProfile = (silent = false) => {
    if (!silent) setIsLoading(true);
    setLoadError(null);
    setStatusMsg(null);
    setIsEditing(false);

    fetchProfile()
      .then((data: any) => {
        setProfile(data);
        form.setFieldsValue({
          username: data?.username || "",
          email: data?.email || "",
          role: data?.role || "",
          warehouse: data?.warehouse || "Kho Tổng",
          area: data?.area || "Toàn quốc",
          full_name: data?.full_name || "",
          phone: data?.phone || "",
        });
      })
      .catch((err: any) => {
        const msg = err?.message || "Không thể tải dữ liệu hồ sơ cá nhân.";
        setLoadError(msg);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form]);

  const handleSubmit = async (values: any) => {
    setStatusMsg(null);
    setIsSaving(true);
    try {
      const response = await authenticatedFetch("/api/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name?.trim(),
          phone: values.phone?.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Không thể lưu cập nhật hồ sơ.");
      }

      const updated = result.profile || {
        ...profile,
        full_name: values.full_name,
        phone: values.phone,
      };

      setProfile(updated);
      message.success("Cập nhật hồ sơ thành công!");
      setIsEditing(false);
      window.dispatchEvent(new Event("oms:profile-avatar-updated"));
      if (onProfileUpdated) onProfileUpdated(updated);
    } catch (error: any) {
      const msg = error.message || "Không thể kết nối đến máy chủ.";
      setStatusMsg({ text: msg, type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      form.setFieldsValue({
        full_name: profile.full_name,
        phone: profile.phone,
      });
    }
    setIsEditing(false);
    setStatusMsg(null);
  };

  const avatarName =
    profile?.full_name || window.sessionStorage.getItem("user_name") || "?";
  const avatarInitials =
    avatarName
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part: string) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <Modal
      open={isOpen}
      onCancel={() => {
        handleCancelEdit();
        onClose();
      }}
      footer={null}
      width={760}
      destroyOnClose
      style={{ top: 32 }}
      title={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingRight: 28,
            paddingBottom: 12,
            borderBottom: "1px solid #f1f5f9",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <ProfileAvatar initials={avatarInitials} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                {profile?.full_name || "Hồ sơ cá nhân"}
              </div>
              <div style={{ marginTop: 2 }}>
                <Tag color="blue" style={{ fontWeight: 600 }}>
                  {profile?.role || "Đang tải vai trò..."}
                </Tag>
              </div>
            </div>
          </div>

          {profile && !isEditing && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="small"
              onClick={() => {
                setStatusMsg(null);
                setIsEditing(true);
              }}
              style={{ borderRadius: 6, backgroundColor: "#2563eb" }}
            >
              Chỉnh sửa
            </Button>
          )}
        </div>
      }
    >
      <div style={{ marginTop: 18 }}>
        {isLoading ? (
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <Spin tip="Đang tải dữ liệu hồ sơ..." />
          </div>
        ) : profile ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            requiredMark={false}
          >
            {statusMsg && (
              <Alert
                message={statusMsg.text}
                type={statusMsg.type}
                showIcon
                closable
                onClose={() => setStatusMsg(null)}
                style={{ marginBottom: 18, borderRadius: 8 }}
              />
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0 18px",
              }}
            >
              <Form.Item
                name="username"
                label={
                  <span style={{ fontWeight: 600, color: "#64748b" }}>
                    Tên tài khoản
                  </span>
                }
              >
                <Input
                  prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                  readOnly
                  style={{ backgroundColor: "#f8fafc", borderRadius: 8 }}
                />
              </Form.Item>

              <Form.Item
                name="email"
                label={
                  <span style={{ fontWeight: 600, color: "#64748b" }}>
                    Email
                  </span>
                }
              >
                <Input
                  prefix={<MailOutlined style={{ color: "#94a3b8" }} />}
                  readOnly
                  style={{ backgroundColor: "#f8fafc", borderRadius: 8 }}
                />
              </Form.Item>

              <Form.Item
                name="warehouse"
                label={
                  <span style={{ fontWeight: 600, color: "#64748b" }}>
                    Kho phụ trách
                  </span>
                }
              >
                <Input
                  prefix={<ShopOutlined style={{ color: "#94a3b8" }} />}
                  readOnly
                  style={{ backgroundColor: "#f8fafc", borderRadius: 8 }}
                />
              </Form.Item>

              <Form.Item
                name="area"
                label={
                  <span style={{ fontWeight: 600, color: "#64748b" }}>
                    Địa bàn hoạt động
                  </span>
                }
              >
                <Input
                  prefix={<CompassOutlined style={{ color: "#94a3b8" }} />}
                  readOnly
                  style={{ backgroundColor: "#f8fafc", borderRadius: 8 }}
                />
              </Form.Item>

              <Form.Item
                name="full_name"
                label={
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>
                    Họ và tên
                  </span>
                }
                rules={[
                  { required: isEditing, message: "Vui lòng nhập họ và tên!" },
                ]}
              >
                <Input
                  readOnly={!isEditing}
                  maxLength={150}
                  style={{
                    backgroundColor: isEditing ? "#ffffff" : "#f8fafc",
                    borderColor: isEditing ? "#2563eb" : "#e2e8f0",
                    borderRadius: 8,
                    fontWeight: 500,
                  }}
                />
              </Form.Item>

              <Form.Item
                name="phone"
                label={
                  <span style={{ fontWeight: 600, color: "#0f172a" }}>
                    Số điện thoại
                  </span>
                }
                rules={[
                  {
                    required: isEditing,
                    message: "Vui lòng nhập số điện thoại!",
                  },
                  {
                    pattern: isEditing ? /^0[0-9]{9}$/ : undefined,
                    message:
                      "Số điện thoại phải gồm 10 chữ số (bắt đầu bằng 0)!",
                  },
                ]}
              >
                <Input
                  prefix={<PhoneOutlined style={{ color: "#94a3b8" }} />}
                  readOnly={!isEditing}
                  maxLength={10}
                  style={{
                    backgroundColor: isEditing ? "#ffffff" : "#f8fafc",
                    borderColor: isEditing ? "#2563eb" : "#e2e8f0",
                    borderRadius: 8,
                    fontWeight: 500,
                  }}
                />
              </Form.Item>
            </div>

            {isEditing && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 12,
                  paddingTop: 16,
                  borderTop: "1px solid #f1f5f9",
                }}
              >
                <Button onClick={handleCancelEdit} style={{ borderRadius: 6 }}>
                  Hủy
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={isSaving}
                  style={{ backgroundColor: "#2563eb", borderRadius: 6 }}
                >
                  Lưu thay đổi
                </Button>
              </div>
            )}
          </Form>
        ) : loadError ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <Alert
              message={loadError}
              description="Phiên làm việc có thể đã hết hạn hoặc mạng không ổn định."
              type="error"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8, textAlign: "left" }}
            />
            <Button
              type="primary"
              onClick={() => loadProfile()}
              style={{ borderRadius: 6, backgroundColor: "#2563eb" }}
            >
              Thử tải lại
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default ProfileModal;
