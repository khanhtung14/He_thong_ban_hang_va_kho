import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  InputNumber,
  Input,
  Tag,
  Space,
  Typography,
  message,
  Tabs,
  Row,
  Col,
  Statistic,
  Select,
  Switch,
} from "antd";
import {
  BarChartOutlined,
  DownloadOutlined,
  SyncOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  AppstoreOutlined,
  ClockCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;

interface SkuTurnoverItem {
  product_id?: number;
  sku: string;
  product_name: string;
  category: string;
  warehouse_id: number;
  warehouse_name: string;
  physical_qty: number;
  reserved_qty: number;
  available_qty: number;
  unit: string;
  unit_cost: number;
  total_inventory_value: number;
  total_outbound_qty: number;
  turnover_ratio: number;
  days_in_inventory: number;
  is_slow_moving: boolean;
}

interface CategoryValuation {
  category: string;
  total_value: number;
  sku_count: number;
}

interface WarehouseValuation {
  warehouse_id: number;
  warehouse_name: string;
  total_value: number;
  sku_count: number;
}

interface TurnoverReportData {
  report_period_days: number;
  slow_moving_threshold_days: number;
  summary: {
    total_inventory_value: number;
    total_skus: number;
    slow_moving_skus_count: number;
    average_days_in_inventory: number;
  };
  valuation_by_category: CategoryValuation[];
  valuation_by_warehouse: WarehouseValuation[];
  items: SkuTurnoverItem[];
}

export const InventoryTurnoverReport: React.FC = () => {
  const [data, setData] = useState<TurnoverReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // Filters
  const [thresholdDays, setThresholdDays] = useState<number>(90);
  const [slowMovingOnly, setSlowMovingOnly] = useState<boolean>(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const formatVND = (val: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val || 0);

  useEffect(() => {
    let ignore = false;
    const runFetch = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("slow_moving_threshold_days", thresholdDays.toString());
        if (slowMovingOnly) params.append("slow_moving_only", "true");
        if (selectedWarehouse !== "ALL") params.append("warehouse_id", selectedWarehouse);
        if (selectedCategory !== "ALL") params.append("category", selectedCategory);

        const res = await authenticatedFetch(`/api/v1/reports/inventory-turnover?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!ignore) {
          setData(json);
        }
      } catch (err) {
        console.error("Lỗi tải báo cáo tồn kho & vòng quay hàng:", err);
        message.error("Không thể tải dữ liệu báo cáo tồn kho.");
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    runFetch();
    return () => {
      ignore = true;
    };
  }, [thresholdDays, slowMovingOnly, selectedWarehouse, selectedCategory, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.append("slow_moving_threshold_days", thresholdDays.toString());
      if (selectedWarehouse !== "ALL") params.append("warehouse_id", selectedWarehouse);
      if (selectedCategory !== "ALL") params.append("category", selectedCategory);

      const res = await authenticatedFetch(`/api/v1/reports/inventory-turnover/export?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_cao_vong_quay_ton_kho_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success("Xuất file Excel thành công!");
    } catch (err) {
      console.error("Lỗi xuất file Excel:", err);
      message.error("Lỗi khi tải file báo cáo Excel!");
    } finally {
      setExporting(false);
    }
  };

  // Lọc items theo searchText
  const filteredItems = (data?.items || []).filter((it) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      it.sku.toLowerCase().includes(q) ||
      it.product_name.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 130,
      render: (sku: string) => <Text strong style={{ color: "#2563eb" }}>{sku}</Text>,
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string, r: SkuTurnoverItem) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>Ngành: {r.category} | {r.warehouse_name}</Text>
        </div>
      ),
    },
    {
      title: "Tồn thực tế",
      dataIndex: "physical_qty",
      key: "physical_qty",
      width: 100,
      align: "right" as const,
      render: (qty: number, r: SkuTurnoverItem) => (
        <span>
          <b>{qty}</b> {r.unit}
        </span>
      ),
    },
    {
      title: "Đơn giá vốn",
      dataIndex: "unit_cost",
      key: "unit_cost",
      width: 120,
      align: "right" as const,
      render: (cost: number) => formatVND(cost),
    },
    {
      title: "Giá trị tồn kho",
      dataIndex: "total_inventory_value",
      key: "total_inventory_value",
      width: 150,
      align: "right" as const,
      render: (val: number) => (
        <span style={{ color: "#047857", fontWeight: 700 }}>{formatVND(val)}</span>
      ),
    },
    {
      title: "Đã xuất (kỳ)",
      dataIndex: "total_outbound_qty",
      key: "total_outbound_qty",
      width: 110,
      align: "right" as const,
    },
    {
      title: "Vòng quay",
      dataIndex: "turnover_ratio",
      key: "turnover_ratio",
      width: 110,
      align: "right" as const,
      render: (ratio: number) => `${ratio.toFixed(2)} vòng`,
    },
    {
      title: "Số ngày tồn (DSI)",
      dataIndex: "days_in_inventory",
      key: "days_in_inventory",
      width: 140,
      align: "right" as const,
      render: (days: number, r: SkuTurnoverItem) => (
        <span style={{ fontWeight: 600, color: r.is_slow_moving ? "#dc2626" : "#1e293b" }}>
          {days >= 999 ? ">999 ngày" : `${days} ngày`}
        </span>
      ),
    },
    {
      title: "Trạng thái luân chuyển",
      dataIndex: "is_slow_moving",
      key: "is_slow_moving",
      width: 170,
      render: (slow: boolean) =>
        slow ? (
          <Tag color="error" icon={<WarningOutlined />}>
            Chậm luân chuyển
          </Tag>
        ) : (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Bình thường
          </Tag>
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 4 Thẻ KPI Tổng quan (SCRUM-74) */}
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false} style={{ background: "#ecfdf5", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#065f46", fontWeight: 600 }}>Tổng giá trị tồn kho</span>}
              value={data?.summary.total_inventory_value || 0}
              precision={0}
              formatter={(v) => formatVND(Number(v))}
              prefix={<DollarOutlined style={{ color: "#10b981" }} />}
              valueStyle={{ color: "#047857", fontWeight: 700, fontSize: 22 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} style={{ background: "#eff6ff", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#1e40af", fontWeight: 600 }}>Tổng số mặt hàng (SKU)</span>}
              value={data?.summary.total_skus || 0}
              prefix={<AppstoreOutlined style={{ color: "#3b82f6" }} />}
              valueStyle={{ color: "#1e3a8a", fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} style={{ background: "#fef2f2", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#991b1b", fontWeight: 600 }}>SKU Chậm luân chuyển</span>}
              value={data?.summary.slow_moving_skus_count || 0}
              prefix={<WarningOutlined style={{ color: "#ef4444" }} />}
              valueStyle={{ color: "#b91c1c", fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} style={{ background: "#faf5ff", borderRadius: 8 }}>
            <Statistic
              title={<span style={{ color: "#581c87", fontWeight: 600 }}>Số ngày tồn bình quân (DSI)</span>}
              value={data?.summary.average_days_in_inventory || 0}
              suffix="ngày"
              prefix={<ClockCircleOutlined style={{ color: "#a855f7" }} />}
              valueStyle={{ color: "#6b21a8", fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc & Bảng chi tiết */}
      <Card
        title={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Space>
              <BarChartOutlined style={{ color: "#2563eb", fontSize: 20 }} />
              <Title level={4} style={{ margin: 0 }}>
                Báo cáo Tồn kho & Vòng quay hàng (SCRUM-74)
              </Title>
            </Space>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                style={{ background: "#059669" }}
                onClick={handleExportExcel}
                loading={exporting}
              >
                Xuất file Excel (.xlsx)
              </Button>
              <Button icon={<SyncOutlined />} onClick={handleRefresh} loading={loading}>
                Làm mới
              </Button>
            </Space>
          </div>
        }
        bordered={false}
        style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
      >
        {/* Bộ lọc nghiệp vụ */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            padding: "12px 16px",
            background: "#f8fafc",
            borderRadius: 6,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong>Ngưỡng chậm (ngày):</Text>
            <InputNumber
              min={1}
              max={365}
              value={thresholdDays}
              onChange={(v) => setThresholdDays(v || 90)}
              style={{ width: 90 }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong>Chỉ xem hàng chậm:</Text>
            <Switch checked={slowMovingOnly} onChange={setSlowMovingOnly} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong>Kho:</Text>
            <Select
              value={selectedWarehouse}
              onChange={setSelectedWarehouse}
              style={{ width: 170 }}
              options={[
                { value: "ALL", label: "Tất cả các kho" },
                ...(data?.valuation_by_warehouse || []).map((w) => ({
                  value: String(w.warehouse_id),
                  label: w.warehouse_name,
                })),
              ]}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text strong>Ngành hàng:</Text>
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 160 }}
              options={[
                { value: "ALL", label: "Tất cả ngành" },
                ...(data?.valuation_by_category || []).map((c) => ({
                  value: c.category,
                  label: c.category,
                })),
              ]}
            />
          </div>

          <Input
            placeholder="Tìm theo SKU, tên sản phẩm..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220, marginLeft: "auto" }}
          />
        </div>

        <Tabs
          defaultActiveKey="sku"
          items={[
            {
              key: "sku",
              label: <span>Chi tiết theo từng SKU ({filteredItems.length})</span>,
              children: (
                <Table
                  dataSource={filteredItems}
                  columns={columns}
                  rowKey="sku"
                  loading={loading}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  locale={{ emptyText: "Không tìm thấy sản phẩm nào." }}
                />
              ),
            },
            {
              key: "category",
              label: <span>Giá trị tồn theo Nhóm hàng</span>,
              children: (
                <Table
                  dataSource={data?.valuation_by_category || []}
                  rowKey="category"
                  pagination={false}
                  columns={[
                    {
                      title: "Ngành / Nhóm hàng",
                      dataIndex: "category",
                      key: "category",
                      render: (cat: string) => <Text strong>{cat}</Text>,
                    },
                    {
                      title: "Số lượng SKU",
                      dataIndex: "sku_count",
                      key: "sku_count",
                      align: "right" as const,
                    },
                    {
                      title: "Tổng giá trị tồn kho",
                      dataIndex: "total_value",
                      key: "total_value",
                      align: "right" as const,
                      render: (v: number) => (
                        <span style={{ color: "#059669", fontWeight: 700 }}>{formatVND(v)}</span>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: "warehouse",
              label: <span>Giá trị tồn theo Kho hàng</span>,
              children: (
                <Table
                  dataSource={data?.valuation_by_warehouse || []}
                  rowKey="warehouse_id"
                  pagination={false}
                  columns={[
                    {
                      title: "Tên kho hàng",
                      dataIndex: "warehouse_name",
                      key: "warehouse_name",
                      render: (name: string) => <Text strong>{name}</Text>,
                    },
                    {
                      title: "Số lượng SKU",
                      dataIndex: "sku_count",
                      key: "sku_count",
                      align: "right" as const,
                    },
                    {
                      title: "Tổng giá trị tồn kho",
                      dataIndex: "total_value",
                      key: "total_value",
                      align: "right" as const,
                      render: (v: number) => (
                        <span style={{ color: "#059669", fontWeight: 700 }}>{formatVND(v)}</span>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default InventoryTurnoverReport;
