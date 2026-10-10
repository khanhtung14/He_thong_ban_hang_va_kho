import React from "react";
import {
  Card,
  List,
  Tag,
  Typography,
  Space,
  Skeleton,
  Empty,
  Badge,
} from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";

const { Text } = Typography;

export interface TerritoryItem {
  id: string;
  name: string;
  current: string;
  target: string;
  percentage: number;
  colorClass: string;
}

export interface ProductMarginItem {
  sku: string;
  name: string;
  revenue: number;
  margin: string;
  units_sold: number;
}

export interface TerritoryProgressProps {
  territories?: TerritoryItem[];
  area?: string;
  topSale?: {
    name: string;
    region: string;
    kpiPercentage: number;
  };
  productMargins?: ProductMarginItem[];
  onRewardTopSale?: () => void;
  loading?: boolean;
}

export const TerritoryProgress: React.FC<TerritoryProgressProps> = ({
  territories: _territories = [],
  topSale: _topSale,
  productMargins = [],
  onRewardTopSale: _onRewardTopSale,
  loading = false,
}) => {
  const formatMoney = (val: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(val || 0);

  // Hiệu ứng Loading Skeleton
  if (loading) {
    return (
      <Card style={{ borderRadius: 16, border: "1px solid #f0f0f0" }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  return (
    <Card
      style={{
        borderRadius: 16,
        border: "1px solid #f0f0f0",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.02)",
      }}
      styles={{
        header: { padding: "16px 20px", borderBottom: "1px solid #f5f5f5" },
        body: { padding: "12px 20px" },
      }}
      title={
        <Space align="center" size={8}>
          <Badge color="#722ed1" />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1f1f1f" }}>
            Hiệu quả SKU sinh lời (Margin)
          </span>
        </Space>
      }
      extra={
        <Text type="secondary" style={{ fontSize: 11 }}>
          Từ Báo cáo Doanh số
        </Text>
      }
    >
      {productMargins.length > 0 ? (
        <List
          itemLayout="horizontal"
          dataSource={productMargins}
          renderItem={(p) => (
            <List.Item
              key={p.sku}
              style={{
                padding: "12px 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {/* Tên sản phẩm, Mã SKU & Số lượng bán */}
              <div style={{ maxWidth: "60%" }}>
                <Text
                  strong
                  style={{ fontSize: 13, color: "#262626", display: "block" }}
                >
                  {p.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <Tag
                    color="default"
                    style={{
                      fontSize: 10,
                      padding: "0 4px",
                      marginInlineEnd: 4,
                    }}
                  >
                    {p.sku}
                  </Tag>{" "}
                  · {p.units_sold?.toLocaleString("vi-VN")} đơn vị bán
                </Text>
              </div>

              {/* Doanh thu & Tag Biên lợi nhuận */}
              <div style={{ textAlign: "right" }}>
                <div
                  style={{ fontWeight: 700, fontSize: 14, color: "#1f1f1f" }}
                >
                  {formatMoney(p.revenue)}
                </div>
                <Tag
                  color="success"
                  icon={<ThunderboltOutlined />}
                  style={{
                    marginInlineEnd: 0,
                    marginTop: 3,
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                  }}
                >
                  Lãi {p.margin}
                </Tag>
              </div>
            </List.Item>
          )}
        />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có số liệu sản phẩm sinh lời từ báo cáo."
          style={{ padding: "24px 0" }}
        />
      )}
    </Card>
  );
};

export default TerritoryProgress;
