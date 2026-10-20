import React from "react";
import {
  Modal,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Popconfirm,
  Divider,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  BarcodeOutlined,
} from "@ant-design/icons";
import type {
  InboundReceiptDetailResponse,
  InboundReceiptResponse,
} from "../../types/inboundReceipt";

const { Text } = Typography;

interface ReceiptDetailModalProps {
  receipt: InboundReceiptResponse | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (id: number) => void;
  onCancel: (id: number) => void;
  loadingAction?: boolean;
}

export const ReceiptDetailModal: React.FC<ReceiptDetailModalProps> = ({
  receipt,
  isOpen,
  onClose,
  onComplete,
  onCancel,
  loadingAction,
}) => {
  if (!receipt) return null;

  const renderStatusTag = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Tag color="success">Đã hoàn tất</Tag>;
      case "CANCELLED":
        return <Tag color="default">Đã hủy</Tag>;
      default:
        return <Tag color="warning">Nháp (DRAFT)</Tag>;
    }
  };

  const columns = [
    {
      title: "STT",
      key: "idx",
      width: 50,
      align: "center" as const,
      render: (_: any, __: any, index: number) => index + 1,
    },
    {
      title: "Mã SKU",
      dataIndex: "product_sku",
      key: "product_sku",
      width: 120,
      render: (sku: string) => (sku ? <Text code>{sku}</Text> : "-"),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string) => <strong>{name || "Sản phẩm"}</strong>,
    },
    {
      title: "Mã lô hàng (Batch/Lot)",
      dataIndex: "batch_lot",
      key: "batch_lot",
      width: 160,
      render: (lot: string) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <BarcodeOutlined style={{ color: "#3b82f6" }} />
          <strong>{lot}</strong>
        </span>
      ),
    },
    {
      title: "Số lượng nhập",
      dataIndex: "quantity",
      key: "quantity",
      width: 120,
      align: "right" as const,
      render: (qty: number) => (
        <span style={{ fontWeight: 600, color: "#16a34a" }}>
          {qty.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      title: "Vị trí lưu kho (Khu/Kệ)",
      key: "storage_location",
      width: 220,
      render: (_: any, record: InboundReceiptDetailResponse) => {
        if (!record.storage_location_name) {
          return <span style={{ color: "#94a3b8" }}>Chưa xếp vị trí</span>;
        }
        return (
          <span>
            {record.storage_location_code} - {record.storage_location_name}
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18 }}>
          <InboxOutlined style={{ color: "#2563eb", fontSize: 22 }} />
          <span>Chi tiết phiếu nhập: {receipt.code}</span>
          {renderStatusTag(receipt.status)}
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        receipt.status === "DRAFT" && (
          <Popconfirm
            key="cancel"
            title="Xác nhận hủy phiếu nhập?"
            description="Phiếu nhập sẽ chuyển sang trạng thái Đã hủy và không thể hoàn tất."
            onConfirm={() => onCancel(receipt.id)}
            okText="Hủy phiếu"
            cancelText="Quay lại"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<CloseCircleOutlined />} loading={loadingAction}>
              Hủy phiếu
            </Button>
          </Popconfirm>
        ),
        receipt.status === "DRAFT" && (
          <Popconfirm
            key="complete"
            title="Xác nhận hoàn tất phiếu nhập?"
            description="Hệ thống sẽ tự động cộng dồn số lượng vào tồn kho thực tế của các vị trí tương ứng."
            onConfirm={() => onComplete(receipt.id)}
            okText="Hoàn tất ngay"
            cancelText="Để sau"
          >
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              style={{ backgroundColor: "#16a34a" }}
              loading={loadingAction}
            >
              Chốt phiếu & Cộng tồn kho
            </Button>
          </Popconfirm>
        ),
      ]}
      destroyOnClose
    >
      <Descriptions
        bordered
        size="small"
        column={{ xxl: 3, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}
        style={{ marginBottom: 20 }}
      >
        <Descriptions.Item label="Mã phiếu">
          <Text strong copyable>{receipt.code}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="Nhà cung cấp">
          {receipt.supplier_name} {receipt.supplier_code ? `(${receipt.supplier_code})` : ""}
        </Descriptions.Item>
        <Descriptions.Item label="Kho hàng nhận">
          <strong>{receipt.warehouse_name}</strong>
        </Descriptions.Item>

        <Descriptions.Item label="Ngày tạo">
          {receipt.created_at ? new Date(receipt.created_at).toLocaleString("vi-VN") : "-"}
        </Descriptions.Item>
        <Descriptions.Item label="Người lập">
          {receipt.creator_name || "Nhân viên kho"}
        </Descriptions.Item>
        <Descriptions.Item label="Tổng số lượng">
          <Text strong style={{ color: "#2563eb", fontSize: 15 }}>
            {receipt.total_quantity.toLocaleString("vi-VN")} đơn vị
          </Text>
        </Descriptions.Item>

        {receipt.notes && (
          <Descriptions.Item label="Ghi chú" span={3}>
            {receipt.notes}
          </Descriptions.Item>
        )}
      </Descriptions>

      <div style={{ marginBottom: 8, fontWeight: 600, color: "#1e293b", fontSize: 14 }}>
        Danh sách chi tiết hàng hóa nhập:
      </div>

      <Table
        dataSource={receipt.details}
        columns={columns}
        rowKey="id"
        pagination={false}
        size="small"
        bordered
      />
    </Modal>
  );
};

export default ReceiptDetailModal;
