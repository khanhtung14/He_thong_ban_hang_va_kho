import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import Error403 from "./Error403";
import { hasValidSession, getCurrentUserRole } from "./services/sessionService";

const Login = lazy(() => import("./features/auth/Login"));
const ForgotPassword = lazy(() => import("./features/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./features/auth/ResetPassword"));
const ChangePassword = lazy(() => import("./features/auth/ChangePassword"));
const CreateUser = lazy(() => import("./roles/admin/CreateUser"));
const Profile = lazy(() => import("./features/profile/Profile"));
const Navigation = lazy(() => import("./Navigation"));
const RoleWorkspace = lazy(() => import("./RoleWorkspace"));

function LazyPage({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main
          role="status"
          style={{
            display: "grid",
            minHeight: "100vh",
            placeItems: "center",
            color: "#64748b",
          }}
        >
          Đang tải...
        </main>
      }
    >
      {children}
    </Suspense>
  );
}

const roleWorkspacePaths = [
  "/portal/orders",
  "/sales/orders",
  "/sales/returns",
  "/sales/customers",
  "/sales/assignments",
  "/manager/dashboard",
  "/manager/orders/approval",
  "/manager/pricing",
  "/manager/reports",
  "/manager/categories",
  "/manager/discounts",
  "/manager/products",
  "/manager/products/import",
  "/manager/products/import-excel",
  "/warehouse/picking",
  "/warehouse/receiving",
  "/warehouse/inventory",
  "/warehouse/suppliers",
  "/warehouse/dashboard",
  "/warehouse/returns",
  "/accounting/debt-book",
  "/accounting/invoices",
  "/accounting/agencies",
  "/accountant/agencies",
  "/accounting/customers",
  "/accountant/customers",
  "/accounting/agency-locks",
  "/admin/users",
  "/admin/users/import",
];

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const isAuthenticated = hasValidSession();
  const userRole = getCurrentUserRole();

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath.startsWith("/admin/users")) {
      document.title = "Quản trị tài khoản | OMS";
    }
  }, [currentPath]);

  // 1. Public routes (accessible without login)
  if (currentPath === "/login") {
    return <LazyPage><Login /></LazyPage>;
  }
  if (currentPath === "/forgot-password") {
    return <LazyPage><ForgotPassword /></LazyPage>;
  }
  if (currentPath === "/reset-password") {
    return <LazyPage><ResetPassword /></LazyPage>;
  }
  if (currentPath === "/errors/403") {
    return <Error403 />;
  }

  // 2. Unauthenticated check:
  // If not logged in (no token / valid session / valid role), MUST display Login screen.
  // Never hardcode SalesManagerDashboard on root (/) or protected routes.
  if (!isAuthenticated || !userRole) {
    return <LazyPage><Login /></LazyPage>;
  }

  // 3. Authenticated: on root (/) or /workspace, render user's role workspace
  if (currentPath === "/" || currentPath === "/workspace") {
    return <LazyPage><RoleWorkspace /></LazyPage>;
  }

  // 4. Admin create user route
  if (currentPath === "/admin/users/create") {
    const normalized = (userRole ?? "")
      .trim()
      .toUpperCase()
      .replace(/[ -]/g, "_");
    if (["ADMIN", "ADMINISTRATOR"].includes(normalized)) {
      return <LazyPage><CreateUser /></LazyPage>;
    }
    return <Error403 />;
  }

  // 5. User settings / common routes
  if (currentPath === "/change-password") {
    return <LazyPage><ChangePassword /></LazyPage>;
  }
  if (currentPath === "/profile") {
    return <LazyPage><Profile /></LazyPage>;
  }
  if (currentPath === "/navigation" || currentPath === "/navigation-ui") {
    return <LazyPage><Navigation /></LazyPage>;
  }

  // 6. Role workspace routes (e.g. /manager/dashboard, /sales/orders, etc.)
  if (
    roleWorkspacePaths.includes(currentPath) ||
    currentPath.startsWith("/admin/")
  ) {
    return <LazyPage><RoleWorkspace /></LazyPage>;
  }

  // Fallback for any other route when authenticated
  return <LazyPage><RoleWorkspace /></LazyPage>;
}
