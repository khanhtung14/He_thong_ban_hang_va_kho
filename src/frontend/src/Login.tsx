import { FormEvent, useState } from "react";

const styles = `
  * { box-sizing: border-box; }
  body { min-width: 320px; min-height: 100vh; margin: 0; background: #f8fafc; color: #1f2937; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .login-card { width: min(100%, 440px); padding: clamp(24px, 6vw, 40px); border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 8%); }
  .login-brand { margin: 0 0 8px; color: #2563eb; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .login-card h1 { margin: 0; font-size: 28px; line-height: 1.25; }
  .login-subtitle { margin: 10px 0 28px; color: #6b7280; line-height: 1.5; }
  .login-field { display: grid; gap: 8px; margin-bottom: 18px; }
  .login-field label { font-size: 14px; font-weight: 600; }
  .login-input { width: 100%; min-height: 46px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; color: inherit; background: #fff; font: inherit; }
  .login-input:focus { outline: 3px solid #bfdbfe; border-color: #2563eb; }
  .password-wrap { position: relative; }
  .password-wrap .login-input { padding-right: 76px; }
  .password-toggle { position: absolute; top: 0; right: 8px; height: 46px; border: 0; color: #2563eb; background: transparent; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .login-error { margin: 0 0 18px; padding: 12px; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; background: #fef2f2; font-size: 14px; line-height: 1.5; }
  .login-notice { margin: 0 0 18px; padding: 12px; border: 1px solid #fde68a; border-radius: 8px; color: #854d0e; background: #fffbeb; font-size: 14px; line-height: 1.5; }
  .login-submit { width: 100%; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 8px; color: #fff; background: #2563eb; font: inherit; font-weight: 700; cursor: pointer; }
  .login-submit:hover:not(:disabled) { background: #1d4ed8; }
  .login-submit:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
  .login-submit:disabled { cursor: wait; opacity: .7; }
  .login-spinner { width: 17px; height: 17px; border: 2px solid rgb(255 255 255 / 45%); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 360px) { .login-page { padding: 16px 12px; } .login-card { padding: 22px 18px; } }
`;

type LoginResponse = {
  redirect_url: string;
  session_token?: string;
  expires_in?: number;
};

type ApiError = {
  detail?: string | { message?: string; retry_after_seconds?: number };
};

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const sessionExpired = new URLSearchParams(window.location.search).get("session") === "expired";
  const loggedOut = new URLSearchParams(window.location.search).get("session") === "logged-out";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setError("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizedUsername, password }),
      });

      if (response.ok) {
        const result = (await response.json()) as LoginResponse;
        if (result.session_token) {
          window.sessionStorage.setItem("session_token", result.session_token);
          window.sessionStorage.setItem(
            "session_expires_at",
            String(Date.now() + (result.expires_in ?? 12 * 60 * 60) * 1000),
          );
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
  }

  return (
    <>
      <style>{styles}</style>
      <main className="login-page">
        <section className="login-card" aria-labelledby="login-title">
          <p className="login-brand">OMS · Bán hàng &amp; Kho</p>
          <h1 id="login-title">Đăng nhập</h1>
          <p className="login-subtitle">Đăng nhập để truy cập công việc theo vai trò của bạn.</p>
          {sessionExpired && <p className="login-notice" role="status">Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.</p>}
          {loggedOut && <p className="login-notice" role="status">Bạn đã đăng xuất thành công.</p>}
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="username">Tên đăng nhập</label>
              <input
                className="login-input"
                id="username"
                name="username"
                autoComplete="username"
                maxLength={100}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="login-field">
              <label htmlFor="password">Mật khẩu</label>
              <div className="password-wrap">
                <input
                  className="login-input"
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  className="password-toggle"
                  type="button"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting && <span className="login-spinner" aria-hidden="true" />}
              {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
          <p style={{ margin: "18px 0 0", textAlign: "center" }}>
            <a href="/forgot-password">Quên mật khẩu?</a>
          </p>
        </section>
      </main>
    </>
  );
}
