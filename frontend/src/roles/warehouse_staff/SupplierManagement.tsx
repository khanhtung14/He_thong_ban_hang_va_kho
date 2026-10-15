import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  message,
  Tooltip,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Switch,
  Alert,
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
  getSuppliers,
  createSupplier,
  updateSupplier,
  updateSupplierStatus,
  deleteSupplier,
  type SupplierCreate,
  type SupplierUpdate,
} from "../../services/supplierService";
import type { Supplier } from "../../types/supplier";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Danh sách gợi ý điều khoản thanh toán phổ biến
const PAYMENT_TERM_OPTIONS = [
  "Thanh toán ngay (COD)",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Gối đầu 15 ngày",
  "Gối đầu 30 ngày",
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
        const res = await getSuppliers({
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
      payment_terms: "Net 30",
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    form.resetFields();
    form.setFieldsValue({
      code: supplier.code,
      name: supplier.name,
      tax_code: supplier.tax_code ?? supplier.taxCode,
      contact_person: supplier.contact_person ?? supplier.contactPerson,
      payment_terms: supplier.payment_terms ?? supplier.paymentTerms,
      phone: supplier.phone,
      address: supplier.address,
      is_active: supplier.is_active ?? supplier.isActive ?? true,
    });
    setIsModalOpen(true);
  };

  // Xử lý lưu form thêm/sửa
  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      if (editingSupplier) {
        const payload: SupplierUpdate = {
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

        await updateSupplier(editingSupplier.id, payload);
        message.success(`Cập nhật nhà cung cấp "${payload.name}" thành công!`);
      } else {
        const payload: SupplierCreate = {
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

        await createSupplier(payload);
        message.success(`Thêm mới nhà cung cấp "${payload.name}" thành công!`);
      }

      setIsModalOpen(false);
      form.resetFields();
      loadSuppliers(pagination.current);
    } catch (err: any) {
      if (err.errorFields) return; // Antd form validate error
      message.error(err.message || "Đã xảy ra lỗi khi lưu thông tin.");
    } finally {
      setModalLoading(false);
    }
  };

  // Xử lý chuyển đổi trạng thái Hoạt động / Ngừng giao dịch
  const handleToggleStatus = async (supplier: Supplier) => {
    const currentActive = supplier.is_active ?? supplier.isActive;
    const nextStatus = !currentActive;

    try {
      setLoading(true);
      await updateSupplierStatus(supplier.id, nextStatus);
      message.success(
        `Đã chuyển trạng thái nhà cung cấp "${supplier.name}" sang "${nextStatus ? "Hoạt động" : "Ngừng giao dịch"
        }".`,
      );
      loadSuppliers(pagination.current);
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  // Xử lý Xóa với cơ chế ràng buộc phiếu nhập kho
  const handleDeleteSupplier = async (supplier: Supplier) => {
    const receiptsCount = supplier.receipts_count ?? supplier.receiptsCount ?? 0;
    if (receiptsCount > 0) {
      setConstraintModal({
        visible: true,
        supplier,
        errorMessage: `Nhà cung cấp "${supplier.name}" (Mã: ${supplier.code}) đã có ${receiptsCount} phiếu nhập kho phát sinh trong hệ thống, không thể xóa. Bạn có muốn chuyển sang trạng thái Ngừng giao dịch không?`,
      });
      return;
    }

    try {
      setLoading(true);
      const res = await deleteSupplier(supplier.id);
      message.success(res.message || `Xóa nhà cung cấp "${supplier.name}" thành công!`);
      loadSuppliers(pagination.current);
    } catch (err: any) {
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

  // Chuyển sang Ngừng giao dịch ngay từ Modal cảnh báo ràng buộc
  const handleQuickDeactivateFromConstraint = async () => {
    if (!constraintModal.supplier) return;
    try {
      setLoading(true);
      await updateSupplierStatus(constraintModal.supplier.id, false);
      message.success(
        `Đã chuyển nhà cung cấp "${constraintModal.supplier.name}" sang "Ngừng giao dịch". Dữ liệu chứng từ phiếu nhập kho được bảo toàn.`,
      );
      setConstraintModal({ visible: false, supplier: null, errorMessage: "" });
      loadSuppliers(pagination.current);
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    } finally {
      setLoading(false);
    }
  };

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = pagination.total;
    const active = suppliers.filter((s) => s.is_active ?? s.isActive).length;
    const inactive = suppliers.filter((s) => !(s.is_active ?? s.isActive)).length;
    const withReceipts = suppliers.filter(
      (s) => (s.receipts_count ?? s.receiptsCount ?? 0) > 0,
    ).length;
    return { total, active, inactive, withReceipts };
  }, [pagination.total, suppliers]);

  // Cấu hình các cột cho bảng danh sách
  const columns: ColumnsType<Supplier> = [
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Mã NCC</span>,
      dataIndex: "code",
      key: "code",
      width: 125,
      render: (code: string) => (
        <Tag
          color="blue"
          style={{
            fontWeight: 700,
            fontSize: 13,
            padding: "2px 8px",
            letterSpacing: "0.5px",
            whiteSpace: "nowrap",
          }}
        >
          {code}
        </Tag>
      ),
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Tên nhà cung cấp</span>,
      dataIndex: "name",
      key: "name",
      render: (name: string, record: Supplier) => (
        <div>
          <Text strong style={{ fontSize: 14, color: "#1e293b" }}>
            {name}
          </Text>
          {record.address && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              📍 {record.address}
            </div>
          )}
        </div>
      ),
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Mã số thuế</span>,
      key: "tax_code",
      width: 115,
      render: (_: any, record: Supplier) => {
        const tax = record.tax_code ?? record.taxCode;
        return tax ? (
          <Text code style={{ fontSize: 12, color: "#0f766e", whiteSpace: "nowrap" }}>
            {tax}
          </Text>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            —
          </Text>
        );
      },
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Người liên hệ & SĐT</span>,
      key: "contact",
      width: 160,
      render: (_: any, record: Supplier) => {
        const contact = record.contact_person ?? record.contactPerson;
        return (
          <div style={{ whiteSpace: "nowrap" }}>
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
      title: <span style={{ whiteSpace: "nowrap" }}>Điều khoản thanh toán</span>,
      key: "payment_terms",
      width: 165,
      render: (_: any, record: Supplier) => {
        const terms = record.payment_terms ?? record.paymentTerms;
        return terms ? (
          <Tag color="cyan" style={{ borderRadius: 4, fontWeight: 500, whiteSpace: "nowrap" }}>
            {terms}
          </Tag>
        ) : (
          <Text type="secondary" italic style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            —
          </Text>
        );
      },
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Số phiếu nhập</span>,
      key: "receipts_count",
      width: 115,
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
                whiteSpace: "nowrap",
              }}
            >
              {count} phiếu
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="default" style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>
            0 phiếu
          </Tag>
        );
      },
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Trạng thái</span>,
      key: "is_active",
      width: 135,
      align: "center",
      render: (_: any, record: Supplier) => {
        const active = record.is_active ?? record.isActive;
        return active ? (
          <Tag
            color="success"
            icon={<CheckCircleOutlined />}
            style={{ fontWeight: 500, whiteSpace: "nowrap" }}
          >
            Hoạt động
          </Tag>
        ) : (
          <Tag
            color="default"
            icon={<StopOutlined />}
            style={{ fontWeight: 500, color: "#64748b", whiteSpace: "nowrap" }}
          >
            Ngừng giao dịch
          </Tag>
        );
      },
    },
    {
      title: <span style={{ whiteSpace: "nowrap" }}>Thao tác</span>,
      key: "actions",
      width: 100,
      align: "center",
      render: (_: any, record: Supplier) => {
        const active = record.is_active ?? record.isActive;
        const count = record.receipts_count ?? record.receiptsCount ?? 0;

        return (
          <Space size={4} style={{ whiteSpace: "nowrap" }}>
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
                    ? `Chuyển NCC "${record.name}" sang trạng thái Ngừng giao dịch?`
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

            {count > 0 ? (
              <Tooltip title={`Đã có ${count} phiếu nhập kho phát sinh (Không thể xóa)`}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDeleteSupplier(record)}
                />
              </Tooltip>
            ) : (
              <Tooltip title="Xóa nhà cung cấp">
                <Popconfirm
                  title={`Xóa nhà cung cấp "${record.code}"?`}
                  description="Hành động này không thể hoàn tác nếu nhà cung cấp chưa phát sinh dữ liệu."
                  okText="Xóa"
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
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Header phong cách phẳng (Flat design) đồng bộ toàn hệ thống */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          padding: "20px 24px",
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
            Quản lý danh mục Nhà cung cấp
          </Title>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: "block" }}>
            Khai báo thông tin nhà cung cấp, mã số thuế, điều khoản thanh toán phục vụ truy nguyên nguồn gốc lô hàng khi nhập kho.
          </Text>
        </div>

        <Space size="middle">
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
            style={{
              backgroundColor: "#2563eb",
              borderRadius: 6,
              fontWeight: 500,
            }}
            onClick={handleOpenAddModal}
          >
            Thêm nhà cung cấp
          </Button>
        </Space>
      </div>

      {/* 2. Thống kê nhanh */}
      <Row gutter={16}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#e0f2fe",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0284c7",
                }}
              >
                <ShopOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tổng số nhà cung cấp
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>
                  {stats.total}
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#dcfce7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#16a34a",
                }}
              >
                <CheckCircleOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Đang hoạt động
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                  {stats.active}
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#fee2e2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#dc2626",
                }}
              >
                <StopOutlined style={{ fontSize: 20 }} />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Ngừng giao dịch
                </Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>
                  {stats.inactive}
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 3. Khối tìm kiếm & Bộ lọc */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          border: "1px solid #e2e8f0",
        }}
        bodyStyle={{ padding: 16 }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} md={16}>
            <Input
              placeholder="Tìm kiếm theo Mã, Tên, Mã số thuế, Người liên hệ, SĐT..."
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={() => loadSuppliers(1)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Select
              style={{ width: "100%" }}
              placeholder="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              allowClear
            >
              <Option value={undefined as any}>Tất cả</Option>
              <Option value={true}>Đang hoạt động</Option>
              <Option value={false}>Ngừng giao dịch</Option>
            </Select>
          </Col>
        </Row>
      </Card>

      {/* 4. Bảng danh sách nhà cung cấp */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          overflow: "hidden",
        }}
        bodyStyle={{ padding: 0 }}
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
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* ========================================================================= */}
      {/* 5. MODAL THÊM MỚI / CHỈNH SỬA NHÀ CUNG CẤP */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {editingSupplier
              ? `Chỉnh sửa nhà cung cấp: ${editingSupplier.code}`
              : "Thêm mới nhà cung cấp"}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmitForm}
        confirmLoading={modalLoading}
        okText={editingSupplier ? "Lưu thay đổi" : "Tạo nhà cung cấp"}
        cancelText="Hủy bỏ"
        width={650}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                name="code"
                label="Mã nhà cung cấp"
                rules={[
                  { required: true, message: "Vui lòng nhập mã nhà cung cấp!" },
                  { max: 50, message: "Tối đa 50 ký tự" },
                  { pattern: /^[A-Za-z0-9_-]+$/, message: "Mã chỉ chứa chữ, số, gạch nối" },
                ]}
                tooltip="Mã định danh duy nhất (ví dụ: NCC-VINAMILK, NCC-SABECO). Không thể thay đổi sau khi tạo."
              >
                <Input
                  placeholder="VD: NCC-VINAMILK"
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
                <Input placeholder="VD: Công ty Cổ phần Sữa Việt Nam" />
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
                <Input placeholder="VD: 0300588569" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="contact_person"
                label="Người đại diện / liên hệ"
                rules={[{ max: 100, message: "Tối đa 100 ký tự" }]}
              >
                <Input placeholder="VD: Nguyễn Văn A" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="Số điện thoại liên hệ"
                rules={[{ max: 20, message: "Tối đa 20 ký tự" }]}
              >
                <Input placeholder="VD: 02854155555" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="payment_terms"
                label="Điều khoản thanh toán"
                tooltip="Quy định kỳ hạn thanh toán khi lập phiếu nhập kho"
              >
                <Select
                  placeholder="Chọn điều khoản thanh toán"
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
          </Row>

          <Form.Item name="address" label="Địa chỉ văn phòng / kho">
            <TextArea
              rows={2}
              placeholder="VD: Số 10 Tân Trào, P. Tân Phú, Q. 7, TP.HCM"
            />
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Trạng thái hoạt động"
            valuePropName="checked"
          >
            <Space align="center">
              <Switch checkedChildren="Hoạt động" unCheckedChildren="Ngừng giao dịch" />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Gạt tắt để chuyển sang "Ngừng giao dịch" khi tạm dừng nhập hàng.
              </Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. MODAL CẢNH BÁO RÀNG BUỘC PHIẾU NHẬP KHO KHI XÓA */}
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
            Chuyển sang "Ngừng giao dịch"
          </Button>,
        ]}
        width={560}
      >
        <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
          <ExclamationCircleOutlined
            style={{ fontSize: 48, color: "#faad14", marginBottom: 12 }}
          />
          <Title level={4} style={{ color: "#0f172a", margin: 0 }}>
            Nhà cung cấp đã phát sinh phiếu nhập kho
          </Title>
        </div>

        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16, borderRadius: 8 }}
          message={
            <span style={{ fontWeight: 600 }}>Ràng buộc nghiệp vụ:</span>
          }
          description={
            <Paragraph style={{ margin: 0, marginTop: 4, fontSize: 13 }}>
              {constraintModal.errorMessage ||
                "Nhà cung cấp đã có phiếu nhập kho phát sinh, không thể xóa. Bạn có muốn chuyển sang trạng thái Ngừng giao dịch không?"}
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
            Tác động khi chuyển sang "Ngừng giao dịch":
          </Text>
          <ul style={{ paddingLeft: 20, margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
            <li>
              Nhà cung cấp sẽ bị ẩn khỏi danh sách gợi ý khi nhân viên kho lập phiếu nhập mới.
            </li>
            <li>
              Tất cả các phiếu nhập kho đã lập trong quá khứ được bảo toàn nguyên vẹn phục vụ kiểm kê và đối soát sổ sách kế toán.
            </li>
          </ul>
        </div>
      </Modal>
    </div>
  );
};

export default SupplierManagement;
