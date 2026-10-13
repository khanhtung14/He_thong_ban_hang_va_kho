import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Row,
  Col,
  Button,
  Space,
  Typography,
  message,
  Divider,
} from "antd";
import {
  ShopOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  EnvironmentOutlined,
  UserOutlined,
  DollarOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import {
  createCustomer,
  fetchSalesReps,
  fetchTerritories,
  type CustomerItem,
  type SalesRepUser,
  type TerritoryItem,
  type CreateCustomerPayload,
} from "../../services/apiClient";

const { Text } = Typography;
const { TextArea } = Input;

export interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (customer: CustomerItem) => void;
}

export const CreateCustomerModal: React.FC<CreateCustomerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRepUser[]>([]);
  const [territories, setTerritories] = useState<TerritoryItem[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadOptions();
      form.resetFields();
      form.setFieldsValue({
        customerGroup: "DEALER_LEVEL_1",
        creditLimit: 50000000,
        maxDueDays: 30,
        warningThresholdPercent: 80,
      });
    }
  }, [isOpen]);

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [repsData, terrsData] = await Promise.all([
        fetchSalesReps().catch(() => []),
        fetchTerritories().catch(() => []),
      ]);
      setSalesReps(repsData);
      setTerritories(terrsData);
      if (terrsData.length > 0 && !form.getFieldValue("territoryId")) {
        form.setFieldsValue({ territoryId: terrsData[0].id });
      }
    } catch {
      // ignore
    } finally {
      setLoadingOptions(false);
    }
  };

  const handleGenerateCode = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const terrVal = form.getFieldValue("territoryId");
    let prefix = "DL";
    if (terrVal) {
      const terr = territories.find((t) => t.id === terrVal);
      if (terr && terr.code) {
        prefix = `DL-${terr.code.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase()}`;
      }
    }
    form.setFieldsValue({
      code: `${prefix}-${randomSuffix}`,
    });
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const payload: CreateCustomerPayload = {
        code: values.code.trim().toUpperCase(),
        name: values.name.trim(),
        customerGroup: values.customerGroup,
        territoryId: values.territoryId || null,
        salesRepId: values.salesRepId || null,
        creditLimit: values.creditLimit || 0,
        maxDueDays: values.maxDueDays || 0,
        warningThresholdPercent: values.warningThresholdPercent || 80,
        phone: values.phone ? values.phone.trim() : undefined,
        taxCode: values.taxCode ? values.taxCode.trim() : undefined,
        address: values.address ? values.address.trim() : undefined,
      };

      const newCustomer = await createCustomer(payload);
      message.success(`Đã thêm đại lý "${newCustomer.name}" (${newCustomer.code}) thành công!`);
      onSuccess(newCustomer);
      onClose();
    } catch (err: any) {
      message.error(err.message || "Không thể tạo đại lý mới. Vui lòng kiểm tra lại thông tin.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 18,
            }}
          >
            <ShopOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
              Thêm Đại Lý Mới
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Khởi tạo hồ sơ đại lý, phân công địa bàn và nhân viên phụ trách
            </Text>
          </div>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      width={760}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={submitting}>
          Hủy bỏ
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<PlusOutlined />}
          loading={submitting}
          onClick={handleSubmit}
          style={{ backgroundColor: "#2563eb", fontWeight: 600 }}
        >
          Tạo đại lý
        </Button>,
      ]}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* Nhóm thông tin cơ bản */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
          1. THÔNG TIN ĐẠI LÝ CHÍNH
        </div>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="code"
              label={
                <Space>
                  <span>Mã đại lý</span>
                  <Button
                    type="link"
                    size="small"
                    icon={<ThunderboltOutlined />}
                    onClick={handleGenerateCode}
                    style={{ padding: 0, height: "auto", fontSize: 12 }}
                  >
                    Gợi ý mã
                  </Button>
                </Space>
              }
              rules={[
                { required: true, message: "Vui lòng nhập mã đại lý" },
                { max: 40, message: "Mã đại lý tối đa 40 ký tự" },
              ]}
            >
              <Input
                placeholder="VD: DL-HN-001"
                style={{ textTransform: "uppercase" }}
                onChange={(e) => {
                  form.setFieldsValue({ code: e.target.value.toUpperCase() });
                }}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="name"
              label="Tên đại lý / Khách sỉ"
              rules={[
                { required: true, message: "Vui lòng nhập tên đại lý" },
                { max: 150, message: "Tên đại lý tối đa 150 ký tự" },
              ]}
            >
              <Input placeholder="VD: Đại lý Bách Hóa Cầu Giấy" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="customerGroup"
              label="Cấp đại lý / Bảng giá áp dụng"
              rules={[{ required: true, message: "Vui lòng chọn cấp đại lý" }]}
            >
              <Select
                options={[
                  { label: "Đại lý Cấp 1 (Chiết khấu sỉ mức 1)", value: "DEALER_LEVEL_1" },
                  { label: "Đại lý Cấp 2 (Chiết khấu sỉ mức 2)", value: "DEALER_LEVEL_2" },
                  { label: "Đại lý Bán lẻ (Khách lẻ / sỉ phổ thông)", value: "RETAIL" },
                ]}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item name="territoryId" label="Khu vực / Địa bàn phụ trách">
              <Select
                placeholder="Chọn khu vực địa bàn"
                allowClear
                loading={loadingOptions}
                options={territories.map((t) => ({
                  label: (
                    <Space>
                      <EnvironmentOutlined style={{ color: "#16a34a" }} />
                      <span>{t.name} ({t.code})</span>
                    </Space>
                  ),
                  value: t.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="salesRepId"
              label="Nhân viên kinh doanh phụ trách chính"
              tooltip="Tùy chọn: Có thể gán nhân viên kinh doanh ngay hoặc để trống để phân công sau"
            >
              <Select
                placeholder="-- Chưa phân công (có thể phân công sau) --"
                allowClear
                loading={loadingOptions}
                notFoundContent="Không có nhân viên kinh doanh nào"
                options={salesReps.map((r) => ({
                  label: (
                    <Space>
                      <UserOutlined style={{ color: "#2563eb" }} />
                      <span>{r.full_name || r.username} (@{r.username})</span>
                    </Space>
                  ),
                  value: r.id,
                }))}
              />
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              name="taxCode"
              label="Mã số thuế"
            >
              <Input placeholder="VD: 0101234567" />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0 16px 0" }} />

        {/* Nhóm hạn mức công nợ */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
          2. HẠN MỨC CÔNG NỢ &amp; ĐIỀU KHOẢN TÍN DỤNG
        </div>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="creditLimit"
              label={
                <Space>
                  <DollarOutlined style={{ color: "#eab308" }} />
                  <span>Hạn mức nợ (VNĐ)</span>
                </Space>
              }
              rules={[{ required: true, message: "Nhập hạn mức công nợ" }]}
            >
              <InputNumber
                style={{ width: "100%" }}
                min={0}
                step={5000000}
                formatter={(val) => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(val) => (val ? Number(val.replace(/\$\s?|(,*)/g, "")) : 0) as any}
              />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              name="maxDueDays"
              label="Hạn nợ tối đa (ngày)"
              rules={[{ required: true, message: "Nhập số ngày nợ tối đa" }]}
            >
              <InputNumber style={{ width: "100%" }} min={0} max={365} />
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item
              name="warningThresholdPercent"
              label="Ngưỡng cảnh báo (%)"
              rules={[{ required: true, message: "Nhập % ngưỡng cảnh báo" }]}
            >
              <InputNumber style={{ width: "100%" }} min={1} max={100} />
            </Form.Item>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0 16px 0" }} />

        {/* Nhóm thông tin liên hệ và giao hàng */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 12 }}>
          3. THÔNG TIN LIÊN HỆ &amp; GIAO HÀNG
        </div>

        <Row gutter={16}>
          <Col span={10}>
            <Form.Item
              name="phone"
              label={
                <Space>
                  <PhoneOutlined />
                  <span>Số điện thoại liên hệ</span>
                </Space>
              }
              rules={[
                { required: true, message: "Vui lòng nhập số điện thoại đại lý!" },
                {
                  pattern: /^0[1235789][0-9]{8}$/,
                  message: "Số điện thoại gồm 10 chữ số với đầu số Việt Nam (03, 05, 07, 08, 09, 01, 02)!",
                },
              ]}
            >
              <Input placeholder="VD: 0901234567" maxLength={10} />
            </Form.Item>
          </Col>

          <Col span={14}>
            <Form.Item
              name="address"
              label="Địa chỉ kinh doanh / Điểm giao hàng mặc định"
            >
              <TextArea rows={2} placeholder="VD: 123 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default CreateCustomerModal;
