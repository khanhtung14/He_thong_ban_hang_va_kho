import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import React, { useEffect, useState, useCallback } from "react";
import { Layout, Button, Space, Typography, Alert, message } from "antd";
import {
  FileExcelOutlined,
  PlusOutlined,
  SmileOutlined,
} from "@ant-design/icons";

// Các components Ant Design
import SalesManagerHeader from "../../components/Header/SalesManagerHeader";
import SalesManagerSidebar from "../../components/Sidebar/SalesManagerSidebar";
import StatCard from "../../components/StatCard";
import ApprovalList, { type ApprovalItem } from "./ApprovalList";
import TerritoryProgress from "./TerritoryProgress";
import CreatePriceListModal from "./CreatePriceListModal";
import ExportReportModal from "./ExportReportModal";
import CategoryManagement from "./CategoryManagement";
import SalesAssignmentManager from "./SalesAssignmentManager";
import SalesReportPage from "./SalesReportPage";
import ProductManagement from "./ProductManagement";
import ProductImportPage from "./ProductImportPage";
import ProductCatalogManagement from "./ProductCatalogManagement";
import CustomerTerritoryManagement from "./CustomerTerritoryManagement";
import DiscountPolicyManagement from "./DiscountPolicyManagement";

import { logout } from "../../services/sessionService";
import {
  fetchProfile,
  fetchSalesMarginReport,
  fetchPriceLists,
  publishPriceList,
  fetchNavigationMenu,
  type UserProfile,
  type SalesMarginReport,
  type PriceListItem,
} from "../../services/apiClient";

const { Content } = Layout;
const { Title, Text } = Typography;

export const SalesManagerDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [report, setReport] = useState<SalesMarginReport | null>(null);
  const [priceLists, setPriceLists] = useState<PriceListItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  // State điều hướng màn hình hiển thị
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== "undefined") {
      if (window.location.pathname === "/sales/assignments") return "/sales/assignments";
      if (
        window.location.pathname === "/manager/products/import-excel" ||
        window.location.pathname === "/manager/products/import"
      ) {
        return "/manager/products/import-excel";
      }
      if (window.location.pathname === "/manager/products") return "/manager/products";
      if (window.location.pathname === "/manager/categories") return "/manager/categories";
      if (window.location.pathname === "/manager/discounts") return "/manager/discounts";
      if (window.location.pathname === "/manager/reports") return "/manager/reports";
      if (window.location.pathname === "/manager/customers") return "/manager/customers";
    }
    return "/manager/dashboard";
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Trạng thái mở modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [profileData, reportData, priceListsData, navItems] =
        await Promise.allSettled([
          fetchProfile(),
          fetchSalesMarginReport(),
          fetchPriceLists(),
          fetchNavigationMenu("SALES_MANAGER"),
        ]);

      // 1. Hồ sơ người dùng
      if (profileData.status === "fulfilled") {
        setProfile(profileData.value);
      } else {
        console.error("Profile load error:", profileData.reason);
        setError("Không thể tải thông tin cá nhân từ máy chủ.");
      }

      // 2. Báo cáo doanh số & biên lợi nhuận
      if (reportData.status === "fulfilled") {
        setReport(reportData.value);
      } else {
        console.error("Report load error:", reportData.reason);
      }

      // 3. Danh sách bảng giá & Lọc đơn nháp cần duyệt
      if (priceListsData.status === "fulfilled") {
        const lists = priceListsData.value;
        setPriceLists(lists);

        const draftItems: ApprovalItem[] = lists
          .filter((p: any) => !p.published)
          .map((draft: any) => ({
            id: `pl-${draft.id}`,
            type: "price_list",
            typeLabel: "Bảng giá",
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

      // 4. Menu điều hướng
      if (navItems.status === "fulfilled" && navItems.value.length > 0) {
        // Lọc bỏ route admin, loại bỏ "Quản lý nhóm hàng" và "Bảng giá"
        const backendNavItems = navItems.value
          .filter(
            (m: any) =>
              !m.path.startsWith("/admin/") &&
              m.title !== "Quản lý nhóm hàng" &&
              m.id !== "category-management" &&
              m.id !== "pricing" &&
              m.id !== "manager-pricing" &&
              m.path !== "/manager/pricing" &&
              m.title !== "Bảng giá" &&
              m.path !== "/manager/products/import" &&
              m.id !== "excel-import" &&
              m.title !== "Nhập sản phẩm (Excel)"
          )
          .map((m: any) => ({
            id: m.id,
            title: m.path === "/manager/categories" ? "Nhóm hàng" : m.title,
            path: m.path,
            icon: m.icon,
          }));

        const hasCategoryMenu = backendNavItems.some(
          (m: any) => m.path === "/manager/categories" || m.id === "manager-categories"
        );
        const hasAssignmentMenu = backendNavItems.some(
          (m: any) => m.path === "/sales/assignments" || m.id === "sales-assignments"
        );
        const hasProductsMenu = backendNavItems.some(
          (m: any) => m.path === "/manager/products" || m.id === "manager-products"
        );

        const rawMenuItems = [
          {
            id: "home",
            title: "Trang chủ",
            path: "/manager/dashboard",
            icon: "home",
          },
          ...backendNavItems,
          ...(hasAssignmentMenu
            ? []
            : [
              {
                id: "sales-assignments",
                title: "Phân công & Bàn giao",
                path: "/sales/assignments",
                icon: "user-switch",
              },
            ]),
          ...(hasProductsMenu
            ? []
            : [
              {
                id: "manager-products",
                title: "Sản phẩm",
                path: "/manager/products",
                icon: "boxes-stacked",
              },
            ]),
          ...(hasCategoryMenu
            ? []
            : [
                {
                  id: "manager-categories",
                  title: "Nhóm hàng",
                  path: "/manager/categories",
                  icon: "appstore",
                },
              ]),
          {
            id: "manager-customers",
            title: "Đại lý & Địa bàn",
            path: "/manager/customers",
            icon: "customers",
          },
        ];

        // Đảm bảo không trùng lặp mục menu theo path, không có "Quản lý nhóm hàng" và "Nhập sản phẩm (Excel)"
        const uniqueMenuItems = rawMenuItems
          .filter(
            (item) =>
              item.title !== "Quản lý nhóm hàng" &&
              item.path !== "/manager/products/import" &&
              item.id !== "excel-import" &&
              item.title !== "Nhập sản phẩm (Excel)"
          )
          .filter(
            (item, index, self) =>
              index === self.findIndex((t) => t.path === item.path)
          );

        // Đảm bảo mục Báo cáo doanh số luôn ở cuối cùng của menu
        const nonReportItems = uniqueMenuItems.filter(
          (item) =>
            item.path !== "/manager/reports" &&
            item.id !== "reports" &&
            item.id !== "manager-sales-reports"
        );
        const reportItem = uniqueMenuItems.find(
          (item) =>
            item.path === "/manager/reports" ||
            item.id === "reports" ||
            item.id === "manager-sales-reports"
        ) || {
          id: "reports",
          title: "Báo cáo doanh số & KPI",
          path: "/manager/reports",
          icon: "chart",
        };

        setMenuItems([...nonReportItems, reportItem]);
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

  // Phê duyệt bảng giá
  const handleApprove = async (item: ApprovalItem) => {
    if (item.type === "price_list" && item.priceListId) {
      try {
        await publishPriceList(item.priceListId);
        message.success(`Đã phát hành thành công bảng giá ${item.title}!`);
        setApprovals((prev) => prev.filter((a) => a.id !== item.id));

        const updatedLists = await fetchPriceLists().catch(() => null);
        if (updatedLists) setPriceLists(updatedLists);
      } catch (err: any) {
        message.error(err.message || "Lỗi khi phát hành bảng giá");
      }
      return;
    }

    message.success(`Đã xử lý: ${item.title}`);
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Từ chối yêu cầu
  const handleReject = (item: ApprovalItem) => {
    message.info(`Đã từ chối: ${item.title}`);
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Callback khi tạo mới bảng giá thành công
  const handlePriceListCreated = async (newPriceList: PriceListItem) => {
    message.success(`Tạo thành công bảng giá nháp ${newPriceList.code}!`);
    setPriceLists((prev) => [newPriceList, ...prev]);

    if (!newPriceList.published) {
      setApprovals((prev) => [
        {
          id: `pl-${newPriceList.id}`,
          type: "price_list",
          typeLabel: "Bảng giá",
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

  // Định dạng số tiền
  const formatMoney = (val?: number) => {
    if (val === undefined || val === null) return "0 ₫";
    if (val >= 1_000_000_000) {
      return `${(val / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tỷ ₫`;
    }
    if (val >= 1_000_000) {
      return `${(val / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} Tr ₫`;
    }
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  return (
    <Layout style={{ minHeight: "100vh", position: "relative" }}>
      {/* 1. Lớp hình nền mờ giữ nguyên từ /bg.jpg */}
      <div
        style={{
          position: "fixed",
          inset: "-20px",
          backgroundImage: "url('/bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(4px)",
          transform: "scale(1.05)",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(248, 250, 252, 0.5)",
          zIndex: 0,
        }}
      />

      {/* 1. Sidebar bên trái */}
      <SalesManagerSidebar
        currentPath={currentPath}
        pendingApprovalCount={approvals.length}
        menuItems={menuItems}
        onLogout={logout}
        onNavigate={(path) => {
          if (path === "/manager/dashboard" || path === "/") {
            setCurrentPath("/manager/dashboard");
            window.history.pushState({}, "", "/manager/dashboard");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/sales/assignments") {
            setCurrentPath("/sales/assignments");
            window.history.pushState({}, "", "/sales/assignments");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/products/import-excel" || path === "/manager/products/import") {
            setCurrentPath("/manager/products/import-excel");
            window.history.pushState({}, "", "/manager/products/import-excel");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/products") {
            setCurrentPath("/manager/products");
            window.history.pushState({}, "", "/manager/products");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/categories") {
            setCurrentPath("/manager/categories");
            window.history.pushState({}, "", "/manager/categories");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/orders/approval") {
            setCurrentPath("/manager/dashboard");
            window.history.pushState({}, "", "/manager/dashboard");
            setTimeout(() => {
              const el = document.getElementById("approvals-section");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }, 100);
            // } else if (path === "/manager/pricing") {
            //   setIsCreateModalOpen(true);
          } else if (path === "/manager/reports") {
            setCurrentPath("/manager/reports");
            window.history.pushState({}, "", "/manager/reports");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            setCurrentPath(path);
            window.history.pushState({}, "", path);
          }
        }}
      />

      {/* 2. Cột nội dung bên phải */}
      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        {/* Header trên cùng */}
        <SalesManagerHeader
          fullName={profile?.full_name || "Quản lý kinh doanh"}
          roleName={profile?.role || "Quản lý kinh doanh"}
          avatarUrl={profile?.avatar_url || undefined}
          notificationCount={approvals.length}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
        />

        {/* Nội dung chính */}
        <Content
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {/* TAB 0: MÀN HÌNH PHÂN CÔNG & BÀN GIAO ĐẠI LÝ */}
          {currentPath === "/sales/assignments" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SalesAssignmentManager />
            </div>
          ) : currentPath === "/manager/products/import-excel" || currentPath === "/manager/products/import" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ProductImportPage
                onBack={() => {
                  setCurrentPath("/manager/products");
                  window.history.pushState({}, "", "/manager/products");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          ) : currentPath === "/manager/products" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <ProductManagement
                onNavigate={(path) => {
                  setCurrentPath(path);
                  window.history.pushState({}, "", path);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            </div>
          ) : currentPath === "/manager/reports" ? (
            <SalesReportPage
              reportData={report}
              loading={loading}
              onRefresh={loadDashboardData}
              onBack={() => {
                setCurrentPath("/manager/dashboard");
                window.history.pushState({}, "", "/manager/dashboard");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ) : currentPath === "/manager/categories" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CategoryManagement />
            </div>
          ) : currentPath === "/manager/customers" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <CustomerTerritoryManagement />
            </div>
          ) : currentPath === "/manager/discounts" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <DiscountPolicyManagement />
            </div>
          ) : (
            /* TAB 2: MÀN HÌNH DASHBOARD TỔNG QUAN CHÍNH */
            <Space direction="vertical" size="large" style={{ width: "100%" }}>
              {/* Cảnh báo lỗi nếu có */}
              {error && (
                <Alert
                  message="Lỗi kết nối"
                  description={error}
                  type="error"
                  showIcon
                  closable
                  onClose={() => setError("")}
                />
              )}

              {/* Khối tiêu đề chào mừng & Nút thao tác nhanh */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                }}
              >
                <div>
                  <Title
                    level={2}
                    style={{ margin: 0, letterSpacing: "-0.5px" }}
                  >
                    Xin chào, {profile?.full_name || "Quản lý kinh doanh"}{" "}
                    <SmileOutlined style={{ color: "#faad14" }} />
                  </Title>
                  <Text
                    type="secondary"
                    style={{ fontSize: 13, marginTop: 4, display: "block" }}
                  >
                    Bàn làm việc Quản lý Kinh doanh · Giám sát doanh số, duyệt
                    đơn và quản lý <Text strong>{priceLists.length}</Text> bảng
                    giá niêm yết
                  </Text>
                </div>

                <Space size="middle">
                  <Button
                    icon={<FileExcelOutlined />}
                    onClick={() => {
                      setCurrentPath("/manager/reports");
                      window.history.pushState({}, "", "/manager/reports");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    style={{ borderRadius: 8, height: 38 }}
                  >
                    Báo cáo doanh số
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setIsCreateModalOpen(true)}
                    style={{ borderRadius: 8, height: 38 }}
                  >
                    Tạo bảng giá mới
                  </Button>
                </Space>
              </div>

              {/* Dòng 4 thẻ StatCard KPI */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 16,
                }}
              >
                <StatCard
                  title="Doanh thu toàn kênh"
                  value={formatMoney(report?.total_revenue)}
                  target={report?.period ? `Kỳ: ${report.period}` : undefined}
                  subText={
                    report && report.total_revenue > 0
                      ? "Doanh số lũy kế ghi nhận"
                      : "Chưa phát sinh doanh số"
                  }
                  tagText={report?.period || undefined}
                  iconType="trend-up"
                  loading={loading}
                />

                <StatCard
                  title="Biên lợi nhuận gộp"
                  value={report?.margin || "0%"}
                  badgeText={
                    report && report.total_revenue > 0
                      ? "Định mức hệ thống"
                      : undefined
                  }
                  badgeTone="green"
                  subText={
                    report && report.total_revenue > 0
                      ? "Tính trên giá vốn & doanh thu"
                      : "Chưa có phát sinh"
                  }
                  iconType="shield"
                  loading={loading}
                />

                <StatCard
                  title="Lợi nhuận gộp"
                  value={formatMoney(report?.gross_profit)}
                  badgeText={
                    report && report.gross_profit > 0
                      ? "Doanh thu - Giá vốn"
                      : undefined
                  }
                  badgeTone="green"
                  subText={
                    report && report.total_cogs > 0
                      ? `Giá vốn: ${formatMoney(report.total_cogs)}`
                      : "Chưa phát sinh giá vốn"
                  }
                  iconType="clock"
                  loading={loading}
                />

                <StatCard
                  title="Bảng giá & Đơn chờ duyệt"
                  value={`${String(approvals.length).padStart(2, "0")} Cần xử lý`}
                  badgeText={approvals.length > 0 ? "Cần xử lý" : "Trống"}
                  badgeTone={approvals.length > 0 ? "rose" : "green"}
                  subText={
                    approvals.length > 0
                      ? "Bảng giá nháp chờ phát hành"
                      : "Không có yêu cầu chờ duyệt"
                  }
                  iconType="alert"
                  isUrgent={approvals.length > 0}
                  loading={loading}
                />
              </div>

              {/* Khu vực nội dung chính */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 24,
                  alignItems: "start",
                }}
              >
                <div id="approvals-section" style={{ gridColumn: "span 7" }}>
                  <ApprovalList
                    items={approvals}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onViewAll={() =>
                      message.info(
                        `Tổng cộng ${approvals.length} yêu cầu đang chờ bạn xử lý`,
                      )
                    }
                    loading={loading}
                  />
                </div>

                <div style={{ gridColumn: "span 5" }}>
                  <TerritoryProgress
                    area={profile?.area}
                    productMargins={report?.details}
                    loading={loading}
                  />
                </div>
              </div>
            </Space>
          )}
        </Content>
      </Layout>

      {/* Modal Khai báo Bảng giá */}
      <CreatePriceListModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handlePriceListCreated}
      />

      {/* Modal Xuất Báo cáo */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        reportData={report}
      />

      {/* Modal Hồ sơ cá nhân */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated) => setProfile(updated)}
      />

      {/* Modal Đổi mật khẩu */}
      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </Layout>
  );
};

export default SalesManagerDashboard;
