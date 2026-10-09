import React, { useState } from "react";
import {
  Card,
  Upload,
  Button,
  Table,
  Tag,
  Space,
  Alert,
  message,
  Statistic,
  Row,
  Col,
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";
import { authenticatedFetch } from "services/sessionService";

interface PreviewRow {
  row_number?: number;
  sku: string;
  name: string;
  unit?: string;
  sale_price?: number;
  action_type: "CREATE" | "UPDATE" | "ERROR";
  error_message?: string;
}

interface PreviewSummary {
  total: number;
  create_count: number;
  update_count: number;
  error_count: number;
}

export const ProductExcelImport: React.FC = () => {
  const [fileList, setFileList] = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 1. Táº£i file Excel máº«u
  const handleDownloadTemplate = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/products/import/template");
      if (!res.ok) throw new Error("KhÃ´ng thá»ƒ táº£i file máº«u");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mau_nhap_san_pham.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success("ÄÃ£ táº£i xuá»‘ng file máº«u thÃ nh cÃ´ng");
    } catch (err: any) {
      message.error(err.message || "Lá»—i khi táº£i file máº«u");
    }
  };

  // 2. Gá»­i file lÃªn API Preview
  const handlePreview = async () => {
    if (fileList.length === 0) {
      message.warning("Vui lÃ²ng chá»n 1 file Excel trÆ°á»›c");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", fileList[0]);

    try {
      const res = await authenticatedFetch("/api/v1/products/import/preview", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.detail || "KhÃ´ng thá»ƒ phÃ¢n tÃ­ch dá»¯ liá»‡u file");
      }

      const rows: PreviewRow[] = result.items || result.rows || [];
      setPreviewData(rows);
      setSummary({
        total: result.total || rows.length,
        create_count:
          result.create_count ||
          rows.filter((r) => r.action_type === "CREATE").length,
        update_count:
          result.update_count ||
          rows.filter((r) => r.action_type === "UPDATE").length,
        error_count:
          result.error_count ||
          rows.filter((r) => r.action_type === "ERROR").length,
      });
      setSessionId(result.session_id || result.batch_id || null);
      message.success("ÄÃ£ Ä‘á»c vÃ  phÃ¢n tÃ­ch file thÃ nh cÃ´ng");
    } catch (err: any) {
      message.error(err.message || "Lá»—i khi Ä‘á»c file");
    } finally {
      setUploading(false);
    }
  };

  // 3. Commit dá»¯ liá»‡u vÃ o CSDL
  const handleCommit = async () => {
    setCommitting(true);
    try {
      const payload: any = { session_id: sessionId };
      if (!sessionId) {
        payload.items = previewData.filter(
          (item) => item.action_type !== "ERROR",
        );
      }

      const res = await authenticatedFetch("/api/v1/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "LÆ°u dá»¯ liá»‡u tháº¥t báº¡i");

      message.success(
        result.message || "ÄÃ£ lÆ°u danh má»¥c sáº£n pháº©m vÃ o há»‡ thá»‘ng",
      );
      setFileList([]);
      setPreviewData([]);
      setSummary(null);
      setSessionId(null);
    } catch (err: any) {
      message.error(err.message || "Lá»—i khi chá»‘t nháº­p hÃ ng loáº¡t");
    } finally {
      setCommitting(false);
    }
  };

  const uploadProps: UploadProps = {
    onRemove: () => {
      setFileList([]);
      setPreviewData([]);
      setSummary(null);
    },
    beforeUpload: (file) => {
      const isValidExcel =
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls") ||
        file.type.includes("spreadsheetml") ||
        file.type.includes("excel");

      if (!isValidExcel) {
        message.error("Chá»‰ cháº¥p nháº­n file Ä‘á»‹nh dáº¡ng Excel (.xlsx, .xls)");
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false; // NgÄƒn cháº·n tá»± Ä‘á»™ng upload
    },
    fileList,
    maxCount: 1,
  };

  const columns = [
    {
      title: "DÃ²ng",
      dataIndex: "row_number",
      key: "row_number",
      width: 70,
      render: (val: number, _: any, idx: number) => val || idx + 1,
    },
    {
      title: "MÃ£ SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (sku: string) => (
        <strong style={{ color: "#1d4ed8" }}>{sku || "â€”"}</strong>
      ),
    },
    {
      title: "TÃªn sáº£n pháº©m",
      dataIndex: "name",
      key: "name",
      render: (name: string) =>
        name || <span style={{ color: "#94a3b8" }}>(Trá»‘ng)</span>,
    },
    {
      title: "ÄÆ¡n vá»‹ tÃ­nh",
      dataIndex: "unit",
      key: "unit",
      width: 110,
      render: (unit?: string) => <Tag>{unit || "â€”"}</Tag>,
    },
    {
      title: "GiÃ¡ bÃ¡n",
      dataIndex: "sale_price",
      key: "sale_price",
      width: 130,
      render: (val?: number) =>
        val ? `${val.toLocaleString("vi-VN")} â‚«` : "â€”",
    },
    {
      title: "PhÃ¢n loáº¡i xá»­ lÃ½",
      dataIndex: "action_type",
      key: "action_type",
      width: 220,
      render: (action: string, record: PreviewRow) => {
        if (action === "CREATE") {
          return (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              Táº¡o má»›i SKU
            </Tag>
          );
        }
        if (action === "UPDATE") {
          return (
            <Tag color="blue" icon={<ExclamationCircleOutlined />}>
              Cáº­p nháº­t SKU cÅ©
            </Tag>
          );
        }
        return (
          <Tag color="red" icon={<CloseCircleOutlined />}>
            Lá»—i: {record.error_message || "Dá»¯ liá»‡u khÃ´ng há»£p lá»‡"}
          </Tag>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileExcelOutlined style={{ color: "#16a34a", fontSize: 22 }} />
            <span>Nháº­p danh má»¥c sáº£n pháº©m tá»« file Excel</span>
          </div>
        }
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            Táº£i file máº«u Excel
          </Button>
        }
      >
        <Alert
          message="HÆ°á»›ng dáº«n táº£i lÃªn"
          description="Há»‡ thá»‘ng há»— trá»£ táº£i lÃªn danh sÃ¡ch hÃ ng nghÃ¬n sáº£n pháº©m. Náº¿u mÃ£ SKU Ä‘Ã£ tá»“n táº¡i, thÃ´ng tin sáº½ Ä‘Æ°á»£c cáº­p nháº­t thay vÃ¬ táº¡o trÃ¹ng. CÃ¡c dÃ²ng bá»‹ lá»—i sáº½ Ä‘Æ°á»£c hiá»ƒn thá»‹ chi tiáº¿t Ä‘á»ƒ báº¡n kiá»ƒm tra trÆ°á»›c khi lÆ°u."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />

        <Space size="middle">
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />}>Chá»n file Excel</Button>
          </Upload>
          <Button
            type="primary"
            onClick={handlePreview}
            loading={uploading}
            disabled={fileList.length === 0}
          >
            Äá»c & Xem trÆ°á»›c
          </Button>
        </Space>
      </Card>

      {summary && (
        <Card>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="Tá»•ng sá»‘ dÃ²ng" value={summary.total} />
            </Col>
            <Col span={6}>
              <Statistic
                title="Sáº½ táº¡o má»›i"
                value={summary.create_count}
                valueStyle={{ color: "#16a34a" }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Sáº½ cáº­p nháº­t"
                value={summary.update_count}
                valueStyle={{ color: "#2563eb" }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="DÃ²ng bá»‹ lá»—i"
                value={summary.error_count}
                valueStyle={{ color: "#dc2626" }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
          </Row>

          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <Button
              type="primary"
              size="large"
              style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
              loading={committing}
              disabled={summary.create_count + summary.update_count === 0}
              onClick={handleCommit}
            >
              XÃ¡c nháº­n nháº­p kho ({summary.create_count + summary.update_count}{" "}
              sáº£n pháº©m)
            </Button>
          </div>
        </Card>
      )}

      {previewData.length > 0 && (
        <Card title="Dá»¯ liá»‡u xem trÆ°á»›c (Preview)">
          <Table
            dataSource={previewData}
            columns={columns}
            rowKey={(r, idx) => r.sku || String(idx)}
            pagination={{ pageSize: 10 }}
            bordered
            size="middle"
          />
        </Card>
      )}
    </div>
  );
};

export default ProductExcelImport;
