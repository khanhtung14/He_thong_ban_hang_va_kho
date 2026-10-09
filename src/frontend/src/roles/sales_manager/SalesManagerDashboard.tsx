import React, { useEffect, useState, useCallback } from "react";
import HeaderTailwind from "../../components/Header/HeaderTailwind";
import SidebarTailwind from "../../components/Sidebar/SidebarTailwind";
import StatCard from "../../components/StatCard";
import ApprovalList, { type ApprovalItem } from "./ApprovalList";
import TerritoryProgress from "./TerritoryProgress";
import CreatePriceListModal from "./CreatePriceListModal";
import ExportReportModal from "./ExportReportModal";
import { logout } from "../../session";
import {
  fetchProfile,
  fetchSalesMarginReport,
  fetchPriceLists,
  publishPriceList,
  fetchNavigationMenu,
  type UserProfile,
  type SalesMarginReport,
  type PriceListItem,
} from "../../api";

export const SalesManagerDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [report, setReport] = useState<SalesMarginReport | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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
      const [profileData, reportData, priceListsData, navItems] = await Promise.allSettled([
        fetchProfile(),
        fetchSalesMarginReport(),
        fetchPriceLists(),
        fetchNavigationMenu("SALES_MANAGER"),
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

  // Handle Approve action: Calls real API POST /api/v1/price-lists/{price_list_id}/publish
  const handleApprove = async (item: ApprovalItem) => {
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
  const handleReject = (item: ApprovalItem) => {
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
        currentPath="/manager/dashboard"
        pendingApprovalCount={approvals.length}
        menuItems={menuItems}
        onLogout={logout}
        onNavigate={(path) => {
          if (path === "/manager/dashboard" || path === "/") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/orders/approval") {
            const el = document.getElementById("approvals-section");
            if (el) el.scrollIntoView({ behavior: "smooth" });
            else window.location.assign(path);
          } else if (path === "/manager/pricing") {
            setIsCreateModalOpen(true);
          } else if (path === "/manager/reports") {
            setIsExportModalOpen(true);
          } else {
            window.location.assign(path);
          }
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
          onProfileClick={() => window.location.assign("/profile")}
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
                onClick={() => setIsCreateModalOpen(true)}
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
        </main>
      </div>

      {/* Modals */}
      <CreatePriceListModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handlePriceListCreated}
      />

      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        reportData={report}
      />
    </div>
  );
};

export default SalesManagerDashboard;
