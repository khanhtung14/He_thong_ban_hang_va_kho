import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Table,
  InputNumber,
  Space,
  Typography,
  Card,
  Row,
  Col,
  message,
  Divider,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  ShopOutlined,
  InboxOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import type {
  InboundReceiptCreate,
  InboundReceiptDetailCreate,
  ReceiptFormOptions,
} from "../../types/inboundReceipt";
import {
  createInboundReceipt,
  getReceiptFormOptions,
} from "../../services/inboundReceiptService";

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface CreateReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormRowItem {
  key: string;
  product_id?: number;
  batch_lot: string;
  quantity: number;
  storage_location_id?: number | null;
}

export const CreateReceiptModal: React.FC<CreateReceiptModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [options, setOptions] = useState<ReceiptFormOptions>({
    suppliers: [],
    warehouses: [],
    products: [],
    storage_locations: [],
  });

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [items, setItems] = useState<FormRowItem[]>([
    { key: "row-1", batch_lot: "", quantity: 1, storage_location_id: null },
  ]);

  // Load dropdown options when modal opens
  useEffect(() => {
    if (isOpen) {
      loadOptions();
      form.resetFields();
      setSelectedWarehouseId(null);
      setItems([{ key: "row-1", batch_lot: "", quantity: 1, storage_location_id: null }]);
    }
  }, [isOpen]);

  const loadOptions = async (warehouseId?: number) => {
    setOptionsLoading(true);
    try {
      const data = await getReceiptFormOptions(warehouseId);
      setOptions(data);
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh mục dữ liệu khởi tạo.");
    } finally {
      setOptionsLoading(false);
    }
  };

  const handleWarehouseChange = (whId: number) => {
    setSelectedWarehouseId(whId);
    // Reload locations for this warehouse
    loadOptions(whId);
    // Reset selected storage locations in items that do not belong to this warehouse
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        storage_location_id: null,
      }))
    );
  };

  const handleAddItem = () => {
    const newKey = `row-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      { key: newKey, batch_lot: "", quantity: 1, storage_location_id: null },
    ]);
  };

  const handleRemoveItem = (key: string) => {
    if (items.length <= 1) {
      message.warning("Phiếu nhập kho phải có ít nhất 1 dòng chi tiết.");
      return;
    }
    setItems((prev) => prev.filter((item) => item.key !== key));
  };

  const handleUpdateItem = (key: string, field: keyof FormRowItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key === key) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // Validate items list
      if (!items || items.length === 0) {
        message.error("Vui lòng thêm ít nhất 1 dòng chi tiết sản phẩm.");
        return;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.product_id) {
          message.error(`Dòng ${i + 1}: Vui lòng chọn sản phẩm.`);
          return;
        }
        if (!item.batch_lot || !item.batch_lot.trim()) {
          message.error(`Dòng ${i + 1}: Vui lòng nhập mã lô hàng.`);
          return;
        }
        if (!item.quantity || item.quantity <= 0) {
          message.error(`Dòng ${i + 1}: Số lượng phải lớn hơn 0.`);
          return;
        }
      }

      const payload: InboundReceiptCreate = {
        code: values.code ? values.code.trim() : undefined,
        supplier_id: values.supplier_id,
        warehouse_id: values.warehouse_id,
        notes: values.notes,
        details: items.map((item) => ({
          product_id: item.product_id!,
          batch_lot: item.batch_lot.trim(),
          quantity: item.quantity,
          storage_location_id: item.storage_location_id || null,
        })),
      };

      setLoading(true);
      await createInboundReceipt(payload);
      message.success("Tạo phiếu nhập kho thành công!");
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || "Tạo phiếu nhập kho thất bại.");
    } finally {
      setLoading(false);
    }
  };

  // Filter locations for selected warehouse
  const availableLocations = options.storage_locations.filter((loc) =>
    selectedWarehouseId ? loc.warehouse_id === selectedWarehouseId : true
  );

  const columns = [
    {
      title: "STT",
      key: "index",
      width: 50,
      align: "center" as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: (
        <span>
          <span style={{ color: "#ef4444" }}>* </span>Sản phẩm
        </span>
      ),
      key: "product_id",
      width: 280,
      render: (_: any, record: FormRowItem) => (
        <Select
          showSearch
          placeholder="Chọn sản phẩm"
          value={record.product_id}
          onChange={(val) => handleUpdateItem(record.key, "product_id", val)}
          filterOption={(input, opt) =>
            String(opt?.children || "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          style={{ width: "100%" }}
        >
          {options.products.map((p) => (
            <Option key={p.id} value={p.id}>
              {p.sku ? `[${p.sku}] ` : ""}
              {p.name} {p.unit ? `(${p.unit})` : ""}
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: (
        <span>
          <span style={{ color: "#ef4444" }}>* </span>Mã lô hàng (Batch/Lot)
        </span>
      ),
      key: "batch_lot",
      width: 170,
      render: (_: any, record: FormRowItem) => (
        <Input
          prefix={<BarcodeOutlined style={{ color: "#94a3b8" }} />}
          placeholder="VD: LOT-2026-X1"
          value={record.batch_lot}
          onChange={(e) => handleUpdateItem(record.key, "batch_lot", e.target.value)}
        />
      ),
    },
    {
      title: (
        <span>
          <span style={{ color: "#ef4444" }}>* </span>Số lượng
        </span>
      ),
      key: "quantity",
      width: 120,
      render: (_: any, record: FormRowItem) => (
        <InputNumber
          min={1}
          value={record.quantity}
          onChange={(val) => handleUpdateItem(record.key, "quantity", val || 1)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Vị trí lưu kho (Khu/Kệ)",
      key: "storage_location_id",
      width: 220,
      render: (_: any, record: FormRowItem) => (
        <Select
          placeholder={selectedWarehouseId ? "Chọn khu / kệ" : "Chọn kho trước"}
          disabled={!selectedWarehouseId}
          value={record.storage_location_id ?? undefined}
          onChange={(val) => handleUpdateItem(record.key, "storage_location_id", val)}
          allowClear
          style={{ width: "100%" }}
        >
          {availableLocations.map((loc) => (
            <Option key={loc.id} value={loc.id}>
              {loc.code} - {loc.name} ({loc.level})
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      align: "center" as const,
      render: (_: any, record: FormRowItem) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemoveItem(record.key)}
          disabled={items.length <= 1}
        />
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
          <InboxOutlined style={{ color: "#2563eb", fontSize: 22 }} />
          <span>Lập phiếu nhập kho từ nhà cung cấp (SCRUM-30)</span>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      width={1000}
      footer={[
        <Button key="back" onClick={onClose} disabled={loading}>
          Hủy bỏ
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
          style={{ backgroundColor: "#2563eb" }}
        >
          Lưu phiếu nhập (Nháp)
        </Button>,
      ]}
      destroyOnClose
    >
      <Form form={form} layout="vertical" disabled={loading || optionsLoading}>
        {/* PHẦN 1: THÔNG TIN HEADER */}
        <Card
          size="small"
          title={
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
              1. Thông tin chung (Header)
            </span>
          }
          style={{ marginBottom: 16, borderRadius: 8, borderColor: "#e2e8f0" }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="supplier_id"
                label="Nhà cung cấp"
                rules={[{ required: true, message: "Vui lòng chọn nhà cung cấp!" }]}
              >
                <Select
                  showSearch
                  placeholder="Chọn nhà cung cấp"
                  filterOption={(input, opt) =>
                    String(opt?.children || "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                >
                  {options.suppliers.map((s) => (
                    <Option key={s.id} value={s.id}>
                      [{s.code}] {s.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="warehouse_id"
                label="Kho hàng nhận"
                rules={[{ required: true, message: "Vui lòng chọn kho hàng nhận!" }]}
              >
                <Select
                  placeholder="Chọn kho nhận"
                  onChange={handleWarehouseChange}
                >
                  {options.warehouses.map((w) => (
                    <Option key={w.id} value={w.id}>
                      [{w.code}] {w.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col span={8}>
              <Form.Item
                name="code"
                label="Mã phiếu nhập (Tùy chọn)"
                tooltip="Để trống hệ thống sẽ tự sinh mã theo mẫu: PNK-YYYYMMDD-XXXX"
              >
                <Input placeholder="Tự sinh nếu để trống" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="notes" label="Ghi chú phiếu nhập" style={{ marginBottom: 0 }}>
                <TextArea
                  rows={2}
                  placeholder="Nhập thông tin biển số xe, số hóa đơn NCC hoặc ghi chú kiểm hàng..."
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* PHẦN 2: BẢNG ĐỘNG CHI TIẾT HÀNG NHẬP */}
        <Card
          size="small"
          title={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
                2. Chi tiết hàng nhập (Sản phẩm, Lô hàng & Vị trí)
              </span>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddItem}
                style={{ borderColor: "#2563eb", color: "#2563eb" }}
              >
                Thêm dòng sản phẩm
              </Button>
            </div>
          }
          style={{ borderRadius: 8, borderColor: "#e2e8f0" }}
        >
          <Table
            dataSource={items}
            columns={columns}
            pagination={false}
            size="small"
            bordered
            rowKey="key"
            footer={() => (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontWeight: 600,
                  fontSize: 14,
                  padding: "4px 8px",
                }}
              >
                <span>Tổng số dòng: {items.length}</span>
                <span style={{ color: "#2563eb" }}>
                  Tổng số lượng nhập: {totalQuantity.toLocaleString("vi-VN")} đơn vị
                </span>
              </div>
            )}
          />
        </Card>
      </Form>
    </Modal>
  );
};

export default CreateReceiptModal;
