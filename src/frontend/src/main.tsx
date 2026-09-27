import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Error403 from "../templates/errors/403";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Error403 />
  </StrictMode>,
);
