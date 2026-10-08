import { useEffect, useRef, useState } from "react";
import {
  Avatar,
  Modal,
  Upload,
  Button,
  Alert,
  Typography,
  Space,
  Tooltip,
  message,
} from "antd";
import {
  CameraOutlined,
  UploadOutlined,
  SaveOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type { RcFile } from "antd/es/upload/interface";
import { authenticatedFetch } from "../session";

const { Text } = Typography;

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const AVATAR_UPDATED_EVENT = "oms:profile-avatar-updated";

type ApiError = { detail?: string };

export interface ProfileAvatarProps {
  initials?: string;
  className?: string;
  editable?: boolean;
  size?: number;
}

export default function ProfileAvatar({
  initials = "?",
  className = "",
  editable = true,
  size = 54,
}: ProfileAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fallbackInitials, setFallbackInitials] = useState(initials);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const avatarUrlRef = useRef("");
  const previewUrlRef = useRef("");

  useEffect(() => {
    let disposed = false;

    async function loadAvatar() {
      try {
        // Bước 1: Lấy profile để có avatar_url hiện tại
        const profileRes = await authenticatedFetch("/api/v1/profile", {
          cache: "no-store",
        });
        if (!profileRes.ok) {
          if (!disposed) {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            avatarUrlRef.current = "";
            setAvatarUrl("");
          }
          return;
        }
        const profile = (await profileRes.json()) as { avatar_url?: string; full_name?: string };

        // Cập nhật initials từ full_name
        if (profile.full_name) {
          const nextInitials = profile.full_name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(-2)
            .map((part: string) => part[0])
            .join("")
            .toUpperCase();
          if (!disposed && nextInitials) setFallbackInitials(nextInitials);
        }

        // Bước 2: Nếu có avatar_url, tải binary qua authenticatedFetch
        if (!profile.avatar_url) {
          if (!disposed) {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            avatarUrlRef.current = "";
            setAvatarUrl("");
          }
          return;
        }

        const imgRes = await authenticatedFetch(profile.avatar_url, {
          cache: "no-store",
        });
        if (!imgRes.ok) {
          if (!disposed) {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            avatarUrlRef.current = "";
            setAvatarUrl("");
          }
          return;
        }
        const nextUrl = URL.createObjectURL(await imgRes.blob());
        if (disposed) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
        avatarUrlRef.current = nextUrl;
        setAvatarUrl(nextUrl);
      } catch {
        if (!disposed) setAvatarUrl("");
      }
    }

    const handleAvatarUpdated = () => {
      void loadAvatar();
    };

    void loadAvatar();
    window.addEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);

    return () => {
      disposed = true;
      window.removeEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    };
  }, []);

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  const closeDialog = () => {
    if (isUploading) return;
    setIsOpen(false);
    setSelectedFile(null);
    setStatusMsg(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  };

  // Kiểm tra file trước khi tải
  const handleBeforeUpload = (file: RcFile) => {
    setStatusMsg(null);
    const isJpgOrPng = file.type === "image/jpeg" || file.type === "image/png";
    if (!isJpgOrPng) {
      const err = "Chỉ chấp nhận định dạng ảnh JPG hoặc PNG!";
      message.error(err);
      setStatusMsg({ text: err, type: "error" });
      return Upload.LIST_IGNORE;
    }

    const isLt2M = file.size <= MAX_FILE_BYTES;
    if (!isLt2M) {
      const err = "Dung lượng ảnh đại diện không được vượt quá 2 MB!";
      message.error(err);
      setStatusMsg({ text: err, type: "error" });
      return Upload.LIST_IGNORE;
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreview = URL.createObjectURL(file);
    previewUrlRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setSelectedFile(file);
    return false; // Chặn Ant Upload tự gửi POST request
  };

  // Tải ảnh lên API
  const handleUploadAvatar = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setStatusMsg(null);

    try {
      const body = new FormData();
      body.append("file", selectedFile);
      const response = await authenticatedFetch("/api/v1/profile/avatar", {
        method: "POST",
        body,
      });

      const result = (await response.json().catch(() => ({}))) as ApiError & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.detail ?? "Không thể tải ảnh đại diện lên.");
      }

      message.success(result.message ?? "Đã cập nhật ảnh đại diện thành công!");
      setStatusMsg({
        text: result.message ?? "Đã cập nhật ảnh đại diện.",
        type: "success",
      });
      setSelectedFile(null);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
      window.dispatchEvent(new Event(AVATAR_UPDATED_EVENT));
      setTimeout(() => {
        setIsOpen(false);
      }, 700);
    } catch (error: any) {
      const msg = error.message || "Không thể kết nối máy chủ.";
      setStatusMsg({ text: msg, type: "error" });
      message.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {editable ? (
        <Tooltip title="Nhấn để cập nhật ảnh đại diện">
          <div
            className={className}
            onClick={() => {
              setIsOpen(true);
              setStatusMsg(null);
            }}
            style={{
              position: "relative",
              display: "inline-block",
              cursor: "pointer",
              borderRadius: "50%",
            }}
          >
            <Avatar
              size={size}
              src={avatarUrl || undefined}
              icon={
                !avatarUrl && !fallbackInitials ? <UserOutlined /> : undefined
              }
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: size > 48 ? 18 : 14,
                boxShadow: "0 4px 10px rgba(37, 99, 235, 0.2)",
                border: "2px solid #ffffff",
              }}
            >
              {!avatarUrl ? fallbackInitials : null}
            </Avatar>

            {/* Icon Camera nhỏ góc dưới */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 22,
                height: 22,
                borderRadius: "50%",
                backgroundColor: "#1e293b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                border: "2px solid #ffffff",
                boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
              }}
            >
              <CameraOutlined />
            </div>
          </div>
        </Tooltip>
      ) : (
        <Avatar
          size={size}
          src={avatarUrl || undefined}
          className={className}
          icon={!avatarUrl && !fallbackInitials ? <UserOutlined /> : undefined}
          style={{
            backgroundColor: "#2563eb",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: size > 48 ? 18 : 14,
            border: "2px solid #ffffff",
          }}
        >
          {!avatarUrl ? fallbackInitials : null}
        </Avatar>
      )}

      {/* Modal Cập Nhật Avatar */}
      <Modal
        open={isOpen}
        onCancel={closeDialog}
        footer={null}
        width={420}
        destroyOnClose
        centered
        title={
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>
            Ảnh đại diện tài khoản
          </div>
        }
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "16px 8px 8px",
          }}
        >
          {/* Vùng xem trước ảnh đại diện */}
          <div style={{ marginBottom: 20 }}>
            <Avatar
              size={120}
              src={previewUrl || avatarUrl || undefined}
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 36,
                boxShadow: "0 10px 25px rgba(37, 99, 235, 0.25)",
                border: "4px solid #f1f5f9",
              }}
            >
              {!previewUrl && !avatarUrl ? fallbackInitials : null}
            </Avatar>
          </div>

          <Text
            type="secondary"
            style={{ fontSize: 12, textAlign: "center", marginBottom: 16 }}
          >
            Hỗ trợ định dạng JPG, PNG. Dung lượng tối đa 2 MB. Hệ thống sẽ tự
            động căn vuông tỷ lệ ảnh.
          </Text>

          {statusMsg && (
            <Alert
              message={statusMsg.text}
              type={statusMsg.type}
              showIcon
              style={{ width: "100%", marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Nút Upload và Nút Lưu */}
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Upload
              showUploadList={false}
              beforeUpload={handleBeforeUpload}
              accept="image/jpeg,image/png"
            >
              <Button
                icon={<UploadOutlined />}
                block
                disabled={isUploading}
                style={{ height: 42, borderRadius: 8, fontWeight: 600 }}
              >
                {selectedFile ? "Chọn ảnh khác từ máy" : "Chọn ảnh từ thiết bị"}
              </Button>
            </Upload>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              block
              loading={isUploading}
              disabled={!selectedFile || isUploading}
              onClick={() => void handleUploadAvatar()}
              style={{
                height: 42,
                borderRadius: 8,
                backgroundColor: "#2563eb",
                fontWeight: 700,
              }}
            >
              {isUploading ? "Đang tải ảnh lên..." : "Lưu ảnh đại diện mới"}
            </Button>
          </Space>
        </div>
      </Modal>
    </>
  );
}
