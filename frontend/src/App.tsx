import { useEffect, useState } from "react";
import Login from "./features/auth/Login";
import ForgotPassword from "./features/auth/ForgotPassword";
import ResetPassword from "./features/auth/ResetPassword";
import ChangePassword from "./features/auth/ChangePassword";
import CreateUser from "./features/users/CreateUser";
import Profile from "./features/profile/Profile";
import Navigation from "./Navigation";
import RoleWorkspace from "./features/roles/RoleWorkspace";
import Error403 from "./Error403";
import {
  hasValidSession,
  getCurrentUserRole,
} from "./services/sessionService";

const roleWorkspacePaths = [
  "/portal/orders",
  "/sales/orders",
  "/sales/customers",
  "/manager/dashboard",
  "/manager/orders/approval",
  "/manager/pricing",
  "/manager/reports",
  "/warehouse/picking",
  "/warehouse/receiving",
  "/warehouse/inventory",
  "/warehouse/dashboard",
  "/accounting/debt-book",
  "/accounting/invoices",
  "/admin/users",
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

  if (currentPath.startsWith("/admin/users")) {
    document.title = "Quản trị tài khoản | OMS";
  }

  // 1. Public routes (accessible without login)
  if (currentPath === "/login") {
    return <Login />;
  }
  if (currentPath === "/forgot-password") {
    return <ForgotPassword />;
  }
  if (currentPath === "/reset-password") {
    return <ResetPassword />;
  }
  if (currentPath === "/errors/403") {
    return <Error403 />;
  }

  // 2. Unauthenticated check:
  // If not logged in (no token / valid session / valid role), MUST display Login screen.
  // Never hardcode SalesManagerDashboard on root (/) or protected routes.
  if (!isAuthenticated || !userRole) {
    return <Login />;
  }

  // 3. Authenticated: on root (/) or /workspace, render user's role workspace
  if (currentPath === "/" || currentPath === "/workspace") {
    return <RoleWorkspace />;
  }

  // 4. Admin create user route
  if (currentPath === "/admin/users/create") {
    const normalized = (userRole ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
    if (["ADMIN", "ADMINISTRATOR"].includes(normalized)) {
      return <CreateUser />;
    }
    return <Error403 />;
  }

  // 5. User settings / common routes
  if (currentPath === "/change-password") {
    return <ChangePassword />;
  }
  if (currentPath === "/profile") {
    return <Profile />;
  }
  if (currentPath === "/navigation" || currentPath === "/navigation-ui") {
    return <Navigation />;
  }

  // 6. Role workspace routes (e.g. /manager/dashboard, /sales/orders, etc.)
  if (roleWorkspacePaths.includes(currentPath) || currentPath.startsWith("/admin/")) {
    return <RoleWorkspace />;
  }

  // Fallback for any other route when authenticated
  return <RoleWorkspace />;
}