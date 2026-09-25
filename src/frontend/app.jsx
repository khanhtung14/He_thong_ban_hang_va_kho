/**
 * React 18 Frontend Application
 * Quản lý Tài khoản & Phân quyền (Sprint 1: SCRUM-6 / SCRUM-62 / S1-01 / S1-02 / S1-04 / S1-10)
 */

const { useState, useEffect, useCallback, useMemo } = React;

// Role Badge Component
function RoleBadge({ roleCode, roleName }) {
  const badgeClasses = {
    SALES: "badge-role-sales",
    ADMIN: "badge-role-admin",
    SALES_MANAGER: "badge-role-manager",
    WAREHOUSE: "badge-role-warehouse",
    WH_MANAGER: "badge-role-manager",
    ACCOUNTANT: "badge-role-admin",
    CUSTOMER: "badge-role-sales"
  };
  const cls = badgeClasses[roleCode] || "badge-role-sales";
  return <span className={`badge ${cls}`}>{roleName || roleCode}</span>;
}

// Status Badge Component
function StatusBadge({ status, statusName }) {
  let cls = "badge-pending";
  if (status === "ACTIVE") cls = "badge-active";
  if (status === "LOCKED") cls = "badge-locked";
  return <span className={`badge ${cls}`}>{statusName || status}</span>;
}

// Toast Notification Component
function Toast({ toast, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const icons = {
    success: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    ),
    warning: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    ),
    error: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    )
  };

  return (
    <div className={`toast toast-${toast.type}`}>
      {icons[toast.type] || icons.success}
      <div style={{ flex: 1 }}>{toast.message}</div>
      <button
        onClick={() => onClose(toast.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}
      >
        &times;
      </button>
    </div>
  );
}

// Login Form Component (S1-01: User -> Login Form -> Validate Input -> Auth API -> User Service -> Database -> Auth Result -> Dashboard)
function LoginForm({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setErrorMsg("Vui lòng nhập tên đăng nhập hoặc email");
      return;
    }
    if (!password) {
      setErrorMsg("Vui lòng nhập mật khẩu");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Đăng nhập không thành công");
      }
      localStorage.setItem("oms_token", data.access_token);
      onLoginSuccess(data.user);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (u, p) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <h1 className="login-title">Hệ Thống Bán Hàng & Kho</h1>
          <p className="login-subtitle">Đăng nhập tài khoản để truy cập hệ thống</p>
        </div>

        {errorMsg && (
          <div className="login-alert login-alert-error">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label className="form-label required">Tên đăng nhập / Email</label>
            <input
              type="text"
              className="form-control"
              placeholder="Nhập tên đăng nhập hoặc email..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label className="form-label required">Mật khẩu</label>
            <input
              type="password"
              className="form-control"
              placeholder="Nhập mật khẩu..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: "15px" }}
            disabled={loading}
          >
            {loading ? "Đang xác thực..." : "Đăng Nhập"}
          </button>
        </form>

        <div className="quick-login-box">
          <div className="quick-login-title">Tài khoản demo sẵn có:</div>
          <div className="quick-login-chips">
            <button
              type="button"
              className="chip-btn"
              onClick={() => handleQuickLogin("admin", "InitPassword123@")}
            >
              👑 Quản trị viên (admin)
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => handleQuickLogin("sales_tuan", "InitPassword123@")}
            >
              💼 Kinh doanh (sales_tuan)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modal Thêm Mới Tài Khoản (US-002)
function CreateUserModal({ isOpen, onClose, onSuccess, roles, onShowToast }) {
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
    phone: "",
    role_code: "SALES",
    status: "PENDING_ACTIVATION"
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        full_name: "",
        username: "",
        email: "",
        phone: "",
        role_code: "SALES",
        status: "PENDING_ACTIVATION"
      });
      setFieldErrors({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = () => {
    const errs = {};
    if (!formData.full_name.trim()) errs.full_name = "Họ và tên không được để trống";
    if (!formData.username.trim()) errs.username = "Tên tài khoản không được để trống";
    else if (!/^[a-zA-Z0-9_.-]+$/.test(formData.username.trim())) {
      errs.username = "Tên tài khoản chỉ được chứa chữ cái, số, gạch dưới, gạch ngang, chấm";
    }

    if (!formData.email.trim()) errs.email = "Email không được để trống";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errs.email = "Định dạng email không hợp lệ";
    }

    const cleanPhone = formData.phone.replace(/[\s.-]/g, "");
    if (!cleanPhone) errs.phone = "Số điện thoại không được để trống";
    else if (!/^(\+?84|0)[3|5|7|8|9][0-9]{8}$/.test(cleanPhone)) {
      errs.phone = "Số điện thoại cần 10 số, bắt đầu bằng 03, 05, 07, 08, 09";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFieldErrors({});

    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          full_name: formData.full_name.trim(),
          username: formData.username.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim()
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        if (data.field_errors) {
          setFieldErrors(data.field_errors);
        }
        onShowToast(data.detail || "Thông tin tài khoản đã bị trùng", "warning");
        return;
      }

      if (!res.ok) {
        throw new Error(data.detail || "Không thể tạo tài khoản người dùng");
      }

      const emailNote = data.email_sent
        ? "Đã gửi email kích hoạt kèm mật khẩu tạm."
        : "Lưu ý: Chưa gửi được email kích hoạt (hệ thống lưu lại log để gửi lại).";

      onShowToast(`Tạo tài khoản "${data.user.username}" thành công! ${emailNote}`, "success");
      onSuccess();
      onClose();
    } catch (err) {
      onShowToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <line x1="19" y1="8" x2="19" y2="14"></line>
              <line x1="22" y1="11" x2="16" y2="11"></line>
            </svg>
            Tạo Mới Tài Khoản Người Dùng
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label required">Họ và tên</label>
              <input
                type="text"
                className={`form-control ${fieldErrors.full_name ? 'is-invalid' : ''}`}
                placeholder="Ví dụ: Nguyễn Văn An"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                disabled={submitting}
              />
              {fieldErrors.full_name && <div className="error-text">{fieldErrors.full_name}</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label required">Tên tài khoản (Username)</label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.username ? 'is-invalid' : ''}`}
                  placeholder="Ví dụ: an.nv"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  disabled={submitting}
                />
                {fieldErrors.username && <div className="error-text">{fieldErrors.username}</div>}
              </div>

              <div className="form-group">
                <label className="form-label required">Vai trò (Role)</label>
                <select
                  className="form-control"
                  value={formData.role_code}
                  onChange={(e) => setFormData({ ...formData, role_code: e.target.value })}
                  disabled={submitting}
                >
                  {roles.map(r => (
                    <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label required">Địa chỉ Email</label>
                <input
                  type="email"
                  className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
                  placeholder="an.nv@hethong.vn"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={submitting}
                />
                {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>
                  Mật khẩu tạm thời sẽ được tự động gửi tới email này.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label required">Số điện thoại</label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.phone ? 'is-invalid' : ''}`}
                  placeholder="0912345678"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={submitting}
                />
                {fieldErrors.phone && <div className="error-text">{fieldErrors.phone}</div>}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Lưu Tài Khoản"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal Chỉnh Sửa Tài Khoản (US-003)
function EditUserModal({ isOpen, user, onClose, onSuccess, roles, onShowToast }) {
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role_code: "SALES",
    status: "ACTIVE"
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        full_name: user.full_name || "",
        email: user.email || "",
        phone: user.phone || "",
        role_code: user.role_code || "SALES",
        status: user.status || "ACTIVE"
      });
      setFieldErrors({});
    }
  }, [user]);

  if (!isOpen || !user) return null;

  const validate = () => {
    const errs = {};
    if (!formData.full_name.trim()) errs.full_name = "Họ và tên không được để trống";
    if (!formData.email.trim()) errs.email = "Email không được để trống";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errs.email = "Định dạng email không hợp lệ";
    }

    const cleanPhone = formData.phone.replace(/[\s.-]/g, "");
    if (!cleanPhone) errs.phone = "Số điện thoại không được để trống";
    else if (!/^(\+?84|0)[3|5|7|8|9][0-9]{8}$/.test(cleanPhone)) {
      errs.phone = "Số điện thoại cần 10 số, bắt đầu bằng 03, 05, 07, 08, 09";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/v1/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          full_name: formData.full_name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim()
        })
      });

      const data = await res.json();

      if (res.status === 409) {
        if (data.field_errors) {
          setFieldErrors(data.field_errors);
        }
        onShowToast(data.detail || "Thông tin cập nhật bị trùng lặp", "warning");
        return;
      }

      if (!res.ok) {
        throw new Error(data.detail || "Không thể cập nhật tài khoản");
      }

      onShowToast(`Cập nhật thông tin tài khoản "${user.username}" thành công!`, "success");
      onSuccess();
      onClose();
    } catch (err) {
      onShowToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Chỉnh Sửa Thông Tin Tài Khoản
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Tên tài khoản (Username) — Cố định</label>
              <input
                type="text"
                className="form-control"
                value={user.username}
                disabled
                style={{ backgroundColor: "#f1f5f9", cursor: "not-allowed", color: "#64748b" }}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Họ và tên</label>
              <input
                type="text"
                className={`form-control ${fieldErrors.full_name ? 'is-invalid' : ''}`}
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                disabled={submitting}
              />
              {fieldErrors.full_name && <div className="error-text">{fieldErrors.full_name}</div>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label required">Vai trò (Role)</label>
                <select
                  className="form-control"
                  value={formData.role_code}
                  onChange={(e) => setFormData({ ...formData, role_code: e.target.value })}
                  disabled={submitting}
                >
                  {roles.map(r => (
                    <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label required">Trạng thái (Status)</label>
                <select
                  className="form-control"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  disabled={submitting}
                >
                  <option value="ACTIVE">Đang hoạt động (ACTIVE)</option>
                  <option value="PENDING_ACTIVATION">Chờ kích hoạt (PENDING_ACTIVATION)</option>
                  <option value="LOCKED">Bị khóa (LOCKED)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label required">Địa chỉ Email</label>
                <input
                  type="email"
                  className={`form-control ${fieldErrors.email ? 'is-invalid' : ''}`}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={submitting}
                />
                {fieldErrors.email && <div className="error-text">{fieldErrors.email}</div>}
              </div>

              <div className="form-group">
                <label className="form-label required">Số điện thoại</label>
                <input
                  type="text"
                  className={`form-control ${fieldErrors.phone ? 'is-invalid' : ''}`}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  disabled={submitting}
                />
                {fieldErrors.phone && <div className="error-text">{fieldErrors.phone}</div>}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Cập Nhật Thông Tin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal Đổi Mật Khẩu (US-004 / S1-04)
function ChangePasswordModal({ isOpen, username, onClose, onShowToast }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMsg("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setErrorMsg("Vui lòng nhập mật khẩu hiện tại");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setErrorMsg("Mật khẩu mới phải có ít nhất 8 ký tự");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setErrorMsg("Mật khẩu mới phải chứa cả chữ và số");
      return;
    }
    if (newPassword === currentPassword) {
      setErrorMsg("Mật khẩu mới không được giống mật khẩu hiện tại");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Mật khẩu xác nhận không khớp");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username || undefined,
          current_password: currentPassword,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Không thể đổi mật khẩu");
      }
      onShowToast("Đổi mật khẩu thành công!", "success");
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-container">
        <div className="modal-header">
          <div className="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Đổi Mật Khẩu Cá Nhân
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {errorMsg && (
              <div className="login-alert login-alert-error" style={{ marginBottom: "16px" }}>
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label required">Mật khẩu hiện tại</label>
              <input
                type="password"
                className="form-control"
                placeholder="Nhập mật khẩu hiện tại..."
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label className="form-label required">Mật khẩu mới</label>
              <input
                type="password"
                className="form-control"
                placeholder="Tối thiểu 8 ký tự, có cả chữ và số..."
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="form-group">
              <label className="form-label required">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                className="form-control"
                placeholder="Nhập lại mật khẩu mới..."
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Hủy bỏ</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Đang xử lý..." : "Lưu Mật Khẩu Mới"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Ứng dụng chính (React 18 Component)
function UserManagementApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20); // Jira constraint: default 20 rows

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const [toasts, setToasts] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Hiển thị thông báo Toast
  const showToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Kiểm tra phiên đăng nhập từ localStorage khi khởi động
  useEffect(() => {
    const token = localStorage.getItem("oms_token");
    if (token) {
      fetch("/api/v1/auth/me", {
        headers: { "Authorization": `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error("Hết phiên");
        })
        .then(user => {
          setCurrentUser(user);
        })
        .catch(() => {
          localStorage.removeItem("oms_token");
          setCurrentUser(null);
        })
        .finally(() => setAuthChecking(false));
    } else {
      setAuthChecking(false);
    }
  }, []);

  // Tải danh mục vai trò
  useEffect(() => {
    if (currentUser) {
      fetch("/api/v1/roles")
        .then(res => res.json())
        .then(data => setRoles(data))
        .catch(() => {});
    }
  }, [currentUser]);

  // Tải danh sách người dùng
  const loadUsers = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage,
        page_size: pageSize
      });
      if (searchTerm.trim()) params.append("search", searchTerm.trim());
      if (selectedRole) params.append("role", selectedRole);
      if (selectedStatus) params.append("status", selectedStatus);

      const res = await fetch(`/api/v1/users?${params.toString()}`);
      if (!res.ok) throw new Error("Không thể tải danh sách tài khoản");
      const data = await res.json();

      setUsers(data.items);
      setTotalRecords(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [currentUser, currentPage, pageSize, searchTerm, selectedRole, selectedStatus, showToast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Gửi lại email kích hoạt
  const handleResendActivation = async (userId, username) => {
    try {
      const res = await fetch(`/api/v1/users/${userId}/resend-activation`, {
        method: "POST"
      });
      const data = await res.json();
      if (data.email_sent) {
        showToast(data.message, "success");
        loadUsers();
      } else {
        showToast(data.message, "error");
      }
    } catch (err) {
      showToast("Lỗi khi gửi lại email kích hoạt", "error");
    }
  };

  // Khóa / Mở khóa tài khoản (S1-10)
  const handleToggleLock = async (u) => {
    const actionText = u.status === "LOCKED" ? "mở khóa" : "khóa";
    if (!confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản "${u.username}" không?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/users/${u.id}/toggle-lock`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Không thể ${actionText} tài khoản`);
      }
      showToast(`Đã ${actionText} thành công tài khoản "${u.username}"!`, "success");
      loadUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  // Đăng xuất (S1-02)
  const handleLogout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch (_) {}
    localStorage.removeItem("oms_token");
    setCurrentUser(null);
    showToast("Đã đăng xuất khỏi hệ thống", "success");
  };

  if (authChecking) {
    return (
      <div style={{ padding: "50px 20px", textAlign: "center", color: "#64748b" }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }}></div>
        <p>Đang kiểm tra thông tin phiên làm việc...</p>
      </div>
    );
  }

  // Nếu chưa đăng nhập, hiển thị Login Screen theo User Flow
  if (!currentUser) {
    return (
      <div>
        <div className="toast-container" aria-live="polite">
          {toasts.map(t => (
            <Toast key={t.id} toast={t} onClose={removeToast} />
          ))}
        </div>
        <LoginForm
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            showToast(`Chào mừng ${user.full_name} (${user.role_name}) quay trở lại!`, "success");
          }}
        />
      </div>
    );
  }

  const showingStart = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const showingEnd = Math.min(currentPage * pageSize, totalRecords);

  return (
    <div>
      {/* Toast Notification Container */}
      <div className="toast-container" aria-live="polite">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onClose={removeToast} />
        ))}
      </div>

      {/* Header */}
      <header className="app-header">
        <div className="header-container">
          <div className="brand">
            <div className="brand-logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="brand-text">
              <h1>Hệ Thống Quản Lý Bán Hàng & Kho</h1>
              <span className="badge-sprint">Sprint 1 • SCRUM-62 • React 18</span>
            </div>
          </div>

          <div className="user-nav">
            <div className="user-nav-avatar">
              {currentUser.full_name ? currentUser.full_name.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="user-nav-meta">
              <span className="user-nav-name">{currentUser.full_name}</span>
              <span className="user-nav-role">{currentUser.role_name}</span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: "6px 10px", fontSize: "12px" }}
              onClick={() => setIsPasswordModalOpen(true)}
              title="Đổi mật khẩu"
            >
              Đổi MK
            </button>
            <button
              className="btn btn-secondary"
              style={{ padding: "6px 10px", fontSize: "12px", color: "#ef4444" }}
              onClick={handleLogout}
              title="Đăng xuất"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-layout">
        <div className="page-header">
          <div>
            <div className="breadcrumbs">Quản trị viên &gt; Tài khoản &gt; Danh sách người dùng</div>
            <h2 className="page-title">Quản lý Tài khoản & Phân quyền</h2>
            <p className="page-subtitle">Cấp quyền cho nhân viên kinh doanh mới nhận địa bàn, quản lý và tra cứu thông tin nhân sự.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Thêm mới tài khoản
          </button>
        </div>

        {/* Toolbar: Tìm kiếm & Bộ lọc */}
        <div className="toolbar-card">
          <div className="search-box">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              placeholder="Tìm theo tên, tên tài khoản, số điện thoại..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
            {searchTerm && (
              <button className="btn-clear" onClick={() => { setSearchTerm(""); setCurrentPage(1); }}>&times;</button>
            )}
          </div>

          <div className="filter-group">
            <div className="filter-item">
              <label>Vai trò:</label>
              <select
                value={selectedRole}
                onChange={(e) => { setSelectedRole(e.target.value); setCurrentPage(1); }}
                className="select-control"
              >
                <option value="">Tất cả vai trò</option>
                {roles.map(r => (
                  <option key={r.code} value={r.code}>{r.name}</option>
                ))}
              </select>
            </div>

            <div className="filter-item">
              <label>Trạng thái:</label>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="select-control"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="PENDING_ACTIVATION">Chờ kích hoạt</option>
                <option value="LOCKED">Bị khóa</option>
              </select>
            </div>

            {(searchTerm || selectedRole || selectedStatus) && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedRole("");
                  setSelectedStatus("");
                  setCurrentPage(1);
                }}
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        </div>

        {/* User Table Card */}
        <div className="table-card">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <div>Đang tải dữ liệu tài khoản...</div>
            </div>
          )}

          {users.length === 0 && !loading ? (
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <div className="empty-title">Không tìm thấy người dùng phù hợp</div>
              <div className="empty-desc">Thử tìm kiếm với từ khóa khác hoặc điều chỉnh lại bộ lọc vai trò, trạng thái.</div>
            </div>
          ) : (
            <table className="user-table">
              <thead>
                <tr>
                  <th style={{ width: "50px" }}>STT</th>
                  <th>Họ và tên</th>
                  <th>Tên tài khoản</th>
                  <th>Email</th>
                  <th>Số điện thoại</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: "right", width: "170px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const stt = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr key={u.id}>
                      <td>{stt}</td>
                      <td>
                        <div className="user-cell">
                          <span className="user-fullname">{u.full_name}</span>
                        </div>
                      </td>
                      <td><strong>{u.username}</strong></td>
                      <td>
                        {u.email}{" "}
                        {u.email_sent ? (
                          <span title="Đã gửi email kích hoạt" style={{ color: "#10b981", marginLeft: "4px" }}>✓</span>
                        ) : (
                          <span title="Chưa gửi được email kích hoạt" style={{ color: "#ef4444", marginLeft: "4px" }}>⚠</span>
                        )}
                      </td>
                      <td>{u.phone}</td>
                      <td><RoleBadge roleCode={u.role_code} roleName={u.role_name} /></td>
                      <td><StatusBadge status={u.status} statusName={u.status_name} /></td>
                      <td>
                        <div className="row-actions">
                          <button className="btn-action" onClick={() => setEditingUser(u)} title="Chỉnh sửa tài khoản">
                            Sửa
                          </button>
                          <button
                            className="btn-action"
                            style={{ color: u.status === 'LOCKED' ? '#10b981' : '#f59e0b' }}
                            onClick={() => handleToggleLock(u)}
                            title={u.status === 'LOCKED' ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
                          >
                            {u.status === 'LOCKED' ? 'Mở' : 'Khóa'}
                          </button>
                          {(!u.email_sent || u.status === "PENDING_ACTIVATION") && (
                            <button
                              className="btn-action btn-action-resend"
                              onClick={() => handleResendActivation(u.id, u.username)}
                              title="Gửi lại email kích hoạt"
                            >
                              Gửi mail
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Phân trang mặc định 20 dòng/trang (AC1) */}
          <div className="pagination-footer">
            <div className="pagination-info">
              Hiển thị <span>{showingStart}</span> - <span>{showingEnd}</span> trong tổng số <span>{totalRecords}</span> tài khoản
            </div>
            <div className="pagination-controls">
              <button
                className="btn btn-icon"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                &laquo; Trước
              </button>
              <div className="page-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={`page-num ${p === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-icon"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              >
                Sau &raquo;
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => { setCurrentPage(1); loadUsers(); }}
        roles={roles}
        onShowToast={showToast}
      />

      <EditUserModal
        isOpen={!!editingUser}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={loadUsers}
        roles={roles}
        onShowToast={showToast}
      />

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        username={currentUser?.username}
        onClose={() => setIsPasswordModalOpen(false)}
        onShowToast={showToast}
      />
    </div>
  );
}

// Render ứng dụng React vào DOM
const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<UserManagementApp />);
}
