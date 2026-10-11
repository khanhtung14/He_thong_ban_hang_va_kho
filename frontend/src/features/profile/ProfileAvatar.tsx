import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "services/sessionService";
import "./ProfileAvatar.css";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const AVATAR_UPDATED_EVENT = "oms:profile-avatar-updated";

type ApiError = { detail?: string };

export default function ProfileAvatar({ initials = "?", className = "", editable = true }: { initials?: string; className?: string; editable?: boolean }) {
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fallbackInitials, setFallbackInitials] = useState(initials);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarUrlRef = useRef("");
  const previewUrlRef = useRef("");

  useEffect(() => {
    let disposed = false;
    async function loadInitials() {
      try {
        const response = await authenticatedFetch("/api/v1/profile");
        if (!response.ok) return;
        const profile = await response.json() as { full_name?: string };
        const nextInitials = (profile.full_name ?? "").trim().split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase();
        if (!disposed && nextInitials) setFallbackInitials(nextInitials);
      } catch { /* Keep the supplied fallback when the profile endpoint is unavailable. */ }
    }
    async function loadAvatar() {
      try {
        const response = await authenticatedFetch("/api/v1/profile/avatar", { cache: "no-store" });
        if (!response.ok) {
          if (!disposed) {
            if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
            avatarUrlRef.current = "";
            setAvatarUrl("");
          }
          return;
        }
        const nextUrl = URL.createObjectURL(await response.blob());
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
    const handleAvatarUpdated = () => { void loadAvatar(); void loadInitials(); };
    void loadInitials();
    void loadAvatar();
    window.addEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
    return () => {
      disposed = true;
      window.removeEventListener(AVATAR_UPDATED_EVENT, handleAvatarUpdated);
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current);
    };
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function closeDialog() {
    if (isUploading) return;
    setIsOpen(false);
    setSelectedFile(null);
    setMessage("");
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }

  function selectFile(file?: File) {
    setMessage("");
    setIsError(false);
    if (!file) return;
    const isSupportedType = ["image/jpeg", "image/png"].includes(file.type);
    if (!isSupportedType) {
      setSelectedFile(null);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
      setIsError(true);
      setMessage("Chỉ chấp nhận ảnh JPG hoặc PNG.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setSelectedFile(null);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
      setIsError(true);
      setMessage("Ảnh đại diện không được vượt quá 2 MB.");
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextPreview = URL.createObjectURL(file);
    previewUrlRef.current = nextPreview;
    setPreviewUrl(nextPreview);
    setSelectedFile(file);
  }

  async function uploadAvatar() {
    if (!selectedFile) return;
    setIsUploading(true);
    setMessage("");
    setIsError(false);
    try {
      const body = new FormData();
      body.append("file", selectedFile);
      const response = await authenticatedFetch("/api/v1/profile/avatar", { method: "POST", body });
      const result = await response.json().catch(() => ({})) as ApiError & { message?: string; avatar_url?: string };
      if (!response.ok) throw new Error(result.detail ?? "Không thể tải ảnh đại diện lên.");
      setMessage(result.message ?? "Đã cập nhật ảnh đại diện.");
      if (result.avatar_url) {
        window.sessionStorage.setItem("avatar_url", result.avatar_url);
        window.localStorage.setItem("avatar_url", result.avatar_url);
      }
      setSelectedFile(null);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
      window.dispatchEvent(new CustomEvent(AVATAR_UPDATED_EVENT, { detail: { avatarUrl: result.avatar_url } }));
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Không thể kết nối máy chủ.");
    } finally {
      setIsUploading(false);
    }
  }

  return <>
    {editable ? <button className={`profile-avatar-trigger ${className}`} type="button" aria-label="Xem hoặc đổi ảnh đại diện" title="Ảnh đại diện · nhấn để đổi" onClick={() => { setIsOpen(true); setMessage(""); setIsError(false); }}>
      {avatarUrl ? <img src={avatarUrl} alt="Ảnh đại diện" onError={() => setAvatarUrl("")} /> : <span>{fallbackInitials}</span>}
      <i aria-hidden="true">✎</i>
    </button> : <div className={`profile-avatar-trigger is-readonly ${className}`} aria-label="Ảnh đại diện">
      {avatarUrl ? <img src={avatarUrl} alt="Ảnh đại diện" onError={() => setAvatarUrl("")} /> : <span>{fallbackInitials}</span>}
    </div>}
    {editable && isOpen && <div className="avatar-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section className="avatar-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-dialog-title">
        <button className="avatar-dialog-close" type="button" aria-label="Đóng" onClick={closeDialog} disabled={isUploading}>×</button>
        <div className="avatar-dialog-preview">{previewUrl ? <img src={previewUrl} alt="Ảnh xem trước" /> : avatarUrl ? <img src={avatarUrl} alt="Ảnh đại diện hiện tại" /> : <span>{fallbackInitials}</span>}</div>
        <h2 id="avatar-dialog-title">Ảnh đại diện</h2>
        <p>Chọn ảnh JPG hoặc PNG, dung lượng tối đa 2 MB. Ảnh sẽ được cắt vuông tự động.</p>
        <input ref={fileInput} className="avatar-file-input" type="file" accept="image/jpeg,image/png" aria-label="Chọn ảnh JPG hoặc PNG" onChange={(event) => selectFile(event.target.files?.[0])} />
        <button className="avatar-select-button" type="button" onClick={() => fileInput.current?.click()} disabled={isUploading}>{selectedFile ? "Chọn ảnh khác" : "Chọn ảnh từ thiết bị"}</button>
        {message && <p className={`avatar-message${isError ? " is-error" : ""}`} role={isError ? "alert" : "status"}>{message}</p>}
        <button className="avatar-upload-button" type="button" onClick={() => void uploadAvatar()} disabled={!selectedFile || isUploading}>{isUploading ? "Đang tải ảnh…" : "Lưu ảnh đại diện"}</button>
      </section>
    </div>}
  </>;
}
