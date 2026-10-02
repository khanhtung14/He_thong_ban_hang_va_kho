import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Error403 from "../templates/errors/403";
import ChangePassword from "./ChangePassword";
import ForgotPassword from "./ForgotPassword";
import Login from "./Login";

import Navigation from "./Navigation";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

const currentPath = window.location.pathname;
const page = currentPath === "/errors/403"
  ? <Error403 />
  : currentPath === "/change-password"
    ? <ChangePassword />
    : currentPath === "/forgot-password"
      ? <ForgotPassword />
    : currentPath === "/navigation" || currentPath === "/navigation-ui"
      ? <Navigation />
    : <Login />;

createRoot(rootElement).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
