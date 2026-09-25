(() => {
  // src/frontend/app.jsx
  var { useState, useEffect, useCallback, useMemo } = React;
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
    return /* @__PURE__ */ React.createElement("span", { className: `badge ${cls}` }, roleName || roleCode);
  }
  function StatusBadge({ status, statusName }) {
    let cls = "badge-pending";
    if (status === "ACTIVE") cls = "badge-active";
    if (status === "LOCKED") cls = "badge-locked";
    return /* @__PURE__ */ React.createElement("span", { className: `badge ${cls}` }, statusName || status);
  }
  function Toast({ toast, onClose }) {
    useEffect(() => {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, 4500);
      return () => clearTimeout(timer);
    }, [toast, onClose]);
    const icons = {
      success: /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "#10b981", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }), /* @__PURE__ */ React.createElement("polyline", { points: "22 4 12 14.01 9 11.01" })),
      warning: /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "#f59e0b", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })),
      error: /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "#ef4444", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "15", y1: "9", x2: "9", y2: "15" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "9", x2: "15", y2: "15" }))
    };
    return /* @__PURE__ */ React.createElement("div", { className: `toast toast-${toast.type}` }, icons[toast.type] || icons.success, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, toast.message), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => onClose(toast.id),
        style: { background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "16px" }
      },
      "\xD7"
    ));
  }
  function LoginForm({ onLoginSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [loading, setLoading] = useState(false);
    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!username.trim()) {
        setErrorMsg("Vui l\xF2ng nh\u1EADp t\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c email");
        return;
      }
      if (!password) {
        setErrorMsg("Vui l\xF2ng nh\u1EADp m\u1EADt kh\u1EA9u");
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
          throw new Error(data.detail || "\u0110\u0103ng nh\u1EADp kh\xF4ng th\xE0nh c\xF4ng");
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
    return /* @__PURE__ */ React.createElement("div", { className: "login-screen" }, /* @__PURE__ */ React.createElement("div", { className: "login-card" }, /* @__PURE__ */ React.createElement("div", { className: "login-brand" }, /* @__PURE__ */ React.createElement("div", { className: "login-logo-icon" }, /* @__PURE__ */ React.createElement("svg", { width: "28", height: "28", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7", r: "4" }))), /* @__PURE__ */ React.createElement("h1", { className: "login-title" }, "H\u1EC7 Th\u1ED1ng B\xE1n H\xE0ng & Kho"), /* @__PURE__ */ React.createElement("p", { className: "login-subtitle" }, "\u0110\u0103ng nh\u1EADp t\xE0i kho\u1EA3n \u0111\u1EC3 truy c\u1EADp h\u1EC7 th\u1ED1ng")), errorMsg && /* @__PURE__ */ React.createElement("div", { className: "login-alert login-alert-error" }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })), /* @__PURE__ */ React.createElement("span", null, errorMsg)), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("div", { className: "form-group", style: { marginBottom: "16px" } }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "T\xEAn \u0111\u0103ng nh\u1EADp / Email"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: "form-control",
        placeholder: "Nh\u1EADp t\xEAn \u0111\u0103ng nh\u1EADp ho\u1EB7c email...",
        value: username,
        onChange: (e) => setUsername(e.target.value),
        disabled: loading,
        autoFocus: true
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "form-group", style: { marginBottom: "24px" } }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "M\u1EADt kh\u1EA9u"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "password",
        className: "form-control",
        placeholder: "Nh\u1EADp m\u1EADt kh\u1EA9u...",
        value: password,
        onChange: (e) => setPassword(e.target.value),
        disabled: loading
      }
    )), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "submit",
        className: "btn btn-primary",
        style: { width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: "15px" },
        disabled: loading
      },
      loading ? "\u0110ang x\xE1c th\u1EF1c..." : "\u0110\u0103ng Nh\u1EADp"
    )), /* @__PURE__ */ React.createElement("div", { className: "quick-login-box" }, /* @__PURE__ */ React.createElement("div", { className: "quick-login-title" }, "T\xE0i kho\u1EA3n demo s\u1EB5n c\xF3:"), /* @__PURE__ */ React.createElement("div", { className: "quick-login-chips" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "chip-btn",
        onClick: () => handleQuickLogin("admin", "InitPassword123@")
      },
      "\u{1F451} Qu\u1EA3n tr\u1ECB vi\xEAn (admin)"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        type: "button",
        className: "chip-btn",
        onClick: () => handleQuickLogin("sales_tuan", "InitPassword123@")
      },
      "\u{1F4BC} Kinh doanh (sales_tuan)"
    )))));
  }
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
      if (!formData.full_name.trim()) errs.full_name = "H\u1ECD v\xE0 t\xEAn kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      if (!formData.username.trim()) errs.username = "T\xEAn t\xE0i kho\u1EA3n kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      else if (!/^[a-zA-Z0-9_.-]+$/.test(formData.username.trim())) {
        errs.username = "T\xEAn t\xE0i kho\u1EA3n ch\u1EC9 \u0111\u01B0\u1EE3c ch\u1EE9a ch\u1EEF c\xE1i, s\u1ED1, g\u1EA1ch d\u01B0\u1EDBi, g\u1EA1ch ngang, ch\u1EA5m";
      }
      if (!formData.email.trim()) errs.email = "Email kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        errs.email = "\u0110\u1ECBnh d\u1EA1ng email kh\xF4ng h\u1EE3p l\u1EC7";
      }
      const cleanPhone = formData.phone.replace(/[\s.-]/g, "");
      if (!cleanPhone) errs.phone = "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      else if (!/^(\+?84|0)[3|5|7|8|9][0-9]{8}$/.test(cleanPhone)) {
        errs.phone = "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i c\u1EA7n 10 s\u1ED1, b\u1EAFt \u0111\u1EA7u b\u1EB1ng 03, 05, 07, 08, 09";
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
          onShowToast(data.detail || "Th\xF4ng tin t\xE0i kho\u1EA3n \u0111\xE3 b\u1ECB tr\xF9ng", "warning");
          return;
        }
        if (!res.ok) {
          throw new Error(data.detail || "Kh\xF4ng th\u1EC3 t\u1EA1o t\xE0i kho\u1EA3n ng\u01B0\u1EDDi d\xF9ng");
        }
        const emailNote = data.email_sent ? "\u0110\xE3 g\u1EEDi email k\xEDch ho\u1EA1t k\xE8m m\u1EADt kh\u1EA9u t\u1EA1m." : "L\u01B0u \xFD: Ch\u01B0a g\u1EEDi \u0111\u01B0\u1EE3c email k\xEDch ho\u1EA1t (h\u1EC7 th\u1ED1ng l\u01B0u l\u1EA1i log \u0111\u1EC3 g\u1EEDi l\u1EA1i).";
        onShowToast(`T\u1EA1o t\xE0i kho\u1EA3n "${data.user.username}" th\xE0nh c\xF4ng! ${emailNote}`, "success");
        onSuccess();
        onClose();
      } catch (err) {
        onShowToast(err.message, "error");
      } finally {
        setSubmitting(false);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onClick: (e) => {
      if (e.target === e.currentTarget) onClose();
    } }, /* @__PURE__ */ React.createElement("div", { className: "modal-container" }, /* @__PURE__ */ React.createElement("div", { className: "modal-header" }, /* @__PURE__ */ React.createElement("div", { className: "modal-title" }, /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "7", r: "4" }), /* @__PURE__ */ React.createElement("line", { x1: "19", y1: "8", x2: "19", y2: "14" }), /* @__PURE__ */ React.createElement("line", { x1: "22", y1: "11", x2: "16", y2: "11" })), "T\u1EA1o M\u1EDBi T\xE0i Kho\u1EA3n Ng\u01B0\u1EDDi D\xF9ng"), /* @__PURE__ */ React.createElement("button", { className: "modal-close", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("div", { className: "modal-body" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "H\u1ECD v\xE0 t\xEAn"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: `form-control ${fieldErrors.full_name ? "is-invalid" : ""}`,
        placeholder: "V\xED d\u1EE5: Nguy\u1EC5n V\u0103n An",
        value: formData.full_name,
        onChange: (e) => setFormData({ ...formData, full_name: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.full_name && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.full_name)), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "T\xEAn t\xE0i kho\u1EA3n (Username)"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: `form-control ${fieldErrors.username ? "is-invalid" : ""}`,
        placeholder: "V\xED d\u1EE5: an.nv",
        value: formData.username,
        onChange: (e) => setFormData({ ...formData, username: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.username && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.username)), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "Vai tr\xF2 (Role)"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "form-control",
        value: formData.role_code,
        onChange: (e) => setFormData({ ...formData, role_code: e.target.value }),
        disabled: submitting
      },
      roles.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.code, value: r.code }, r.name, " (", r.code, ")"))
    ))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "\u0110\u1ECBa ch\u1EC9 Email"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        className: `form-control ${fieldErrors.email ? "is-invalid" : ""}`,
        placeholder: "an.nv@hethong.vn",
        value: formData.email,
        onChange: (e) => setFormData({ ...formData, email: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.email && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.email), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "11px", color: "#64748b", marginTop: "3px" } }, "M\u1EADt kh\u1EA9u t\u1EA1m th\u1EDDi s\u1EBD \u0111\u01B0\u1EE3c t\u1EF1 \u0111\u1ED9ng g\u1EEDi t\u1EDBi email n\xE0y.")), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: `form-control ${fieldErrors.phone ? "is-invalid" : ""}`,
        placeholder: "0912345678",
        value: formData.phone,
        onChange: (e) => setFormData({ ...formData, phone: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.phone && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.phone)))), /* @__PURE__ */ React.createElement("div", { className: "modal-footer" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: onClose, disabled: submitting }, "H\u1EE7y b\u1ECF"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary", disabled: submitting }, submitting ? "\u0110ang x\u1EED l\xFD..." : "L\u01B0u T\xE0i Kho\u1EA3n")))));
  }
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
      if (!formData.full_name.trim()) errs.full_name = "H\u1ECD v\xE0 t\xEAn kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      if (!formData.email.trim()) errs.email = "Email kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
        errs.email = "\u0110\u1ECBnh d\u1EA1ng email kh\xF4ng h\u1EE3p l\u1EC7";
      }
      const cleanPhone = formData.phone.replace(/[\s.-]/g, "");
      if (!cleanPhone) errs.phone = "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng";
      else if (!/^(\+?84|0)[3|5|7|8|9][0-9]{8}$/.test(cleanPhone)) {
        errs.phone = "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i c\u1EA7n 10 s\u1ED1, b\u1EAFt \u0111\u1EA7u b\u1EB1ng 03, 05, 07, 08, 09";
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
          onShowToast(data.detail || "Th\xF4ng tin c\u1EADp nh\u1EADt b\u1ECB tr\xF9ng l\u1EB7p", "warning");
          return;
        }
        if (!res.ok) {
          throw new Error(data.detail || "Kh\xF4ng th\u1EC3 c\u1EADp nh\u1EADt t\xE0i kho\u1EA3n");
        }
        onShowToast(`C\u1EADp nh\u1EADt th\xF4ng tin t\xE0i kho\u1EA3n "${user.username}" th\xE0nh c\xF4ng!`, "success");
        onSuccess();
        onClose();
      } catch (err) {
        onShowToast(err.message, "error");
      } finally {
        setSubmitting(false);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onClick: (e) => {
      if (e.target === e.currentTarget) onClose();
    } }, /* @__PURE__ */ React.createElement("div", { className: "modal-container" }, /* @__PURE__ */ React.createElement("div", { className: "modal-header" }, /* @__PURE__ */ React.createElement("div", { className: "modal-title" }, /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }), /* @__PURE__ */ React.createElement("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })), "Ch\u1EC9nh S\u1EEDa Th\xF4ng Tin T\xE0i Kho\u1EA3n"), /* @__PURE__ */ React.createElement("button", { className: "modal-close", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("div", { className: "modal-body" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label" }, "T\xEAn t\xE0i kho\u1EA3n (Username) \u2014 C\u1ED1 \u0111\u1ECBnh"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: "form-control",
        value: user.username,
        disabled: true,
        style: { backgroundColor: "#f1f5f9", cursor: "not-allowed", color: "#64748b" }
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "H\u1ECD v\xE0 t\xEAn"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: `form-control ${fieldErrors.full_name ? "is-invalid" : ""}`,
        value: formData.full_name,
        onChange: (e) => setFormData({ ...formData, full_name: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.full_name && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.full_name)), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "Vai tr\xF2 (Role)"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "form-control",
        value: formData.role_code,
        onChange: (e) => setFormData({ ...formData, role_code: e.target.value }),
        disabled: submitting
      },
      roles.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.code, value: r.code }, r.name, " (", r.code, ")"))
    )), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "Tr\u1EA1ng th\xE1i (Status)"), /* @__PURE__ */ React.createElement(
      "select",
      {
        className: "form-control",
        value: formData.status,
        onChange: (e) => setFormData({ ...formData, status: e.target.value }),
        disabled: submitting
      },
      /* @__PURE__ */ React.createElement("option", { value: "ACTIVE" }, "\u0110ang ho\u1EA1t \u0111\u1ED9ng (ACTIVE)"),
      /* @__PURE__ */ React.createElement("option", { value: "PENDING_ACTIVATION" }, "Ch\u1EDD k\xEDch ho\u1EA1t (PENDING_ACTIVATION)"),
      /* @__PURE__ */ React.createElement("option", { value: "LOCKED" }, "B\u1ECB kh\xF3a (LOCKED)")
    ))), /* @__PURE__ */ React.createElement("div", { className: "form-row" }, /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "\u0110\u1ECBa ch\u1EC9 Email"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "email",
        className: `form-control ${fieldErrors.email ? "is-invalid" : ""}`,
        value: formData.email,
        onChange: (e) => setFormData({ ...formData, email: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.email && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.email)), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        className: `form-control ${fieldErrors.phone ? "is-invalid" : ""}`,
        value: formData.phone,
        onChange: (e) => setFormData({ ...formData, phone: e.target.value }),
        disabled: submitting
      }
    ), fieldErrors.phone && /* @__PURE__ */ React.createElement("div", { className: "error-text" }, fieldErrors.phone)))), /* @__PURE__ */ React.createElement("div", { className: "modal-footer" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: onClose, disabled: submitting }, "H\u1EE7y b\u1ECF"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary", disabled: submitting }, submitting ? "\u0110ang l\u01B0u..." : "C\u1EADp Nh\u1EADt Th\xF4ng Tin")))));
  }
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
        setErrorMsg("Vui l\xF2ng nh\u1EADp m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i");
        return;
      }
      if (!newPassword || newPassword.length < 8) {
        setErrorMsg("M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i c\xF3 \xEDt nh\u1EA5t 8 k\xFD t\u1EF1");
        return;
      }
      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setErrorMsg("M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i ch\u1EE9a c\u1EA3 ch\u1EEF v\xE0 s\u1ED1");
        return;
      }
      if (newPassword === currentPassword) {
        setErrorMsg("M\u1EADt kh\u1EA9u m\u1EDBi kh\xF4ng \u0111\u01B0\u1EE3c gi\u1ED1ng m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i");
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg("M\u1EADt kh\u1EA9u x\xE1c nh\u1EADn kh\xF4ng kh\u1EDBp");
        return;
      }
      setSubmitting(true);
      setErrorMsg("");
      try {
        const res = await fetch("/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username || void 0,
            current_password: currentPassword,
            new_password: newPassword
          })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || "Kh\xF4ng th\u1EC3 \u0111\u1ED5i m\u1EADt kh\u1EA9u");
        }
        onShowToast("\u0110\u1ED5i m\u1EADt kh\u1EA9u th\xE0nh c\xF4ng!", "success");
        onClose();
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setSubmitting(false);
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onClick: (e) => {
      if (e.target === e.currentTarget) onClose();
    } }, /* @__PURE__ */ React.createElement("div", { className: "modal-container" }, /* @__PURE__ */ React.createElement("div", { className: "modal-header" }, /* @__PURE__ */ React.createElement("div", { className: "modal-title" }, /* @__PURE__ */ React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "11", width: "18", height: "11", rx: "2", ry: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })), "\u0110\u1ED5i M\u1EADt Kh\u1EA9u C\xE1 Nh\xE2n"), /* @__PURE__ */ React.createElement("button", { className: "modal-close", onClick: onClose }, "\xD7")), /* @__PURE__ */ React.createElement("form", { onSubmit: handleSubmit }, /* @__PURE__ */ React.createElement("div", { className: "modal-body" }, errorMsg && /* @__PURE__ */ React.createElement("div", { className: "login-alert login-alert-error", style: { marginBottom: "16px" } }, /* @__PURE__ */ React.createElement("span", null, errorMsg)), /* @__PURE__ */ React.createElement("div", { className: "form-group", style: { marginBottom: "16px" } }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "M\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "password",
        className: "form-control",
        placeholder: "Nh\u1EADp m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i...",
        value: currentPassword,
        onChange: (e) => setCurrentPassword(e.target.value),
        disabled: submitting
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "form-group", style: { marginBottom: "16px" } }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "M\u1EADt kh\u1EA9u m\u1EDBi"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "password",
        className: "form-control",
        placeholder: "T\u1ED1i thi\u1EC3u 8 k\xFD t\u1EF1, c\xF3 c\u1EA3 ch\u1EEF v\xE0 s\u1ED1...",
        value: newPassword,
        onChange: (e) => setNewPassword(e.target.value),
        disabled: submitting
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "form-group" }, /* @__PURE__ */ React.createElement("label", { className: "form-label required" }, "X\xE1c nh\u1EADn m\u1EADt kh\u1EA9u m\u1EDBi"), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "password",
        className: "form-control",
        placeholder: "Nh\u1EADp l\u1EA1i m\u1EADt kh\u1EA9u m\u1EDBi...",
        value: confirmPassword,
        onChange: (e) => setConfirmPassword(e.target.value),
        disabled: submitting
      }
    ))), /* @__PURE__ */ React.createElement("div", { className: "modal-footer" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-secondary", onClick: onClose, disabled: submitting }, "H\u1EE7y b\u1ECF"), /* @__PURE__ */ React.createElement("button", { type: "submit", className: "btn btn-primary", disabled: submitting }, submitting ? "\u0110ang x\u1EED l\xFD..." : "L\u01B0u M\u1EADt Kh\u1EA9u M\u1EDBi")))));
  }
  function UserManagementApp() {
    const [currentUser, setCurrentUser] = useState(null);
    const [authChecking, setAuthChecking] = useState(true);
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(20);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedRole, setSelectedRole] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("");
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const showToast = useCallback((message, type = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);
    }, []);
    const removeToast = useCallback((id) => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    useEffect(() => {
      const token = localStorage.getItem("oms_token");
      if (token) {
        fetch("/api/v1/auth/me", {
          headers: { "Authorization": `Bearer ${token}` }
        }).then((res) => {
          if (res.ok) return res.json();
          throw new Error("H\u1EBFt phi\xEAn");
        }).then((user) => {
          setCurrentUser(user);
        }).catch(() => {
          localStorage.removeItem("oms_token");
          setCurrentUser(null);
        }).finally(() => setAuthChecking(false));
      } else {
        setAuthChecking(false);
      }
    }, []);
    useEffect(() => {
      if (currentUser) {
        fetch("/api/v1/roles").then((res) => res.json()).then((data) => setRoles(data)).catch(() => {
        });
      }
    }, [currentUser]);
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
        if (!res.ok) throw new Error("Kh\xF4ng th\u1EC3 t\u1EA3i danh s\xE1ch t\xE0i kho\u1EA3n");
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
        showToast("L\u1ED7i khi g\u1EEDi l\u1EA1i email k\xEDch ho\u1EA1t", "error");
      }
    };
    const handleToggleLock = async (u) => {
      const actionText = u.status === "LOCKED" ? "m\u1EDF kh\xF3a" : "kh\xF3a";
      if (!confirm(`B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n ${actionText} t\xE0i kho\u1EA3n "${u.username}" kh\xF4ng?`)) {
        return;
      }
      try {
        const res = await fetch(`/api/v1/users/${u.id}/toggle-lock`, {
          method: "POST"
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || `Kh\xF4ng th\u1EC3 ${actionText} t\xE0i kho\u1EA3n`);
        }
        showToast(`\u0110\xE3 ${actionText} th\xE0nh c\xF4ng t\xE0i kho\u1EA3n "${u.username}"!`, "success");
        loadUsers();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    const handleLogout = async () => {
      try {
        await fetch("/api/v1/auth/logout", { method: "POST" });
      } catch (_) {
      }
      localStorage.removeItem("oms_token");
      setCurrentUser(null);
      showToast("\u0110\xE3 \u0111\u0103ng xu\u1EA5t kh\u1ECFi h\u1EC7 th\u1ED1ng", "success");
    };
    if (authChecking) {
      return /* @__PURE__ */ React.createElement("div", { style: { padding: "50px 20px", textAlign: "center", color: "#64748b" } }, /* @__PURE__ */ React.createElement("div", { className: "spinner", style: { margin: "0 auto 16px" } }), /* @__PURE__ */ React.createElement("p", null, "\u0110ang ki\u1EC3m tra th\xF4ng tin phi\xEAn l\xE0m vi\u1EC7c..."));
    }
    if (!currentUser) {
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "toast-container", "aria-live": "polite" }, toasts.map((t) => /* @__PURE__ */ React.createElement(Toast, { key: t.id, toast: t, onClose: removeToast }))), /* @__PURE__ */ React.createElement(
        LoginForm,
        {
          onLoginSuccess: (user) => {
            setCurrentUser(user);
            showToast(`Ch\xE0o m\u1EEBng ${user.full_name} (${user.role_name}) quay tr\u1EDF l\u1EA1i!`, "success");
          }
        }
      ));
    }
    const showingStart = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const showingEnd = Math.min(currentPage * pageSize, totalRecords);
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "toast-container", "aria-live": "polite" }, toasts.map((t) => /* @__PURE__ */ React.createElement(Toast, { key: t.id, toast: t, onClose: removeToast }))), /* @__PURE__ */ React.createElement("header", { className: "app-header" }, /* @__PURE__ */ React.createElement("div", { className: "header-container" }, /* @__PURE__ */ React.createElement("div", { className: "brand" }, /* @__PURE__ */ React.createElement("div", { className: "brand-logo" }, /* @__PURE__ */ React.createElement("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "7", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }), /* @__PURE__ */ React.createElement("path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }))), /* @__PURE__ */ React.createElement("div", { className: "brand-text" }, /* @__PURE__ */ React.createElement("h1", null, "H\u1EC7 Th\u1ED1ng Qu\u1EA3n L\xFD B\xE1n H\xE0ng & Kho"), /* @__PURE__ */ React.createElement("span", { className: "badge-sprint" }, "Sprint 1 \u2022 SCRUM-62 \u2022 React 18"))), /* @__PURE__ */ React.createElement("div", { className: "user-nav" }, /* @__PURE__ */ React.createElement("div", { className: "user-nav-avatar" }, currentUser.full_name ? currentUser.full_name.charAt(0).toUpperCase() : "U"), /* @__PURE__ */ React.createElement("div", { className: "user-nav-meta" }, /* @__PURE__ */ React.createElement("span", { className: "user-nav-name" }, currentUser.full_name), /* @__PURE__ */ React.createElement("span", { className: "user-nav-role" }, currentUser.role_name)), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-secondary",
        style: { padding: "6px 10px", fontSize: "12px" },
        onClick: () => setIsPasswordModalOpen(true),
        title: "\u0110\u1ED5i m\u1EADt kh\u1EA9u"
      },
      "\u0110\u1ED5i MK"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-secondary",
        style: { padding: "6px 10px", fontSize: "12px", color: "#ef4444" },
        onClick: handleLogout,
        title: "\u0110\u0103ng xu\u1EA5t"
      },
      "\u0110\u0103ng xu\u1EA5t"
    )))), /* @__PURE__ */ React.createElement("main", { className: "main-layout" }, /* @__PURE__ */ React.createElement("div", { className: "page-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "breadcrumbs" }, "Qu\u1EA3n tr\u1ECB vi\xEAn > T\xE0i kho\u1EA3n > Danh s\xE1ch ng\u01B0\u1EDDi d\xF9ng"), /* @__PURE__ */ React.createElement("h2", { className: "page-title" }, "Qu\u1EA3n l\xFD T\xE0i kho\u1EA3n & Ph\xE2n quy\u1EC1n"), /* @__PURE__ */ React.createElement("p", { className: "page-subtitle" }, "C\u1EA5p quy\u1EC1n cho nh\xE2n vi\xEAn kinh doanh m\u1EDBi nh\u1EADn \u0111\u1ECBa b\xE0n, qu\u1EA3n l\xFD v\xE0 tra c\u1EE9u th\xF4ng tin nh\xE2n s\u1EF1.")), /* @__PURE__ */ React.createElement("button", { className: "btn btn-primary", onClick: () => setIsCreateModalOpen(true) }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })), "Th\xEAm m\u1EDBi t\xE0i kho\u1EA3n")), /* @__PURE__ */ React.createElement("div", { className: "toolbar-card" }, /* @__PURE__ */ React.createElement("div", { className: "search-box" }, /* @__PURE__ */ React.createElement("svg", { className: "search-icon", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "8" }), /* @__PURE__ */ React.createElement("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })), /* @__PURE__ */ React.createElement(
      "input",
      {
        type: "text",
        placeholder: "T\xECm theo t\xEAn, t\xEAn t\xE0i kho\u1EA3n, s\u1ED1 \u0111i\u1EC7n tho\u1EA1i...",
        value: searchTerm,
        onChange: (e) => {
          setSearchTerm(e.target.value);
          setCurrentPage(1);
        }
      }
    ), searchTerm && /* @__PURE__ */ React.createElement("button", { className: "btn-clear", onClick: () => {
      setSearchTerm("");
      setCurrentPage(1);
    } }, "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "filter-group" }, /* @__PURE__ */ React.createElement("div", { className: "filter-item" }, /* @__PURE__ */ React.createElement("label", null, "Vai tr\xF2:"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: selectedRole,
        onChange: (e) => {
          setSelectedRole(e.target.value);
          setCurrentPage(1);
        },
        className: "select-control"
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "T\u1EA5t c\u1EA3 vai tr\xF2"),
      roles.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.code, value: r.code }, r.name))
    )), /* @__PURE__ */ React.createElement("div", { className: "filter-item" }, /* @__PURE__ */ React.createElement("label", null, "Tr\u1EA1ng th\xE1i:"), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: selectedStatus,
        onChange: (e) => {
          setSelectedStatus(e.target.value);
          setCurrentPage(1);
        },
        className: "select-control"
      },
      /* @__PURE__ */ React.createElement("option", { value: "" }, "T\u1EA5t c\u1EA3 tr\u1EA1ng th\xE1i"),
      /* @__PURE__ */ React.createElement("option", { value: "ACTIVE" }, "\u0110ang ho\u1EA1t \u0111\u1ED9ng"),
      /* @__PURE__ */ React.createElement("option", { value: "PENDING_ACTIVATION" }, "Ch\u1EDD k\xEDch ho\u1EA1t"),
      /* @__PURE__ */ React.createElement("option", { value: "LOCKED" }, "B\u1ECB kh\xF3a")
    )), (searchTerm || selectedRole || selectedStatus) && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-secondary",
        onClick: () => {
          setSearchTerm("");
          setSelectedRole("");
          setSelectedStatus("");
          setCurrentPage(1);
        }
      },
      "X\xF3a b\u1ED9 l\u1ECDc"
    ))), /* @__PURE__ */ React.createElement("div", { className: "table-card" }, loading && /* @__PURE__ */ React.createElement("div", { className: "loading-overlay" }, /* @__PURE__ */ React.createElement("div", { className: "spinner" }), /* @__PURE__ */ React.createElement("div", null, "\u0110ang t\u1EA3i d\u1EEF li\u1EC7u t\xE0i kho\u1EA3n...")), users.length === 0 && !loading ? /* @__PURE__ */ React.createElement("div", { className: "empty-state" }, /* @__PURE__ */ React.createElement("div", { className: "empty-icon" }, "\u{1F50D}"), /* @__PURE__ */ React.createElement("div", { className: "empty-title" }, "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi d\xF9ng ph\xF9 h\u1EE3p"), /* @__PURE__ */ React.createElement("div", { className: "empty-desc" }, "Th\u1EED t\xECm ki\u1EBFm v\u1EDBi t\u1EEB kh\xF3a kh\xE1c ho\u1EB7c \u0111i\u1EC1u ch\u1EC9nh l\u1EA1i b\u1ED9 l\u1ECDc vai tr\xF2, tr\u1EA1ng th\xE1i.")) : /* @__PURE__ */ React.createElement("table", { className: "user-table" }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", null, /* @__PURE__ */ React.createElement("th", { style: { width: "50px" } }, "STT"), /* @__PURE__ */ React.createElement("th", null, "H\u1ECD v\xE0 t\xEAn"), /* @__PURE__ */ React.createElement("th", null, "T\xEAn t\xE0i kho\u1EA3n"), /* @__PURE__ */ React.createElement("th", null, "Email"), /* @__PURE__ */ React.createElement("th", null, "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i"), /* @__PURE__ */ React.createElement("th", null, "Vai tr\xF2"), /* @__PURE__ */ React.createElement("th", null, "Tr\u1EA1ng th\xE1i"), /* @__PURE__ */ React.createElement("th", { style: { textAlign: "right", width: "170px" } }, "Thao t\xE1c"))), /* @__PURE__ */ React.createElement("tbody", null, users.map((u, idx) => {
      const stt = (currentPage - 1) * pageSize + idx + 1;
      return /* @__PURE__ */ React.createElement("tr", { key: u.id }, /* @__PURE__ */ React.createElement("td", null, stt), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "user-cell" }, /* @__PURE__ */ React.createElement("span", { className: "user-fullname" }, u.full_name))), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("strong", null, u.username)), /* @__PURE__ */ React.createElement("td", null, u.email, " ", u.email_sent ? /* @__PURE__ */ React.createElement("span", { title: "\u0110\xE3 g\u1EEDi email k\xEDch ho\u1EA1t", style: { color: "#10b981", marginLeft: "4px" } }, "\u2713") : /* @__PURE__ */ React.createElement("span", { title: "Ch\u01B0a g\u1EEDi \u0111\u01B0\u1EE3c email k\xEDch ho\u1EA1t", style: { color: "#ef4444", marginLeft: "4px" } }, "\u26A0")), /* @__PURE__ */ React.createElement("td", null, u.phone), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(RoleBadge, { roleCode: u.role_code, roleName: u.role_name })), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement(StatusBadge, { status: u.status, statusName: u.status_name })), /* @__PURE__ */ React.createElement("td", null, /* @__PURE__ */ React.createElement("div", { className: "row-actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn-action", onClick: () => setEditingUser(u), title: "Ch\u1EC9nh s\u1EEDa t\xE0i kho\u1EA3n" }, "S\u1EEDa"), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn-action",
          style: { color: u.status === "LOCKED" ? "#10b981" : "#f59e0b" },
          onClick: () => handleToggleLock(u),
          title: u.status === "LOCKED" ? "M\u1EDF kh\xF3a t\xE0i kho\u1EA3n" : "Kh\xF3a t\xE0i kho\u1EA3n"
        },
        u.status === "LOCKED" ? "M\u1EDF" : "Kh\xF3a"
      ), (!u.email_sent || u.status === "PENDING_ACTIVATION") && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn-action btn-action-resend",
          onClick: () => handleResendActivation(u.id, u.username),
          title: "G\u1EEDi l\u1EA1i email k\xEDch ho\u1EA1t"
        },
        "G\u1EEDi mail"
      ))));
    }))), /* @__PURE__ */ React.createElement("div", { className: "pagination-footer" }, /* @__PURE__ */ React.createElement("div", { className: "pagination-info" }, "Hi\u1EC3n th\u1ECB ", /* @__PURE__ */ React.createElement("span", null, showingStart), " - ", /* @__PURE__ */ React.createElement("span", null, showingEnd), " trong t\u1ED5ng s\u1ED1 ", /* @__PURE__ */ React.createElement("span", null, totalRecords), " t\xE0i kho\u1EA3n"), /* @__PURE__ */ React.createElement("div", { className: "pagination-controls" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-icon",
        disabled: currentPage <= 1,
        onClick: () => setCurrentPage((p) => Math.max(1, p - 1))
      },
      "\xAB Tr\u01B0\u1EDBc"
    ), /* @__PURE__ */ React.createElement("div", { className: "page-numbers" }, Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: p,
        className: `page-num ${p === currentPage ? "active" : ""}`,
        onClick: () => setCurrentPage(p)
      },
      p
    ))), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-icon",
        disabled: currentPage >= totalPages,
        onClick: () => setCurrentPage((p) => Math.min(totalPages, p + 1))
      },
      "Sau \xBB"
    ))))), /* @__PURE__ */ React.createElement(
      CreateUserModal,
      {
        isOpen: isCreateModalOpen,
        onClose: () => setIsCreateModalOpen(false),
        onSuccess: () => {
          setCurrentPage(1);
          loadUsers();
        },
        roles,
        onShowToast: showToast
      }
    ), /* @__PURE__ */ React.createElement(
      EditUserModal,
      {
        isOpen: !!editingUser,
        user: editingUser,
        onClose: () => setEditingUser(null),
        onSuccess: loadUsers,
        roles,
        onShowToast: showToast
      }
    ), /* @__PURE__ */ React.createElement(
      ChangePasswordModal,
      {
        isOpen: isPasswordModalOpen,
        username: currentUser?.username,
        onClose: () => setIsPasswordModalOpen(false),
        onShowToast: showToast
      }
    ));
  }
  var rootElement = document.getElementById("root");
  if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(/* @__PURE__ */ React.createElement(UserManagementApp, null));
  }
})();
