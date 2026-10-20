import React, { useState, useEffect } from "react";
import {
  Modal,
  Table,
  InputNumber,
  Input,
  Button,
  Typography,
  Space,
  Tag,
  Alert,
  message,
  Divider,
  Descriptions,
} from "antd";
import {
  CheckCircleOutlined,
  WarningOutlined,
  InboxOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import {
  confirmInternalTransfer,
  extractErrorMessage,
  type InternalTransfer,
  type ConfirmInternalTransferPayload,
} from "../services/internalTransferService";

const { Text, Title } = Typography;
const { TextArea } = Input;

export interface InternalTransferConfirmModalProps {
  open: boolean;
  transfer: InternalTransfer | null;
  onClose: () => void;
  onSuccess?: (updatedTransfer: InternalTransfer) => void;
}

interface ItemConfirmRow {
  detailId: number;
  productId: number;
  productName: string;
  productSku: string;
  quantitySent: number;
  quantityReceived: number;
  discrepancyReason: string;
}

export const InternalTransferConfirmModal: React.FC<InternalTransferConfirmModalProps> = ({
  open,
  transfer,
  onClose,
  onSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<ItemConfirmRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Khởi tạo danh sách hàng cần nhận từ transfer props
  useEffect(() => {
    if (transfer && transfer.details) {
      setItems(
        transfer.details.map((d) => ({
          detailId: d.id,
          productId: d.product_id || d.productId || 0,
          productName: d.product_name || d.productName || `Sản phẩm #${d.product_id}`,
          productSku: d.product_sku || d.productSku || `SKU-${d.product_id}`,
          quantitySent: d.quantity_sent ?? d.quantitySent ?? 0,
          quantityReceived: d.quantity_sent ?? d.quantitySent ?? 0, // Mặc định bằng số lượng gửi
          discrepancyReason: "",
        })),
      );
      setErrorMessage(null);
    } else {
      setItems([]);
      setErrorMessage(null);
    }
  }, [transfer]);

  // Cập nhật số lượng thực nhận
  const handleQuantityReceivedChange = (detailId: number, val: number | null) => {
    const received = val !== null && val >= 0 ? val : 0;
    setItems((prev) =>
      prev.map((item) =>
        item.detailId === detailId ? { ...item, quantityReceived: received } : item,
      ),
    );
    setErrorMessage(null);
  };

  // Cập nhật lý do chênh lệch
  const handleReasonChange = (detailId: number, reason: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.detailId === detailId ? { ...item, discrepancyReason: reason } : item,
      ),
    );
    setErrorMessage(null);
  };

  // Xác nhận toàn bộ khớp 100%
  const handleSetAllExact = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        quantityReceived: item.quantitySent,
        discrepancyReason: "",
      })),
    );
    setErrorMessage(null);
  };

  // Xử lý gửi xác nhận nhận hàng
  const handleConfirm = async () => {
    if (!transfer) return;
    setErrorMessage(null);

    // AC 3: Kiểm tra nếu số thực nhận khác số gửi thì BẮT BUỘC PHẢI CÓ LÝ DO CHÊNH LỆCH
    for (const item of items) {
      const isDiscrepant = item.quantityReceived !== item.quantitySent;
      if (isDiscrepant) {
        if (!item.discrepancyReason || !item.discrepancyReason.trim()) {
          const msg = `Sản phẩm "${item.productName}" có chênh lệch số lượng (Gửi: ${item.quantitySent}, Nhận: ${item.quantityReceived}). Bắt buộc phải nhập "Lý do chênh lệch".`;
          setErrorMessage(msg);
          message.error(msg);
          return;
        }
      }
    }

    const payload: ConfirmInternalTransferPayload = {
      items: items.map((i) => ({
        detail_id: i.detailId,
        product_id: i.productId,
        quantity_received: i.quantityReceived,
        discrepancy_reason:
          i.quantityReceived !== i.quantitySent ? i.discrepancyReason.trim() : null,
      })),
    };

    setSubmitting(true);
    try {
      const response = await confirmInternalTransfer(transfer.id, payload);
      message.success(
        response.message ||
          `Đã xác nhận nhận hàng thành công cho phiếu #${transfer.id}! Tồn kho kho đến đã được cộng.`,
      );
      if (onSuccess) {
        onSuccess(response.data);
      }
      onClose();
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Không thể xác nhận nhận hàng.");
      setErrorMessage(msg);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Định nghĩa cột bảng xác nhận
  const columns: ColumnsType<ItemConfirmRow> = [
    {
      title: "STT",
      key: "index",
      width: 50,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "Mặt hàng",
      key: "product",
      width: 220,
      render: (_, record) => (
        <div>
          <Text strong>{record.productName}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            SKU: {record.productSku}
          </Text>
        </div>
      ),
    },
    {
      title: "Số lượng gửi",
      key: "quantitySent",
      width: 120,
      align: "center",
      render: (val: number) => (
        <Tag color="blue" style={{ fontSize: 13, padding: "2px 8px" }}>
          {val.toLocaleString("vi-VN")}
        </Tag>
      ),
    },
    {
      title: "Số lượng thực nhận",
      key: "quantityReceived",
      width: 170,
      render: (_, record) => (
        <InputNumber
          min={0}
          max={100000}
          style={{ width: "100%" }}
          value={record.quantityReceived}
          onChange={(val) => handleQuantityReceivedChange(record.detailId, val)}
          status={record.quantityReceived !== record.quantitySent ? "warning" : ""}
        />
      ),
    },
    {
      title: "Tình trạng chênh lệch",
      key: "status",
      width: 180,
      render: (_, record) => {
        const diff = record.quantityReceived - record.quantitySent;
        if (diff === 0) {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Khớp số lượng
            </Tag>
          );
        }
        return (
          <Tag color="error" icon={<WarningOutlined />}>
            Chênh lệch: {diff > 0 ? `+${diff}` : diff}
          </Tag>
        );
      },
    },
    {
      title: "Lý do chênh lệch (Bắt buộc nếu có chênh lệch)",
      key: "discrepancyReason",
      render: (_, record) => {
        const diff = record.quantityReceived - record.quantitySent;
        const isDiscrepant = diff !== 0;

        if (!isDiscrepant) {
          return (
            <Text type="secondary" italic style={{ fontSize: 12 }}>
              Không có chênh lệch
            </Text>
          );
        }

        // TỰ ĐỘNG HIỆN RA Ô INPUT BẮT BUỘC NHẬP KHI CÓ CHÊNH LỆCH
        const hasError = !record.discrepancyReason || !record.discrepancyReason.trim();
        return (
          <div>
            <TextArea
              rows={2}
              placeholder="* Bắt buộc: Nhập lý do chênh lệch (ví dụ: Vỡ hỏng, thiếu hàng từ kho xuất...)"
              value={record.discrepancyReason}
              onChange={(e) => handleReasonChange(record.detailId, e.target.value)}
              status={hasError ? "error" : ""}
              style={{
                borderColor: hasError ? "#ff4d4f" : undefined,
                background: hasError ? "#fff2f0" : undefined,
              }}
            />
            {hasError && (
              <div style={{ color: "#ff4d4f", fontSize: 12, marginTop: 4 }}>
                * Bắt buộc nhập lý do chênh lệch
              </div>
            )}
          </div>
        );
      },
    },
  ];

  const totalSent = items.reduce((sum, i) => sum + i.quantitySent, 0);
  const totalReceived = items.reduce((sum, i) => sum + i.quantityReceived, 0);
  const hasAnyDiscrepancy = items.some((i) => i.quantityReceived !== i.quantitySent);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={980}
      title={
        <Space align="center">
          <InboxOutlined style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 22 }} />
          <span>Xác Nhận Nhận Hàng Chuyển Kho — Phiếu #{transfer?.id}</span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Hủy bỏ
        </Button>,
        <Button
          key="confirm"
          type="primary"
          icon={<CheckOutlined />}
          loading={submitting}
          onClick={handleConfirm}
          style={{
            background: "var(--accent-primary, #4F46E5)",
            borderColor: "var(--accent-primary, #4F46E5)",
          }}
        >
          Xác nhận nhận đủ hàng & Cộng tồn kho
        </Button>,
      ]}
      destroyOnClose
    >
      {transfer ? (
        <div>
          {/* Thông tin phiếu chuyển */}
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, md: 3 }}
            style={{ marginBottom: 16 }}
          >
            <Descriptions.Item label="Mã phiếu">
              <b>#{transfer.id}</b>
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <Tag color="orange" style={{ fontWeight: 600 }}>
                {transfer.status === "IN_TRANSIT"
                  ? "ĐANG VẬN CHUYỂN"
                  : transfer.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Ngày tạo phiếu">
              {transfer.created_at
                ? new Date(transfer.created_at).toLocaleString("vi-VN")
                : "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Kho xuất phát (Kho gửi)">
              <Text strong style={{ color: "#1E40AF" }}>
                {transfer.from_warehouse_name || `Kho #${transfer.from_warehouse_id}`}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Kho đích đến (Kho nhận)" span={2}>
              <Text strong style={{ color: "#166534" }}>
                {transfer.to_warehouse_name || `Kho #${transfer.to_warehouse_id}`}
              </Text>
            </Descriptions.Item>
          </Descriptions>

          {/* AC 2 & AC 3 Notice Banner */}
          <Alert
            type={hasAnyDiscrepancy ? "warning" : "info"}
            showIcon
            icon={hasAnyDiscrepancy ? <ExclamationCircleOutlined /> : <InboxOutlined />}
            message="Quy trình kiểm đếm nhận hàng"
            description={
              <div>
                Thủ kho đến vui lòng đối chiếu số lượng thực tế nhận được so với số lượng gửi.
                <br />
                • Tồn kho của kho đến <b>CHỈ ĐƯỢC CỘNG</b> khi bạn bấm nút "Xác nhận nhận đủ hàng".
                <br />
                • Nếu có bất kỳ dòng hàng nào có số thực nhận <b>khác với số gửi</b>, hệ thống{" "}
                <b>bắt buộc bạn phải nhập "Lý do chênh lệch"</b>.
              </div>
            }
            style={{ marginBottom: 16, borderRadius: 8 }}
          />

          {errorMessage && (
            <Alert
              type="error"
              showIcon
              message="Chưa thể xác nhận nhận hàng"
              description={errorMessage}
              closable
              onClose={() => setErrorMessage(null)}
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Nút thao tác nhanh */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text strong>Danh sách mặt hàng kiểm đếm:</Text>
            <Button size="small" onClick={handleSetAllExact}>
              Điền nhanh: Nhận đủ 100% theo phiếu gửi
            </Button>
          </div>

          {/* Bảng chi tiết mặt hàng */}
          <Table
            dataSource={items}
            columns={columns}
            pagination={false}
            rowKey="detailId"
            size="middle"
            bordered
          />

          {/* Tổng kết số lượng */}
          <div
            style={{
              marginTop: 16,
              padding: "12px 16px",
              background: "var(--bg-primary, #F8FAFC)",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Space split={<Divider type="vertical" />}>
              <Text>
                Tổng gửi đi: <b>{totalSent.toLocaleString("vi-VN")}</b>
              </Text>
              <Text>
                Tổng thực nhận:{" "}
                <Text
                  strong
                  style={{
                    color:
                      totalReceived !== totalSent
                        ? "#D97706"
                        : "var(--accent-primary, #4F46E5)",
                  }}
                >
                  {totalReceived.toLocaleString("vi-VN")}
                </Text>
              </Text>
              <Text>
                Chênh lệch tổng:{" "}
                <b>
                  {totalReceived - totalSent === 0
                    ? "0 (Khớp)"
                    : (totalReceived - totalSent > 0
                        ? `+${totalReceived - totalSent}`
                        : totalReceived - totalSent
                      ).toLocaleString("vi-VN")}
                </b>
              </Text>
            </Space>

            {hasAnyDiscrepancy ? (
              <Tag color="warning">Có chênh lệch cần giải trình</Tag>
            ) : (
              <Tag color="success">Số lượng khớp hoàn toàn</Tag>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

export default InternalTransferConfirmModal;
