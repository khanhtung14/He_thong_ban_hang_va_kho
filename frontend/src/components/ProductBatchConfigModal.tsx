import React, { useState, useEffect } from "react";
import {
  Modal,
  Switch,
  Typography,
  Space,
  Alert,
  message,
  Card,
  Descriptions,
  Tag,
  Divider,
} from "antd";
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  toggleSkuBatchManagement,
  extractErrorMessage,
} from "../services/batchService";

const { Text, Title, Paragraph } = Typography;

export interface ProductBatchConfigModalProps {
  open: boolean;
  product: {
    id: number;
    sku: string;
    name: string;
    base_unit?: string;
    is_batch_managed?: boolean;
    manage_by_lot?: boolean;
  } | null;
  onClose: () => void;
  onSuccess?: (updatedStatus: boolean) => void;
}

export const ProductBatchConfigModal: React.FC<ProductBatchConfigModalProps> = ({
  open,
  product,
  onClose,
  onSuccess,
}) => {
  const [isManaged, setIsManaged] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (product) {
      setIsManaged(Boolean(product.is_batch_managed ?? product.manage_by_lot));
    }
  }, [product]);

  const handleSave = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const res = await toggleSkuBatchManagement(product.id, isManaged);
      message.success(
        res.message ||
          `Đã ${isManaged ? "kích hoạt" : "hủy"} quản lý theo lô cho sản phẩm ${product.sku}.`,
      );
      if (onSuccess) {
        onSuccess(isManaged);
      }
      onClose();
    } catch (err) {
      const msg = extractErrorMessage(err, "Không thể cập nhật cấu hình quản lý lô.");
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Lưu cấu hình"
      cancelText="Đóng"
      confirmLoading={loading}
      width={600}
      title={
        <Space align="center">
          <ApartmentOutlined style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 20 }} />
          <span>Cấu Hình Quản Lý Lô Sản Phẩm (SKU)</span>
        </Space>
      }
      destroyOnClose
    >
      {product && (
        <div style={{ marginTop: 12 }}>
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Mã SKU">
              <Text strong>{product.sku}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Tên sản phẩm">
              {product.name}
            </Descriptions.Item>
            <Descriptions.Item label="Đơn vị tính cơ sở">
              <Tag color="blue">{product.base_unit || "Cái"}</Tag>
            </Descriptions.Item>
          </Descriptions>

          <Card
            type="inner"
            style={{
              borderRadius: 8,
              border: isManaged ? "1px solid #c7d2fe" : "1px solid #e2e8f0",
              background: isManaged ? "#f5f3ff" : "#f8fafc",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <Text strong style={{ fontSize: 15, display: "block" }}>
                  Kích hoạt Quản lý theo lô & Hạn sử dụng
                </Text>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Theo dõi số lô (Batch No), ngày sản xuất (NSX), hạn sử dụng (HSD) và tồn theo lô.
                </Text>
              </div>

              <Switch
                checked={isManaged}
                onChange={(val) => setIsManaged(val)}
                checkedChildren="BẬT"
                unCheckedChildren="TẮT"
                style={{
                  backgroundColor: isManaged ? "var(--accent-primary, #4F46E5)" : undefined,
                }}
              />
            </div>
          </Card>

          <Divider style={{ margin: "16px 0" }} />

          {isManaged ? (
            <Alert
              type="info"
              showIcon
              icon={<InfoCircleOutlined />}
              message="Khi bật tính năng Quản lý theo lô"
              description={
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  <li>Nhân viên kho khi <b>Xuất kho</b> bắt buộc phải chỉ định mã lô xuất cụ thể.</li>
                  <li>Hệ thống tự động theo dõi số ngày còn hạn và <b>cảnh báo các lô sắp hết hạn</b>.</li>
                  <li>Các lô <b>đã quá hạn sử dụng</b> sẽ bị chặn xuất tự động, chỉ cho phép xuất khi có Quản lý kho phê duyệt ghi đè.</li>
                </ul>
              }
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="Chế độ Quản lý tồn kho thông thường"
              description="Sản phẩm chỉ theo dõi tổng số lượng tồn kho theo sản phẩm, không phân biệt số lô hoặc ngày hết hạn."
            />
          )}
        </div>
      )}
    </Modal>
  );
};

export default ProductBatchConfigModal;
