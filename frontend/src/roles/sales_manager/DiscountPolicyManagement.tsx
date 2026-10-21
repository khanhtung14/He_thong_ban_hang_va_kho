import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tag,
  Space,
  Popconfirm,
  message,
  Typography,
  Alert,
  Tooltip,
  Row,
  Col,
  Empty,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  SearchOutlined,
  PercentageOutlined,
  TagOutlined,
  InfoCircleOutlined,
  ShoppingOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;

export interface DiscountTierItem {
  id?: number;
  min_quantity: number;
  max_quantity?: number | null;
  discount_value: number;
}

export interface DiscountPolicyItem {
  id: number;
  name: string;
  target_type: "SKU" | "CATEGORY";
  target_id: string;
  target_name?: string;
  discount_type: "PERCENTAGE" | "FIXED_AMOUNT";
  is_active: boolean;
  created_at?: string;
  tiers: DiscountTierItem[];
}

interface ProductOption {
  sku: string;
  name: string;
  base_price?: number;
}

interface CategoryOption {
  id: number | string;
  code?: string;
  name: string;
}

export const DiscountPolicyManagement: React.FC = () => {
  const [policies, setPolicies] = useState<DiscountPolicyItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Modal create/edit state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<DiscountPolicyItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Watch form fields for dynamic UI
  const targetType = Form.useWatch("target_type", form);
  const discountType = Form.useWatch("discount_type", form);

  // 1. Fetch policies
  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/v1/discounts");
      if (res.ok) {
        const json = await res.json();
        const data = Array.isArray(json) ? json : json.data || [];
        setPolicies(data);
      } else {
        message.error("Không thể tải danh sách chính sách chiết khấu.");
      }
    } catch {
      message.error("Lỗi kết nối khi tải danh sách chiết khấu.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch products and categories for select options
  const fetchOptions = useCallback(async () => {
    try {
      const [resProd, resCat] = await Promise.all([
        authenticatedFetch("/api/v1/products?limit=1000"),
        authenticatedFetch("/api/v1/categories?page_size=100"),
      ]);

      if (resProd.ok) {
        const json = await resProd.json();
        const list = Array.isArray(json) ? json : json.data || json.items || [];
        setProducts(
          list.map((p: any) => ({
            sku: p.sku || "",
            name: p.name || "",
            base_price: p.base_price,
          }))
        );
      }

      if (resCat.ok) {
        const json = await resCat.json();
        const list = Array.isArray(json) ? json : json.data || [];
        setCategories(
          list.map((c: any) => ({
            id: String(c.id),
            code: c.code || "",
            name: c.name || "",
          }))
        );
      }
    } catch {
      console.warn("Could not fetch auxiliary product/category options");
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
    fetchOptions();
  }, [fetchPolicies, fetchOptions]);

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingPolicy(null);
    form.resetFields();
    form.setFieldsValue({
      name: "",
      target_type: "SKU",
      target_id: undefined,
      discount_type: "PERCENTAGE",
      is_active: true,
      tiers: [
        { min_quantity: 10, max_quantity: 49, discount_value: 5 },
        { min_quantity: 50, max_quantity: undefined, discount_value: 10 },
      ],
    });
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (record: DiscountPolicyItem) => {
    setEditingPolicy(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      target_type: record.target_type,
      target_id: record.target_id,
      discount_type: record.discount_type,
      is_active: record.is_active,
      tiers:
        record.tiers && record.tiers.length > 0
          ? record.tiers.map((t) => ({
            min_quantity: t.min_quantity,
            max_quantity: t.max_quantity ?? undefined,
            discount_value: t.discount_value,
          }))
          : [{ min_quantity: 1, max_quantity: undefined, discount_value: 5 }],
    });
    setIsModalOpen(true);
  };

  // Submit Create or Edit
  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      let cleanTargetId = String(values.target_id || "").trim();
      if (values.target_type === "CATEGORY") {
        // Đảm bảo target_id gửi lên là ID của category (string), KHÔNG gửi chuỗi label tên nhóm
        const foundCategory = categories.find(
          (c) =>
            String(c.id) === cleanTargetId ||
            (c.code && c.code.toLowerCase() === cleanTargetId.toLowerCase()) ||
            (c.name && c.name.toLowerCase() === cleanTargetId.toLowerCase()) ||
            (c.code && `${c.name} (${c.code})`.toLowerCase() === cleanTargetId.toLowerCase())
        );
        if (foundCategory) {
          cleanTargetId = String(foundCategory.id);
        } else if (cleanTargetId.includes("(") && cleanTargetId.endsWith(")")) {
          const codeInside = cleanTargetId.slice(cleanTargetId.lastIndexOf("(") + 1, -1).trim();
          const foundByCode = categories.find((c) => c.code?.toLowerCase() === codeInside.toLowerCase());
          if (foundByCode) {
            cleanTargetId = String(foundByCode.id);
          }
        }
      }

      const payload = {
        name: values.name.trim(),
        target_type: values.target_type,
        target_id: cleanTargetId,
        discount_type: values.discount_type,
        is_active: values.is_active ?? true,
        tiers: (values.tiers || []).map((t: any) => {
          const rawMax = t.max_quantity;
          const maxQty =
            rawMax !== undefined &&
              rawMax !== null &&
              String(rawMax).trim() !== "" &&
              !isNaN(Number(rawMax))
              ? Number(rawMax)
              : null;

          return {
            min_quantity: Number(t.min_quantity) || 1,
            max_quantity: maxQty,
            discount_value: Number(t.discount_value) || 0,
          };
        }),
      };

      const url = editingPolicy
        ? `/api/v1/discounts/${editingPolicy.id}`
        : "/api/v1/discounts";
      const method = editingPolicy ? "PUT" : "POST";

      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.detail || "Không thể lưu chính sách chiết khấu.");
      }

      message.success(
        editingPolicy
          ? "Đã cập nhật chính sách chiết khấu thành công!"
          : "Đã thêm mới chính sách chiết khấu thành công!"
      );
      setIsModalOpen(false);
      fetchPolicies();
    } catch (err: any) {
      message.error(err.message || "Đã xảy ra lỗi khi lưu chính sách.");
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active status
  const handleToggleStatus = async (record: DiscountPolicyItem) => {
    const originalStatus = record.is_active;
    // Optimistic UI update
    setPolicies((prev) =>
      prev.map((item) =>
        item.id === record.id ? { ...item, is_active: !originalStatus } : item
      )
    );

    try {
      const res = await authenticatedFetch(
        `/api/v1/discounts/${record.id}/toggle-status`,
        { method: "PATCH" }
      );
      if (res.ok) {
        const data = await res.json();
        const updatedPolicy = data.data || data;
        message.success(
          `Đã ${updatedPolicy.is_active ? "kích hoạt" : "ngừng áp dụng"} chính sách "${record.name}"`
        );
      } else {
        throw new Error("Không thể cập nhật trạng thái");
      }
    } catch {
      message.error("Lỗi khi thay đổi trạng thái chính sách.");
      // Rollback on error
      setPolicies((prev) =>
        prev.map((item) =>
          item.id === record.id ? { ...item, is_active: originalStatus } : item
        )
      );
    }
  };

  // Delete policy
  const handleDeletePolicy = async (id: number) => {
    try {
      const res = await authenticatedFetch(`/api/v1/discounts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        message.success("Đã xóa chính sách chiết khấu thành công.");
        setPolicies((prev) => prev.filter((item) => item.id !== id));
      } else {
        const err = await res.json().catch(() => null);
        message.error(err?.detail || "Không thể xóa chính sách chiết khấu.");
      }
    } catch {
      message.error("Lỗi khi xóa chính sách chiết khấu.");
    }
  };

  // Filtered policies
  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      const matchSearch =
        !searchTerm ||
        (p.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.target_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.target_name && p.target_name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType =
        typeFilter === "ALL" || p.target_type === typeFilter;

      return matchSearch && matchType;
    });
  }, [policies, searchTerm, typeFilter]);

  // Columns definition
  const columns: ColumnsType<DiscountPolicyItem> = [
    {
      title: "Tên chính sách",
      dataIndex: "name",
      key: "name",
      width: 250,
      render: (name: string, record: DiscountPolicyItem) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 14 }}>
            {name}
          </Text>
          {record.created_at && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tạo ngày: {new Date(record.created_at).toLocaleDateString("vi-VN")}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Đối tượng áp dụng",
      key: "target",
      width: 260,
      render: (_, record: DiscountPolicyItem) => {
        const isSku = record.target_type === "SKU";
        const targetIdStr = record.target_id || "";
        const catObj = !isSku
          ? categories.find(
            (c) => String(c.id) === String(targetIdStr) || c.code === targetIdStr
          )
          : null;
        const resolvedName =
          !isSku && catObj
            ? catObj.code
              ? `${catObj.name} (${catObj.code})`
              : catObj.name
            : record.target_name;
        return (
          <Space direction="vertical" size={2}>
            <div>
              <Tag
                color={isSku ? "blue" : "purple"}
                icon={isSku ? <ShoppingOutlined /> : <AppstoreOutlined />}
                style={{ borderRadius: 4, fontWeight: 500 }}
              >
                {isSku ? "Sản phẩm (SKU)" : "Nhóm hàng (Category)"}
              </Tag>
              {targetIdStr ? (
                <Tag style={{ borderRadius: 4, fontFamily: "monospace" }}>
                  {targetIdStr}
                </Tag>
              ) : null}
            </div>
            {resolvedName && (
              <Text style={{ fontSize: 13, color: "#475569" }}>
                {resolvedName}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Loại chiết khấu",
      dataIndex: "discount_type",
      key: "discount_type",
      width: 170,
      render: (type: string) => {
        const isPercent = type === "PERCENTAGE";
        return (
          <Tag
            color={isPercent ? "green" : "orange"}
            icon={isPercent ? <PercentageOutlined /> : <TagOutlined />}
            style={{ borderRadius: 4, fontSize: 12, padding: "2px 8px" }}
          >
            {isPercent ? "% Phần trăm" : "Số tiền cố định"}
          </Tag>
        );
      },
    },
    {
      title: "Tóm tắt các bậc chiết khấu",
      key: "tiers",
      render: (_, record: DiscountPolicyItem) => {
        const isPercent = record.discount_type === "PERCENTAGE";
        const tiers = record.tiers || [];
        if (!tiers || tiers.length === 0) {
          return <Text type="secondary">Chưa thiết lập bậc</Text>;
        }
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {tiers.map((tier, idx) => {
              const qtyLabel =
                tier.max_quantity !== null && tier.max_quantity !== undefined
                  ? `${tier.min_quantity} - ${tier.max_quantity}`
                  : `≥ ${tier.min_quantity}`;
              const val = tier.discount_value ?? (tier as any).discount_percent ?? 0;
              const valLabel = isPercent
                ? `${val}%`
                : `${Number(val).toLocaleString("vi-VN")} ₫`;
              return (
                <Tag
                  key={idx}
                  style={{
                    background: "#f8fafc",
                    borderColor: "#e2e8f0",
                    borderRadius: 6,
                    padding: "2px 8px",
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    SL {qtyLabel}:
                  </Text>{" "}
                  <Text strong style={{ color: "#0284c7" }}>
                    -{valLabel}
                  </Text>
                </Tag>
              );
            })}
          </div>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      width: 130,
      render: (isActive: boolean, record: DiscountPolicyItem) => (
        <Space size={8}>
          <Switch
            checked={isActive}
            onChange={() => handleToggleStatus(record)}
            size="small"
          />
          <Text style={{ fontSize: 12, color: isActive ? "#16a34a" : "#94a3b8" }}>
            {isActive ? "Đang áp dụng" : "Tạm ngưng"}
          </Text>
        </Space>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 110,
      align: "center",
      render: (_, record: DiscountPolicyItem) => (
        <Space size="small">
          <Tooltip title="Chỉnh sửa chính sách">
            <Button
              type="text"
              icon={<EditOutlined style={{ color: "#2563eb" }} />}
              onClick={() => handleOpenEditModal(record)}
              size="small"
            />
          </Tooltip>
          <Popconfirm
            title="Xóa chính sách chiết khấu"
            description={`Bạn có chắc muốn xóa vĩnh viễn chính sách "${record.name}"?`}
            onConfirm={() => handleDeletePolicy(record.id)}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Xóa chính sách">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tiêu đề trang & Thanh điều khiển */}
      <Card
        bordered={false}
        style={{
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          borderRadius: 8,
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Title level={4} style={{ margin: 0 }}>
              Khai báo chính sách chiết khấu theo sản lượng
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Cấu hình bậc chiết khấu theo số lượng mua cho từng SKU hoặc Nhóm hàng. Tự động áp dụng giá có lợi nhất cho khách hàng.
            </Text>
          </Col>
          <Col xs={24} md={12} style={{ textAlign: "right" }}>
            <Space wrap>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  fetchPolicies();
                  fetchOptions();
                }}
                loading={loading}
              >
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenCreateModal}
                style={{
                  background: "#0284c7",
                  borderColor: "#0284c7",
                  borderRadius: 6,
                }}
              >
                Thêm chính sách chiết khấu
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Thanh tìm kiếm & bộ lọc */}
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <Input
            placeholder="Tìm theo tên chính sách, mã SKU, nhóm hàng..."
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Radio.Group
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            buttonStyle="solid"
          >
            <Radio.Button value="ALL">Tất cả đối tượng</Radio.Button>
            <Radio.Button value="SKU">Theo SKU</Radio.Button>
            <Radio.Button value="CATEGORY">Theo Nhóm hàng</Radio.Button>
          </Radio.Group>
        </div>
      </Card>

      {/* Bảng danh sách chính sách */}
      <Card
        bordered={false}
        style={{
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          borderRadius: 8,
        }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          columns={columns}
          dataSource={filteredPolicies}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng cộng ${total} chính sách chiết khấu`,
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Chưa có chính sách chiết khấu nào"
              >
                <Button type="primary" onClick={handleOpenCreateModal}>
                  Tạo chính sách đầu tiên
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Modal Thêm mới / Chỉnh sửa */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PercentageOutlined style={{ color: "#0284c7", fontSize: 18 }} />
            <span>
              {editingPolicy
                ? "Chỉnh sửa chính sách chiết khấu"
                : "Thêm chính sách chiết khấu theo sản lượng"}
            </span>
          </div>
        }
        open={isModalOpen}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={submitting}
        okText={editingPolicy ? "Cập nhật" : "Tạo chính sách"}
        cancelText="Đóng"
        width={720}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="Quy tắc áp dụng chiết khấu tự động"
          description="Nhiều chính sách cùng áp dụng thì hệ thống tự động chọn chính sách có lợi nhất (mức giảm cao nhất) cho khách hàng."
          style={{ marginBottom: 20, borderRadius: 8 }}
        />

        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label="Tên chính sách chiết khấu"
            name="name"
            rules={[
              { required: true, message: "Vui lòng nhập tên chính sách chiết khấu" },
              { min: 3, message: "Tên chính sách cần ít nhất 3 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: Chiết khấu sản lượng Nước giải khát Tết 2026" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Đối tượng áp dụng"
                name="target_type"
                rules={[{ required: true }]}
              >
                <Radio.Group
                  onChange={() => form.setFieldValue("target_id", undefined)}
                >
                  <Radio value="SKU">Theo sản phẩm (SKU)</Radio>
                  <Radio value="CATEGORY">Theo nhóm hàng (Category)</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={
                  targetType === "SKU"
                    ? "Chọn mã sản phẩm (SKU)"
                    : "Chọn nhóm hàng áp dụng"
                }
                name="target_id"
                rules={[
                  { required: true, message: "Vui lòng chọn đối tượng áp dụng" },
                ]}
              >
                {targetType === "SKU" ? (
                  <Select
                    placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? "")
                        .toString()
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    options={products.map((p) => ({
                      value: p.sku,
                      label: `${p.sku} - ${p.name}`,
                    }))}
                  />
                ) : (
                  <Select
                    placeholder="Chọn nhóm hàng áp dụng..."
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? "")
                        .toString()
                        .toLowerCase()
                        .includes(input.toLowerCase())
                    }
                    options={categories.map((c) => ({
                      value: String(c.id),
                      label: c.code ? `${c.name} (${c.code})` : c.name,
                    }))}
                  />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Loại chiết khấu"
                name="discount_type"
                rules={[{ required: true }]}
              >
                <Radio.Group>
                  <Radio value="PERCENTAGE">% Phần trăm</Radio>
                  <Radio value="FIXED_AMOUNT">Số tiền cố định (đ/đơn vị)</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Trạng thái kích hoạt"
                name="is_active"
                valuePropName="checked"
              >
                <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
              </Form.Item>
            </Col>
          </Row>

          {/* Cấu hình bậc chiết khấu (Form.List) */}
          <div
            style={{
              marginTop: 12,
              padding: 16,
              background: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div>
                <Text strong style={{ fontSize: 14 }}>
                  Cấu hình các bậc chiết khấu (Tiers)
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Quy định số lượng tối thiểu và mức giảm tương ứng. Để trống "Đến số lượng" cho bậc không giới hạn trên.
                </Text>
              </div>
            </div>

            <Form.List
              name="tiers"
              rules={[
                {
                  validator: async (_, tiers) => {
                    if (!tiers || tiers.length < 1) {
                      return Promise.reject(new Error("Cần ít nhất 1 bậc chiết khấu"));
                    }
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Row key={key} gutter={12} align="middle">
                      <Col span={7}>
                        <Form.Item
                          {...restField}
                          name={[name, "min_quantity"]}
                          label={index === 0 ? "Từ số lượng" : undefined}
                          rules={[
                            { required: true, message: "Nhập SL từ" },
                            {
                              type: "number",
                              min: 1,
                              message: "SL tối thiểu từ 1",
                            },
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={1}
                            style={{ width: "100%" }}
                            placeholder="Từ SL (>=1)"
                          />
                        </Form.Item>
                      </Col>

                      <Col span={7}>
                        <Form.Item
                          {...restField}
                          name={[name, "max_quantity"]}
                          label={index === 0 ? "Đến số lượng" : undefined}
                          dependencies={[[name, "min_quantity"]]}
                          rules={[
                            ({ getFieldValue }) => ({
                              validator(_, value) {
                                if (value === undefined || value === null) {
                                  return Promise.resolve();
                                }
                                const min = getFieldValue(["tiers", name, "min_quantity"]);
                                if (min && value <= min) {
                                  return Promise.reject(
                                    new Error("Đến SL phải lớn hơn Từ SL")
                                  );
                                }
                                return Promise.resolve();
                              },
                            }),
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={2}
                            style={{ width: "100%" }}
                            placeholder="Vô hạn nếu để trống"
                          />
                        </Form.Item>
                      </Col>

                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "discount_value"]}
                          label={
                            index === 0
                              ? discountType === "PERCENTAGE"
                                ? "Mức giảm (%)"
                                : "Mức giảm (đ/đơn vị)"
                              : undefined
                          }
                          rules={[
                            { required: true, message: "Nhập mức giảm" },
                            {
                              type: "number",
                              min: 0.01,
                              message: "Mức giảm phải > 0",
                            },
                            ...(discountType === "PERCENTAGE"
                              ? [
                                {
                                  type: "number" as const,
                                  max: 100,
                                  message: "Chiết khấu % không vượt quá 100%",
                                },
                              ]
                              : []),
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber
                            min={0.01}
                            max={discountType === "PERCENTAGE" ? 100 : undefined}
                            addonAfter={discountType === "PERCENTAGE" ? "%" : "₫"}
                            style={{ width: "100%" }}
                            placeholder={
                              discountType === "PERCENTAGE" ? "Ví dụ: 10" : "Ví dụ: 5000"
                            }
                          />
                        </Form.Item>
                      </Col>

                      <Col span={2} style={{ paddingTop: index === 0 ? 28 : 0 }}>
                        {fields.length > 1 && (
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                          />
                        )}
                      </Col>
                    </Row>
                  ))}

                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 6 }}
                  >
                    Thêm bậc số lượng
                  </Button>
                  <Form.ErrorList errors={errors} />
                </div>
              )}
            </Form.List>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DiscountPolicyManagement;
