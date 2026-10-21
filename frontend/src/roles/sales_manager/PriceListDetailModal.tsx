import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Table,
  Tag,
  Typography,
  Space,
  message,
  Card,
  Row,
  Col,
  InputNumber,
  Tooltip,
  Divider,
  Spin,
  Alert,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  TagOutlined,
  CalendarOutlined,
  EditOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  EyeOutlined,
  WarningOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  fetchPriceListDetail,
  updatePriceList,
  publishPriceList,
  getProducts,
  type Product,
  type PriceListItem,
  type PriceListLine,
} from "../../services/apiClient";

const { Text, Title } = Typography;
const { Option } = Select;

export interface PriceListDetailModalProps {
  isOpen: boolean;
  priceListId: number | null;
  onClose: () => void;
  onUpdated?: (updatedList: PriceListItem) => void;
  onPublished?: (publishedList: PriceListItem) => void;
}

interface EditablePriceLine extends PriceListLine {
  key: string;
  product_name?: string;
  unit?: string;
  base_price?: number;
}

export const PriceListDetailModal: React.FC<PriceListDetailModalProps> = ({
  isOpen,
  priceListId,
  onClose,
  onUpdated,
  onPublished,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [priceList, setPriceList] = useState<PriceListItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [editLines, setEditLines] = useState<EditablePriceLine[]>([]);

  // Tải chi tiết bảng giá và danh mục sản phẩm
  const loadDetail = async (id: number) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const [detail, prods] = await Promise.all([
        fetchPriceListDetail(id),
        products.length === 0 ? getProducts().catch(() => []) : Promise.resolve(products),
      ]);
      setPriceList(detail);
      if (products.length === 0) {
        setProducts(Array.isArray(prods) ? prods : []);
      }

      // Khởi tạo danh sách dòng chỉnh sửa
      const prodsMap = new Map((prods || []).map((p: Product) => [p.sku.toUpperCase(), p]));
      const lines: EditablePriceLine[] = (detail.items || []).map((it, idx) => {
        const matched = prodsMap.get(it.sku.toUpperCase());
        return {
          key: `${it.sku}_${idx}`,
          sku: it.sku,
          sale_price: it.sale_price,
          floor_price: it.floor_price,
          product_name: matched?.name || it.sku,
          unit: matched?.baseUnit || "Cái",
          base_price: matched?.basePrice || matched?.sale_price || 0,
        };
      });
      setEditLines(lines);

      // Điền form điều chỉnh
      form.setFieldsValue({
        code: detail.code,
        customer_group: detail.customer_group,
        validityRange: [
          detail.start_date ? dayjs(detail.start_date) : undefined,
          detail.end_date ? dayjs(detail.end_date) : undefined,
        ],
      });
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể tải chi tiết bảng giá.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && priceListId) {
      setIsEditing(false);
      loadDetail(priceListId);
    } else {
      setPriceList(null);
      setIsEditing(false);
      setErrorMsg("");
      form.resetFields();
    }
  }, [isOpen, priceListId]);

  // Thêm dòng sản phẩm khi điều chỉnh
  const handleAddLine = () => {
    setEditLines((prev) => [
      ...prev,
      {
        key: `new_${Date.now()}`,
        sku: "",
        sale_price: 0,
        floor_price: 0,
        product_name: "",
        unit: "Cái",
        base_price: 0,
      },
    ]);
  };

  // Chọn sản phẩm cho dòng
  const handleSelectSku = (key: string, sku: string) => {
    const matched = products.find((p) => p.sku.toUpperCase() === sku.toUpperCase());
    setEditLines((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          const baseP = matched?.basePrice || matched?.sale_price || 0;
          return {
            ...it,
            sku,
            product_name: matched?.name || sku,
            unit: matched?.baseUnit || "Cái",
            base_price: baseP,
            sale_price: it.sale_price || baseP,
            floor_price: it.floor_price || Math.round(baseP * 0.9),
          };
        }
        return it;
      })
    );
  };

  // Cập nhật giá trên từng dòng
  const handleLinePriceChange = (key: string, field: "sale_price" | "floor_price", val: number | null) => {
    setEditLines((prev) =>
      prev.map((it) => {
        if (it.key === key) {
          return { ...it, [field]: Number(val || 0) };
        }
        return it;
      })
    );
  };

  // Xóa dòng sản phẩm
  const handleRemoveLine = (key: string) => {
    setEditLines((prev) => prev.filter((it) => it.key !== key));
  };

  // Lưu điều chỉnh bảng giá
  const handleSaveAdjustment = async () => {
    if (!priceList) return;
    setErrorMsg("");

    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    const [startDate, endDate] = values.validityRange || [];
    if (!startDate || !endDate) {
      setErrorMsg("Vui lòng chọn đầy đủ thời gian hiệu lực!");
      return;
    }

    const validLines = editLines.filter((l) => l.sku && l.sku.trim());
    if (validLines.length === 0) {
      setErrorMsg("Bảng giá cần có ít nhất một sản phẩm!");
      return;
    }

    // Kiểm tra trùng SKU
    const skuSet = new Set(validLines.map((l) => l.sku.toUpperCase()));
    if (skuSet.size !== validLines.length) {
      setErrorMsg("Mỗi mã SKU chỉ được xuất hiện một lần trong cùng bảng giá!");
      return;
    }

    // Kiểm tra giá sàn <= giá bán
    for (const l of validLines) {
      if (l.floor_price > l.sale_price) {
        setErrorMsg(`Sản phẩm [${l.sku}] có Giá sàn (${l.floor_price.toLocaleString("vi-VN")} ₫) lớn hơn Giá bán (${l.sale_price.toLocaleString("vi-VN")} ₫)!`);
        return;
      }
    }

    setSubmitting(true);
    const payload = {
      code: values.code ? values.code.trim().toUpperCase() : priceList.code,
      customer_group: values.customer_group,
      start_date: dayjs(startDate).format("YYYY-MM-DD"),
      end_date: dayjs(endDate).format("YYYY-MM-DD"),
      items: validLines.map((l) => ({
        sku: l.sku.trim().toUpperCase(),
        sale_price: l.sale_price,
        floor_price: l.floor_price,
      })),
    };

    try {
      const updated = await updatePriceList(priceList.id, payload);
      message.success(`Điều chỉnh bảng giá ${updated.code} thành công!`);
      setPriceList(updated);
      setIsEditing(false);
      if (onUpdated) onUpdated(updated);
      // Tải lại dữ liệu chi tiết mới nhất
      await loadDetail(updated.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể lưu điều chỉnh bảng giá.");
    } finally {
      setSubmitting(false);
    }
  };

  // Phê duyệt & Phát hành bảng giá nháp
  const handlePublish = async () => {
    if (!priceList) return;
    setPublishing(true);
    setErrorMsg("");
    try {
      const published = await publishPriceList(priceList.id);
      message.success(`Phát hành bảng giá ${published.code} thành công!`);
      setPriceList(published);
      if (onPublished) onPublished(published);
      if (onUpdated) onUpdated(published);
      await loadDetail(published.id);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể phát hành bảng giá.");
    } finally {
      setPublishing(false);
    }
  };

  // Render bảng sản phẩm ở chế độ Xem (Readonly)
  const viewColumns: ColumnsType<any> = [
    {
      title: "STT",
      key: "idx",
      width: 60,
      align: "center",
      render: (_, __, index) => index + 1,
    },
    {
      title: "MÃ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (val: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{val}</Tag>,
    },
    {
      title: "TÊN SẢN PHẨM",
      key: "name",
      render: (_, r) => {
        const prod = products.find((p) => p.sku.toUpperCase() === r.sku.toUpperCase());
        return <Text strong>{prod?.name || r.sku}</Text>;
      },
    },
    {
      title: "ĐVT",
      key: "unit",
      width: 90,
      align: "center",
      render: (_, r) => {
        const prod = products.find((p) => p.sku.toUpperCase() === r.sku.toUpperCase());
        return <Tag color="cyan">{prod?.baseUnit || "Cái"}</Tag>;
      },
    },
    {
      title: "GIÁ NIÊM YẾT GỐC",
      key: "base_price",
      width: 145,
      align: "right",
      render: (_, r) => {
        const prod = products.find((p) => p.sku.toUpperCase() === r.sku.toUpperCase());
        const base = prod?.basePrice || prod?.sale_price || 0;
        return <Text type="secondary">{base.toLocaleString("vi-VN")} ₫</Text>;
      },
    },
    {
      title: "GIÁ BÁN ĐỀ XUẤT",
      dataIndex: "sale_price",
      key: "sale_price",
      width: 150,
      align: "right",
      render: (val: number) => (
        <Text strong style={{ color: "#047857", fontSize: 14 }}>
          {Number(val || 0).toLocaleString("vi-VN")} ₫
        </Text>
      ),
    },
    {
      title: "GIÁ SÀN (TỐI THIỂU)",
      dataIndex: "floor_price",
      key: "floor_price",
      width: 155,
      align: "right",
      render: (val: number) => (
        <Text style={{ color: "#b91c1c", fontWeight: 500 }}>
          {Number(val || 0).toLocaleString("vi-VN")} ₫
        </Text>
      ),
    },
  ];

  // Render bảng sản phẩm ở chế độ Điều chỉnh (Editable)
  const editColumns: ColumnsType<EditablePriceLine> = [
    {
      title: "STT",
      key: "idx",
      width: 50,
      align: "center",
      render: (_, __, index) => index + 1,
    },
    {
      title: "SẢN PHẨM / SKU",
      key: "sku",
      width: 280,
      render: (_, r) => (
        <Select
          showSearch
          placeholder="Chọn sản phẩm..."
          value={r.sku || undefined}
          onChange={(val) => handleSelectSku(r.key, val)}
          style={{ width: "100%" }}
          filterOption={(input, option) =>
            String(option?.label || "").toLowerCase().includes(input.toLowerCase())
          }
          options={products.map((p) => ({
            value: p.sku,
            label: `[${p.sku}] ${p.name}`,
          }))}
        />
      ),
    },
    {
      title: "ĐVT",
      dataIndex: "unit",
      key: "unit",
      width: 80,
      align: "center",
      render: (val: string) => <Tag color="cyan">{val || "Cái"}</Tag>,
    },
    {
      title: "GIÁ NIÊM YẾT",
      dataIndex: "base_price",
      key: "base_price",
      width: 130,
      align: "right",
      render: (val: number) => (
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {Number(val || 0).toLocaleString("vi-VN")} ₫
        </span>
      ),
    },
    {
      title: "GIÁ BÁN (₫)",
      key: "sale_price",
      width: 160,
      render: (_, r) => (
        <InputNumber
          min={0}
          step={1000}
          value={r.sale_price}
          onChange={(num) => handleLinePriceChange(r.key, "sale_price", num)}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number(v?.replace(/\$\s?|(,*)/g, "") || 0)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "GIÁ SÀN (₫)",
      key: "floor_price",
      width: 160,
      render: (_, r) => (
        <InputNumber
          min={0}
          step={1000}
          value={r.floor_price}
          onChange={(num) => handleLinePriceChange(r.key, "floor_price", num)}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
          parser={(v) => Number(v?.replace(/\$\s?|(,*)/g, "") || 0)}
          status={r.floor_price > r.sale_price ? "error" : undefined}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "XÓA",
      key: "action",
      width: 60,
      align: "center",
      render: (_, r) => (
        <Tooltip title="Xóa mặt hàng này">
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleRemoveLine(r.key)}
          />
        </Tooltip>
      ),
    },
  ];

  const getGroupName = (group?: string) => {
    switch (group) {
      case "DEALER_LEVEL_1":
        return "Đại lý Cấp 1";
      case "DEALER_LEVEL_2":
        return "Đại lý Cấp 2";
      case "RETAIL":
        return "Khách lẻ / Bán buôn nhỏ";
      default:
        return group || "Chưa rõ";
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <TagOutlined style={{ color: "#2563eb", fontSize: 20 }} />
          <span style={{ fontSize: 17, fontWeight: 700 }}>
            {isEditing
              ? `Điều chỉnh Bảng giá ${priceList?.code || ""}`
              : `Chi tiết Bảng giá ${priceList?.code || ""}`}
          </span>
          {priceList && (
            <Tag color={priceList.published ? "success" : "warning"} style={{ marginLeft: 8 }}>
              {priceList.published ? "ĐÃ PHÁT HÀNH" : "BẢN NHÁP"}
            </Tag>
          )}
        </div>
      }
      open={isOpen}
      onCancel={() => {
        if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }}
      width={1050}
      style={{ top: 20 }}
      footer={null}
      destroyOnClose
    >
      {loading ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: "#64748b" }}>Đang tải thông tin chi tiết bảng giá...</div>
        </div>
      ) : errorMsg && !priceList ? (
        <Alert type="error" message={errorMsg} showIcon style={{ margin: "20px 0" }} />
      ) : priceList ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {errorMsg && <Alert type="error" message={errorMsg} showIcon closable onClose={() => setErrorMsg("")} />}

          {/* CHẾ ĐỘ XEM CHI TIẾT (READONLY) */}
          {!isEditing ? (
            <>
              {/* Header card tóm tắt thông tin bảng giá */}
              <Card
                size="small"
                style={{
                  backgroundColor: "#f8fafc",
                  borderColor: "#e2e8f0",
                  borderRadius: 10,
                }}
              >
                <Row gutter={[16, 12]}>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      Mã bảng giá:
                    </Text>
                    <Text strong style={{ fontSize: 15, color: "#1e293b" }}>
                      {priceList.code}
                    </Text>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      Nhóm khách hàng:
                    </Text>
                    <Tag color="geekblue" style={{ fontSize: 13, marginTop: 2 }}>
                      {getGroupName(priceList.customer_group)}
                    </Tag>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      Thời hạn hiệu lực:
                    </Text>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                      <CalendarOutlined style={{ color: "#2563eb" }} />
                      <Text strong style={{ fontSize: 13 }}>
                        {priceList.start_date || "—"} đến {priceList.end_date || "—"}
                      </Text>
                    </div>
                  </Col>
                  <Col span={6}>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      Số lượng sản phẩm:
                    </Text>
                    <Text strong style={{ fontSize: 15, color: "#047857" }}>
                      {priceList.items?.length || 0} SKUs
                    </Text>
                  </Col>
                </Row>
              </Card>

              {/* Bảng danh sách sản phẩm trong bảng giá */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
                    Danh sách sản phẩm áp dụng trong bảng giá
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Tổng cộng: <strong>{priceList.items?.length || 0}</strong> mặt hàng
                  </Text>
                </div>

                <Table
                  columns={viewColumns}
                  dataSource={priceList.items || []}
                  rowKey="sku"
                  pagination={{ pageSize: 8 }}
                  bordered
                  size="small"
                />
              </div>

              {/* Thanh thao tác dưới cùng */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 12,
                  paddingTop: 14,
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <Space>
                  {!priceList.published && (
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={handlePublish}
                      loading={publishing}
                      style={{
                        backgroundColor: "#16a34a",
                        borderColor: "#16a34a",
                        borderRadius: 6,
                        fontWeight: 600,
                      }}
                    >
                      Phê duyệt & Phát hành
                    </Button>
                  )}
                  <Button
                    type="default"
                    icon={<EditOutlined />}
                    onClick={() => setIsEditing(true)}
                    style={{
                      borderColor: "#2563eb",
                      color: "#2563eb",
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    Điều chỉnh bảng giá
                  </Button>
                </Space>

                <Button onClick={onClose} style={{ borderRadius: 6 }}>
                  Đóng
                </Button>
              </div>
            </>
          ) : (
            /* CHẾ ĐỘ ĐIỀU CHỈNH BẢNG GIÁ (EDITABLE) */
            <Form form={form} layout="vertical">
              <Card
                size="small"
                title={<span style={{ fontWeight: 600 }}>Thông tin bảng giá</span>}
                style={{ backgroundColor: "#f8fafc", borderRadius: 10, borderColor: "#cbd5e1" }}
              >
                <Row gutter={16}>
                  <Col span={8}>
                    <Form.Item
                      name="code"
                      label="Mã bảng giá"
                      rules={[{ required: true, message: "Vui lòng nhập mã bảng giá" }]}
                    >
                      <Input placeholder="Mã bảng giá..." />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="customer_group"
                      label="Nhóm khách hàng áp dụng"
                      rules={[{ required: true, message: "Chọn nhóm khách hàng" }]}
                    >
                      <Select placeholder="Chọn nhóm">
                        <Option value="DEALER_LEVEL_1">Đại lý Cấp 1</Option>
                        <Option value="DEALER_LEVEL_2">Đại lý Cấp 2</Option>
                        <Option value="RETAIL">Khách lẻ / Bán buôn nhỏ</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="validityRange"
                      label="Thời gian hiệu lực (Từ ngày - Đến ngày)"
                      rules={[{ required: true, message: "Chọn thời gian hiệu lực" }]}
                    >
                      <DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
                    Điều chỉnh danh sách sản phẩm & đơn giá
                  </Text>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddLine} size="small">
                    Thêm sản phẩm vào bảng giá
                  </Button>
                </div>

                <Table
                  columns={editColumns}
                  dataSource={editLines}
                  rowKey="key"
                  pagination={false}
                  bordered
                  size="small"
                  scroll={{ y: 280 }}
                />
              </div>

              {/* Nút lưu điều chỉnh */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid #e2e8f0",
                }}
              >
                <Button icon={<ArrowLeftOutlined />} onClick={() => setIsEditing(false)}>
                  Quay lại xem chi tiết
                </Button>

                <Space>
                  <Button onClick={() => setIsEditing(false)}>Hủy bỏ</Button>
                  <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={submitting}
                    onClick={handleSaveAdjustment}
                    style={{ backgroundColor: "#2563eb", borderRadius: 6, fontWeight: 600 }}
                  >
                    Lưu điều chỉnh bảng giá
                  </Button>
                </Space>
              </div>
            </Form>
          )}
        </div>
      ) : null}
    </Modal>
  );
};

export default PriceListDetailModal;
