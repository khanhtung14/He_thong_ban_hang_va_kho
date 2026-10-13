import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Space,
  Alert,
  Typography,
  Card,
  message,
  Spin,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  LockOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  createPriceList,
  getProducts,
  type Product,
} from "../../services/apiClient";

const { Text } = Typography;
const { RangePicker } = DatePicker;

// Hàm tạo mã bảng giá tự động theo ngày hiện tại và 4 số ngẫu nhiên
const generatePriceListCode = () => {
  const dateStr = dayjs().format("YYYYMMDD");
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `PL-${dateStr}-${randomSuffix}`;
};

export interface CreatePriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newPriceList: any) => void;
}

export const CreatePriceListModal: React.FC<CreatePriceListModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Tự động sinh mã bảng giá & tải danh mục sản phẩm khi mở modal
  useEffect(() => {
    if (isOpen) {
      form.setFieldsValue({
        code: generatePriceListCode(),
        customer_group: "DEALER_LEVEL_1",
        items: [
          { sku: undefined, sale_price: undefined, floor_price: undefined },
        ],
      });

      setLoadingProducts(true);
      getProducts()
        .then((data) => {
          setProducts(Array.isArray(data) ? data : []);
        })
        .catch((err) => {
          message.error("Lỗi khi tải danh mục sản phẩm: " + err.message);
        })
        .finally(() => setLoadingProducts(false));
    } else {
      form.resetFields();
    }
  }, [isOpen, form]);

  const handleFinish = async (values: any) => {
    setErrorMsg("");
    setSubmitting(true);

    const [startDate, endDate] = values.validityRange || [];

    const payload = {
      code: values.code ? values.code.trim().toUpperCase() : "",
      customer_group: values.customer_group,
      start_date: startDate ? dayjs(startDate).format("YYYY-MM-DD") : null,
      end_date: endDate ? dayjs(endDate).format("YYYY-MM-DD") : null,
      items: (values.items || []).map((item: any) => ({
        sku: item.sku,
        sale_price: Number(item.sale_price || 0),
        floor_price: Number(item.floor_price || 0),
      })),
    };

    try {
      const created = await createPriceList(payload as any);
      message.success("Khai báo bảng giá mới thành công!");
      onCreated(created);
      form.resetFields();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Lỗi kết nối khi gửi yêu cầu.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setErrorMsg("");
    onClose();
  };

  const productOptions = products.map((p) => ({
    value: p.sku,
    label: `${p.sku} - ${p.name}`,
  }));

  return (
    <Modal
      open={isOpen}
      onCancel={handleCancel}
      title={
        <Space align="center" style={{ marginBottom: 4 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "#e6f4ff",
              color: "#1677ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            <FileProtectOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f1f1f" }}>
              Khai báo bảng giá mới (S2-10)
            </div>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              Áp dụng theo nhóm khách hàng & khoảng thời gian hiệu lực
            </Text>
          </div>
        </Space>
      }
      footer={null}
      width={720}
      destroyOnClose
      style={{ top: 28 }}
    >
      {errorMsg && (
        <Alert
          message={errorMsg}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setErrorMsg("")}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          code: generatePriceListCode(), // Tự gán mã ngay từ lúc Form khởi tạo
          customer_group: "DEALER_LEVEL_1",
          items: [
            { sku: undefined, sale_price: undefined, floor_price: undefined },
          ],
        }}
        style={{ marginTop: 16 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 16px",
          }}
        >
          {/* Ô Mã bảng giá tự động sinh, chỉ đọc (readOnly) */}
          <Form.Item
            name="code"
            label="Mã bảng giá (Tự động)"
            rules={[{ required: true, message: "Mã bảng giá là bắt buộc!" }]}
          >
            <Input
              readOnly
              prefix={<LockOutlined style={{ color: "#8c8c8c" }} />}
              style={{
                backgroundColor: "#f5f5f5",
                cursor: "not-allowed",
                fontWeight: 600,
                color: "#1677ff",
              }}
            />
          </Form.Item>

          <Form.Item
            name="customer_group"
            label="Nhóm khách hàng áp dụng"
            rules={[
              { required: true, message: "Vui lòng chọn nhóm khách hàng!" },
            ]}
          >
            <Select
              options={[
                { value: "DEALER_LEVEL_1", label: "Đại lý Cấp 1" },
                { value: "DEALER_LEVEL_2", label: "Đại lý Cấp 2" },
                { value: "RETAIL", label: "Khách lẻ" },
              ]}
            />
          </Form.Item>
        </div>

        <Form.Item
          name="validityRange"
          label="Thời gian hiệu lực (Từ ngày - Đến ngày)"
          rules={[
            { required: true, message: "Vui lòng chọn thời gian hiệu lực!" },
          ]}
        >
          <RangePicker
            style={{ width: "100%" }}
            format="DD/MM/YYYY"
            placeholder={["Ngày bắt đầu", "Ngày kết thúc"]}
          />
        </Form.Item>

        <div
          style={{
            marginTop: 8,
            marginBottom: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            strong
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              color: "#595959",
            }}
          >
            Dòng giá sản phẩm (Lấy từ CSDL)
          </Text>
          {loadingProducts && <Spin size="small" />}
        </div>

        <Form.List name="items">
          {(fields, { add, remove }) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fields.map(({ key, name, ...restField }, index) => (
                <Card
                  key={key}
                  size="small"
                  style={{
                    backgroundColor: "#fafafa",
                    borderRadius: 8,
                    borderColor: "#f0f0f0",
                  }}
                  styles={{ body: { padding: "12px 16px" } }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr 1fr 36px",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "sku"]}
                      label={index === 0 ? "Chọn sản phẩm" : ""}
                      rules={[{ required: true, message: "Chọn sản phẩm!" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        showSearch
                        placeholder="Chọn hoặc tìm SKU..."
                        optionFilterProp="label"
                        loading={loadingProducts}
                        options={productOptions}
                      />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, "sale_price"]}
                      label={index === 0 ? "Giá bán (₫)" : ""}
                      rules={[{ required: true, message: "Nhập giá bán!" }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: "100%" }}
                        placeholder="0"
                        min={0}
                        formatter={(val: any) =>
                          `${val || ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                        }
                        parser={(val: any) =>
                          val ? Number(val.replace(/\$\s?|(,*)/g, "")) : 0
                        }
                      />
                    </Form.Item>

                    <Form.Item
                      {...restField}
                      name={[name, "floor_price"]}
                      label={index === 0 ? "Giá sàn (₫)" : ""}
                      rules={[
                        { required: true, message: "Nhập giá sàn!" },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const salePrice = getFieldValue([
                              "items",
                              name,
                              "sale_price",
                            ]);
                            if (value && salePrice && value > salePrice) {
                              return Promise.reject(
                                new Error("Giá sàn không thể lớn hơn giá bán!"),
                              );
                            }
                            return Promise.resolve();
                          },
                        }),
                      ]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: "100%" }}
                        placeholder="0"
                        min={0}
                        formatter={(val: any) =>
                          `${val || ""}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                        }
                        parser={(val: any) =>
                          val ? Number(val.replace(/\$\s?|(,*)/g, "")) : 0
                        }
                      />
                    </Form.Item>

                    <div style={{ paddingTop: index === 0 ? 28 : 2 }}>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={fields.length <= 1}
                        onClick={() => remove(name)}
                      />
                    </div>
                  </div>
                </Card>
              ))}

              <Button
                type="dashed"
                onClick={() => add()}
                block
                icon={<PlusOutlined />}
                style={{ marginTop: 4, borderRadius: 8 }}
              >
                Thêm dòng sản phẩm
              </Button>
            </div>
          )}
        </Form.List>

        <Text
          type="secondary"
          italic
          style={{ fontSize: 11, display: "block", marginTop: 8 }}
        >
          * Quy tắc nghiệp vụ: Nhân viên kinh doanh bán dưới giá sàn sẽ bắt buộc
          gửi đơn qua Quản lý kinh doanh duyệt.
        </Text>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 24,
            paddingTop: 16,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <Button onClick={handleCancel} disabled={submitting}>
            Hủy bỏ
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            Lưu bảng giá
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CreatePriceListModal;
