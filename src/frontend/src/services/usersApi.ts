import {
  CreateUserResult,
  FilterParams,
  User,
  UserCreatePayload,
  UserListResponse,
  UserUpdatePayload,
} from "../types/user";

const BASE_URL = "/api/v1/admin/users";

export interface ParsedApiError {
  generalMessage: string;
  fieldErrors: Record<string, string>;
  status?: number;
}

export function parseApiError(errorData: unknown, status?: number): ParsedApiError {
  const fieldErrors: Record<string, string> = {};
  let generalMessage = "Có lỗi xảy ra khi thực hiện yêu cầu. Vui lòng thử lại.";

  if (!errorData || typeof errorData !== "object") {
    if (status === 403) {
      generalMessage = "Bạn không có quyền thực hiện chức năng này (yêu cầu quyền Quản trị viên).";
    } else if (status === 404) {
      generalMessage = "Không tìm thấy người dùng được yêu cầu.";
    }
    return { generalMessage, fieldErrors, status };
  }

  const obj = errorData as Record<string, unknown>;
  const detail = obj.detail;

  if (typeof detail === "string") {
    generalMessage = detail;
    const lower = detail.toLowerCase();

    // Map duplicate/validation errors directly to their corresponding form fields (SCRUM-110)
    if (lower.includes("tên tài khoản") || lower.includes("tên đăng nhập") || lower.includes("username")) {
      fieldErrors.username = detail;
    }
    if (lower.includes("email")) {
      fieldErrors.email = detail;
    }
    if (lower.includes("số điện thoại") || lower.includes("sđt") || lower.includes("phone")) {
      fieldErrors.phone = detail;
    }
    if (lower.includes("họ và tên") || lower.includes("full_name")) {
      fieldErrors.full_name = detail;
    }
  } else if (Array.isArray(detail)) {
    // FastAPI / Pydantic validation error list: [{ loc: ['body', 'field'], msg: '...', type: '...' }]
    const messages: string[] = [];
    for (const item of detail) {
      if (item && typeof item === "object") {
        const itemObj = item as Record<string, unknown>;
        const loc = Array.isArray(itemObj.loc) ? itemObj.loc : [];
        const rawField = loc[loc.length - 1];
        const fieldName = typeof rawField === "string" ? rawField : "";
        const rawMsg = typeof itemObj.msg === "string" ? itemObj.msg : "Dữ liệu không hợp lệ";
        const cleanMsg = rawMsg.replace(/^Value error,\s*/i, "");

        if (fieldName) {
          fieldErrors[fieldName] = cleanMsg;
        }
        messages.push(cleanMsg);
      }
    }
    if (messages.length > 0) {
      generalMessage = messages.join(" ");
    }
  }

  return { generalMessage, fieldErrors, status };
}

const defaultHeaders: HeadersInit = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "X-User-Role": "ADMIN",
};

export async function fetchUsersApi(params: FilterParams): Promise<UserListResponse> {
  const query = new URLSearchParams();
  if (params.search?.trim()) {
    query.set("search", params.search.trim());
  }
  if (params.role?.trim()) {
    query.set("role", params.role.trim());
  }
  if (params.status?.trim()) {
    query.set("status", params.status.trim());
  }
  query.set("page", String(params.page || 1));
  query.set("size", String(params.size || 20));

  const response = await fetch(`${BASE_URL}?${query.toString()}`, {
    method: "GET",
    headers: defaultHeaders,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw parseApiError(errorJson, response.status);
  }

  return (await response.json()) as UserListResponse;
}

export async function createUserApi(payload: UserCreatePayload): Promise<CreateUserResult> {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw parseApiError(errorJson, response.status);
  }

  return (await response.json()) as CreateUserResult;
}

export async function updateUserApi(
  id: number,
  payload: UserUpdatePayload
): Promise<User> {
  const response = await fetch(`${BASE_URL}/${id}`, {
    method: "PUT",
    headers: defaultHeaders,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw parseApiError(errorJson, response.status);
  }

  return (await response.json()) as User;
}

export async function toggleUserStatusApi(
  id: number,
  currentStatus: string
): Promise<User> {
  const newStatus = currentStatus === "LOCKED" ? "ACTIVE" : "LOCKED";
  return updateUserApi(id, { status: newStatus as any });
}
