export type AccountStatus = "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING_ACTIVATION";

export interface Role {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  phone?: string | null;
  status: AccountStatus;
  must_change_password: boolean;
  roles: Role[];
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserCreatePayload {
  username: string;
  full_name: string;
  email: string;
  phone?: string | null;
  role?: string;
  role_codes?: string[];
  status?: AccountStatus;
}

export interface UserUpdatePayload {
  full_name?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  role_codes?: string[];
  status?: AccountStatus;
}

export interface CreateUserResult {
  message: string;
  user: User;
  email_sent: boolean;
  activation_link?: string | null;
}

export interface FilterParams {
  search: string;
  role: string;
  status: string;
  page: number;
  size: number;
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  title: string;
  message: string;
}

export const ROLE_OPTIONS = [
  { code: "", label: "Tất cả vai trò" },
  { code: "ADMIN", label: "Quản trị hệ thống" },
  { code: "SALES_REP", label: "Nhân viên kinh doanh" },
  { code: "SALES_MANAGER", label: "Quản lý kinh doanh" },
  { code: "WAREHOUSE", label: "Nhân viên kho" },
  { code: "WH_MANAGER", label: "Quản lý kho" },
  { code: "ACCOUNTANT", label: "Kế toán công nợ" },
  { code: "CUSTOMER", label: "Đại lý" },
];

export const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "ACTIVE", label: "Hoạt động" },
  { value: "LOCKED", label: "Tạm khóa" },
  { value: "PENDING_ACTIVATION", label: "Chờ kích hoạt" },
  { value: "DISABLED", label: "Vô hiệu hóa" },
];
