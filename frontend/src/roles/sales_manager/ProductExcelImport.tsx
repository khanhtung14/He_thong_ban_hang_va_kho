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
import { authenticatedFetch } from "../../session";

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

  // 1. Tải file Excel mẫu
  const handleDownloadTemplate = async () => {
    try {
      const res = await authenticatedFetch("/api/v1/products/import/template");
      if (!res.ok) throw new Error("Không thể tải file mẫu");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mau_nhap_san_pham.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      message.success("Đã tải xuống file mẫu thành công");
    } catch (err: any) {
      message.error(err.message || "Lỗi khi tải file mẫu");
    }
  };

  // 2. Gửi file lên API Preview
  const handlePreview = async () => {
    if (fileList.length === 0) {
      message.warning("Vui lòng chọn 1 file Excel trước");
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
        throw new Error(result.detail || "Không thể phân tích dữ liệu file");
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
      message.success("Đã đọc và phân tích file thành công");
    } catch (err: any) {
      message.error(err.message || "Lỗi khi đọc file");
    } finally {
      setUploading(false);
    }
  };

  // 3. Commit dữ liệu vào CSDL
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
      if (!res.ok) throw new Error(result.detail || "Lưu dữ liệu thất bại");

      message.success(
        result.message || "Đã lưu danh mục sản phẩm vào hệ thống",
      );
      setFileList([]);
      setPreviewData([]);
      setSummary(null);
      setSessionId(null);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi chốt nhập hàng loạt");
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
        message.error("Chỉ chấp nhận file định dạng Excel (.xlsx, .xls)");
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      return false; // Ngăn chặn tự động upload
    },
    fileList,
    maxCount: 1,
  };

  const columns = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 70,
      render: (val: number, _: any, idx: number) => val || idx + 1,
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 140,
      render: (sku: string) => (
        <strong style={{ color: "#1d4ed8" }}>{sku || "—"}</strong>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      render: (name: string) =>
        name || <span style={{ color: "#94a3b8" }}>(Trống)</span>,
    },
    {
      title: "Đơn vị tính",
      dataIndex: "unit",
      key: "unit",
      width: 110,
      render: (unit?: string) => <Tag>{unit || "—"}</Tag>,
    },
    {
      title: "Giá bán",
      dataIndex: "sale_price",
      key: "sale_price",
      width: 130,
      render: (val?: number) =>
        val ? `${val.toLocaleString("vi-VN")} ₫` : "—",
    },
    {
      title: "Phân loại xử lý",
      dataIndex: "action_type",
      key: "action_type",
      width: 220,
      render: (action: string, record: PreviewRow) => {
        if (action === "CREATE") {
          return (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              Tạo mới SKU
            </Tag>
          );
        }
        if (action === "UPDATE") {
          return (
            <Tag color="blue" icon={<ExclamationCircleOutlined />}>
              Cập nhật SKU cũ
            </Tag>
          );
        }
        return (
          <Tag color="red" icon={<CloseCircleOutlined />}>
            Lỗi: {record.error_message || "Dữ liệu không hợp lệ"}
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
            <span>Nhập danh mục sản phẩm từ file Excel</span>
          </div>
        }
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            Tải file mẫu Excel
          </Button>
        }
      >
        <Alert
          message="Hướng dẫn tải lên"
          description="Hệ thống hỗ trợ tải lên danh sách hàng nghìn sản phẩm. Nếu mã SKU đã tồn tại, thông tin sẽ được cập nhật thay vì tạo trùng. Các dòng bị lỗi sẽ được hiển thị chi tiết để bạn kiểm tra trước khi lưu."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />

        <Space size="middle">
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />}>Chọn file Excel</Button>
          </Upload>
          <Button
            type="primary"
            onClick={handlePreview}
            loading={uploading}
            disabled={fileList.length === 0}
          >
            Đọc & Xem trước
          </Button>
        </Space>
      </Card>

      {summary && (
        <Card>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="Tổng số dòng" value={summary.total} />
            </Col>
            <Col span={6}>
              <Statistic
                title="Sẽ tạo mới"
                value={summary.create_count}
                valueStyle={{ color: "#16a34a" }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Sẽ cập nhật"
                value={summary.update_count}
                valueStyle={{ color: "#2563eb" }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="Dòng bị lỗi"
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
              Xác nhận nhập kho ({summary.create_count + summary.update_count}{" "}
              sản phẩm)
            </Button>
          </div>
        </Card>
      )}

      {previewData.length > 0 && (
        <Card title="Dữ liệu xem trước (Preview)">
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
