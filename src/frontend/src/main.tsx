import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Error403 from "../templates/errors/403";
import ChangePassword from "./ChangePassword";
import CreateUser from "./CreateUser";
import ForgotPassword from "./ForgotPassword";
import Login from "./Login";
import Navigation from "./Navigation";
<<<<<<< HEAD
import Categories from "./Categories";
=======
import Profile from "./Profile";
import RoleWorkspace from "./RoleWorkspace";
>>>>>>> 4249a2e86b6fb9367f19bb4b1525258ca6e73ecb

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

const currentPath = window.location.pathname;
const roleWorkspacePaths = [
  "/portal/orders",
  "/sales/orders",
  "/manager/dashboard",
  "/warehouse/picking",
  "/warehouse/dashboard",
  "/accounting/debt-book",
  "/admin/users",
];
if (currentPath.startsWith("/admin/users")) document.title = "Quản trị tài khoản | OMS";
const page = currentPath === "/errors/403"
  ? <Error403 />
<<<<<<< HEAD
  : currentPath === "/change-password"
    ? <ChangePassword />
    : currentPath === "/forgot-password"
      ? <ForgotPassword />
    : currentPath === "/navigation" || currentPath === "/navigation-ui"
      ? <Navigation />
    : currentPath === "/manager/categories"
      ? <Categories />
    : <Login />;
=======
  : currentPath === "/admin/users/create"
    ? <CreateUser />
    : currentPath === "/change-password"
      ? <ChangePassword />
      : currentPath === "/profile"
        ? <Profile />
        : currentPath === "/forgot-password"
          ? <ForgotPassword />
          : currentPath === "/navigation" || currentPath === "/navigation-ui"
            ? <Navigation />
            : roleWorkspacePaths.includes(currentPath)
              ? <RoleWorkspace />
              : <Login />;
>>>>>>> 4249a2e86b6fb9367f19bb4b1525258ca6e73ecb

createRoot(rootElement).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
