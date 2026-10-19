import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import React, { useEffect, useState, useCallback } from "react";
import { Layout, Button, Space, Typography, Alert, message, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileExcelOutlined,
  PlusOutlined,
  SmileOutlined,
  TagOutlined,
  EditOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

// Các components Ant Design
import SalesManagerHeader from "../../components/Header/SalesManagerHeader";
import SalesManagerSidebar from "../../components/Sidebar/SalesManagerSidebar";
import StatCard from "../../components/StatCard";
import ApprovalList, { type ApprovalItem } from "./ApprovalList";
import TerritoryProgress from "./TerritoryProgress";
import CreatePriceListModal from "./CreatePriceListModal";
import PriceListDetailModal from "./PriceListDetailModal";
import ExportReportModal from "./ExportReportModal";
import CategoryManagement from "./CategoryManagement";
import SalesAssignmentManager from "./SalesAssignmentManager";
import SalesReportPage from "./SalesReportPage";
import ProductManagement from "./ProductManagement";
import ProductImportPage from "./ProductImportPage";
import ProductCatalogManagement from "./ProductCatalogManagement";
import ProductExcelImport from "./ProductExcelImport";
import CustomerTerritoryManagement from "./CustomerTerritoryManagement";
import DiscountPolicyManagement from "./DiscountPolicyManagement";
import OrderDetailModal from "./OrderDetailModal";

import { logout } from "../../services/sessionService";
import {
  fetchProfile,
  fetchSalesMarginReport,
  fetchPriceLists,
  publishPriceList,
  fetchOrdersPendingApproval,
  approveOrder,
  rejectOrder,
  fetchNavigationMenu,
  type UserProfile,
  type SalesMarginReport,
  type PriceListItem,
  type OrderResponseItem,
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

      if (window.location.pathname === "/manager/orders/approval") return "/manager/orders/approval";
      if (window.location.pathname === "/manager/pricing") return "/manager/pricing";
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
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<OrderResponseItem | null>(null);
  const [selectedOrderIdForDetail, setSelectedOrderIdForDetail] = useState<number | null>(null);

  // Trạng thái modal xem chi tiết & điều chỉnh bảng giá
  const [isPriceListDetailModalOpen, setIsPriceListDetailModalOpen] = useState(false);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number | null>(null);

  const handleViewPriceList = (id: number) => {
    setSelectedPriceListId(id);
    setIsPriceListDetailModalOpen(true);
  };

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [profileData, reportData, priceListsData, pendingOrdersData, navItems] =
        await Promise.allSettled([
          fetchProfile(),
          fetchSalesMarginReport(),
          fetchPriceLists(),
          fetchOrdersPendingApproval(),
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

      // 3. Danh sách đơn hàng & bảng giá chờ duyệt
      const allApprovals: ApprovalItem[] = [];

      // 3a. Đơn hàng chờ duyệt (PENDING / PENDING_APPROVAL)
      if (pendingOrdersData.status === "fulfilled" && Array.isArray(pendingOrdersData.value)) {
        const orderApprovals: ApprovalItem[] = pendingOrdersData.value.map((ord: OrderResponseItem) => {
          const isBelowFloor = ord.approval_reason && ord.approval_reason.toLowerCase().includes("dưới giá sàn");
          return {
            id: `ord-${ord.id}`,
            type: (isBelowFloor ? "below_floor" : "order") as ApprovalItem["type"],
            typeLabel: isBelowFloor ? "Dưới giá sàn" : "Đơn hàng",
            title: `Đơn hàng ${ord.order_code} - ${ord.customer_name || `Đại lý #${ord.customer_id}`}`,
            reason: ord.approval_reason || "Đơn hàng mới chờ Quản lý phê duyệt",
            amount: `${(ord.total_amount || 0).toLocaleString("vi-VN")} ₫`,
            code: ord.order_code,
            assigneeLabel: "Khách hàng",
            assigneeName: ord.customer_name || `Đại lý #${ord.customer_id}`,
            approveActionLabel: "Phê duyệt đơn",
            orderId: ord.id,
            orderData: ord,
          };
        });
        allApprovals.push(...orderApprovals);
      } else if (pendingOrdersData.status === "rejected") {
        console.error("Pending orders load error:", pendingOrdersData.reason);
      }

      // 3b. Bảng giá nháp chờ phát hành
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

        allApprovals.push(...draftItems);
      } else {
        console.error("Price lists load error:", priceListsData.reason);
      }

      setApprovals(allApprovals);

      // 4. Menu điều hướng
      if (navItems.status === "fulfilled" && navItems.value.length > 0) {
        // Lọc bỏ route admin, loại bỏ "Quản lý nhóm hàng" cũ
        const backendNavItems = navItems.value
          .filter(
            (m: any) =>
              !m.path.startsWith("/admin/") &&
              m.title !== "Quản lý nhóm hàng" &&
              m.id !== "category-management" &&
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
        const hasPricingMenu = backendNavItems.some(
          (m: any) => m.path === "/manager/pricing" || m.id === "manager-pricing"
        );
        const hasDiscountsMenu = backendNavItems.some(
          (m: any) => m.path === "/manager/discounts" || m.id === "manager-discounts"
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
          ...(hasDiscountsMenu
            ? []
            : [
                {
                  id: "manager-discounts",
                  title: "Chính sách chiết khấu",
                  path: "/manager/discounts",
                  icon: "percentage",
                },
              ]),
          ...(hasPricingMenu
            ? []
            : [
                {
                  id: "manager-pricing",
                  title: "Bảng giá",
                  path: "/manager/pricing",
                  icon: "tag",
                },
              ]),
          {
            id: "manager-customers",
            title: "Đại lý & Địa bàn",
            path: "/manager/customers",
            icon: "customers",
          },
          {
            id: "reports",
            title: "Báo cáo doanh số & KPI",
            path: "/manager/reports",
            icon: "chart",
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

  // Phê duyệt yêu cầu (Bảng giá hoặc Đơn hàng)
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

    if (item.orderId) {
      try {
        await approveOrder(item.orderId);
        message.success(`Đã phê duyệt thành công đơn hàng ${item.code}!`);
        setApprovals((prev) => prev.filter((a) => a.id !== item.id));
      } catch (err: any) {
        message.error(err.message || "Lỗi khi phê duyệt đơn hàng");
      }
      return;
    }

    message.success(`Đã xử lý: ${item.title}`);
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Từ chối yêu cầu
  const handleReject = async (item: ApprovalItem) => {
    if (item.orderId) {
      try {
        await rejectOrder(item.orderId);
        message.info(`Đã từ chối đơn hàng ${item.code}`);
        setApprovals((prev) => prev.filter((a) => a.id !== item.id));
      } catch (err: any) {
        message.error(err.message || "Lỗi khi từ chối đơn hàng");
      }
      return;
    }

    message.info(`Đã từ chối: ${item.title}`);
    setApprovals((prev) => prev.filter((a) => a.id !== item.id));
  };

  // Xem chi tiết đơn hàng
  const handleViewOrderDetail = (item: ApprovalItem) => {
    if (item.orderId) {
      setSelectedOrderIdForDetail(item.orderId);
      setSelectedOrderForDetail(item.orderData || null);
      setIsDetailModalOpen(true);
    }
  };

  const handleApproveFromModal = async (order: OrderResponseItem) => {
    try {
      await approveOrder(order.id);
      message.success(`Đã phê duyệt thành công đơn hàng ${order.order_code}!`);
      setApprovals((prev) => prev.filter((a) => a.orderId !== order.id));
      setIsDetailModalOpen(false);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi phê duyệt đơn hàng");
    }
  };

  const handleRejectFromModal = async (order: OrderResponseItem, reason?: string) => {
    try {
      await rejectOrder(order.id, reason || "Quản lý kinh doanh từ chối đơn hàng");
      message.info(`Đã từ chối đơn hàng ${order.order_code}`);
      setApprovals((prev) => prev.filter((a) => a.orderId !== order.id));
      setIsDetailModalOpen(false);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi từ chối đơn hàng");
    }
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
            setCurrentPath("/manager/orders/approval");
            window.history.pushState({}, "", "/manager/orders/approval");
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else if (path === "/manager/pricing") {
            setCurrentPath("/manager/pricing");
            window.history.pushState({}, "", "/manager/pricing");
            window.scrollTo({ top: 0, behavior: "smooth" });
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
          ) : currentPath === "/manager/pricing" ? (
            /* TAB: QUẢN LÝ BẢNG GIÁ NIÊM YẾT */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <Title level={3} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <TagOutlined style={{ color: "#2563eb" }} />
                    Quản lý Bảng giá Niêm yết
                  </Title>
                  <Text type="secondary">
                    Quản lý các bảng giá bán và giá sàn áp dụng cho từng nhóm khách hàng đại lý ({priceLists.length} bảng giá).
                  </Text>
                </div>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={loadDashboardData} loading={loading}>
                    Làm mới
                  </Button>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setIsCreateModalOpen(true)}
                    style={{ backgroundColor: "#2563eb", borderRadius: 6 }}
                  >
                    Tạo bảng giá mới
                  </Button>
                </Space>
              </div>

              <Table
                dataSource={priceLists}
                rowKey="id"
                bordered
                loading={loading}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: "MÃ BẢNG GIÁ",
                    dataIndex: "code",
                    key: "code",
                    width: 190,
                    render: (code: string, record: PriceListItem) => (
                      <Tooltip title="Bấm để xem chi tiết và điều chỉnh bảng giá">
                        <Button
                          type="link"
                          onClick={() => handleViewPriceList(record.id)}
                          style={{
                            fontWeight: 700,
                            padding: 0,
                            height: "auto",
                            fontSize: 14,
                            color: "#1d4ed8",
                          }}
                        >
                          {code}
                        </Button>
                      </Tooltip>
                    ),
                  },
                  {
                    title: "PHIÊN BẢN",
                    dataIndex: "version",
                    key: "version",
                    width: 100,
                    align: "center",
                    render: (ver: number) => <Tag color="blue">v{ver || 1}</Tag>,
                  },
                  {
                    title: "NHÓM KHÁCH HÀNG",
                    dataIndex: "customer_group",
                    key: "customer_group",
                    width: 170,
                    render: (group: string) => {
                      const text =
                        group === "DEALER_LEVEL_1"
                          ? "Đại lý Cấp 1"
                          : group === "DEALER_LEVEL_2"
                          ? "Đại lý Cấp 2"
                          : group === "RETAIL"
                          ? "Khách lẻ / Bán buôn"
                          : group;
                      return <Tag color="geekblue" style={{ fontWeight: 600 }}>{text}</Tag>;
                    },
                  },
                  {
                    title: "THỜI HẠN HIỆU LỰC",
                    key: "period",
                    width: 220,
                    render: (_, r: PriceListItem) => (
                      <Text style={{ fontSize: 13 }}>
                        {r.start_date || "—"} đến {r.end_date || "—"}
                      </Text>
                    ),
                  },
                  {
                    title: "SỐ LƯỢNG SKU",
                    key: "items_count",
                    width: 130,
                    align: "center",
                    render: (_, r: PriceListItem) => (
                      <Tag color="cyan" style={{ fontWeight: 600 }}>
                        {r.items?.length || 0} SKUs
                      </Tag>
                    ),
                  },
                  {
                    title: "TRẠNG THÁI",
                    dataIndex: "published",
                    key: "published",
                    width: 140,
                    align: "center",
                    render: (pub: boolean) =>
                      pub ? (
                        <Tag color="success" style={{ fontWeight: 700 }}>
                          ĐÃ PHÁT HÀNH
                        </Tag>
                      ) : (
                        <Tag color="warning" style={{ fontWeight: 700 }}>
                          BẢN NHÁP
                        </Tag>
                      ),
                  },
                  {
                    title: "THAO TÁC",
                    key: "action",
                    width: 180,
                    align: "center",
                    render: (_, r: PriceListItem) => (
                      <Space size="small">
                        <Button
                          size="small"
                          type="default"
                          icon={<EditOutlined />}
                          onClick={() => handleViewPriceList(r.id)}
                          style={{
                            borderRadius: 6,
                            borderColor: "#bfdbfe",
                            color: "#2563eb",
                            fontWeight: 600,
                          }}
                        >
                          Chi tiết & Sửa
                        </Button>
                        {!r.published && (
                          <Button
                            size="small"
                            type="primary"
                            icon={<CheckCircleOutlined />}
                            onClick={async () => {
                              try {
                                await publishPriceList(r.id);
                                message.success(`Phát hành bảng giá ${r.code} thành công!`);
                                loadDashboardData();
                              } catch (err: any) {
                                message.error(err.message || "Không thể phát hành bảng giá.");
                              }
                            }}
                            style={{
                              backgroundColor: "#16a34a",
                              borderColor: "#16a34a",
                              borderRadius: 6,
                            }}
                          >
                            Phát hành
                          </Button>
                        )}
                      </Space>
                    ),
                  },
                ]}
              />
            </div>
          ) : currentPath === "/manager/orders/approval" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <Title level={3} style={{ margin: 0 }}>
                    Phê duyệt đơn hàng & Bảng giá
                  </Title>
                  <Text type="secondary">
                    Danh sách các đơn hàng và bảng giá đang chờ Quản lý kinh doanh phê duyệt ({approvals.length} yêu cầu cần xử lý).
                  </Text>
                </div>
                <Button onClick={loadDashboardData} loading={loading}>
                  Làm mới
                </Button>
              </div>
              <ApprovalList
                items={approvals}
                onApprove={handleApprove}
                onReject={handleReject}
                onViewDetail={handleViewOrderDetail}
                onViewPriceList={handleViewPriceList}
                onViewAll={() =>
                  message.info(
                    `Tổng cộng ${approvals.length} yêu cầu đang chờ bạn xử lý`,
                  )
                }
                loading={loading}
              />
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
                      ? `${approvals.filter((a) => a.orderId).length} đơn hàng, ${
                          approvals.filter((a) => a.priceListId).length
                        } bảng giá`
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
                    onViewDetail={handleViewOrderDetail}
                    onViewPriceList={handleViewPriceList}
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

      {/* Modal Xem chi tiết đơn hàng trước khi phê duyệt */}
      <OrderDetailModal
        isOpen={isDetailModalOpen}
        orderId={selectedOrderIdForDetail}
        initialOrder={selectedOrderForDetail}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedOrderForDetail(null);
          setSelectedOrderIdForDetail(null);
        }}
        onApprove={handleApproveFromModal}
        onReject={handleRejectFromModal}
      />

      {/* Modal Xem chi tiết & Điều chỉnh Bảng giá */}
      <PriceListDetailModal
        isOpen={isPriceListDetailModalOpen}
        priceListId={selectedPriceListId}
        onClose={() => {
          setIsPriceListDetailModalOpen(false);
          setSelectedPriceListId(null);
        }}
        onUpdated={() => {
          loadDashboardData();
        }}
        onPublished={() => {
          loadDashboardData();
        }}
      />
    </Layout>
  );
};

export default SalesManagerDashboard;
