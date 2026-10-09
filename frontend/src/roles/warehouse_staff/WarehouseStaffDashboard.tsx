import React, { useEffect, useState, useCallback } from "react";
import { Layout } from "antd";

import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import { WarehouseStaffSidebar } from "../../components/Sidebar/WarehouseStaffSidebar";
import { WarehouseStaffHeader } from "../../components/Header/WarehouseStaffHeader";

import { logout } from "../../session";
import { fetchProfile, type UserProfile } from "../../api";

const { Content } = Layout;

export const WarehouseStaffDashboard: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [selectedKey, setSelectedKey] = useState("scan");
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
      console.error("Lỗi tải thông tin nhân viên kho:", err);
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
    <Layout hasSider style={{ minHeight: "100vh", backgroundColor: "#f8fafc" }}>
      <WarehouseStaffSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
      />

      <Layout style={{ backgroundColor: "#f8fafc", minWidth: 0 }}>
        <WarehouseStaffHeader
          fullName={profile?.full_name || "Nhân viên kho"}
          roleName={profile?.role || "Nhân viên tác nghiệp"}
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
          {/* Màn hình thao tác quét mã, thực hiện nhập xuất */}
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

export default WarehouseStaffDashboard;
