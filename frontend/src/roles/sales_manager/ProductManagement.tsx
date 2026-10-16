import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  InputNumber,
  Radio,
  Popconfirm,
  message,
  Typography,
  Tooltip,
  Card,
  Row,
  Col,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  ReloadOutlined,
  FileExcelOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  StopOutlined,
  ShopOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductStatus,
  fetchCategoriesTree,
  type ProductItem,
  type ProductCreatePayload,
  type ProductUpdatePayload,
  type CategoryOption,
} from "../../services/productService";
import { getCurrentUserRole } from "../../services/sessionService";
import { ProductPriceHistoryModal } from "./ProductPriceHistoryModal";

const { Title, Text } = Typography;

export interface ProductManagementProps {
  onNavigate?: (path: string) => void;
}

export const ProductManagement: React.FC<ProductManagementProps> = ({ onNavigate }) => {
  // State danh sách & bộ lọc
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [keyword, setKeyword] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // State Modal Thêm / Sửa
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [form] = Form.useForm();

  // Modal Xem lịch sử thay đổi giá (SCRUM-18)
  const [isPriceHistoryOpen, setIsPriceHistoryOpen] = useState<boolean>(false);
  const [priceHistoryProduct, setPriceHistoryProduct] = useState<{
    id: number;
    sku: string;
    name: string;
    basePrice?: number;
    baseUnit?: string;
  } | null>(null);

  const handleOpenPriceHistory = (record: ProductItem) => {
    setPriceHistoryProduct({
      id: record.id,
      sku: record.sku,
      name: record.name,
      basePrice: record.basePrice ?? record.sale_price,
      baseUnit: record.baseUnit || record.unit || "Cái",
    });
    setIsPriceHistoryOpen(true);
  };

  const handleNavigateToImport = () => {
    if (onNavigate) {
      onNavigate("/manager/products/import-excel");
    } else {
      window.history.pushState({}, "", "/manager/products/import-excel");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // Kiểm tra quyền xem/sửa giá vốn
  const userRole = getCurrentUserRole() || "";
  const canManageFinancials = useMemo(() => {
    const r = userRole.trim().toLowerCase().replace(/[ -]/g, "_");
    return ["sales_manager", "admin", "administrator"].includes(r);
  }, [userRole]);

  // Load danh mục sản phẩm (Category options)
  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchCategoriesTree();
      setCategories(data);
    } catch (err) {
      console.error("Không thể tải danh mục:", err);
    }
  }, []);

  // Flatten categories để hiển thị trong Select dropdown
  const categoryOptions = useMemo(() => {
    const list: { label: string; value: number }[] = [];
    const traverse = (items: CategoryOption[], prefix = "") => {
      items.forEach((item) => {
        list.push({
          label: `${prefix}${item.name}`,
          value: item.id,
        });
        if (item.children && item.children.length > 0) {
          traverse(item.children, `${prefix}— `);
        }
      });
    };
    traverse(categories);
    return list;
  }, [categories]);

  // Load danh sách sản phẩm
  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchProducts({
        keyword,
        categoryId: selectedCategory,
        status: selectedStatus,
      });
      setProducts(res.items);
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, [keyword, selectedCategory, selectedStatus]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Format tiền tệ
  const formatMoney = (val?: number | null) => {
    if (val === undefined || val === null) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  // Mở modal thêm mới
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    form.resetFields();
    form.setFieldsValue({
      baseUnit: "Cái",
      minStock: 0,
      manageByLot: false,
      status: "ACTIVE",
      basePrice: 0,
      costPrice: 0,
    });
    setIsModalOpen(true);
  };

  // Mở modal sửa
  const handleOpenEditModal = (record: ProductItem) => {
    setEditingProduct(record);
    form.resetFields();
    form.setFieldsValue({
      sku: record.sku,
      name: record.name,
      categoryId: record.categoryId || record.category_id || undefined,
      baseUnit: record.baseUnit || record.unit || "Cái",
      description: record.description || record.packaging_spec,
      basePrice: record.basePrice ?? record.sale_price ?? 0,
      costPrice: record.costPrice ?? record.cost_price ?? 0,
      minStock: record.minStock ?? 0,
      manageByLot: record.manageByLot ?? false,
      imageUrl: record.imageUrl || record.image_url,
      status: record.status || "ACTIVE",
    });
    setIsModalOpen(true);
  };

  // Submit Modal Thêm / Sửa
  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingProduct) {
        // Cập nhật
        const payload: ProductUpdatePayload = {
          name: values.name,
          categoryId: values.categoryId || null,
          baseUnit: values.baseUnit,
          basePrice: values.basePrice,
          minStock: values.minStock,
          manageByLot: values.manageByLot,
          imageUrl: values.imageUrl,
          status: values.status,
          description: values.description,
        };
        if (canManageFinancials && values.costPrice !== undefined) {
          payload.costPrice = values.costPrice;
        }

        await updateProduct(editingProduct.id || editingProduct.sku, payload);
        message.success(`Cập nhật sản phẩm '${editingProduct.sku}' thành công!`);
      } else {
        // Tạo mới
        const payload: ProductCreatePayload = {
          sku: values.sku.trim(),
          name: values.name.trim(),
          categoryId: values.categoryId || null,
          baseUnit: values.baseUnit.trim(),
          basePrice: values.basePrice || 0,
          costPrice: canManageFinancials ? values.costPrice || 0 : 0,
          minStock: values.minStock || 0,
          manageByLot: values.manageByLot || false,
          imageUrl: values.imageUrl || undefined,
          status: values.status || "ACTIVE",
          description: values.description,
        };

        await createProduct(payload);
        message.success(`Tạo mới sản phẩm '${payload.name}' thành công!`);
      }

      setIsModalOpen(false);
      loadProducts();
    } catch (err: any) {
      if (err.errorFields) return; // Antd validation
      message.error(err.message || "Thao tác thất bại, vui lòng thử lại.");
    } finally {
      setSubmitting(false);
    }
  };

  // Đổi trạng thái nhanh
  const handleToggleStatus = async (record: ProductItem) => {
    const nextStatus = record.status === "ACTIVE" ? "DISCONTINUED" : "ACTIVE";
    try {
      await updateProductStatus(record.id || record.sku, nextStatus);
      message.success(
        `Đã chuyển trạng thái '${record.sku}' sang ${nextStatus === "ACTIVE" ? "Đang kinh doanh" : "Ngừng kinh doanh"
        }.`,
      );
      loadProducts();
    } catch (err: any) {
      message.error(err.message || "Không thể cập nhật trạng thái.");
    }
  };

  // Xóa sản phẩm với xử lý ràng buộc giao dịch
  const handleDeleteProduct = async (record: ProductItem) => {
    try {
      await deleteProduct(record.id || record.sku);
      message.success(`Đã xóa sản phẩm '${record.sku}' thành công.`);
      loadProducts();
    } catch (err: any) {
      // Nếu sản phẩm đã phát sinh giao dịch (mã lỗi 400 hoặc message nhắc nhở)
      const msg = err.message || "";
      if (msg.includes("phát sinh giao dịch") || err.status === 400) {
        Modal.confirm({
          title: "Sản phẩm đã phát sinh giao dịch",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          content: (
            <div>
              <p>
                Sản phẩm <strong>{record.name}</strong> (mã <code>{record.sku}</code>) đã có dữ liệu giao dịch hoặc đơn hàng trong hệ thống, không thể xóa bỏ để bảo toàn lịch sử sổ sách.
              </p>
              <p style={{ color: "#cf1322", fontWeight: 500 }}>
                Bạn có muốn chuyển trạng thái sản phẩm sang <strong>Ngừng kinh doanh (DISCONTINUED)</strong> ngay không?
              </p>
            </div>
          ),
          okText: "Chuyển sang Ngừng kinh doanh",
          okType: "danger",
          cancelText: "Hủy bỏ",
          onOk: async () => {
            try {
              await updateProductStatus(record.id || record.sku, "DISCONTINUED");
              message.success(
                `Đã chuyển trạng thái sản phẩm '${record.sku}' sang Ngừng kinh doanh.`,
              );
              loadProducts();
            } catch (statusErr: any) {
              message.error(statusErr.message || "Cập nhật trạng thái thất bại.");
            }
          },
        });
      } else {
        message.error(msg || "Không thể xóa sản phẩm.");
      }
    }
  };

  // Cấu hình bảng dữ liệu
  const columns: ColumnsType<ProductItem> = [
    {
      title: "STT",
      key: "stt",
      width: 55,
      align: "center",
      render: (_: any, __: any, index: number) => (
        <Text type="secondary" style={{ fontWeight: 500 }}>
          {(currentPage - 1) * pageSize + index + 1}
        </Text>
      ),
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 125,
      render: (sku: string) => (
        <Tag color="blue" style={{ fontWeight: 600, fontSize: 13 }}>
          {sku}
        </Tag>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      minWidth: 260,
      render: (name: string, record: ProductItem) => (
        <div style={{ wordBreak: "break-word" }}>
          <Text strong style={{ fontSize: 14, color: "#1e293b", display: "block" }}>
            {name}
          </Text>
          {record.description && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Nhóm hàng",
      dataIndex: "category",
      key: "category",
      width: 130,
      render: (cat: string, record: ProductItem) => {
        const catName = cat || (record.categoryId ? `Nhóm #${record.categoryId}` : "Chưa phân loại");
        return (
          <Tag color="purple" style={{ borderRadius: 4 }}>
            {catName}
          </Tag>
        );
      },
    },
    {
      title: "ĐVT",
      dataIndex: "baseUnit",
      key: "baseUnit",
      width: 70,
      align: "center",
      render: (unit: string, record: ProductItem) => (
        <Tag style={{ margin: 0 }}>{unit || record.unit || "Cái"}</Tag>
      ),
    },
    {
      title: "Giá bán",
      dataIndex: "basePrice",
      key: "basePrice",
      width: 160,
      align: "right",
      render: (val: number, record: ProductItem) => (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 6,
            whiteSpace: "nowrap",
          }}
        >
          <Text strong style={{ color: "#0f766e", whiteSpace: "nowrap" }}>
            {formatMoney(val ?? record.sale_price)}
          </Text>
          <Tooltip title="Xem lịch sử thay đổi giá">
            <Button
              type="text"
              size="small"
              style={{ padding: "0 4px", display: "inline-flex", alignItems: "center" }}
              icon={<HistoryOutlined style={{ color: "#722ed1", fontSize: 13 }} />}
              onClick={() => handleOpenPriceHistory(record)}
            />
          </Tooltip>
        </div>
      ),
    },
    {
      title: "Giá vốn",
      dataIndex: "costPrice",
      key: "costPrice",
      width: 120,
      align: "right",
      render: (cost: number | null, record: ProductItem) => {
        if (!canManageFinancials) {
          return (
            <Tooltip title="Giá vốn được bảo mật (chỉ Quản lý kinh doanh xem được)">
              <Tag color="default">***</Tag>
            </Tooltip>
          );
        }
        const actualCost = cost ?? record.cost_price;
        return (
          <div>
            <div style={{ fontWeight: 500, color: "#475569" }}>
              {formatMoney(actualCost)}
            </div>
            {record.margin && (
              <Tag color="green" style={{ fontSize: 11, padding: "0 4px", marginTop: 2 }}>
                Lãi: {record.margin}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 130,
      align: "center",
      render: (st: string) => {
        const isDiscontinued = st === "DISCONTINUED";
        return (
          <Tag
            icon={isDiscontinued ? <StopOutlined /> : <CheckCircleOutlined />}
            color={isDiscontinued ? "error" : "success"}
            style={{ fontWeight: 500 }}
          >
            {isDiscontinued ? "Ngừng kinh doanh" : "Đang kinh doanh"}
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 110,
      align: "center",
      render: (_: any, record: ProductItem) => {
        const isDiscontinued = record.status === "DISCONTINUED";
        return (
          <Space size="small">
            <Tooltip title="Chỉnh sửa">
              <Button
                type="text"
                icon={<EditOutlined style={{ color: "#2563eb" }} />}
                onClick={() => handleOpenEditModal(record)}
              />
            </Tooltip>

            <Tooltip title={isDiscontinued ? "Kích hoạt kinh doanh lại" : "Chuyển sang Ngừng kinh doanh"}>
              <Button
                type="text"
                icon={
                  <SwapOutlined
                    style={{ color: isDiscontinued ? "#16a34a" : "#f59e0b" }}
                  />
                }
                onClick={() => handleToggleStatus(record)}
              />
            </Tooltip>

            <Tooltip title="Xóa sản phẩm">
              <Popconfirm
                title="Xác nhận xóa sản phẩm"
                description={`Bạn có chắc muốn xóa '${record.sku}'? Nếu đã có giao dịch, hệ thống sẽ đề xuất ngừng kinh doanh.`}
                onConfirm={() => handleDeleteProduct(record)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
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

  // Thống kê nhanh
  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.status === "ACTIVE").length;
    const discontinued = total - active;
    return { total, active, discontinued };
  }, [products]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Header dạng phẳng (Flat Header) */}
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
          <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
            Quản lý danh mục sản phẩm
          </Title>
          <Text type="secondary" style={{ fontSize: 13, marginTop: 4, display: "block" }}>
            Khai báo mã SKU, chuẩn hóa tên gọi, quy cách đóng gói và quản lý vòng đời sản phẩm.
          </Text>
        </div>

        <Space size="middle">
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadCategories();
              loadProducts();
            }}
          >
            Làm mới
          </Button>

          <Button
            icon={<FileExcelOutlined />}
            onClick={handleNavigateToImport}
          >
            Nhập Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: "#0284c7" }}
          >
            Thêm sản phẩm
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
                <Text type="secondary" style={{ fontSize: 12 }}>Tổng số sản phẩm</Text>
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
                <Text type="secondary" style={{ fontSize: 12 }}>Đang kinh doanh</Text>
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
                <Text type="secondary" style={{ fontSize: 12 }}>Ngừng kinh doanh</Text>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>
                  {stats.discontinued}
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
          <Col xs={24} md={10}>
            <Input
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Tìm kiếm theo mã SKU hoặc tên sản phẩm..."
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={loadProducts}
            />
          </Col>

          <Col xs={24} sm={12} md={7}>
            <Select
              style={{ width: "100%" }}
              placeholder="Chọn nhóm hàng"
              allowClear
              value={selectedCategory}
              onChange={(val) => setSelectedCategory(val)}
              options={[{ label: "Tất cả nhóm hàng", value: null as any }, ...categoryOptions]}
            />
          </Col>

          <Col xs={24} sm={12} md={7}>
            <Select
              style={{ width: "100%" }}
              value={selectedStatus}
              onChange={(val) => setSelectedStatus(val)}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Đang kinh doanh (ACTIVE)", value: "ACTIVE" },
                { label: "Ngừng kinh doanh (DISCONTINUED)", value: "DISCONTINUED" },
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* 4. Bảng danh sách sản phẩm */}
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
          rowKey={(r) => r.id || r.sku}
          columns={columns}
          dataSource={products}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            showSizeChanger: true,
            showTotal: (total) => `Tổng số ${total} sản phẩm`,
            onChange: (p, ps) => {
              setCurrentPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1150 }}
        />
      </Card>

      {/* 5. Modal Thêm / Chỉnh sửa sản phẩm */}
      <Modal
        title={
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {editingProduct ? `Chỉnh sửa sản phẩm: ${editingProduct.sku}` : "Thêm mới sản phẩm"}
          </div>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleSubmitForm}
        okText={editingProduct ? "Lưu thay đổi" : "Tạo sản phẩm"}
        cancelText="Hủy bỏ"
        confirmLoading={submitting}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="sku"
                label="Mã SKU"
                rules={[
                  { required: true, message: "Vui lòng nhập mã SKU" },
                  { pattern: /^[A-Za-z0-9_-]+$/, message: "Mã SKU chỉ bao gồm chữ, số, gạch ngang" },
                ]}
                tooltip="Mã SKU duy nhất trong toàn hệ thống, không thể đổi sau khi tạo."
              >
                <Input
                  placeholder="Ví dụ: BIA-TIGER-330"
                  disabled={!!editingProduct}
                  style={{ textTransform: "uppercase" }}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="name"
                label="Tên sản phẩm"
                rules={[{ required: true, message: "Vui lòng nhập tên sản phẩm" }]}
              >
                <Input placeholder="Ví dụ: Bia Tiger Lon 330ml" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="categoryId" label="Nhóm hàng / Danh mục">
                <Select
                  placeholder="Chọn nhóm hàng"
                  allowClear
                  options={categoryOptions}
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="baseUnit"
                label="Đơn vị tính cơ sở"
                rules={[{ required: true, message: "Vui lòng nhập ĐVT cơ sở" }]}
              >
                <Input placeholder="Ví dụ: Cái, Lon, Hộp, Thùng..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="basePrice"
                label="Giá bán cơ sở (VNĐ)"
                rules={[{ required: true, message: "Vui lòng nhập giá bán" }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  step={1000}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => val?.replace(/\$\s?|(,*)/g, "") as any}
                  placeholder="0"
                />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="costPrice"
                label="Giá vốn (VNĐ)"
                tooltip={
                  canManageFinancials
                    ? "Giá vốn bí mật, chỉ Quản lý kinh doanh và Quản trị viên được xem và sửa."
                    : "Bạn không có quyền chỉnh sửa giá vốn."
                }
              >
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  step={1000}
                  disabled={!canManageFinancials}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => val?.replace(/\$\s?|(,*)/g, "") as any}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="minStock" label="Mức tồn kho an toàn tối thiểu">
                <InputNumber style={{ width: "100%" }} min={0} placeholder="0" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item name="imageUrl" label="Đường dẫn ảnh sản phẩm (URL)">
                <Input placeholder="https://example.com/product.jpg" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Quy cách đóng gói / Mô tả">
            <Input.TextArea
              rows={2}
              placeholder="Ví dụ: Thùng 24 lon 330ml, bảo quản thoáng mát..."
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="manageByLot" label="Quản lý theo lô & hạn dùng">
                <Radio.Group>
                  <Radio value={false}>Không quản lý</Radio>
                  <Radio value={true}>Có quản lý lô / HSD</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="status"
                label="Trạng thái kinh doanh"
                rules={[{ required: true }]}
              >
                <Radio.Group>
                  <Radio value="ACTIVE">Đang kinh doanh</Radio>
                  <Radio value="DISCONTINUED">Ngừng kinh doanh</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Modal Lịch sử thay đổi giá sản phẩm (SCRUM-18) */}
      <ProductPriceHistoryModal
        visible={isPriceHistoryOpen}
        product={priceHistoryProduct}
        onClose={() => {
          setIsPriceHistoryOpen(false);
          setPriceHistoryProduct(null);
        }}
      />
    </div>
  );
};

export default ProductManagement;
