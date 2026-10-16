import React, { useEffect, useState, useCallback } from "react";
import { Layout } from "antd";

// Modals
import ChangePasswordModal from "../../components/ChangePasswordModal";
import ProfileModal from "../../components/ProfileModal";

// Sidebar & Header Kế toán
import { AccountantSidebar } from "../../components/Sidebar/AccountantSidebar";
import { AccountantHeader } from "../../components/Header/AccountantHeader";

// Auth & API
import { logout } from "../../services/sessionService";
import { fetchProfile, type UserProfile } from "../../services/apiClient";
import AgencyLockManager from "./AgencyLockManager";
import { AgencyManagement } from "./AgencyManagement";
import CreditLimitManager from "../../features/credit_limit/CreditLimitManager";

const { Content } = Layout;

export const AccountantDashboard: React.FC = () => {
  // Khởi tạo state từ localStorage để giao diện có dữ liệu ngay lập tức, không bị giật lag
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
      if (
        p === "/accounting/agencies" ||
        p === "/accountant/agencies" ||
        p === "/accounting/customers" ||
        p === "/accountant/customers"
      ) {
        return "agencies";
      }
      if (p === "/accounting/agency-locks") {
        return "agency-locks";
      }
      if (p === "/accounting/debt-book" || p === "/accounting/debt") {
        return "debt";
      }
    }
    return "agencies";
  });
  const [, setLoading] = useState(false);

  // Trạng thái modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isChangePassModalOpen, setIsChangePassModalOpen] = useState(false);

  // Load profile kế toán từ backend
  const loadProfileData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProfile();
      if (data) {
        setProfile(data);
        localStorage.setItem("user", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Lỗi tải thông tin kế toán:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfileData();

    // Lắng nghe sự kiện nếu modal phát event lưu profile
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
      if (
        p === "/accounting/agencies" ||
        p === "/accountant/agencies" ||
        p === "/accounting/customers" ||
        p === "/accountant/customers"
      ) {
        setSelectedKey("agencies");
      } else if (p === "/accounting/agency-locks") {
        setSelectedKey("agency-locks");
      } else if (p === "/accounting/debt-book" || p === "/accounting/debt") {
        setSelectedKey("debt");
      }
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

      {/* 1. Sidebar Kế toán */}
      <AccountantSidebar
        selectedKey={selectedKey}
        onSelect={(key) => {
          setSelectedKey(key);
          if (key === "agencies") {
            window.history.pushState({}, "", "/accounting/agencies");
          } else if (key === "agency-locks") {
            window.history.pushState({}, "", "/accounting/agency-locks");
          } else if (key === "debt") {
            window.history.pushState({}, "", "/accounting/debt-book");
          } else {
            window.history.pushState({}, "", "/accounting/debt-book");
          }
        }}
        onLogout={logout}
      />

      {/* 2. Cột nội dung bên phải */}
      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        {/* Header Kế toán */}
        <AccountantHeader
          fullName={profile?.full_name || "Đặng Kế Toán"}
          roleName={profile?.role || "Kế toán tài chính"}
          avatarUrl={profile?.avatar_url}
          notificationCount={0}
          onLogout={logout}
          onProfileClick={() => setIsProfileModalOpen(true)}
          onChangePassword={() => setIsChangePassModalOpen(true)}
        />

        {/* Nội dung Dashboard Kế toán */}
        <Content
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {/* Màn hình Quản lý hồ sơ đại lý */}
          {selectedKey === "agencies" && <AgencyManagement />}

          {/* 1. Màn hình Khóa / Mở giao dịch đại lý */}
          {selectedKey === "agency-locks" && <AgencyLockManager />}

          {/* 2. Màn hình Quản lý Hạn mức Công nợ đại lý (SCRUM-21) */}
          {selectedKey === "debt" && <CreditLimitManager />}

          {/* Các tab khác tạm thời hiển thị placeholder để không bị trắng màn hình */}
          {selectedKey === "dashboard" && (
            <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
              <h3>Tổng quan tài chính & công nợ</h3>
              <p>
                Chọn mục <b>Khóa / Mở giao dịch</b> hoặc <b>Công nợ đại lý</b>{" "}
                trên thanh menu để thao tác.
              </p>
            </div>
          )}

          {selectedKey === "invoices" && (
            <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
              <h3>Danh sách Hóa đơn & Chứng từ</h3>
            </div>
          )}

          {selectedKey === "reconciliation" && (
            <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
              <h3>Đối soát công nợ đại lý</h3>
            </div>
          )}

          {selectedKey === "ledger" && (
            <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
              <h3>Sổ sách kế toán</h3>
            </div>
          )}

          {selectedKey === "reports" && (
            <div style={{ background: "#fff", padding: 24, borderRadius: 8 }}>
              <h3>Báo cáo tài chính</h3>
            </div>
          )}
        </Content>
      </Layout>

      {/* Modal Hồ sơ cá nhân - Dùng đúng prop onProfileUpdated */}
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

export default AccountantDashboard;
