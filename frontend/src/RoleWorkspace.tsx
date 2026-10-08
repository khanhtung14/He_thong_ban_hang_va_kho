import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  authenticatedFetch,
  logout,
  getCurrentUserRole,
  hasValidSession,
} from "./session";
import Profile from "./components/ProfileModal";
import ProfileAvatar from "./components/ProfileAvatar";
import SalesManagerDashboard from "./roles/sales_manager/SalesManagerDashboard";
import AdminDashboard from "./roles/admin/AdminDashboard";
import Error403 from "./Error403";
import "./RoleWorkspace.css";

type RoleKey =
  | "customer"
  | "sales"
  | "salesManager"
  | "warehouse"
  | "warehouseManager"
  | "accountant"
  | "admin";
type ViewItem = { id: string; label: string; icon: string; section?: string };
type Product = {
  sku: string;
  name: string;
  category?: string;
  sale_price: number;
  stock_available?: number;
  unit?: string;
  cost_price?: number;
  margin?: string;
};
type InventoryItem = {
  sku: string;
  name: string;
  warehouse_id: number;
  warehouse_name: string;
  quantity_available: number;
};

const roleByPath: Record<string, RoleKey> = {
  "/portal/orders": "customer",
  "/sales/orders": "sales",
  "/sales/customers": "sales",
  "/manager/dashboard": "salesManager",
  "/manager/orders/approval": "salesManager",
  "/manager/pricing": "salesManager",
  "/manager/reports": "salesManager",
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

const roleDetails: Record<
  RoleKey,
  {
    name: string;
    eyebrow: string;
    title: string;
    description: string;
    initials: string;
    views: ViewItem[];
  }
> = {
  customer: {
    name: "Đại lý",
    eyebrow: "CỔNG ĐẠI LÝ",
    title: "Xin chào, đối tác",
    description: "Đặt hàng và theo dõi hoạt động kinh doanh của cửa hàng.",
    initials: "ĐL",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "CỬA HÀNG" },
      { id: "products", label: "Sản phẩm", icon: "▦" },
      { id: "orders", label: "Đơn hàng", icon: "▤" },
      {
        id: "debt",
        label: "Công nợ & hóa đơn",
        icon: "◷",
        section: "TÀI CHÍNH",
      },
      { id: "profile", label: "Tài khoản", icon: "◉", section: "CÁ NHÂN" },
    ],
  },
  sales: {
    name: "Nhân viên kinh doanh",
    eyebrow: "SALES WORKSPACE",
    title: "Bàn làm việc kinh doanh",
    description: "Theo dõi tuyến, tạo đơn và chăm sóc đại lý được giao.",
    initials: "KD",
    views: [
      {
        id: "overview",
        label: "Tổng quan tuyến",
        icon: "⌂",
        section: "KINH DOANH",
      },
      { id: "new-order", label: "Tạo đơn hàng", icon: "＋" },
      { id: "customers", label: "Đại lý phụ trách", icon: "♧" },
      { id: "orders", label: "Đơn hàng", icon: "▤" },
      { id: "collections", label: "Thu tiền", icon: "₫", section: "CÔNG NỢ" },
    ],
  },
  salesManager: {
    name: "Quản lý kinh doanh",
    eyebrow: "SALES MANAGEMENT",
    title: "Trung tâm điều hành kinh doanh",
    description: "Theo dõi hiệu quả, duyệt ngoại lệ và chính sách bảng giá.",
    initials: "QL",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "ĐIỀU HÀNH" },
      { id: "approvals", label: "Duyệt đơn", icon: "✓" },
      {
        id: "reports",
        label: "Doanh số & lợi nhuận",
        icon: "▥",
        section: "PHÂN TÍCH",
      },
      { id: "products", label: "Sản phẩm", icon: "▦" },
    ],
  },
  warehouse: {
    name: "Nhân viên kho",
    eyebrow: "WAREHOUSE OPERATIONS",
    title: "Công việc trong kho",
    description: "Xử lý phiếu hàng và cập nhật tình hình kho được phân công.",
    initials: "K",
    views: [
      {
        id: "picking",
        label: "Phiếu soạn hàng",
        icon: "▤",
        section: "TÁC NGHIỆP",
      },
      { id: "receiving", label: "Nhập hàng", icon: "↓" },
      { id: "inventory", label: "Tồn kho", icon: "▦", section: "KHO HÀNG" },
      { id: "count", label: "Kiểm kê", icon: "☷" },
    ],
  },
  warehouseManager: {
    name: "Quản lý kho",
    eyebrow: "WAREHOUSE CONTROL",
    title: "Điều hành kho vận",
    description: "Theo dõi tồn kho, điều chỉnh và luân chuyển hàng hóa.",
    initials: "KQL",
    views: [
      {
        id: "overview",
        label: "Tổng quan kho",
        icon: "⌂",
        section: "ĐIỀU HÀNH",
      },
      { id: "inventory", label: "Tồn kho", icon: "▦" },
      { id: "adjustments", label: "Điều chỉnh tồn", icon: "±" },
      { id: "transfers", label: "Chuyển kho", icon: "⇄", section: "KIỂM SOÁT" },
      { id: "stocktakes", label: "Kiểm kê", icon: "☷" },
    ],
  },
  accountant: {
    name: "Kế toán công nợ",
    eyebrow: "FINANCE WORKSPACE",
    title: "Sổ công nợ & hóa đơn",
    description: "Đối soát khoản phải thu, thanh toán và chứng từ.",
    initials: "KT",
    views: [
      {
        id: "overview",
        label: "Tổng quan công nợ",
        icon: "⌂",
        section: "KẾ TOÁN",
      },
      { id: "debts", label: "Sổ công nợ", icon: "◷" },
      { id: "invoices", label: "Hóa đơn", icon: "▤", section: "CHỨNG TỪ" },
      { id: "payments", label: "Thanh toán", icon: "₫" },
      { id: "reconciliation", label: "Đối soát", icon: "⇄" },
    ],
  },
  admin: {
    name: "Quản trị hệ thống",
    eyebrow: "SYSTEM ADMINISTRATION",
    title: "Quản trị hệ thống",
    description: "Quản lý tài khoản, trạng thái truy cập và nhật ký bảo mật.",
    initials: "AD",
    views: [
      { id: "overview", label: "Tổng quan", icon: "⌂", section: "HỆ THỐNG" },
      { id: "users", label: "Tài khoản người dùng", icon: "♧" },
      {
        id: "rbac",
        label: "Ma trận phân quyền (RBAC)",
        icon: "⬡",
        section: "QUẢN TRỊ",
      },
      { id: "configuration", label: "Danh mục hệ thống", icon: "⚙" },
      { id: "audit", label: "Nhật ký hệ thống", icon: "◷" },
    ],
  },
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const demoOrders = [
  {
    id: "DH-240815",
    customer: "Tạp hóa Minh Anh",
    total: 12400000,
    status: "Chờ duyệt",
    tone: "amber",
  },
  {
    id: "DH-240812",
    customer: "Đại lý Hoàng Long",
    total: 8600000,
    status: "Đang soạn",
    tone: "blue",
  },
  {
    id: "DH-240809",
    customer: "Cửa hàng Hồng Phúc",
    total: 15800000,
    status: "Đang giao",
    tone: "violet",
  },
];

const demoCustomers = [
  {
    name: "Tạp hóa Minh Anh",
    code: "DL-HN-0148",
    area: "Cầu Giấy",
    debt: 12400000,
    due: "Hôm nay",
  },
  {
    name: "Đại lý Hoàng Long",
    code: "DL-HN-0120",
    area: "Đống Đa",
    debt: 8600000,
    due: "Còn 3 ngày",
  },
  {
    name: "Cửa hàng Hồng Phúc",
    code: "DL-HN-0091",
    area: "Ba Đình",
    debt: 0,
    due: "Đã đối soát",
  },
];

function normalizeRole(value: string | null): RoleKey | null {
  const role = (value ?? "").trim().toUpperCase().replace(/[ -]/g, "_");
  if (["CUSTOMER", "DAI_LY", "KHACH_HANG"].includes(role)) return "customer";
  if (["SALES", "SALES_REP", "KINH_DOANH"].includes(role)) return "sales";
  if (["SALES_MANAGER", "QUAN_LY_KINH_DOANH", "SALESMANAGER"].includes(role))
    return "salesManager";
  if (["WAREHOUSE", "KHO"].includes(role)) return "warehouse";
  if (["WH_MANAGER", "WAREHOUSE_MANAGER", "QUAN_LY_KHO"].includes(role))
    return "warehouseManager";
  if (["ACCOUNTANT", "KE_TOAN"].includes(role)) return "accountant";
  if (["ADMIN", "ADMINISTRATOR", "QUAN_TRI"].includes(role)) return "admin";
  return null;
}

function goBack(role: RoleKey) {
  const previous = document.referrer;
  if (
    previous.startsWith(window.location.origin) &&
    !new URL(previous).pathname.startsWith("/login")
  ) {
    window.history.back();
    return;
  }
  const fallback =
    Object.entries(roleByPath).find(([, value]) => value === role)?.[0] ?? "/";
  window.location.assign(fallback);
}

async function readResponse<T>(path: string): Promise<T> {
  const response = await authenticatedFetch(path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : "Không tải được dữ liệu từ máy chủ.";
    throw new Error(detail);
  }
  return body as T;
}

function StatusPill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`workspace-status is-${tone}`}>{children}</span>;
}

function PrototypeBanner({
  text = "Bản giao diện mẫu · chức năng này chưa có API lưu dữ liệu.",
}: {
  text?: string;
}) {
  return (
    <div className="workspace-prototype">
      <span aria-hidden="true">✳</span>
      <span>{text}</span>
    </div>
  );
}

function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="workspace-page-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  icon,
  accent = "blue",
}: {
  label: string;
  value: string;
  change?: string;
  icon: string;
  accent?: string;
}) {
  return (
    <article className="workspace-metric">
      <div className={`workspace-metric-icon is-${accent}`}>{icon}</div>
      <div className="workspace-metric-label">{label}</div>
      <div className="workspace-metric-value">{value}</div>
      {change && <div className="workspace-metric-change">{change}</div>}
    </article>
  );
}

function TableShell({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="workspace-table-wrap">
      <table className="workspace-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function RoleWorkspace() {
  if (!hasValidSession()) {
    window.location.assign("/login");
    return null;
  }

  const currentUserRoleStr = getCurrentUserRole();
  const currentUserRole = normalizeRole(currentUserRoleStr);
  const currentPath = window.location.pathname;

  // Bảo vệ route Admin
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

  // Chuyển hướng các phân hệ đã hoàn tất tái cấu trúc
  if (role === "admin") {
    return <AdminDashboard />;
  }

  if (role === "salesManager") {
    return <SalesManagerDashboard />;
  }

  const details = role ? roleDetails[role] : null;
  const initialView = new URLSearchParams(window.location.search).get("view");
  const [view, setView] = useState(
    initialView ?? details?.views[0]?.id ?? "overview",
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadError, setLoadError] = useState("");
  const [, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setCartCount] = useState(0);
  const [adjustment, setAdjustment] = useState({
    sku: "SKU-001",
    quantity_delta: "",
    reason: "",
  });
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const onPopState = () =>
      setView(
        new URLSearchParams(window.location.search).get("view") ??
          details?.views[0]?.id ??
          "overview",
      );
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [details]);

  useEffect(() => {
    if (!role) return;
    const shouldProducts =
      ["customer", "sales"].includes(role) &&
      ["overview", "products", "new-order"].includes(view);
    const shouldInventory =
      ["sales", "warehouse", "warehouseManager"].includes(role) &&
      ["overview", "inventory", "picking", "adjustments"].includes(view);
    if (!shouldProducts && !shouldInventory) return;

    let cancelled = false;
    setLoading(true);
    setLoadError("");
    const requests: Promise<void>[] = [];
    if (shouldProducts)
      requests.push(
        readResponse<Product[]>("/api/v1/products")
          .then((data) => {
            if (!cancelled) setProducts(data);
          })
          .catch((error: Error) => {
            if (!cancelled) setLoadError(error.message);
          }),
      );
    if (shouldInventory)
      requests.push(
        readResponse<InventoryItem[]>("/api/v1/inventory/items")
          .then((data) => {
            if (!cancelled) setInventory(data);
          })
          .catch((error: Error) => {
            if (!cancelled) setLoadError(error.message);
          }),
      );

    Promise.all(requests).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [role, view]);

  const heading = useMemo(
    () =>
      details?.views.find((item) => item.id === view)?.label ??
      details?.views[0]?.label ??
      "Tổng quan",
    [details, view],
  );
  const username = window.sessionStorage.getItem("user_name") || "Người dùng";

  function navigate(nextView: string) {
    setView(nextView);
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    window.history.pushState({}, "", url);
    setNotice("");
  }

  async function submitInventoryAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAdjusting(true);
    setNotice("");
    try {
      const selected = inventory.find((item) => item.sku === adjustment.sku);
      const response = await authenticatedFetch("/api/v1/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: adjustment.sku,
          warehouse_id: selected?.warehouse_id ?? 1,
          quantity_delta: Number(adjustment.quantity_delta),
          reason: adjustment.reason.trim(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "Không thể điều chỉnh tồn kho.",
        );
      setNotice(
        `${result.message ?? "Điều chỉnh thành công"}. Tồn mới: ${result.new_quantity ?? "đã ghi nhận"}.`,
      );
      const refreshed = await readResponse<InventoryItem[]>(
        "/api/v1/inventory/items",
      );
      setInventory(refreshed);
      setAdjustment((current) => ({
        ...current,
        quantity_delta: "",
        reason: "",
      }));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Không thể kết nối máy chủ.",
      );
    } finally {
      setIsAdjusting(false);
    }
  }

  if (!role || !details)
    return (
      <main className="workspace-invalid">
        <h1>Không xác định được vai trò</h1>
        <p>Vui lòng đăng nhập lại để tải giao diện đúng với tài khoản.</p>
        <button className="workspace-button" onClick={() => void logout()}>
          Đăng nhập
        </button>
      </main>
    );

  const renderProducts = (addToCart = false) => (
    <>
      {loadError && <div className="workspace-alert is-error">{loadError}</div>}
      <div className="workspace-product-grid">
        {products.map((product) => (
          <article className="workspace-product-card" key={product.sku}>
            <div className="workspace-product-art">
              <span>{product.category?.slice(0, 1) ?? "S"}</span>
              <small>{product.sku}</small>
            </div>
            <div className="workspace-product-body">
              <span className="workspace-product-category">
                {product.category ?? "Sản phẩm"}
              </span>
              <h3>{product.name}</h3>
              <p className="workspace-product-unit">
                {product.unit ?? "Đơn vị tính: thùng"}
              </p>
              <div className="workspace-product-price">
                {formatMoney(product.sale_price)} <span>/ đơn vị</span>
              </div>
              <div className="workspace-product-stock">
                Còn khả dụng{" "}
                <strong>
                  {product.stock_available ??
                    inventory.find((item) => item.sku === product.sku)
                      ?.quantity_available ??
                    "—"}
                </strong>
              </div>
              {addToCart && (
                <button
                  className="workspace-button is-secondary is-full"
                  onClick={() => {
                    setCartCount((count) => count + 1);
                    setNotice(`${product.name} đã thêm vào giỏ hàng.`);
                  }}
                >
                  ＋ Thêm vào giỏ
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );

  const renderInventoryTable = () => (
    <TableShell
      headers={["Sản phẩm", "SKU", "Kho", "Tồn khả dụng", "Tình trạng"]}
    >
      {inventory.map((item) => (
        <tr key={`${item.sku}-${item.warehouse_id}`}>
          <td>
            <strong>{item.name}</strong>
          </td>
          <td>{item.sku}</td>
          <td>{item.warehouse_name}</td>
          <td>
            <strong>{item.quantity_available}</strong>
          </td>
          <td>
            <StatusPill tone={item.quantity_available < 30 ? "amber" : "green"}>
              {item.quantity_available < 30 ? "Sắp hết" : "Đủ hàng"}
            </StatusPill>
          </td>
        </tr>
      ))}
    </TableShell>
  );

  function renderContent(): ReactNode {
    switch (role as RoleKey) {
      case "customer":
        if (view === "products")
          return (
            <>
              <PageHeading
                title="Danh mục sản phẩm"
                subtitle="Giá bán và tồn khả dụng được tải từ API sản phẩm."
              />
              {renderProducts(true)}
            </>
          );
        if (view === "orders")
          return (
            <>
              <PageHeading
                title="Đơn hàng của tôi"
                subtitle="Theo dõi trạng thái xử lý và giao nhận."
              />
              <PrototypeBanner />
              <OrdersTable />
            </>
          );
        if (view === "debt")
          return (
            <>
              <PageHeading
                title="Công nợ & hóa đơn"
                subtitle="Tra cứu khoản phải trả và chứng từ của đại lý."
              />
              <PrototypeBanner />
              <Metrics
                items={[
                  ["Dư nợ hiện tại", "12,400,000 ₫", "◷", "amber"],
                  ["Đến hạn tuần này", "1 hóa đơn", "!", "blue"],
                  ["Đã thanh toán tháng này", "24,800,000 ₫", "✓", "green"],
                ]}
              />
              <DebtTable />
            </>
          );
        if (view === "profile")
          return (
            <>
              <PageHeading
                title="Tài khoản đại lý"
                subtitle="Thông tin liên hệ và bảo mật tài khoản."
              />
              <ProfileCard
                username={username}
                roleName={details?.name ?? "Đại lý"}
              />
            </>
          );
        return (
          <>
            <WelcomeCard
              eyebrow="CỔNG ĐẠI LÝ"
              title={`Xin chào, ${username}`}
              text="Đặt hàng nhanh, theo dõi giao nhận và chủ động quản lý công nợ của cửa hàng."
              action={
                <button
                  className="workspace-button"
                  onClick={() => navigate("products")}
                >
                  Khám phá sản phẩm <span>→</span>
                </button>
              }
            />
            <Metrics
              items={[
                ["Đơn đang xử lý", "03", "▤", "blue"],
                ["Công nợ hiện tại", "12,400,000 ₫", "◷", "amber"],
                ["Đơn đã giao tháng này", "18", "✓", "green"],
              ]}
            />
            <OrdersTable compact />
            {renderProducts(true)}
          </>
        );

      case "sales":
        if (view === "customers")
          return (
            <>
              <PageHeading
                title="Đại lý phụ trách"
                subtitle="Danh sách đại lý theo địa bàn được phân công."
              />
              <PrototypeBanner />
              <CustomersTable />
            </>
          );
        if (view === "orders")
          return (
            <>
              <PageHeading
                title="Đơn hàng tuyến"
                subtitle="Theo dõi đơn đã tạo và trạng thái xử lý."
              />
              <PrototypeBanner />
              <OrdersTable />
            </>
          );
        if (view === "collections")
          return (
            <>
              <PageHeading
                title="Thu tiền theo tuyến"
                subtitle="Theo dõi khoản cần thu và ghi nhận giao dịch tại điểm bán."
              />
              <PrototypeBanner />
              <Metrics
                items={[
                  ["Cần thu hôm nay", "21,000,000 ₫", "₫", "amber"],
                  ["Đã thu", "8,400,000 ₫", "✓", "green"],
                  ["Đại lý quá hạn", "02", "!", "red"],
                ]}
              />
              <DebtTable />
            </>
          );
        if (view === "new-order")
          return (
            <SalesOrderDraft
              products={products}
              onSaved={(message) => setNotice(message)}
              notice={notice}
            />
          );
        if (view === "products")
          return (
            <>
              <PageHeading
                title="Sản phẩm & tồn khả dụng"
                subtitle="Giá bán và số lượng khả dụng tại các kho."
              />
              {renderProducts()}
            </>
          );
        return (
          <>
            <WelcomeCard
              eyebrow="TUYẾN HÀ NỘI · THỨ HAI, 15/06"
              title={`Chào ${username}, bắt đầu ngày mới`}
              text="Tập trung đơn cần xử lý và các đại lý cần chăm sóc trong tuyến."
              action={
                <button
                  className="workspace-button"
                  onClick={() => navigate("new-order")}
                >
                  ＋ Tạo đơn hàng
                </button>
              }
            />
            <Metrics
              items={[
                ["Đại lý được giao", "42", "♧", "blue"],
                ["Đơn cần theo dõi", "08", "▤", "violet"],
                ["Công nợ cần thu", "21,000,000 ₫", "₫", "amber"],
              ]}
            />
            <CustomersTable compact />
            <OrdersTable compact />
          </>
        );

      case "warehouse":
        if (view === "inventory")
          return (
            <>
              <PageHeading
                title="Tồn kho được phân công"
                subtitle="Số lượng khả dụng không bao gồm thông tin giá vốn."
              />
              {renderInventoryTable()}
            </>
          );
        if (view === "receiving")
          return (
            <>
              <PageHeading
                title="Tiếp nhận hàng hóa"
                subtitle="Ghi nhận số lượng thực nhập, lô hàng và tình trạng sản phẩm."
              />
              <PrototypeBanner />
              <ReceivingForm />
            </>
          );
        if (view === "count")
          return (
            <>
              <PageHeading
                title="Kiểm kê kho"
                subtitle="Ghi nhận kết quả đếm thực tế để quản lý kho đối soát."
              />
              <PrototypeBanner />
              <StocktakeTable />
            </>
          );
        return (
          <>
            <WelcomeCard
              eyebrow="KHO HÀ NỘI · CA SÁNG"
              title="Danh sách phiếu soạn hàng"
              text="Ưu tiên đơn đã duyệt và kiểm tra đúng lô, hạn sử dụng trước khi đóng gói."
              action={<StatusPill tone="green">Ca đang hoạt động</StatusPill>}
            />
            <Metrics
              items={[
                ["Chờ soạn", "12", "▤", "blue"],
                ["Đang xử lý", "04", "◷", "amber"],
                ["Đã hoàn tất", "18", "✓", "green"],
              ]}
            />
            <PickingTable />
          </>
        );

      case "warehouseManager":
        if (view === "inventory")
          return (
            <>
              <PageHeading
                title="Tổng hợp tồn kho"
                subtitle="Tồn khả dụng theo mặt hàng và kho."
              />
              {renderInventoryTable()}
            </>
          );
        if (view === "adjustments")
          return (
            <>
              <PageHeading
                title="Điều chỉnh tồn kho"
                subtitle="Ghi lý do và gửi yêu cầu điều chỉnh được lưu qua API kho."
              />
              <form
                className="workspace-form"
                onSubmit={submitInventoryAdjustment}
              >
                <label>
                  Sản phẩm
                  <select
                    value={adjustment.sku}
                    onChange={(e) =>
                      setAdjustment({ ...adjustment, sku: e.target.value })
                    }
                  >
                    {inventory.map((item) => (
                      <option value={item.sku} key={item.sku}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Số lượng thay đổi
                  <input
                    type="number"
                    value={adjustment.quantity_delta}
                    onChange={(e) =>
                      setAdjustment({
                        ...adjustment,
                        quantity_delta: e.target.value,
                      })
                    }
                    placeholder="Âm nếu giảm, dương nếu tăng"
                    required
                  />
                </label>
                <label>
                  Lý do điều chỉnh
                  <textarea
                    minLength={3}
                    value={adjustment.reason}
                    onChange={(e) =>
                      setAdjustment({ ...adjustment, reason: e.target.value })
                    }
                    placeholder="Ví dụ: Hàng hỏng được xác nhận sau kiểm kê"
                    required
                  />
                </label>
                <button className="workspace-button" disabled={isAdjusting}>
                  {isAdjusting ? "Đang ghi nhận…" : "Ghi nhận điều chỉnh"}
                </button>
                {notice && <div className="workspace-alert">{notice}</div>}
              </form>
            </>
          );
        if (view === "transfers")
          return (
            <>
              <PageHeading
                title="Điều chuyển giữa các kho"
                subtitle="Tạo phiếu luân chuyển và theo dõi xác nhận hai đầu kho."
              />
              <PrototypeBanner />
              <TransferTable />
            </>
          );
        if (view === "stocktakes")
          return (
            <>
              <PageHeading
                title="Kế hoạch kiểm kê"
                subtitle="Chốt số đếm, xem chênh lệch và lập yêu cầu xử lý."
              />
              <PrototypeBanner />
              <StocktakeTable />
            </>
          );
        return (
          <>
            <WelcomeCard
              eyebrow="2 KHO ĐANG KẾT NỐI"
              title="Kiểm soát kho vận"
              text="Theo dõi mức tồn, mặt hàng cần chú ý và các tác vụ chờ phê duyệt."
              action={
                <button
                  className="workspace-button is-secondary"
                  onClick={() => navigate("adjustments")}
                >
                  ＋ Điều chỉnh tồn
                </button>
              }
            />
            {renderInventoryTable()}
          </>
        );

      case "accountant":
        if (view === "debts")
          return (
            <>
              <PageHeading
                title="Sổ công nợ"
                subtitle="Theo dõi dư nợ, hạn thanh toán và tuổi nợ theo đại lý."
              />
              <PrototypeBanner />
              <DebtTable />
            </>
          );
        if (view === "invoices")
          return (
            <>
              <PageHeading
                title="Hóa đơn"
                subtitle="Tra cứu chứng từ, phát hành và theo dõi trạng thái thanh toán."
              />
              <PrototypeBanner />
              <InvoiceTable />
            </>
          );
        if (view === "payments")
          return (
            <>
              <PageHeading
                title="Ghi nhận thanh toán"
                subtitle="Đối chiếu khoản thu với hóa đơn và tài khoản đại lý."
              />
              <PrototypeBanner />
              <PaymentForm />
            </>
          );
        if (view === "reconciliation")
          return (
            <>
              <PageHeading
                title="Đối soát công nợ"
                subtitle="So sánh số liệu theo kỳ trước khi chốt sổ."
              />
              <PrototypeBanner />
              <ReconciliationPanel />
            </>
          );
        return (
          <>
            <WelcomeCard
              eyebrow="KỲ KẾ TOÁN · THÁNG 06/2026"
              title="Tổng quan công nợ"
              text="Nắm các khoản phải thu, hóa đơn đến hạn và giao dịch cần đối soát."
              action={
                <button
                  className="workspace-button"
                  onClick={() => navigate("payments")}
                >
                  ＋ Ghi nhận thanh toán
                </button>
              }
            />
            <DebtTable compact />
          </>
        );

      default:
        return (
          <div className="workspace-empty">
            <h3>Giao diện vai trò đang phát triển</h3>
            <p>
              Vui lòng liên hệ quản trị viên để được cấp quyền hoặc kiểm tra lại
              tài khoản.
            </p>
          </div>
        );
    }
  }

  return (
    <div className="role-workspace">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/">
          <span className="workspace-brand-mark">O</span>
          <span>
            OMS <small>OPERATIONS</small>
          </span>
        </a>
        <div className="workspace-sidebar-role">
          <span className="workspace-avatar is-sidebar">
            {details.initials}
          </span>
          <span>
            <small>ĐANG ĐĂNG NHẬP</small>
            <strong>{details.name}</strong>
          </span>
        </div>
        <nav className="workspace-nav" aria-label="Điều hướng nghiệp vụ">
          {details.views.map((item, index) => (
            <div key={item.id}>
              {item.section && (
                <div
                  className={`workspace-nav-section ${index ? "has-gap" : ""}`}
                >
                  {item.section}
                </div>
              )}
              <button
                className={`workspace-nav-item ${view === item.id ? "is-active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <span className="workspace-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="workspace-sidebar-bottom">
          <button className="workspace-logout" onClick={() => void logout()}>
            <span>↪</span> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="workspace-main-column">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <span>OMS</span>
            <span>/</span>
            <strong>{heading}</strong>
          </div>
          <div className="workspace-top-actions">
            <button type="button" onClick={() => goBack(role)}>
              ← <span>Quay lại</span>
            </button>
            <div className="workspace-user-chip">
              <ProfileAvatar
                initials={details.initials}
                className="workspace-avatar"
                editable={false}
              />
              <button
                type="button"
                className="workspace-user-profile"
                onClick={() => setProfileOpen(true)}
              >
                <strong>{username}</strong>
                <small>{details.name}</small>
              </button>
            </div>
          </div>
        </header>

        <main className="workspace-content">
          {notice && <div className="workspace-alert">{notice}</div>}
          {renderContent()}
        </main>
      </div>

      {profileOpen && (
        <Profile isOpen={true} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}

function Metrics({
  items,
}: {
  items: Array<[string, string, string, string]>;
}) {
  return (
    <div className="workspace-metrics">
      {items.map(([label, value, icon, accent]) => (
        <MetricCard
          key={label}
          label={label}
          value={value}
          icon={icon}
          accent={accent}
        />
      ))}
    </div>
  );
}

function WelcomeCard({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow: string;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <section className="workspace-welcome">
      <div className="workspace-welcome-copy">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      <div className="workspace-welcome-action">{action}</div>
    </section>
  );
}

function OrdersTable({ compact = false }: { compact?: boolean }) {
  return (
    <TableShell
      headers={[
        "Mã đơn",
        "Đại lý",
        "Tổng tiền",
        "Trạng thái",
        ...(!compact ? ["Cập nhật"] : []),
      ]}
    >
      {demoOrders.slice(0, compact ? 2 : undefined).map((order) => (
        <tr key={order.id}>
          <td>
            <strong className="workspace-link-text">{order.id}</strong>
          </td>
          <td>{order.customer}</td>
          <td>{formatMoney(order.total)}</td>
          <td>
            <StatusPill tone={order.tone}>{order.status}</StatusPill>
          </td>
          {!compact && <td>15/06/2026</td>}
        </tr>
      ))}
    </TableShell>
  );
}

function CustomersTable({ compact = false }: { compact?: boolean }) {
  return (
    <TableShell
      headers={[
        "Đại lý",
        "Địa bàn",
        "Công nợ",
        ...(!compact ? ["Hạn thanh toán"] : []),
      ]}
    >
      {demoCustomers.slice(0, compact ? 2 : undefined).map((customer) => (
        <tr key={customer.code}>
          <td>
            <strong>{customer.name}</strong>
            <small className="workspace-cell-subtitle">{customer.code}</small>
          </td>
          <td>{customer.area}</td>
          <td>{formatMoney(customer.debt)}</td>
          {!compact && (
            <td>
              <StatusPill tone={customer.due === "Hôm nay" ? "amber" : "green"}>
                {customer.due}
              </StatusPill>
            </td>
          )}
        </tr>
      ))}
    </TableShell>
  );
}

function DebtTable({ compact = false }: { compact?: boolean }) {
  return (
    <TableShell
      headers={[
        "Đại lý",
        "Số hóa đơn",
        "Dư nợ",
        "Hạn thanh toán",
        ...(!compact ? ["Tình trạng"] : []),
      ]}
    >
      {demoCustomers.map((customer, index) => (
        <tr key={customer.code}>
          <td>
            <strong>{customer.name}</strong>
            <small className="workspace-cell-subtitle">{customer.code}</small>
          </td>
          <td>HD-2026-{String(138 + index).padStart(3, "0")}</td>
          <td>{formatMoney(customer.debt || 3200000)}</td>
          <td>{customer.due}</td>
          {!compact && (
            <td>
              <StatusPill tone={index === 0 ? "amber" : "green"}>
                {index === 0 ? "Đến hạn" : "Trong hạn"}
              </StatusPill>
            </td>
          )}
        </tr>
      ))}
    </TableShell>
  );
}

function InvoiceTable({ compact = false }: { compact?: boolean }) {
  return (
    <TableShell
      headers={[
        "Số hóa đơn",
        "Đại lý",
        "Ngày phát hành",
        "Giá trị",
        ...(!compact ? ["Trạng thái"] : []),
      ]}
    >
      {demoCustomers
        .slice(0, compact ? 2 : undefined)
        .map((customer, index) => (
          <tr key={customer.code}>
            <td>
              <strong>HD-2026-{String(138 + index).padStart(3, "0")}</strong>
            </td>
            <td>{customer.name}</td>
            <td>12/06/2026</td>
            <td>{formatMoney(customer.debt || 3200000)}</td>
            {!compact && (
              <td>
                <StatusPill tone={index ? "green" : "amber"}>
                  {index ? "Đã thanh toán một phần" : "Chưa thanh toán"}
                </StatusPill>
              </td>
            )}
          </tr>
        ))}
    </TableShell>
  );
}

function PickingTable() {
  const picks = [
    {
      id: "SO-0158",
      customer: "Tạp hóa Minh Anh",
      lines: 4,
      deadline: "09:30",
      tone: "amber",
    },
    {
      id: "SO-0156",
      customer: "Đại lý Hoàng Long",
      lines: 7,
      deadline: "10:00",
      tone: "blue",
    },
  ];
  return (
    <div className="workspace-picking-list">
      {picks.map((pick) => (
        <article key={pick.id} className="workspace-picking-card">
          <div className="workspace-picking-time">
            {pick.deadline}
            <small>HẠN SOẠN</small>
          </div>
          <div className="workspace-picking-info">
            <StatusPill tone={pick.tone}>{pick.id}</StatusPill>
            <h3>{pick.customer}</h3>
            <p>{pick.lines} dòng hàng · Lấy theo hạn dùng</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function StocktakeTable() {
  return (
    <TableShell
      headers={["Mã kiểm kê", "Kho", "Phạm vi", "Hạn hoàn tất", "Trạng thái"]}
    >
      {[
        [
          "KK-026",
          "Kho Hà Nội",
          "Khu A · 18 SKU",
          "Hôm nay, 16:00",
          "Đang kiểm kê",
        ],
      ].map(([id, warehouse, scope, deadline, status]) => (
        <tr key={id}>
          <td>
            <strong>{id}</strong>
          </td>
          <td>{warehouse}</td>
          <td>{scope}</td>
          <td>{deadline}</td>
          <td>
            <StatusPill tone="blue">{status}</StatusPill>
          </td>
        </tr>
      ))}
    </TableShell>
  );
}

function ReceivingForm() {
  return (
    <section className="workspace-panel workspace-form">
      <label>
        Số phiếu nhập <input placeholder="PN-2026-…" />
      </label>
      <label>
        Nhà cung cấp <input placeholder="Tìm nhà cung cấp" />
      </label>
      <button
        className="workspace-button"
        onClick={() => window.alert("Bản xem trước.")}
      >
        Lưu phiếu nhập mẫu
      </button>
    </section>
  );
}

function TransferTable() {
  return (
    <TableShell
      headers={["Mã phiếu", "Từ kho", "Đến kho", "Số mặt hàng", "Trạng thái"]}
    >
      {[["CK-0081", "Kho Hà Nội", "Kho TP.HCM", "06", "Chờ duyệt"]].map(
        ([id, from, to, count, status]) => (
          <tr key={id}>
            <td>
              <strong>{id}</strong>
            </td>
            <td>{from}</td>
            <td>{to}</td>
            <td>{count}</td>
            <td>
              <StatusPill tone="amber">{status}</StatusPill>
            </td>
          </tr>
        ),
      )}
    </TableShell>
  );
}

function SalesOrderDraft({
  products,
  onSaved,
  notice,
}: {
  products: Product[];
  onSaved: (message: string) => void;
  notice: string;
}) {
  const [customer, setCustomer] = useState(demoCustomers[0].code);
  const [sku, setSku] = useState(products[0]?.sku ?? "SKU-001");
  const [quantity, setQuantity] = useState(1);
  const selected = products.find((product) => product.sku === sku);
  return (
    <section className="workspace-panel workspace-order-form">
      <label>
        Đại lý
        <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
          {demoCustomers.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sản phẩm
        <select value={sku} onChange={(e) => setSku(e.target.value)}>
          {products.map((item) => (
            <option key={item.sku} value={item.sku}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Số lượng
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <div className="workspace-order-total">
        <span>Tạm tính</span>
        <strong>{formatMoney((selected?.sale_price ?? 0) * quantity)}</strong>
      </div>
      <button
        className="workspace-button"
        onClick={() => onSaved("Đã lưu đơn nháp mẫu.")}
      >
        Lưu đơn nháp
      </button>
      {notice && <div className="workspace-alert">{notice}</div>}
    </section>
  );
}

function PaymentForm() {
  return (
    <section className="workspace-panel workspace-form">
      <label>
        Đại lý <input placeholder="Nhập tên đại lý" />
      </label>
      <label>
        Số tiền nhận <input type="number" placeholder="0" />
      </label>
      <button
        className="workspace-button"
        onClick={() => window.alert("Bản xem trước.")}
      >
        Ghi nhận thanh toán
      </button>
    </section>
  );
}

function ReconciliationPanel() {
  return (
    <div className="workspace-reconciliation">
      <div>
        <span>Hệ thống OMS</span>
        <strong>194,200,000 ₫</strong>
      </div>
      <span className="workspace-reconciliation-sign">⇄</span>
      <div>
        <span>Sao kê ngân hàng</span>
        <strong>191,200,000 ₫</strong>
      </div>
    </div>
  );
}

function ProfileCard({
  username,
  roleName,
}: {
  username: string;
  roleName: string;
}) {
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <section className="workspace-panel workspace-profile">
      <ProfileAvatar
        initials={initials}
        className="workspace-avatar is-large"
        editable={false}
      />
      <div>
        <h3>{username}</h3>
        <p>{roleName} · Đang hoạt động</p>
      </div>
    </section>
  );
}
