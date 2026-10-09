import React, { useEffect, useState, useCallback } from "react";
import HeaderTailwind from "../../components/Header/HeaderTailwind";
import SidebarTailwind from "../../components/Sidebar/SidebarTailwind";
import StatCard from "../../components/StatCard";
import ApprovalList, { type ApprovalItem } from "./ApprovalList";
import TerritoryProgress from "./TerritoryProgress";
import CreatePriceListModal from "./CreatePriceListModal";
import ExportReportModal from "./ExportReportModal";
import OrderManagement from "../../OrderManagement";
import { authenticatedFetch } from "../../session";
import { logout } from "../../session";
import Profile from "../../Profile";
import {
  fetchProfile,
  fetchSalesMarginReport,
  fetchPriceLists,
  publishPriceList,
  deleteDraftPriceList,
  fetchManagerCustomers, updateCustomerGroup, fetchPendingOrders, approveOrder, rejectOrder,
  fetchNavigationMenu,
  type UserProfile,
  type SalesMarginReport,
  type PriceListItem,
  type ManagerCustomer,
} from "../../api";

export const SalesManagerDashboard: React.FC = () => {
  const routePages: Record<string, string> = {
    "/manager/dashboard": "dashboard",
    "/sales/orders": "orders",
    "/sales/customers": "customers",
    "/warehouse/inventory": "inventory",
    "/manager/orders/approval": "approvals",
    "/manager/pricing": "pricing",
    "/manager/reports": "reports",
  };
  const pageRoutes: Record<string, string> = Object.fromEntries(Object.entries(routePages).map(([path, page]) => [page, path]));
  const pageLabels: Record<string, string> = {
    orders: "Đơn hàng",
    customers: "Khách hàng / Đại lý",
    inventory: "Sổ tồn kho",
    approvals: "Duyệt đơn",
    pricing: "Bảng giá",
    reports: "Báo cáo doanh số",
  };
  const [activeManagerPage, setActiveManagerPage] = useState(() => routePages[window.location.pathname] || "dashboard");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [report, setReport] = useState<SalesMarginReport | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [customers, setCustomers] = useState<ManagerCustomer[]>([]);
  const [inventory, setInventory] = useState<Array<{sku:string;name:string;warehouse_name:string;quantity_available:number}>>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [activeMenuPath, setActiveMenuPath] = useState(() => pageRoutes[routePages[window.location.pathname] || "dashboard"] || "/manager/dashboard");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [versionSeed, setVersionSeed] = useState<PriceListItem | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [profileData, reportData, priceListsData, navItems, customersData, pendingData, inventoryData] = await Promise.allSettled([
        fetchProfile(),
        fetchSalesMarginReport(),
        fetchPriceLists(),
        fetchNavigationMenu("SALES_MANAGER"),
        fetchManagerCustomers(),
        fetchPendingOrders(),
        authenticatedFetch("/api/v1/inventory/items").then(async response=>{if(!response.ok)throw new Error("Không tải được sổ tồn kho.");return response.json();}),
      ]);

      // 1. Profile
      if (profileData.status === "fulfilled") {
        setProfile(profileData.value);
      } else {
        console.error("Profile load error:", profileData.reason);
        setError("Không thể tải thông tin cá nhân từ máy chủ.");
      }

      // 2. Report
      if (reportData.status === "fulfilled") {
        setReport(reportData.value);
      } else {
        console.error("Report load error:", reportData.reason);
      }

      // 3. Price lists & Draft Approvals
      if (priceListsData.status === "fulfilled") {
        const lists = priceListsData.value;
        setPriceLists(lists);

        // Derive draft price lists requiring manager publish
        const draftItems: ApprovalItem[] = lists
          .filter((p) => !p.published)
          .map((draft) => ({
            id: `pl-${draft.id}`,
            type: "price_list",
            typeLabel: "BG",
            badgeBg: "bg-blue-50 border border-blue-200",
            badgeText: "text-blue-700",
            title: `Bảng giá ${draft.code} (${draft.customer_group})`,
            reason: `Bảng giá nháp v${draft.version} chờ phát hành · Hiệu lực ${draft.start_date} đến ${draft.end_date}`,
            amount: `${draft.items?.length || 0} SKUs`,
            code: `#PL-${draft.id}`,
            assigneeLabel: "Tác vụ",
            assigneeName: "Khai báo bảng giá",
            approveActionLabel: "Phát hành bảng giá",
            priceListId: draft.id,
          }));

        setApprovals(draftItems);
      } else {
        console.error("Price lists load error:", priceListsData.reason);
      }

      if (customersData.status === "fulfilled") setCustomers(customersData.value);
      if (inventoryData.status === "fulfilled") setInventory(inventoryData.value);
      if (pendingData.status === "fulfilled") {
        const orderItems: ApprovalItem[] = pendingData.value.map(order => ({
          id:`order-${order.id}`, orderId:order.id, type:"below_floor", typeLabel:"ĐƠN",
          badgeBg:"bg-rose-50 border border-rose-200", badgeText:"text-rose-700",
          title:`Đơn ${order.order_code} · ${order.customer_name || `Đại lý #${order.customer_id}`}`,
          reason:order.approval_reason || "Có dòng hàng thấp hơn giá sàn",
          amount:`${order.total_amount.toLocaleString("vi-VN")} ₫`, code:`#${order.order_code}`,
          assigneeLabel:"Sản phẩm", assigneeName:order.items.map(i=>`${i.sku} × ${i.quantity}`).join(", "),
          approveActionLabel:"Duyệt đơn",
        }));
        setApprovals(prev=>[...prev.filter(item=>item.type!=="below_floor"), ...orderItems]);
      }

      // 4. Navigation Menu (Strictly filter out unauthorized /admin/ routes)
      if (navItems.status === "fulfilled" && navItems.value.length > 0) {
        setMenuItems([
          {
            id: "home",
            title: "Trang chủ",
            path: "/manager/dashboard",
            icon: "home",
          },
          ...navItems.value
            .filter((m: any) => !m.path.startsWith("/admin/"))
            .map((m: any) => ({
              id: m.id,
              title: m.title,
              path: m.path,
              icon: m.icon,
            })),
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi kết nối với máy chủ.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const onPopState = () => {
      const page = routePages[window.location.pathname] || "dashboard";
      setActiveManagerPage(page);
      setActiveMenuPath(pageRoutes[page] || "/manager/dashboard");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateManagerPage = (path: string) => {
    const page = routePages[path];
    if (!page) return;
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setActiveManagerPage(page);
    setActiveMenuPath(path);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle Approve action: Calls real API POST /api/v1/price-lists/{price_list_id}/publish
  const handleApprove = async (item: ApprovalItem) => {
    if(item.orderId){try{await approveOrder(item.orderId);showToast(`Đã duyệt đơn ${item.code}.`);setApprovals(prev=>prev.filter(a=>a.id!==item.id));}catch(e:any){showToast(e.message,"error");}return;}
    if (item.type === "price_list" && item.priceListId) {
      try {
        await publishPriceList(item.priceListId);
        showToast(`Đã phát hành thành công bảng giá ${item.title}!`, "success");
        setApprovals((prev) => prev.filter((a) => a.id !== item.id));

        // Refresh price lists state so the count updates
        const updatedLists = await fetchPriceLists().catch(() => null);
        if (updatedLists) setPriceLists(updatedLists);
      } catch (err: any) {
        showToast(err.message || "Lỗi khi phát hành bảng giá", "error");
      }
      return;
    }

    showToast(`Đã xử lý: ${item.title}`, "success");
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Handle Reject action
  const handleReject = async (item: ApprovalItem) => {
    if(item.orderId){try{await rejectOrder(item.orderId);showToast(`Đã từ chối đơn ${item.code}.`,"info");setApprovals(prev=>prev.filter(a=>a.id!==item.id));}catch(e:any){showToast(e.message,"error");}return;}
    if(item.priceListId){try{await deleteDraftPriceList(item.priceListId);showToast(`Đã từ chối và xóa bản nháp ${item.code}.`,"info");setApprovals(prev=>prev.filter(a=>a.id!==item.id));setPriceLists(prev=>prev.filter(p=>p.id!==item.priceListId));}catch(e:any){showToast(e.message,"error");}return;}
    showToast(`Đã từ chối: ${item.title}`, "info");
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  const handlePriceListCreated = async (newPriceList: PriceListItem) => {
    showToast(`Tạo thành công bảng giá nháp ${newPriceList.code}!`, "success");
    setPriceLists((prev) => [newPriceList, ...prev]);

    if (!newPriceList.published) {
      setApprovals((prev) => [
        {
          id: `pl-${newPriceList.id}`,
          type: "price_list",
          typeLabel: "BG",
          badgeBg: "bg-blue-50 border border-blue-200",
          badgeText: "text-blue-700",
          title: `Bảng giá ${newPriceList.code} (${newPriceList.customer_group})`,
          reason: `Bảng giá nháp mới tạo · Hiệu lực ${newPriceList.start_date} đến ${newPriceList.end_date}`,
          amount: `${newPriceList.items?.length || 0} SKUs`,
          code: `#PL-${newPriceList.id}`,
          assigneeLabel: "Tác vụ",
          assigneeName: "Khai báo bảng giá",
          approveActionLabel: "Phát hành bảng giá",
          priceListId: newPriceList.id,
        },
        ...prev,
      ]);
    }
  };

  // Format currency
  const formatMoney = (val?: number) => {
    if (val === undefined || val === null) return "0 ₫";
    if (val >= 1_000_000_000) {
      return `${(val / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tỷ ₫`;
    }
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Triệu ₫`;
    }
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  return (
    <div className="flex bg-[#F8FAFC] min-h-screen font-sans text-slate-800">
      {/* 1. Sidebar */}
      <SidebarTailwind
        currentPath={activeMenuPath}
        pendingApprovalCount={approvals.length}
        menuItems={menuItems}
        onLogout={logout}
        onNavigate={(path) => {
          navigateManagerPage(path === "/" ? "/manager/dashboard" : path);
        }}
      />

      {/* 2. Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <HeaderTailwind
          fullName={profile?.full_name || (loading ? "Đang tải..." : "Người dùng")}
          roleName={profile?.role || "Quản lý kinh doanh"}
          avatarUrl={profile?.avatar_url}
          notificationCount={approvals.length}
          onLogout={logout}
          onProfileClick={() => setIsProfileOpen(true)}
        />

        {/* Dashboard Body */}
        <main className="p-6 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* Toast alert */}
          {toast && (
            <div
              className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm animate-fade-in ${
                toast.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : toast.type === "error"
                  ? "bg-rose-50 text-rose-800 border-rose-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}
            >
              <span>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="text-sm font-bold opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Error alert */}
          {error && (
            <div className="p-4 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200 flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => setError("")}
                className="text-sm font-bold opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {activeManagerPage !== "dashboard" && (
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Quản lý kinh doanh</p><h1 className="mt-1 text-2xl font-bold text-slate-900">{pageLabels[activeManagerPage]}</h1></div>
              <button onClick={() => navigateManagerPage("/manager/dashboard")} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">← Trang chủ</button>
            </div>
          )}

          {activeManagerPage === "dashboard" && <>
          {/* Welcome Header block */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                Xin chào, {profile?.full_name || (loading ? "Quản lý kinh doanh" : "Quản lý kinh doanh")} <span className="inline-block animate-bounce">👋</span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Bàn làm việc Quản lý Kinh doanh · Giám sát doanh số, duyệt đơn và quản lý {priceLists.length} bảng giá niêm yết
              </p>
            </div>

            {/* Quick action buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-200/90 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Xuất báo cáo</span>
              </button>

              <button
                onClick={() => { setVersionSeed(null); setIsCreateModalOpen(true); }}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span className="text-base leading-none">+</span>
                <span>Tạo bảng giá mới</span>
              </button>
            </div>
          </div>

          {/* KPI Metric Cards Row (4 cards populated purely from real API) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <StatCard
              title="Doanh thu toàn kênh"
              value={formatMoney(report?.total_revenue)}
              target={report?.period ? `Kỳ: ${report.period}` : undefined}
              subText={report && report.total_revenue > 0 ? "Doanh số lũy kế ghi nhận" : "Chưa phát sinh doanh số"}
              tagText={report?.period || undefined}
              iconType="trend-up"
              loading={loading}
            />

            <StatCard
              title="Biên lợi nhuận gộp"
              value={report?.margin || "0%"}
              badgeText={report && report.total_revenue > 0 ? "Định mức hệ thống" : undefined}
              badgeTone="green"
              subText={report && report.total_revenue > 0 ? "Tính trên giá vốn & doanh thu" : "Chưa có phát sinh"}
              iconType="shield"
              loading={loading}
            />

            <StatCard
              title="Lợi nhuận gộp"
              value={formatMoney(report?.gross_profit)}
              badgeText={report && report.gross_profit > 0 ? "Doanh thu - Giá vốn" : undefined}
              badgeTone="green"
              subText={report && report.total_cogs > 0 ? `Giá vốn: ${formatMoney(report.total_cogs)}` : "Chưa phát sinh giá vốn"}
              iconType="clock"
              loading={loading}
            />

            <StatCard
              title="Bảng giá & Đơn chờ duyệt"
              value={`${String(approvals.length).padStart(2, "0")} Cần xử lý`}
              badgeText={approvals.length > 0 ? "Cần xử lý" : "Trống"}
              badgeTone={approvals.length > 0 ? "rose" : "green"}
              subText={approvals.length > 0 ? "Bảng giá nháp chờ phát hành" : "Không có yêu cầu chờ duyệt"}
              iconType="alert"
              isUrgent={approvals.length > 0}
              loading={loading}
            />
          </div>

          {/* Main Content Grid: Left Column 7/12 & Right Column 5/12 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Approval list (7 of 12) */}
            <div id="approvals-section" className="lg:col-span-7">
              <ApprovalList
                items={approvals}
                onApprove={handleApprove}
                onReject={handleReject}
                onViewAll={() => showToast(`Tổng cộng ${approvals.length} yêu cầu đang chờ bạn xử lý`, "info")}
                loading={loading}
              />
            </div>

            {/* Right Column: Territory Scope & Margin Products (5 of 12) */}
            <div className="lg:col-span-5">
              <TerritoryProgress
                area={profile?.area}
                productMargins={report?.details}
                loading={loading}
              />
            </div>
          </div>
          </>}

          {activeManagerPage === "orders" && <section><OrderManagement userRole="salesManager" /></section>}

          {activeManagerPage === "pricing" && <section className="bg-white rounded-2xl border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-slate-800">Bảng giá theo nhóm khách hàng</h2><p className="text-xs text-slate-500">Phiên bản đã phát hành được giữ nguyên; tạo bảng cùng mã để mở phiên bản mới.</p></div><button onClick={()=>setIsCreateModalOpen(true)} className="bg-blue-600 text-white rounded-lg px-3 py-2 text-xs">+ Tạo phiên bản</button></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-500 border-b"><th className="py-2">Mã / phiên bản</th><th>Nhóm</th><th>Hiệu lực</th><th>Sản phẩm</th><th>Trạng thái</th><th></th></tr></thead><tbody>{priceLists.map(p=><tr key={p.id} className="border-b last:border-0"><td className="py-3 font-semibold">{p.code} <span className="text-slate-400">v{p.version}</span></td><td>{p.customer_group}</td><td>{p.start_date} – {p.end_date}</td><td>{p.items?.length || 0} SKU</td><td><span className={`rounded-full px-2 py-1 text-xs ${p.published?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{p.published?"Đã phát hành":"Bản nháp"}</span></td><td>{p.published&&<button onClick={()=>{setVersionSeed(p);setIsCreateModalOpen(true);}} className="text-blue-700 text-xs font-semibold">Tạo phiên bản mới</button>}</td></tr>)}</tbody></table>{priceLists.length===0&&<p className="py-6 text-center text-sm text-slate-400">Chưa có bảng giá.</p>}</div>
          </section>}

          {activeManagerPage === "inventory" && <section className="bg-white rounded-2xl border border-slate-100 p-6"><h2 className="font-bold text-slate-800">Sổ tồn kho</h2><div className="overflow-x-auto mt-3"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-500 border-b"><th className="py-2">SKU</th><th>Sản phẩm</th><th>Kho</th><th>Tồn khả dụng</th></tr></thead><tbody>{inventory.map((item,index)=><tr key={`${item.sku}-${index}`} className="border-b last:border-0"><td className="py-3">{item.sku}</td><td>{item.name}</td><td>{item.warehouse_name}</td><td>{item.quantity_available}</td></tr>)}</tbody></table>{inventory.length===0&&<p className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu tồn kho hoặc không được cấp quyền xem.</p>}</div></section>}

          {activeManagerPage === "customers" && <section className="bg-white rounded-2xl border border-slate-100 p-6"><h2 className="font-bold text-slate-800">Nhóm giá đại lý</h2><p className="text-xs text-slate-500 mt-1 mb-4">Chọn nhóm để hệ thống áp dụng bảng giá tương ứng khi tạo đơn.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-500 border-b"><th className="py-2">Mã</th><th>Tên đại lý</th><th>Nhóm giá</th></tr></thead><tbody>{customers.map(c=><tr key={c.id} className="border-b last:border-0"><td className="py-3">{c.code}</td><td>{c.name}</td><td><select value={c.customer_group||"RETAIL"} onChange={async e=>{const value=e.target.value;try{const updated=await updateCustomerGroup(c.id,value);setCustomers(prev=>prev.map(x=>x.id===c.id?{...x,...updated}:x));showToast(`Đã cập nhật nhóm giá của ${c.name}.`);}catch(err:any){showToast(err.message,"error");}}} className="border rounded-lg px-2 py-1"><option value="DEALER_LEVEL_1">Đại lý cấp 1</option><option value="DEALER_LEVEL_2">Đại lý cấp 2</option><option value="RETAIL">Khách lẻ</option></select></td></tr>)}</tbody></table>{customers.length===0&&<p className="py-6 text-center text-sm text-slate-400">Chưa có đại lý.</p>}</div></section>}

          {activeManagerPage === "approvals" && <section id="approvals-section"><ApprovalList items={approvals} onApprove={handleApprove} onReject={handleReject} loading={loading} /></section>}

          {activeManagerPage === "reports" && <section className="space-y-5"><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><StatCard title="Doanh thu" value={formatMoney(report?.total_revenue)} target={report?.period ? `Kỳ: ${report.period}` : undefined} subText="Tổng doanh thu trong kỳ" iconType="trend-up" loading={loading}/><StatCard title="Lợi nhuận gộp" value={formatMoney(report?.gross_profit)} subText="Doanh thu trừ giá vốn" iconType="shield" loading={loading}/><StatCard title="Biên lợi nhuận" value={report?.margin || "0%"} subText="Tỷ lệ lợi nhuận gộp" iconType="clock" loading={loading}/></div><div className="bg-white rounded-2xl border border-slate-100 p-6"><div className="flex justify-between items-center"><div><h2 className="font-bold">Chi tiết doanh số theo SKU</h2><p className="text-sm text-slate-500">Kỳ báo cáo: {report?.period || "Chưa có dữ liệu"}</p></div><button onClick={()=>setIsExportModalOpen(true)} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm">Xuất báo cáo</button></div><div className="overflow-x-auto mt-4"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-slate-500 border-b"><th className="py-2">SKU</th><th>Sản phẩm</th><th>Số lượng</th><th>Doanh thu</th><th>Giá vốn</th><th>Biên lợi nhuận</th></tr></thead><tbody>{(report?.details||[]).map(item=><tr key={item.sku} className="border-b last:border-0"><td className="py-3">{item.sku}</td><td>{item.name}</td><td>{item.units_sold}</td><td>{formatMoney(item.revenue)}</td><td>{formatMoney(item.cost_price)}</td><td>{item.margin}</td></tr>)}</tbody></table>{!report?.details?.length&&<p className="py-8 text-center text-sm text-slate-400">Chưa có chi tiết doanh số trong kỳ.</p>}</div></div></section>}
        </main>
      </div>

      {/* Modals */}
      <CreatePriceListModal
        isOpen={isCreateModalOpen}
        onClose={() => {setIsCreateModalOpen(false);setVersionSeed(null);}}
        onCreated={handlePriceListCreated}
        initialCode={versionSeed?.code || ""}
        initialCustomerGroup={versionSeed?.customer_group || "DEALER_LEVEL_1"}
        initialItems={versionSeed?.items}
      />

      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        reportData={report}
      />

      {isProfileOpen && <Profile embedded onClose={() => setIsProfileOpen(false)} />}
    </div>
  );
};

export default SalesManagerDashboard;
