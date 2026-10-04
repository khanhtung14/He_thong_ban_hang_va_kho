import { useEffect, useState } from "react";

interface MenuItem {
  id: string;
  title: string;
  path: string;
  icon: string;
  category: string;
}

interface UserNavigation {
  username: string;
  full_name: string;
  role_code: string;
  role_name: string;
  scope: string;
}

const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; overflow-x: hidden; }
  .header { position: fixed; top: 0; left: 0; right: 0; height: 64px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; z-index: 40; }
  .btn-hamburger { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; cursor: pointer; color: #0f172a; }
  .btn-hamburger:hover { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: #2563eb; font-size: 16px; }
  .user-box { display: flex; align-items: center; gap: 10px; }
  .user-avatar { width: 38px; height: 38px; min-width: 38px; min-height: 38px; border-radius: 50%; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
  .user-details { text-align: right; }
  .user-name { font-size: 14px; font-weight: 600; color: #0f172a; }
  .badges { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }
  .badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; line-height: 1.4; }
  .badge-role { background: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
  .badge-scope { background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; }
  .sidebar-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 45; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
  .sidebar-overlay.open { opacity: 1; pointer-events: auto; }
  .sidebar { position: fixed; top: 0; bottom: 0; left: 0; width: 270px; max-width: 85vw; background: #fff; border-right: 1px solid #e2e8f0; z-index: 50; transform: translateX(-100%); transition: transform 0.25s; display: flex; flex-direction: column; overflow-y: auto; overflow-x: hidden; }
  .sidebar.open { transform: translateX(0); }
  .sidebar-header { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; }
  .btn-close { min-width: 44px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; cursor: pointer; color: #64748b; }
  .nav-list { padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
  .nav-category { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; padding: 12px 10px 4px; }
  .nav-item { min-height: 46px; min-width: 44px; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 8px; color: #334155; text-decoration: none; font-size: 14px; font-weight: 500; cursor: pointer; }
  .nav-item:hover { background: #eff6ff; color: #2563eb; }
  .nav-item.active { background: #2563eb; color: #fff; font-weight: 600; }
  .main-content { padding: 84px 16px 32px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .role-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  .role-btn { min-height: 44px; min-width: 44px; padding: 8px 14px; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .role-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  .tag { display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; margin: 4px 4px 0 0; }
  .tag-ok { background: #dbeafe; color: #1e40af; }
  @media (max-width: 360px) {
    .header { padding: 0 8px; height: 60px; }
    .main-content { padding: 72px 10px 24px; }
    .user-avatar { display: none; }
    .user-name { font-size: 12px; max-width: 90px; }
    .badge { font-size: 9.5px; padding: 1px 5px; }
  }
`;

export default function Navigation() {
  const [role, setRole] = useState("WAREHOUSE");
  const [user, setUser] = useState<UserNavigation>({
    username: "tranvankho",
    full_name: "Trần Văn Kho",
    role_code: "WAREHOUSE",
    role_name: "Nhân viên kho",
    scope: "Kho Tổng Hà Nội",
  });
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState("");

  useEffect(() => {
    fetch(`/api/v1/navigation/menu?role=${encodeURIComponent(role)}`)
      .then((res) => res.json())
      .then((data) => {
        setUser(data.user);
        setMenuItems(data.menu_items);
        if (data.menu_items.length > 0) {
          setActiveItem(data.menu_items[0].id);
        }
      })
      .catch(() => {});
  }, [role]);

  return (
    <>
      <style>{styles}</style>
      <div className={`sidebar-overlay ${isSidebarOpen ? "open" : ""}`} onClick={() => setIsSidebarOpen(false)} />
      
      {/* Sidebar Drawer */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`} aria-label="Menu điều hướng">
        <div className="sidebar-header">
          <span>Danh Mục Nghiệp Vụ</span>
          <button className="btn-close" onClick={() => setIsSidebarOpen(false)} aria-label="Đóng menu">✕</button>
        </div>
        <nav className="nav-list">
          {menuItems.map((item, idx) => (
            <div key={item.id}>
              {(idx === 0 || item.category !== menuItems[idx - 1].category) && (
                <div className="nav-category">{item.category}</div>
              )}
              <a
                className={`nav-item ${activeItem === item.id ? "active" : ""}`}
                id={`nav-${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveItem(item.id);
                  if (window.innerWidth <= 768) setIsSidebarOpen(false);
                }}
              >
                <span>📦</span>
                <span>{item.title}</span>
              </a>
            </div>
          ))}
        </nav>
      </aside>

      {/* Header */}
      <header className="header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn-hamburger" id="btnHamburger" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Mở menu">
            ☰
          </button>
          <div className="brand">OMS Bán hàng &amp; Kho</div>
        </div>

        <div className="user-box" id="userHeaderProfile">
          <div className="user-avatar">{user.full_name.slice(0, 2).toUpperCase()}</div>
          <div className="user-details">
            <div className="user-name" id="userFullName">{user.full_name}</div>
            <div className="badges">
              <span className="badge badge-role" id="userRoleBadge">{user.role_name}</span>
              <span className="badge badge-scope" id="userScopeBadge">{user.scope}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <section className="card">
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>
            SCRUM-60: Menu Điều Hướng Đúng Theo Quyền &amp; Tối Ưu Mobile 360px
          </h1>
          <p style={{ fontSize: 13, color: "#64748b" }}>
            Chọn vai trò bên dưới để kiểm tra menu điều hướng động theo quyền thực tế:
          </p>

          <div className="role-tabs">
            {["WAREHOUSE", "SALES", "SALES_MANAGER", "WH_MANAGER", "ACCOUNTANT", "ADMIN", "CUSTOMER"].map((r) => (
              <button
                key={r}
                className={`role-btn ${role === r ? "active" : ""}`}
                onClick={() => setRole(r)}
              >
                {r === "WAREHOUSE" ? "Nhân viên kho" : r === "SALES" ? "Kinh doanh" : r === "SALES_MANAGER" ? "Quản lý KD" : r === "WH_MANAGER" ? "Quản lý kho" : r === "ACCOUNTANT" ? "Kế toán" : r === "ADMIN" ? "Quản trị" : "Đại lý"}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 14, marginBottom: 6 }}>Chức năng đang hiển thị ({menuItems.length} mục):</h3>
            {menuItems.map((item) => (
              <span key={item.id} className="tag tag-ok">✓ {item.title}</span>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
