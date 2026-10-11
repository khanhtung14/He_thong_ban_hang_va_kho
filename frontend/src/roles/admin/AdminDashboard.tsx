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
import CreateUserModal from "./CreateUser";
import AdminAudit from "./AdminAudit";

const { Content } = Layout;

export const AdminDashboard: React.FC = () => {
  // Quản lý tab view trực tiếp bằng state như Sales
  const [currentView, setCurrentView] = useState("overview");
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);

  const renderCurrentView = () => {
    switch (currentView) {
      case "users":
        return <AdminUsers />;
      case "rbac":
        return <AdminRBAC />;
      case "create-user":
        return <CreateUserModal />;
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

      {/* 2. Sidebar Admin (Layout tự canh bên trái) */}
      <AdminSidebar
        currentView={currentView}
        onSelect={(key) => setCurrentView(key)}
      />

      {/* 3. Cột nội dung (minWidth: 0 chống vỡ bảng) */}
      <Layout style={{ backgroundColor: "transparent", minWidth: 0, zIndex: 1 }}>
        <AdminHeader
          fullName="Quản trị viên"
          roleName="Quản trị hệ thống"
          onProfileClick={() => setIsProfileOpen(true)}
          onChangePassword={() => setIsChangePassOpen(true)}
        />

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

      {/* Modals */}
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