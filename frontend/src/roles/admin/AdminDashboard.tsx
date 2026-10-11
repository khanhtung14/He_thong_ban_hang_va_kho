import React, { useState } from "react";
import { Layout } from "antd";
import AdminSidebar from "../../components/Sidebar/AdminSidebar";
import AdminHeader from "../../components/Header/AdminHeader";
import ProfileModal from "../../components/ProfileModal";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import AdminOverview from "./AdminOverView";
import AdminUsers from "./AdminUsers";
import AdminRBAC from "./AdminRBAC";
import AdminConfiguration from "./AdminConfiguration";
import AdminAudit from "./AdminAudit";

const { Content } = Layout;

export const AdminDashboard: React.FC = () => {
  const currentView =
    new URLSearchParams(window.location.search).get("view") || "overview";
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);

  const renderCurrentView = () => {
    switch (currentView) {
      case "users":
        return <AdminUsers />;
      case "rbac":
        return <AdminRBAC />;
      case "configuration":
        return <AdminConfiguration />;
      case "audit":
        return <AdminAudit />;
      case "overview":
      default:
        return <AdminOverview />;
    }
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* 1. Sidebar chuẩn */}
      <AdminSidebar currentView={currentView} />

      <Layout style={{ background: "#f8fafc" }}>
        {/* 2. Header chuẩn */}
        <AdminHeader
          fullName="Quản trị viên"
          roleName="Quản trị hệ thống"
          onProfileClick={() => setIsProfileOpen(true)}
          onChangePassword={() => setIsChangePassOpen(true)}
        />

        {/* 3. Nội dung trang */}
        <Content
          style={{
            padding: "28px 32px",
            maxWidth: 1200,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {renderCurrentView()}
        </Content>
      </Layout>

      {/* Modal Profile & Đổi mật khẩu */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
      <ChangePasswordModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
      />
    </Layout>
  );
};

export default AdminDashboard;
