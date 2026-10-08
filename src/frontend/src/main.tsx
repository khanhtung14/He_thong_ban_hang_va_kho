// @ts-ignore
import "@ant-design/v5-patch-for-react-19";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
