import React, { useState } from "react";
import {
  Modal,
  Upload,
  Button,
  Table,
  Tag,
  Space,
  message,
  Statistic,
  Row,
  Col,
  Alert,
  Typography,
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import type { UploadProps, UploadFile } from "antd";
import type { ColumnsType } from "antd/es/table";
import { authenticatedFetch } from "../../services/sessionService";

const { Text } = Typography;

export interface PreviewRow {
  row_number?: number;
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  sale_price?: number;
  cost_price?: number;
  stock_available?: number;
  action_type: "CREATE" | "UPDATE" | "ERROR";
  error_message?: string;
  is_new_category?: boolean;
  category_status?: "NEW" | "EXISTING";
  category_note?: string;
}

export interface PreviewSummary {
  total: number;
  create_count: number;
  update_count: number;
  error_count: number;
}

export interface ProductImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ProductImportModal: React.FC<ProductImportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Reset toàn bộ state khi đóng/mở lại modal
  const handleReset = () => {
    setFileList([]);
    setPreviewData([]);
    setSummary(null);
    setSessionId(null);
    setUploading(false);
    setCommitting(false);
    setDownloadingTemplate(false);
  };

  const handleModalClose = () => {
    handleReset();
    onClose();
  };

  // 1. Tải file mẫu Excel
  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
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
    } finally {
      setDownloadingTemplate(false);
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
    const rawFile = (fileList[0].originFileObj as File) || (fileList[0] as unknown as File);
    formData.append("file", rawFile);

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
        total: result.total ?? rows.length,
        create_count:
          result.create_count ??
          rows.filter((r) => r.action_type === "CREATE").length,
        update_count:
          result.update_count ??
          rows.filter((r) => r.action_type === "UPDATE").length,
        error_count:
          result.error_count ??
          rows.filter((r) => r.action_type === "ERROR").length,
      });
      setSessionId(result.session_id || result.batch_id || null);
      message.success(`Đã đọc và phân tích file thành công (${rows.length} dòng)`);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi đọc file Excel");
    } finally {
      setUploading(false);
    }
  };

  // 3. Commit dữ liệu vào CSDL
  const handleCommit = async () => {
    const validItems = previewData.filter(
      (item) => item.action_type !== "ERROR",
    );

    if (validItems.length === 0) {
      message.warning("Không có dòng dữ liệu hợp lệ nào để nhập!");
      return;
    }

    setCommitting(true);
    try {
      const payload: any = {
        session_id: sessionId,
        items: validItems,
      };

      const res = await authenticatedFetch("/api/v1/products/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || "Lưu dữ liệu thất bại");

      message.success(
        result.message || `Đã nhập thành công ${validItems.length} sản phẩm vào hệ thống.`,
      );
      handleReset();
      onSuccess();
    } catch (err: any) {
      message.error(err.message || "Lỗi khi chốt nhập danh mục sản phẩm");
    } finally {
      setCommitting(false);
    }
  };

  const uploadProps: UploadProps = {
    onRemove: () => {
      setFileList([]);
      setPreviewData([]);
      setSummary(null);
      setSessionId(null);
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
      setPreviewData([]);
      setSummary(null);
      return false; // Ngăn chặn tự động upload
    },
    fileList,
    maxCount: 1,
  };

  const columns: ColumnsType<PreviewRow> = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 70,
      align: "center",
      render: (val: number, _: any, idx: number) => (
        <span style={{ color: "#64748b", fontWeight: 500 }}>{val || idx + 1}</span>
      ),
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 150,
      render: (sku: string) => (
        <Tag color="blue" style={{ fontWeight: 600 }}>
          {sku || "—"}
        </Tag>
      ),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      render: (name: string) =>
        name ? (
          <span style={{ fontWeight: 500, color: "#1e293b" }}>{name}</span>
        ) : (
          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Trống)</span>
        ),
    },
    {
      title: "Nhóm hàng",
      dataIndex: "category",
      key: "category",
      width: 170,
      render: (category?: string, record?: PreviewRow) => {
        if (!category) return <span style={{ color: "#94a3b8" }}>—</span>;
        const isNew = record?.is_new_category || record?.category_status === "NEW";
        return (
          <div>
            <Tag color={isNew ? "orange" : "purple"} style={{ fontWeight: 500 }}>
              {category}
            </Tag>
            {isNew && (
              <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>
                Danh mục mới (sẽ được tự động tạo)
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: "ĐVT",
      dataIndex: "unit",
      key: "unit",
      width: 80,
      align: "center",
      render: (unit?: string) => <Tag>{unit || "—"}</Tag>,
    },
    {
      title: "Giá bán",
      dataIndex: "sale_price",
      key: "sale_price",
      width: 120,
      align: "right",
      render: (val?: number) =>
        val ? (
          <span style={{ fontWeight: 600, color: "#0f766e" }}>
            {val.toLocaleString("vi-VN")} ₫
          </span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        ),
    },
    {
      title: "Phân loại xử lý",
      dataIndex: "action_type",
      key: "action_type",
      width: 220,
      render: (action: string, record: PreviewRow) => {
        if (action === "CREATE") {
          return (
            <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 500 }}>
              Tạo mới SKU
            </Tag>
          );
        }
        if (action === "UPDATE") {
          return (
            <Tag color="blue" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 500 }}>
              Cập nhật SKU cũ
            </Tag>
          );
        }
        return (
          <Tag color="red" icon={<CloseCircleOutlined />} style={{ fontWeight: 500 }}>
            Lỗi: {record.error_message || "Dữ liệu không hợp lệ"}
          </Tag>
        );
      },
    },
  ];

  const validCount = summary ? summary.create_count + summary.update_count : 0;

  return (
    <Modal
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileExcelOutlined style={{ color: "#16a34a", fontSize: 22 }} />
          <span style={{ fontSize: 17, fontWeight: 600, color: "#0f172a" }}>
            Nhập danh mục sản phẩm từ Excel
          </span>
        </div>
      }
      open={open}
      onCancel={handleModalClose}
      width={980}
      destroyOnClose
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            width: "100%",
          }}
        >
          <div>
            {summary && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                Hợp lệ: <strong style={{ color: "#16a34a" }}>{validCount}</strong> dòng
                {summary.error_count > 0 && (
                  <> · Bỏ qua: <strong style={{ color: "#dc2626" }}>{summary.error_count}</strong> dòng lỗi</>
                )}
              </Text>
            )}
          </div>
          <Space>
            <Button onClick={handleModalClose} disabled={committing}>
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleCommit}
              loading={committing}
              disabled={!summary || validCount === 0}
              style={{
                backgroundColor: validCount > 0 ? "#16a34a" : undefined,
                borderColor: validCount > 0 ? "#16a34a" : undefined,
              }}
            >
              Nhập dữ liệu {validCount > 0 ? `(${validCount} sản phẩm)` : ""}
            </Button>
          </Space>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
        {/* Khối hướng dẫn và tải mẫu */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
          }}
        >
          <div>
            <Text strong style={{ color: "#334155" }}>
              Hướng dẫn nhập dữ liệu:
            </Text>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
              Tải file mẫu, điền các cột Mã SKU, Tên, ĐVT, Giá bán... và tải lên để hệ thống kiểm tra trước.
            </div>
          </div>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
            loading={downloadingTemplate}
            style={{ borderRadius: 6 }}
          >
            Tải file mẫu Excel
          </Button>
        </div>

        {/* Khối chọn file và nút xem trước */}
        <div
          style={{
            padding: "16px",
            backgroundColor: "#ffffff",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 260 }}>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>Chọn file Excel (.xlsx, .xls)</Button>
            </Upload>
          </div>

          <Button
            type="primary"
            icon={<EyeOutlined />}
            onClick={handlePreview}
            loading={uploading}
            disabled={fileList.length === 0}
            style={{ borderRadius: 6 }}
          >
            Đọc & Xem trước
          </Button>
        </div>

        {/* Thống kê kết quả phân tích */}
        {summary && (
          <div>
            <Row gutter={12}>
              <Col span={6}>
                <div
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#64748b" }}>Tổng số dòng</span>}
                    value={summary.total}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}
                  />
                </div>
              </Col>
              <Col span={6}>
                <div
                  style={{
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#166534" }}>Sẽ tạo mới</span>}
                    value={summary.create_count}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}
                    prefix={<CheckCircleOutlined />}
                  />
                </div>
              </Col>
              <Col span={6}>
                <div
                  style={{
                    backgroundColor: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#1e40af" }}>Sẽ cập nhật</span>}
                    value={summary.update_count}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: "#2563eb" }}
                    prefix={<ExclamationCircleOutlined />}
                  />
                </div>
              </Col>
              <Col span={6}>
                <div
                  style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#991b1b" }}>Dòng bị lỗi</span>}
                    value={summary.error_count}
                    valueStyle={{ fontSize: 20, fontWeight: 700, color: "#dc2626" }}
                    prefix={<CloseCircleOutlined />}
                  />
                </div>
              </Col>
            </Row>

            {summary.error_count > 0 && (
              <Alert
                style={{ marginTop: 12 }}
                message={
                  <span>
                    Có <strong>{summary.error_count}</strong> dòng bị lỗi định dạng hoặc dữ liệu không hợp lệ. Hệ thống sẽ bỏ qua các dòng lỗi này khi lưu.
                  </span>
                }
                type="warning"
                showIcon
              />
            )}
          </div>
        )}

        {/* Bảng xem trước dữ liệu */}
        {previewData.length > 0 && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                padding: "10px 16px",
                backgroundColor: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text strong style={{ color: "#334155" }}>
                Bảng xem trước dữ liệu ({previewData.length} dòng)
              </Text>
            </div>
            <Table
              dataSource={previewData}
              columns={columns}
              rowKey={(r, idx) => r.sku || String(idx)}
              pagination={{ pageSize: 5, showSizeChanger: true, pageSizeOptions: ["5", "10", "20"] }}
              size="small"
              scroll={{ x: 800 }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ProductImportModal;
