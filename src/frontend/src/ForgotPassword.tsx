import { FormEvent, useState } from "react";

type ForgotPasswordResponse = {
  message?: string;
  demo_mode?: boolean;
};

type ApiError = { detail?: string };

const styles = `
  * { box-sizing: border-box; }
  body { min-width: 320px; min-height: 100vh; margin: 0; background: #f8fafc; color: #1f2937; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .forgot-page { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .forgot-card { width: min(100%, 440px); padding: clamp(24px, 6vw, 40px); border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 8%); }
  .forgot-brand { margin: 0 0 8px; color: #2563eb; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .forgot-card h1 { margin: 0; font-size: 28px; line-height: 1.25; }
  .forgot-subtitle { margin: 10px 0 28px; color: #6b7280; line-height: 1.5; }
  .forgot-field { display: grid; gap: 8px; margin-bottom: 18px; }
  .forgot-field label { font-size: 14px; font-weight: 600; }
  .forgot-field input { width: 100%; min-height: 46px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; color: inherit; background: #fff; font: inherit; }
  .forgot-field input:focus { outline: 3px solid #bfdbfe; border-color: #2563eb; }
  .forgot-message { margin: 0 0 18px; padding: 12px; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534; background: #f0fdf4; font-size: 14px; line-height: 1.5; }
  .forgot-error { border-color: #fecaca; color: #991b1b; background: #fef2f2; }
  .forgot-submit { width: 100%; min-height: 48px; border: 0; border-radius: 8px; color: #fff; background: #2563eb; font: inherit; font-weight: 700; cursor: pointer; }
  .forgot-submit:hover:not(:disabled) { background: #1d4ed8; }
  .forgot-submit:disabled { cursor: wait; opacity: .7; }
  .forgot-back { margin: 18px 0 0; text-align: center; }
`;

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setDemoMode(false);
    setIsError(false);
    setIsSubmitting(true);

    try {
      const response = await fetch("/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const result = await response.json().catch(() => ({})) as ForgotPasswordResponse & ApiError;
      if (!response.ok) {
        setIsError(true);
        setMessage(result.detail ?? "Không thể gửi yêu cầu. Vui lòng kiểm tra địa chỉ email.");
        return;
      }
      setMessage(result.message ?? "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu sẽ được gửi đến hộp thư của bạn.");
      setDemoMode(result.demo_mode === true);
    } catch {
      setIsError(true);
      setMessage("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <style>{styles}</style>
      <main className="forgot-page">
        <section className="forgot-card" aria-labelledby="forgot-title">
          <p className="forgot-brand">OMS · Bán hàng &amp; Kho</p>
          <h1 id="forgot-title">Quên mật khẩu</h1>
          <p className="forgot-subtitle">Nhập email tài khoản. Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu có hiệu lực trong 30 phút.</p>
          <form onSubmit={handleSubmit}>
            <div className="forgot-field">
              <label htmlFor="forgot-email">Email tài khoản</label>
              <input
                id="forgot-email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ban@example.com"
                required
              />
            </div>
            {message && <p className={`forgot-message${isError ? " forgot-error" : ""}`} role={isError ? "alert" : "status"}>{message}</p>}
            {message && !isError && demoMode && (
              <p className="forgot-subtitle" role="note">
                Môi trường demo chưa gửi email thật. Nếu không thấy liên kết, hãy kiểm tra database demo đã được seed và xem hộp thư giả lập tại <code>/dev/mock-outbox</code>.
              </p>
            )}
            <button className="forgot-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Đang gửi yêu cầu…" : "Gửi liên kết đặt lại mật khẩu"}
            </button>
          </form>
          <p className="forgot-back"><a href="/login">Quay lại đăng nhập</a></p>
        </section>
      </main>
    </>
  );
}
