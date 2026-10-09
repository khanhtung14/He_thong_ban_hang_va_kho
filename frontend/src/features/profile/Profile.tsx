import { useEffect, useState } from "react";
import { authenticatedFetch, logout } from "services/sessionService";
import ProfileAvatar from "./ProfileAvatar";
import { Modal, Card, Typography, Tabs, Form, Input, Button, Alert, Row, Col, Layout, ConfigProvider } from "antd";
import { UserOutlined, LockOutlined, SaveOutlined, ArrowLeftOutlined, LogoutOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;
const { Header, Content } = Layout;

type ProfileData = {
  username: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  phone: string;
  role: string;
  warehouse: string;
  area: string;
};

type ApiError = { detail?: string | { msg?: string }[] };

function errorMessage(error: ApiError): string {
  if (typeof error.detail === "string") return error.detail;
  if (Array.isArray(error.detail) && error.detail[0]?.msg) return error.detail[0].msg;
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

function getRoleHome(): string {
  const role = window.sessionStorage.getItem("user_role")?.toUpperCase();
  if (role === "CUSTOMER") return "/portal/orders";
  if (role === "SALES" || role === "SALES_REP") return "/sales/orders";
  if (role === "SALES_MANAGER") return "/manager/dashboard";
  if (role === "WAREHOUSE") return "/warehouse/picking";
  if (role === "WH_MANAGER" || role === "WAREHOUSE_MANAGER") return "/warehouse/dashboard";
  if (role === "ACCOUNTANT") return "/accounting/debt-book";
  if (role === "ADMIN" || role === "ADMINISTRATOR") return "/admin/users";
  return "/login";
}

export default function Profile({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [profileForm] = Form.useForm();
  const [pwdForm] = Form.useForm();
  
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error", text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ type: "success" | "error", text: string } | null>(null);

  const avatarName = profile?.full_name || window.sessionStorage.getItem("user_name") || "?";
  const avatarInitials = avatarName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toUpperCase() || "?";

  useEffect(() => {
    authenticatedFetch("/api/v1/profile")
      .then(async (response) => {
        if (!response.ok) throw new Error("Không thể tải hồ sơ người dùng.");
        const data = await response.json() as ProfileData;
        setProfile(data);
        profileForm.setFieldsValue({
          username: data.username,
          email: data.email,
          role: data.role,
          warehouse: data.warehouse,
          area: data.area,
          full_name: data.full_name,
          phone: data.phone
        });
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setIsLoading(false));
  }, [profileForm]);

  const onUpdateProfile = async (values: any) => {
    setProfileMsg(null);
    try {
      const response = await authenticatedFetch("/api/v1/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: values.full_name, phone: values.phone }),
      });
      const result = await response.json() as ApiError & { profile?: ProfileData; message?: string };
      if (!response.ok) throw new Error(errorMessage(result));
      if (result.profile) {
        setProfile(result.profile);
        window.dispatchEvent(new Event("oms:profile-avatar-updated"));
      }
      setProfileMsg({ type: "success", text: result.message ?? "Cập nhật hồ sơ thành công." });
    } catch (error) {
      setProfileMsg({ type: "error", text: error instanceof Error ? error.message : "Không thể kết nối máy chủ." });
    }
  };

  const onChangePassword = async (values: any) => {
    setPwdMsg(null);
    try {
      const response = await authenticatedFetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: values.current_password,
          new_password: values.new_password,
          new_password_confirm: values.new_password_confirm
        }),
      });
      const result = await response.json() as ApiError & { message?: string };
      if (!response.ok) throw new Error(errorMessage(result));
      setPwdMsg({ type: "success", text: result.message ?? "Đổi mật khẩu thành công. Lần đăng nhập sau hãy sử dụng mật khẩu mới." });
      pwdForm.resetFields();
    } catch (error) {
      setPwdMsg({ type: "error", text: error instanceof Error ? error.message : "Không thể kết nối máy chủ." });
    }
  };

  const glassStyle = {
    background: "rgba(255, 255, 255, 0.6)",
    backdropFilter: "blur(24px)",
    border: "1px solid rgba(255, 255, 255, 0.7)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
    borderRadius: 16,
    color: "#0F172A"
  };

  const tabItems = [
    {
      key: "profile",
      label: <span><UserOutlined /> Thông tin cá nhân</span>,
      children: (
        <Form form={profileForm} layout="vertical" onFinish={onUpdateProfile}>
          {profileMsg && <Alert message={profileMsg.text} type={profileMsg.type} showIcon style={{ marginBottom: 24 }} />}
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="username" label="Tên đăng nhập">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="Email">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="role" label="Vai trò">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="area" label="Địa bàn">
                <Input disabled />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="full_name" label="Họ và tên" rules={[{ required: true, message: "Vui lòng nhập họ tên" }]}>
                <Input placeholder="Nhập họ và tên" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, pattern: /^0[0-9]{9}$/, message: "Số điện thoại phải có 10 chữ số và bắt đầu bằng 0" }]}>
                <Input placeholder="09xxxx..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item style={{ textAlign: "right", marginTop: 16, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large">Lưu thay đổi</Button>
          </Form.Item>
        </Form>
      )
    },
    {
      key: "password",
      label: <span><LockOutlined /> Đổi mật khẩu</span>,
      children: (
        <Form form={pwdForm} layout="vertical" onFinish={onChangePassword}>
          {pwdMsg && <Alert message={pwdMsg.text} type={pwdMsg.type} showIcon style={{ marginBottom: 24 }} />}
          <Form.Item name="current_password" label="Mật khẩu hiện tại" rules={[{ required: true, message: "Vui lòng nhập mật khẩu hiện tại" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu hiện tại" size="large" />
          </Form.Item>
          <Form.Item name="new_password" label="Mật khẩu mới" rules={[{ required: true, min: 8, message: "Mật khẩu mới phải từ 8 ký tự trở lên" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu mới" size="large" />
          </Form.Item>
          <Form.Item name="new_password_confirm" label="Xác nhận mật khẩu mới" dependencies={['new_password']} rules={[
            { required: true, message: "Vui lòng xác nhận mật khẩu" },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('new_password') === value) return Promise.resolve();
                return Promise.reject(new Error("Mật khẩu xác nhận không khớp!"));
              },
            }),
          ]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Xác nhận mật khẩu mới" size="large" />
          </Form.Item>
          <Form.Item style={{ textAlign: "right", marginTop: 16, marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large">Đổi mật khẩu</Button>
          </Form.Item>
        </Form>
      )
    }
  ];

  const InnerContent = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <ProfileAvatar initials={avatarInitials} editable={false} />
        <div>
          <Title level={4} style={{ margin: 0, color: "#0F172A" }}>{profile?.full_name || "Đang tải..."}</Title>
          <Text style={{ color: "#475569" }}>{profile?.role || "..."} · {profile?.email || "..."}</Text>
        </div>
      </div>
      <Tabs defaultActiveKey="profile" items={tabItems} />
    </div>
  );

  if (embedded) {
    return (
      <Modal
        title="Quản lý tài khoản"
        open={true}
        onCancel={onClose}
        footer={null}
        width={700}
        className="glass-profile-modal"
        styles={{ 
          header: { background: "transparent", borderBottom: "1px solid rgba(0,0,0,0.06)", paddingBottom: 16 },
        }}
        closeIcon={<span style={{ color: "#475569", fontSize: 18 }}>✕</span>}
      >
        <style>{`
          .glass-profile-modal .ant-modal-content {
            background: rgba(255, 255, 255, 0.75) !important;
            backdrop-filter: blur(24px) !important;
            border: 1px solid rgba(255, 255, 255, 0.8) !important;
            border-radius: 16px !important;
          }
          .glass-profile-modal .ant-modal-title {
            color: #0F172A !important;
            font-size: 20px !important;
          }
        `}</style>
        <ConfigProvider theme={{ token: { colorBgContainer: "rgba(255,255,255,0.3)" } }}>
          {isLoading ? <Alert message="Đang tải dữ liệu..." type="info" /> : loadError ? <Alert message={loadError} type="error" /> : <InnerContent />}
        </ConfigProvider>
      </Modal>
    );
  }

  // Standalone Layout
  return (
    <ConfigProvider theme={{ token: { fontFamily: "'Inter', sans-serif", colorTextHeading: "#0F172A", colorText: "#1E293B" } }}>
      <Layout style={{ minHeight: "100vh", background: "url('/bg.jpg') center/cover no-repeat fixed" }}>
        <Header style={{ padding: "0 24px", background: "rgba(255, 255, 255, 0.65)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255, 255, 255, 0.7)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: "#0F172A" }} onClick={() => window.location.assign(getRoleHome())}>Quay lại</Button>
            <Text strong style={{ fontSize: 18, color: "#0F172A", letterSpacing: 1 }}>OMS PROFILE</Text>
          </div>
          <Button type="primary" danger icon={<LogoutOutlined />} onClick={() => void logout()}>Đăng xuất</Button>
        </Header>
        <Content style={{ padding: "40px 24px", display: "flex", justifyContent: "center" }}>
          <Card style={{ ...glassStyle, width: "100%", maxWidth: 800 }} bordered={false}>
            {isLoading ? <Alert message="Đang tải dữ liệu..." type="info" /> : loadError ? <Alert message={loadError} type="error" /> : <InnerContent />}
          </Card>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
