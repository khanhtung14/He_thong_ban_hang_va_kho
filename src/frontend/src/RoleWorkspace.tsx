import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { authenticatedFetch, logout, getCurrentUserRole, hasValidSession } from "./session";
import Profile from "./Profile";
import ProfileAvatar from "./ProfileAvatar";
import SalesManagerDashboard from "./roles/sales_manager/SalesManagerDashboard";
import Error403 from "./Error403";
import CustomerManagement from "./CustomerManagement";
import CreateOrder from "./CreateOrder";
import OrderManagement from "./OrderManagement";
import HeaderTailwind from "./components/Header/HeaderTailwind";
import SidebarTailwind, { type MenuItem } from "./components/Sidebar/SidebarTailwind";


import "./RoleWorkspace.css";


type RoleKey = "customer" | "sales" | "salesManager" | "warehouse" | "warehouseManager" | "accountant" | "admin";
type ViewItem = { id: string; label: string; icon: string; section?: string };
type Product = { sku: string; name: string; category?: string; sale_price: number; stock_available?: number; unit?: string; cost_price?: number; margin?: string };
type InventoryItem = { sku: string; name: string; warehouse_id: number; warehouse_name: string; quantity_available: number };
type UserRole = string | { code: string; name: string };
type UserRow = { id: number; username: string; full_name: string; email?: string; phone?: string | null; status: string; is_active?: boolean; roles: UserRole[]; territories?: AssignmentOption[]; assigned_dealers_count?: number };
type AssignmentOption = { id: number; code: string; name: string };
type AssignmentForm = { role_ids: number[]; warehouse_ids: number[]; territory_ids: number[] };
type AssignmentOptions = { roles: AssignmentOption[]; warehouses: AssignmentOption[]; territories: AssignmentOption[] };

const roleByPath: Record<string, RoleKey> = {
  "/portal/orders": "customer",
  "/sales/orders": "sales",
  "/sales/customers": "sales",
  "/manager/dashboard": "salesManager",
  "/manager/orders/approval": "salesManager",
  "/manager/pricing": "salesManager",
  "/manager/reports": "salesManager",
  "/warehouse/picking": "warehouse",
  "/warehouse/receiving": "warehouse",
  "/warehouse/inventory": "warehouse",
  "/warehouse/dashboard": "warehouseManager",
  "/accounting/debt-book": "accountant",
  "/accounting/invoices": "accountant",
  "/admin/users": "admin",
  "/admin/territory-handover": "admin",
  "/admin/audit-logs": "admin",
};

const allowedRolesByPath: Record<string, RoleKey[]> = {
  "/portal/orders": ["customer", "admin"],
  "/sales/orders": ["sales", "salesManager", "customer", "accountant", "admin"],
  "/sales/customers": ["sales", "salesManager", "admin"],
  "/manager/dashboard": ["salesManager", "admin"],
  "/manager/orders/approval": ["salesManager", "admin"],
  "/manager/pricing": ["salesManager", "admin"],
  "/manager/reports": ["salesManager", "admin"],
  "/warehouse/picking": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/receiving": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/inventory": ["warehouse", "warehouseManager", "salesManager", "admin"],
  "/warehouse/dashboard": ["warehouseManager", "admin"],
  "/accounting/debt-book": ["accountant", "admin"],
  "/accounting/invoices": ["accountant", "admin"],
  "/admin/users": ["admin"],
  "/admin/territory-handover": ["admin"],
  "/admin/audit-logs": ["admin"],
};

const roleDetails: Record<RoleKey, { name: string; eyebrow: string; title: string; description: string; initials: string; views: ViewItem[] }> = {
  customer: {
    name: "Đại lý", eyebrow: "CỔNG ĐẠI LÝ", title: "Xin chào, đối tác", description: "Đặt hàng và theo dõi hoạt động kinh doanh của cửa hàng.", initials: "ĐL",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "CỬA HÀNG" },
      { id: "products", label: "Sản phẩm", icon: "▦" },
      { id: "orders", label: "Đơn hàng", icon: "▤" },
      { id: "debt", label: "Công nợ & hóa đơn", icon: "◷", section: "TÀI CHÍNH" },
      { id: "profile", label: "Tài khoản", icon: "◉", section: "CÁ NHÂN" },
    ],
  },
  sales: {
    name: "Nhân viên kinh doanh", eyebrow: "SALES WORKSPACE", title: "Bàn làm việc kinh doanh", description: "Theo dõi tuyến, tạo đơn và chăm sóc đại lý được giao.", initials: "KD",
    views: [
      { id: "overview", label: "Tổng quan tuyến", icon: "⌂", section: "KINH DOANH" },
      { id: "new-order", label: "Tạo đơn hàng", icon: "＋" },
      { id: "customers", label: "Đại lý phụ trách", icon: "♧" },
      { id: "orders", label: "Đơn hàng", icon: "▤" },
      { id: "collections", label: "Thu tiền", icon: "₫", section: "CÔNG NỢ" },
    ],
  },
  salesManager: {
    name: "Quản lý kinh doanh", eyebrow: "SALES MANAGEMENT", title: "Trung tâm điều hành kinh doanh", description: "Theo dõi hiệu quả, duyệt ngoại lệ và chính sách bảng giá.", initials: "QL",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "ĐIỀU HÀNH" },
      { id: "approvals", label: "Duyệt đơn", icon: "✓" },
      { id: "reports", label: "Doanh số & lợi nhuận", icon: "▥", section: "PHÂN TÍCH" },
      { id: "products", label: "Sản phẩm", icon: "▦" },
    ],
  },
  warehouse: {
    name: "Nhân viên kho", eyebrow: "WAREHOUSE OPERATIONS", title: "Công việc trong kho", description: "Xử lý phiếu hàng và cập nhật tình hình kho được phân công.", initials: "K",
    views: [
      { id: "picking", label: "Phiếu soạn hàng", icon: "▤", section: "TÁC NGHIỆP" },
      { id: "receiving", label: "Nhập hàng", icon: "↓" },
      { id: "inventory", label: "Tồn kho", icon: "▦", section: "KHO HÀNG" },
      { id: "count", label: "Kiểm kê", icon: "☷" },
    ],
  },
  warehouseManager: {
    name: "Quản lý kho", eyebrow: "WAREHOUSE CONTROL", title: "Điều hành kho vận", description: "Theo dõi tồn kho, điều chỉnh và luân chuyển hàng hóa.", initials: "KQL",
    views: [
      { id: "overview", label: "Tổng quan kho", icon: "⌂", section: "ĐIỀU HÀNH" },
      { id: "inventory", label: "Tồn kho", icon: "▦" },
      { id: "adjustments", label: "Điều chỉnh tồn", icon: "±" },
      { id: "transfers", label: "Chuyển kho", icon: "⇄", section: "KIỂM SOÁT" },
      { id: "stocktakes", label: "Kiểm kê", icon: "☷" },
    ],
  },
  accountant: {
    name: "Kế toán công nợ", eyebrow: "FINANCE WORKSPACE", title: "Sổ công nợ & hóa đơn", description: "Đối soát khoản phải thu, thanh toán và chứng từ.", initials: "KT",
    views: [
      { id: "overview", label: "Tổng quan công nợ", icon: "⌂", section: "KẾ TOÁN" },
      { id: "customers", label: "Đại lý & Khóa GD", icon: "🔒", section: "QUẢN LÝ ĐỐI TÁC" },
      { id: "orders", label: "Đơn hàng & Đơn dở", icon: "▤" },
      { id: "debts", label: "Sổ công nợ", icon: "◷", section: "SỔ SÁCH" },
      { id: "invoices", label: "Hóa đơn", icon: "▤", section: "CHỨNG TỪ" },
      { id: "payments", label: "Thanh toán", icon: "₫" },
      { id: "reconciliation", label: "Đối soát", icon: "⇄" },
    ],
  },

  admin: {
    name: "Quản trị hệ thống", eyebrow: "SYSTEM ADMINISTRATION", title: "Quản trị hệ thống", description: "Quản lý tài khoản, trạng thái truy cập và nhật ký bảo mật.", initials: "AD",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "HỆ THỐNG" },
      { id: "users", label: "Tài khoản người dùng", icon: "♧" },
      { id: "rbac", label: "Ma trận phân quyền (RBAC)", icon: "⬡", section: "QUẢN TRỊ" },
      { id: "configuration", label: "Danh mục hệ thống", icon: "⚙" },
      { id: "audit", label: "Nhật ký hệ thống", icon: "◷" },
    ],
  },
};

const formatMoney = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
const demoOrders = [
  { id: "DH-240815", customer: "Tạp hóa Minh Anh", total: 12400000, status: "Chờ duyệt", tone: "amber" },
  { id: "DH-240812", customer: "Đại lý Hoàng Long", total: 8600000, status: "Đang soạn", tone: "blue" },
  { id: "DH-240809", customer: "Cửa hàng Hồng Phúc", total: 15800000, status: "Đang giao", tone: "violet" },
];
const demoCustomers = [
  { name: "Tạp hóa Minh Anh", code: "DL-HN-0148", area: "Cầu Giấy", debt: 12400000, due: "Hôm nay" },
  { name: "Đại lý Hoàng Long", code: "DL-HN-0120", area: "Đống Đa", debt: 8600000, due: "Còn 3 ngày" },
  { name: "Cửa hàng Hồng Phúc", code: "DL-HN-0091", area: "Ba Đình", debt: 0, due: "Đã đối soát" },
];

function normalizeRole(value: string | null): RoleKey | null {
  const role = (value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
  if (["CUSTOMER", "DAI_LY", "KHACH_HANG"].includes(role)) return "customer";
  if (["SALES", "SALES_REP", "KINH_DOANH"].includes(role)) return "sales";
  if (["SALES_MANAGER", "QUAN_LY_KINH_DOANH", "SALESMANAGER"].includes(role)) return "salesManager";
  if (["WAREHOUSE", "KHO"].includes(role)) return "warehouse";
  if (["WH_MANAGER", "WAREHOUSE_MANAGER", "QUAN_LY_KHO"].includes(role)) return "warehouseManager";
  if (["ACCOUNTANT", "KE_TOAN"].includes(role)) return "accountant";
  if (["ADMIN", "ADMINISTRATOR", "QUAN_TRI"].includes(role)) return "admin";
  return null;
}


function goBack(role: RoleKey) {
  const previous = document.referrer;
  if (previous.startsWith(window.location.origin) && !new URL(previous).pathname.startsWith("/login")) {
    window.history.back();
    return;
  }
  const fallback = Object.entries(roleByPath).find(([, value]) => value === role)?.[0] ?? "/";
  window.location.assign(fallback);
}

async function readResponse<T>(path: string): Promise<T> {
  const response = await authenticatedFetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : "Không tải được dữ liệu từ máy chủ.";
    throw new Error(detail);
  }
  return body as T;
}

function StatusPill({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  return <span className={`workspace-status is-${tone}`}>{children}</span>;
}

function PrototypeBanner({ text = "Bản giao diện mẫu · chức năng này chưa có API lưu dữ liệu." }: { text?: string }) {
  return <div className="workspace-prototype"><span aria-hidden="true">✳</span><span>{text}</span></div>;
}

function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="workspace-page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function MetricCard({ label, value, change, icon, accent = "blue" }: { label: string; value: string; change?: string; icon: string; accent?: string }) {
  return <article className="workspace-metric"><div className={`workspace-metric-icon is-${accent}`}>{icon}</div><div className="workspace-metric-label">{label}</div><div className="workspace-metric-value">{value}</div>{change && <div className="workspace-metric-change">{change}</div>}</article>;
}

function TableShell({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export default function RoleWorkspace() {
  if (!hasValidSession()) {
    window.location.assign("/login");
    return null;
  }

  const currentUserRoleStr = getCurrentUserRole();
  const currentUserRole = normalizeRole(currentUserRoleStr);
  const currentPath = window.location.pathname;

  // Strict Admin route guard: non-admin users must NEVER access /admin/*
  if (currentPath.startsWith("/admin/") && currentUserRole !== "admin") {
    return <Error403 />;
  }

  // Path authorization check based on allowed roles
  const allowed = allowedRolesByPath[currentPath];
  if (allowed && currentUserRole && !allowed.includes(currentUserRole) && currentUserRole !== "admin") {
    return <Error403 />;
  }

  const pathRole = roleByPath[currentPath] || null;

  // Active role: admin can view target path if provided; otherwise strictly user's logged-in role
  const role: RoleKey | null = (currentUserRole === "admin" && pathRole) ? pathRole : (currentUserRole || pathRole);
  const details = role ? roleDetails[role] : null;
  const initialView = new URLSearchParams(window.location.search).get("view");
  const [view, setView] = useState(initialView ?? details?.views[0]?.id ?? "overview");
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOptions>({ roles: [], warehouses: [], territories: [] });
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm>({ role_ids: [], warehouse_ids: [], territory_ids: [] });
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentLoadError, setAssignmentLoadError] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("ALL");
  const [userRoleFilter, setUserRoleFilter] = useState("ALL");
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setCartCount] = useState(0);
  const [adjustment, setAdjustment] = useState({ sku: "SKU-001", quantity_delta: "", reason: "" });
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [lockTarget, setLockTarget] = useState<UserRow | null>(null);
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [openAssignmentGroup, setOpenAssignmentGroup] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", phone: "", status: "ACTIVE" });
  const [lockReason, setLockReason] = useState("");
  const [userActionBusy, setUserActionBusy] = useState(false);
  const [auditModal, setAuditModal] = useState<{ title: string; rows: Array<Record<string, unknown>> } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!openAssignmentGroup) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".workspace-assignment-group.is-open")) {
        setOpenAssignmentGroup(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [openAssignmentGroup]);

  useEffect(() => {
    const onPopState = () => setView(new URLSearchParams(window.location.search).get("view") ?? details?.views[0]?.id ?? "overview");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [details]);

  useEffect(() => {
    if (!role) return;
    const shouldProducts = ["customer", "sales"].includes(role) && ["overview", "products", "new-order"].includes(view);
    const shouldInventory = ["sales", "warehouse", "warehouseManager"].includes(role) && ["overview", "inventory", "picking", "adjustments"].includes(view);
    const shouldUsers = role === "admin" && ["overview", "users", "audit"].includes(view);
    if (!shouldProducts && !shouldInventory && !shouldUsers) return;

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const requests: Promise<void>[] = [];
    if (shouldProducts) requests.push(readResponse<Product[]>("/api/v1/products").then((data) => { if (!cancelled) setProducts(data); }).catch((error: Error) => { if (!cancelled) setLoadError(error.message); }));
    if (shouldInventory) requests.push(readResponse<InventoryItem[]>("/api/v1/inventory/items").then((data) => { if (!cancelled) setInventory(data); }).catch((error: Error) => { if (!cancelled) setLoadError(error.message); }));
    if (shouldUsers) {
      const isUsersPage = view === "users";
      const params = new URLSearchParams({ page: String(isUsersPage ? userPage : 1), page_size: isUsersPage ? "20" : "100" });
      if (isUsersPage && userSearch.trim()) params.set("search", userSearch.trim());
      if (isUsersPage && userFilter !== "ALL") params.set("status", userFilter);
      if (isUsersPage && userRoleFilter !== "ALL") params.set("role", userRoleFilter);
      requests.push(readResponse<{ items: UserRow[]; total: number; total_pages: number }>(`/api/v1/admin/users?${params}`).then((data) => { if (!cancelled) { setUsers(data.items); setUserTotal(data.total); setUserTotalPages(data.total_pages); } }).catch((error: Error) => { if (!cancelled) setLoadError(error.message); }));
      requests.push(readResponse<AssignmentOptions>("/api/v1/admin/assignment-options").then((data) => { if (!cancelled) setAssignmentOptions(data); }).catch((error: Error) => { if (!cancelled) setLoadError(error.message); }));
    }
    Promise.all(requests).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [role, view, userSearch, userFilter, userRoleFilter, userPage]);

  const heading = useMemo(() => details?.views.find((item) => item.id === view)?.label ?? details?.views[0]?.label ?? "Tổng quan", [details, view]);
  const username = window.sessionStorage.getItem("user_name") || "Người dùng";
  const adminMenuItems: MenuItem[] = [
    { id: "overview", title: "Tổng quan", path: "/admin/users?view=overview", icon: "home" },
    { id: "users", title: "Tài khoản người dùng", path: "/admin/users?view=users", icon: "users" },
    { id: "rbac", title: "Ma trận phân quyền (RBAC)", path: "/admin/users?view=rbac", icon: "approval" },
    { id: "configuration", title: "Danh mục hệ thống", path: "/admin/users?view=configuration", icon: "boxes-stacked" },
    { id: "audit", title: "Nhật ký hệ thống", path: "/admin/users?view=audit", icon: "chart" },
  ];

  function navigate(nextView: string) {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.pushState({}, "", url);
    setNotice("");
  }

  async function submitInventoryAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAdjusting(true);
    setNotice("");
    try {
      const selected = inventory.find((item) => item.sku === adjustment.sku);
      const response = await authenticatedFetch("/api/v1/inventory/adjust", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: adjustment.sku, warehouse_id: selected?.warehouse_id ?? 1, quantity_delta: Number(adjustment.quantity_delta), reason: adjustment.reason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể điều chỉnh tồn kho.");
      setNotice(`${result.message ?? "Điều chỉnh thành công"}. Tồn mới: ${result.new_quantity ?? "đã ghi nhận"}.`);
      const refreshed = await readResponse<InventoryItem[]>("/api/v1/inventory/items");
      setInventory(refreshed);
      setAdjustment((current) => ({ ...current, quantity_delta: "", reason: "" }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể kết nối máy chủ.");
    } finally { setIsAdjusting(false); }
  }

  async function refreshUsers() {
    const params = new URLSearchParams({ page: String(userPage), page_size: "20" });
    if (userSearch.trim()) params.set("search", userSearch.trim());
    if (userFilter !== "ALL") params.set("status", userFilter);
    if (userRoleFilter !== "ALL") params.set("role", userRoleFilter);
    try {
      const data = await readResponse<{ items: UserRow[]; total: number; total_pages: number }>(`/api/v1/admin/users?${params}`);
      setUsers(data.items);
      setUserTotal(data.total);
      setUserTotalPages(data.total_pages);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Không tải được tài khoản."); }
  }

  function openEditUser(user: UserRow) {
    setEditTarget(user);
    setEditForm({ full_name: user.full_name, email: user.email ?? "", phone: user.phone ?? "", status: user.status });
    setAssignmentLoadError("");
    setAssignmentLoading(true);
    readResponse<AssignmentForm>(`/api/v1/admin/users/${user.id}/assignments`)
      .then(setAssignmentForm)
      .catch((error: Error) => setAssignmentLoadError(error.message))
      .finally(() => setAssignmentLoading(false));
  }

  async function submitUserUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget) return;
    setUserActionBusy(true);
    setNotice("");
    try {
      const assignmentResponse = await authenticatedFetch(`/api/v1/admin/users/${editTarget.id}/assignments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assignmentForm),
      });
      const assignmentResult = await assignmentResponse.json().catch(() => ({}));
      if (!assignmentResponse.ok) throw new Error(typeof assignmentResult.detail === "string" ? assignmentResult.detail : "Không thể cập nhật vai trò hoặc phạm vi.");

      const response = await authenticatedFetch(`/api/v1/admin/users/${editTarget.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editForm.full_name.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.trim() || null,
          status: editForm.status,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể cập nhật tài khoản.");
      setNotice(`Đã cập nhật tài khoản, vai trò và phạm vi của ${editTarget.username}.`);
      setEditTarget(null);
      await refreshUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể kết nối máy chủ.");
    } finally { setUserActionBusy(false); }
  }

  async function submitLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lockTarget) return;
    setUserActionBusy(true);
    try {
      const response = await authenticatedFetch("/api/users/lock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: String(lockTarget.id), reason: lockReason.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể khóa tài khoản.");
      setNotice(result.warning || result.message || "Đã khóa tài khoản và thu hồi phiên.");
      setLockTarget(null); setLockReason("");
      await refreshUsers();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể kết nối máy chủ."); }
    finally { setUserActionBusy(false); }
  }

  async function unlockUser(user: UserRow) {
    if (!window.confirm(`Mở khóa tài khoản ${user.username}?`)) return;
    setUserActionBusy(true);
    try {
      const response = await authenticatedFetch(`/api/users/unlock/${encodeURIComponent(String(user.id))}`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Không thể mở khóa tài khoản.");
      setNotice(result.message || "Đã mở khóa tài khoản.");
      await refreshUsers();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không thể kết nối máy chủ."); }
    finally { setUserActionBusy(false); }
  }

  async function showAudit(user: UserRow) {
    try {
      const [audit, handover] = await Promise.all([
        readResponse<{ audit_logs: Array<Record<string, unknown>> }>(`/api/users/${user.id}/audit-logs`),
        readResponse<Record<string, unknown>>(`/api/users/${user.id}/handover-status`),
      ]);
      const rows = [...audit.audit_logs];
      if (handover.handover_required) rows.unshift({ action: "BÀN GIAO", reason: handover.warning, assigned_dealers_count: handover.assigned_dealers_count });
      setAuditModal({ title: `Nhật ký · ${user.username}`, rows });
    } catch (error) { setNotice(error instanceof Error ? error.message : "Không tải được nhật ký."); }
  }

  if (!role || !details) return <main className="workspace-invalid"><h1>Không xác định được vai trò</h1><p>Vui lòng đăng nhập lại để tải giao diện đúng với tài khoản.</p><button className="workspace-button" onClick={() => void logout()}>Đăng nhập</button></main>;

  if (role === "salesManager") {
    return <SalesManagerDashboard />;
  }

  const renderProducts = (addToCart = false) => (
    <>
      {loadError && <div className="workspace-alert is-error">{loadError}</div>}
      <div className="workspace-product-grid">
        {products.map((product) => (
          <article className="workspace-product-card" key={product.sku}>
            <div className="workspace-product-art"><span>{product.category?.slice(0, 1) ?? "S"}</span><small>{product.sku}</small></div>
            <div className="workspace-product-body"><span className="workspace-product-category">{product.category ?? "Sản phẩm"}</span><h3>{product.name}</h3><p className="workspace-product-unit">{product.unit ?? "Đơn vị tính: thùng"}</p>
              <div className="workspace-product-price">{formatMoney(product.sale_price)} <span>/ đơn vị</span></div>
              <div className="workspace-product-stock">Còn khả dụng <strong>{product.stock_available ?? inventory.find((item) => item.sku === product.sku)?.quantity_available ?? "—"}</strong></div>
              {addToCart && <button className="workspace-button is-secondary is-full" onClick={() => { setCartCount((count) => count + 1); setNotice(`${product.name} đã thêm vào giỏ hàng.`); }}>＋ Thêm vào giỏ</button>}
            </div>
          </article>
        ))}
        {loading && products.length === 0 && <div className="workspace-empty">Đang tải danh sách sản phẩm…</div>}
        {!loading && products.length === 0 && <div className="workspace-empty">Chưa có sản phẩm hoặc API không khả dụng.</div>}
      </div>
    </>
  );

  const renderInventoryTable = () => (
    <TableShell headers={["Sản phẩm", "SKU", "Kho", "Tồn khả dụng", "Tình trạng"]}>
      {inventory.map((item) => <tr key={`${item.sku}-${item.warehouse_id}`}><td><strong>{item.name}</strong></td><td>{item.sku}</td><td>{item.warehouse_name}</td><td><strong>{item.quantity_available}</strong></td><td><StatusPill tone={item.quantity_available < 30 ? "amber" : "green"}>{item.quantity_available < 30 ? "Sắp hết" : "Đủ hàng"}</StatusPill></td></tr>)}
      {inventory.length === 0 && <tr><td colSpan={5}>{loading ? "Đang tải tồn kho…" : "Không có dữ liệu kho."}</td></tr>}
    </TableShell>
  );

  function renderContent(): ReactNode {
    switch (role as RoleKey) {
      case "salesManager":
        return <SalesManagerDashboard />;

      case "customer":
        if (view === "products") return <><PageHeading title="Danh mục sản phẩm" subtitle="Giá bán và tồn khả dụng được tải từ API sản phẩm." />{renderProducts(true)}</>;
        if (view === "orders") return <><PageHeading title="Đơn hàng của tôi" subtitle="Theo dõi trạng thái xử lý và giao nhận." /><PrototypeBanner /><OrdersTable /></>;
        if (view === "debt") return <><PageHeading title="Công nợ & hóa đơn" subtitle="Tra cứu khoản phải trả và chứng từ của đại lý." /><PrototypeBanner /><Metrics items={[["Dư nợ hiện tại", "12,400,000 ₫", "◷", "amber"], ["Đến hạn tuần này", "1 hóa đơn", "!", "blue"], ["Đã thanh toán tháng này", "24,800,000 ₫", "✓", "green"]]} /><DebtTable /></>;
        if (view === "profile") return <><PageHeading title="Tài khoản đại lý" subtitle="Thông tin liên hệ và bảo mật tài khoản." /><ProfileCard username={username} roleName={details?.name ?? "Đại lý"} /></>;
        return <><WelcomeCard eyebrow="CỔNG ĐẠI LÝ" title={`Xin chào, ${username}`} text="Đặt hàng nhanh, theo dõi giao nhận và chủ động quản lý công nợ của cửa hàng." action={<button className="workspace-button" onClick={() => navigate("products")}>Khám phá sản phẩm <span>→</span></button>} /><Metrics items={[["Đơn đang xử lý", "03", "▤", "blue"], ["Công nợ hiện tại", "12,400,000 ₫", "◷", "amber"], ["Đơn đã giao tháng này", "18", "✓", "green"]]} /><div className="workspace-section-heading"><h3>Đơn hàng gần đây</h3><button className="workspace-link-button" onClick={() => navigate("orders")}>Xem tất cả →</button></div><OrdersTable compact /><PrototypeBanner text="Đơn hàng và công nợ đang dùng dữ liệu giao diện mẫu; API nghiệp vụ chưa được kết nối." /><div className="workspace-section-heading"><h3>Sản phẩm nổi bật</h3><button className="workspace-link-button" onClick={() => navigate("products")}>Xem danh mục →</button></div>{renderProducts(true)}</>;
      case "sales":
        if (view === "customers") return <CustomerManagement userRole="sales" />;
        if (view === "orders") return <OrderManagement userRole="sales" onNewOrderClick={() => navigate("new-order")} />;
        if (view === "new-order") return <CreateOrder products={products} onOrderCreated={() => navigate("orders")} onCancel={() => navigate("orders")} />;
        if (view === "collections") return <><PageHeading title="Thu tiền theo tuyến" subtitle="Theo dõi khoản cần thu và ghi nhận giao dịch tại điểm bán." /><PrototypeBanner /><Metrics items={[["Cần thu hôm nay", "21,000,000 ₫", "₫", "amber"], ["Đã thu", "8,400,000 ₫", "✓", "green"], ["Đại lý quá hạn", "02", "!", "red"]]} /><DebtTable /></>;
        if (view === "new-order") return <SalesOrderDraft products={products} onSaved={(message) => setNotice(message)} notice={notice} />;
        if (view === "products") return <><PageHeading title="Sản phẩm & tồn khả dụng" subtitle="Giá bán và số lượng khả dụng tại các kho." />{renderProducts()}</>;
        return <><WelcomeCard eyebrow="TUYẾN HÀ NỘI · THỨ HAI, 15/06" title={`Chào ${username}, bắt đầu ngày mới`} text="Tập trung đơn cần xử lý và các đại lý cần chăm sóc trong tuyến." action={<button className="workspace-button" onClick={() => navigate("new-order")}>＋ Tạo đơn hàng</button>} /><Metrics items={[["Đại lý được giao", "42", "♧", "blue"], ["Đơn cần theo dõi", "08", "▤", "violet"], ["Công nợ cần thu", "21,000,000 ₫", "₫", "amber"]]} /><div className="workspace-two-columns"><section className="workspace-panel"><PanelHeading title="Đại lý cần chăm sóc" link="Xem tuyến" onClick={() => navigate("customers")} /><CustomersTable compact /></section><section className="workspace-panel"><PanelHeading title="Đơn hàng gần đây" link="Tất cả đơn" onClick={() => navigate("orders")} /><OrdersTable compact /></section></div><PrototypeBanner text="Khách hàng, đơn hàng và công nợ của tuyến hiện là dữ liệu giao diện mẫu; API tác nghiệp chưa kết nối." /></>;

      case "warehouse":
        if (view === "inventory") return <><PageHeading title="Tồn kho được phân công" subtitle="Số lượng khả dụng không bao gồm thông tin giá vốn." />{renderInventoryTable()}</>;
        if (view === "receiving") return <><PageHeading title="Tiếp nhận hàng hóa" subtitle="Ghi nhận số lượng thực nhập, lô hàng và tình trạng sản phẩm." /><PrototypeBanner /><ReceivingForm /></>;
        if (view === "count") return <><PageHeading title="Kiểm kê kho" subtitle="Ghi nhận kết quả đếm thực tế để quản lý kho đối soát." /><PrototypeBanner /><StocktakeTable /></>;
        return <><WelcomeCard eyebrow="KHO HÀ NỘI · CA SÁNG" title="Danh sách phiếu soạn hàng" text="Ưu tiên đơn đã duyệt và kiểm tra đúng lô, hạn sử dụng trước khi đóng gói." action={<StatusPill tone="green">Ca đang hoạt động</StatusPill>} /><Metrics items={[["Chờ soạn", "12", "▤", "blue"], ["Đang xử lý", "04", "◷", "amber"], ["Đã hoàn tất", "18", "✓", "green"]]} /><PrototypeBanner /><PickingTable /></>;

      case "warehouseManager":
        if (view === "inventory") return <><PageHeading title="Tổng hợp tồn kho" subtitle="Tồn khả dụng theo mặt hàng và kho." />{renderInventoryTable()}</>;
        if (view === "adjustments") return <><PageHeading title="Điều chỉnh tồn kho" subtitle="Ghi lý do và gửi yêu cầu điều chỉnh được lưu qua API kho." /><div className="workspace-two-columns workspace-adjust-grid"><section className="workspace-panel"><form className="workspace-form" onSubmit={submitInventoryAdjustment}><label>Sản phẩm<select value={adjustment.sku} onChange={(event) => setAdjustment({ ...adjustment, sku: event.target.value })}>{inventory.map((item) => <option value={item.sku} key={item.sku}>{item.sku} · {item.name}</option>)}</select></label><label>Số lượng thay đổi<input type="number" value={adjustment.quantity_delta} onChange={(event) => setAdjustment({ ...adjustment, quantity_delta: event.target.value })} placeholder="Âm nếu giảm, dương nếu tăng" required /></label><label>Lý do điều chỉnh<textarea minLength={3} value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} placeholder="Ví dụ: Hàng hỏng được xác nhận sau kiểm kê" required /></label><button className="workspace-button" disabled={isAdjusting}>{isAdjusting ? "Đang ghi nhận…" : "Ghi nhận điều chỉnh"}</button>{notice && <div className="workspace-alert">{notice}</div>}</form></section><section className="workspace-panel"><PanelHeading title="Tồn hiện tại" /><div className="workspace-mini-list">{inventory.map((item) => <div key={item.sku}><span><strong>{item.name}</strong><small>{item.sku} · {item.warehouse_name}</small></span><b>{item.quantity_available}</b></div>)}</div><p className="workspace-data-source">API kho hiện lưu dữ liệu demo trong bộ nhớ của server.</p></section></div></>;
        if (view === "transfers") return <><PageHeading title="Điều chuyển giữa các kho" subtitle="Tạo phiếu luân chuyển và theo dõi xác nhận hai đầu kho." /><PrototypeBanner /><TransferTable /></>;
        if (view === "stocktakes") return <><PageHeading title="Kế hoạch kiểm kê" subtitle="Chốt số đếm, xem chênh lệch và lập yêu cầu xử lý." /><PrototypeBanner /><StocktakeTable /></>;
        return <><WelcomeCard eyebrow="2 KHO ĐANG KẾT NỐI" title="Kiểm soát kho vận" text="Theo dõi mức tồn, mặt hàng cần chú ý và các tác vụ chờ phê duyệt." action={<button className="workspace-button is-secondary" onClick={() => navigate("adjustments")}>＋ Điều chỉnh tồn</button>} /><Metrics items={[["Mã hàng đang theo dõi", String(inventory.length || 24), "▦", "blue"], ["Sắp chạm tồn tối thiểu", "03", "!", "amber"], ["Phiếu chờ duyệt", "05", "◷", "violet"]]} /><section className="workspace-panel"><PanelHeading title="Tồn kho gần đây" link="Mở sổ tồn" onClick={() => navigate("inventory")} />{renderInventoryTable()}</section><div className="workspace-two-columns"><section className="workspace-panel"><PanelHeading title="Cần quyết định" link="Xem điều chỉnh" onClick={() => navigate("adjustments")} /><ApprovalTable compact /></section><section className="workspace-panel"><PanelHeading title="Cảnh báo hạn dùng" /><ExpiryList /></section></div><p className="workspace-data-source">Danh sách tồn lấy từ API demo; cảnh báo và yêu cầu duyệt là dữ liệu giao diện mẫu.</p></>;
      case "accountant":
        if (view === "customers") return <CustomerManagement userRole="accountant" />;
        if (view === "orders") return <OrderManagement userRole="accountant" onNewOrderClick={() => navigate("new-order")} />;
        if (view === "debts") return <><PageHeading title="Sổ công nợ" subtitle="Theo dõi dư nợ, hạn thanh toán và tuổi nợ theo đại lý." /><PrototypeBanner /><Metrics items={[["Tổng phải thu", "286,400,000 ₫", "₫", "blue"], ["Quá hạn", "42,800,000 ₫", "!", "red"], ["Đến hạn 7 ngày", "68,200,000 ₫", "◷", "amber"]]} /><DebtTable /></>;
        if (view === "invoices") return <><PageHeading title="Hóa đơn" subtitle="Tra cứu chứng từ, phát hành và theo dõi trạng thái thanh toán." /><PrototypeBanner /><InvoiceTable /></>;
        if (view === "payments") return <><PageHeading title="Ghi nhận thanh toán" subtitle="Đối chiếu khoản thu với hóa đơn và tài khoản đại lý." /><PrototypeBanner /><PaymentForm /></>;
        if (view === "reconciliation") return <><PageHeading title="Đối soát công nợ" subtitle="So sánh số liệu theo kỳ trước khi chốt sổ." /><PrototypeBanner /><ReconciliationPanel /></>;
        return <><WelcomeCard eyebrow="KỲ KẾ TOÁN · THÁNG 06/2026" title="Tổng quan công nợ & giao dịch" text="Nắm các khoản phải thu, hóa đơn đến hạn, trạng thái khóa đại lý và giao dịch cần đối soát." action={<button className="workspace-button" onClick={() => navigate("customers")}>🔒 Quản lý đại lý & Khóa GD</button>} /><Metrics items={[["Tổng phải thu", "286,400,000 ₫", "₫", "blue"], ["Quá hạn", "42,800,000 ₫", "!", "red"], ["Đã thu tháng này", "194,200,000 ₫", "✓", "green"]]} /><div className="workspace-two-columns"><section className="workspace-panel"><PanelHeading title="Khoản cần theo dõi" link="Mở sổ công nợ" onClick={() => navigate("debts")} /><DebtTable compact /></section><section className="workspace-panel"><PanelHeading title="Hóa đơn gần đến hạn" link="Tất cả hóa đơn" onClick={() => navigate("invoices")} /><InvoiceTable compact /></section></div><PrototypeBanner text="Hóa đơn, thanh toán và công nợ đang là giao diện mẫu; Quản lý đại lý & Đơn hàng đã kết nối API thực tế." /></>;


      case "admin":
        if (view === "users") return <AdminUsers users={users} loading={loading} error={loadError} search={userSearch} setSearch={(value) => { setUserSearch(value); setUserPage(1); }} filter={userFilter} setFilter={(value) => { setUserFilter(value); setUserPage(1); }} roleFilter={userRoleFilter} setRoleFilter={(value) => { setUserRoleFilter(value); setUserPage(1); }} page={userPage} total={userTotal} totalPages={userTotalPages} setPage={setUserPage} onCreate={() => { window.location.assign("/admin/users/create"); }} onEdit={openEditUser} onLock={(user) => { setLockTarget(user); setLockReason(""); }} onUnlock={unlockUser} onAudit={showAudit} busy={userActionBusy} />;
        if (view === "audit") return <><PageHeading title="Nhật ký & bảo mật" subtitle="Theo dõi thao tác quản trị, khóa tài khoản và phiên đăng nhập." /><PrototypeBanner text="Các sự kiện ở màn hình này là ví dụ giao diện; nhật ký chi tiết theo user mới được đọc từ API." /><div className="workspace-two-columns"><section className="workspace-panel"><PanelHeading title="Sự kiện bảo mật" /><AuditSummary /></section><section className="workspace-panel"><PanelHeading title="Tài khoản cần chú ý" /><div className="workspace-attention"><span className="workspace-attention-icon">!</span><div><strong>Kiểm tra định kỳ tài khoản khóa</strong><p>Mở mục tài khoản để xem nhật ký và trạng thái bàn giao của user.</p><button className="workspace-link-button" onClick={() => navigate("users")}>Đi tới tài khoản →</button></div></div></section></div></>;
        if (view === "configuration") return <><PageHeading title="Danh mục hệ thống" subtitle="Vai trò chuẩn, địa bàn và kho được cấp cho user." /><PrototypeBanner text="Ma trận vai trò đang cấu hình tĩnh phía backend; màn hình chỉnh sửa danh mục chưa có API." /><ConfigurationCards /></>;
        if (view === "rbac") return <><PageHeading title="Ma trận phân quyền (RBAC)" subtitle="Tổng quan vai trò nghiệp vụ và các khu vực truy cập được cấu hình." /><PrototypeBanner text="Quyền truy cập được máy chủ xác thực. Màn hình này hiển thị danh mục vai trò; thay đổi quyền được quản lý theo chính sách hệ thống." /><RoleSummary /></>;
        return <><WelcomeCard eyebrow="QUẢN TRỊ HỆ THỐNG" title={`Xin chào, ${username} 👋`} text="Trung tâm quản lý tài khoản, vai trò và bảo mật hệ thống." action={<button className="workspace-button" onClick={() => window.location.assign("/admin/users/create")}>＋ Tạo tài khoản mới</button>} /><Metrics items={[["Tổng người dùng", String(userTotal), "♧", "blue"], ["Đang hoạt động", String(users.filter(isUserActive).length), "◷", "green"], ["Khóa / chờ kích hoạt", String(users.filter((user) => !isUserActive(user) || user.status === "PENDING_ACTIVATION").length), "♢", "amber"], ["Vai trò nghiệp vụ", "7", "⌘", "violet"]]} /><div className="workspace-admin-overview-grid"><section className="workspace-panel"><PanelHeading title="Tài khoản gần đây" link="Quản lý tài khoản" onClick={() => navigate("users")} />{users.length ? <AdminUserTable users={users.slice(0, 5)} onEdit={openEditUser} onLock={(user) => { setLockTarget(user); setLockReason(""); }} onUnlock={unlockUser} onAudit={showAudit} busy={userActionBusy} recentMode /> : <PrototypeBanner text={loadError || "Đang tải tài khoản từ API quản trị."} />}<button className="workspace-link-button workspace-admin-detail-link" onClick={() => navigate("users")}>Mở danh sách tài khoản →</button></section><div className="workspace-admin-overview-stack"><section className="workspace-panel"><PanelHeading title="Nhật ký thao tác gần nhất" link="Xem tất cả" onClick={() => navigate("audit")} /><AuditSummary compact /></section><section className="workspace-panel"><PanelHeading title="Vai trò & phạm vi" link="Ma trận RBAC" onClick={() => navigate("rbac")} /><RoleSummary /></section></div></div></>;

      default:
        return (
          <div className="workspace-empty">
            <h3>Giao diện vai trò đang phát triển</h3>
            <p>Vui lòng liên hệ quản trị viên để được cấp quyền hoặc kiểm tra lại tài khoản.</p>
          </div>
        );
    }
  }

  return (
    <div className={`role-workspace${role === "admin" ? " is-admin admin-tailwind-shell" : ""}`}>
      {role === "admin" ? (
        <SidebarTailwind
          currentPath={`/admin/users?view=${view}`}
          menuItems={adminMenuItems}
          pendingApprovalCount={0}
          onNavigate={(path) => {
            const nextView = new URL(path, window.location.origin).searchParams.get("view");
            if (nextView) navigate(nextView);
          }}
          onLogout={() => void logout()}
        />
      ) : <aside className="workspace-sidebar">
        <a className="workspace-brand" href={details.views[0]?.id ? `${window.location.pathname}` : "/"}><span className="workspace-brand-mark">O</span><span>OMS <small>OPERATIONS</small></span></a>
        <div className="workspace-sidebar-role"><span className="workspace-avatar is-sidebar">{details.initials}</span><span><small>ĐANG ĐĂNG NHẬP</small><strong>{details.name}</strong></span><span className="workspace-chevron">⌄</span></div>
        <nav className="workspace-nav" aria-label="Điều hướng nghiệp vụ">
          {details.views.map((item, index) => <div key={item.id}>{item.section && <div className={`workspace-nav-section ${index ? "has-gap" : ""}`}>{item.section}</div>}<button className={`workspace-nav-item ${view === item.id ? "is-active" : ""}`} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined}><span className="workspace-nav-icon">{item.icon}</span><span>{item.label}</span>{item.id === "new-order" && <span className="workspace-nav-plus">+</span>}</button></div>)}
        </nav>
        <div className="workspace-sidebar-bottom"><div className="workspace-help"><span className="workspace-help-icon">?</span><div><strong>Cần hỗ trợ?</strong><small>Liên hệ quản trị viên</small></div><span>›</span></div><button className="workspace-logout" onClick={() => void logout()}><span>↪</span> Đăng xuất</button></div>
      </aside>}

      <div className="workspace-main-column">
        {role === "admin" ? (
          <HeaderTailwind fullName={username} roleName={details.name} notificationCount={0} onProfileClick={() => setProfileOpen(true)} onLogout={() => void logout()} />
        ) : <header className="workspace-topbar"><div className="workspace-breadcrumb"><span>OMS</span><span>/</span><strong>{heading}</strong></div><div className="workspace-top-actions"><div className="workspace-quick-actions"><button type="button" onClick={() => goBack(role)}>← <span>Quay lại</span></button></div><span className="workspace-env"><i /> Hệ thống hoạt động</span><button className="workspace-icon-button" aria-label="Thông báo">♧<i /></button><span className="workspace-top-divider" /><div className="workspace-user-chip"><ProfileAvatar initials={details.initials} className="workspace-avatar" editable={false} /><button type="button" className="workspace-user-profile" aria-label="Mở hồ sơ cá nhân" onClick={() => setProfileOpen(true)}><strong>{username}</strong><small>{details.name}</small></button><span className="workspace-chevron">⌄</span></div></div></header>}
        <main className={`workspace-content${role === "admin" ? " admin-tailwind-content" : ""}`}>
          {notice && <div className="workspace-alert" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Đóng thông báo">×</button></div>}
          {renderContent()}
          <footer className="workspace-footer"><span>© 2026 OMS · Hệ thống bán hàng & kho</span><span>Vai trò: {details.name} <i /> Quyền được xác thực tại máy chủ</span></footer>
        </main>
      </div>

      {lockTarget && <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLockTarget(null); }}><section className="workspace-modal" role="dialog" aria-modal="true" aria-labelledby="lock-title"><button className="workspace-modal-close" onClick={() => setLockTarget(null)} aria-label="Đóng">×</button><span className="workspace-modal-icon">!</span><h2 id="lock-title">Khóa tài khoản</h2><p>Phiên đăng nhập của <strong>{lockTarget.username}</strong> sẽ bị thu hồi ngay sau khi khóa.</p><form onSubmit={submitLock}><label htmlFor="lock-reason">Lý do khóa <span>*</span></label><textarea id="lock-reason" value={lockReason} minLength={3} onChange={(event) => setLockReason(event.target.value)} placeholder="Ví dụ: Nhân sự đã nghỉ việc" required /><div className="workspace-modal-actions"><button type="button" className="workspace-button is-ghost" onClick={() => setLockTarget(null)}>Hủy</button><button type="submit" className="workspace-button is-danger" disabled={userActionBusy}>{userActionBusy ? "Đang xử lý…" : "Xác nhận khóa"}</button></div></form></section></div>}
      {editTarget && <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !userActionBusy) setEditTarget(null); }}><section className="workspace-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="edit-user-title"><button className="workspace-modal-close" onClick={() => setEditTarget(null)} aria-label="Đóng" disabled={userActionBusy}>×</button><h2 id="edit-user-title">Cập nhật tài khoản</h2><p>Chỉnh sửa thông tin, nhiều vai trò và phạm vi kho/địa bàn của <strong>{editTarget.username}</strong>.</p><form className="workspace-edit-user-form" onSubmit={submitUserUpdate}><label>Họ và tên<input value={editForm.full_name} maxLength={150} onChange={(event) => setEditForm({ ...editForm, full_name: event.target.value })} required /></label><label>Email<input type="email" value={editForm.email} maxLength={254} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required /></label><label>Số điện thoại<input type="tel" value={editForm.phone} maxLength={10} pattern="0[0-9]{9}" onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label><fieldset className={`workspace-assignment-group${openAssignmentGroup === "roles" ? " is-open" : ""}`} disabled={assignmentLoading || userActionBusy}><legend><button className="workspace-assignment-trigger" type="button" aria-expanded={openAssignmentGroup === "roles"} aria-controls="edit-roles-options" onClick={() => setOpenAssignmentGroup((current) => current === "roles" ? null : "roles")}>Vai trò (có thể chọn nhiều)</button></legend><div className="workspace-assignment-summary">{assignmentOptions.roles.filter((option) => assignmentForm.role_ids.includes(option.id)).map((option) => option.name).join(", ") || "Chưa chọn"}</div><div className={`workspace-assignment-options${openAssignmentGroup === "roles" ? " is-open" : ""}`} id="edit-roles-options">{assignmentOptions.roles.map((option) => <label className="workspace-check-option" key={option.id}><input type="checkbox" checked={assignmentForm.role_ids.includes(option.id)} onChange={(event) => setAssignmentForm((current) => ({ ...current, role_ids: event.target.checked ? [...current.role_ids, option.id] : current.role_ids.filter((id) => id !== option.id) }))} /><span>{option.name}</span></label>)}</div></fieldset><label>Trạng thái<select value={editForm.status} disabled={userActionBusy} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}><option value="ACTIVE">Đang hoạt động</option><option value="PENDING_ACTIVATION">Chờ kích hoạt</option><option value="LOCKED">Đã khóa</option><option value="DISABLED">Đã vô hiệu hóa</option></select></label><fieldset className={`workspace-assignment-group${openAssignmentGroup === "warehouses" ? " is-open" : ""}`} disabled={assignmentLoading || userActionBusy}><legend><button className="workspace-assignment-trigger" type="button" aria-expanded={openAssignmentGroup === "warehouses"} aria-controls="edit-warehouses-options" onClick={() => setOpenAssignmentGroup((current) => current === "warehouses" ? null : "warehouses")}>Kho được phụ trách</button></legend><div className="workspace-assignment-summary">{assignmentOptions.warehouses.filter((option) => assignmentForm.warehouse_ids.includes(option.id)).map((option) => option.name).join(", ") || "Chưa chọn"}</div><div className={`workspace-assignment-options${openAssignmentGroup === "warehouses" ? " is-open" : ""}`} id="edit-warehouses-options">{assignmentOptions.warehouses.length ? assignmentOptions.warehouses.map((option) => <label className="workspace-check-option" key={option.id}><input type="checkbox" checked={assignmentForm.warehouse_ids.includes(option.id)} onChange={(event) => setAssignmentForm((current) => ({ ...current, warehouse_ids: event.target.checked ? [...current.warehouse_ids, option.id] : current.warehouse_ids.filter((id) => id !== option.id) }))} /><span>{option.name}</span></label>) : <small>Chưa có kho hoạt động.</small>}</div></fieldset><fieldset className={`workspace-assignment-group${openAssignmentGroup === "territories" ? " is-open" : ""}`} disabled={assignmentLoading || userActionBusy}><legend><button className="workspace-assignment-trigger" type="button" aria-expanded={openAssignmentGroup === "territories"} aria-controls="edit-territories-options" onClick={() => setOpenAssignmentGroup((current) => current === "territories" ? null : "territories")}>Địa bàn phụ trách</button></legend><div className="workspace-assignment-summary">{assignmentOptions.territories.filter((option) => assignmentForm.territory_ids.includes(option.id)).map((option) => option.name).join(", ") || "Chưa chọn"}</div><div className={`workspace-assignment-options${openAssignmentGroup === "territories" ? " is-open" : ""}`} id="edit-territories-options">{assignmentOptions.territories.length ? assignmentOptions.territories.map((option) => <label className="workspace-check-option" key={option.id}><input type="checkbox" checked={assignmentForm.territory_ids.includes(option.id)} onChange={(event) => setAssignmentForm((current) => ({ ...current, territory_ids: event.target.checked ? [...current.territory_ids, option.id] : current.territory_ids.filter((id) => id !== option.id) }))} /><span>{option.name}</span></label>) : <small>Chưa có địa bàn.</small>}</div></fieldset>{assignmentLoading && <p role="status">Đang tải phân công hiện tại…</p>}{assignmentLoadError && <p className="workspace-alert is-error" role="alert">{assignmentLoadError}</p>}<div className="workspace-modal-actions"><button type="button" className="workspace-button is-ghost" onClick={() => setEditTarget(null)} disabled={userActionBusy}>Hủy</button><button type="submit" className="workspace-button" disabled={userActionBusy || assignmentLoading || Boolean(assignmentLoadError) || !assignmentOptions.roles.length}>{userActionBusy ? "Đang lưu…" : "Lưu thay đổi"}</button></div></form></section></div>}
      {auditModal && <div className="workspace-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuditModal(null); }}><section className="workspace-modal is-wide" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title"><button className="workspace-modal-close" onClick={() => setAuditModal(null)} aria-label="Đóng">×</button><h2 id="audit-modal-title">{auditModal.title}</h2>{auditModal.rows.length ? <div className="workspace-audit-list">{auditModal.rows.map((row, index) => <div key={index}><StatusPill tone="blue">{String(row.action ?? "SỰ KIỆN")}</StatusPill><p>{String(row.reason ?? "Không có ghi chú")}</p><small>{String(row.created_at ?? "")}</small></div>)}</div> : <div className="workspace-empty">Chưa có nhật ký cho tài khoản này.</div>}</section></div>}
      {profileOpen && <Profile embedded onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

function Metrics({ items }: { items: Array<[string, string, string, string]> }) {
  return <div className="workspace-metrics">{items.map(([label, value, icon, accent]) => <MetricCard key={label} label={label} value={value} icon={icon} accent={accent} />)}</div>;
}

function WelcomeCard({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action: ReactNode }) {
  return <section className="workspace-welcome"><div className="workspace-welcome-copy"><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div><div className="workspace-welcome-action">{action}</div><div className="workspace-welcome-decoration" aria-hidden="true">✳</div></section>;
}

function PanelHeading({ title, link, onClick }: { title: string; link?: string; onClick?: () => void }) {
  return <div className="workspace-panel-heading"><h3>{title}</h3>{link && <button className="workspace-link-button" onClick={onClick}>{link} →</button>}</div>;
}

function OrdersTable({ compact = false }: { compact?: boolean }) {
  return <TableShell headers={["Mã đơn", "Đại lý", "Tổng tiền", "Trạng thái", ...(!compact ? ["Cập nhật"] : [])]}>{demoOrders.slice(0, compact ? 2 : undefined).map((order) => <tr key={order.id}><td><strong className="workspace-link-text">{order.id}</strong></td><td>{order.customer}</td><td>{formatMoney(order.total)}</td><td><StatusPill tone={order.tone}>{order.status}</StatusPill></td>{!compact && <td>15/06/2026</td>}</tr>)}</TableShell>;
}

function CustomersTable({ compact = false }: { compact?: boolean }) {
  return <TableShell headers={["Đại lý", "Địa bàn", "Công nợ", ...(!compact ? ["Hạn thanh toán"] : [])]}>{demoCustomers.slice(0, compact ? 2 : undefined).map((customer) => <tr key={customer.code}><td><strong>{customer.name}</strong><small className="workspace-cell-subtitle">{customer.code}</small></td><td>{customer.area}</td><td>{formatMoney(customer.debt)}</td>{!compact && <td><StatusPill tone={customer.due === "Hôm nay" ? "amber" : "green"}>{customer.due}</StatusPill></td>}</tr>)}</TableShell>;
}

function DebtTable({ compact = false }: { compact?: boolean }) {
  return <TableShell headers={["Đại lý", "Số hóa đơn", "Dư nợ", "Hạn thanh toán", ...(!compact ? ["Tình trạng"] : [])]}>{demoCustomers.map((customer, index) => <tr key={customer.code}><td><strong>{customer.name}</strong><small className="workspace-cell-subtitle">{customer.code}</small></td><td>HD-2026-{String(138 + index).padStart(3, "0")}</td><td>{formatMoney(customer.debt || 3200000)}</td><td>{customer.due}</td>{!compact && <td><StatusPill tone={index === 0 ? "amber" : "green"}>{index === 0 ? "Đến hạn" : "Trong hạn"}</StatusPill></td>}</tr>)}</TableShell>;
}

function InvoiceTable({ compact = false }: { compact?: boolean }) {
  return <TableShell headers={["Số hóa đơn", "Đại lý", "Ngày phát hành", "Giá trị", ...(!compact ? ["Trạng thái"] : [])]}>{demoCustomers.slice(0, compact ? 2 : undefined).map((customer, index) => <tr key={customer.code}><td><strong>HD-2026-{String(138 + index).padStart(3, "0")}</strong></td><td>{customer.name}</td><td>12/06/2026</td><td>{formatMoney(customer.debt || 3200000)}</td>{!compact && <td><StatusPill tone={index ? "green" : "amber"}>{index ? "Đã thanh toán một phần" : "Chưa thanh toán"}</StatusPill></td>}</tr>)}</TableShell>;
}

function ApprovalTable({ compact = false }: { compact?: boolean }) {
  return <TableShell headers={["Mã đơn", "Đại lý", "Nhân viên", "Giá trị", "Lý do", ...(!compact ? ["Thao tác"] : [])]}>{demoOrders.slice(0, compact ? 2 : undefined).map((order, index) => <tr key={order.id}><td><strong>{order.id}</strong></td><td>{order.customer}</td><td>{["Nguyễn Minh Anh", "Lê Quốc Bảo", "Trần Thu Hà"][index]}</td><td>{formatMoney(order.total)}</td><td>{index === 0 ? "Vượt hạn mức công nợ" : "Dưới giá sàn"}</td>{!compact && <td><button className="workspace-link-button" onClick={() => window.alert("Bản xem trước: API duyệt đơn chưa được kết nối.")}>Xem xét</button></td>}</tr>)}</TableShell>;
}


function PickingTable() {
  const [checked, setChecked] = useState<string[]>([]);
  const picks = [{ id: "SO-0158", customer: "Tạp hóa Minh Anh", lines: 4, deadline: "09:30", tone: "amber" }, { id: "SO-0156", customer: "Đại lý Hoàng Long", lines: 7, deadline: "10:00", tone: "blue" }, { id: "SO-0154", customer: "Cửa hàng Hồng Phúc", lines: 3, deadline: "10:30", tone: "blue" }];
  return <div className="workspace-picking-list">{picks.map((pick) => <article key={pick.id} className={`workspace-picking-card ${checked.includes(pick.id) ? "is-done" : ""}`}><div className="workspace-picking-time">{pick.deadline}<small>HẠN SOẠN</small></div><div className="workspace-picking-info"><StatusPill tone={pick.tone}>{pick.id}</StatusPill><h3>{pick.customer}</h3><p>{pick.lines} dòng hàng · Lấy theo lô gần hết hạn trước</p></div><label className="workspace-picking-check"><input type="checkbox" checked={checked.includes(pick.id)} onChange={(event) => setChecked((items) => event.target.checked ? [...items, pick.id] : items.filter((id) => id !== pick.id))} /><span>{checked.includes(pick.id) ? "Đã soạn" : "Xác nhận soạn"}</span></label></article>)}</div>;
}

function StocktakeTable() {
  return <TableShell headers={["Mã kiểm kê", "Kho", "Phạm vi", "Hạn hoàn tất", "Trạng thái"]}>{[["KK-026", "Kho Hà Nội", "Khu A · 18 SKU", "Hôm nay, 16:00", "Đang kiểm kê"], ["KK-024", "Kho TP.HCM", "Toàn kho · 124 SKU", "16/06/2026", "Chờ phân công"]].map(([id, warehouse, scope, deadline, status]) => <tr key={id}><td><strong>{id}</strong></td><td>{warehouse}</td><td>{scope}</td><td>{deadline}</td><td><StatusPill tone={status === "Đang kiểm kê" ? "blue" : "amber"}>{status}</StatusPill></td></tr>)}</TableShell>;
}

function ReceivingForm() {
  return <section className="workspace-panel workspace-form"><label>Số phiếu nhập<input placeholder="PN-2026-…" /></label><label>Nhà cung cấp<input placeholder="Tìm nhà cung cấp" /></label><label>SKU / mã hàng<input placeholder="Quét hoặc nhập SKU" /></label><label>Số lượng thực nhận<input type="number" min="1" placeholder="0" /></label><label>Ghi chú tình trạng<textarea placeholder="Bao bì nguyên vẹn, đủ số lượng…" /></label><button className="workspace-button" onClick={() => window.alert("Bản xem trước: API nhập kho chưa được kết nối.")}>Lưu phiếu nhập mẫu</button></section>;
}

function TransferTable() {
  return <TableShell headers={["Mã phiếu", "Từ kho", "Đến kho", "Số mặt hàng", "Trạng thái"]}>{[["CK-0081", "Kho Hà Nội", "Kho TP.HCM", "06", "Chờ duyệt"], ["CK-0079", "Kho TP.HCM", "Kho Hà Nội", "03", "Đang vận chuyển"]].map(([id, from, to, count, status]) => <tr key={id}><td><strong>{id}</strong></td><td>{from}</td><td>{to}</td><td>{count}</td><td><StatusPill tone="amber">{status}</StatusPill></td></tr>)}</TableShell>;
}

function ExpiryList() {
  return <div className="workspace-expiry-list">{[["Sữa tươi tiệt trùng 1L", "12 ngày", "amber"], ["Nước ép cam 1L", "21 ngày", "blue"], ["Bánh quy bơ 300g", "28 ngày", "blue"]].map(([name, expiry, tone]) => <div key={name}><span className={`workspace-expiry-dot is-${tone}`} /><span><strong>{name}</strong><small>Lô nhập gần nhất</small></span><StatusPill tone={tone}>{expiry}</StatusPill></div>)}</div>;
}

function SalesOrderDraft({ products, onSaved, notice }: { products: Product[]; onSaved: (message: string) => void; notice: string }) {
  const [customer, setCustomer] = useState(demoCustomers[0].code);
  const [sku, setSku] = useState(products[0]?.sku ?? "SKU-001");
  const [quantity, setQuantity] = useState(1);
  const selected = products.find((product) => product.sku === sku);
  return <><PageHeading title="Tạo đơn hàng" subtitle="Lập đơn tại điểm bán, kiểm tra hàng khả dụng và chính sách giá." /><PrototypeBanner text="Có thể lập đơn nháp để xem trước; API tạo đơn chưa được kết nối nên dữ liệu chưa lưu." /><section className="workspace-panel workspace-order-form"><label>Đại lý<select value={customer} onChange={(event) => setCustomer(event.target.value)}>{demoCustomers.map((item) => <option key={item.code} value={item.code}>{item.name} · {item.area}</option>)}</select></label><label>Sản phẩm<select value={sku} onChange={(event) => setSku(event.target.value)}>{products.map((item) => <option key={item.sku} value={item.sku}>{item.name} · {formatMoney(item.sale_price)}</option>)}</select></label><label>Số lượng<input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label><div className="workspace-order-total"><span>Tạm tính</span><strong>{formatMoney((selected?.sale_price ?? 0) * quantity)}</strong></div><button className="workspace-button" onClick={() => onSaved("Đơn nháp chỉ tồn tại trong giao diện mẫu, chưa được lưu vào hệ thống.")}>Lưu đơn nháp mẫu</button>{notice && <div className="workspace-alert">{notice}</div>}</section></>;
}

function PaymentForm() {
  return <section className="workspace-panel workspace-form"><label>Đại lý<select>{demoCustomers.map((item) => <option key={item.code}>{item.name}</option>)}</select></label><label>Mã hóa đơn<input placeholder="HD-2026-…" /></label><label>Số tiền nhận<input type="number" min="0" placeholder="0" /></label><label>Phương thức<select><option>Chuyển khoản</option><option>Tiền mặt</option></select></label><label>Mã tham chiếu<textarea placeholder="Số giao dịch / ghi chú đối soát" /></label><button className="workspace-button" onClick={() => window.alert("Bản xem trước: API ghi nhận thanh toán chưa được kết nối.")}>Ghi nhận mẫu</button></section>;
}

function ReconciliationPanel() {
  return <div className="workspace-reconciliation"><div><span>Hệ thống OMS</span><strong>194,200,000 ₫</strong><small>Tổng đã ghi nhận</small></div><span className="workspace-reconciliation-sign">⇄</span><div><span>Sao kê ngân hàng</span><strong>191,200,000 ₫</strong><small>Đã nhập mẫu</small></div><div className="workspace-reconciliation-difference"><span>Chênh lệch cần xác minh</span><strong>3,000,000 ₫</strong></div><button className="workspace-button is-secondary" onClick={() => window.alert("Bản xem trước: API đối soát chưa được kết nối.")}>Mở danh sách giao dịch</button></div>;
}

function ProfileCard({ username, roleName }: { username: string; roleName: string }) {
  const initials = username.slice(0, 2).toUpperCase();
  return <section className="workspace-panel workspace-profile"><ProfileAvatar initials={initials} className="workspace-avatar is-large" editable={false} /><div><h3>{username}</h3><p>{roleName} · Tài khoản đang hoạt động</p><button className="workspace-button is-secondary" onClick={() => window.location.assign("/change-password")}>Đổi mật khẩu</button></div></section>;
}

function AdminUsers({ users, loading, error, search, setSearch, filter, setFilter, roleFilter, setRoleFilter, page, total, totalPages, setPage, onCreate, onEdit, onLock, onUnlock, onAudit, busy }: { users: UserRow[]; loading: boolean; error: string; search: string; setSearch: (value: string) => void; filter: string; setFilter: (value: string) => void; roleFilter: string; setRoleFilter: (value: string) => void; page: number; total: number; totalPages: number; setPage: (value: number) => void; onCreate: () => void; onEdit: (user: UserRow) => void; onLock: (user: UserRow) => void; onUnlock: (user: UserRow) => void; onAudit: (user: UserRow) => void; busy: boolean }) {
  return <><PageHeading title="Tài khoản người dùng" subtitle="Tìm kiếm, cập nhật thông tin, vai trò và trạng thái tài khoản." action={<button className="workspace-button" onClick={onCreate}>＋ Tạo tài khoản</button>} /><div className="workspace-admin-tools"><label className="workspace-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên, tài khoản, số điện thoại…" /></label><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Lọc theo vai trò"><option value="ALL">Mọi vai trò</option><option value="CUSTOMER">Đại lý</option><option value="SALES_REP">Nhân viên kinh doanh</option><option value="SALES_MANAGER">Quản lý kinh doanh</option><option value="WAREHOUSE">Thủ kho</option><option value="WH_MANAGER">Quản lý kho</option><option value="ACCOUNTANT">Kế toán</option><option value="ADMIN">Quản trị hệ thống</option></select><select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Lọc theo trạng thái"><option value="ALL">Mọi trạng thái</option><option value="ACTIVE">Đang hoạt động</option><option value="LOCKED">Đã khóa</option><option value="PENDING_ACTIVATION">Chờ kích hoạt</option><option value="DISABLED">Vô hiệu hóa</option></select></div>{error && <div className="workspace-alert is-error">{error}</div>}<AdminUserTable users={users} onEdit={onEdit} onLock={onLock} onUnlock={onUnlock} onAudit={onAudit} busy={busy} />{loading && <div className="workspace-loading">Đang tải tài khoản…</div>}{!loading && users.length === 0 && <div className="workspace-empty">Không tìm thấy tài khoản phù hợp.</div>}<div className="workspace-pagination"><span>{total} tài khoản · Trang {page} / {Math.max(totalPages, 1)}</span><div><button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>← Trước</button><button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading}>Sau →</button></div></div></>;
}

function AdminUserTable({ users, onEdit, onLock, onUnlock, onAudit, busy, recentMode = false }: { users: UserRow[]; onEdit: (user: UserRow) => void; onLock: (user: UserRow) => void; onUnlock: (user: UserRow) => void; onAudit: (user: UserRow) => void; busy: boolean; recentMode?: boolean }) {
  return <TableShell headers={recentMode ? ["Người dùng", "Vai trò", "Trạng thái", "Địa bàn phụ trách"] : ["Người dùng", "Vai trò", "Trạng thái", "Đại lý phụ trách", "Thao tác"]}>{users.map((user) => <tr key={user.id}><td><strong>{user.full_name}</strong><small className="workspace-cell-subtitle">{user.username}</small></td><td>{user.roles.map((item) => typeof item === "string" ? item : item.name || item.code).join(", ") || "Chưa gán"}</td><td><StatusPill tone={isUserActive(user) ? "green" : "red"}>{user.status}</StatusPill></td><td>{recentMode ? (user.territories?.map((territory) => territory.name).join(", ") || "\u2014") : (user.assigned_dealers_count ?? "\u2014")}</td>{!recentMode && <td><div className="workspace-row-actions"><button onClick={() => onEdit(user)} disabled={busy}>Cập nhật</button><button onClick={() => onAudit(user)} title="Nhật ký">Nhật ký</button>{isUserActive(user) ? <button className="is-danger-text" disabled={busy} onClick={() => onLock(user)}>Khóa</button> : <button disabled={busy} onClick={() => onUnlock(user)}>Mở khóa</button>}</div></td>}</tr>)}</TableShell>;
}

function isUserActive(user: UserRow): boolean {
  return user.is_active ?? user.status === "ACTIVE";
}

function AuditSummary({ compact = false }: { compact?: boolean }) {
  const rows = [["Đăng nhập quản trị thành công", "Vừa xong", "green"], ["Đã thu hồi 2 phiên hết hạn", "09:42", "blue"], ["Cập nhật quyền truy cập", "Hôm qua", "amber"]];
  return <div className="workspace-audit-summary">{rows.slice(0, compact ? 2 : 3).map(([label, time, tone]) => <div key={label}><span className={`workspace-audit-dot is-${tone}`} /><span><strong>{label}</strong><small>{time} · Quản trị hệ thống</small></span></div>)}</div>;
}

function RoleSummary() {
  return <div className="workspace-role-summary">{[["Kinh doanh", "Sales Rep · Sales Manager", "blue"], ["Kho vận", "Warehouse · WH Manager", "violet"], ["Tài chính", "Accountant", "green"], ["Khách hàng", "Customer", "amber"]].map(([group, roles, tone]) => <div key={group}><span className={`workspace-role-mark is-${tone}`}>{group.slice(0, 1)}</span><span><strong>{group}</strong><small>{roles}</small></span></div>)}</div>;
}

function ConfigurationCards() {
  return <div className="workspace-configuration-grid">{[["Vai trò", "7 vai trò nghiệp vụ", "Phân quyền cố định theo chính sách"], ["Địa bàn", "4 khu vực", "Việt Nam · Hà Nội · TP.HCM · Đà Nẵng"], ["Kho hàng", "2 kho", "Hà Nội · TP. Hồ Chí Minh"]].map(([title, value, description]) => <article key={title}><span>⚙</span><small>{title}</small><strong>{value}</strong><p>{description}</p></article>)}</div>;
}
