import React, { useState } from "react";
import {
  Modal,
  Upload,
  Button,
  Table,
  Tag,
  Space,
  Alert,
  Card,
  Statistic,
  Row,
  Col,
  Typography,
  message,
  Divider,
} from "antd";
import {
  DownloadOutlined,
  InboxOutlined,
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

interface UserExcelImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UserExcelImportModal: React.FC<UserExcelImportModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    rows: PreviewRow[];
  } | null>(null);

  const [importing, setImporting] = useState(false);
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
      a.download = "users_template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      message.success("Đã tải xuống file mẫu users_template.xlsx");
    } catch {
      message.error("Lỗi khi tải file mẫu từ máy chủ.");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  // 2. Gọi API Preview khi chọn file
  const handleProcessPreview = async (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
    setPreviewLoading(true);

    const formData = new FormData();
    formData.append("file", file);

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
          `Đã đọc ${data.total_rows} dòng: ${data.valid_rows} hợp lệ, ${data.error_rows} lỗi.`,
        );
      } else {
        const err = await res.json().catch(() => null);
        message.error(err?.detail?.message || err?.detail || "Lỗi đọc file Excel.");
        setPreviewData(null);
      }
    } catch {
      message.error("Không thể kết nối với máy chủ để xem trước file.");
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Upload Props cho Ant Design Dragger
  const uploadProps: UploadProps = {
    name: "file",
    multiple: false,
    showUploadList: false,
    accept: ".xlsx",
    beforeUpload: (file) => {
      const isXlsx =
        file.name.endsWith(".xlsx") ||
        file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (!isXlsx) {
        message.error("Chỉ chấp nhận tệp định dạng .xlsx!");
        return false;
      }
      handleProcessPreview(file);
      return false; // Chặn antd tự upload mặc định
    },
  };

  // 3. Xác nhận nhập dữ liệu
  const handleConfirmImport = async () => {
    if (!selectedFile) {
      message.warning("Vui lòng chọn file Excel trước!");
      return;
    }
    setImporting(true);
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
          `Nhập thành công ${result.created_count} người dùng (bỏ qua ${result.skipped_count} dòng lỗi).`,
        );
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const err = await res.json().catch(() => null);
        message.error(err?.detail || "Nhập danh sách người dùng thất bại.");
      }
    } catch {
      message.error("Lỗi kết nối khi gửi dữ liệu nhập.");
    } finally {
      setImporting(false);
    }
  };

  // Reset về trạng thái ban đầu
  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setImportResult(null);
  };

  const handleModalClose = () => {
    handleReset();
    onClose();
  };

  // Cột bảng xem trước (Preview Table)
  const previewColumns: ColumnsType<PreviewRow> = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 65,
      render: (r: number) => <strong>#{r}</strong>,
    },
    {
      title: "Tên đăng nhập",
      dataIndex: ["data", "username"],
      key: "username",
      width: 130,
      render: (u: string) => <code>{u || "(Trống)"}</code>,
    },
    {
      title: "Họ và tên",
      dataIndex: ["data", "full_name"],
      key: "full_name",
      width: 150,
    },
    {
      title: "Email",
      dataIndex: ["data", "email"],
      key: "email",
      width: 170,
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
          sales_manager: { label: "QL Kinh doanh", color: "geekblue" },
          warehouse_staff: { label: "NV Kho", color: "orange" },
          warehouse_manager: { label: "QL Kho", color: "volcano" },
          accountant: { label: "Kế toán", color: "purple" },
          admin: { label: "Quản trị", color: "magenta" },
          agency: { label: "Đại lý", color: "green" },
        };
        const meta = roleMeta[role.toLowerCase()];
        if (meta) {
          return <Tag color={meta.color}>{meta.label}</Tag>;
        }
        return <Tag color="error">{role}</Tag>;
      },
    },
    {
      title: "Số ĐT",
      dataIndex: ["data", "phone"],
      key: "phone",
      width: 120,
      render: (phone?: string) =>
        phone ? <span>{phone}</span> : <Text type="secondary" italic>(Trống)</Text>,
    },
    {
      title: "Kho",
      dataIndex: ["data", "warehouse"],
      key: "warehouse",
      width: 140,
      render: (wh: string, record: PreviewRow) => {
        const isWarehouseRole = ["warehouse_staff", "warehouse_manager"].includes(
          record.data?.role?.toLowerCase() || "",
        );
        if (!wh) {
          return isWarehouseRole ? (
            <Text type="danger" italic style={{ fontWeight: 600 }}>
              (Chưa gán kho)
            </Text>
          ) : (
            <Text type="secondary" italic>
              (Trống)
            </Text>
          );
        }
        return <Tag color="cyan">{wh}</Tag>;
      },
    },
    {
      title: "Địa bàn",
      dataIndex: ["data", "region"],
      key: "region",
      width: 120,
      render: (rg?: string) =>
        rg ? <Tag color="purple">{rg}</Tag> : <Text type="secondary" italic>(Trống)</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "valid",
      key: "valid",
      width: 110,
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
      title: "Ghi chú / Lỗi",
      dataIndex: "errors",
      key: "errors",
      width: 250,
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

  // Cột bảng báo cáo kết quả (Import Result Table)
  const reportColumns: ColumnsType<ImportReportItem> = [
    {
      title: "Dòng",
      dataIndex: "row_number",
      key: "row_number",
      width: 80,
      render: (r: number) => <strong>Dòng {r}</strong>,
    },
    {
      title: "Kết quả",
      dataIndex: "status",
      key: "status",
      width: 250,
      render: (st: string, r: ImportReportItem) =>
        st === "created" ? (
          r.email_sent !== false ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              Chờ kích hoạt (Đã gửi email)
            </Tag>
          ) : (
            <Tag color="warning" icon={<CheckCircleOutlined />}>
              Tạo thành công (Chưa gửi mail)
            </Tag>
          )
        ) : (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            Bị bỏ qua
          </Tag>
        ),
    },
    {
      title: "Chi tiết",
      dataIndex: "message",
      key: "message",
      render: (_: any, r: ImportReportItem) =>
        r.status === "created" ? (
          r.email_sent !== false ? (
            <Text type="success">
              {r.message || "Chờ kích hoạt (Đã gửi email)"}
            </Text>
          ) : (
            <Text type="warning">
              {r.message || "Tạo thành công nhưng chưa gửi được mail kích hoạt"}
            </Text>
          )
        ) : (
          <Text type="danger">
            {r.errors?.join("; ") || r.message || "Dữ liệu không hợp lệ"}
          </Text>
        ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={handleModalClose}
      width={1120}
      style={{ top: 24 }}
      styles={{ body: { maxHeight: "80vh", overflowY: "auto", padding: "16px 24px" } }}
      title={
        <Space size={10}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "#ecfdf5",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            <FileExcelOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}>
              Nhập danh sách người dùng từ Excel
            </div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
              Tải file mẫu, kiểm tra định dạng và nhập hàng loạt tài khoản người dùng
            </div>
          </div>
        </Space>
      }
      footer={[
        <Button key="close" onClick={handleModalClose}>
          {importResult ? "Đóng" : "Hủy"}
        </Button>,
        importResult ? (
          <Button
            key="import-again"
            icon={<ReloadOutlined />}
            onClick={handleReset}
          >
            Nhập file khác
          </Button>
        ) : (
          <Button
            key="submit"
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={importing}
            disabled={!previewData || previewData.valid_rows === 0}
            onClick={handleConfirmImport}
            style={{ backgroundColor: "#2563eb", borderRadius: 8 }}
          >
            Xác nhận nhập ({previewData?.valid_rows || 0} dòng hợp lệ)
          </Button>
        ),
      ]}
    >
      {/* ------------------- BƯỚC 1: TẢI FILE MẪU ------------------- */}
      <div style={{ marginTop: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            backgroundColor: "#f8fafc",
            borderRadius: 10,
            border: "1px solid #e2e8f0",
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              Bước 1: Tải tệp biểu mẫu chuẩn (.xlsx)
            </div>
          </div>
          <Button
            icon={<DownloadOutlined />}
            loading={downloadingTemplate}
            onClick={handleDownloadTemplate}
          >
            Tải file mẫu Excel
          </Button>
        </div>
      </div>

      {/* ------------------- BƯỚC 2: KÉO THẢ CHỌN FILE ------------------- */}
      {!importResult && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            Bước 2: Tải lên tệp Excel để kiểm tra dữ liệu
          </div>
          <Upload.Dragger {...uploadProps} style={{ padding: "16px 0", borderRadius: 12 }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined style={{ color: "#2563eb", fontSize: 40 }} />
            </p>
            <p className="ant-upload-text" style={{ fontSize: 15, fontWeight: 600 }}>
              {selectedFile
                ? `Đã chọn: ${selectedFile.name}`
                : "Nhấp hoặc kéo thả file Excel (.xlsx) vào đây"}
            </p>
            <p className="ant-upload-hint" style={{ fontSize: 12, color: "#64748b" }}>
              Hệ thống sẽ tự động phân tích, kiểm tra tính hợp lệ và hiển thị bảng xem trước.
            </p>
          </Upload.Dragger>
        </div>
      )}

      {/* ------------------- HIỂN THỊ KẾT QUẢ PREVIEW ------------------- */}
      {previewLoading && (
        <Alert
          message="Đang kiểm tra và xác thực dữ liệu từng dòng trong file Excel..."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {previewData && !importResult && (
        <div style={{ marginTop: 16 }}>
          <Divider style={{ margin: "12px 0 16px" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>
              BƯỚC 3: KẾT QUẢ KIỂM TRA DỮ LIỆU
            </span>
          </Divider>

          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 8, background: "#f8fafc" }}>
                <Statistic
                  title="Tổng số dòng"
                  value={previewData.total_rows}
                  valueStyle={{ fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 8, background: "#f0fdf4" }}>
                <Statistic
                  title="Dòng hợp lệ (Sẽ nhập)"
                  value={previewData.valid_rows}
                  valueStyle={{ color: "#16a34a", fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small" style={{ borderRadius: 8, background: "#fef2f2" }}>
                <Statistic
                  title="Dòng lỗi (Sẽ bỏ qua)"
                  value={previewData.error_rows}
                  valueStyle={{ color: "#dc2626", fontWeight: 700 }}
                />
              </Card>
            </Col>
          </Row>

          {previewData.error_rows > 0 && (
            <Alert
              type="warning"
              showIcon
              message={
                <span>
                  Phát hiện <strong>{previewData.error_rows} dòng lỗi</strong>. Khi xác nhận
                  nhập, hệ thống sẽ bỏ qua các dòng lỗi này và chỉ tạo tài khoản cho{" "}
                  <strong>{previewData.valid_rows} dòng hợp lệ</strong>.
                </span>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            dataSource={previewData.rows}
            columns={previewColumns}
            rowKey="row_number"
            pagination={{ pageSize: 5 }}
            size="small"
            bordered
            scroll={{ x: 1200 }}
            style={{ borderRadius: 8, overflow: "hidden" }}
          />
        </div>
      )}

      {/* ------------------- HIỂN THỊ BÁO CÁO NHẬP THÀNH CÔNG ------------------- */}
      {importResult && (
        <div style={{ marginTop: 16 }}>
          <Alert
            type="success"
            showIcon
            message={
              <Title level={5} style={{ margin: 0, color: "#16a34a" }}>
                Nhập danh sách người dùng hoàn tất!
              </Title>
            }
            description={
              <div>
                Đã tạo thành công <strong>{importResult.created_count}</strong> tài khoản người
                dùng vào hệ thống. Số dòng bị bỏ qua do lỗi:{" "}
                <strong>{importResult.skipped_count}</strong>.
              </div>
            }
            style={{ marginBottom: 16 }}
          />

          <Table
            dataSource={importResult.report}
            columns={reportColumns}
            rowKey="row_number"
            pagination={{ pageSize: 5 }}
            size="small"
            bordered
            style={{ borderRadius: 8, overflow: "hidden" }}
          />
        </div>
      )}
    </Modal>
  );
};

export default UserExcelImportModal;
