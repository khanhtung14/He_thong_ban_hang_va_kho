import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Error403 from "../templates/errors/403";
import ChangePassword from "./ChangePassword";
import Login from "./Login";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

const currentPath = window.location.pathname;
const page = currentPath === "/errors/403"
  ? <Error403 />
  : currentPath === "/change-password"
    ? <ChangePassword />
    : <Login />;

createRoot(rootElement).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
