import { useState, type FormEvent } from "react";
import { authenticatedFetch } from "./session";
import "./CreateUser.css";

type RoleOption = {
  code: string;
  label: string;
  description: string;
};

type CreatedUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  status: string;
  roles: Array<{ code: string; name: string }>;
};

type CreateUserResponse = {
  message: string;
  user: CreatedUser;
  email_sent: boolean;
};

type ApiError = {
  detail?: string | Array<{ msg?: string }>;
};

const roles: RoleOption[] = [
  { code: "SALES_REP", label: "Nhân viên kinh doanh", description: "Tạo đơn và chăm sóc khách hàng được phân công." },
  { code: "SALES_MANAGER", label: "Quản lý kinh doanh", description: "Quản lý hoạt động và kết quả kinh doanh." },
  { code: "WAREHOUSE", label: "Nhân viên kho", description: "Tiếp nhận, soạn hàng và kiểm kê." },
  { code: "WH_MANAGER", label: "Quản lý kho", description: "Quản lý hoạt động và điều chỉnh tồn kho." },
  { code: "ACCOUNTANT", label: "Kế toán", description: "Theo dõi hóa đơn, thanh toán và công nợ." },
  { code: "ADMIN", label: "Quản trị hệ thống", description: "Quản lý tài khoản và cấu hình hệ thống." },
  { code: "CUSTOMER", label: "Đại lý", description: "Đặt hàng và theo dõi đơn hàng của mình." },
];

function getErrorMessage(error: ApiError, status: number): string {
  if (typeof error.detail === "string") return error.detail;
  if (Array.isArray(error.detail)) {
    return error.detail.map((item) => item.msg).filter(Boolean).join(" ");
  }
  if (status === 401) return "Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.";
  if (status === 403) return "Tài khoản hiện tại không có quyền tạo người dùng.";
  return "Chưa thể tạo tài khoản. Vui lòng kiểm tra thông tin và thử lại.";
}

export default function CreateUser() {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(roles[0].code);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<CreateUserResponse | null>(null);

  const selectedRole = roles.find((option) => option.code === role) ?? roles[0];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCreated(null);
    setIsSubmitting(true);

    try {
      const response = await authenticatedFetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: username.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role,
        }),
      });

      const result = await response.json().catch(() => ({})) as CreateUserResponse & ApiError;
      if (!response.ok) {
        setError(getErrorMessage(result, response.status));
        return;
      }

      setCreated(result);
      setFullName("");
      setUsername("");
      setEmail("");
      setPhone("");
      setRole(roles[0].code);
    } catch {
      setError("Không thể kết nối đến máy chủ. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startAnother() {
    setCreated(null);
    setError("");
    document.getElementById("full-name")?.focus();
  }

  return (
    <main className="create-user-page">
      <header className="create-user-topbar">
        <a className="create-user-brand" href="/admin/users" aria-label="OMS quản trị tài khoản">
          <span className="create-user-brand-mark" aria-hidden="true">O</span>
          <span>OMS <span className="create-user-brand-muted">/ Quản trị</span></span>
        </a>
        <span className="create-user-admin-label"><span aria-hidden="true">●</span> Tạo tài khoản</span>
      </header>

      <section className="create-user-content" aria-labelledby="create-user-title">
        <div className="create-user-heading">
          <div>
            <p className="create-user-eyebrow">QUẢN LÝ NGƯỜI DÙNG</p>
            <h1 id="create-user-title">Tạo tài khoản mới</h1>
            <p className="create-user-intro">Thêm nhân sự vào hệ thống và cấp vai trò phù hợp với công việc.</p>
          </div>
          <div className="create-user-step" aria-label="Bước 1 trên 1">
            <span className="create-user-step-check" aria-hidden="true">✓</span>
            <span>Thông tin tài khoản</span>
          </div>
        </div>

        {created ? (
          <section className="create-user-success" role="status" aria-live="polite">
            <div className="create-user-success-icon" aria-hidden="true">✓</div>
            <div className="create-user-success-content">
              <p className="create-user-eyebrow">HOÀN TẤT</p>
              <h2>Đã tạo tài khoản</h2>
              <p className="create-user-success-copy">
                Tài khoản <strong>{created.user.username}</strong> đã được tạo với vai trò {created.user.roles[0]?.name ?? selectedRole.label}.
              </p>
              <dl className="create-user-summary">
                <div><dt>Họ và tên</dt><dd>{created.user.full_name}</dd></div>
                <div><dt>Email nhận thông tin</dt><dd>{created.user.email}</dd></div>
                <div><dt>Trạng thái</dt><dd><span className="create-user-status">Chờ kích hoạt</span></dd></div>
              </dl>
              <p className={created.email_sent ? "create-user-email-note" : "create-user-email-note is-warning"}>
                {created.email_sent
                  ? "Email kích hoạt cùng mật khẩu tạm đã được xử lý."
                  : "Tài khoản đã tạo nhưng email chưa gửi được. Hãy kiểm tra cấu hình email trước khi bàn giao tài khoản."}
              </p>
              <button className="create-user-primary" type="button" onClick={startAnother}>
                Tạo tài khoản tiếp theo <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        ) : (
          <form className="create-user-card" onSubmit={handleSubmit}>
            <div className="create-user-card-heading">
              <div className="create-user-card-icon" aria-hidden="true">＋</div>
              <div>
                <h2>Thông tin nhân sự</h2>
                <p>Các trường có dấu <span className="required-mark">*</span> là bắt buộc.</p>
              </div>
            </div>

            {error && <div className="create-user-error" role="alert">{error}</div>}

            <div className="create-user-fields">
              <div className="create-user-field create-user-field-wide">
                <label htmlFor="full-name">Họ và tên <span className="required-mark">*</span></label>
                <input
                  id="full-name"
                  name="full_name"
                  autoComplete="name"
                  maxLength={150}
                  placeholder="Ví dụ: Nguyễn Minh Anh"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </div>

              <div className="create-user-field">
                <label htmlFor="username">Tên đăng nhập <span className="required-mark">*</span></label>
                <input
                  id="username"
                  name="username"
                  autoComplete="off"
                  minLength={3}
                  maxLength={50}
                  pattern="[a-zA-Z0-9_.-]+"
                  title="Dùng chữ cái không dấu, chữ số, dấu chấm, gạch dưới hoặc gạch ngang."
                  placeholder="Ví dụ: minhanh.nguyen"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
                <span className="create-user-hint">Từ 3 ký tự, không dấu và không có khoảng trắng.</span>
              </div>

              <div className="create-user-field">
                <label htmlFor="phone">Số điện thoại</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  pattern="0[0-9]{9}"
                  maxLength={10}
                  title="Số điện thoại gồm 10 chữ số và bắt đầu bằng số 0."
                  placeholder="0901234567"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>

              <div className="create-user-field create-user-field-wide">
                <label htmlFor="email">Email công việc <span className="required-mark">*</span></label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  placeholder="ten.nhanvien@congty.vn"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <span className="create-user-hint">Thông tin kích hoạt và mật khẩu tạm sẽ được gửi đến địa chỉ này.</span>
              </div>

              <div className="create-user-field create-user-field-wide">
                <label htmlFor="role">Vai trò <span className="required-mark">*</span></label>
                <select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value)} required>
                  {roles.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
                <span className="create-user-role-description">{selectedRole.description}</span>
              </div>
            </div>

            <div className="create-user-account-note">
              <span className="create-user-note-icon" aria-hidden="true">i</span>
              <p>Tài khoản mới sẽ ở trạng thái <strong>Chờ kích hoạt</strong>. Hệ thống tạo mật khẩu tạm và yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.</p>
            </div>

            <div className="create-user-actions">
              <a className="create-user-cancel" href="/">Hủy</a>
              <button className="create-user-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><span className="create-user-spinner" aria-hidden="true" /> Đang tạo tài khoản…</> : <>Tạo tài khoản <span aria-hidden="true">→</span></>}
              </button>
            </div>
          </form>
        )}

        <footer className="create-user-footer">Quyền truy cập được kiểm tra trên máy chủ. Chỉ quản trị viên mới có thể tạo tài khoản.</footer>
      </section>
    </main>
  );
}
