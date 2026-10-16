import React from "react";
import { Layout, Menu, Badge, Button } from "antd";
import type { MenuProps } from "antd";
import {
  HomeOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  TagsOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  InboxOutlined,
  AppstoreOutlined,
  LogoutOutlined,
  UserSwitchOutlined,
  FileExcelOutlined,
  PercentageOutlined,
} from "@ant-design/icons";
import BrandLogo from "components/BrandLogo";

const { Sider } = Layout;

export interface MenuItem {
  id: string;
  title: string;
  path: string;
  icon?: string;
  badge?: number | string;
}

export interface SidebarProps {
  currentPath?: string;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
  pendingApprovalCount?: number;
  menuItems?: MenuItem[];
}

export const SalesManagerSidebar: React.FC<SidebarProps> = ({
  currentPath = "/manager/dashboard",
  onNavigate,
  onLogout,
  pendingApprovalCount = 3,
  menuItems: customMenuItems,
}) => {
  const defaultMenuItems: MenuItem[] = [
    {
      id: "home",
      title: "Trang chủ",
      path: "/manager/dashboard",
      icon: "home",
    },
    {
      id: "approvals",
      title: "Phê duyệt đơn hàng",
      path: "/manager/orders/approval",
      icon: "approval",
      badge: pendingApprovalCount,
    },
    {
      id: "manager-products",
      title: "Sản phẩm",
      path: "/manager/products",
      icon: "boxes-stacked",
    },
    {
      id: "manager-customers",
      title: "Đại lý & Địa bàn",
      path: "/manager/customers",
      icon: "customers",
    },
    {
      id: "manager-categories",
      title: "Nhóm hàng",
      path: "/manager/categories",
      icon: "appstore",
    },
    {
      id: "manager-discounts",
      title: "Chính sách chiết khấu",
      path: "/manager/discounts",
      icon: "percentage",
    },
    {
      id: "reports",
      title: "Báo cáo doanh số & KPI",
      path: "/manager/reports",
      icon: "chart",
    },
  ];

  const baseItems: MenuItem[] = (
    customMenuItems && customMenuItems.length > 0
      ? customMenuItems
      : defaultMenuItems
  ).filter(
    (item) => item.path !== "/sales/assignments" && item.id !== "sales-assignments"
  );

  // Đảm bảo mục "Sản phẩm" luôn luôn có mặt trong menu của Sales Manager
  const hasProducts = baseItems.some(
    (item) => item.path === "/manager/products" || item.id === "manager-products"
  );
  if (!hasProducts) {
    const insertIdx = baseItems.findIndex(
      (item) => item.path === "/manager/orders/approval"
    );
    const productItem: MenuItem = {
      id: "manager-products",
      title: "Sản phẩm",
      path: "/manager/products",
      icon: "boxes-stacked",
    };
    if (insertIdx !== -1) {
      baseItems.splice(insertIdx + 1, 0, productItem);
    } else {
      baseItems.push(productItem);
    }
  }

  // Đảm bảo mục "Chính sách chiết khấu" luôn luôn có mặt trong menu của Sales Manager
  const hasDiscounts = baseItems.some(
    (item) => item.path === "/manager/discounts" || item.id === "manager-discounts"
  );
  if (!hasDiscounts) {
    const insertIdx = baseItems.findIndex(
      (item) => item.path === "/manager/categories"
    );
    const discountItem: MenuItem = {
      id: "manager-discounts",
      title: "Chính sách chiết khấu",
      path: "/manager/discounts",
      icon: "percentage",
    };
    if (insertIdx !== -1) {
      baseItems.splice(insertIdx + 1, 0, discountItem);
    } else {
      baseItems.push(discountItem);
    }
  }

  // Lọc bỏ các mục không dùng (Bảng giá, Quản lý nhóm hàng cũ, Nhập sản phẩm Excel) và deduplicate
  const filteredItems = baseItems
    .filter(
      (item) =>
        item.title !== "Quản lý nhóm hàng" &&
        item.id !== "category-management" &&
        item.id !== "pricing" &&
        item.id !== "manager-pricing" &&
        item.path !== "/manager/pricing" &&
        item.title !== "Bảng giá" &&
        item.title !== "Chính sách giá & Chiết khấu" &&
        item.path !== "/manager/products/import" &&
        item.id !== "excel-import" &&
        item.title !== "Nhập sản phẩm (Excel)"
    )
    .filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.path === item.path)
    );

  // Đảm bảo mục "Báo cáo doanh số" (Reports) LUÔN NẰM Ở VỊ TRÍ CUỐI CÙNG của danh sách Menu nghiệp vụ
  const nonReportItems = filteredItems.filter(
    (item) =>
      item.path !== "/manager/reports" &&
      item.id !== "reports" &&
      item.id !== "manager-sales-reports"
  );
  const reportItem = filteredItems.find(
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

  const menuItems = [...nonReportItems, reportItem];

  const getIcon = (icon?: string) => {
    switch (icon) {
      case "home":
        return <HomeOutlined />;
      case "approval":
      case "clipboard-check":
        return <CheckCircleOutlined />;
      case "chart":
      case "bar-chart":
        return <BarChartOutlined />;
      case "excel":
      case "import":
        return <FileExcelOutlined />;
      case "appstore":
      case "category":
      case "categories":
      case "folder-tree":
        return <AppstoreOutlined />;
      case "user-switch":
      case "sales-assignments":
      case "team":
      case "users":
        return <UserSwitchOutlined />;
      case "tag":
        return <TagsOutlined />;
      case "shopping-cart":
      case "orders":
        return <ShoppingCartOutlined />;
      case "building":
      case "customers":
        return <ShopOutlined />;
      case "boxes-stacked":
      case "inventory":
        return <InboxOutlined />;
      case "percentage":
      case "discount":
      case "discounts":
        return <PercentageOutlined />;
      default:
        return <AppstoreOutlined />;
    }
  };

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.pathname = path;
    }
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = "/login";
    }
  };

  const antMenuItems: MenuProps["items"] = menuItems.map((item) => ({
    key: item.path,
    icon: getIcon(item.icon),
    label: (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
        }}
      >
        <span>{item.title}</span>
        {item.badge !== undefined && Number(item.badge) > 0 && (
          <Badge
            count={Number(item.badge)}
            overflowCount={99}
            style={{
              backgroundColor: "#ff4d4f",
              boxShadow: "none",
              fontSize: 11,
            }}
          />
        )}
      </div>
    ),
    onClick: () => handleNavigate(item.path),
  }));

  const selectedKey = currentPath === "/" ? "/manager/dashboard" : currentPath;

  return (
    <Sider
      width={260}
      theme="light"
      style={{
        borderRight: "1px solid #f0f0f0",
        height: "100vh",
        position: "sticky",
        top: 0,
        left: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
      }}
    >
      <div style={{ flex: 1, overflowY: "auto", background: "#ffffff" }}>
        {/* Logo OMS & Icon ngôi nhà nguyên bản */}
        <BrandLogo></BrandLogo>

        {/* Tiêu đề nhóm Menu */}
        <div
          style={{
            padding: "16px 20px 8px",
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Menu
        </div>

        {/* Danh sách Menu */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={antMenuItems}
          style={{
            borderRight: "none",
            padding: "0 10px",
            background: "#ffffff",
          }}
        />
      </div>

      {/* Phần chân trang: Đồng bộ 100% nền trắng (#ffffff), liền mạch tuyệt đối */}
      <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#94a3b8",
            letterSpacing: "0.06em",
            padding: "0 12px",
            marginBottom: 8,
          }}
        >
          HỆ THỐNG
        </div>

        <Button
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          block
          style={{
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            height: 40,
            borderRadius: 8,
            fontWeight: 500,
          }}
        >
          Đăng xuất
        </Button>
      </div>
    </Sider>
  );
};

export default SalesManagerSidebar;
