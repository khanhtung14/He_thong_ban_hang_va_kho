import { getCurrentUserRole, hasValidSession } from "./services/sessionService";
import AdminDashboard from "./roles/admin/AdminDashboard";
import { SalesManagerDashboard } from "./roles/sales_manager/SalesManagerDashboard";
import AccountantDashboard from "./roles/accountant/AccountantDashboard";
import CustomerDashboard from "./roles/customer/CustomerDashboard";
import SalesDashboard from "./roles/sales/SalesDashboard";
import WarehouseManagerDashboard from "./roles/warehouse_manager/WarehouseManagerDashboard";
import WarehouseStaffDashboard from "./roles/warehouse_staff/WarehouseStaffDashboard";
import Error403 from "./Error403";

type RoleKey =
  | "customer"
  | "sales"
  | "salesManager"
  | "warehouse"
  | "warehouseManager"
  | "accountant"
  | "admin";

const roleByPath: Record<string, RoleKey> = {
  "/portal/orders": "customer",
  "/sales/orders": "sales",
  "/sales/customers": "sales",
  "/manager/dashboard": "salesManager",
  "/manager/orders/approval": "salesManager",
  "/manager/pricing": "salesManager",
  "/manager/reports": "salesManager",
  "/manager/categories": "salesManager",
  "/manager/products/import": "salesManager",
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
  "/manager/categories": ["salesManager", "admin"],
  "/manager/products/import": ["salesManager", "admin"],
  "/warehouse/picking": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/receiving": ["warehouse", "warehouseManager", "admin"],
  "/warehouse/inventory": [
    "warehouse",
    "warehouseManager",
    "salesManager",
    "admin",
  ],
  "/warehouse/dashboard": ["warehouseManager", "admin"],
  "/accounting/debt-book": ["accountant", "admin"],
  "/accounting/invoices": ["accountant", "admin"],
  "/admin/users": ["admin"],
  "/admin/territory-handover": ["admin"],
  "/admin/audit-logs": ["admin"],
};

function normalizeRole(value: string | null): RoleKey | null {
  const role = (value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
  if (["CUSTOMER", "DAI_LY", "KHACH_HANG"].includes(role)) return "customer";
  if (["SALES", "SALES_REP", "KINH_DOANH"].includes(role)) return "sales";
  if (["SALES_MANAGER", "QUAN_LY_KINH_DOANH", "SALESMANAGER"].includes(role))
    return "salesManager";
  if (["WAREHOUSE", "KHO", "WAREHOUSE_STAFF", "NHAN_VIEN_KHO"].includes(role))
    return "warehouse";
  if (["WH_MANAGER", "WAREHOUSE_MANAGER", "QUAN_LY_KHO"].includes(role))
    return "warehouseManager";
  if (["ACCOUNTANT", "KE_TOAN"].includes(role)) return "accountant";
  if (["ADMIN", "ADMINISTRATOR", "QUAN_TRI"].includes(role)) return "admin";
  return null;
}

export default function RoleWorkspace() {
  if (!hasValidSession()) {
    window.location.assign("/login");
    return null;
  }

  const currentUserRoleStr = getCurrentUserRole();
  const currentUserRole = normalizeRole(currentUserRoleStr);
  const currentPath = window.location.pathname;

  if (currentPath.startsWith("/admin/") && currentUserRole !== "admin") {
    return <Error403 />;
  }

  const allowed = allowedRolesByPath[currentPath];
  if (
    allowed &&
    currentUserRole &&
    !allowed.includes(currentUserRole) &&
    currentUserRole !== "admin"
  ) {
    return <Error403 />;
  }

  const pathRole = roleByPath[currentPath] || null;
  const role: RoleKey | null =
    currentUserRole === "admin" && pathRole
      ? pathRole
      : currentUserRole || pathRole;

  switch (role) {
    case "admin":
      return <AdminDashboard />;
    case "salesManager":
      return <SalesManagerDashboard />;
    case "accountant":
      return <AccountantDashboard />;
    case "customer":
      return <CustomerDashboard />;
    case "sales":
      return <SalesDashboard />;
    case "warehouseManager":
      return <WarehouseManagerDashboard />;
    case "warehouse":
      return <WarehouseStaffDashboard />;
    default:
      return (
        <main
          style={{
            display: "grid",
            placeItems: "center",
            height: "100vh",
            backgroundColor: "#f8fafc",
            textAlign: "center",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}>
              Không xác định được vai trò
            </h1>
            <p style={{ color: "#64748b", margin: "12px 0 24px" }}>
              Vui lòng đăng nhập lại để tải giao diện đúng với tài khoản.
            </p>
            <button
              type="button"
              style={{
                backgroundColor: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontWeight: 600,
                cursor: "pointer",
              }}
              onClick={() => window.location.assign("/login")}
            >
              Đăng nhập lại
            </button>
          </div>
        </main>
      );
  }
}
