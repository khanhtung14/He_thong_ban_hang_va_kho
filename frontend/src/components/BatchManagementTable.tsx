import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  InputNumber,
  Select,
  Row,
  Col,
  Modal,
  Form,
  Input,
  DatePicker,
  message,
  Tooltip,
  Badge,
  Alert,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  FieldTimeOutlined,
  BarcodeOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import {
  getBatches,
  createBatch,
  extractErrorMessage,
  type ProductBatchItem,
} from "../services/batchService";
import { fetchProducts, type ProductItem } from "../services/productService";

const { Text, Title } = Typography;

export interface BatchManagementTableProps {
  initialProductId?: number;
  initialWarehouseId?: number;
}

export const BatchManagementTable: React.FC<BatchManagementTableProps> = ({
  initialProductId,
  initialWarehouseId,
}) => {
  const [batches, setBatches] = useState<ProductBatchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [warningDays, setWarningDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(initialProductId);
  const [products, setProducts] = useState<ProductItem[]>([]);

  // Modal tạo mới lô
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // Tải danh mục sản phẩm
  useEffect(() => {
    fetchProducts({ limit: 100 })
      .then((res) => setProducts(res.items || []))
      .catch(() => {});
  }, []);

  // Tải danh sách lô
  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBatches({
        productId: selectedProductId,
        warehouseId: initialWarehouseId,
        warningDays: warningDays,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      setBatches(res.data || []);
    } catch (err) {
      message.error(extractErrorMessage(err, "Không thể tải danh sách lô hàng."));
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, initialWarehouseId, warningDays, statusFilter]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Xử lý tạo mới lô
  const handleCreateBatch = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      await createBatch({
        product_id: values.productId,
        batch_number: values.batchNumber,
        mfg_date: values.mfgDate ? values.mfgDate.format("YYYY-MM-DD") : null,
        exp_date: values.expDate.format("YYYY-MM-DD"),
        remaining_quantity: values.remainingQuantity || 0,
        warehouse_id: initialWarehouseId || values.warehouseId || 1,
      });
      message.success(`Đã tạo lô hàng '${values.batchNumber}' thành công!`);
      setIsCreateModalOpen(false);
      createForm.resetFields();
      loadBatches();
    } catch (err) {
      message.error(extractErrorMessage(err, "Không thể tạo lô hàng mới."));
    } finally {
      setCreating(false);
    }
  };

  // Thống kê nhanh
  const expiredCount = batches.filter((b) => b.is_expired).length;
  const expiringSoonCount = batches.filter((b) => b.is_expiring_soon).length;
  const activeCount = batches.filter((b) => !b.is_expired && !b.is_expiring_soon).length;

  const columns: ColumnsType<ProductBatchItem> = [
    {
      title: "Số lô (Batch No)",
      dataIndex: "batch_number",
      key: "batch_number",
      width: 170,
      render: (val, record) => (
        <Space>
          <BarcodeOutlined style={{ color: "#6366f1" }} />
          <Text strong copyable>
            {val}
          </Text>
        </Space>
      ),
    },
    {
      title: "Sản phẩm / SKU",
      key: "product",
      render: (_, r) => (
        <div>
          <Text strong>{r.product_name || `Sản phẩm #${r.product_id}`}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            SKU: {r.product_sku || "—"}
          </Text>
        </div>
      ),
    },
    {
      title: "Ngày sản xuất (NSX)",
      dataIndex: "mfg_date",
      key: "mfg_date",
      width: 130,
      render: (val) => (val ? dayjs(val).format("DD/MM/YYYY") : "—"),
    },
    {
      title: "Hạn sử dụng (HSD)",
      dataIndex: "exp_date",
      key: "exp_date",
      width: 130,
      render: (val) => (val ? <Text strong>{dayjs(val).format("DD/MM/YYYY")}</Text> : "—"),
    },
    {
      title: "Thời hạn còn lại",
      key: "days_until_expiry",
      width: 160,
      render: (_, r) => {
        if (r.is_expired) {
          const overdue = Math.abs(r.days_until_expiry);
          return (
            <Tag color="#fee2e2" style={{ color: "#b91c1c", border: "1px solid #fca5a5" }}>
              <CloseCircleOutlined /> Quá hạn {overdue} ngày
            </Tag>
          );
        }
        if (r.is_expiring_soon) {
          return (
            <Tag color="#fffbeb" style={{ color: "#b45309", border: "1px solid #fde68a" }}>
              <WarningOutlined /> Còn {r.days_until_expiry} ngày
            </Tag>
          );
        }
        return (
          <Tag color="#f0fdf4" style={{ color: "#15803d", border: "1px solid #bbf7d0" }}>
            <CheckCircleOutlined /> Còn {r.days_until_expiry} ngày
          </Tag>
        );
      },
    },
    {
      title: "Số lượng tồn",
      dataIndex: "remaining_quantity",
      key: "remaining_quantity",
      width: 130,
      align: "right",
      render: (val) => (
        <Text strong style={{ fontSize: 14 }}>
          {Number(val || 0).toLocaleString("vi-VN")}
        </Text>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 160,
      render: (_, r) => {
        if (r.is_expired) {
          return (
            <Badge
              status="error"
              text={<Text type="danger" strong>QUÁ HẠN (CHẶN XUẤT)</Text>}
            />
          );
        }
        if (r.is_expiring_soon) {
          return (
            <Badge
              status="warning"
              text={<Text style={{ color: "#d97706", fontWeight: 600 }}>SẮP HẾT HẠN</Text>}
            />
          );
        }
        return (
          <Badge
            status="success"
            text={<Text style={{ color: "#16a34a" }}>Đủ tiêu chuẩn</Text>}
          />
        );
      },
    },
  ];

  return (
    <Card
      style={{
        borderRadius: "var(--radius-lg, 12px)",
        boxShadow: "var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05))",
      }}
      title={
        <Space align="center">
          <FieldTimeOutlined style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 20 }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Theo Dõi Lô & Hạn Sử Dụng Hàng Hóa
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Cảnh báo hạn dùng theo ngưỡng và kiểm soát xuất kho theo từng lô sản xuất.
            </Text>
          </div>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadBatches} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              background: "var(--accent-primary, #4F46E5)",
              borderColor: "var(--accent-primary, #4F46E5)",
            }}
          >
            + Nhập Lô Mới
          </Button>
        </Space>
      }
    >
      {/* Khối thống kê nhanh */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              background: expiredCount > 0 ? "#fef2f2" : "#f8fafc",
              border: expiredCount > 0 ? "1px solid #fecaca" : "1px solid #e2e8f0",
              borderRadius: 8,
            }}
            bodyStyle={{ padding: 12 }}
          >
            <Space>
              <CloseCircleOutlined style={{ color: "#dc2626", fontSize: 22 }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Lô đã quá hạn (Bị chặn xuất)</Text>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}>
                  {expiredCount} lô
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              background: expiringSoonCount > 0 ? "#fffbeb" : "#f8fafc",
              border: expiringSoonCount > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0",
              borderRadius: 8,
            }}
            bodyStyle={{ padding: 12 }}
          >
            <Space>
              <WarningOutlined style={{ color: "#d97706", fontSize: 22 }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Sắp hết hạn (dưới {warningDays} ngày)
                </Text>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#d97706" }}>
                  {expiringSoonCount} lô
                </div>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} sm={8}>
          <Card
            bordered={false}
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
            }}
            bodyStyle={{ padding: 12 }}
          >
            <Space>
              <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 22 }} />
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Lô còn hạn an toàn</Text>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>
                  {activeCount} lô
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc & Cấu hình ngưỡng cảnh báo */}
      <Card
        type="inner"
        style={{ marginBottom: 16, background: "#f8fafc", borderRadius: 8 }}
        bodyStyle={{ padding: "12px 16px" }}
      >
        <Row gutter={[16, 12]} align="middle">
          <Col xs={24} md={8}>
            <Text strong style={{ fontSize: 13, marginRight: 8 }}>
              Chọn sản phẩm:
            </Text>
            <Select
              style={{ width: "100%" }}
              placeholder="-- Tất cả sản phẩm --"
              allowClear
              value={selectedProductId}
              onChange={(val) => setSelectedProductId(val)}
              showSearch
              optionFilterProp="label"
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.sku})`,
              }))}
            />
          </Col>

          <Col xs={24} sm={12} md={7}>
            <Text strong style={{ fontSize: 13, marginRight: 8 }}>
              Lọc trạng thái:
            </Text>
            <Select
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "ALL", label: "Tất cả các lô" },
                { value: "EXPIRED", label: "Chỉ lô ĐÃ QUÁ HẠN" },
                { value: "EXPIRING_SOON", label: "Chỉ lô SẮP HẾT HẠN" },
                { value: "ACTIVE", label: "Chỉ lô CÒN HẠN DÀI" },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} md={9}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Tooltip title="Hệ thống sẽ highlight màu cam cho các lô có hạn dùng nhỏ hơn hoặc bằng số ngày này">
                <Text strong style={{ fontSize: 13 }}>
                  Ngưỡng cảnh báo (ngày):
                </Text>
              </Tooltip>
              <InputNumber
                min={1}
                max={365}
                value={warningDays}
                onChange={(val) => setWarningDays(val || 30)}
                style={{ width: 90 }}
                addonAfter="ngày"
              />
              <Button size="small" type="link" onClick={loadBatches}>
                Áp dụng
              </Button>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Bảng danh sách lô có Highlight đổi màu UI */}
      <Table
        dataSource={batches}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 10, showTotal: (t) => `Tổng ${t} lô` }}
        rowClassName={(record) => {
          if (record.is_expired) return "batch-row-expired";
          if (record.is_expiring_soon) return "batch-row-warning";
          return "";
        }}
        bordered
      />

      {/* Modal tạo mới lô hàng */}
      <Modal
        title="Tạo Mới Lô Hàng (Batch Entry)"
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        onOk={handleCreateBatch}
        confirmLoading={creating}
        okText="Tạo lô hàng"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="productId"
            label="Sản phẩm *"
            rules={[{ required: true, message: "Vui lòng chọn sản phẩm" }]}
          >
            <Select
              placeholder="-- Chọn sản phẩm --"
              showSearch
              optionFilterProp="label"
              options={products.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.sku})`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="batchNumber"
            label="Số lô (Batch / Lot Number) *"
            rules={[
              { required: true, message: "Vui lòng nhập số lô" },
              { min: 2, message: "Số lô tối thiểu 2 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: LOT-202610A, BATCH-998..." style={{ textTransform: "uppercase" }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="mfgDate" label="Ngày sản xuất (NSX)">
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="expDate"
                label="Hạn sử dụng (HSD) *"
                rules={[{ required: true, message: "Vui lòng chọn hạn sử dụng" }]}
              >
                <DatePicker style={{ width: "100%" }} format="DD/MM/YYYY" placeholder="Chọn ngày" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="remainingQuantity"
            label="Số lượng ban đầu"
            initialValue={100}
            rules={[{ required: true, message: "Vui lòng nhập số lượng tồn" }]}
          >
            <InputNumber min={0} max={1000000} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Custom Styles for row highlights */}
      <style>{`
        .batch-row-expired {
          background-color: #fff1f2 !important;
        }
        .batch-row-expired:hover td {
          background-color: #ffe4e6 !important;
        }
        .batch-row-warning {
          background-color: #fffbeb !important;
        }
        .batch-row-warning:hover td {
          background-color: #fef3c7 !important;
        }
      `}</style>
    </Card>
  );
};

export default BatchManagementTable;
