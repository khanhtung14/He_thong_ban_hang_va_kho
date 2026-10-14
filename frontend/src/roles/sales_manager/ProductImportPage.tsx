import React, { useState } from "react";
import {
  Card,
  Upload,
  Button,
  Table,
  Tag,
  Space,
  message,
  Typography,
  Row,
  Col,
  Alert,
  Statistic,
} from "antd";
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  InboxOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  FileExcelOutlined,
  SaveOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import type { UploadProps, UploadFile } from "antd";
import type { ColumnsType } from "antd/es/table";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text, Paragraph } = Typography;

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

export interface ProductImportPageProps {
  onBack?: () => void;
}

export const ProductImportPage: React.FC<ProductImportPageProps> = ({ onBack }) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, "", "/manager/products");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
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
      message.success("Đã tải xuống file mẫu Excel thành công!");
    } catch (err: any) {
      message.error(err.message || "Lỗi khi tải file mẫu");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // 2. Gửi file lên API Preview để đọc & kiểm tra hợp lệ
  const handlePreview = async () => {
    if (fileList.length === 0) {
      message.warning("Vui lòng chọn hoặc kéo thả 1 file Excel trước!");
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
      message.success(`Đã đọc và phân tích file thành công (${rows.length} dòng).`);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi đọc file Excel");
    } finally {
      setUploading(false);
    }
  };

  // 3. Chốt lưu dữ liệu vào CSDL
  const handleCommit = async () => {
    const validItems = previewData.filter((item) => item.action_type !== "ERROR");

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
        result.message || `Đã nhập thành công ${validItems.length} sản phẩm vào hệ thống!`
      );
      // Chuyển về trang danh sách sản phẩm sau khi nhập thành công
      setTimeout(() => {
        handleBack();
      }, 800);
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
      return false; // Chặn tự động upload
    },
    fileList,
    maxCount: 1,
  };

  const validCount = summary ? summary.create_count + summary.update_count : 0;

  const columns: ColumnsType<PreviewRow> = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 65,
      align: "center",
      render: (val: number, _: any, idx: number) => (
        <span style={{ color: "#64748b", fontWeight: 600 }}>{val || idx + 1}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "action_type",
      key: "action_type",
      width: 170,
      render: (action: string) => {
        if (action === "CREATE") {
          return (
            <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 500 }}>
              Hợp lệ (Tạo mới)
            </Tag>
          );
        }
        if (action === "UPDATE") {
          return (
            <Tag color="blue" icon={<ExclamationCircleOutlined />} style={{ fontWeight: 500 }}>
              Hợp lệ (Cập nhật)
            </Tag>
          );
        }
        return (
          <Tag color="red" icon={<CloseCircleOutlined />} style={{ fontWeight: 500 }}>
            Lỗi dữ liệu
          </Tag>
        );
      },
    },
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      width: 130,
      render: (sku: string) => (
        <Tag color="purple" style={{ fontFamily: "monospace", fontWeight: 700 }}>
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
          <span style={{ fontWeight: 600, color: "#0f172a" }}>{name}</span>
        ) : (
          <span style={{ color: "#94a3b8", fontStyle: "italic" }}>(Trống)</span>
        ),
    },
    {
      title: "Danh mục",
      dataIndex: "category",
      key: "category",
      width: 180,
      render: (category?: string, record?: PreviewRow) => {
        if (!category) return <span style={{ color: "#94a3b8" }}>—</span>;
        const isNew = record?.is_new_category || record?.category_status === "NEW";
        return (
          <div>
            <Tag color={isNew ? "orange" : "blue"} style={{ fontWeight: 500 }}>
              {category}
            </Tag>
            {isNew && (
              <div style={{ fontSize: 11, color: "#d97706", marginTop: 2 }}>
                (Tự động tạo mới)
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
      render: (unit?: string) => <Tag color="default">{unit || "—"}</Tag>,
    },
    {
      title: "Giá bán",
      dataIndex: "sale_price",
      key: "sale_price",
      width: 120,
      align: "right",
      render: (val?: number) =>
        val !== undefined && val !== null ? (
          <span style={{ fontWeight: 600, color: "#059669" }}>
            {val.toLocaleString("vi-VN")} ₫
          </span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        ),
    },
    {
      title: "Giá vốn",
      dataIndex: "cost_price",
      key: "cost_price",
      width: 120,
      align: "right",
      render: (val?: number) =>
        val !== undefined && val !== null ? (
          <span>{val.toLocaleString("vi-VN")} ₫</span>
        ) : (
          <span style={{ color: "#94a3b8" }}>—</span>
        ),
    },
    {
      title: "Lỗi chi tiết",
      dataIndex: "error_message",
      key: "error_message",
      render: (err?: string) =>
        err ? (
          <span style={{ color: "#dc2626", fontWeight: 500, fontSize: 12 }}>
            {err}
          </span>
        ) : (
          <span style={{ color: "#16a34a", fontSize: 12 }}>—</span>
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Header chuẩn hệ thống */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Button
            type="link"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ paddingLeft: 0, fontSize: 14, color: "#2563eb", fontWeight: 500 }}
          >
            Quay lại danh sách sản phẩm
          </Button>
          <Title level={3} style={{ margin: "4px 0 2px", color: "#0f172a", fontWeight: 700 }}>
            Nhập danh mục sản phẩm từ Excel
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tải file mẫu, kiểm tra tính hợp lệ và cập nhật dữ liệu sản phẩm hàng loạt vào hệ thống.
          </Text>
        </div>

        <Space>
          <Button onClick={handleBack}>Hủy bỏ</Button>
          {previewData.length > 0 && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleCommit}
              loading={committing}
              disabled={validCount === 0}
              style={{
                backgroundColor: validCount > 0 ? "#16a34a" : undefined,
                borderColor: validCount > 0 ? "#16a34a" : undefined,
              }}
            >
              Xác nhận nhập dữ liệu ({validCount} SP)
            </Button>
          )}
        </Space>
      </div>

      {/* 2. Khu vực thao tác (Card phía trên) */}
      <Card
        bordered={false}
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Row gutter={[24, 24]}>
          {/* Cột trái: Bước 1 - Tải file mẫu */}
          <Col xs={24} md={8}>
            <div
              style={{
                backgroundColor: "#f8fafc",
                borderRadius: 10,
                padding: 20,
                border: "1px solid #e2e8f0",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Tag color="blue" style={{ fontWeight: 700, borderRadius: 10 }}>
                    Bước 1
                  </Tag>
                  <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
                    Tải file mẫu Excel
                  </Text>
                </div>
                <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
                  File mẫu chứa định dạng chuẩn các cột: Mã SKU, Tên sản phẩm, ĐVT, Giá bán, Giá vốn, Tồn kho tối thiểu, Danh mục.
                </Paragraph>
              </div>

              <Button
                icon={<DownloadOutlined />}
                onClick={handleDownloadTemplate}
                loading={downloadingTemplate}
                block
                style={{
                  borderColor: "#2563eb",
                  color: "#2563eb",
                  fontWeight: 500,
                }}
              >
                Tải file mẫu Excel (.xlsx)
              </Button>
            </div>
          </Col>

          {/* Cột giữa & phải: Bước 2 & Bước 3 - Upload & Đọc dữ liệu */}
          <Col xs={24} md={16}>
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: 10,
                padding: 20,
                border: "1px solid #e2e8f0",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Tag color="purple" style={{ fontWeight: 700, borderRadius: 10 }}>
                    Bước 2 & 3
                  </Tag>
                  <Text strong style={{ fontSize: 15, color: "#0f172a" }}>
                    Chọn file dữ liệu & Phân tích
                  </Text>
                </div>

                <Upload.Dragger {...uploadProps} style={{ padding: "16px 0", borderRadius: 8 }}>
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                    <InboxOutlined style={{ color: "#2563eb", fontSize: 36 }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 600 }}>
                    Kéo & thả file Excel vào đây, hoặc nhấp để duyệt file
                  </p>
                  <p className="ant-upload-hint" style={{ fontSize: 12, color: "#64748b" }}>
                    Hỗ trợ file định dạng .xlsx, .xls. Dung lượng tối đa 10MB.
                  </p>
                </Upload.Dragger>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                {fileList.length > 0 && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setFileList([]);
                      setPreviewData([]);
                      setSummary(null);
                      setSessionId(null);
                    }}
                  >
                    Xóa file
                  </Button>
                )}
                <Button
                  type="primary"
                  icon={<EyeOutlined />}
                  onClick={handlePreview}
                  loading={uploading}
                  disabled={fileList.length === 0}
                  style={{
                    backgroundColor: "#2563eb",
                    minWidth: 180,
                    fontWeight: 600,
                  }}
                >
                  Đọc & Xem trước dữ liệu
                </Button>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* 3. Khu vực xem trước dữ liệu (Card/Table phía dưới) */}
      {previewData.length > 0 && (
        <Card
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileExcelOutlined style={{ color: "#16a34a" }} />
              <span style={{ fontWeight: 600 }}>Kết quả phân tích & Xem trước dữ liệu</span>
            </div>
          }
          extra={
            summary && (
              <Space size={8}>
                <Tag color="default" style={{ padding: "3px 10px", fontSize: 13 }}>
                  Tổng: <strong>{summary.total}</strong> dòng
                </Tag>
                <Tag color="success" style={{ padding: "3px 10px", fontSize: 13 }}>
                  Hợp lệ: <strong>{validCount}</strong> dòng
                </Tag>
                {summary.error_count > 0 && (
                  <Tag color="error" style={{ padding: "3px 10px", fontSize: 13 }}>
                    Lỗi: <strong>{summary.error_count}</strong> dòng
                  </Tag>
                )}
              </Space>
            )
          }
          bordered={false}
          style={{
            borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* Hộp tóm tắt thống kê */}
          {summary && (
            <Row gutter={16} style={{ marginBottom: 20 }}>
              <Col xs={12} sm={6}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#64748b" }}>Tổng số dòng</span>}
                    value={summary.total}
                    valueStyle={{ fontWeight: 700, fontSize: 20 }}
                  />
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#16a34a" }}>Dòng hợp lệ (Sẽ tạo mới)</span>}
                    value={summary.create_count}
                    valueStyle={{ fontWeight: 700, fontSize: 20, color: "#16a34a" }}
                    prefix={<CheckCircleOutlined />}
                  />
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    backgroundColor: "#eff6ff",
                    border: "1px solid #bfdbfe",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: "#2563eb" }}>Dòng hợp lệ (Cập nhật)</span>}
                    value={summary.update_count}
                    valueStyle={{ fontWeight: 700, fontSize: 20, color: "#2563eb" }}
                    prefix={<ExclamationCircleOutlined />}
                  />
                </div>
              </Col>
              <Col xs={12} sm={6}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    backgroundColor: summary.error_count > 0 ? "#fef2f2" : "#f8fafc",
                    border: summary.error_count > 0 ? "1px solid #fecaca" : "1px solid #e2e8f0",
                  }}
                >
                  <Statistic
                    title={<span style={{ fontSize: 12, color: summary.error_count > 0 ? "#dc2626" : "#64748b" }}>Dòng lỗi</span>}
                    value={summary.error_count}
                    valueStyle={{
                      fontWeight: 700,
                      fontSize: 20,
                      color: summary.error_count > 0 ? "#dc2626" : "#64748b",
                    }}
                    prefix={<CloseCircleOutlined />}
                  />
                </div>
              </Col>
            </Row>
          )}

          {summary && summary.error_count > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`File có ${summary.error_count} dòng dữ liệu không hợp lệ. Khi xác nhận, hệ thống sẽ bỏ qua các dòng lỗi và chỉ nhập các dòng hợp lệ.`}
            />
          )}

          {/* Bảng Preview dữ liệu */}
          <Table
            dataSource={previewData}
            columns={columns}
            rowKey={(r, idx) => r.sku || String(idx)}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            bordered
            size="middle"
            scroll={{ x: 1000 }}
          />

          {/* Nút hành động phía dưới bảng */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <Button onClick={handleBack}>Hủy bỏ</Button>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              onClick={handleCommit}
              loading={committing}
              disabled={validCount === 0}
              style={{
                backgroundColor: validCount > 0 ? "#16a34a" : undefined,
                borderColor: validCount > 0 ? "#16a34a" : undefined,
                fontWeight: 600,
                minWidth: 220,
              }}
            >
              Xác nhận nhập dữ liệu ({validCount} sản phẩm)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ProductImportPage;
