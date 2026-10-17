import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import {
  fetchInvoiceDocument,
  fetchMyDebtSummary,
  fetchMyInvoices,
  type CustomerDebtSummary,
  type InvoiceView,
} from "../../services/apiClient";

const { Text, Title } = Typography;

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (value?: string | null): string =>
  value ? new Intl.DateTimeFormat("vi-VN").format(new Date(value)) : "—";

const statusLabel: Record<string, { label: string; color: string }> = {
  UNPAID: { label: "Chưa thanh toán", color: "red" },
  PARTIAL: { label: "Thanh toán một phần", color: "orange" },
  PAID: { label: "Đã thanh toán", color: "green" },
};

export const CustomerDebtPanel = () => {
  const [summary, setSummary] = useState<CustomerDebtSummary | null>(null);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<number | null>(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<number | null>(
    null,
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [debtSummary, invoiceList] = await Promise.all([
        fetchMyDebtSummary(),
        fetchMyInvoices(),
      ]);
      setSummary(debtSummary);
      setInvoices(invoiceList);
    } catch (loadError) {
      const messageText =
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải dữ liệu công nợ.";
      setError(messageText);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  const viewInvoice = async (invoiceId: number) => {
    const tab = window.open("", "_blank");
    if (!tab) {
      message.error("Trình duyệt đang chặn cửa sổ xem hóa đơn. Hãy cho phép popup rồi thử lại.");
      return;
    }

    tab.document.title = "Đang tải hóa đơn";
    setViewingInvoiceId(invoiceId);
    try {
      const documentBlob = await fetchInvoiceDocument(invoiceId);
      const documentUrl = URL.createObjectURL(documentBlob);
      tab.opener = null;
      tab.location.href = documentUrl;
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60_000);
    } catch (viewError) {
      tab.close();
      message.error(
        viewError instanceof Error
          ? viewError.message
          : "Không thể mở hóa đơn.",
      );
    } finally {
      setViewingInvoiceId(null);
    }
  };

  const downloadInvoice = async (invoiceId: number) => {
    setDownloadingInvoiceId(invoiceId);
    try {
      const documentBlob = await fetchInvoiceDocument(invoiceId);
      const documentUrl = URL.createObjectURL(documentBlob);
      const anchor = document.createElement("a");
      anchor.href = documentUrl;
      anchor.download = `hoa-don-HD-${String(invoiceId).padStart(6, "0")}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60_000);
    } catch (downloadError) {
      message.error(
        downloadError instanceof Error
          ? downloadError.message
          : "Không thể tải hóa đơn.",
      );
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const columns: ColumnsType<InvoiceView> = [
    {
      title: "Mã hóa đơn",
      dataIndex: "id",
      key: "id",
      render: (id: number) => `HD-${String(id).padStart(6, "0")}`,
    },
    {
      title: "Ngày phát hành",
      dataIndex: "invoice_date",
      key: "invoice_date",
      render: formatDate,
    },
    {
      title: "Hạn thanh toán",
      dataIndex: "due_date",
      key: "due_date",
      render: formatDate,
    },
    {
      title: "Tổng tiền",
      dataIndex: "total_amount",
      key: "total_amount",
      align: "right",
      render: (amount: number) => formatCurrency(amount),
    },
    {
      title: "Còn phải trả",
      dataIndex: "amount_due",
      key: "amount_due",
      align: "right",
      render: (amount: number) => (
        <Text strong={amount > 0}>{formatCurrency(amount)}</Text>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const statusInfo = statusLabel[status] ?? {
          label: status,
          color: "default",
        };
        return <Tag color={statusInfo.color}>{statusInfo.label}</Tag>;
      },
    },
    {
      title: "Hóa đơn",
      key: "actions",
      align: "center",
      render: (_value, invoice) => (
        <Space>
          <Button
            icon={<EyeOutlined />}
            loading={viewingInvoiceId === invoice.id}
            onClick={() => void viewInvoice(invoice.id)}
          >
            Xem / in
          </Button>
          <Button
            icon={<DownloadOutlined />}
            loading={downloadingInvoiceId === invoice.id}
            onClick={() => void downloadInvoice(invoice.id)}
          >
            Tải lại
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ display: "flex" }}>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          justifyContent: "space-between",
        }}
      >
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Công nợ & hạn mức
          </Title>
          <Text type="secondary">
            {summary?.customer_name
              ? `Thông tin công nợ của ${summary.customer_name}`
              : "Theo dõi hóa đơn và hạn mức công nợ của đại lý"}
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => void loadData()}
        >
          Tải lại dữ liệu
        </Button>
      </div>

      {error && (
        <Alert
          showIcon
          type="error"
          message="Không tải được dữ liệu công nợ"
          description={error}
          action={
            <Button size="small" onClick={() => void loadData()}>
              Thử lại
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Tổng còn nợ"
              value={summary?.current_debt ?? 0}
              formatter={(value) => formatCurrency(Number(value))}
              valueStyle={{ color: "#cf1322" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Hạn mức công nợ"
              value={summary?.credit_limit ?? 0}
              formatter={(value) => formatCurrency(Number(value))}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic
              title="Hạn mức còn lại"
              value={summary?.remaining_credit_limit ?? 0}
              formatter={(value) => formatCurrency(Number(value))}
              valueStyle={{ color: "#389e0d" }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Hóa đơn đã phát hành">
        <Table<InvoiceView>
          rowKey="id"
          columns={columns}
          dataSource={invoices}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          locale={{
            emptyText: error ? (
              <Text type="secondary">Hãy thử tải lại để xem hóa đơn.</Text>
            ) : (
              <Empty description="Chưa có hóa đơn được phát hành" />
            ),
          }}
          scroll={{ x: 950 }}
        />
        <Text type="secondary">
          Mở hóa đơn để in hoặc chọn “Lưu thành PDF” trong hộp thoại in của trình duyệt.
        </Text>
      </Card>
    </Space>
  );
};

export default CustomerDebtPanel;
