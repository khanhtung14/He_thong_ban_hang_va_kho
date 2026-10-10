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

  const [selectedKey, setSelectedKey] = useState("dashboard");
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

  return (
    <Layout hasSider style={{ minHeight: "100vh", backgroundColor: "#f8fafc" }}>
      {/* 1. Sidebar Kế toán */}
      <AccountantSidebar
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        onLogout={logout}
      />

      {/* 2. Cột nội dung bên phải */}
      <Layout style={{ backgroundColor: "#f8fafc", minWidth: 0 }}>
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
        {/* Nội dung Dashboard Kế toán */}
        <Content
          style={{
            padding: "24px 32px",
            maxWidth: 1400,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {/* 1. Màn hình Khóa / Mở giao dịch đại lý */}
          {selectedKey === "agency-locks" && <AgencyLockManager />}

          {/* 2. Màn hình Công nợ đại lý (hoặc mặc định cho xem luôn chức năng này) */}
          {selectedKey === "debt" && <AgencyLockManager />}

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
