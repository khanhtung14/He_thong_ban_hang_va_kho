import { useEffect, useState } from "react";
import {
  Layout,
  Card,
  Form,
  Input,
  Select,
  Button,
  Alert,
  Typography,
  Result,
  Descriptions,
  Tag,
  Row,
  Col,
  Space,
  message,
} from "antd";
import {
  UserAddOutlined,
  MailOutlined,
  PhoneOutlined,
  UserOutlined,
  ShopOutlined,
  CompassOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";
import AdminSidebar from "../../components/Sidebar/AdminSidebar";
import AdminHeader from "../../components/Header/AdminHeader";
import ProfileModal from "../../components/ProfileModal";
import ChangePasswordModal from "../../components/ChangePasswordModal";

const { Content } = Layout;
const { Title, Text } = Typography;

type RoleOption = { code: string; label: string; description: string };
type AssignmentOption = { id: number; code: string; name: string };
type AssignmentOptions = {
  roles: AssignmentOption[];
  warehouses: AssignmentOption[];
  territories: AssignmentOption[];
};

type CreatedUser = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  status: string;
  roles: Array<{ code: string; name: string }>;
};

type CreateUserResponse = {
  message: string;
  user: CreatedUser;
  email_sent: boolean;
};

type ApiError = {
  detail?: string | Array<{ msg?: string }>;
};

const roles: RoleOption[] = [
  {
    code: "SALES_REP",
    label: "Nhân viên kinh doanh",
    description: "Tạo đơn và chăm sóc khách hàng được phân công.",
  },
  {
    code: "SALES_MANAGER",
    label: "Quản lý kinh doanh",
    description: "Quản lý hoạt động và kết quả kinh doanh.",
  },
  {
    code: "WAREHOUSE",
    label: "Nhân viên kho",
    description: "Tiếp nhận, soạn hàng và kiểm kê.",
  },
  {
    code: "WH_MANAGER",
    label: "Quản lý kho",
    description: "Quản lý hoạt động và điều chỉnh tồn kho.",
  },
  {
    code: "ACCOUNTANT",
    label: "Kế toán",
    description: "Theo dõi hóa đơn, thanh toán và công nợ.",
  },
  {
    code: "ADMIN",
    label: "Quản trị hệ thống",
    description: "Quản lý tài khoản và cấu hình hệ thống.",
  },
  {
    code: "CUSTOMER",
    label: "Đại lý",
    description: "Đặt hàng và theo dõi đơn hàng của mình.",
  },
];

export default function CreateUser() {
  const [form] = Form.useForm();
  const [scopeOptions, setScopeOptions] = useState<AssignmentOptions>({
    roles: [],
    warehouses: [],
    territories: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessageText, setErrorMessageText] = useState("");
  const [createdData, setCreatedData] = useState<CreateUserResponse | null>(
    null,
  );

  // Quản lý Modal hồ sơ & đổi mật khẩu trên Header
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);

  const requestedRole = new URLSearchParams(window.location.search).get("role");
  const handleGoBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign("/admin/users?view=users");
    }
  };
  const initialRole = roles.some((option) => option.code === requestedRole)
    ? requestedRole!
    : roles[0].code;

  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/v1/admin/assignment-options")
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Không tải được danh sách vai trò, kho và địa bàn.");
        return response.json() as Promise<AssignmentOptions>;
      })
      .then((data) => {
        if (active) setScopeOptions(data);
      })
      .catch((err: Error) => {
        if (active) setErrorMessageText(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (values: any) => {
    setErrorMessageText("");
    setCreatedData(null);

    const roleCodes: string[] = values.role_codes || [];
    const warehouseIds: number[] = values.warehouse_ids || [];
    const territoryIds: number[] = values.territory_ids || [];

    const includesWarehouseRole = roleCodes.some((code) =>
      ["WAREHOUSE", "WH_MANAGER"].includes(code),
    );
    if (includesWarehouseRole && !warehouseIds.length) {
      setErrorMessageText(
        "Người dùng thuộc vai trò kho phải được gắn với ít nhất một kho phụ trách.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authenticatedFetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: values.full_name.trim(),
          username: values.username.trim(),
          email: values.email.trim(),
          phone: values.phone?.trim() || null,
          role_codes: roleCodes,
          warehouse_ids: warehouseIds,
          territory_ids: territoryIds,
        }),
      });

      const result = (await response
        .json()
        .catch(() => ({}))) as CreateUserResponse & ApiError;
      if (!response.ok) {
        setErrorMessageText(
          typeof result.detail === "string"
            ? result.detail
            : "Chưa thể tạo tài khoản. Vui lòng kiểm tra lại.",
        );
        return;
      }

      message.success("Tạo tài khoản người dùng thành công!");
      setCreatedData(result);
      form.resetFields();
      form.setFieldsValue({ role_codes: [initialRole] });
    } catch {
      setErrorMessageText(
        "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* 1. Sidebar dùng chung */}
      <AdminSidebar currentView="users" />

      <Layout style={{ background: "#f8fafc" }}>
        {/* 2. Header dùng chung */}
        <AdminHeader
          onProfileClick={() => setIsProfileOpen(true)}
          onChangePassword={() => setIsChangePassOpen(true)}
        />

        {/* 3. Nội dung Form tạo User */}
        <Content
          style={{
            padding: "32px 40px",
            maxWidth: 1080,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleGoBack}
            style={{
              marginBottom: 16,
              paddingLeft: 0,
              fontWeight: 600,
              color: "#64748b",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Quay lại
          </Button>
          <div style={{ marginBottom: 28 }}>
            <Text
              type="secondary"
              style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}
            >
              QUẢN LÝ NGƯỜI DÙNG
            </Text>
            <Title
              level={2}
              style={{ margin: "4px 0 8px", fontWeight: 800, color: "#0f172a" }}
            >
              Tạo tài khoản mới
            </Title>
            <Text type="secondary" style={{ fontSize: 14 }}>
              Thêm nhân sự mới vào hệ thống, chỉ định phân quyền và phân công
              kho/địa bàn quản trị.
            </Text>
          </div>

          {createdData ? (
            <Card style={{ borderRadius: 16, border: "1px solid #e2e8f0" }}>
              <Result
                status="success"
                title={`Đã tạo thành công tài khoản "${createdData.user.username}"`}
                subTitle={
                  createdData.email_sent
                    ? "Email kích hoạt kèm thông tin mật khẩu tạm đã được gửi tới nhân sự."
                    : "Tài khoản đã tạo nhưng email chưa gửi được. Vui lòng bàn giao mật khẩu thủ công."
                }
                extra={[
                  <Button
                    type="primary"
                    key="create"
                    icon={<UserAddOutlined />}
                    onClick={() => {
                      setCreatedData(null);
                      form.resetFields();
                      form.setFieldsValue({ role_codes: [initialRole] });
                    }}
                    style={{
                      backgroundColor: "#2563eb",
                      borderRadius: 8,
                      height: 40,
                    }}
                  >
                    Tạo tài khoản tiếp theo
                  </Button>,
                  <Button
                    key="list"
                    href="/admin/users?view=users"
                    style={{ borderRadius: 8, height: 40 }}
                  >
                    Quay lại danh sách tài khoản
                  </Button>,
                ]}
              >
                <div
                  style={{ maxWidth: 600, margin: "0 auto", textAlign: "left" }}
                >
                  <Descriptions bordered column={1} size="small">
                    <Descriptions.Item label="Họ và tên">
                      {createdData.user.full_name}
                    </Descriptions.Item>
                    <Descriptions.Item label="Tên đăng nhập">
                      {createdData.user.username}
                    </Descriptions.Item>
                    <Descriptions.Item label="Email công việc">
                      {createdData.user.email}
                    </Descriptions.Item>
                    <Descriptions.Item label="Vai trò">
                      {createdData.user.roles.map((r) => (
                        <Tag color="blue" key={r.code}>
                          {r.name}
                        </Tag>
                      ))}
                    </Descriptions.Item>
                    <Descriptions.Item label="Trạng thái">
                      <Tag color="orange">Chờ kích hoạt</Tag>
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              </Result>
            </Card>
          ) : (
            <Card
              style={{ borderRadius: 16, border: "1px solid #e2e8f0" }}
              styles={{ body: { padding: "32px 36px" } }}
              title={
                <Space size={10} style={{ padding: "6px 0" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: "#eff6ff",
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    <UserAddOutlined />
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    Thông tin nhân sự
                  </span>
                </Space>
              }
            >
              {errorMessageText && (
                <Alert
                  message={errorMessageText}
                  type="error"
                  showIcon
                  closable
                  onClose={() => setErrorMessageText("")}
                  style={{ marginBottom: 24, borderRadius: 8 }}
                />
              )}

              <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                initialValues={{ role_codes: [initialRole] }}
                requiredMark={true}
              >
                <Row gutter={24}>
                  <Col span={24}>
                    <Form.Item
                      name="full_name"
                      label={
                        <span style={{ fontWeight: 600 }}>
                          Họ và tên nhân sự
                        </span>
                      }
                      rules={[
                        { required: true, message: "Vui lòng nhập họ và tên!" },
                      ]}
                    >
                      <Input
                        prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                        placeholder="Ví dụ: Nguyễn Minh Anh"
                        maxLength={150}
                        style={{ height: 42, borderRadius: 8 }}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      name="username"
                      label={
                        <span style={{ fontWeight: 600 }}>Tên đăng nhập</span>
                      }
                      rules={[
                        {
                          required: true,
                          message: "Vui lòng nhập tên đăng nhập!",
                        },
                        { min: 3, message: "Tối thiểu 3 ký tự!" },
                        {
                          pattern: /^[a-zA-Z0-9_.-]+$/,
                          message:
                            "Chỉ dùng chữ cái không dấu, số, dấu gạch hoặc chấm!",
                        },
                      ]}
                      extra="Từ 3 ký tự, không dấu và không chứa khoảng trắng."
                    >
                      <Input
                        placeholder="Ví dụ: minhanh.nguyen"
                        maxLength={50}
                        style={{ height: 42, borderRadius: 8 }}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      name="phone"
                      label={
                        <span style={{ fontWeight: 600 }}>Số điện thoại</span>
                      }
                      rules={[
                        {
                          pattern: /^0[0-9]{9}$/,
                          message: "Gồm 10 chữ số và bắt đầu bằng số 0!",
                        },
                      ]}
                    >
                      <Input
                        prefix={<PhoneOutlined style={{ color: "#94a3b8" }} />}
                        placeholder="0901234567"
                        maxLength={10}
                        style={{ height: 42, borderRadius: 8 }}
                      />
                    </Form.Item>
                  </Col>

                  <Col span={24}>
                    <Form.Item
                      name="email"
                      label={
                        <span style={{ fontWeight: 600 }}>Email công việc</span>
                      }
                      rules={[
                        { required: true, message: "Vui lòng nhập email!" },
                        {
                          type: "email",
                          message: "Định dạng email không hợp lệ!",
                        },
                      ]}
                    >
                      <Input
                        prefix={<MailOutlined style={{ color: "#94a3b8" }} />}
                        placeholder="ten.nhanvien@congty.vn"
                        maxLength={254}
                        style={{ height: 42, borderRadius: 8 }}
                      />
                    </Form.Item>
                  </Col>

                  <Col span={24}>
                    <Form.Item
                      name="role_codes"
                      label={
                        <span style={{ fontWeight: 600 }}>
                          Vai trò hệ thống
                        </span>
                      }
                      rules={[
                        {
                          required: true,
                          message: "Hãy chọn ít nhất một vai trò!",
                        },
                      ]}
                    >
                      <Select
                        mode="multiple"
                        placeholder="Chọn vai trò cấp quyền..."
                        options={roles.map((r) => ({
                          label: `${r.label} — ${r.description}`,
                          value: r.code,
                        }))}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      name="warehouse_ids"
                      label={
                        <span>
                          <ShopOutlined /> Kho được phụ trách
                        </span>
                      }
                    >
                      <Select
                        mode="multiple"
                        placeholder="Chọn kho phụ trách..."
                        options={scopeOptions.warehouses.map((w) => ({
                          label: w.name,
                          value: w.id,
                        }))}
                      />
                    </Form.Item>
                  </Col>

                  <Col xs={24} md={12}>
                    <Form.Item
                      name="territory_ids"
                      label={
                        <span>
                          <CompassOutlined /> Địa bàn hoạt động
                        </span>
                      }
                    >
                      <Select
                        mode="multiple"
                        placeholder="Chọn địa bàn..."
                        options={scopeOptions.territories.map((t) => ({
                          label: t.name,
                          value: t.id,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 12,
                  }}
                >
                  <Button
                    href="/admin/users?view=users"
                    style={{ height: 42, borderRadius: 8, padding: "0 20px" }}
                  >
                    Hủy bỏ
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={isSubmitting}
                    icon={<ArrowRightOutlined />}
                    style={{
                      height: 42,
                      borderRadius: 8,
                      padding: "0 24px",
                      backgroundColor: "#2563eb",
                      fontWeight: 600,
                    }}
                  >
                    Tạo tài khoản
                  </Button>
                </div>
              </Form>
            </Card>
          )}
        </Content>
      </Layout>

      {/* Modal Profile & Đổi mật khẩu cho Admin */}
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
}
