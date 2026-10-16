import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Table,
  Button,
  Tag,
  Space,
  Form,
  Input,
  Switch,
  message,
  Popconfirm,
  Typography,
  Alert,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
  EnvironmentOutlined,
  PhoneOutlined,
  UserOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  fetchDeliveryAddresses,
  createDeliveryAddress,
  updateDeliveryAddress,
  deleteDeliveryAddress,
  setDefaultDeliveryAddress,
  type DeliveryAddressItem,
  type CreateDeliveryAddressPayload,
} from "../services/apiClient";

const { Text } = Typography;

interface DeliveryAddressesModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number | null;
  customerName?: string;
  customerCode?: string;
}

export const DeliveryAddressesModal: React.FC<DeliveryAddressesModalProps> = ({
  isOpen,
  onClose,
  customerId,
  customerName,
  customerCode,
}) => {
  const [addresses, setAddresses] = useState<DeliveryAddressItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddressItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form] = Form.useForm();

  const loadAddresses = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchDeliveryAddresses(customerId);
      setAddresses(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tải danh sách điểm giao hàng.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    let ignore = false;
    if (isOpen && customerId) {
      fetchDeliveryAddresses(customerId)
        .then((data) => {
          if (!ignore) {
            setAddresses(data);
            setErrorMsg(null);
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            const msg = err instanceof Error ? err.message : "Không thể tải danh sách điểm giao hàng.";
            setErrorMsg(msg);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [isOpen, customerId]);

  const handleOpenAdd = () => {
    setEditingAddress(null);
    form.resetFields();
    form.setFieldsValue({
      is_default: addresses.length === 0, // Nếu chưa có điểm nào thì mặc định bật is_default
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (addr: DeliveryAddressItem) => {
    setEditingAddress(addr);
    form.resetFields();
    form.setFieldsValue({
      receiver_name: addr.receiver_name,
      phone: addr.phone,
      address: addr.address,
      note: addr.note || "",
      is_default: addr.is_default,
    });
    setIsFormModalOpen(true);
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (!customerId) return;

      setSubmitting(true);
      const payload: CreateDeliveryAddressPayload = {
        receiver_name: values.receiver_name.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        note: values.note ? values.note.trim() : undefined,
        is_default: !!values.is_default,
      };

      if (editingAddress) {
        await updateDeliveryAddress(customerId, editingAddress.id, payload);
        message.success("Cập nhật điểm giao hàng thành công!");
      } else {
        await createDeliveryAddress(customerId, payload);
        message.success("Thêm mới điểm giao hàng thành công!");
      }

      setIsFormModalOpen(false);
      form.resetFields();
      await loadAddresses();
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return; // Form validation failed
      const msg = err instanceof Error ? err.message : "Lưu thông tin điểm giao hàng thất bại.";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (addrId: number) => {
    if (!customerId) return;
    try {
      setLoading(true);
      await deleteDeliveryAddress(customerId, addrId);
      message.success("Đã xóa điểm giao hàng.");
      await loadAddresses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Xóa điểm giao hàng thất bại.";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (addrId: number) => {
    if (!customerId) return;
    try {
      setLoading(true);
      await setDefaultDeliveryAddress(customerId, addrId);
      message.success("Đã thiết lập làm điểm giao hàng mặc định.");
      await loadAddresses();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể đặt làm mặc định.";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<DeliveryAddressItem> = [
    {
      title: "NGƯỜI NHẬN & SĐT",
      key: "receiver",
      width: 220,
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <UserOutlined style={{ color: "#3b82f6" }} />
            <span>{r.receiver_name}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <PhoneOutlined />
            <span>{r.phone}</span>
          </div>
        </div>
      ),
    },
    {
      title: "ĐỊA CHỈ GIAO HÀNG",
      dataIndex: "address",
      key: "address",
      render: (addr: string, r) => (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
            <EnvironmentOutlined style={{ color: "#ef4444", marginTop: 3 }} />
            <span style={{ fontWeight: 500 }}>{addr}</span>
          </div>
          {r.note && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
              <Text type="secondary">Chỉ dẫn/ghi chú: </Text>
              {r.note}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "MẶC ĐỊNH",
      dataIndex: "is_default",
      key: "is_default",
      width: 130,
      align: "center",
      render: (isDef: boolean, r) =>
        isDef ? (
          <Tag color="success" icon={<StarFilled />} style={{ fontWeight: 600, padding: "2px 8px" }}>
            Mặc định
          </Tag>
        ) : (
          <Tooltip title="Đặt làm điểm giao hàng mặc định cho đại lý">
            <Button
              type="text"
              size="small"
              icon={<StarOutlined />}
              onClick={() => handleSetDefault(r.id)}
              style={{ color: "#64748b", fontSize: 12 }}
            >
              Chọn mặc định
            </Button>
          </Tooltip>
        ),
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 140,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Chỉnh sửa">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ color: "#2563eb" }} />}
              onClick={() => handleOpenEdit(r)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa điểm giao hàng"
            description="Bạn có chắc chắn muốn xóa điểm giao hàng này? Nếu là điểm mặc định, hệ thống sẽ tự động gán điểm còn lại làm mặc định."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Tooltip title="Xóa">
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <EnvironmentOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              Quản lý điểm giao hàng — {customerName || "Đại lý"} {customerCode ? `(${customerCode})` : ""}
            </span>
          </div>
        }
        open={isOpen}
        onCancel={onClose}
        width={920}
        footer={[
          <Button key="close" onClick={onClose}>
            Đóng
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {errorMsg && (
            <Alert
              type="error"
              message={errorMsg}
              showIcon
              closable
              onClose={() => setErrorMsg(null)}
            />
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 8,
            }}
          >
            <div>
              <Text type="secondary">
                Khai báo nhiều địa chỉ nhận hàng để giao đúng kho khách, tránh việc chuyển tiếp qua trụ sở chính.
              </Text>
            </div>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadAddresses} loading={loading}>
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenAdd}
                style={{ backgroundColor: "#2563eb" }}
              >
                Thêm điểm giao hàng
              </Button>
            </Space>
          </div>

          <Table
            columns={columns}
            dataSource={addresses}
            rowKey="id"
            loading={loading}
            pagination={false}
            bordered
            size="middle"
            locale={{
              emptyText: (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <EnvironmentOutlined style={{ fontSize: 32, color: "#94a3b8", marginBottom: 8 }} />
                  <div>Đại lý này chưa có điểm giao hàng nào được khai báo.</div>
                  <Button
                    type="link"
                    icon={<PlusOutlined />}
                    onClick={handleOpenAdd}
                    style={{ marginTop: 8 }}
                  >
                    Thêm điểm giao đầu tiên ngay
                  </Button>
                </div>
              ),
            }}
          />
        </div>
      </Modal>

      {/* Modal Form Thêm / Sửa điểm giao hàng */}
      <Modal
        title={editingAddress ? "Chỉnh sửa điểm giao hàng" : "Thêm điểm giao hàng mới"}
        open={isFormModalOpen}
        onCancel={() => setIsFormModalOpen(false)}
        onOk={handleSubmitForm}
        confirmLoading={submitting}
        okText={editingAddress ? "Lưu thay đổi" : "Thêm mới"}
        cancelText="Hủy"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="receiver_name"
            label="Tên người nhận hàng"
            rules={[
              { required: true, message: "Vui lòng nhập tên người nhận hàng" },
              { max: 150, message: "Tên người nhận không vượt quá 150 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: Anh Nguyễn Văn Tuấn (Kho A)" prefix={<UserOutlined />} />
          </Form.Item>

          <Form.Item
            name="phone"
            label="Số điện thoại nhận hàng"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại" },
              {
                pattern: /^0[1235789]\d{8}$/,
                message: "Số điện thoại không hợp lệ (yêu cầu 10 chữ số, bắt đầu bằng 0)",
              },
            ]}
          >
            <Input placeholder="Ví dụ: 0912345678" prefix={<PhoneOutlined />} />
          </Form.Item>

          <Form.Item
            name="address"
            label="Địa chỉ giao hàng (Kho / Chi nhánh)"
            rules={[{ required: true, message: "Vui lòng nhập địa chỉ giao hàng" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Ví dụ: Lô B4 KCN Quang Minh, Mê Linh, Hà Nội"
            />
          </Form.Item>

          <Form.Item
            name="note"
            label="Ghi chú đường đi / chỉ dẫn giao hàng"
          >
            <Input.TextArea
              rows={2}
              placeholder="Ví dụ: Xe tải vào cổng số 2, giao giờ hành chính, gọi trước 30 phút..."
            />
          </Form.Item>

          <Form.Item
            name="is_default"
            label="Đặt làm điểm giao hàng mặc định"
            valuePropName="checked"
          >
            <Switch checkedChildren="Mặc định" unCheckedChildren="Phụ" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default DeliveryAddressesModal;
