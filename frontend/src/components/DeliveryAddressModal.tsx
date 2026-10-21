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
  Tooltip,
  Card,
  Row,
  Col,
  Empty,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  CheckCircleFilled,
  EnvironmentOutlined,
  PhoneOutlined,
  UserOutlined,
  ReloadOutlined,
  CompassOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../services/sessionService";

const { Text, Title } = Typography;
const { TextArea } = Input;

export interface DeliveryAddressItem {
  id: number;
  customer_id?: number;
  receiver_name?: string;
  receiverName?: string;
  phone: string;
  address: string;
  is_default?: boolean;
  isDefault?: boolean;
  note?: string | null;
}

export interface DeliveryAddressCustomer {
  id: number | string;
  name: string;
  code?: string;
}

export interface DeliveryAddressModalProps {
  visible: boolean;
  customer: DeliveryAddressCustomer | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export const DeliveryAddressModal: React.FC<DeliveryAddressModalProps> = ({
  visible,
  customer,
  onClose,
  onSuccess,
}) => {
  const [addresses, setAddresses] = useState<DeliveryAddressItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [formVisible, setFormVisible] = useState<boolean>(false);
  const [editingAddress, setEditingAddress] = useState<DeliveryAddressItem | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [form] = Form.useForm();

  // Load danh sách điểm giao hàng từ backend
  const loadAddresses = useCallback(async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${customer.id}/delivery-addresses`
      );
      if (res.ok) {
        const data = await res.json();
        setAddresses(Array.isArray(data) ? data : []);
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.detail || "Không thể tải danh sách điểm giao hàng.");
        setAddresses([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi kết nối khi tải điểm giao hàng.";
      message.error(msg);
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    if (visible && customer?.id) {
      loadAddresses();
      setFormVisible(false);
      setEditingAddress(null);
    } else {
      setAddresses([]);
      setFormVisible(false);
      setEditingAddress(null);
    }
  }, [visible, customer?.id, loadAddresses]);

  // Mở form thêm mới điểm giao
  const handleOpenAdd = () => {
    setEditingAddress(null);
    form.resetFields();
    form.setFieldsValue({
      isDefault: addresses.length === 0, // Nếu chưa có điểm nào thì mặc định bật isDefault
      note: "",
    });
    setFormVisible(true);
  };

  // Mở form chỉnh sửa điểm giao
  const handleOpenEdit = (record: DeliveryAddressItem) => {
    setEditingAddress(record);
    form.resetFields();
    form.setFieldsValue({
      receiverName: record.receiverName || record.receiver_name || "",
      phone: record.phone || "",
      address: record.address || "",
      note: record.note || "",
      isDefault: Boolean(record.isDefault ?? record.is_default),
    });
    setFormVisible(true);
  };

  // Đóng form nhập
  const handleCloseForm = () => {
    setFormVisible(false);
    setEditingAddress(null);
    form.resetFields();
  };

  // Lưu form (Thêm mới hoặc Cập nhật)
  const handleSubmitForm = async () => {
    if (!customer?.id) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload = {
        receiverName: values.receiverName.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        note: values.note ? values.note.trim() : null,
        isDefault: Boolean(values.isDefault),
      };

      let res: Response;
      if (editingAddress) {
        res = await authenticatedFetch(
          `/api/v1/customers/${customer.id}/delivery-addresses/${editingAddress.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
      } else {
        res = await authenticatedFetch(
          `/api/v1/customers/${customer.id}/delivery-addresses`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
      }

      if (res.ok) {
        message.success(
          editingAddress
            ? "Cập nhật điểm giao hàng thành công!"
            : "Thêm mới điểm giao hàng thành công!"
        );
        handleCloseForm();
        await loadAddresses();
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.detail || "Không thể lưu điểm giao hàng.");
      }
    } catch (err: unknown) {
      if ((err as { errorFields?: unknown })?.errorFields) return;
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra.";
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Xóa điểm giao hàng
  const handleDelete = async (addressId: number) => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${customer.id}/delivery-addresses/${addressId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        message.success("Đã xóa điểm giao hàng thành công.");
        await loadAddresses();
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.detail || "Không thể xóa điểm giao hàng.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi khi xóa điểm giao.";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Đặt làm điểm mặc định
  const handleSetDefault = async (addressId: number) => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(
        `/api/v1/customers/${customer.id}/delivery-addresses/${addressId}/default`,
        { method: "PATCH" }
      );
      if (res.ok) {
        message.success("Đã thiết lập làm điểm giao hàng mặc định!");
        await loadAddresses();
        if (onSuccess) onSuccess();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.detail || "Không thể đặt làm mặc định.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi kết nối.";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Cột hiển thị dữ liệu bảng
  const columns: ColumnsType<DeliveryAddressItem> = [
    {
      title: "NGƯỜI NHẬN & SĐT",
      key: "receiver",
      width: 220,
      render: (_, r) => {
        const name = r.receiverName || r.receiver_name || "---";
        return (
          <div>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <UserOutlined style={{ color: "#2563eb" }} />
              <span>{name}</span>
            </div>
            {r.phone && (
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                <PhoneOutlined style={{ color: "#16a34a" }} />
                <a href={`tel:${r.phone}`} style={{ color: "#16a34a", textDecoration: "none", fontWeight: 500 }}>
                  {r.phone}
                </a>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "ĐỊA CHỈ & CHỈ DẪN ĐƯỜNG ĐI",
      key: "address",
      minWidth: 260,
      render: (_, r) => (
        <div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, lineHeight: 1.4 }}>
            <EnvironmentOutlined style={{ color: "#ef4444", marginTop: 3 }} />
            <Text strong style={{ color: "#1e293b" }}>{r.address}</Text>
          </div>
          {r.note && (
            <div
              style={{
                marginTop: 6,
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 12,
                color: "#475569",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <CompassOutlined style={{ color: "#64748b" }} />
              <span><strong>Ghi chú:</strong> {r.note}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "TRẠNG THÁI MẶC ĐỊNH",
      key: "is_default",
      width: 170,
      align: "center",
      render: (_, r) => {
        const isDefault = Boolean(r.isDefault ?? r.is_default);
        if (isDefault) {
          return (
            <Tag
              color="success"
              icon={<CheckCircleFilled />}
              style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6 }}
            >
              Điểm mặc định
            </Tag>
          );
        }
        return (
          <Tooltip title="Nhấp để đặt làm điểm giao mặc định khi tạo đơn hàng">
            <Button
              size="small"
              icon={<StarOutlined style={{ color: "#f59e0b" }} />}
              onClick={() => handleSetDefault(r.id)}
              style={{ borderRadius: 6 }}
            >
              Đặt mặc định
            </Button>
          </Tooltip>
        );
      },
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 150,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Chỉnh sửa điểm giao hàng">
            <Button
              size="small"
              icon={<EditOutlined style={{ color: "#2563eb" }} />}
              onClick={() => handleOpenEdit(r)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa điểm giao hàng này?"
            description="Nếu xóa điểm mặc định, hệ thống sẽ tự động chỉ định điểm khác làm mặc định."
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(r.id)}
          >
            <Tooltip title="Xóa điểm giao">
              <Button
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
        open={visible}
        onCancel={onClose}
        footer={[
          <Button key="close" type="primary" onClick={onClose}>
            Đóng
          </Button>,
        ]}
        width={850}
        centered
        destroyOnClose
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#2563eb",
                fontSize: 18,
              }}
            >
              <EnvironmentOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Quản Lý Điểm Giao Hàng
              </div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                Khai báo và cấu hình các kho nhận hàng cho Đại lý (SCRUM-20)
              </div>
            </div>
          </div>
        }
      >
        {/* Banner thông tin đại lý & nút thêm mới */}
        <Card
          size="small"
          bordered={false}
          style={{
            background: "linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)",
            borderRadius: 10,
            marginBottom: 16,
            border: "1px solid #bae6fd",
          }}
        >
          <Row justify="space-between" align="middle" gutter={[16, 12]}>
            <Col xs={24} sm={15}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 2 }}>
                Đại lý / Khách hàng:
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Text strong style={{ fontSize: 16, color: "#0369a1" }}>
                  {customer?.name || "---"}
                </Text>
                {customer?.code && (
                  <Tag color="blue" style={{ fontWeight: 700, borderRadius: 4, margin: 0 }}>
                    {customer.code}
                  </Tag>
                )}
                <Tag color="cyan" style={{ borderRadius: 4, margin: 0 }}>
                  {addresses.length} điểm giao
                </Tag>
              </div>
            </Col>
            <Col xs={24} sm={9} style={{ textAlign: "right" }}>
              <Space>
                <Tooltip title="Tải lại danh sách">
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={loadAddresses}
                    loading={loading}
                    style={{ borderRadius: 6 }}
                  />
                </Tooltip>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenAdd}
                  style={{
                    borderRadius: 6,
                    backgroundColor: "#0284c7",
                    borderColor: "#0284c7",
                  }}
                >
                  Thêm điểm giao mới
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Bảng danh sách điểm giao */}
        <Table
          columns={columns}
          dataSource={addresses}
          rowKey="id"
          size="middle"
          loading={loading}
          pagination={addresses.length > 5 ? { pageSize: 5, size: "small" } : false}
          scroll={{ x: 800 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Đại lý này chưa có điểm giao hàng nào. Vui lòng bấm 'Thêm điểm giao mới' ở trên để khai báo!"
                style={{ margin: "20px 0" }}
              />
            ),
          }}
        />
      </Modal>

      {/* Sub-Modal / Modal Thêm mới hoặc Chỉnh sửa điểm giao */}
      <Modal
        open={formVisible}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editingAddress ? (
              <EditOutlined style={{ color: "#2563eb" }} />
            ) : (
              <PlusOutlined style={{ color: "#16a34a" }} />
            )}
            <span style={{ fontWeight: 600 }}>
              {editingAddress ? "Chỉnh Sửa Điểm Giao Hàng" : "Thêm Mới Điểm Giao Hàng"}
            </span>
          </div>
        }
        onCancel={handleCloseForm}
        onOk={handleSubmitForm}
        confirmLoading={submitting}
        okText={editingAddress ? "Lưu thay đổi" : "Tạo điểm giao"}
        cancelText="Hủy"
        width={560}
        centered
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional" style={{ marginTop: 12 }}>
          <Form.Item
            label={
              <span style={{ fontWeight: 600 }}>
                Người nhận hàng <span style={{ color: "#ef4444" }}>*</span>
              </span>
            }
            name="receiverName"
            rules={[
              { required: true, message: "Vui lòng nhập tên người nhận hàng!" },
              { max: 150, message: "Tên người nhận không được quá 150 ký tự!" },
            ]}
          >
            <Input
              prefix={<UserOutlined style={{ color: "#94a3b8" }} />}
              placeholder="VD: Anh Nam (Thủ kho), Chị Hằng..."
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontWeight: 600 }}>
                Số điện thoại liên hệ <span style={{ color: "#ef4444" }}>*</span>
              </span>
            }
            name="phone"
            rules={[
              { required: true, message: "Vui lòng nhập số điện thoại người nhận!" },
              {
                pattern: /^0[1235789]\d{8,9}$/,
                message: "Số điện thoại gồm 10-11 chữ số với đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02)!",
              },
            ]}
          >
            <Input
              prefix={<PhoneOutlined style={{ color: "#94a3b8" }} />}
              placeholder="VD: 0987654321 hoặc 02412345678"
            />
          </Form.Item>

          <Form.Item
            label={
              <span style={{ fontWeight: 600 }}>
                Địa chỉ giao hàng / Kho nhận <span style={{ color: "#ef4444" }}>*</span>
              </span>
            }
            name="address"
            rules={[{ required: true, message: "Vui lòng nhập địa chỉ nhận hàng chi tiết!" }]}
          >
            <Input
              prefix={<EnvironmentOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố..."
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ fontWeight: 600 }}>Ghi chú đường đi / Thời gian giao</span>}
            name="note"
          >
            <TextArea
              rows={3}
              placeholder="VD: Xe tải dưới 2.5 tấn, giao trong giờ hành chính, gọi trước khi đến 30 phút..."
              maxLength={300}
              showCount
            />
          </Form.Item>

          <Form.Item
            label={<span style={{ fontWeight: 600 }}>Đặt làm điểm giao hàng mặc định</span>}
            name="isDefault"
            valuePropName="checked"
          >
            <Switch checkedChildren="Mặc định" unCheckedChildren="Phụ" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default DeliveryAddressModal;
