import React, { useEffect, useState, useCallback } from "react";
import {
  Modal,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  DatePicker,
  Alert,
  Card,
  Row,
  Col,
  message,
} from "antd";
import {
  HistoryOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  UserOutlined,
  CalendarOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { authenticatedFetch } from "../../services/sessionService";

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface PriceHistoryItem {
  id: number;
  productId?: number;
  product_id?: number;
  oldPrice?: number | null;
  old_price?: number | null;
  newPrice: number;
  new_price?: number;
  changedBy?: string | null;
  changed_by?: string | null;
  changedAt?: string | null;
  changed_at?: string | null;
  effectiveDate?: string | null;
  effective_date?: string | null;
  note?: string | null;
  reason?: string | null;
}

export interface ProductPriceHistoryModalProps {
  visible: boolean;
  product: {
    id: number;
    sku: string;
    name: string;
    basePrice?: number;
    baseUnit?: string;
  } | null;
  onClose: () => void;
}

export const ProductPriceHistoryModal: React.FC<ProductPriceHistoryModalProps> = ({
  visible,
  product,
  onClose,
}) => {
  const [historyList, setHistoryList] = useState<PriceHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const fetchPriceHistory = useCallback(async () => {
    if (!product || !visible) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange && dateRange[0]) {
        params.append("fromDate", dateRange[0].format("YYYY-MM-DD"));
      }
      if (dateRange && dateRange[1]) {
        params.append("toDate", dateRange[1].format("YYYY-MM-DD"));
      }

      const queryString = params.toString() ? `?${params.toString()}` : "";
      const res = await authenticatedFetch(`/api/v1/products/${product.id}/price-history${queryString}`);

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.detail || "Không thể tải lịch sử giá sản phẩm.");
      }

      const data = await res.json();
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi tải lịch sử giá.");
    } finally {
      setLoading(false);
    }
  }, [product, visible, dateRange]);

  useEffect(() => {
    if (visible && product) {
      setDateRange(null);
      fetchPriceHistory();
    } else {
      setHistoryList([]);
    }
  }, [visible, product]);

  const handleFilter = () => {
    fetchPriceHistory();
  };

  const handleResetFilter = () => {
    setDateRange(null);
    if (product) {
      setLoading(true);
      authenticatedFetch(`/api/v1/products/${product.id}/price-history`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setHistoryList(Array.isArray(data) ? data : []))
        .catch(() => message.error("Lỗi khi tải lại dữ liệu."))
        .finally(() => setLoading(false));
    }
  };

  const columns: ColumnsType<PriceHistoryItem> = [
    {
      title: "Thời điểm áp dụng",
      key: "effectiveDate",
      width: 170,
      render: (_, record) => {
        const dt = record.effectiveDate || record.effective_date || record.changedAt || record.changed_at;
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 13 }}>
              {dt ? dayjs(dt).format("DD/MM/YYYY HH:mm:ss") : "-"}
            </Text>
            {dt && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                ({dayjs(dt).format("YYYY-MM-DD")})
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Giá cũ",
      key: "oldPrice",
      width: 130,
      align: "right",
      render: (_, record) => {
        const oldP = record.oldPrice ?? record.old_price;
        return oldP !== null && oldP !== undefined ? (
          <Text delete type="secondary">
            {Number(oldP).toLocaleString("vi-VN")} ₫
          </Text>
        ) : (
          <Tag color="default">Khởi tạo ban đầu</Tag>
        );
      },
    },
    {
      title: "Giá mới áp dụng",
      key: "newPrice",
      width: 140,
      align: "right",
      render: (_, record) => {
        const newP = record.newPrice ?? record.new_price ?? 0;
        return (
          <Text strong style={{ color: "#1677ff", fontSize: 14 }}>
            {Number(newP).toLocaleString("vi-VN")} ₫
          </Text>
        );
      },
    },
    {
      title: "Biến động giá",
      key: "diff",
      width: 155,
      align: "center",
      render: (_, record) => {
        const oldP = record.oldPrice ?? record.old_price;
        const newP = record.newPrice ?? record.new_price ?? 0;

        if (oldP === null || oldP === undefined) {
          return <Tag color="blue">Khởi tạo giá</Tag>;
        }

        const diff = Number(newP) - Number(oldP);
        if (diff === 0) {
          return <Tag color="default">Không đổi</Tag>;
        }

        const percent = oldP > 0 ? ((diff / oldP) * 100).toFixed(1) : null;
        if (diff > 0) {
          return (
            <Tag color="volcano" icon={<ArrowUpOutlined />}>
              +{diff.toLocaleString("vi-VN")} ₫ {percent ? `(+${percent}%)` : ""}
            </Tag>
          );
        }

        return (
          <Tag color="green" icon={<ArrowDownOutlined />}>
            {diff.toLocaleString("vi-VN")} ₫ {percent ? `(${percent}%)` : ""}
          </Tag>
        );
      },
    },
    {
      title: "Người cập nhật",
      key: "changedBy",
      width: 140,
      render: (_, record) => {
        const user = record.changedBy || record.changed_by || "Hệ thống";
        return (
          <Tag icon={<UserOutlined />} color="purple">
            {user}
          </Tag>
        );
      },
    },
    {
      title: "Lý do / Ghi chú",
      key: "note",
      render: (_, record) => {
        const note = record.note || record.reason || "-";
        return (
          <Text style={{ wordBreak: "break-word" }}>
            {note}
          </Text>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <Space align="center" style={{ fontSize: 17 }}>
          <HistoryOutlined style={{ color: "#722ed1" }} />
          <span>Lịch sử thay đổi giá sản phẩm</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={1000}
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          Đóng
        </Button>,
      ]}
      destroyOnClose
    >
      {product && (
        <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 8 }}>
          {/* Card thông tin tóm tắt sản phẩm */}
          <Card
            size="small"
            style={{
              background: "#fafafa",
              border: "1px solid #f0f0f0",
              borderRadius: 8,
            }}
          >
            <Row gutter={[16, 8]} align="middle">
              <Col xs={24} sm={8}>
                <Text type="secondary">Mã SKU: </Text>
                <Text strong copyable style={{ color: "#1677ff", fontFamily: "monospace" }}>
                  {product.sku}
                </Text>
              </Col>
              <Col xs={24} sm={10}>
                <Text type="secondary">Tên sản phẩm: </Text>
                <Text strong>{product.name}</Text>
              </Col>
              <Col xs={24} sm={6}>
                <Text type="secondary">Giá hiện tại: </Text>
                <Tag color="gold" style={{ fontSize: 13, fontWeight: 600 }}>
                  {product.basePrice !== undefined && product.basePrice !== null
                    ? `${Number(product.basePrice).toLocaleString("vi-VN")} ₫`
                    : "-"}
                </Tag>
              </Col>
            </Row>
          </Card>

          {/* Alert thông báo tính chất bất biến */}
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="Nhật ký kiểm toán giá (Audit Log) - Dữ liệu bất biến"
            description="Lịch sử giá được tự động ghi nhận khi cập nhật giá sản phẩm hoặc phát hành bảng giá mới. Dữ liệu chỉ có quyền xem, không thể sửa hoặc xóa nhằm đảm bảo tính minh bạch giải thích cho đại lý."
          />

          {/* Bộ lọc khoảng thời gian */}
          <Card size="small" style={{ borderRadius: 8 }}>
            <Row gutter={[12, 12]} align="middle" justify="space-between">
              <Col xs={24} sm={16}>
                <Space wrap align="center">
                  <CalendarOutlined style={{ color: "#1677ff" }} />
                  <Text strong style={{ fontSize: 13 }}>Khoảng thời gian:</Text>
                  <RangePicker
                    placeholder={["Từ ngày", "Đến ngày"]}
                    format="DD/MM/YYYY"
                    value={dateRange as any}
                    onChange={(dates) => setDateRange(dates as any)}
                    allowClear
                  />
                  <Button type="primary" onClick={handleFilter}>
                    Lọc
                  </Button>
                  {dateRange && (
                    <Button onClick={handleResetFilter}>
                      Đặt lại
                    </Button>
                  )}
                </Space>
              </Col>
              <Col xs={24} sm={8} style={{ textAlign: "right" }}>
                <Button icon={<ReloadOutlined />} onClick={fetchPriceHistory} loading={loading}>
                  Tải lại
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Bảng danh sách lịch sử */}
          <Table
            columns={columns}
            dataSource={historyList}
            rowKey={(r) => r.id}
            loading={loading}
            pagination={{
              pageSize: 6,
              showTotal: (total) => `Tổng cộng ${total} lần thay đổi giá`,
              size: "small",
            }}
            locale={{
              emptyText: "Sản phẩm chưa có lịch sử thay đổi giá nào được ghi nhận.",
            }}
            size="middle"
            bordered
          />
        </Space>
      )}
    </Modal>
  );
};
export default ProductPriceHistoryModal;
