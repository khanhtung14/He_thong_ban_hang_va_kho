import { useEffect, useState } from "react";
import Login from "./auth/Login";
import ForgotPassword from "./auth/ForgotPassword";
import CreateUser from "./roles/admin/CreateUser";
import Navigation from "./Navigation";
import RoleWorkspace from "./RoleWorkspace";
import Error403 from "./Error403";
import { hasValidSession, getCurrentUserRole } from "./session";

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

  // 1. Tuyến đường công khai (không cần xác thực)
  if (currentPath === "/login") {
    return <Login />;
  }
  if (currentPath === "/forgot-password") {
    return <ForgotPassword />;
  }
  if (currentPath === "/errors/403") {
    return <Error403 />;
  }

  // 2. Kiểm tra xác thực phiên đăng nhập
  if (!isAuthenticated || !userRole) {
    return <Login />;
  }

  // 3. Quản trị viên: Tạo tài khoản nhân sự mới
  if (currentPath === "/admin/users/create") {
    const normalized = (userRole ?? "")
      .trim()
      .toUpperCase()
      .replace(/[ -]/g, "_");
    if (["ADMIN", "ADMINISTRATOR"].includes(normalized)) {
      return <CreateUser />;
    }
    return <Error403 />;
  }

  // 4. Menu điều hướng hệ thống (Navigation testing)
  if (currentPath === "/navigation" || currentPath === "/navigation-ui") {
    return <Navigation />;
  }

  // 5. Tuyến đường xem hồ sơ / đổi mật khẩu:
  // Vì đã tích hợp Modal trên Header nên đưa thẳng người dùng vào không gian làm việc
  if (currentPath === "/change-password" || currentPath === "/profile") {
    return <RoleWorkspace />;
  }

  // 6. Mặc định render RoleWorkspace cho trang chủ và các phân hệ chức năng
  if (
    currentPath === "/" ||
    currentPath === "/workspace" ||
    roleWorkspacePaths.includes(currentPath) ||
    currentPath.startsWith("/admin/")
  ) {
    return <RoleWorkspace />;
  }

  // Fallback an toàn cho người dùng đã đăng nhập
  return <RoleWorkspace />;
}
