import React, { useState, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Input,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DownloadOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  CalendarOutlined,
  DollarOutlined,
  RiseOutlined,
  PercentageOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import type { SalesMarginReport, ProductMarginDetail } from "../../services/apiClient";

const { Title, Text } = Typography;

export interface SalesReportPageProps {
  reportData?: SalesMarginReport | null;
  loading?: boolean;
  onRefresh?: () => void;
  onBack?: () => void;
}

export const SalesReportPage: React.FC<SalesReportPageProps> = ({
  reportData,
  loading = false,
  onRefresh,
  onBack,
}) => {
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  const formatMoney = (val?: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(val || 0);

  // Xuất file CSV chuẩn UTF-8 có BOM
  const handleDownloadCSV = () => {
    if (!reportData) {
      message.warning("Không có dữ liệu để xuất file!");
      return;
    }

    const rows = [
      ["BÁO CÁO DOANH SỐ VÀ BIÊN LỢI NHUẬN GỘP - WMS"],
      ["Kỳ báo cáo", reportData.period || "2026-Q3"],
      ["Tổng doanh thu", reportData.total_revenue || 0],
      ["Tổng giá vốn (COGS)", reportData.total_cogs || 0],
      ["Lợi nhuận gộp", reportData.gross_profit || 0],
      ["Biên lợi nhuận gộp", reportData.margin || "0%"],
      [],
      [
        "Mã SKU",
        "Tên sản phẩm",
        "Số lượng bán",
        "Doanh thu",
        "Giá vốn",
        "Biên lợi nhuận",
      ],
    ];

    if (Array.isArray(reportData.details)) {
      reportData.details.forEach((d: any) => {
        rows.push([
          d.sku || "",
          `"${(d.name || "").replace(/"/g, '""')}"`,
          d.units_sold || 0,
          d.revenue || 0,
          d.cost_price || 0,
          d.margin || "0%",
        ]);
      });
    }

    const csvContent = "\uFEFF" + rows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Bao_cao_loi_nhuan_${reportData.period || "2026"}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    message.success("Đã tải xuống tệp báo cáo CSV thành công!");
  };

  const filteredDetails = useMemo(() => {
    const list = reportData?.details || [];
    if (!searchKeyword.trim()) return list;
    const kw = searchKeyword.toLowerCase().trim();
    return list.filter(
      (item) =>
        (item.sku && item.sku.toLowerCase().includes(kw)) ||
        (item.name && item.name.toLowerCase().includes(kw)),
    );
  }, [reportData?.details, searchKeyword]);

  const columns: ColumnsType<ProductMarginDetail> = [
    {
      title: "STT",
      key: "idx",
      width: 65,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 130,
      render: (sku) => (
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {sku || "—"}
        </Tag>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      render: (name) => <Text strong>{name}</Text>,
    },
    {
      title: "Đã bán",
      dataIndex: "units_sold",
      key: "units_sold",
      align: "right",
      width: 110,
      render: (units) => (units || 0).toLocaleString("vi-VN"),
    },
    {
      title: "Giá vốn TB",
      dataIndex: "cost_price",
      key: "cost_price",
      align: "right",
      width: 140,
      render: (cost) => formatMoney(cost),
    },
    {
      title: "Doanh thu",
      dataIndex: "revenue",
      key: "revenue",
      align: "right",
      width: 160,
      render: (rev) => (
        <Text strong style={{ color: "#1e293b", fontSize: 14 }}>
          {formatMoney(rev)}
        </Text>
      ),
    },
    {
      title: "Biên lãi",
      dataIndex: "margin",
      key: "margin",
      align: "center",
      width: 110,
      render: (margin) => (
        <Tag
          color="green"
          style={{ fontWeight: 600, padding: "2px 8px", borderRadius: 4 }}
        >
          {margin || "0%"}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Header Bar Phẳng */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: "#1e293b" }}>
            Báo cáo Doanh số &amp; Biên lợi nhuận
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Dữ liệu tài chính và hiệu quả bán hàng chi tiết theo từng sản phẩm
          </Text>
        </div>

        <Space size="middle">
          {onBack && (
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              style={{ borderRadius: 8 }}
            >
              Quay lại Dashboard
            </Button>
          )}
          {onRefresh && (
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                onRefresh();
                message.success("Đã làm mới dữ liệu báo cáo!");
              }}
              loading={loading}
              style={{ borderRadius: 8 }}
            >
              Làm mới
            </Button>
          )}
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadCSV}
            style={{
              backgroundColor: "#10b981",
              borderColor: "#10b981",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            Tải file Excel / CSV
          </Button>
        </Space>
      </div>

      {/* 2. Thống kê tài chính 4 thẻ trắng */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Kỳ báo cáo
                </span>
              }
              value={reportData?.period || "—"}
              valueStyle={{ fontWeight: 700, color: "#1e293b", fontSize: 22 }}
              prefix={<CalendarOutlined style={{ color: "#3b82f6", marginRight: 8, fontSize: 20 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Tổng doanh thu
                </span>
              }
              value={formatMoney(reportData?.total_revenue || 0)}
              valueStyle={{ fontWeight: 700, color: "#1e293b", fontSize: 22 }}
              prefix={<DollarOutlined style={{ color: "#2563eb", marginRight: 8, fontSize: 20 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Lợi nhuận gộp
                </span>
              }
              value={formatMoney(reportData?.gross_profit || 0)}
              valueStyle={{ fontWeight: 700, color: "#16a34a", fontSize: 22 }}
              prefix={<RiseOutlined style={{ color: "#16a34a", marginRight: 8, fontSize: 20 }} />}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  Biên lợi nhuận gộp
                </span>
              }
              value={reportData?.margin || "0%"}
              valueStyle={{ fontWeight: 700, color: "#16a34a", fontSize: 22 }}
              prefix={<PercentageOutlined style={{ color: "#16a34a", marginRight: 8, fontSize: 20 }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* 3. Bảng chi tiết mặt hàng Full-Width */}
      <Card
        bordered
        style={{ borderRadius: 12, backgroundColor: "#ffffff" }}
        bodyStyle={{ padding: "20px 24px" }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileExcelOutlined style={{ color: "#10b981", fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b" }}>
              Chi tiết mặt hàng
            </span>
            <Tag color="blue">{filteredDetails.length} sản phẩm</Tag>
          </div>

          <Input
            placeholder="Tìm theo mã SKU, tên sản phẩm..."
            prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{ width: 280, borderRadius: 8 }}
            allowClear
          />
        </div>

        <Table<ProductMarginDetail>
          rowKey={(r, idx) => r.sku || String(idx)}
          columns={columns}
          dataSource={filteredDetails}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            showTotal: (total) => `Tổng số ${total} sản phẩm`,
          }}
          bordered
          size="middle"
        />
      </Card>
    </div>
  );
};

export default SalesReportPage;
