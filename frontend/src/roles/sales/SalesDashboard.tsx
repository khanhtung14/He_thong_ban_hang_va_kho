import React, { useEffect, useState, useCallback } from "react";
import { Layout } from "antd";

// Modals
import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";

// Sidebar & Header Sales
import { SalesSidebar } from "../../components/Sidebar/SalesSidebar";
import { SalesHeader } from "../../components/Header/SalesHeader";
import SalesOrderDraft from "./SalesOrderDraft";

// Customer List Module (S3-08)
import { SalesCustomerList } from "./SalesCustomerList";

// Auth & API
import { logout } from "../../services/sessionService";
import { fetchProfile, type UserProfile, type CustomerItem } from "../../services/apiClient";

const { Content } = Layout;

export const SalesDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [selectedKey, setSelectedKey] = useState("customers");

  // Trạng thái modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  const loadProfileData = useCallback(async () => {
    try {
      const data = await fetchProfile();
      if (data) {
        setProfile(data);
        localStorage.setItem("user", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Lỗi tải thông tin Sales:", err);
    }
  }, []);

  useEffect(() => {
    loadProfileData();

    const handleProfileSync = () => loadProfileData();
    window.addEventListener("profile-updated", handleProfileSync);
    window.addEventListener("storage", handleProfileSync);

    return () => {
      window.removeEventListener("profile-updated", handleProfileSync);
      window.removeEventListener("storage", handleProfileSync);
    };
  }, [loadProfileData]);

  const handleSelectCustomerForOrder = (customer: CustomerItem) => {
    // Lưu tạm khách hàng để lên đơn
    localStorage.setItem("selectedOrderCustomer", JSON.stringify(customer));
    setSelectedKey("orders");
  };

  return (
    <Layout hasSider style={{ minHeight: "100vh", position: "relative" }}>
      {/* 1. Lớp hình nền mờ */}
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
          backgroundColor: "rgba(248, 250, 252, 0.7)",
          zIndex: 0,
        }}
      />

      {/* 2. Sidebar Sales */}
      <SalesSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
      />

      {/* 3. Cột nội dung */}
      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        <SalesHeader
          fullName={profile?.full_name || "Nhân viên kinh doanh"}
          roleName={profile?.role || "Chuyên viên bán hàng"}
          avatarUrl={profile?.avatar_url}
          notificationCount={0}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
        />

        <Content
          className="sales-dashboard-content"
          style={{
            padding: "20px 28px",
            maxWidth: 1500,
            width: "100%",
            margin: "0 auto",
            minWidth: 0,
          }}
        >
          {selectedKey === "orders" ? (
            <SalesOrderDraft />
          ) : (
            /* Màn hình Khách hàng & Đại lý / Tổng quan */
            <SalesCustomerList
              currentRepName={profile?.full_name}
              onSelectCustomerForOrder={handleSelectCustomerForOrder}
            />
          )}
        </Content>
      </Layout>

      {/* Modal Hồ sơ cá nhân */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated: any) => {
          setProfile(updated);
          localStorage.setItem("user", JSON.stringify(updated));
        }}
      />

      {/* Modal Đổi mật khẩu */}
      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </Layout>
  );
};

export default SalesDashboard;
