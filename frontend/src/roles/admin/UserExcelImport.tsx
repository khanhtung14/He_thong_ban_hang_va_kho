import React, { useState } from "react";
import {
  Card,
  Upload,
  Button,
  Table,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  Typography,
  message,
  Alert,
} from "antd";
import {
  DownloadOutlined,
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileExcelOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import { authenticatedFetch } from "../../services/sessionService";

const { Text, Title } = Typography;

interface PreviewRow {
  row_number: number;
  data: {
    username: string;
    full_name: string;
    email: string;
    role: string;
    phone?: string;
    warehouse?: string;
    region?: string;
  };
  valid: boolean;
  errors: string[];
}

interface ImportReportItem {
  row_number: number;
  status: "created" | "skipped";
  email_sent?: boolean;
  message?: string;
  errors: string[];
}

export const UserExcelImport: React.FC = () => {
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const [previewData, setPreviewData] = useState<{
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    rows: PreviewRow[];
  } | null>(null);

  const [importResult, setImportResult] = useState<{
    total_rows: number;
    created_count: number;
    skipped_count: number;
    report: ImportReportItem[];
  } | null>(null);

  // 1. Tải file mẫu Excel
  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      let res = await authenticatedFetch("/api/v1/users/import/template");
      if (!res.ok) {
        res = await authenticatedFetch("/users/import/template");
      }
      if (!res.ok) throw new Error("Không thể tải file mẫu");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mau_nhap_nguoi_dung.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success("Đã tải xuống file mẫu thành công");
    } catch {
      message.error("Lỗi khi tải file mẫu từ máy chủ.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // 2. Gửi file lên API Preview
  const handlePreview = async () => {
    if (!selectedFile) {
      message.warning("Vui lòng chọn 1 file Excel trước");
      return;
    }

    setUploading(true);
    setImportResult(null);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      let res = await authenticatedFetch("/api/v1/users/import/preview", {
        method: "POST",
        body: formData,
      });
      if (!res.ok && res.status === 404) {
        res = await authenticatedFetch("/users/import/preview", {
          method: "POST",
          body: formData,
        });
      }

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
        message.success(
          `Đã phân tích file thành công: ${data.total_rows} dòng (${data.valid_rows} hợp lệ, ${data.error_rows} lỗi).`
        );
      } else {
        const err = await res.json().catch(() => null);
        message.error(err?.detail?.message || err?.detail || "Lỗi khi phân tích dữ liệu file Excel.");
        setPreviewData(null);
      }
    } catch {
      message.error("Không thể kết nối máy chủ để xem trước file.");
      setPreviewData(null);
    } finally {
      setUploading(false);
    }
  };

  // 3. Commit nhập dữ liệu vào hệ thống
  const handleCommit = async () => {
    if (!selectedFile) {
      message.warning("Vui lòng chọn file Excel trước!");
      return;
    }

    setCommitting(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      let res = await authenticatedFetch("/api/v1/users/import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok && res.status === 404) {
        res = await authenticatedFetch("/users/import", {
          method: "POST",
          body: formData,
        });
      }

      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        message.success(
          `Nhập thành công ${result.created_count} người dùng (bỏ qua ${result.skipped_count} dòng lỗi).`
        );
      } else {
        const err = await res.json().catch(() => null);
        message.error(err?.detail || "Nhập danh sách người dùng thất bại.");
      }
    } catch {
      message.error("Lỗi kết nối khi gửi dữ liệu nhập.");
    } finally {
      setCommitting(false);
    }
  };

  const handleReset = () => {
    setFileList([]);
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
  };

  const uploadProps: UploadProps = {
    onRemove: () => {
      handleReset();
    },
    beforeUpload: (file) => {
      const isXlsx =
        file.name.endsWith(".xlsx") ||
        file.name.endsWith(".xls") ||
        file.type.includes("spreadsheetml") ||
        file.type.includes("excel");

      if (!isXlsx) {
        message.error("Chỉ chấp nhận file định dạng Excel (.xlsx, .xls)!");
        return Upload.LIST_IGNORE;
      }
      setFileList([file]);
      setSelectedFile(file);
      setPreviewData(null);
      setImportResult(null);
      return false; // Ngăn không cho antd tự upload mặc định
    },
    fileList,
    maxCount: 1,
  };

  const previewColumns: ColumnsType<PreviewRow> = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 70,
      render: (r: number) => <strong>#{r}</strong>,
    },
    {
      title: "Tên đăng nhập",
      dataIndex: ["data", "username"],
      key: "username",
      width: 140,
      render: (u: string) => (
        <strong style={{ color: "#1d4ed8", fontFamily: "monospace" }}>
          {u || "(Trống)"}
        </strong>
      ),
    },
    {
      title: "Họ và tên",
      dataIndex: ["data", "full_name"],
      key: "full_name",
      width: 160,
    },
    {
      title: "Email",
      dataIndex: ["data", "email"],
      key: "email",
      width: 180,
    },
    {
      title: "Vai trò",
      dataIndex: ["data", "role"],
      key: "role",
      width: 140,
      render: (role: string) => {
        if (!role) return <Tag color="default">(Trống)</Tag>;
        const roleMeta: Record<string, { label: string; color: string }> = {
          sales: { label: "NV Kinh doanh", color: "blue" },
          sales_rep: { label: "NV Kinh doanh", color: "blue" },
          sales_manager: { label: "QL Kinh doanh", color: "geekblue" },
          warehouse_staff: { label: "NV Kho", color: "orange" },
          warehouse: { label: "NV Kho", color: "orange" },
          warehouse_manager: { label: "QL Kho", color: "volcano" },
          wh_manager: { label: "QL Kho", color: "volcano" },
          accountant: { label: "Kế toán", color: "purple" },
          admin: { label: "Quản trị", color: "magenta" },
          customer: { label: "Đại lý", color: "green" },
          agency: { label: "Đại lý", color: "green" },
        };
        const meta = roleMeta[role.toLowerCase()];
        if (meta) {
          return <Tag color={meta.color}>{meta.label}</Tag>;
        }
        return <Tag color="default">{role}</Tag>;
      },
    },
    {
      title: "Số ĐT",
      dataIndex: ["data", "phone"],
      key: "phone",
      width: 120,
      render: (phone?: string) =>
        phone ? <span>{phone}</span> : <Text type="secondary" italic>—</Text>,
    },
    {
      title: "Kho phụ trách",
      dataIndex: ["data", "warehouse"],
      key: "warehouse",
      width: 140,
      render: (wh: string, record: PreviewRow) => {
        const isWarehouseRole = ["warehouse", "warehouse_staff", "warehouse_manager", "wh_manager"].includes(
          record.data?.role?.toLowerCase() || ""
        );
        if (!wh) {
          return isWarehouseRole ? (
            <Text type="danger" italic style={{ fontWeight: 600 }}>
              (Chưa gán kho)
            </Text>
          ) : (
            <Text type="secondary" italic>—</Text>
          );
        }
        return <Tag color="cyan">{wh}</Tag>;
      },
    },
    {
      title: "Địa bàn",
      dataIndex: ["data", "region"],
      key: "region",
      width: 130,
      render: (rg?: string) =>
        rg ? <Tag color="purple">{rg}</Tag> : <Text type="secondary" italic>—</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "valid",
      key: "valid",
      width: 120,
      render: (valid: boolean) =>
        valid ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Hợp lệ
          </Tag>
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />} style={{ fontWeight: 600 }}>
            Lỗi
          </Tag>
        ),
    },
    {
      title: "Ghi chú / Chi tiết lỗi",
      dataIndex: "errors",
      key: "errors",
      render: (errs: string[]) =>
        errs && errs.length > 0 ? (
          <Space direction="vertical" size={2}>
            {errs.map((e, idx) => (
              <Text type="danger" key={idx} style={{ fontSize: 12, fontWeight: 500 }}>
                • {e}
              </Text>
            ))}
          </Space>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Sẵn sàng nhập
          </Text>
        ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Tiêu đề trang */}
      <div>
        <Title level={3} style={{ margin: 0 }}>
          Nhập danh sách người dùng từ Excel
        </Title>
        <Text type="secondary">
          Thêm hàng loạt tài khoản người dùng, phân quyền và địa bàn/kho phụ trách từ file bảng tính
        </Text>
      </div>

      {/* 2. Thẻ tải file & hướng dẫn */}
      <Card
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FileExcelOutlined style={{ color: "#16a34a", fontSize: 22 }} />
            <span>Tải lên file bảng tính (.xlsx)</span>
          </div>
        }
        extra={
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownloadTemplate}
            loading={downloadingTemplate}
            style={{ borderRadius: 8 }}
          >
            Tải file mẫu Excel
          </Button>
        }
      >
        <Space size="middle" wrap>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} style={{ borderRadius: 8 }}>
              Chọn file Excel
            </Button>
          </Upload>
          <Button
            type="primary"
            onClick={handlePreview}
            loading={uploading}
            disabled={fileList.length === 0}
            style={{ borderRadius: 8 }}
          >
            Đọc & Xem trước dữ liệu
          </Button>
          {fileList.length > 0 && (
            <Button onClick={handleReset} icon={<ReloadOutlined />} style={{ borderRadius: 8 }}>
              Hủy chọn
            </Button>
          )}
        </Space>
      </Card>

      {/* 3. Thẻ thống kê kết quả phân tích (Summary Stats) */}
      {previewData && (
        <Card title="Thống kê dữ liệu phân tích">
          <Row gutter={[16, 16]}>
            <Col xs={12} sm={8}>
              <Statistic title="Tổng số dòng" value={previewData.total_rows} />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Dòng hợp lệ"
                value={previewData.valid_rows}
                valueStyle={{ color: "#16a34a" }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col xs={12} sm={8}>
              <Statistic
                title="Dòng bị lỗi"
                value={previewData.error_rows}
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
              alignItems: "center",
              gap: 12,
            }}
          >
            {previewData.error_rows > 0 && (
              <Text type="warning" style={{ fontSize: 13 }}>
                * Các dòng lỗi sẽ tự động được bỏ qua trong quá trình nhập.
              </Text>
            )}
            <Button
              type="primary"
              size="large"
              style={{
                backgroundColor: "#16a34a",
                borderColor: "#16a34a",
                borderRadius: 8,
              }}
              loading={committing}
              disabled={previewData.valid_rows === 0}
              onClick={handleCommit}
            >
              Xác nhận nhập người dùng ({previewData.valid_rows} tài khoản)
            </Button>
          </div>
        </Card>
      )}

      {/* 4. Kết quả sau khi nhập thành công */}
      {importResult && (
        <Card title="Kết quả thực hiện">
          <Alert
            type="success"
            showIcon
            message={
              <span>
                Đã hoàn tất nhập dữ liệu:{" "}
                <strong>{importResult.created_count}</strong> tài khoản được tạo mới thành công,{" "}
                <strong>{importResult.skipped_count}</strong> dòng bị bỏ qua.
              </span>
            }
            style={{ marginBottom: 16 }}
          />

          {importResult.report && importResult.report.length > 0 && (
            <Table
              dataSource={importResult.report}
              rowKey="row_number"
              pagination={{ pageSize: 10 }}
              bordered
              size="small"
              columns={[
                {
                  title: "Dòng",
                  dataIndex: "row_number",
                  key: "row_number",
                  width: 80,
                  render: (r: number) => <strong>#{r}</strong>,
                },
                {
                  title: "Kết quả",
                  dataIndex: "status",
                  key: "status",
                  width: 140,
                  render: (s: string) =>
                    s === "created" ? (
                      <Tag color="success">Đã tạo</Tag>
                    ) : (
                      <Tag color="error">Bỏ qua</Tag>
                    ),
                },
                {
                  title: "Thông báo chi tiết",
                  dataIndex: "message",
                  key: "message",
                  render: (msg?: string, r?: any) =>
                    msg || (r.errors?.length > 0 ? r.errors.join(", ") : "—"),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* 5. Bảng dữ liệu xem trước (Preview Table) */}
      {previewData && previewData.rows && previewData.rows.length > 0 && (
        <Card
          title={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Dữ liệu xem trước (Preview)</span>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
                Hiển thị {previewData.rows.length} dòng dữ liệu từ file Excel
              </Text>
            </div>
          }
        >
          <Table
            dataSource={previewData.rows}
            columns={previewColumns}
            rowKey="row_number"
            pagination={{ pageSize: 10 }}
            bordered
            size="middle"
            scroll={{ x: 1200 }}
          />
        </Card>
      )}
    </div>
  );
};

export default UserExcelImport;
