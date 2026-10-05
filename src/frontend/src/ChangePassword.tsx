import { FormEvent, useState } from "react";
import { authenticatedFetch } from "./session";

type ApiError = { detail?: string };

const styles = `
  * { box-sizing: border-box; }
  body { min-width: 320px; min-height: 100vh; margin: 0; background: #f8fafc; color: #1f2937; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .change-page { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .change-card { width: min(100%, 440px); padding: clamp(24px, 6vw, 40px); border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 8%); }
  .change-brand { margin: 0 0 8px; color: #2563eb; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .change-card h1 { margin: 0; font-size: 28px; line-height: 1.25; }
  .change-subtitle { margin: 10px 0 28px; color: #6b7280; line-height: 1.5; }
  .change-field { display: grid; gap: 8px; margin-bottom: 18px; }
  .change-field label { font-size: 14px; font-weight: 600; }
  .change-field input { width: 100%; min-height: 46px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; color: inherit; background: #fff; font: inherit; }
  .change-field input:focus { outline: 3px solid #bfdbfe; border-color: #2563eb; }
  .change-message { margin: 0 0 18px; padding: 12px; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; background: #fef2f2; font-size: 14px; line-height: 1.5; }
  .change-success { border-color: #bbf7d0; color: #166534; background: #f0fdf4; }
  .change-submit { width: 100%; min-height: 48px; border: 0; border-radius: 8px; color: #fff; background: #2563eb; font: inherit; font-weight: 700; cursor: pointer; }
  .change-submit:disabled { cursor: wait; opacity: .7; }
`;

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await authenticatedFetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as ApiError;

      if (!response.ok) {
        setMessage(result.detail ?? "Không thể đổi mật khẩu. Vui lòng thử lại.");
        return;
      }

      setMessage("Đổi mật khẩu thành công.");
      setIsSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch {
      setMessage("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <style>{styles}</style>
      <main className="change-page">
        <section className="change-card" aria-labelledby="change-title">
          <p className="change-brand">OMS · Bán hàng &amp; Kho</p>
          <h1 id="change-title">Đổi mật khẩu</h1>
          <p className="change-subtitle">Nhập mật khẩu hiện tại và mật khẩu mới của bạn.</p>
          <form onSubmit={handleSubmit}>
            <div className="change-field">
              <label htmlFor="current-password">Mật khẩu hiện tại</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="change-field">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
            </div>
            {message && (
              <p className={`change-message${isSuccess ? " change-success" : ""}`} role="status">
                {message}
              </p>
            )}
            <button className="change-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
            </button>
          </form>
          <p style={{ margin: "18px 0 0", textAlign: "center" }}>
            <a href={getRoleHome()}>Quay lại giao diện trước</a>
          </p>
        </section>
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
