/**
 * Authentication Service for OMS.
 * Handles login, session token storage, and authentication API requests.
 */

export interface LoginPayload {
  username?: string;
  email?: string;
  password: string;
}

export interface UserInfo {
  username?: string;
  role_code?: string;
}

export interface LoginResponse {
  message?: string;
  access_token?: string;
  token_type?: string;
  redirect_url: string;
  user?: UserInfo;
  session_token?: string;
  expires_in?: number;
}

export interface ApiErrorDetailObject {
  message?: string;
  retry_after_seconds?: number;
}

export interface ApiErrorResponse {
  detail?: string | ApiErrorDetailObject | Array<{ msg?: string; loc?: string[] }>;
}

export class AuthError extends Error {
  status: number;
  detail?: string | ApiErrorDetailObject | Array<{ msg?: string; loc?: string[] }>;

  constructor(status: number, message: string, detail?: any) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Sends login credentials to `/api/v1/auth/login`.
 * Supports either username or email along with password.
 */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const trimmedUser = payload.username?.trim();
  const trimmedEmail = payload.email?.trim();

  // If user entered an email address into username field, support both
  const isEmail = Boolean(trimmedUser && trimmedUser.includes("@"));
  const requestBody: { username?: string; email?: string; password: string } = {
    password: payload.password,
  };

  if (trimmedEmail) {
    requestBody.email = trimmedEmail;
  }
  if (trimmedUser) {
    requestBody.username = trimmedUser;
    if (isEmail && !trimmedEmail) {
      requestBody.email = trimmedUser;
    }
  }

  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse = {};
    try {
      errorData = (await response.json()) as ApiErrorResponse;
    } catch {
      // response is not json
    }

    let defaultMsg = "Đăng nhập không thành công.";
    if (response.status === 401) {
      defaultMsg = "Tên đăng nhập hoặc mật khẩu không chính xác.";
    } else if (response.status === 422) {
      defaultMsg = "Dữ liệu đăng nhập không hợp lệ. Vui lòng kiểm tra lại.";
    } else if (response.status === 423) {
      if (typeof errorData.detail === "object" && "message" in errorData.detail) {
        defaultMsg = errorData.detail.message || "Tài khoản đang bị tạm khóa.";
      } else {
        defaultMsg = "Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.";
      }
    } else if (response.status === 403) {
      defaultMsg = typeof errorData.detail === "string" ? errorData.detail : "Tài khoản không được phép truy cập.";
    }

    throw new AuthError(response.status, defaultMsg, errorData.detail);
  }

  return (await response.json()) as LoginResponse;
}

/**
 * Stores tokens and user details into browser storage upon successful login.
 */
export function persistLoginSession(result: LoginResponse): void {
  if (typeof window === "undefined") return;

  // Clear obsolete tokens
  for (const key of [
    "session_token",
    "session_expires_at",
    "access_token",
    "access_token_expires_at",
    "user_role",
    "user_name",
    "token",
  ]) {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  }

  // Session token
  if (result.session_token) {
    window.sessionStorage.setItem("session_token", result.session_token);
    window.localStorage.setItem("session_token", result.session_token);
    window.localStorage.setItem("token", result.session_token);
    const exp = String(Date.now() + (result.expires_in ?? 12 * 60 * 60) * 1000);
    window.sessionStorage.setItem("session_expires_at", exp);
    window.localStorage.setItem("session_expires_at", exp);
  }

  // Access token
  if (result.access_token) {
    window.sessionStorage.setItem("access_token", result.access_token);
    window.localStorage.setItem("access_token", result.access_token);
    const accExp = String(Date.now() + 58 * 60 * 1000);
    window.sessionStorage.setItem("access_token_expires_at", accExp);
    window.localStorage.setItem("access_token_expires_at", accExp);
  }

  // User details
  if (result.user?.username) {
    window.sessionStorage.setItem("user_name", result.user.username);
    window.localStorage.setItem("user_name", result.user.username);
  }
  if (result.user?.role_code) {
    window.sessionStorage.setItem("user_role", result.user.role_code);
    window.localStorage.setItem("user_role", result.user.role_code);
  }
}
