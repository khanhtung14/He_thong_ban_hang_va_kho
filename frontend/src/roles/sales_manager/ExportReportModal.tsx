import React from "react";
import {
  Modal,
  Button,
  Typography,
  Descriptions,
  Table,
  Tag,
  Space,
  Card,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  FileExcelOutlined,
  BarChartOutlined,
  DownloadOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: any;
}

interface SkuDetail {
  sku: string;
  name: string;
  units_sold: number;
  revenue: number;
  cost_price: number;
  margin: string;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  reportData,
}) => {
  const formatMoney = (val: number) =>
    new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(val || 0);

  // Xuất file CSV chuẩn UTF-8 (có BOM để mở trong Excel không bị lỗi phông tiếng Việt)
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

    // "\uFEFF" là UTF-8 BOM giúp Excel Windows hiển thị tiếng Việt có dấu chuẩn 100%
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

  // Cấu hình bảng hiển thị chi tiết các sản phẩm
  const columns: ColumnsType<SkuDetail> = [
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 100,
      render: (sku) => <Tag color="blue">{sku}</Tag>,
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      ellipsis: true,
    },
    {
      title: "Đã bán",
      dataIndex: "units_sold",
      key: "units_sold",
      align: "right",
      width: 80,
      render: (units) => units?.toLocaleString("vi-VN"),
    },
    {
      title: "Doanh thu",
      dataIndex: "revenue",
      key: "revenue",
      align: "right",
      render: (rev) => <Text strong>{formatMoney(rev)}</Text>,
    },
    {
      title: "Biên lãi",
      dataIndex: "margin",
      key: "margin",
      align: "center",
      width: 90,
      render: (margin) => <Tag color="green">{margin}</Tag>,
    },
  ];

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      width={720}
      title={
        <Space align="center" style={{ marginBottom: 4 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#f6ffed",
              color: "#52c41a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              border: "1px solid #b7eb8f",
            }}
          >
            <BarChartOutlined />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1f1f1f" }}>
              Xuất báo cáo Doanh số & Biên lợi nhuận
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Dữ liệu tài chính bảo mật dành riêng cho Quản lý kinh doanh
            </Text>
          </div>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Đóng
        </Button>,
        <Button
          key="download"
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownloadCSV}
          style={{ backgroundColor: "#10b981", borderColor: "#10b981" }}
        >
          Tải file Excel / CSV
        </Button>,
      ]}
      style={{ top: 24 }}
    >
      <div style={{ marginTop: 16 }}>
        {/* Tóm tắt chỉ số tài chính */}
        <Card
          size="small"
          style={{
            backgroundColor: "#fcfcfc",
            borderColor: "#f0f0f0",
            borderRadius: 12,
            marginBottom: 16,
          }}
          styles={{ body: { padding: "16px 20px" } }}
        >
          <Descriptions size="small" column={2} bordered={false}>
            <Descriptions.Item label="Kỳ báo cáo">
              <Text strong>{reportData?.period || "—"}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Biên lợi nhuận gộp">
              <Tag color="success" style={{ fontWeight: 700 }}>
                {reportData?.margin || "0%"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tổng doanh thu">
              <Text strong style={{ fontSize: 15, color: "#1f1f1f" }}>
                {formatMoney(reportData?.total_revenue || 0)}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Lợi nhuận gộp">
              <Text strong style={{ fontSize: 15, color: "#52c41a" }}>
                {formatMoney(reportData?.gross_profit || 0)}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Bảng xem trước danh sách chi tiết mặt hàng */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
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
              Chi tiết mặt hàng ({reportData?.details?.length || 0} SKU)
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FileExcelOutlined /> Xuất khẩu kèm giá vốn và biên lãi
            </Text>
          </div>

          <Table
            columns={columns}
            dataSource={reportData?.details || []}
            rowKey="sku"
            size="small"
            pagination={{ pageSize: 4, size: "small" }}
            scroll={{ y: 200 }}
            style={{ borderRadius: 8, border: "1px solid #f0f0f0" }}
          />
        </div>
      </div>
    </Modal>
  );
};

export default ExportReportModal;
