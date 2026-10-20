import React, { useEffect, useState, useCallback } from "react";
import { Layout } from "antd";

import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";
import { WarehouseStaffSidebar } from "../../components/Sidebar/WarehouseStaffSidebar";
import { WarehouseStaffHeader } from "../../components/Header/WarehouseStaffHeader";
import UnitConversionManager from "./UnitConversionManager";
import SupplierManagement from "./SupplierManagement";
import InternalTransferManager from "./InternalTransferManager";

import { logout } from "../../services/sessionService";
import { fetchProfile, type UserProfile } from "../../services/apiClient";

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

  const [selectedKey, setSelectedKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = window.location.pathname;
      if (p === "/warehouse/suppliers") return "suppliers";
      if (p === "/warehouse/inventory") return "unit-conversion";
      if (p === "/warehouse/transfers") return "internal-transfers";
      if (p === "/warehouse/receiving") return "inbound";
      if (p === "/warehouse/picking") return "outbound";
    }
    return "suppliers";
  });
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

  useEffect(() => {
    const handlePopState = () => {
      const p = window.location.pathname;
      if (p === "/warehouse/suppliers") setSelectedKey("suppliers");
      else if (p === "/warehouse/inventory") setSelectedKey("unit-conversion");
      else if (p === "/warehouse/receiving") setSelectedKey("inbound");
      else if (p === "/warehouse/picking") setSelectedKey("outbound");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

      <WarehouseStaffSidebar
        selectedKey={selectedKey}
        onSelect={(key) => {
          setSelectedKey(key);
          if (key === "suppliers") {
            window.history.pushState({}, "", "/warehouse/suppliers");
          } else if (key === "unit-conversion") {
            window.history.pushState({}, "", "/warehouse/inventory");
          } else if (key === "inbound") {
            window.history.pushState({}, "", "/warehouse/receiving");
          } else if (key === "outbound") {
            window.history.pushState({}, "", "/warehouse/picking");
          } else {
            window.history.pushState({}, "", "/warehouse/inventory");
          }
        }}
        onLogout={logout}
      />

      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
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
          {selectedKey === "suppliers" && <SupplierManagement />}
          {selectedKey === "unit-conversion" && <UnitConversionManager />}
          {selectedKey === "internal-transfers" && <InternalTransferManager />}

          {/* Các tab khác */}
          {selectedKey === "scan" && <div>Giao diện quét mã Barcode / QR</div>}
          {selectedKey === "inbound" && <div>Giao diện Thực hiện Nhập kho</div>}
          {selectedKey === "outbound" && (
            <div>Giao diện Thực hiện Xuất kho</div>
          )}
          {selectedKey === "stocktake-exec" && (
            <div>Giao diện Đếm hàng kiểm kê</div>
          )}
          {selectedKey === "locations" && (
            <div>Giao diện Tra cứu vị trí / Kệ hàng</div>
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

export default WarehouseStaffDashboard;
