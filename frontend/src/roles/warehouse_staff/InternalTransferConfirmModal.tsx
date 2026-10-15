import React, { useState, useEffect } from "react";
import {
  Modal,
  Table,
  InputNumber,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Alert,
  Divider,
  message,
  Row,
  Col,
  Descriptions,
  Tooltip,
} from "antd";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  WarningOutlined,
  ArrowRightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import type {
  InternalTransfer,
  ConfirmTransferPayload,
  ConfirmTransferItemPayload,
} from "../../types/internalTransfer";
import { confirmInternalTransfer } from "../../services/internalTransferService";
import { getCurrentUserName } from "../../services/sessionService";

const { Text, Title } = Typography;
const { TextArea } = Input;

interface ItemConfirmState {
  itemId: number;
  productId: number;
  productName: string;
  productSku: string;
  unit: string;
  sentQuantity: number;
  receivedQuantity: number;
  discrepancyReason: string;
}

interface InternalTransferConfirmModalProps {
  visible: boolean;
  transfer: InternalTransfer | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export const InternalTransferConfirmModal: React.FC<InternalTransferConfirmModalProps> = ({
  visible,
  transfer,
  onSuccess,
  onCancel,
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmedBy, setConfirmedBy] = useState<string>("");
  const [itemsState, setItemsState] = useState<ItemConfirmState[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<number, string>>({});

  // Khởi tạo dữ liệu khi modal mở ra
  useEffect(() => {
    if (transfer && visible) {
      const loggedInUser = getCurrentUserName() || "Thủ kho nhận";
      setConfirmedBy(loggedInUser);

      const initialItems: ItemConfirmState[] = transfer.items.map((item) => ({
        itemId: item.id,
        productId: item.product_id,
        productName: item.product_name || `Sản phẩm #${item.product_id}`,
        productSku: item.product_sku || `SKU-${item.product_id}`,
        unit: item.unit || "Cái",
        sentQuantity: item.sent_quantity,
        // Mặc định điền sẵn số lượng gửi để nhân viên tiện kiểm tra và xác nhận
        receivedQuantity: item.received_quantity !== null && item.received_quantity !== undefined ? item.received_quantity : item.sent_quantity,
        discrepancyReason: item.discrepancy_reason || "",
      }));

      setItemsState(initialItems);
      setValidationErrors({});
    }
  }, [transfer, visible]);

  // Cập nhật số lượng thực nhận
  const handleQuantityChange = (itemId: number, qty: number | null) => {
    const val = qty !== null && qty >= 0 ? qty : 0;
    setItemsState((prev) =>
      prev.map((item) => {
        if (item.itemId === itemId) {
          const updated = { ...item, receivedQuantity: val };
          // Xóa lỗi nếu số lượng đã khớp
          if (val === item.sentQuantity) {
            setValidationErrors((errs) => {
              const copy = { ...errs };
              delete copy[itemId];
              return copy;
            });
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Cập nhật lý do chênh lệch
  const handleReasonChange = (itemId: number, reason: string) => {
    setItemsState((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, discrepancyReason: reason } : item))
    );
    if (reason.trim()) {
      setValidationErrors((errs) => {
        const copy = { ...errs };
        delete copy[itemId];
        return copy;
      });
    }
  };

  // Nút hành động nhanh: Khớp toàn bộ số lượng thực nhận = số lượng gửi
  const handleMatchAll = () => {
    setItemsState((prev) =>
      prev.map((item) => ({
        ...item,
        receivedQuantity: item.sentQuantity,
        discrepancyReason: "",
      }))
    );
    setValidationErrors({});
    message.info("Đã đặt số lượng thực nhận khớp với toàn bộ số lượng gửi.");
  };

  // Kiểm tra có bất kỳ sản phẩm nào chênh lệch không
  const hasAnyDiscrepancy = itemsState.some((i) => i.receivedQuantity !== i.sentQuantity);

  // Xử lý xác nhận nhận hàng
  const handleConfirm = async () => {
    if (!transfer) return;

    // --- KIỂM TRA NGHIỆP VỤ BẮT BUỘC: Lý do chênh lệch ---
    const errors: Record<number, string> = {};
    for (const item of itemsState) {
      if (item.receivedQuantity !== item.sentQuantity) {
        if (!item.discrepancyReason.trim()) {
          errors[item.itemId] = "Bắt buộc nhập lý do khi số lượng thực nhận khác số lượng gửi!";
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      message.error("Vui lòng nhập lý do chênh lệch cho các sản phẩm có số lượng nhận khác số lượng gửi!");
      return;
    }

    const payload: ConfirmTransferPayload = {
      confirmed_by: confirmedBy.trim() || undefined,
      items: itemsState.map((item) => ({
        item_id: item.itemId,
        product_id: item.productId,
        received_quantity: item.receivedQuantity,
        discrepancy_reason: item.discrepancyReason.trim() || undefined,
      })),
    };

    setLoading(true);
    try {
      await confirmInternalTransfer(transfer.id, payload);
      message.success(`Đã xác nhận nhận hàng phiếu '${transfer.transfer_code}' thành công! Tồn kho đã được cộng vào kho đến.`);
      onSuccess();
    } catch (err: any) {
      message.error(err.message || "Xác nhận nhận hàng thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "STT",
      key: "index",
      width: 50,
      align: "center" as const,
      render: (_: any, __: any, idx: number) => idx + 1,
    },
    {
      title: "Sản phẩm / SKU",
      key: "product",
      render: (_: any, record: ItemConfirmState) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e293b" }}>{record.productName}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            SKU: <Text code>{record.productSku}</Text>
          </div>
        </div>
      ),
    },
    {
      title: "ĐVT",
      dataIndex: "unit",
      key: "unit",
      width: 80,
      align: "center" as const,
      render: (unit: string) => <Tag color="geekblue">{unit}</Tag>,
    },
    {
      title: "SL Gửi",
      dataIndex: "sentQuantity",
      key: "sentQuantity",
      width: 100,
      align: "center" as const,
      render: (qty: number) => (
        <span style={{ fontWeight: 700, fontSize: 15, color: "#334155" }}>
          {qty}
        </span>
      ),
    },
    {
      title: (
        <span>
          SL Thực nhận <span style={{ color: "#ef4444" }}>*</span>
        </span>
      ),
      key: "receivedQuantity",
      width: 150,
      render: (_: any, record: ItemConfirmState) => {
        const differs = record.receivedQuantity !== record.sentQuantity;
        return (
          <Space direction="vertical" size={2} style={{ width: "100%" }}>
            <InputNumber
              min={0}
              value={record.receivedQuantity}
              onChange={(val) => handleQuantityChange(record.itemId, val)}
              status={differs ? "warning" : undefined}
              style={{ width: "100%", fontWeight: 600 }}
            />
            {differs && (
              <span style={{ fontSize: 11, color: record.receivedQuantity < record.sentQuantity ? "#dc2626" : "#d97706" }}>
                {record.receivedQuantity < record.sentQuantity
                  ? `Thiếu ${record.sentQuantity - record.receivedQuantity}`
                  : `Thừa ${record.receivedQuantity - record.sentQuantity}`}
              </span>
            )}
          </Space>
        );
      },
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 110,
      align: "center" as const,
      render: (_: any, record: ItemConfirmState) => {
        if (record.receivedQuantity === record.sentQuantity) {
          return <Tag color="success" icon={<CheckOutlined />}>Khớp</Tag>;
        }
        if (record.receivedQuantity < record.sentQuantity) {
          return <Tag color="error" icon={<WarningOutlined />}>Thiếu hàng</Tag>;
        }
        return <Tag color="warning" icon={<WarningOutlined />}>Thừa hàng</Tag>;
      },
    },
    {
      title: (
        <span>
          Lý do chênh lệch{" "}
          <Tooltip title="Bắt buộc nhập nếu số lượng thực nhận khác số lượng gửi">
            <span style={{ color: "#ef4444" }}>*</span>
          </Tooltip>
        </span>
      ),
      key: "discrepancyReason",
      width: 250,
      render: (_: any, record: ItemConfirmState) => {
        const differs = record.receivedQuantity !== record.sentQuantity;
        const hasError = !!validationErrors[record.itemId];

        return (
          <div style={{ position: "relative" }}>
            <TextArea
              rows={2}
              placeholder={differs ? "Nhập lý do chênh lệch (Bắt buộc)..." : "Không có chênh lệch"}
              value={record.discrepancyReason}
              onChange={(e) => handleReasonChange(record.itemId, e.target.value)}
              disabled={!differs}
              status={hasError ? "error" : differs ? "warning" : undefined}
              style={{
                fontSize: 12,
                borderColor: hasError ? "#ef4444" : differs && !record.discrepancyReason.trim() ? "#f59e0b" : undefined,
              }}
            />
            {hasError && (
              <div style={{ color: "#ef4444", fontSize: 11, marginTop: 2 }}>
                {validationErrors[record.itemId]}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <Space align="center">
          <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 20 }} />
          <span>
            Xác Nhận Nhận Hàng Chuyển Kho —{" "}
            <Text code strong style={{ color: "#2563eb" }}>
              {transfer?.transfer_code}
            </Text>
          </span>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={1000}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={loading}>
          Đóng
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckCircleOutlined />}
          loading={loading}
          onClick={handleConfirm}
          style={{ background: "#16a34a", borderColor: "#16a34a", fontWeight: 600 }}
        >
          Xác nhận nhận hàng & Nhập kho
        </Button>,
      ]}
      destroyOnClose
    >
      {transfer && (
        <div>
          {/* Thông tin phiếu chuyển */}
          <div
            style={{
              background: "#f8fafc",
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              marginBottom: 16,
            }}
          >
            <Row gutter={16} align="middle">
              <Col xs={24} md={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>Kho xuất hàng (Kho đi):</Text>
                <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>
                  {transfer.from_warehouse_name}
                </div>
              </Col>
              <Col xs={24} md={4} style={{ textAlign: "center" }}>
                <ArrowRightOutlined style={{ color: "#2563eb", fontSize: 18 }} />
              </Col>
              <Col xs={24} md={10}>
                <Text type="secondary" style={{ fontSize: 12 }}>Kho nhận hàng (Kho đến):</Text>
                <div style={{ fontWeight: 600, color: "#16a34a", fontSize: 14 }}>
                  {transfer.to_warehouse_name}
                </div>
              </Col>
            </Row>

            <Divider style={{ margin: "10px 0" }} />

            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Người gửi:</Text>
                <div><strong>{transfer.created_by || "Hệ thống"}</strong></div>
              </Col>
              <Col xs={12} sm={6}>
                <Text type="secondary" style={{ fontSize: 12 }}>Thời gian gửi:</Text>
                <div>{transfer.created_at ? new Date(transfer.created_at).toLocaleString("vi-VN") : "—"}</div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Họ tên người nhận:</Text>
                <Input
                  prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
                  value={confirmedBy}
                  onChange={(e) => setConfirmedBy(e.target.value)}
                  placeholder="Nhập họ tên thủ kho nhận"
                  size="small"
                  style={{ marginTop: 2 }}
                />
              </Col>
            </Row>
          </div>

          {/* Cảnh báo quy tắc bắt buộc lý do chênh lệch */}
          {hasAnyDiscrepancy ? (
            <Alert
              type="warning"
              showIcon
              icon={<ExclamationCircleOutlined />}
              message="Phát hiện chênh lệch số lượng thực nhận"
              description="Quy tắc bắt buộc: Nếu số lượng thực nhận khác số lượng gửi (do mất mát, hư hỏng, thừa/thiếu), bạn BẮT BUỘC phải điền lý do chênh lệch cụ thể cho từng sản phẩm trước khi xác nhận."
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Alert
              type="success"
              showIcon
              message="Số lượng thực nhận đang khớp 100% với số lượng gửi"
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Thanh công cụ bảng */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text strong>Danh sách hàng hóa cần kiểm nhận ({itemsState.length} sản phẩm):</Text>
            <Button size="small" type="link" onClick={handleMatchAll}>
              Khớp toàn bộ số lượng gửi
            </Button>
          </div>

          <Table
            dataSource={itemsState}
            columns={columns}
            rowKey="itemId"
            pagination={false}
            size="middle"
            bordered
            rowClassName={(record) =>
              record.receivedQuantity !== record.sentQuantity ? "row-discrepancy" : ""
            }
          />
        </div>
      )}
    </Modal>
  );
};

export default InternalTransferConfirmModal;
