import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
<<<<<<< HEAD
import Error403 from "../templates/errors/403";
import ChangePassword from "./ChangePassword";
import ForgotPassword from "./ForgotPassword";
import Login from "./Login";
import ProductImport from "./ProductImport";

import Navigation from "./Navigation";
=======
import App from "./App";
>>>>>>> 0608a54677c07dd6a27d9711e9cafd8e271052af

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để khởi chạy giao diện.");
}

<<<<<<< HEAD
const currentPath = window.location.pathname;
const currentView = new URLSearchParams(window.location.search).get("view");
const page = currentPath === "/" && currentView === "product-import"
  ? <ProductImport />
  : currentPath === "/errors/403"
  ? <Error403 />
  : currentPath === "/change-password"
    ? <ChangePassword />
    : currentPath === "/forgot-password"
      ? <ForgotPassword />
    : currentPath === "/navigation" || currentPath === "/navigation-ui"
      ? <Navigation />
    : <Login />;

=======
>>>>>>> 0608a54677c07dd6a27d9711e9cafd8e271052af
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
