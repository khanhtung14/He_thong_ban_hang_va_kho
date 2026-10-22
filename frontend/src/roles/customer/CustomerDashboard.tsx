import React, { useEffect, useState, useCallback } from "react";
import { Layout } from "antd";

import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import { CustomerSidebar } from "../../components/Sidebar/CustomerSidebar";
import { CustomerHeader } from "../../components/Header/CustomerHeader";

import { logout } from "../../services/sessionService";
import { fetchProfile, type UserProfile } from "../../services/apiClient";
import DeliveryTracking from "./DeliveryTracking";
import "./DeliveryTracking.css";

const { Content } = Layout;

export const CustomerDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [selectedKey, setSelectedKey] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [, setLoading] = useState(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProfile();
      if (data) {
        setProfile(data);
        localStorage.setItem("user", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Lỗi tải thông tin đại lý:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadProfileData);

    const handleProfileSync = () => loadProfileData();
    window.addEventListener("profile-updated", handleProfileSync);
    window.addEventListener("storage", handleProfileSync);

    return () => {
      window.removeEventListener("profile-updated", handleProfileSync);
      window.removeEventListener("storage", handleProfileSync);
    };
  }, [loadProfileData]);

  return (
    <Layout hasSider className="customer-dashboard-shell">
      <CustomerSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        fullName={profile?.full_name || "Đại lý khách hàng"}
        roleName={profile?.role || "Đại lý / Khách hàng"}
      />

      <Layout className="customer-dashboard-main">
        <CustomerHeader
          fullName={profile?.full_name || "Đại lý khách hàng"}
          roleName={profile?.role || "Đại lý / Khách hàng"}
          avatarUrl={profile?.avatar_url}
          notificationCount={0}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
          onMenuClick={() => setMobileMenuOpen(true)}
          pageTitle={selectedKey === "delivery-tracking" ? "Theo dõi giao hàng" : "Tổng quan đại lý"}
        />

        <Content className="customer-dashboard-content">
          {selectedKey === "delivery-tracking" ? <DeliveryTracking /> : null}
        </Content>
      </Layout>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated: UserProfile) => {
          setProfile(updated);
          localStorage.setItem("user", JSON.stringify(updated));
        }}
      />

      <ChangePasswordModal
        isOpen={isChangePassModalOpen}
        onClose={() => setIsChangePassModalOpen(false)}
      />
    </Layout>
  );
};

export default CustomerDashboard;
