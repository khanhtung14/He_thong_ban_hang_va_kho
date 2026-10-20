import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Form,
  Select,
  InputNumber,
  Input,
  Button,
  Alert,
  Space,
  Tag,
  Typography,
  Divider,
  Descriptions,
  message,
  Spin,
  Tooltip,
} from "antd";
import {
  ExportOutlined,
  WarningOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  getBatches,
  dispatchOutbound,
  extractErrorMessage,
  type ProductBatchItem,
  type OutboundDispatchPayload,
} from "../services/batchService";
import { fetchProducts, type ProductItem } from "../services/productService";
import { authenticatedFetch } from "../services/sessionService";
import BatchOverrideModal from "./BatchOverrideModal";

const { Text, Title, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export interface WarehouseOption {
  id: number;
  name: string;
  code?: string;
  address?: string;
}

export interface OutboundDispatchFormProps {
  onSuccess?: (result: any) => void;
  initialWarehouseId?: number;
  initialProductId?: number;
  compact?: boolean;
}

export const OutboundDispatchForm: React.FC<OutboundDispatchFormProps> = ({
  onSuccess,
  initialWarehouseId,
  initialProductId,
  compact = false,
}) => {
  const [form] = Form.useForm();

  // State danh mục
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // State lựa chọn
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | undefined>(
    initialWarehouseId
  );
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(
    initialProductId
  );
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // State Lô hàng
  const [batches, setBatches] = useState<ProductBatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | undefined>();
  const [selectedBatch, setSelectedBatch] = useState<ProductBatchItem | null>(null);

  // State xử lý xuất và Override
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState<boolean>(false);
  const [pendingValues, setPendingValues] = useState<{
    warehouseId: number;
    productId: number;
    quantity: number;
    batchId?: number;
    note?: string;
  } | null>(null);

  // 1. Tải danh sách kho và sản phẩm
  const loadInitialData = useCallback(async () => {
    setLoadingInitial(true);
    try {
      // Tải kho
      try {
        const whRes = await authenticatedFetch("/api/v1/warehouses");
        if (whRes.ok) {
          const whData = await whRes.json();
          const items = Array.isArray(whData) ? whData : whData.data || [];
          setWarehouses(items);
          if (items.length > 0 && !selectedWarehouseId) {
            setSelectedWarehouseId(items[0].id);
            form.setFieldValue("warehouseId", items[0].id);
          }
        }
      } catch {
        // Fallback default warehouse
        setWarehouses([
          { id: 1, name: "Kho Tổng Hà Nội", code: "WH-HN-01" },
          { id: 2, name: "Kho Chi nhánh TP.HCM", code: "WH-HCM-01" },
        ]);
      }

      // Tải sản phẩm
      const prodRes = await fetchProducts({ limit: 100 });
      setProducts(prodRes.items || []);

      if (initialProductId) {
        const found = prodRes.items.find((p) => p.id === initialProductId);
        if (found) {
          setSelectedProduct(found);
          form.setFieldValue("productId", found.id);
        }
      }
    } catch (err) {
      console.error("Lỗi khởi tạo dữ liệu Form Xuất kho:", err);
    } finally {
      setLoadingInitial(false);
    }
  }, [initialProductId, selectedWarehouseId, form]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Kiểm tra xem sản phẩm có đang quản lý theo lô không
  const isBatchManaged = Boolean(
    (selectedProduct as any)?.is_batch_managed ??
    (selectedProduct as any)?.isBatchManaged ??
    selectedProduct?.manageByLot
  );

  // 2. Tải danh sách lô khi sản phẩm được chọn và có bật quản lý lô
  const loadProductBatches = useCallback(
    async (productId: number, warehouseId?: number) => {
      setLoadingBatches(true);
      setSelectedBatchId(undefined);
      setSelectedBatch(null);
      form.setFieldValue("batchId", undefined);

      try {
        const res = await getBatches({
          productId,
          warehouseId,
          warningDays: 30,
        });

        if (res.success && Array.isArray(res.data)) {
          setBatches(res.data);
        } else {
          setBatches([]);
        }
      } catch (err) {
        message.error(extractErrorMessage(err, "Không thể tải danh sách lô của sản phẩm."));
        setBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    },
    [form]
  );

  useEffect(() => {
    if (selectedProductId && isBatchManaged) {
      loadProductBatches(selectedProductId, selectedWarehouseId);
    } else {
      setBatches([]);
      setSelectedBatchId(undefined);
      setSelectedBatch(null);
    }
  }, [selectedProductId, selectedWarehouseId, isBatchManaged, loadProductBatches]);

  // Khi chọn sản phẩm từ dropdown
  const handleProductChange = (productId: number) => {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.id === productId) || null;
    setSelectedProduct(prod);
    form.setFieldValue("quantity", 1);
  };

  // Khi chọn lô từ dropdown
  const handleBatchChange = (batchId: number) => {
    setSelectedBatchId(batchId);
    const found = batches.find((b) => b.id === batchId) || null;
    setSelectedBatch(found);
  };

  // 3. Thực thi xuất kho
  const executeDispatch = async (
    payload: OutboundDispatchPayload,
    isOverride = false
  ) => {
    setSubmitting(true);
    try {
      const result = await dispatchOutbound(payload);
      message.success(
        result.message || (isOverride
          ? "Đã phê duyệt ghi đè và xuất kho lô quá hạn thành công!"
          : "Xuất kho thành công!")
      );

      // Reset form hoặc reload batch
      setIsOverrideModalOpen(false);
      setPendingValues(null);
      form.resetFields(["quantity", "batchId", "note"]);
      setSelectedBatchId(undefined);
      setSelectedBatch(null);

      if (selectedProductId && isBatchManaged) {
        loadProductBatches(selectedProductId, selectedWarehouseId);
      }

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      // Nếu API trả về lỗi yêu cầu override hoặc lô quá hạn
      const errMsg = extractErrorMessage(err);
      if (
        errMsg.toLowerCase().includes("quá hạn") ||
        errMsg.toLowerCase().includes("hết hạn") ||
        errMsg.toLowerCase().includes("ghi đè") ||
        errMsg.toLowerCase().includes("override")
      ) {
        setIsOverrideModalOpen(true);
      } else {
        message.error(errMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Xử lý khi nhấn nút "Xác nhận xuất kho"
  const onFinish = async (values: any) => {
    const { warehouseId, productId, quantity, batchId, note } = values;

    if (isBatchManaged) {
      if (!batchId) {
        message.warning("Sản phẩm này bắt buộc phải chọn Lô hàng để xuất kho!");
        return;
      }

      const currentBatch = batches.find((b) => b.id === batchId) || selectedBatch;

      // Kiểm tra xem lô đã quá hạn chưa
      if (currentBatch && (currentBatch.is_expired || currentBatch.status === "EXPIRED")) {
        // Lưu lại dữ liệu chờ override và bật Modal yêu cầu Quản lý xác nhận
        setPendingValues({ warehouseId, productId, quantity, batchId, note });
        setIsOverrideModalOpen(true);
        return;
      }
    }

    // Nếu không bị quá hạn hoặc không quản lý theo lô, xuất trực tiếp
    await executeDispatch({
      warehouse_id: warehouseId,
      product_id: productId,
      quantity,
      batch_id: isBatchManaged ? batchId : null,
      note,
    });
  };

  // 5. Xử lý khi Quản lý kho xác nhận override trong modal
  const handleConfirmOverride = async (overrideReason: string) => {
    if (!pendingValues) return;

    await executeDispatch(
      {
        warehouse_id: pendingValues.warehouseId,
        product_id: pendingValues.productId,
        quantity: pendingValues.quantity,
        batch_id: pendingValues.batchId,
        override_expired: true,
        override_reason: overrideReason,
        note: pendingValues.note,
      },
      true
    );
  };

  return (
    <Card
      title={
        <Space align="center">
          <ExportOutlined style={{ color: "#2563eb", fontSize: 20 }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              Phiếu Xuất Kho Hàng Hoá
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Hệ thống kiểm soát lô và hạn sử dụng nghiêm ngặt theo tiêu chuẩn kho vận
            </Text>
          </div>
        </Space>
      }
      style={{
        borderRadius: 12,
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.06)",
        maxWidth: compact ? "100%" : 920,
        margin: compact ? "0" : "0 auto",
      }}
      extra={
        selectedProductId && isBatchManaged ? (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={() => loadProductBatches(selectedProductId, selectedWarehouseId)}
            loading={loadingBatches}
          >
            Làm mới danh sách lô
          </Button>
        ) : null
      }
    >
      <Spin spinning={loadingInitial}>
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            warehouseId: initialWarehouseId || 1,
            productId: initialProductId,
            quantity: 1,
          }}
        >
          {/* Hàng 1: Chọn Kho & Chọn Sản Phẩm */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <Form.Item
              name="warehouseId"
              label={<Text strong>Kho xuất hàng</Text>}
              rules={[{ required: true, message: "Vui lòng chọn kho xuất hàng!" }]}
            >
              <Select
                placeholder="Chọn kho hàng xuất"
                onChange={(val) => {
                  setSelectedWarehouseId(val);
                }}
                showSearch
                optionFilterProp="children"
              >
                {warehouses.map((wh) => (
                  <Option key={wh.id} value={wh.id}>
                    {wh.name} {wh.code ? `(${wh.code})` : ""}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="productId"
              label={<Text strong>Sản phẩm (SKU)</Text>}
              rules={[{ required: true, message: "Vui lòng chọn sản phẩm xuất kho!" }]}
            >
              <Select
                placeholder="Tìm theo mã SKU hoặc tên sản phẩm..."
                showSearch
                optionFilterProp="label"
                onChange={handleProductChange}
                options={products.map((p) => ({
                  value: p.id,
                  label: `[${p.sku}] ${p.name}`,
                }))}
              />
            </Form.Item>
          </div>

          {/* Banner trạng thái quản lý lô của SKU */}
          {selectedProduct && (
            <div style={{ marginBottom: 16 }}>
              {isBatchManaged ? (
                <Alert
                  type="info"
                  showIcon
                  icon={<InboxOutlined style={{ fontSize: 18 }} />}
                  message={
                    <Space align="center">
                      <Text strong style={{ color: "#1e40af" }}>
                        Sản phẩm kích hoạt Quản lý theo lô & Hạn sử dụng
                      </Text>
                      <Tag color="geekblue">Lô & HSD Bắt Buộc</Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      Yêu cầu bắt buộc nhân viên phải chọn đúng lô xuất cụ thể.
                      Hệ thống tự động phát hiện và chặn xuất đối với các lô đã quá hạn dùng.
                    </Text>
                  }
                  style={{ borderRadius: 8, background: "#eff6ff", borderColor: "#bfdbfe" }}
                />
              ) : (
                <Alert
                  type="success"
                  showIcon
                  message={
                    <Space>
                      <Text strong>Sản phẩm xuất kho thông thường</Text>
                      <Tag color="default">Không theo dõi lô</Tag>
                    </Space>
                  }
                  description="Sản phẩm này không áp dụng quản lý theo lô hàng. Số lượng xuất sẽ được trừ trực tiếp vào tồn kho chung."
                  style={{ borderRadius: 8 }}
                />
              )}
            </div>
          )}

          {/* Hàng 2: Chọn Lô Hàng (Nếu SKU quản lý theo lô) */}
          {isBatchManaged && (
            <div
              style={{
                background: "#f8fafc",
                padding: "16px",
                borderRadius: 10,
                border: "1px dashed #cbd5e1",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
                  Chọn Lô Hàng Xuất Kho * <Text type="danger">(Bắt buộc)</Text>
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Tổng số lô có sẵn: <b>{batches.length}</b>
                </Text>
              </div>

              <Form.Item
                name="batchId"
                rules={[
                  {
                    required: isBatchManaged,
                    message: "Vui lòng chọn lô hàng xuất kho!",
                  },
                ]}
                style={{ marginBottom: 12 }}
              >
                <Select
                  placeholder={
                    loadingBatches
                      ? "Đang tải danh sách lô..."
                      : batches.length === 0
                      ? "Không tìm thấy lô hàng nào còn tồn cho sản phẩm này"
                      : "Chọn lô hàng để xuất..."
                  }
                  loading={loadingBatches}
                  disabled={loadingBatches || batches.length === 0}
                  onChange={handleBatchChange}
                  dropdownMatchSelectWidth={false}
                >
                  {batches.map((b) => {
                    const isExp = b.is_expired || b.status === "EXPIRED";
                    const isSoon = b.is_expiring_soon || b.status === "EXPIRING_SOON";

                    return (
                      <Option
                        key={b.id}
                        value={b.id}
                        label={`${b.batch_number} - Tồn: ${b.remaining_quantity}`}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 16,
                            padding: "4px 0",
                          }}
                        >
                          <Space>
                            <Tag
                              color="purple"
                              style={{ fontWeight: 600, fontSize: 13 }}
                            >
                              Lô: {b.batch_number}
                            </Tag>
                            <Text>Tồn: <b>{b.remaining_quantity}</b></Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              (HSD: {b.exp_date})
                            </Text>
                          </Space>

                          <Space>
                            {isExp ? (
                              <Tag color="error" icon={<StopOutlined />}>
                                Quá hạn {b.days_until_expiry < 0 ? `(${Math.abs(b.days_until_expiry)} ngày)` : ""}
                              </Tag>
                            ) : isSoon ? (
                              <Tag color="warning" icon={<WarningOutlined />}>
                                Sắp hết hạn (còn {b.days_until_expiry} ngày)
                              </Tag>
                            ) : (
                              <Tag color="success" icon={<CheckCircleOutlined />}>
                                Đang dùng tốt
                              </Tag>
                            )}
                          </Space>
                        </div>
                      </Option>
                    );
                  })}
                </Select>
              </Form.Item>

              {/* Thông tin chi tiết lô đã chọn & Cảnh báo nếu quá hạn */}
              {selectedBatch && (
                <div>
                  {(selectedBatch.is_expired || selectedBatch.status === "EXPIRED") && (
                    <Alert
                      type="error"
                      showIcon
                      icon={<StopOutlined style={{ fontSize: 20, color: "#dc2626" }} />}
                      message={
                        <Text strong style={{ color: "#991b1b" }}>
                          Cảnh báo: Lô {selectedBatch.batch_number} ĐÃ QUÁ HẠN SỬ DỤNG ({selectedBatch.exp_date})
                        </Text>
                      }
                      description="Hệ thống sẽ chặn xuất kho thông thường. Khi bấm 'Xác nhận xuất kho', bạn sẽ phải qua bước xác nhận Override dành cho Quản lý kho kèm lý do."
                      style={{ marginBottom: 12, borderRadius: 8 }}
                    />
                  )}

                  <Descriptions
                    bordered
                    size="small"
                    column={{ xs: 1, sm: 2, md: 3 }}
                    style={{ background: "#ffffff", borderRadius: 8 }}
                  >
                    <Descriptions.Item label="Số lô">
                      <Tag color="purple" style={{ fontWeight: 700 }}>
                        {selectedBatch.batch_number}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Ngày sản xuất (NSX)">
                      {selectedBatch.mfg_date || "Chưa cập nhật"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Hạn sử dụng (HSD)">
                      <Text
                        type={
                          selectedBatch.is_expired || selectedBatch.status === "EXPIRED"
                            ? "danger"
                            : "secondary"
                        }
                        strong
                      >
                        {selectedBatch.exp_date}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Số lượng tồn lô">
                      <Text strong style={{ fontSize: 14, color: "#0f172a" }}>
                        {selectedBatch.remaining_quantity.toLocaleString("vi-VN")}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Trạng thái">
                      {selectedBatch.is_expired || selectedBatch.status === "EXPIRED" ? (
                        <Tag color="red">Quá hạn dùng</Tag>
                      ) : selectedBatch.is_expiring_soon || selectedBatch.status === "EXPIRING_SOON" ? (
                        <Tag color="orange">Sắp hết hạn</Tag>
                      ) : (
                        <Tag color="green">Còn hạn sử dụng</Tag>
                      )}
                    </Descriptions.Item>
                  </Descriptions>
                </div>
              )}
            </div>
          )}

          {/* Hàng 3: Số lượng xuất & Ghi chú */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 16,
            }}
          >
            <Form.Item
              name="quantity"
              label={<Text strong>Số lượng xuất</Text>}
              rules={[
                { required: true, message: "Vui lòng nhập số lượng xuất!" },
                {
                  validator: async (_, value) => {
                    if (value <= 0) {
                      throw new Error("Số lượng xuất phải lớn hơn 0!");
                    }
                    if (
                      isBatchManaged &&
                      selectedBatch &&
                      value > selectedBatch.remaining_quantity
                    ) {
                      throw new Error(
                        `Số lượng xuất (${value}) vượt quá tồn kho hiện tại của lô (${selectedBatch.remaining_quantity})!`
                      );
                    }
                  },
                },
              ]}
            >
              <InputNumber
                min={1}
                max={selectedBatch ? selectedBatch.remaining_quantity : undefined}
                style={{ width: "100%" }}
                size="large"
                placeholder="Nhập số lượng..."
              />
            </Form.Item>

            <Form.Item name="note" label={<Text strong>Ghi chú xuất kho</Text>}>
              <Input
                placeholder="Mục đích xuất kho, số chứng từ / đơn hàng..."
                size="large"
              />
            </Form.Item>
          </div>

          <Divider style={{ margin: "16px 0" }} />

          {/* Nút hành động */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button
              onClick={() => {
                form.resetFields();
                setSelectedBatch(null);
                setSelectedBatchId(undefined);
              }}
              disabled={submitting}
            >
              Làm lại
            </Button>

            <Button
              type="primary"
              htmlType="submit"
              icon={
                selectedBatch && (selectedBatch.is_expired || selectedBatch.status === "EXPIRED") ? (
                  <SafetyCertificateOutlined />
                ) : (
                  <ExportOutlined />
                )
              }
              danger={
                Boolean(selectedBatch && (selectedBatch.is_expired || selectedBatch.status === "EXPIRED"))
              }
              size="large"
              loading={submitting}
              style={{
                fontWeight: 600,
                borderRadius: 8,
                padding: "0 24px",
              }}
            >
              {selectedBatch && (selectedBatch.is_expired || selectedBatch.status === "EXPIRED")
                ? "Yêu Cầu Xuất Kho (Cần Quản Lý Override)"
                : "Xác Nhận Xuất Kho"}
            </Button>
          </div>
        </Form>
      </Spin>

      {/* 6. Modal Ghi Đè (Override) Cho Quản Lý Kho */}
      <BatchOverrideModal
        open={isOverrideModalOpen}
        batchInfo={
          selectedBatch && pendingValues
            ? {
                batchId: selectedBatch.id,
                batchNumber: selectedBatch.batch_number,
                productName: selectedProduct?.name || `Sản phẩm #${pendingValues.productId}`,
                productSku: selectedProduct?.sku,
                expDate: selectedBatch.exp_date,
                quantity: pendingValues.quantity,
                daysOverdue:
                  selectedBatch.days_until_expiry < 0
                    ? Math.abs(selectedBatch.days_until_expiry)
                    : undefined,
              }
            : null
        }
        onClose={() => setIsOverrideModalOpen(false)}
        onConfirmOverride={handleConfirmOverride}
        submitting={submitting}
      />
    </Card>
  );
};

export default OutboundDispatchForm;
