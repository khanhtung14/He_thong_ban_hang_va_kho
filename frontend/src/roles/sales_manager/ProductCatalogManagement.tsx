import React, { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
  Space,
  Popconfirm,
  message,
  Typography,
  Row,
  Col,
  Tooltip,
  Image,
  Divider,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
  PictureOutlined,
  DollarOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;
const { Option } = Select;

interface ProductUnitItem {
  id?: number;
  unitName: string;
  conversionRate: number;
  barcode?: string;
  isBaseUnit?: boolean;
}

interface ProductItem {
  id: number;
  sku: string;
  name: string;
  categoryId?: number;
  category_id?: number;
  category?: string;
  baseUnit: string;
  manageByLot: boolean;
  minStock: number;
  basePrice?: number;
  costPrice?: number;
  cost_price?: number;
  margin?: string;
  status: string;
  imageUrl?: string;
  units?: ProductUnitItem[];
}

interface CategoryOption {
  id: number;
  name: string;
  code?: string;
}

export const ProductCatalogManagement: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);

  // Modal Thêm / Sửa sản phẩm
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Tải danh mục nhóm hàng
  const fetchCategories = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/categories");
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setCategories(list);
      }
    } catch {
      // Bỏ qua lỗi load categories phụ
    }
  };

  // Tải danh sách sản phẩm
  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.append("keyword", keyword.trim());
      if (selectedCategory) params.append("categoryId", String(selectedCategory));
      if (selectedStatus) params.append("status", selectedStatus);

      const url = `/api/v1/products${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await authenticatedFetch(url);
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setProducts(list);
      } else {
        message.error("Không thể tải danh sách sản phẩm.");
      }
    } catch {
      message.error("Lỗi mạng khi tải danh sách sản phẩm.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchProducts();
  }, []);

  const handleSearch = () => {
    fetchProducts();
  };

  const handleResetFilter = () => {
    setKeyword("");
    setSelectedCategory(undefined);
    setSelectedStatus(undefined);
    setTimeout(() => {
      fetchProducts();
    }, 0);
  };

  // Mở modal tạo mới
  const handleOpenCreate = () => {
    setEditingProduct(null);
    form.resetFields();
    form.setFieldsValue({
      status: "ACTIVE",
      baseUnit: "Cái",
      manageByLot: false,
      minStock: 0,
      basePrice: 0,
      costPrice: 0,
      units: [],
    });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEdit = async (record: ProductItem) => {
    setEditingProduct(record);
    form.resetFields();

    // Lấy chi tiết kèm units nếu có
    let fullUnits = record.units || [];
    try {
      const res = await authenticatedFetch(`/api/v1/products/${record.id}`);
      if (res.ok) {
        const json = await res.json();
        const detail = json.data || json;
        if (detail.units) fullUnits = detail.units;
      }
    } catch {
      // Giữ units từ bảng
    }

    form.setFieldsValue({
      sku: record.sku,
      name: record.name,
      categoryId: record.categoryId || record.category_id,
      baseUnit: record.baseUnit,
      manageByLot: record.manageByLot,
      minStock: record.minStock,
      basePrice: record.basePrice || 0,
      costPrice: record.costPrice ?? record.cost_price ?? 0,
      imageUrl: record.imageUrl,
      status: record.status,
      units: (fullUnits || []).filter((u: any) => !u.is_base_unit && u.unitName !== record.baseUnit),
    });
    setIsModalOpen(true);
  };

  // Lưu tạo mới hoặc cập nhật
  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingProduct) {
        // Cập nhật sản phẩm
        const payload = {
          name: values.name,
          categoryId: values.categoryId || null,
          baseUnit: values.baseUnit,
          manageByLot: values.manageByLot,
          minStock: values.minStock,
          basePrice: values.basePrice,
          costPrice: values.costPrice,
          imageUrl: values.imageUrl || null,
          status: values.status,
          units: values.units || [],
        };
        const res = await authenticatedFetch(`/api/v1/products/${editingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const resJson = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resJson.detail || resJson.message || "Không thể cập nhật sản phẩm.");
        }
        message.success(resJson.message || "Cập nhật sản phẩm thành công!");
      } else {
        // Tạo mới sản phẩm
        const payload = {
          sku: values.sku.trim().toUpperCase(),
          name: values.name.trim(),
          categoryId: values.categoryId || null,
          baseUnit: values.baseUnit.trim(),
          manageByLot: values.manageByLot,
          minStock: values.minStock,
          basePrice: values.basePrice,
          costPrice: values.costPrice,
          imageUrl: values.imageUrl || null,
          status: values.status || "ACTIVE",
          units: values.units || [],
        };
        const res = await authenticatedFetch("/api/v1/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const resJson = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(resJson.detail || resJson.message || "Không thể tạo sản phẩm.");
        }
        message.success(resJson.message || "Tạo sản phẩm mới thành công!");
      }

      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      message.error(err.message || "Đã xảy ra lỗi vui lòng kiểm tra lại dữ liệu.");
    } finally {
      setSubmitting(false);
    }
  };

  // Đổi trạng thái Ngừng / Tiếp tục kinh doanh
  const handleToggleStatus = async (record: ProductItem) => {
    const nextStatus = record.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      const res = await authenticatedFetch(`/api/v1/products/${record.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.detail || "Không thể đổi trạng thái.");
      }
      message.success(json.message || "Cập nhật trạng thái thành công!");
      fetchProducts();
    } catch (err: any) {
      message.error(err.message || "Lỗi khi cập nhật trạng thái.");
    }
  };

  // Xóa sản phẩm (nếu chưa phát sinh giao dịch)
  const handleDeleteProduct = async (record: ProductItem) => {
    try {
      const res = await authenticatedFetch(`/api/v1/products/${record.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.detail ||
            "Sản phẩm đã phát sinh giao dịch nên không thể xoá, chỉ có thể chuyển sang 'Ngừng kinh doanh'."
        );
      }
      message.success(json.message || "Đã xoá sản phẩm thành công!");
      fetchProducts();
    } catch (err: any) {
      Modal.error({
        title: "Không thể xoá sản phẩm",
        content: err.message,
        okText: "Đã hiểu",
      });
    }
  };

  const columns: ColumnsType<ProductItem> = [
    {
      title: "Ảnh",
      dataIndex: "imageUrl",
      key: "imageUrl",
      width: 70,
      align: "center",
      render: (url) =>
        url ? (
          <Image
            src={url}
            alt="SKU"
            width={40}
            height={40}
            style={{ objectFit: "cover", borderRadius: 4 }}
            fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='%23f0f0f0'/></svg>"
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              backgroundColor: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#bfbfbf",
              margin: "0 auto",
            }}
          >
            <PictureOutlined />
          </div>
        ),
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (sku) => (
        <Text strong copyable style={{ color: "#1677ff", fontFamily: "monospace" }}>
          {sku}
        </Text>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      render: (name, record) => (
        <div>
          <Text strong>{name}</Text>
          {record.manageByLot && (
            <Tag color="cyan" style={{ marginLeft: 8, fontSize: 11 }}>
              Lô & HSD
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "Nhóm hàng",
      dataIndex: "category",
      key: "category",
      width: 160,
      render: (cat) => cat ? <Tag color="geekblue">{cat}</Tag> : <Text type="secondary">Chưa phân nhóm</Text>,
    },
    {
      title: "ĐVT cơ sở",
      dataIndex: "baseUnit",
      key: "baseUnit",
      width: 100,
      align: "center",
      render: (unit) => <Tag color="blue">{unit || "Cái"}</Tag>,
    },
    {
      title: "Giá bán niêm yết",
      dataIndex: "basePrice",
      key: "basePrice",
      width: 130,
      align: "right",
      render: (price) =>
        price !== undefined && price !== null
          ? `${Number(price).toLocaleString("vi-VN")} ₫`
          : "-",
    },
    {
      title: (
        <Tooltip title="Chỉ Quản lý kinh doanh mới có quyền xem và sửa giá vốn">
          <span>Giá vốn (COGS) <DollarOutlined style={{ color: "#52c41a" }} /></span>
        </Tooltip>
      ),
      key: "costPrice",
      width: 130,
      align: "right",
      render: (_, record) => {
        const cost = record.costPrice ?? record.cost_price;
        return cost !== undefined && cost !== null ? (
          <Text strong style={{ color: "#389e0d" }}>
            {Number(cost).toLocaleString("vi-VN")} ₫
          </Text>
        ) : (
          <Text type="secondary">Bảo mật</Text>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      align: "center",
      render: (status) =>
        status === "ACTIVE" ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đang kinh doanh
          </Tag>
        ) : (
          <Tag color="error" icon={<StopOutlined />}>
            Ngừng kinh doanh
          </Tag>
        ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 150,
      align: "center",
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Chỉnh sửa sản phẩm & Giá vốn">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ color: "#1677ff" }} />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Tooltip
            title={
              record.status === "ACTIVE"
                ? "Chuyển sang Ngừng kinh doanh"
                : "Tiếp tục kinh doanh"
            }
          >
            <Button
              type="text"
              size="small"
              icon={
                record.status === "ACTIVE" ? (
                  <StopOutlined style={{ color: "#faad14" }} />
                ) : (
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                )
              }
              onClick={() => handleToggleStatus(record)}
            />
          </Tooltip>
          <Tooltip title="Xoá sản phẩm (Chặn nếu đã phát sinh giao dịch)">
            <Popconfirm
              title="Xoá sản phẩm"
              description={`Bạn có chắc muốn xoá sản phẩm "${record.sku}"? Hệ thống sẽ chặn nếu đã có giao dịch.`}
              onConfirm={() => handleDeleteProduct(record)}
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      style={{
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Quản lý danh mục sản phẩm (Product Catalog)
          </Title>
          <Text type="secondary">
            Khai báo chuẩn hóa mã SKU, tên hàng, ĐVT, quy cách đóng gói và bảo mật giá vốn toàn công ty
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchCategories();
              fetchProducts();
            }}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ borderRadius: 6 }}
          >
            Thêm sản phẩm mới
          </Button>
        </Space>
      </div>

      {/* Thanh bộ lọc */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} md={8}>
          <Input
            placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
            allowClear
          />
        </Col>
        <Col xs={12} sm={6} md={6}>
          <Select
            placeholder="Lọc theo nhóm hàng"
            style={{ width: "100%" }}
            allowClear
            value={selectedCategory}
            onChange={(val) => setSelectedCategory(val)}
          >
            {categories.map((c) => (
              <Option key={c.id} value={c.id}>
                {c.name}
              </Option>
            ))}
          </Select>
        </Col>
        <Col xs={12} sm={5} md={5}>
          <Select
            placeholder="Trạng thái kinh doanh"
            style={{ width: "100%" }}
            allowClear
            value={selectedStatus}
            onChange={(val) => setSelectedStatus(val)}
          >
            <Option value="ACTIVE">Đang kinh doanh</Option>
            <Option value="INACTIVE">Ngừng kinh doanh</Option>
          </Select>
        </Col>
        <Col xs={24} sm={5} md={5}>
          <Space>
            <Button type="primary" onClick={handleSearch}>
              Lọc
            </Button>
            <Button onClick={handleResetFilter}>Đặt lại</Button>
          </Space>
        </Col>
      </Row>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={products}
        loading={loading}
        pagination={{ pageSize: 10, showTotal: (total) => `Tổng cộng ${total} sản phẩm` }}
        bordered
        size="middle"
      />

      {/* Modal Thêm mới / Cập nhật sản phẩm */}
      <Modal
        title={editingProduct ? `Chỉnh sửa sản phẩm: ${editingProduct.sku}` : "Thêm mới sản phẩm"}
        open={isModalOpen}
        onOk={handleSubmitForm}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submitting}
        okText={editingProduct ? "Lưu thay đổi" : "Tạo sản phẩm"}
        cancelText="Hủy"
        width={750}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item
                label="Mã SKU (Duy nhất)"
                name="sku"
                rules={[
                  { required: true, message: "Vui lòng nhập mã SKU" },
                  { pattern: /^[A-Za-z0-9_-]+$/, message: "Mã SKU chỉ gồm chữ cái, số, dấu - hoặc _" },
                ]}
              >
                <Input
                  placeholder="VD: BIA-HN-LON-330"
                  disabled={!!editingProduct}
                  style={{ textTransform: "uppercase" }}
                />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item
                label="Tên sản phẩm"
                name="name"
                rules={[{ required: true, message: "Vui lòng nhập tên sản phẩm" }]}
              >
                <Input placeholder="VD: Bia Hà Nội lon 330ml" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Nhóm hàng" name="categoryId">
                <Select placeholder="Chọn nhóm hàng" allowClear>
                  {categories.map((c) => (
                    <Option key={c.id} value={c.id}>
                      {c.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Đơn vị tính cơ sở (ĐVT cơ sở)"
                name="baseUnit"
                rules={[{ required: true, message: "Vui lòng nhập ĐVT cơ sở" }]}
              >
                <Input placeholder="VD: Lon, Chai, Gói, Hộp..." />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    <span>Giá vốn (COGS)</span>
                    <Tooltip title="Chỉ Quản lý kinh doanh xem và sửa được">
                      <Tag color="green">Bảo mật</Tag>
                    </Tooltip>
                  </Space>
                }
                name="costPrice"
                rules={[{ required: true, message: "Vui lòng nhập giá vốn" }]}
              >
                <InputNumber
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => Number(val?.replace(/\$\s?|(,*)/g, "") || 0)}
                  addonAfter="₫"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Giá bán niêm yết (Gợi ý)" name="basePrice">
                <InputNumber
                  min={0}
                  step={1000}
                  style={{ width: "100%" }}
                  formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(val) => Number(val?.replace(/\$\s?|(,*)/g, "") || 0)}
                  addonAfter="₫"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item label="Link ảnh sản phẩm (URL)" name="imageUrl">
                <Input placeholder="https://example.com/product.jpg" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Trạng thái" name="status">
                <Select>
                  <Option value="ACTIVE">Đang kinh doanh</Option>
                  <Option value="INACTIVE">Ngừng kinh doanh</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Tồn kho tối thiểu an toàn" name="minStock">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Quản lý theo Lô & Hạn sử dụng (FEFO)"
                name="manageByLot"
                valuePropName="checked"
              >
                <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
              </Form.Item>
            </Col>
          </Row>

          {/* Quy cách đóng gói / Bảng đơn vị quy đổi */}
          <Divider orientation="left" plain style={{ margin: "12px 0" }}>
            Quy cách đóng gói & Đơn vị quy đổi
          </Divider>

          <Form.List name="units">
            {(fields, { add, remove }) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: "flex", marginBottom: 4 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, "unitName"]}
                      rules={[{ required: true, message: "Tên ĐVT quy đổi" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="Tên ĐVT (VD: Thùng, Lốc)" style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "conversionRate"]}
                      rules={[{ required: true, message: "Hệ số" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber min={1} placeholder="Hệ số quy đổi" addonAfter="ĐVT gốc" style={{ width: 170 }} />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "barcode"]}
                      style={{ marginBottom: 0 }}
                    >
                      <Input placeholder="Mã vạch (Barcode)" style={{ width: 160 }} />
                    </Form.Item>
                    <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                  </Space>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ unitName: "", conversionRate: 1, barcode: "" })}
                  block
                  icon={<PlusOutlined />}
                  style={{ marginTop: 4 }}
                >
                  Thêm quy cách đóng gói (VD: Thùng 24 lon)
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
};

export default ProductCatalogManagement;
