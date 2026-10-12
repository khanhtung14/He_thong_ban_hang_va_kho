import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Typography,
  Divider,
  Alert,
  message,
  Tooltip,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Badge,
  Switch,
  notification,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ShopOutlined,
  SearchOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  StopOutlined,
  FileTextOutlined,
  PhoneOutlined,
} from "@ant-design/icons";

import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  updateSupplierStatus,
  deleteSupplier,
  type Supplier,
  type SupplierPayload,
} from "../../services/apiClient";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Danh sách gợi ý điều khoản thanh toán phổ biến
const PAYMENT_TERM_OPTIONS = [
  "Thanh toán ngay (COD)",
  "Gối đầu 15 ngày",
  "Gối đầu 30 ngày",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Chuyển khoản trước khi giao",
];

export const SupplierManagement: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<boolean | undefined>(undefined);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });

  // Modal thêm/sửa
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);
  const [form] = Form.useForm();

  // Modal cảnh báo ràng buộc xóa
  const [constraintModal, setConstraintModal] = useState<{
    visible: boolean;
    supplier: Supplier | null;
    errorMessage: string;
  }>({
    visible: false,
    supplier: null,
    errorMessage: "",
  });

  // Tải danh sách nhà cung cấp
  const loadSuppliers = useCallback(
    async (page = pagination.current, limit = pagination.pageSize) => {
      setLoading(true);
      try {
        const res = await fetchSuppliers({
          search: searchKeyword.trim() || undefined,
          is_active: statusFilter,
          page,
          limit,
        });

        if (res && res.data) {
          setSuppliers(res.data);
          const total =
            res.pagination?.totalRecords ??
            res.pagination?.total_records ??
            res.data.length;
          setPagination({
            current: page,
            pageSize: limit,
            total,
          });
        }
      } catch (err: any) {
        message.error(err.message || "Không thể tải danh sách nhà cung cấp.");
      } finally {
        setLoading(false);
      }
    },
    [searchKeyword, statusFilter, pagination.pageSize],
  );

  useEffect(() => {
    loadSuppliers(1);
  }, [loadSuppliers]);

  // Mở modal thêm mới
  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    form.resetFields();
    form.setFieldsValue({
      is_active: true,
      payment_terms: "Gối đầu 30 ngày",
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.setFieldsValue({
      code: supplier.code,
      name: supplier.name,
      tax_code: supplier.tax_code ?? supplier.taxCode,
      contact_person: supplier.contact_person ?? supplier.contactPerson,
      payment_terms: supplier.payment_terms ?? supplier.paymentTerms,
      phone: supplier.phone,
      address: supplier.address,
      is_active: supplier.is_active ?? supplier.isActive,
    });
    setIsModalOpen(true);
  };

  // Xử lý lưu form thêm/sửa
  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      const payload: SupplierPayload = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        tax_code: values.tax_code ? values.tax_code.trim() : undefined,
        contact_person: values.contact_person
          ? values.contact_person.trim()
          : undefined,
        payment_terms: values.payment_terms ? values.payment_terms.trim() : undefined,
        phone: values.phone ? values.phone.trim() : undefined,
        address: values.address ? values.address.trim() : undefined,
        is_active: values.is_active ?? true,
      };

      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
        message.success(
          `Cập nhật nhà cung cấp "${payload.name}" thành công!`,
        );
      } else {
        await createSupplier(payload);
        message.success(`Thêm mới nhà cung cấp "${payload.name}" thành công!`);
      }

      setIsModalOpen(false);
      form.resetFields();
      loadSuppliers(pagination.current);
    } catch (err: any) {
      if (err.errorFields) return; // Form validation error
      message.error(err.message || "Đã xảy ra lỗi khi lưu thông tin.");
    } finally {
      setModalLoading(false);
    }
  };

  // Xử lý chuyển đổi trạng thái Hoạt động / Ngừng giao dịch
  const handleToggleStatus = async (supplier: Supplier) => {
    const currentActive = supplier.is_active ?? supplier.isActive;
    const nextStatus = !currentActive;
    const actionLabel = nextStatus ? "Kích hoạt" : "Ngừng giao dịch";

    try {
      setLoading(true);
      await updateSupplierStatus(supplier.id, nextStatus);
      message.success(
        `Đã chuyển trạng thái nhà cung cấp "${supplier.name}" sang "${
          nextStatus ? "Đang hoạt động" : "Ngừng giao dịch"
        }".`,
      );
      loadSuppliers(pagination.current);
    } catch (err: any) {
      message.error(
        err.message || `Không thể ${actionLabel} nhà cung cấp này.`,
      );
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Xóa với cơ chế hứng lỗi ràng buộc phiếu nhập kho từ API (HTTP 400)
  const handleDeleteSupplier = async (supplier: Supplier) => {
    try {
      setLoading(true);
      const res = await deleteSupplier(supplier.id);
      message.success(
        res.message || `Xóa nhà cung cấp "${supplier.name}" thành công!`,
      );
      loadSuppliers(pagination.current);
    } catch (err: any) {
      // Bắt lỗi ràng buộc nghiệp vụ (HTTP 400 do đã có phiếu nhập kho)
      if (err.status === 400 || err.hasReceiptsConstraint) {
        setConstraintModal({
          visible: true,
          supplier,
          errorMessage: err.message,
        });
      } else {
        message.error(err.message || "Xóa nhà cung cấp thất bại.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Nút hành động nhanh: Chuyển sang Ngừng giao dịch ngay từ Modal ràng buộc
  const handleQuickDeactivateFromConstraint = async () => {
    if (!constraintModal.supplier) return;
    try {
      setLoading(true);
      await updateSupplierStatus(constraintModal.supplier.id, false);
      notification.success({
        message: "Chuyển trạng thái thành công",
        description: `Nhà cung cấp "${constraintModal.supplier.name}" đã được chuyển sang trạng thái "Ngừng giao dịch". Dữ liệu chứng từ phiếu nhập kho liên quan được bảo toàn nguyên vẹn.`,
        duration: 5,
      });
      setConstraintModal({ visible: false, supplier: null, errorMessage: "" });
      loadSuppliers(pagination.current);
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  // Thống kê nhanh
  const stats = {
    total: pagination.total,
    active: suppliers.filter((s) => s.is_active ?? s.isActive).length,
    inactive: suppliers.filter((s) => !(s.is_active ?? s.isActive)).length,
    withReceipts: suppliers.filter(
      (s) => (s.receipts_count ?? s.receiptsCount ?? 0) > 0,
    ).length,
  };

  // Định nghĩa các cột cho bảng danh sách
  const columns: ColumnsType<Supplier> = [
    {
      title: "Mã NCC",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (code: string) => (
        <Tag
          color="blue"
          style={{
            fontWeight: 700,
            fontSize: 13,
            padding: "2px 8px",
            letterSpacing: "0.5px",
          }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: "Tên nhà cung cấp",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: Supplier) => (
        <div>
          <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
            {name}
          </Text>
          {record.address && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              <span role="img" aria-label="pin">
                📍
              </span>{" "}
              {record.address}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Mã số thuế",
      key: "tax_code",
      width: 140,
      render: (_: any, record: Supplier) => {
        const tax = record.tax_code ?? record.taxCode;
        return tax ? (
          <Text code style={{ fontSize: 12, color: "#0f766e" }}>
            {tax}
          </Text>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12 }}>
            Chưa cập nhật
          </Text>
        );
      },
    },
    {
      title: "Người liên hệ & SĐT",
      key: "contact",
      width: 190,
      render: (_: any, record: Supplier) => {
        const contact = record.contact_person ?? record.contactPerson;
        return (
          <div>
            <div style={{ fontWeight: 500, color: "#334155" }}>
              {contact || (
                <Text type="secondary" italic>
                  Chưa rõ
                </Text>
              )}
            </div>
            {record.phone && (
              <div style={{ fontSize: 12, color: "#2563eb", marginTop: 2 }}>
                <PhoneOutlined style={{ marginRight: 4 }} />
                {record.phone}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "ĐK Thanh toán",
      key: "payment_terms",
      width: 160,
      render: (_: any, record: Supplier) => {
        const terms = record.payment_terms ?? record.paymentTerms;
        return terms ? (
          <Tag color="cyan" style={{ borderRadius: 4, fontWeight: 500 }}>
            {terms}
          </Tag>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12 }}>
            Mặc định
          </Text>
        );
      },
    },
    {
      title: "Phiếu nhập kho",
      key: "receipts_count",
      width: 140,
      align: "center",
      render: (_: any, record: Supplier) => {
        const count = record.receipts_count ?? record.receiptsCount ?? 0;
        return count > 0 ? (
          <Tooltip title={`Nhà cung cấp đã phát sinh ${count} phiếu nhập kho`}>
            <Tag
              icon={<FileTextOutlined />}
              color="geekblue"
              style={{
                fontWeight: 600,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              {count} phiếu nhập
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="default" style={{ color: "#94a3b8" }}>
            Chưa phát sinh
          </Tag>
        );
      },
    },
    {
      title: "Trạng thái",
      key: "is_active",
      width: 150,
      align: "center",
      render: (_: any, record: Supplier) => {
        const active = record.is_active ?? record.isActive;
        return active ? (
          <Badge
            status="success"
            text={
              <Text strong style={{ color: "#16a34a" }}>
                Hoạt động
              </Text>
            }
          />
        ) : (
          <Badge
            status="error"
            text={
              <Text strong style={{ color: "#dc2626" }}>
                Ngừng giao dịch
              </Text>
            }
          />
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 170,
      align: "center",
      render: (_: any, record: Supplier) => {
        const active = record.is_active ?? record.isActive;
        const count = record.receipts_count ?? record.receiptsCount ?? 0;

        return (
          <Space size="small">
            <Tooltip title="Chỉnh sửa thông tin">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: "#2563eb" }} />}
                onClick={() => handleOpenEditModal(record)}
              />
            </Tooltip>

            <Tooltip
              title={
                active
                  ? "Chuyển sang Ngừng giao dịch"
                  : "Kích hoạt lại nhà cung cấp"
              }
            >
              <Popconfirm
                title={
                  active
                    ? "Ngừng giao dịch với NCC này?"
                    : "Kích hoạt lại NCC này?"
                }
                description={
                  active
                    ? `Bạn có chắc muốn chuyển NCC "${record.name}" sang trạng thái Ngừng giao dịch?`
                    : `Kích hoạt lại để tiếp tục lập phiếu nhập kho với NCC "${record.name}"?`
                }
                okText="Đồng ý"
                cancelText="Hủy"
                onConfirm={() => handleToggleStatus(record)}
              >
                <Button
                  type="text"
                  icon={
                    active ? (
                      <StopOutlined style={{ color: "#ea580c" }} />
                    ) : (
                      <CheckCircleOutlined style={{ color: "#16a34a" }} />
                    )
                  }
                />
              </Popconfirm>
            </Tooltip>

            <Tooltip
              title={
                count > 0
                  ? "Đã có phiếu nhập kho (Có ràng buộc chặn xóa)"
                  : "Xóa nhà cung cấp"
              }
            >
              <Popconfirm
                title={`Xóa nhà cung cấp "${record.code}"?`}
                description={
                  count > 0 ? (
                    <div style={{ maxWidth: 260, color: "#dc2626" }}>
                      ⚠️ Lưu ý: NCC này đã có {count} phiếu nhập kho. Thao tác xóa sẽ bị hệ thống chặn theo luật nghiệp vụ!
                    </div>
                  ) : (
                    "Hành động này không thể hoàn tác nếu NCC chưa phát sinh dữ liệu."
                  )
                }
                okText="Thực hiện xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeleteSupplier(record)}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Tiêu đề & Nút thêm mới */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <Title
            level={3}
            style={{
              margin: 0,
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <ShopOutlined style={{ color: "#2563eb" }} />
            Quản lý danh mục nhà cung cấp
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Quản lý thông tin nhà cung cấp, điều khoản thanh toán và giám sát ràng buộc phiếu nhập kho (SCRUM-79)
          </Text>
        </div>

        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadSuppliers(pagination.current)}
            loading={loading}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="middle"
            style={{
              backgroundColor: "#2563eb",
              borderRadius: 6,
              fontWeight: 600,
            }}
            onClick={handleOpenAddModal}
          >
            Thêm nhà cung cấp mới
          </Button>
        </Space>
      </div>

      {/* Thẻ tóm tắt chỉ số */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderLeft: "4px solid #2563eb",
            }}
          >
            <Statistic
              title="Tổng số nhà cung cấp"
              value={stats.total}
              prefix={<ShopOutlined style={{ color: "#2563eb" }} />}
              valueStyle={{ fontWeight: 700, color: "#1e293b" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderLeft: "4px solid #16a34a",
            }}
          >
            <Statistic
              title="Đang hoạt động"
              value={stats.active}
              prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
              valueStyle={{ fontWeight: 700, color: "#16a34a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderLeft: "4px solid #ef4444",
            }}
          >
            <Statistic
              title="Ngừng giao dịch"
              value={stats.inactive}
              prefix={<StopOutlined style={{ color: "#ef4444" }} />}
              valueStyle={{ fontWeight: 700, color: "#ef4444" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 10,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              borderLeft: "4px solid #0284c7",
            }}
          >
            <Statistic
              title="Đã có phiếu nhập kho"
              value={stats.withReceipts}
              prefix={<FileTextOutlined style={{ color: "#0284c7" }} />}
              valueStyle={{ fontWeight: 700, color: "#0284c7" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc và tìm kiếm */}
      <Card
        bordered={false}
        style={{
          borderRadius: 10,
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={12} lg={10}>
            <Input
              placeholder="Tìm theo mã, tên, mã số thuế, người liên hệ..."
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={() => loadSuppliers(1)}
              allowClear
            />
          </Col>
          <Col xs={12} md={6} lg={6}>
            <Select
              style={{ width: "100%" }}
              placeholder="Lọc trạng thái hoạt động"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              allowClear
            >
              <Option value={true}>🟢 Đang hoạt động</Option>
              <Option value={false}>🔴 Ngừng giao dịch</Option>
            </Select>
          </Col>
          <Col xs={12} md={6} lg={4}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => loadSuppliers(1)}
              style={{ width: "100%", backgroundColor: "#0284c7" }}
            >
              Tìm kiếm
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Bảng danh sách nhà cung cấp */}
      <Card
        bordered={false}
        style={{
          borderRadius: 10,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <Table
          columns={columns}
          dataSource={suppliers}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}-${range[1]} / ${total} nhà cung cấp`,
            onChange: (page, pageSize) => loadSuppliers(page, pageSize),
          }}
        />
      </Card>

      {/* ========================================================================= */}
      {/* MODAL THÊM MỚI / CHỈNH SỬA NHÀ CUNG CẤP */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShopOutlined style={{ color: "#2563eb" }} />
            <span>
              {editingSupplier
                ? `Cập nhật nhà cung cấp: ${editingSupplier.code}`
                : "Thêm mới nhà cung cấp hàng hóa"}
            </span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmitForm}
        confirmLoading={modalLoading}
        okText={editingSupplier ? "Lưu thay đổi" : "Tạo mới"}
        cancelText="Hủy"
        width={650}
        destroyOnClose
      >
        <Divider style={{ margin: "12px 0 20px" }} />

        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="code"
                label="Mã nhà cung cấp"
                rules={[
                  { required: true, message: "Vui lòng nhập mã nhà cung cấp!" },
                  { max: 50, message: "Tối đa 50 ký tự" },
                ]}
                tooltip="Mã định danh duy nhất (ví dụ: NCC-HN, NCC-SABECO)"
              >
                <Input
                  placeholder="VD: NCC-HN-001"
                  style={{ textTransform: "uppercase" }}
                  disabled={!!editingSupplier}
                />
              </Form.Item>
            </Col>

            <Col span={14}>
              <Form.Item
                name="name"
                label="Tên nhà cung cấp"
                rules={[
                  { required: true, message: "Vui lòng nhập tên nhà cung cấp!" },
                  { max: 150, message: "Tối đa 150 ký tự" },
                ]}
              >
                <Input placeholder="VD: Công ty TNHH Bia Hà Nội" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="tax_code"
                label="Mã số thuế"
                rules={[{ max: 50, message: "Tối đa 50 ký tự" }]}
              >
                <Input placeholder="VD: 0100100998" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="contact_person"
                label="Người đại diện / liên hệ"
                rules={[{ max: 100, message: "Tối đa 100 ký tự" }]}
              >
                <Input placeholder="VD: Nguyễn Văn A (Phụ trách giao nhận)" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="payment_terms"
                label="Điều khoản thanh toán"
                tooltip="Quy định hạn trả nợ và hình thức thanh toán khi nhập hàng"
              >
                <Select
                  placeholder="Chọn hoặc nhập điều khoản"
                  allowClear
                  showSearch
                >
                  {PAYMENT_TERM_OPTIONS.map((opt) => (
                    <Option key={opt} value={opt}>
                      {opt}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại liên hệ"
                rules={[{ max: 20, message: "Tối đa 20 ký tự" }]}
              >
                <Input placeholder="VD: 02438631122" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="address" label="Địa chỉ văn phòng / kho">
            <TextArea
              rows={2}
              placeholder="VD: 183 Hoàng Hoa Thám, Ba Đình, Hà Nội"
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Trạng thái giao dịch"
            valuePropName="checked"
          >
            <Space align="center">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngừng GD" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Gạt tắt để chuyển sang "Ngừng giao dịch" nếu tạm dừng nhập hàng.
              </Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL HỨNG LỖI RÀNG BUỘC PHIẾU NHẬP KHO TỪ API (HTTP 400 CONSTRAINT) */}
      {/* ========================================================================= */}
      <Modal
        open={constraintModal.visible}
        onCancel={() =>
          setConstraintModal({ visible: false, supplier: null, errorMessage: "" })
        }
        footer={[
          <Button
            key="cancel"
            onClick={() =>
              setConstraintModal({
                visible: false,
                supplier: null,
                errorMessage: "",
              })
            }
          >
            Đóng
          </Button>,
          <Button
            key="deactivate"
            type="primary"
            danger
            icon={<StopOutlined />}
            loading={loading}
            onClick={handleQuickDeactivateFromConstraint}
          >
            Chuyển sang "Ngừng giao dịch" ngay
          </Button>,
        ]}
        width={560}
      >
        <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
          <ExclamationCircleOutlined
            style={{ fontSize: 52, color: "#e11d48", marginBottom: 16 }}
          />
          <Title level={4} style={{ color: "#9f1239", margin: 0 }}>
            Không thể xóa nhà cung cấp do ràng buộc chứng từ
          </Title>
        </div>

        <Alert
          type="error"
          showIcon
          style={{ marginTop: 16, borderRadius: 8 }}
          message={
            <span style={{ fontWeight: 600 }}>Ràng buộc nghiệp vụ (SCRUM-79):</span>
          }
          description={
            <Paragraph style={{ margin: 0, marginTop: 4, fontSize: 13 }}>
              {constraintModal.errorMessage ||
                "Nhà cung cấp này đã có phiếu nhập kho liên quan trong hệ thống. Tuyệt đối không được phép xóa khỏi cơ sở dữ liệu để bảo toàn tính toàn vẹn dữ liệu sổ kho."}
            </Paragraph>
          }
        />

        <div
          style={{
            marginTop: 16,
            padding: 14,
            backgroundColor: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <Text strong style={{ color: "#334155" }}>
            Giải pháp xử lý nghiệp vụ khuyến nghị:
          </Text>
          <ul style={{ paddingLeft: 20, margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            <li>
              Chuyển trạng thái nhà cung cấp sang{" "}
              <Text strong style={{ color: "#dc2626" }}>
                "Ngừng giao dịch" (is_active = False)
              </Text>
              .
            </li>
            <li>
              Nhà cung cấp sẽ không còn được gợi ý khi nhân viên lập phiếu nhập kho mới, đồng thời các phiếu nhập kho đã ghi sổ trong quá khứ vẫn được giữ nguyên đầy đủ.
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default SupplierManagement;
