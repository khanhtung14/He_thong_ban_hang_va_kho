import React, { FormEvent, useEffect, useState } from "react";
import { createUserApi, updateUserApi } from "../services/usersApi";
import {
  AccountStatus,
  ROLE_OPTIONS,
  STATUS_OPTIONS,
  User,
  UserCreatePayload,
  UserUpdatePayload,
} from "../types/user";

interface UserModalProps {
  isOpen: boolean;
  user: User | null; // null => Create Mode, User => Edit Mode (SCRUM-111 reuse)
  onClose: () => void;
  onSubmitSuccess: (message: string) => void;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;
const PHONE_REGEX = /^0\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const UserModal: React.FC<UserModalProps> = ({
  isOpen,
  user,
  onClose,
  onSubmitSuccess,
}) => {
  const isEditMode = user !== null;

  // Form states
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("SALES_REP");
  const [status, setStatus] = useState<AccountStatus>("PENDING_ACTIVATION");

  // Feedback states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset form values when modal opens or user prop changes
  useEffect(() => {
    if (!isOpen) return;

    if (user) {
      // Edit mode: populate existing user data
      setUsername(user.username);
      setFullName(user.full_name);
      setEmail(user.email);
      setPhone(user.phone || "");
      const primaryRole = user.roles?.[0]?.code || "SALES_REP";
      setRole(primaryRole);
      setStatus(user.status);
    } else {
      // Create mode: set clean defaults
      setUsername("");
      setFullName("");
      setEmail("");
      setPhone("");
      setRole("SALES_REP"); // Default to sales rep as requested by user story
      setStatus("PENDING_ACTIVATION");
    }

    setErrors({});
    setGeneralError("");
  }, [isOpen, user]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Client-side validation function
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Username (only validated on create mode)
    if (!isEditMode) {
      const u = username.trim();
      if (!u) {
        newErrors.username = "Tên đăng nhập không được để trống.";
      } else if (u.length < 3 || u.length > 30) {
        newErrors.username = "Tên đăng nhập phải từ 3 đến 30 ký tự.";
      } else if (!USERNAME_REGEX.test(u)) {
        newErrors.username =
          "Tên đăng nhập chỉ chứa chữ cái, số, gạch dưới (_), gạch ngang (-) hoặc dấu chấm (.).";
      }
    }

    // 2. Full Name
    const fn = fullName.trim();
    if (!fn) {
      newErrors.full_name = "Họ và tên không được để trống.";
    } else if (fn.length > 150) {
      newErrors.full_name = "Họ và tên không được vượt quá 150 ký tự.";
    }

    // 3. Email
    const em = email.trim();
    if (!em) {
      newErrors.email = "Email không được để trống.";
    } else if (!EMAIL_REGEX.test(em)) {
      newErrors.email = "Địa chỉ email không đúng định dạng (ví dụ: ten@domain.com).";
    }

    // 4. Phone (optional, but if provided must follow format)
    const ph = phone.trim();
    if (ph && !PHONE_REGEX.test(ph)) {
      newErrors.phone = "Số điện thoại không hợp lệ. Phải gồm 10 chữ số và bắt đầu bằng số 0.";
    }

    // 5. Role
    if (!role) {
      newErrors.role = "Vui lòng chọn vai trò cho người dùng.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldChange = (field: string, value: string) => {
    // Clear specific field error when user starts modifying it
    if (errors[field]) {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
    setGeneralError("");

    switch (field) {
      case "username":
        setUsername(value);
        break;
      case "full_name":
        setFullName(value);
        break;
      case "email":
        setEmail(value);
        break;
      case "phone":
        setPhone(value);
        break;
      case "role":
        setRole(value);
        break;
      case "status":
        setStatus(value as AccountStatus);
        break;
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setGeneralError("");

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEditMode && user) {
        // Update user (SCRUM-111)
        const updatePayload: UserUpdatePayload = {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role: role,
          role_codes: [role],
          status: status,
        };

        await updateUserApi(user.id, updatePayload);
        onSubmitSuccess(`Cập nhật thông tin tài khoản "${user.username}" thành công!`);
        onClose();
      } else {
        // Create user (SCRUM-110)
        const createPayload: UserCreatePayload = {
          username: username.trim(),
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          role: role,
          role_codes: [role],
          status: status,
        };

        const result = await createUserApi(createPayload);
        onSubmitSuccess(
          result.message ||
            `Tạo tài khoản "${createPayload.username}" thành công và đã gửi email kích hoạt!`
        );
        onClose();
      }
    } catch (err: any) {
      // Map duplicate errors directly to the corresponding input field (SCRUM-110)
      if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors }));
      }
      setGeneralError(err.generalMessage || "Không thể lưu thông tin tài khoản. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="modal-dialog">
        <header className="modal-header">
          <div>
            <h2 id="modal-title" className="modal-title">
              {isEditMode ? "Chỉnh sửa thông tin tài khoản" : "Tạo tài khoản người dùng mới"}
            </h2>
            <p className="modal-subtitle">
              {isEditMode
                ? "Cập nhật thông tin chi tiết, vai trò và trạng thái tài khoản."
                : "Nhập thông tin nhân viên mới để cấp tài khoản và gửi email kích hoạt kèm mật khẩu tạm."}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Đóng hộp thoại"
          >
            ✕
          </button>
        </header>

        {generalError && (
          <div className="modal-alert-error" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          {/* Username Field */}
          <div className="form-group">
            <label htmlFor="form-username" className="form-label">
              Tên đăng nhập <span className="text-danger">*</span>
            </label>
            <input
              id="form-username"
              type="text"
              className={`form-input ${errors.username ? "input-error" : ""}`}
              placeholder="VD: sales_tuan"
              value={username}
              onChange={(e) => handleFieldChange("username", e.target.value)}
              disabled={isEditMode || isSubmitting}
              autoComplete="off"
              required
            />
            {isEditMode ? (
              <p className="form-hint">Tên đăng nhập là định danh cố định, không thể thay đổi sau khi tạo.</p>
            ) : (
              <p className="form-hint">Chỉ gồm chữ cái, số, dấu chấm, gạch dưới hoặc gạch ngang (3-30 ký tự).</p>
            )}
            {errors.username && (
              <p className="field-error-msg" role="alert">
                {errors.username}
              </p>
            )}
          </div>

          {/* Full Name Field */}
          <div className="form-group">
            <label htmlFor="form-fullname" className="form-label">
              Họ và tên <span className="text-danger">*</span>
            </label>
            <input
              id="form-fullname"
              type="text"
              className={`form-input ${errors.full_name ? "input-error" : ""}`}
              placeholder="VD: Nông Quốc Tuấn"
              value={fullName}
              onChange={(e) => handleFieldChange("full_name", e.target.value)}
              disabled={isSubmitting}
              maxLength={150}
              required
            />
            {errors.full_name && (
              <p className="field-error-msg" role="alert">
                {errors.full_name}
              </p>
            )}
          </div>

          <div className="form-row-2">
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="form-email" className="form-label">
                Email nhận thông tin <span className="text-danger">*</span>
              </label>
              <input
                id="form-email"
                type="email"
                className={`form-input ${errors.email ? "input-error" : ""}`}
                placeholder="VD: nhanvien@congty.com"
                value={email}
                onChange={(e) => handleFieldChange("email", e.target.value)}
                disabled={isSubmitting}
                required
              />
              {errors.email && (
                <p className="field-error-msg" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Phone Field */}
            <div className="form-group">
              <label htmlFor="form-phone" className="form-label">
                Số điện thoại
              </label>
              <input
                id="form-phone"
                type="tel"
                className={`form-input ${errors.phone ? "input-error" : ""}`}
                placeholder="VD: 0987654321"
                value={phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                disabled={isSubmitting}
                maxLength={10}
              />
              {errors.phone && (
                <p className="field-error-msg" role="alert">
                  {errors.phone}
                </p>
              )}
            </div>
          </div>

          <div className="form-row-2">
            {/* Role Select */}
            <div className="form-group">
              <label htmlFor="form-role" className="form-label">
                Vai trò <span className="text-danger">*</span>
              </label>
              <select
                id="form-role"
                className={`form-select ${errors.role ? "input-error" : ""}`}
                value={role}
                onChange={(e) => handleFieldChange("role", e.target.value)}
                disabled={isSubmitting}
              >
                {ROLE_OPTIONS.filter((r) => r.code !== "").map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.role && (
                <p className="field-error-msg" role="alert">
                  {errors.role}
                </p>
              )}
            </div>

            {/* Status Select */}
            <div className="form-group">
              <label htmlFor="form-status" className="form-label">
                Trạng thái ban đầu
              </label>
              <select
                id="form-status"
                className="form-select"
                value={status}
                onChange={(e) => handleFieldChange("status", e.target.value)}
                disabled={isSubmitting}
              >
                {STATUS_OPTIONS.filter((s) => s.value !== "").map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <footer className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting && <span className="btn-spinner" aria-hidden="true" />}
              {isSubmitting
                ? "Đang lưu..."
                : isEditMode
                ? "Lưu thay đổi"
                : "Tạo tài khoản"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
