import React, { useEffect, useState, useCallback } from "react";
import { Layout, Typography, Card } from "antd";

import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import { CustomerSidebar } from "../../components/Sidebar/CustomerSidebar";
import { CustomerHeader } from "../../components/Header/CustomerHeader";
import { CustomerOrders } from "./CustomerOrders";

import { logout } from "../../services/sessionService";
import { fetchProfile, type UserProfile } from "../../services/apiClient";

const { Content } = Layout;
const { Title, Text } = Typography;

export const CustomerDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const getInitialKey = () => {
    const p = window.location.pathname;
    if (p.includes("/portal/orders")) return "orders";
    if (p.includes("/portal/products") || p.includes("/portal/catalog")) return "catalog";
    if (p.includes("/portal/debt")) return "debt";
    if (p.includes("/portal/contracts")) return "contracts";
    return "orders";
  };

  const [selectedKey, setSelectedKey] = useState<string>(getInitialKey);
  const [, setLoading] = useState(false);

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  const handleSelectKey = (key: string) => {
    setSelectedKey(key);
    if (key === "orders" || key === "dashboard") {
      window.history.pushState(null, "", "/portal/orders");
    } else if (key === "catalog") {
      window.history.pushState(null, "", "/portal/products");
    } else if (key === "debt") {
      window.history.pushState(null, "", "/portal/debt");
    } else if (key === "contracts") {
      window.history.pushState(null, "", "/portal/contracts");
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setSelectedKey(getInitialKey());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
    loadProfileData();

    const handleProfileSync = () => loadProfileData();
    window.addEventListener("profile-updated", handleProfileSync);
    window.addEventListener("storage", handleProfileSync);

    return () => {
      window.removeEventListener("profile-updated", handleProfileSync);
      window.removeEventListener("storage", handleProfileSync);
    };
  }, [loadProfileData]);

  return (
    <Layout hasSider style={{ minHeight: "100vh", position: "relative" }}>
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

      <CustomerSidebar
        selectedKey={selectedKey}
        onSelect={handleSelectKey}
        onLogout={logout}
      />

      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        <CustomerHeader
          fullName={profile?.full_name || "Đại lý khách hàng"}
          roleName={profile?.role || "Đại lý / Khách hàng"}
          avatarUrl={profile?.avatar_url}
          notificationCount={0}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
        />

        <Content
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {selectedKey === "orders" || selectedKey === "dashboard" ? (
            <CustomerOrders onNavigateToProducts={() => handleSelectKey("catalog")} />
          ) : selectedKey === "catalog" ? (
            <Card
              style={{
                borderRadius: 14,
                border: "1px solid #e2e8f0",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                backgroundColor: "#ffffff",
                padding: "24px",
              }}
            >
              <Title level={4} style={{ color: "#1e293b", marginTop: 0 }}>
                Đặt hàng / Danh mục sản phẩm
              </Title>
              <Text type="secondary">
                Tính năng đặt hàng trực tiếp từ cổng đại lý đang được cập nhật. Bạn có thể theo dõi tiến độ các đơn hàng đã đặt tại mục "Đơn hàng của tôi".
              </Text>
            </Card>
          ) : (
            <CustomerOrders onNavigateToProducts={() => handleSelectKey("catalog")} />
          )}
        </Content>
      </Layout>

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(updated: any) => {
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
