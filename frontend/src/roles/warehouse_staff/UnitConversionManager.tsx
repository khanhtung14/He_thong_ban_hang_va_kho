import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  Typography,
  Divider,
  Alert,
  message,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  SettingOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../session";

const { Text } = Typography;
const { Option } = Select;

// Kiểu dữ liệu đơn vị quy đổi
export interface UnitConversion {
  id: string;
  unitName: string; // Tên đơn vị (Lốc, Thùng, Két, Gói, Hộp...)
  conversionRate: number; // Tỉ lệ so với đơn vị cơ sở
  barcode?: string;
  isBaseUnit?: boolean;
}

// Kiểu dữ liệu sản phẩm SKU
export interface ProductItem {
  sku: string;
  name: string;
  category?: string;
  baseUnit: string; // Đơn vị cơ sở nhỏ nhất
  conversions: UnitConversion[];
}

// Dữ liệu mẫu ban đầu (Nếu chưa có API chi tiết về unit conversion)
const INITIAL_PRODUCTS: ProductItem[] = [
  {
    sku: "SKU-BEV-001",
    name: "Nước ngọt Coca-Cola 320ml",
    category: "Đồ uống",
    baseUnit: "Lon",
    conversions: [
      {
        id: "1",
        unitName: "Lon",
        conversionRate: 1,
        barcode: "893000000001",
        isBaseUnit: true,
      },
      {
        id: "2",
        unitName: "Lốc (6 lon)",
        conversionRate: 6,
        barcode: "893000000006",
        isBaseUnit: false,
      },
      {
        id: "3",
        unitName: "Thùng (24 lon)",
        conversionRate: 24,
        barcode: "893000000024",
        isBaseUnit: false,
      },
    ],
  },
  {
    sku: "SKU-BEV-002",
    name: "Nước tăng lực Redbull 250ml",
    category: "Đồ uống",
    baseUnit: "Lon",
    conversions: [
      {
        id: "1",
        unitName: "Lon",
        conversionRate: 1,
        barcode: "893000000021",
        isBaseUnit: true,
      },
      {
        id: "2",
        unitName: "Lốc (6 lon)",
        conversionRate: 6,
        barcode: "893000000022",
        isBaseUnit: false,
      },
      {
        id: "3",
        unitName: "Thùng (24 lon)",
        conversionRate: 24,
        barcode: "893000000023",
        isBaseUnit: false,
      },
      {
        id: "4",
        unitName: "Két (30 lon)",
        conversionRate: 30,
        barcode: "893000000025",
        isBaseUnit: false,
      },
    ],
  },
  {
    sku: "SKU-FOO-001",
    name: "Mì ăn liền Hảo Hảo Tôm Chua Cay",
    category: "Thực phẩm",
    baseUnit: "Gói",
    conversions: [
      {
        id: "1",
        unitName: "Gói",
        conversionRate: 1,
        barcode: "893111000001",
        isBaseUnit: true,
      },
      {
        id: "2",
        unitName: "Lốc (5 gói)",
        conversionRate: 5,
        barcode: "893111000005",
        isBaseUnit: false,
      },
      {
        id: "3",
        unitName: "Thùng (30 gói)",
        conversionRate: 30,
        barcode: "893111000030",
        isBaseUnit: false,
      },
    ],
  },
  {
    sku: "SKU-FOO-002",
    name: "Bánh Chocopie Orion 360g",
    category: "Bánh kẹo",
    baseUnit: "Cái",
    conversions: [
      {
        id: "1",
        unitName: "Cái",
        conversionRate: 1,
        barcode: "893222000001",
        isBaseUnit: true,
      },
      {
        id: "2",
        unitName: "Hộp (12 cái)",
        conversionRate: 12,
        barcode: "893222000012",
        isBaseUnit: false,
      },
      {
        id: "3",
        unitName: "Thùng (8 hộp)",
        conversionRate: 96,
        barcode: "893222000096",
        isBaseUnit: false,
      },
    ],
  },
];

export const UnitConversionManager: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>(INITIAL_PRODUCTS);
  const [selectedSku, setSelectedSku] = useState<string>("SKU-BEV-001");
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  // Modal cấu hình
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(
    null,
  );
  const [form] = Form.useForm();

  // Mô phỏng nhập xuất cho sản phẩm đang chọn
  const [simulateState, setSimulateState] = useState<{
    selectedUnitId: string;
    quantity: number;
  }>({
    selectedUnitId: "3",
    quantity: 10,
  });

  // Tải danh sách sản phẩm từ backend (nếu có endpoint)
  useEffect(() => {
    async function fetchProductList() {
      try {
        const res = await authenticatedFetch("/api/v1/products");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            // Map dữ liệu từ server với schema quy đổi
            const mapped: ProductItem[] = data.map((item: any) => {
              const base = item.unit || "Cái";
              return {
                sku: item.sku,
                name: item.name,
                category: item.category || "Hàng hóa",
                baseUnit: base,
                conversions: [
                  {
                    id: "1",
                    unitName: base,
                    conversionRate: 1,
                    isBaseUnit: true,
                  },
                  {
                    id: "2",
                    unitName: "Thùng",
                    conversionRate: 24,
                    isBaseUnit: false,
                  },
                ],
              };
            });
            setProducts(mapped);
            setSelectedSku(mapped[0].sku);
          }
        }
      } catch (err) {
        console.warn(
          "Không kết nối được API sản phẩm, dùng dữ liệu mẫu nội bộ.",
        );
      }
    }
    fetchProductList();
  }, []);

  // Lấy sản phẩm đang được người dùng bấm chọn xem chi tiết
  const currentProduct =
    products.find((p) => p.sku === selectedSku) || products[0];

  // Tìm đơn vị đang chọn trong ô mô phỏng
  const activeSimulateUnit =
    currentProduct?.conversions.find(
      (c) => c.id === simulateState.selectedUnitId,
    ) || currentProduct?.conversions[0];
  const convertedBaseTotal =
    (simulateState.quantity || 0) * (activeSimulateUnit?.conversionRate || 1);

  // Mở modal cấu hình cho 1 sản phẩm chỉ định
  const handleOpenConfigModal = (prod: ProductItem) => {
    setEditingProduct(prod);
    form.setFieldsValue({
      baseUnit: prod.baseUnit,
      conversions: prod.conversions.filter((c) => !c.isBaseUnit),
    });
    setIsModalOpen(true);
  };

  // Lưu cấu hình quy đổi của sản phẩm
  const handleSaveConfig = (values: any) => {
    if (!editingProduct) return;

    const newBaseUnit = values.baseUnit?.trim() || editingProduct.baseUnit;
    const additionalConversions: UnitConversion[] = (
      values.conversions || []
    ).map((item: any, index: number) => ({
      id: String(index + 2),
      unitName: item.unitName,
      conversionRate: item.conversionRate,
      barcode: item.barcode || "",
      isBaseUnit: false,
    }));

    const updatedConversions: UnitConversion[] = [
      {
        id: "1",
        unitName: newBaseUnit,
        conversionRate: 1,
        barcode:
          editingProduct.conversions.find((c) => c.isBaseUnit)?.barcode || "",
        isBaseUnit: true,
      },
      ...additionalConversions,
    ];

    const updatedList = products.map((item) => {
      if (item.sku === editingProduct.sku) {
        return {
          ...item,
          baseUnit: newBaseUnit,
          conversions: updatedConversions,
        };
      }
      return item;
    });

    setProducts(updatedList);
    message.success(`Đã cập nhật hệ số quy đổi cho ${editingProduct.name}`);
    setIsModalOpen(false);

    // Cập nhật lại đơn vị mô phỏng mặc định
    if (updatedConversions.length > 0) {
      setSimulateState({
        selectedUnitId: updatedConversions[updatedConversions.length - 1].id,
        quantity: 10,
      });
    }
  };

  // Lọc sản phẩm theo từ khóa tìm kiếm
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchKeyword.toLowerCase()),
  );

  // Cột bảng danh sách sản phẩm
  const productColumns = [
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (sku: string) => (
        <strong style={{ color: "#2563eb" }}>{sku}</strong>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: ProductItem) => (
        <div>
          <Text strong>{name}</Text>
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Phân loại: {record.category}
          </div>
        </div>
      ),
    },
    {
      title: "Đơn vị cơ sở (Ghi sổ)",
      dataIndex: "baseUnit",
      key: "baseUnit",
      width: 180,
      render: (unit: string) => <Tag color="blue">{unit}</Tag>,
    },
    {
      title: "Số cấp quy đổi",
      key: "conversionCount",
      width: 160,
      render: (_: any, record: ProductItem) => (
        <span>{record.conversions.length} đơn vị</span>
      ),
    },
    {
      title: "Thao tác",
      key: "action",
      width: 150,
      align: "center" as const,
      render: (_: any, record: ProductItem) => (
        <Button
          type="primary"
          ghost
          size="small"
          icon={<SettingOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSku(record.sku);
            handleOpenConfigModal(record);
          }}
        >
          Cấu hình ĐVT
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* 1. BẢNG DANH SÁCH SẢN PHẨM TỪ CƠ SỞ DỮ LIỆU */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <InboxOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              Danh mục sản phẩm kho ({filteredProducts.length} mặt hàng)
            </span>
          </div>
        }
        extra={
          <Input
            placeholder="Tìm theo tên hoặc mã SKU..."
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            style={{ width: 280 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            allowClear
          />
        }
      >
        <Table
          dataSource={filteredProducts}
          columns={productColumns}
          rowKey="sku"
          pagination={{ pageSize: 4 }}
          bordered
          size="middle"
          rowSelection={{
            type: "radio",
            selectedRowKeys: [selectedSku],
            onChange: (keys) => {
              const chosen = keys[0] as string;
              setSelectedSku(chosen);
              const p = products.find((item) => item.sku === chosen);
              if (p && p.conversions.length > 0) {
                setSimulateState({
                  selectedUnitId: p.conversions[p.conversions.length - 1].id,
                  quantity: 10,
                });
              }
            },
          }}
          onRow={(record) => ({
            onClick: () => {
              setSelectedSku(record.sku);
              if (record.conversions.length > 0) {
                setSimulateState({
                  selectedUnitId:
                    record.conversions[record.conversions.length - 1].id,
                  quantity: 10,
                });
              }
            },
            style: { cursor: "pointer" },
          })}
        />
      </Card>

      {/* 2. KHỐI CHI TIẾT ĐƠN VỊ QUY ĐỔI CỦA SẢN PHẨM ĐANG CHỌN */}
      {currentProduct && (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SwapOutlined style={{ color: "#2563eb", fontSize: 18 }} />
              <span>
                Bảng quy đổi ĐVT hiện tại:{" "}
                <strong>{currentProduct.name}</strong> ({currentProduct.sku})
              </span>
            </div>
          }
          extra={
            <Button
              type="primary"
              icon={<SettingOutlined />}
              onClick={() => handleOpenConfigModal(currentProduct)}
            >
              Chỉnh sửa quy đổi
            </Button>
          }
        >
          <Alert
            message="Quy tắc chuẩn hóa kho"
            description={`Hàng xuất nhập có thể bốc dỡ theo Thùng/Lốc, nhưng số liệu tồn kho kế toán luôn được tự động tính về đơn vị cơ sở là "${currentProduct.baseUnit}".`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            dataSource={currentProduct.conversions}
            rowKey="id"
            pagination={false}
            bordered
            size="middle"
            columns={[
              {
                title: "Đơn vị tính",
                dataIndex: "unitName",
                key: "unitName",
                render: (name: string, row: UnitConversion) => (
                  <Space>
                    <Text strong>{name}</Text>
                    {row.isBaseUnit && (
                      <Tag color="blue">Đơn vị cơ sở (Ghi sổ)</Tag>
                    )}
                  </Space>
                ),
              },
              {
                title: "Hệ số quy đổi",
                dataIndex: "conversionRate",
                key: "conversionRate",
                render: (rate: number, row: UnitConversion) => (
                  <Text>
                    1 {row.unitName} ={" "}
                    <strong style={{ color: "#2563eb" }}>{rate}</strong>{" "}
                    {currentProduct.baseUnit}
                  </Text>
                ),
              },
              {
                title: "Mã vạch bao bì (Barcode)",
                dataIndex: "barcode",
                key: "barcode",
                render: (code?: string) => <Tag>{code || "Chưa gán mã"}</Tag>,
              },
            ]}
          />
        </Card>
      )}

      {/* 3. KHỐI MÔ PHỎNG XUẤT NHẬP THEO THÙNG -> TỰ ĐỘNG GHI SỔ */}
      {currentProduct && (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 18 }} />
              <span>Mô phỏng bốc dỡ thực tế cho: {currentProduct.name}</span>
            </div>
          }
          style={{ backgroundColor: "#fafafa" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 32,
              alignItems: "center",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                padding: 20,
                borderRadius: 8,
                border: "1px solid #e2e8f0",
              }}
            >
              <Text
                type="secondary"
                style={{ fontSize: 13, display: "block", marginBottom: 16 }}
              >
                THỦ KHO CHỌN ĐƠN VỊ VÀ SỐ LƯỢNG KHI BỐC DỠ
              </Text>

              <Form layout="vertical">
                <Form.Item label="Đơn vị bốc dỡ thực tế">
                  <Select
                    value={activeSimulateUnit?.id}
                    onChange={(val) =>
                      setSimulateState({
                        ...simulateState,
                        selectedUnitId: val,
                      })
                    }
                    size="large"
                  >
                    {currentProduct.conversions.map((item) => (
                      <Option key={item.id} value={item.id}>
                        {item.unitName} (Quy đổi: {item.conversionRate}{" "}
                        {currentProduct.baseUnit})
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item label="Số lượng thực tế trên phiếu">
                  <InputNumber
                    min={1}
                    value={simulateState.quantity}
                    onChange={(val) =>
                      setSimulateState({ ...simulateState, quantity: val || 0 })
                    }
                    style={{ width: "100%" }}
                    size="large"
                  />
                </Form.Item>
              </Form>
            </div>

            <div
              style={{
                backgroundColor: "#f0fdf4",
                border: "1.5px dashed #22c55e",
                borderRadius: 8,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckCircleOutlined
                  style={{ color: "#16a34a", fontSize: 20 }}
                />
                <Text strong style={{ color: "#15803d", fontSize: 16 }}>
                  HỆ THỐNG TỰ ĐỘNG TÍNH TOÁN ĐỂ GHI SỔ
                </Text>
              </div>

              <Divider style={{ margin: "8px 0" }} />

              <div style={{ fontSize: 14, color: "#374151" }}>
                Phép tính:{" "}
                <strong>
                  {simulateState.quantity} {activeSimulateUnit?.unitName} ×{" "}
                  {activeSimulateUnit?.conversionRate} {currentProduct.baseUnit}
                </strong>
              </div>

              <div style={{ fontSize: 18, color: "#15803d", fontWeight: 700 }}>
                Số lượng ghi vào sổ kho:{" "}
                <span style={{ fontSize: 28, color: "#16a34a" }}>
                  {convertedBaseTotal.toLocaleString("vi-VN")}
                </span>{" "}
                {currentProduct.baseUnit}
              </div>

              <Text type="secondary" style={{ fontSize: 12 }}>
                Nhập/xuất bằng <strong>{activeSimulateUnit?.unitName}</strong>{" "}
                thì phiếu kho vẫn in đúng, nhưng tồn kho hệ thống luôn cộng/trừ
                chính xác theo <strong>{currentProduct.baseUnit}</strong>.
              </Text>
            </div>
          </div>
        </Card>
      )}

      {/* 4. MODAL THIẾT LẬP ĐƠN VỊ TÍNH CHO SKU ĐANG CHỌN */}
      <Modal
        title={`Cấu hình đơn vị quy đổi · ${editingProduct?.name || ""}`}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveConfig}>
          <Form.Item
            name="baseUnit"
            label="Đơn vị tính cơ sở (Đơn vị nhỏ nhất để ghi sổ)"
            tooltip="Tất cả các giao dịch sau này đều quy về đơn vị này để tính giá thành và trừ tồn kho."
            rules={[{ required: true, message: "Vui lòng nhập đơn vị cơ sở" }]}
          >
            <Input
              placeholder="Ví dụ: Lon, Gói, Cái, Chai, Chiếc"
              size="large"
            />
          </Form.Item>

          <Divider style={{ fontSize: 14, textAlign: "left" }}>
            Các đơn vị quy đổi lớn hơn (Lốc, Thùng, Két, Thùng 24, Thùng 30...)
          </Divider>

          <Form.List name="conversions">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Space
                    key={key}
                    style={{
                      display: "flex",
                      marginBottom: 12,
                      alignItems: "baseline",
                    }}
                    align="baseline"
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "unitName"]}
                      rules={[{ required: true, message: "Nhập tên đơn vị" }]}
                    >
                      <Input
                        placeholder="Tên ĐVT (vd: Thùng)"
                        style={{ width: 150 }}
                      />
                    </Form.Item>

                    <Text>=</Text>

                    <Form.Item
                      {...restField}
                      name={[name, "conversionRate"]}
                      rules={[{ required: true, message: "Nhập hệ số" }]}
                    >
                      <InputNumber
                        min={1}
                        placeholder="Hệ số quy đổi"
                        style={{ width: 140 }}
                      />
                    </Form.Item>

                    <Text type="secondary">
                      {editingProduct?.baseUnit || "Đơn vị cơ sở"}
                    </Text>

                    <Form.Item {...restField} name={[name, "barcode"]}>
                      <Input
                        placeholder="Mã vạch Barcode bao bì"
                        style={{ width: 180 }}
                      />
                    </Form.Item>

                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                    />
                  </Space>
                ))}

                <Form.Item>
                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 8 }}
                  >
                    Thêm đơn vị đóng gói mới
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              marginTop: 24,
            }}
          >
            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit">
              Lưu cấu hình
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default UnitConversionManager;
