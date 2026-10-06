import { FormEvent, useEffect, useState } from "react";
import { authenticatedFetch, logout } from "./session";
import ProfileAvatar from "./ProfileAvatar";

type ProfileData = {
  username: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  phone: string;
  role: string;
  warehouse: string;
  area: string;
};

type ApiError = { detail?: string | { msg?: string }[] };

const styles = `
  * { box-sizing: border-box; }
  body { min-width: 320px; min-height: 100vh; margin: 0; background: #f5f7fb; color: #202a3b; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .profile-page { min-height: 100vh; padding: 32px 18px 56px; }
  .profile-shell { width: min(100%, 880px); margin: 0 auto; }
  .profile-topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 28px; }
  .profile-brand { color: #2563eb; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  .profile-top-actions { display: flex; align-items: center; gap: 9px; }
  .profile-back { border: 1px solid #d7deea; border-radius: 8px; padding: 9px 13px; background: white; color: #475569; font: inherit; text-decoration: none; }
  .profile-logout { border: 1px solid #d7deea; border-radius: 8px; padding: 9px 13px; background: white; color: #475569; font: inherit; cursor: pointer; }
  .profile-heading { margin-bottom: 22px; }
  .profile-heading h1 { margin: 0; color: #192335; font-size: clamp(25px, 5vw, 34px); line-height: 1.2; }
  .profile-heading p { margin: 9px 0 0; color: #69758a; line-height: 1.6; }
  .profile-card { overflow: hidden; border: 1px solid #e0e6ef; border-radius: 16px; background: white; box-shadow: 0 12px 30px rgb(22 34 55 / 5%); }
  .profile-card-title { padding: 22px 26px; border-bottom: 1px solid #edf0f5; }
  .profile-card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
  .profile-identity { min-width: 0; display: flex; align-items: center; gap: 14px; }
  .profile-identity h2 { margin: 0; }
  .profile-identity p { margin: 5px 0 0; color: #718096; font-size: 13px; }
  .profile-card-actions { display: flex; align-items: center; gap: 9px; }
  .profile-change-password { min-height: 38px; display: inline-flex; align-items: center; padding: 0 14px; border: 1px solid #d7deea; border-radius: 8px; color: #3f5f99; background: white; font-size: 13px; font-weight: 650; text-decoration: none; }
  .profile-change-password:hover { color: #1d4ed8; border-color: #b8c9e8; background: #f8faff; }
  .profile-change-password:focus-visible { outline: 3px solid #bfdbfe; outline-offset: 2px; }
  .profile-card-title h2 { margin: 0; font-size: 18px; }
  .profile-card-title p { margin: 5px 0 0; color: #718096; font-size: 14px; }
  .profile-form { display: grid; gap: 20px; padding: 26px; }
  .profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .profile-field { display: grid; align-content: start; gap: 7px; }
  .profile-field label { color: #39465a; font-size: 13px; font-weight: 650; }
  .profile-field input { width: 100%; min-height: 46px; border: 1px solid #d7deea; border-radius: 9px; padding: 0 12px; color: #202a3b; background: white; font: inherit; }
  .profile-field input:focus { outline: 3px solid #dbeafe; border-color: #3b82f6; }
  .profile-field input[readonly] { color: #64748b; background: #f7f9fc; }
  .profile-hint { color: #778398; font-size: 12px; }
  .profile-message { margin: 0; border-radius: 9px; padding: 12px 14px; font-size: 14px; line-height: 1.5; }
  .profile-error { border: 1px solid #fecaca; color: #991b1b; background: #fef2f2; }
  .profile-success { border: 1px solid #bbf7d0; color: #166534; background: #f0fdf4; }
  .profile-actions { display: flex; justify-content: flex-end; padding-top: 4px; }
  .profile-submit { min-height: 46px; border: 0; border-radius: 9px; padding: 0 20px; color: white; background: #2563eb; font: inherit; font-weight: 700; cursor: pointer; }
  .profile-submit:hover:not(:disabled) { background: #1d4ed8; }
  .profile-submit:disabled { cursor: wait; opacity: .65; }
  .profile-loading { padding: 48px 20px; color: #64748b; text-align: center; }
  .profile-update-trigger, .profile-cancel { min-height: 38px; padding: 0 14px; border: 1px solid #d7deea; border-radius: 8px; color: #3f5f99; background: white; font: inherit; font-size: 13px; font-weight: 650; cursor: pointer; }
  .profile-edit-actions { display: flex; justify-content: flex-end; gap: 9px; }
  .profile-overlay { position: fixed; z-index: 60; inset: 0; display: grid; place-items: center; overflow-y: auto; padding: 24px; background: rgb(17 29 49 / 48%); backdrop-filter: blur(3px); }
  .profile-dialog { position: relative; width: min(100%, 880px); max-height: calc(100vh - 48px); overflow-y: auto; padding: 27px; border: 1px solid #e0e6ef; border-radius: 16px; background: #f5f7fb; box-shadow: 0 22px 70px rgb(16 29 51 / 22%); }
  .profile-dialog-close { position: absolute; z-index: 1; top: 18px; right: 19px; width: 36px; height: 36px; border: 1px solid #d7deea; border-radius: 9px; color: #475569; background: white; font-size: 21px; cursor: pointer; }
  .role-profile-embedded .profile-heading { padding-right: 45px; }
  @media (max-width: 600px) { .profile-page { padding: 22px 14px 36px; } .profile-topbar { margin-bottom: 24px; } .profile-card-title, .profile-form { padding: 20px; } .profile-grid { grid-template-columns: 1fr; gap: 16px; } .profile-actions, .profile-submit { width: 100%; } .profile-card-title-row { align-items: flex-start; flex-direction: column; } .profile-card-actions { flex-wrap: wrap; } .profile-identity { align-items: flex-start; } }
`;

function errorMessage(error: ApiError): string {
  if (typeof error.detail === "string") return error.detail;
  if (Array.isArray(error.detail) && error.detail[0]?.msg) return error.detail[0].msg;
  return "Không thể lưu hồ sơ. Vui lòng kiểm tra thông tin và thử lại.";
}

export default function Profile({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const avatarName = profile?.full_name || window.sessionStorage.getItem("user_name") || "?";
  const avatarInitials = avatarName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase() || "?";

  useEffect(() => {
    authenticatedFetch("/api/v1/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải hồ sơ người dùng.");
        const data = await response.json() as ProfileData;
        setProfile(data);
        setFullName(data.full_name);
        setPhone(data.phone);
      })
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSuccess(false);
    setIsSaving(true);
    try {
      const response = await authenticatedFetch("/api/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, phone }),
      });
      const result = await response.json() as ApiError & { profile?: ProfileData; message?: string };
      if (!response.ok) throw new Error(errorMessage(result));
      if (result.profile) {
        setProfile(result.profile);
        window.dispatchEvent(new Event("oms:profile-avatar-updated"));
      }
      setMessage(result.message ?? "Cập nhật hồ sơ thành công.");
      setIsSuccess(true);
      setIsEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể kết nối máy chủ.");
    } finally {
      setIsSaving(false);
    }
  }

  const profileCard = (
    <section className="profile-card" aria-labelledby="profile-card-title">
      <header className="profile-card-title"><div className="profile-card-title-row"><div className="profile-identity"><ProfileAvatar initials={avatarInitials} /><div><h2 id="profile-card-title">Thông tin tài khoản</h2><p>Nhấn vào ảnh để xem hoặc cập nhật ảnh đại diện.</p></div></div><div className="profile-card-actions"><a className="profile-change-password" href="/change-password">Đổi mật khẩu</a>{profile && !isEditing && <button type="button" className="profile-update-trigger" onClick={() => { setMessage(""); setIsSuccess(false); setIsEditing(true); }}>Cập nhật hồ sơ</button>}</div></div></header>
      {isLoading ? <div className="profile-loading" role="status">Đang tải hồ sơ…</div> : profile ? (
        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-grid">
            <div className="profile-field"><label htmlFor="profile-username">Tên tài khoản</label><input id="profile-username" value={profile.username} readOnly /></div>
            <div className="profile-field"><label htmlFor="profile-email">Email</label><input id="profile-email" value={profile.email} readOnly /></div>
            <div className="profile-field"><label htmlFor="profile-role">Vai trò</label><input id="profile-role" value={profile.role} readOnly /></div>
            <div className="profile-field"><label htmlFor="profile-warehouse">Kho</label><input id="profile-warehouse" value={profile.warehouse} readOnly /></div>
            <div className="profile-field"><label htmlFor="profile-area">Địa bàn</label><input id="profile-area" value={profile.area} readOnly /></div>
            <div className="profile-field"><label htmlFor="profile-full-name">Họ và tên</label><input id="profile-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={150} autoComplete="name" readOnly={!isEditing} required={isEditing} /></div>
            <div className="profile-field"><label htmlFor="profile-phone">Số điện thoại</label><input id="profile-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(event) => setPhone(event.target.value)} pattern={isEditing ? "0[0-9]{9}" : undefined} maxLength={10} title="Nhập 10 chữ số, bắt đầu bằng 0" readOnly={!isEditing} required={isEditing} /><span className="profile-hint">10 chữ số, bắt đầu bằng 0.</span></div>
          </div>
          {message && <p className={`profile-message ${isSuccess ? "profile-success" : "profile-error"}`} role={isSuccess ? "status" : "alert"}>{message}</p>}
          {isEditing && <div className="profile-edit-actions"><button type="button" className="profile-cancel" onClick={() => { setFullName(profile.full_name); setPhone(profile.phone); setIsEditing(false); setMessage(""); setIsSuccess(false); }}>Hủy</button><button className="profile-submit" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu…" : "Lưu thay đổi"}</button></div>}
        </form>
      ) : <div className="profile-form">{message && <p className="profile-message profile-error" role="alert">{message}</p>}</div>}
    </section>
  );

  if (embedded) {
    return <><style>{styles}</style><div className="profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}><section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><button type="button" className="profile-dialog-close" aria-label="Đóng hồ sơ" onClick={onClose}>×</button><div className="role-profile-embedded"><section className="profile-heading"><h1 id="profile-dialog-title">Hồ sơ cá nhân</h1><p>Thông tin chi tiết của tài khoản đang đăng nhập.</p></section>{profileCard}</div></section></div></>;
  }

  return (
    <>
      <style>{styles}</style>
      <main className="profile-page">
        <div className="profile-shell">
          <header className="profile-topbar">
            <span className="profile-brand">OMS · Bán hàng &amp; Kho</span>
            <div className="profile-top-actions"><a className="profile-back" href={getRoleHome()}>← Quay lại hệ thống</a><button className="profile-logout" type="button" onClick={() => void logout()}>Đăng xuất</button></div>
          </header>
          <section className="profile-heading">
            <h1>Hồ sơ cá nhân</h1>
            <p>Cập nhật thông tin liên lạc để kho có thể xác nhận đơn hàng khi cần.</p>
          </section>
          {profileCard}
        </div>
      </main>
    </>
  );
}

function getRoleHome(): string {
  const role = window.sessionStorage.getItem("user_role")?.toUpperCase();
  if (role === "CUSTOMER") return "/portal/orders";
  if (role === "SALES" || role === "SALES_REP") return "/sales/orders";
  if (role === "SALES_MANAGER") return "/manager/dashboard";
  if (role === "WAREHOUSE") return "/warehouse/picking";
  if (role === "WH_MANAGER" || role === "WAREHOUSE_MANAGER") return "/warehouse/dashboard";
  if (role === "ACCOUNTANT") return "/accounting/debt-book";
  if (role === "ADMIN" || role === "ADMINISTRATOR") return "/admin/users";
  return "/login";
}
