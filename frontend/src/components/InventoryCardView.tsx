import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Select,
  DatePicker,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
  Tooltip,
  Breadcrumb,
  Empty,
  message,
} from "antd";
import {
  BookOutlined,
  CalendarOutlined,
  FilterOutlined,
  ReloadOutlined,
  LinkOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ShopOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import {
  fetchInventoryCard,
  type InventoryCardData,
  type InventoryCardItem,
  type TransactionType,
} from "../services/inventoryCardService";
import { fetchProducts, type ProductItem } from "../services/productService";
import { authenticatedFetch } from "../services/sessionService";

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export interface InventoryCardViewProps {
  initialProductId?: number;
  initialWarehouseId?: number;
  onNavigateDocument?: (url: string) => void;
}

export interface WarehouseOption {
  id: number;
  name: string;
  code?: string;
}

export const InventoryCardView: React.FC<InventoryCardViewProps> = ({
  initialProductId,
  initialWarehouseId,
  onNavigateDocument,
}) => {
  // State lựa chọn
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(initialProductId);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | undefined>(initialWarehouseId);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    dayjs().startOf("month"),
    dayjs().endOf("month"),
  ]);

  // State dữ liệu
  const [cardData, setCardData] = useState<InventoryCardData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState<boolean>(false);

  // 1. Tải danh mục sản phẩm và kho hàng
  useEffect(() => {
    const loadMetadata = async () => {
      setLoadingMeta(true);
      try {
        // Tải sản phẩm
        const prodRes = await fetchProducts({ limit: 200 });
        const prodItems = prodRes.items || [];
        setProducts(prodItems);

        if (!selectedProductId && prodItems.length > 0) {
          setSelectedProductId(prodItems[0].id);
        }

        // Tải kho hàng
        try {
          const whRes = await authenticatedFetch("/api/v1/warehouses");
          if (whRes.ok) {
            const json = await whRes.json();
            const items = Array.isArray(json) ? json : json.data || [];
            setWarehouses(items);
          }
        } catch {
          setWarehouses([
            { id: 1, name: "Kho Tổng Hà Nội", code: "WH-HN-01" },
            { id: 2, name: "Kho Chi nhánh TP.HCM", code: "WH-HCM-01" },
          ]);
        }
      } catch (err) {
        console.error("Lỗi tải danh mục thẻ kho:", err);
      } finally {
        setLoadingMeta(false);
      }
    };

    loadMetadata();
  }, []);

  // 2. Tải dữ liệu thẻ kho
  const loadInventoryCard = useCallback(async () => {
    if (!selectedProductId) return;

    setLoading(true);
    try {
      const startDateStr = dateRange[0] ? dateRange[0].format("YYYY-MM-DD") : undefined;
      const endDateStr = dateRange[1] ? dateRange[1].format("YYYY-MM-DD") : undefined;

      const data = await fetchInventoryCard(selectedProductId, {
        warehouseId: selectedWarehouseId,
        startDate: startDateStr,
        endDate: endDateStr,
      });
      setCardData(data);
    } catch (err: any) {
      message.error(err.message || "Không thể tải dữ liệu thẻ kho.");
      setCardData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, selectedWarehouseId, dateRange]);

  useEffect(() => {
    if (selectedProductId) {
      loadInventoryCard();
    }
  }, [loadInventoryCard, selectedProductId]);

  // Điều hướng khi bấm vào mã chứng từ
  const handleDocumentClick = (e: React.MouseEvent, url?: string) => {
    if (!url) return;
    if (onNavigateDocument) {
      e.preventDefault();
      onNavigateDocument(url);
    }
  };

  // Màu sắc & icon cho loại chứng từ
  const renderTransactionTypeTag = (type: TransactionType, label?: string) => {
    const textLabel = label || type;
    switch (type) {
      case "NHAP":
        return (
          <Tag color="success" icon={<ArrowDownOutlined style={{ color: "#16a34a" }} />}>
            {textLabel}
          </Tag>
        );
      case "XUAT":
        return (
          <Tag color="error" icon={<ArrowUpOutlined style={{ color: "#dc2626" }} />}>
            {textLabel}
          </Tag>
        );
      case "CHUYEN_XUAT":
        return (
          <Tag color="purple" icon={<SwapOutlined />}>
            {textLabel}
          </Tag>
        );
      case "CHUYEN_NHAP":
        return (
          <Tag color="blue" icon={<SwapOutlined />}>
            {textLabel}
          </Tag>
        );
      case "DIEU_CHINH":
        return (
          <Tag color="warning" icon={<ExclamationCircleOutlined />}>
            {textLabel}
          </Tag>
        );
      default:
        return <Tag color="default">{textLabel}</Tag>;
    }
  };

  // Cấu hình các cột cho Bảng Thẻ kho (Data Table)
  const columns: ColumnsType<InventoryCardItem> = [
    {
      title: "Ngày tháng",
      dataIndex: "date",
      key: "date",
      width: 170,
      render: (dateStr: string) => (
        <Space size={4}>
          <CalendarOutlined style={{ color: "#64748b" }} />
          <Text strong style={{ fontSize: 13 }}>
            {dateStr}
          </Text>
        </Space>
      ),
    },
    {
      title: "Loại chứng từ",
      key: "transactionType",
      width: 160,
      render: (_, record) =>
        renderTransactionTypeTag(
          record.transactionType || record.transaction_type || "NHAP",
          record.transactionTypeLabel || record.transaction_type_label
        ),
    },
    {
      title: "Mã chứng từ gốc",
      dataIndex: "documentCode",
      key: "documentCode",
      width: 180,
      render: (_, record) => {
        const docCode = record.documentCode || record.document_code || `#${record.documentId}`;
        const docUrl = record.documentUrl || record.document_url || "#";

        return (
          <Tooltip title={`Nhấp để mở chi tiết chứng từ ${docCode}`}>
            <a
              href={docUrl}
              onClick={(e) => handleDocumentClick(e, docUrl)}
              style={{
                color: "var(--accent-primary, #4F46E5)",
                fontWeight: 600,
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{docCode}</span>
              <LinkOutlined style={{ fontSize: 12 }} />
            </a>
          </Tooltip>
        );
      },
    },
    {
      title: "Số lượng thay đổi",
      dataIndex: "changeQuantity",
      key: "changeQuantity",
      width: 150,
      align: "right",
      render: (val: number, record) => {
        const qty = record.changeQuantity ?? record.change_quantity ?? 0;
        const isPositive = qty > 0;
        const formatted = qty.toLocaleString("vi-VN", { maximumFractionDigits: 3 });

        return (
          <Text
            strong
            style={{
              fontSize: 14,
              color: isPositive ? "#16a34a" : "#dc2626",
            }}
          >
            {isPositive ? `+${formatted}` : formatted}
          </Text>
        );
      },
    },
    {
      title: "Tồn sau phát sinh (Lũy kế)",
      dataIndex: "balanceAfter",
      key: "balanceAfter",
      width: 180,
      align: "right",
      render: (val: number, record) => {
        const balance = record.balanceAfter ?? record.balance_after ?? 0;
        return (
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              color: "#0f172a",
              background: "#f1f5f9",
              padding: "4px 10px",
              borderRadius: 6,
              display: "inline-block",
            }}
          >
            {balance.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}
          </div>
        );
      },
    },
    {
      title: "Diễn giải / Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (note: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {note || "—"}
        </Text>
      ),
    },
  ];

  const currentProduct = cardData?.product || products.find((p) => p.id === selectedProductId);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", paddingBottom: 24 }}>
      {/* 1. Header & Bộ lọc Thẻ kho */}
      <Card
        style={{
          borderRadius: 12,
          marginBottom: 20,
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space align="center">
            <BookOutlined style={{ fontSize: 24, color: "var(--accent-primary, #4F46E5)" }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>
                Thẻ Kho Hàng Hóa (Stock Card)
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Theo dõi chi tiết toàn bộ lịch sử xuất - nhập - chuyển kho và số tồn lũy kế của sản phẩm
              </Text>
            </div>
          </Space>

          <Button
            icon={<ReloadOutlined />}
            onClick={loadInventoryCard}
            loading={loading}
          >
            Làm mới
          </Button>
        </div>

        {/* Thanh bộ lọc (Kho hàng, Sản phẩm, Khoảng thời gian) */}
        <div
          style={{
            background: "#f8fafc",
            padding: "16px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <Row gutter={[16, 16]} align="middle">
            {/* Chọn Sản phẩm */}
            <Col xs={24} sm={12} md={8}>
              <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                Chọn Sản phẩm (SKU) *
              </Text>
              <Select
                style={{ width: "100%" }}
                placeholder="Tìm mã SKU hoặc tên sản phẩm..."
                showSearch
                optionFilterProp="label"
                value={selectedProductId}
                onChange={(val) => setSelectedProductId(val)}
                loading={loadingMeta}
                options={products.map((p) => ({
                  value: p.id,
                  label: `[${p.sku}] ${p.name}`,
                }))}
              />
            </Col>

            {/* Chọn Kho hàng */}
            <Col xs={24} sm={12} md={7}>
              <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                Kho hàng:
              </Text>
              <Select
                style={{ width: "100%" }}
                placeholder="-- Tất cả kho hàng --"
                allowClear
                value={selectedWarehouseId}
                onChange={(val) => setSelectedWarehouseId(val)}
              >
                <Option value={undefined}>Tất cả kho hàng</Option>
                {warehouses.map((wh) => (
                  <Option key={wh.id} value={wh.id}>
                    {wh.name} {wh.code ? `(${wh.code})` : ""}
                  </Option>
                ))}
              </Select>
            </Col>

            {/* Chọn Khoảng thời gian (Từ ngày - Đến ngày) */}
            <Col xs={24} sm={18} md={9}>
              <Text strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
                Khoảng thời gian (Từ ngày - Đến ngày):
              </Text>
              <RangePicker
                style={{ width: "100%" }}
                format="DD/MM/YYYY"
                value={dateRange}
                onChange={(dates) => {
                  setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null]);
                }}
              />
            </Col>
          </Row>
        </div>
      </Card>

      {/* 2. Khối thống kê tổng quan (Tồn đầu, Nhập, Xuất, Tồn cuối) */}
      {cardData && (
        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} sm={6}>
            <Card
              bordered={false}
              style={{
                borderRadius: 10,
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
              }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text type="secondary">Tồn đầu kỳ</Text>}
                value={cardData.openingBalance ?? cardData.opening_balance ?? 0}
                precision={0}
                valueStyle={{ color: "#334155", fontWeight: 700 }}
                suffix={<span style={{ fontSize: 12 }}>{cardData.product.baseUnit || "Đơn vị"}</span>}
              />
            </Card>
          </Col>

          <Col xs={12} sm={6}>
            <Card
              bordered={false}
              style={{
                borderRadius: 10,
                background: "var(--success-bg, #F0FDF4)",
                border: "1px solid var(--success-border, #BBF7D0)",
              }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: "var(--success-text, #166534)" }}>Tổng nhập trong kỳ</Text>}
                value={cardData.totalIn ?? cardData.total_in ?? 0}
                precision={0}
                valueStyle={{ color: "#16a34a", fontWeight: 700 }}
                prefix={<ArrowDownOutlined />}
                suffix={<span style={{ fontSize: 12 }}>{cardData.product.baseUnit || "Đơn vị"}</span>}
              />
            </Card>
          </Col>

          <Col xs={12} sm={6}>
            <Card
              bordered={false}
              style={{
                borderRadius: 10,
                background: "var(--danger-bg, #FEF2F2)",
                border: "1px solid var(--danger-border, #FECACA)",
              }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: "var(--danger-text, #991B1B)" }}>Tổng xuất trong kỳ</Text>}
                value={cardData.totalOut ?? cardData.total_out ?? 0}
                precision={0}
                valueStyle={{ color: "#dc2626", fontWeight: 700 }}
                prefix={<ArrowUpOutlined />}
                suffix={<span style={{ fontSize: 12 }}>{cardData.product.baseUnit || "Đơn vị"}</span>}
              />
            </Card>
          </Col>

          <Col xs={12} sm={6}>
            <Card
              bordered={false}
              style={{
                borderRadius: 10,
                background: "var(--accent-light, #EEF2FF)",
                border: "1px solid #c7d2fe",
              }}
              bodyStyle={{ padding: 16 }}
            >
              <Statistic
                title={<Text style={{ color: "var(--accent-text, #3730A3)", fontWeight: 600 }}>Tồn cuối kỳ</Text>}
                value={cardData.closingBalance ?? cardData.closing_balance ?? 0}
                precision={0}
                valueStyle={{ color: "var(--accent-primary, #4F46E5)", fontWeight: 700 }}
                suffix={<span style={{ fontSize: 12 }}>{cardData.product.baseUnit || "Đơn vị"}</span>}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 3. Bảng Dữ liệu Thẻ kho (Data Table) */}
      <Card
        title={
          currentProduct ? (
            <Space align="center">
              <FileTextOutlined style={{ color: "#2563eb" }} />
              <div>
                <span style={{ fontWeight: 700 }}>
                  Thẻ kho: [{currentProduct.sku}] {currentProduct.name}
                </span>
                <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400, color: "#64748b" }}>
                  (ĐVT: {currentProduct.baseUnit || "Đơn vị"}) — Kho: {cardData?.warehouse?.name || "Tất cả"}
                </span>
              </div>
            </Space>
          ) : (
            "Dữ liệu Thẻ kho"
          )
        }
        style={{
          borderRadius: 12,
          boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        }}
      >
        <Table
          dataSource={cardData?.items || []}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="middle"
          bordered
          pagination={{
            pageSize: 15,
            showTotal: (total) => `Tổng ${total} lượt phát sinh`,
            showQuickJumper: true,
          }}
          locale={{
            emptyText: (
              <Empty
                description={
                  <span>
                    Chưa có phát sinh giao dịch nào cho sản phẩm này trong khoảng thời gian đã chọn.
                  </span>
                }
              />
            ),
          }}
        />
      </Card>
    </div>
  );
};

export default InventoryCardView;
