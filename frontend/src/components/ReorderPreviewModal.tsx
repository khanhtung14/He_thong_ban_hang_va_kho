import React, { useEffect, useState, useMemo } from "react";
import {
  Modal,
  Table,
  Checkbox,
  Button,
  Alert,
  Typography,
  Space,
  Tag,
  Input,
  InputNumber,
  Spin,
  notification,
  Divider,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ShoppingCartOutlined,
  WarningFilled,
  CheckCircleOutlined,
  ReloadOutlined,
  DollarCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { fetchReorderPreview, submitReorder } from "../services/orderService";
import type {
  ReorderPreviewResponse,
  ReorderItemPreview,
  ReorderDiscontinuedItem,
} from "../types/reorder";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

interface ReorderPreviewModalProps {
  open: boolean;
  orderId: number | null;
  orderCode?: string;
  onClose: () => void;
  onSuccess?: (newOrderData: any) => void;
}

export const ReorderPreviewModal: React.FC<ReorderPreviewModalProps> = ({
  open,
  orderId,
  orderCode,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState<ReorderPreviewResponse | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string>("");

  // Load dữ liệu xem trước khi mở modal
  useEffect(() => {
    if (open && orderId) {
      loadPreview(orderId);
    } else {
      setPreviewData(null);
      setSelectedSkus([]);
      setQuantities({});
      setNote("");
    }
  }, [open, orderId]);

  const loadPreview = async (id: number) => {
    setLoading(true);
    try {
      const data = await fetchReorderPreview(id);
      setPreviewData(data);
      // Mặc định chọn tất cả các mặt hàng hợp lệ (còn kinh doanh)
      const initialSkus = data.available_items.map((it) => it.sku);
      setSelectedSkus(initialSkus);

      const initQtys: Record<string, number> = {};
      data.available_items.forEach((it) => {
        initQtys[it.sku] = it.quantity;
      });
      setQuantities(initQtys);
      setNote(`Đặt lại từ đơn hàng #${data.order_code}`);
    } catch (err: any) {
      notification.error({
        message: "Lỗi tải thông tin đặt lại đơn",
        description: err.message || "Không thể tải danh sách sản phẩm xem trước.",
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (sku: string, val: number | null) => {
    if (val && val > 0) {
      setQuantities((prev) => ({ ...prev, [sku]: val }));
    }
  };

  const toggleSelectSku = (sku: string) => {
    setSelectedSkus((prev) =>
      prev.includes(sku) ? prev.filter((s) => s !== sku) : [...prev, sku]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && previewData) {
      setSelectedSkus(previewData.available_items.map((it) => it.sku));
    } else {
      setSelectedSkus([]);
    }
  };

  // Tính toán lại tổng tiền dựa trên các sản phẩm đã chọn và số lượng tương ứng
  const { totalAmount, selectedCount } = useMemo(() => {
    if (!previewData) return { totalAmount: 0, selectedCount: 0 };
    let total = 0;
    let count = 0;
    previewData.available_items.forEach((item) => {
      if (selectedSkus.includes(item.sku)) {
        const qty = quantities[item.sku] ?? item.quantity;
        total += item.new_unit_price * qty;
        count++;
      }
    });
    return { totalAmount: total, selectedCount: count };
  }, [previewData, selectedSkus, quantities]);

  const handleSubmit = async () => {
    if (!orderId || selectedSkus.length === 0 || !previewData) {
      notification.warning({
        message: "Chưa chọn mặt hàng",
        description: "Vui lòng chọn ít nhất một mặt hàng hợp lệ để tạo đơn mới.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const itemsToSubmit = previewData.available_items
        .filter((it) => selectedSkus.includes(it.sku))
        .map((it) => ({
          product_id: it.product_id,
          sku: it.sku,
          product_name: it.product_name,
          unit_id: it.unit_id,
          quantity: quantities[it.sku] ?? it.quantity,
          unit_price: it.new_unit_price,
        }));

      const payload = {
        original_order_id: orderId,
        items: itemsToSubmit,
        note: note.trim() || undefined,
      };

      const res = await submitReorder(payload);

      notification.success({
        message: "Đặt lại đơn hàng thành công!",
        description: (
          <div>
            <p style={{ margin: 0 }}>
              Đơn hàng mới <strong>#{res.order_code}</strong> đã được khởi tạo.
            </p>
            <p style={{ margin: "4px 0 0 0", color: "#64748b" }}>
              Tổng tiền mới: <strong>{totalAmount.toLocaleString("vi-VN")} ₫</strong> ({itemsToSubmit.length} mặt hàng).
            </p>
          </div>
        ),
        icon: <CheckCircleOutlined style={{ color: "#10b981" }} />,
        duration: 5,
      });

      onSuccess?.(res);
      onClose();
    } catch (err: any) {
      notification.error({
        message: "Đặt lại đơn hàng thất bại",
        description: err.message || "Đã xảy ra lỗi khi tạo đơn hàng mới.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<ReorderItemPreview> = [
    {
      title: (
        <Checkbox
          indeterminate={
            selectedSkus.length > 0 &&
            previewData?.available_items &&
            selectedSkus.length < previewData.available_items.length
          }
          checked={
            (previewData?.available_items.length ?? 0) > 0 &&
            selectedSkus.length === previewData?.available_items.length
          }
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
      ),
      dataIndex: "sku",
      key: "checkbox",
      width: 50,
      render: (sku: string) => (
        <Checkbox
          checked={selectedSkus.includes(sku)}
          onChange={() => toggleSelectSku(sku)}
        />
      ),
    },
    {
      title: "Sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      render: (text: string, record: ReorderItemPreview) => (
        <div>
          <Text strong style={{ color: "#1e293b", fontSize: 14 }}>
            {text}
          </Text>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Mã SKU: <Tag color="blue">{record.sku}</Tag>
            {record.unit_name && (
              <span style={{ marginLeft: 8 }}>
                ĐVT: <strong>{record.unit_name}</strong>
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      width: 130,
      render: (_: number, record: ReorderItemPreview) => (
        <InputNumber
          min={1}
          max={9999}
          value={quantities[record.sku] ?? record.quantity}
          onChange={(val) => handleQuantityChange(record.sku, val)}
          disabled={!selectedSkus.includes(record.sku)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "Đơn giá cập nhật",
      key: "price_comparison",
      width: 220,
      render: (_: any, record: ReorderItemPreview) => {
        const isPriceChanged = record.old_unit_price !== record.new_unit_price;
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Text strong style={{ color: "#0284c7", fontSize: 14 }}>
                {record.new_unit_price.toLocaleString("vi-VN")} ₫
              </Text>
              {record.price_list_code && (
                <Tag color="cyan" style={{ fontSize: 10, padding: "0 4px" }}>
                  Bảng giá
                </Tag>
              )}
            </div>
            {isPriceChanged && (
              <div style={{ fontSize: 12, color: "#94a3b8", textDecoration: "line-through", marginTop: 2 }}>
                Giá cũ: {record.old_unit_price.toLocaleString("vi-VN")} ₫
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "Thành tiền",
      key: "total_price",
      width: 160,
      align: "right",
      render: (_: any, record: ReorderItemPreview) => {
        const qty = quantities[record.sku] ?? record.quantity;
        const lineTotal = record.new_unit_price * qty;
        const isSelected = selectedSkus.includes(record.sku);
        return (
          <Text
            strong
            style={{
              color: isSelected ? "#0f172a" : "#94a3b8",
              fontSize: 14,
            }}
          >
            {lineTotal.toLocaleString("vi-VN")} ₫
          </Text>
        );
      },
    },
  ];

  const discontinuedColumns: ColumnsType<ReorderDiscontinuedItem> = [
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (sku: string) => <Tag color="volcano">{sku}</Tag>,
    },
    {
      title: "Tên mặt hàng đã ngừng kinh doanh",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string) => <Text delete type="secondary">{name}</Text>,
    },
    {
      title: "Số lượng cũ",
      dataIndex: "quantity",
      key: "quantity",
      width: 110,
      align: "center",
      render: (qty: number) => <Text type="secondary">{qty}</Text>,
    },
    {
      title: "Lý do loại bỏ",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string) => (
        <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
          {reason}
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={900}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              backgroundColor: "#eff6ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#2563eb",
              fontSize: 18,
            }}
          >
            <ReloadOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
              Đặt lại đơn hàng (SCRUM-28)
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {previewData ? (
                <>
                  Dựa trên đơn hàng gốc: <strong>#{previewData.order_code}</strong> | Đại lý:{" "}
                  <strong>{previewData.customer_name || "N/A"}</strong>
                </>
              ) : (
                `Đơn hàng #${orderCode || orderId || ""}`
              )}
            </Text>
          </div>
        </div>
      }
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 0",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>
              Đã chọn: <strong style={{ color: "#0f172a" }}>{selectedCount}</strong> /{" "}
              {previewData?.available_items.length ?? 0} mặt hàng
            </span>
            <div style={{ fontSize: 16, marginTop: 2 }}>
              <span style={{ color: "#64748b" }}>Tổng tiền mới: </span>
              <strong style={{ color: "#2563eb", fontSize: 19 }}>
                {totalAmount.toLocaleString("vi-VN")} ₫
              </strong>
            </div>
          </div>
          <Space>
            <Button onClick={onClose} disabled={submitting}>
              Đóng
            </Button>
            <Button
              type="primary"
              icon={<ShoppingCartOutlined />}
              onClick={handleSubmit}
              loading={submitting}
              disabled={loading || selectedCount === 0}
              style={{
                backgroundColor: "#2563eb",
                borderColor: "#2563eb",
                height: 40,
                padding: "0 24px",
                fontWeight: 600,
              }}
            >
              Xác nhận đặt lại đơn ({selectedCount})
            </Button>
          </Space>
        </div>
      }
    >
      <Spin spinning={loading} tip="Đang tải và cập nhật bảng giá hiện hành...">
        {/* Banner cảnh báo các mặt hàng đã ngừng kinh doanh */}
        {previewData?.has_discontinued_items && (
          <Alert
            message={
              <span style={{ fontWeight: 600, color: "#9a3412" }}>
                Cảnh báo: Mặt hàng đã ngừng kinh doanh được tự động loại bỏ
              </span>
            }
            description={
              <div>
                <p style={{ margin: "4px 0 8px 0", color: "#9a3412", fontSize: 13 }}>
                  {previewData.warning_message ||
                    "Hệ thống phát hiện một số mặt hàng trong đơn hàng cũ đã ngừng kinh doanh. Các mặt hàng này sẽ không được đưa vào đơn hàng mới."}
                </p>
                <Table
                  dataSource={previewData.discontinued_items}
                  columns={discontinuedColumns}
                  rowKey="sku"
                  pagination={false}
                  size="small"
                  bordered
                  style={{ backgroundColor: "#fff", borderRadius: 6 }}
                />
              </div>
            }
            type="warning"
            showIcon
            icon={<WarningFilled style={{ color: "#ea580c" }} />}
            style={{
              marginBottom: 20,
              backgroundColor: "#fff7ed",
              borderColor: "#fed7aa",
              borderRadius: 8,
            }}
          />
        )}

        {/* Thông tin hỗ trợ bảng giá */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 6,
            padding: "8px 12px",
            marginBottom: 16,
            color: "#166534",
            fontSize: 13,
          }}
        >
          <DollarCircleOutlined style={{ fontSize: 16 }} />
          <span>
            Đơn giá của các mặt hàng hợp lệ đã được cập nhật tự động theo{" "}
            <strong>bảng giá hiện hành (PriceLists)</strong>. Bạn có thể chọn toàn bộ hoặc tích chọn từng mặt hàng muốn đặt lại.
          </span>
        </div>

        {/* Bảng danh sách mặt hàng hợp lệ */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
              Danh sách mặt hàng hợp lệ ({previewData?.available_items.length || 0})
            </Text>
            <Space>
              <Button
                size="small"
                onClick={() => handleSelectAll(true)}
                disabled={selectedSkus.length === (previewData?.available_items.length || 0)}
              >
                Chọn tất cả
              </Button>
              <Button
                size="small"
                onClick={() => handleSelectAll(false)}
                disabled={selectedSkus.length === 0}
              >
                Bỏ chọn tất cả
              </Button>
            </Space>
          </div>

          <Table
            dataSource={previewData?.available_items || []}
            columns={columns}
            rowKey="sku"
            pagination={false}
            size="middle"
            locale={{
              emptyText: "Không có mặt hàng hợp lệ nào để đặt lại.",
            }}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              overflow: "hidden",
            }}
          />
        </div>

        {/* Ghi chú đơn hàng */}
        <div style={{ marginTop: 12 }}>
          <Text strong style={{ fontSize: 14, color: "#334155" }}>
            Ghi chú đơn hàng mới:
          </Text>
          <TextArea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhập ghi chú cho đơn hàng đặt lại này (tùy chọn)..."
            maxLength={500}
            showCount
            style={{ marginTop: 6, borderRadius: 6 }}
          />
        </div>
      </Spin>
    </Modal>
  );
};

export default ReorderPreviewModal;
