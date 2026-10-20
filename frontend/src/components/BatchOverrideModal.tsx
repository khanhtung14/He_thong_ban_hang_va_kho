import React, { useState } from "react";
import {
  Modal,
  Input,
  Button,
  Typography,
  Space,
  Alert,
  Checkbox,
  Descriptions,
  Tag,
  Divider,
} from "antd";
import {
  StopOutlined,
  WarningFilled,
  SafetyCertificateOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

export interface BatchOverrideModalProps {
  open: boolean;
  batchInfo: {
    batchId: number;
    batchNumber: string;
    productName: string;
    productSku?: string;
    expDate: string;
    quantity: number;
    daysOverdue?: number;
  } | null;
  onClose: () => void;
  onConfirmOverride: (reason: string) => Promise<void> | void;
  submitting?: boolean;
}

export const BatchOverrideModal: React.FC<BatchOverrideModalProps> = ({
  open,
  batchInfo,
  onClose,
  onConfirmOverride,
  submitting = false,
}) => {
  const [reason, setReason] = useState<string>("");
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    setErrorMsg(null);
    if (!reason || !reason.trim()) {
      setErrorMsg("Bắt buộc phải nhập 'Lý do ghi đè' để tiếp tục.");
      return;
    }
    if (!confirmed) {
      setErrorMsg("Vui lòng tích vào ô xác nhận cam kết trách nhiệm quản lý.");
      return;
    }
    await onConfirmOverride(reason.trim());
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={620}
      title={
        <Space align="center">
          <StopOutlined style={{ color: "#dc2626", fontSize: 22 }} />
          <span style={{ color: "#dc2626", fontWeight: 700 }}>
            Cảnh Báo: Lô Hàng Đã Quá Hạn Sử Dụng!
          </span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Hủy bỏ (Không xuất)
        </Button>,
        <Button
          key="override"
          type="primary"
          danger
          icon={<SafetyCertificateOutlined />}
          loading={submitting}
          disabled={!reason.trim() || !confirmed}
          onClick={handleSubmit}
        >
          Xác Nhận Ghi Đè (Cho Phép Xuất)
        </Button>,
      ]}
      destroyOnClose
    >
      {batchInfo && (
        <div style={{ marginTop: 8 }}>
          <Alert
            type="error"
            showIcon
            icon={<WarningFilled style={{ fontSize: 24, color: "#dc2626" }} />}
            message={
              <Text strong style={{ fontSize: 15, color: "#991b1b" }}>
                Yêu cầu quyền Quản lý kho để phê duyệt ngoại lệ (Override)
              </Text>
            }
            description={
              <Paragraph style={{ margin: 0, fontSize: 13, color: "#7f1d1d" }}>
                Hệ thống tự động <b>chặn xuất kho</b> đối với các sản phẩm đã quá hạn dùng
                để bảo vệ an toàn chất lượng. Chỉ cấp Quản lý kho mới có thẩm quyền ghi đè
                kèm giải trình lý do lưu vào sổ kiểm toán.
              </Paragraph>
            }
            style={{ marginBottom: 16, borderRadius: 8, background: "#fef2f2", borderColor: "#fecaca" }}
          />

          <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Sản phẩm">
              <Text strong>{batchInfo.productName}</Text>{" "}
              {batchInfo.productSku && <Tag color="blue">{batchInfo.productSku}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="Số lô (Batch No)">
              <Tag color="purple" style={{ fontWeight: 700, fontSize: 13 }}>
                {batchInfo.batchNumber}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Hạn sử dụng">
              <Text type="danger" strong>
                {batchInfo.expDate}{" "}
                {batchInfo.daysOverdue !== undefined && (
                  <span>(Đã quá hạn {batchInfo.daysOverdue} ngày)</span>
                )}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Số lượng yêu cầu xuất">
              <Text strong style={{ fontSize: 14 }}>
                {batchInfo.quantity.toLocaleString("vi-VN")}
              </Text>
            </Descriptions.Item>
          </Descriptions>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <Text strong style={{ color: "#0f172a" }}>
                Lý do ghi đè xuất kho * <Text type="danger">(Bắt buộc)</Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Lý do sẽ được ghi cố định vào Nhật ký kiểm toán kho
              </Text>
            </div>
            <TextArea
              rows={3}
              placeholder="Ví dụ: Xuất hàng để tiêu hủy / thanh lý theo biên bản số BB-TH-2026/10, hàng dùng cho mục đích kiểm nghiệm nội bộ..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setErrorMsg(null);
              }}
              status={!reason.trim() ? "warning" : ""}
            />
          </div>

          <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: 8, marginBottom: 12 }}>
            <Checkbox
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                setErrorMsg(null);
              }}
            >
              <Text style={{ fontSize: 13 }}>
                Tôi xác nhận đã kiểm tra và chịu trách nhiệm với tư cách <b>Quản lý kho</b> cho quyết định xuất lô hàng này.
              </Text>
            </Checkbox>
          </div>

          {errorMsg && (
            <Alert
              type="warning"
              showIcon
              message={errorMsg}
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      )}
    </Modal>
  );
};

export default BatchOverrideModal;
