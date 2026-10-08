import { useCallback } from "react";

const styles = `
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1f2937;
    background: #f8fafc;
  }

  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }

  .error-page {
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .error-card {
    width: min(100%, 560px);
    padding: clamp(28px, 6vw, 48px);
    text-align: center;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    box-shadow: 0 12px 32px rgb(15 23 42 / 8%);
  }

  .error-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 20px;
    display: grid;
    place-items: center;
    color: #b45309;
    background: #fffbeb;
    border-radius: 50%;
  }

  .error-icon svg { width: 32px; height: 32px; }

  .error-code {
    margin: 0 0 8px;
    color: #b45309;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: .08em;
  }

  .error-card h1 {
    margin: 0;
    font-size: clamp(24px, 5vw, 32px);
    line-height: 1.25;
  }

  .error-message {
    margin: 16px 0 28px;
    color: #4b5563;
    font-size: 16px;
    line-height: 1.6;
  }

  .back-button {
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 0 20px;
    border: 0;
    border-radius: 8px;
    color: #fff;
    background: #2563eb;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .back-button:hover { background: #1d4ed8; }
  .back-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
  .back-button svg { width: 18px; height: 18px; }
`;

export default function Error403() {
  const goBack = useCallback(() => {
    window.history.back();
  }, []);

  return (
    <>
      <style>{styles}</style>
      <main className="error-page">
        <section className="error-card" aria-labelledby="error-title">
          <div className="error-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3 2.8 20h18.4L12 3Z" />
              <path d="M12 9v4m0 3h.01" />
            </svg>
          </div>
          <p className="error-code">LỖI 403</p>
          <h1 id="error-title">Bạn không có quyền truy cập</h1>
          <p className="error-message">
            Tài khoản của bạn chưa được cấp quyền sử dụng chức năng này. Hãy
            quay lại trang trước hoặc liên hệ quản trị viên để được hỗ trợ.
          </p>
          <button className="back-button" type="button" onClick={goBack}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
              <path d="M9 12h12" />
            </svg>
            Quay lại luồng làm việc
          </button>
        </section>
      </main>
    </>
  );
}
