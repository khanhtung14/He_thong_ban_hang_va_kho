import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Row,
  Col,
  Statistic,
  message,
  Popconfirm,
  Tooltip,
  Typography,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  FileDoneOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import type {
  InboundReceiptResponse,
  ReceiptStatus,
  ReceiptFormOptions,
} from "../../types/inboundReceipt";
import {
  getInboundReceipts,
  getInboundReceiptById,
  completeInboundReceipt,
  cancelInboundReceipt,
  getReceiptFormOptions,
} from "../../services/inboundReceiptService";
import CreateReceiptModal from "./CreateReceiptModal";
import ReceiptDetailModal from "./ReceiptDetailModal";

const { Text, Title } = Typography;
const { Option } = Select;

export const InboundReceiptsIndex: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [receipts, setReceipts] = useState<InboundReceiptResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReceiptStatus | "">("");
  const [warehouseFilter, setWarehouseFilter] = useState<number | undefined>(undefined);

  // Dropdown options
  const [options, setOptions] = useState<ReceiptFormOptions>({
    suppliers: [],
    warehouses: [],
    products: [],
    storage_locations: [],
  });

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<InboundReceiptResponse | null>(null);

  // Load receipts list
  const loadReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInboundReceipts({
        page,
        page_size: pageSize,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        warehouse_id: warehouseFilter,
      });
      setReceipts(res.items);
      setTotal(res.total);
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách phiếu nhập kho.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, warehouseFilter]);

  // Load options once for warehouse filter
  useEffect(() => {
    getReceiptFormOptions()
      .then((data) => setOptions(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  // Handle Complete receipt
  const handleComplete = async (id: number) => {
    setActionLoading(true);
    try {
      await completeInboundReceipt(id);
      message.success("Hoàn tất phiếu nhập kho và đã cộng dồn vào tồn kho thành công!");
      setIsDetailOpen(false);
      loadReceipts();
    } catch (err: any) {
      message.error(err.message || "Không thể hoàn tất phiếu nhập.");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Cancel receipt
  const handleCancel = async (id: number) => {
    setActionLoading(true);
    try {
      await cancelInboundReceipt(id);
      message.success("Đã hủy phiếu nhập kho.");
      setIsDetailOpen(false);
      loadReceipts();
    } catch (err: any) {
      message.error(err.message || "Không thể hủy phiếu nhập.");
    } finally {
      setActionLoading(false);
    }
  };

  // Open detail modal
  const handleViewDetail = async (id: number) => {
    try {
      const detail = await getInboundReceiptById(id);
      setSelectedReceipt(detail);
      setIsDetailOpen(true);
    } catch (err: any) {
      message.error(err.message || "Không thể xem chi tiết phiếu nhập.");
    }
  };

  // Quick stats calculation
  const draftCount = receipts.filter((r) => r.status === "DRAFT").length;
  const completedCount = receipts.filter((r) => r.status === "COMPLETED").length;
  const totalReceivedQty = receipts.reduce((sum, r) => sum + (r.total_quantity || 0), 0);

  const renderStatusTag = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return <Tag color="success">Đã hoàn tất</Tag>;
      case "CANCELLED":
        return <Tag color="default">Đã hủy</Tag>;
      default:
        return <Tag color="warning">Nháp (DRAFT)</Tag>;
    }
  };

  const columns = [
    {
      title: "Mã phiếu",
      dataIndex: "code",
      key: "code",
      width: 170,
      render: (code: string, record: InboundReceiptResponse) => (
        <a
          onClick={() => handleViewDetail(record.id)}
          style={{ fontWeight: 600, color: "#2563eb" }}
        >
          {code}
        </a>
      ),
    },
    {
      title: "Nhà cung cấp",
      key: "supplier",
      render: (_: any, record: InboundReceiptResponse) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e293b" }}>{record.supplier_name}</div>
          {record.supplier_code && (
            <div style={{ fontSize: 12, color: "#64748b" }}>Mã: {record.supplier_code}</div>
          )}
        </div>
      ),
    },
    {
      title: "Kho nhận",
      dataIndex: "warehouse_name",
      key: "warehouse_name",
      width: 160,
      render: (wh: string) => <span style={{ fontWeight: 500 }}>{wh}</span>,
    },
    {
      title: "Tổng số lượng",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 130,
      align: "right" as const,
      render: (qty: number) => (
        <span style={{ fontWeight: 600, color: "#16a34a" }}>
          {qty.toLocaleString("vi-VN")}
        </span>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (dateStr: string) =>
        dateStr ? new Date(dateStr).toLocaleString("vi-VN") : "-",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 140,
      align: "center" as const,
      render: (status: string) => renderStatusTag(status),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 180,
      align: "center" as const,
      render: (_: any, record: InboundReceiptResponse) => (
        <Space size="small">
          <Tooltip title="Xem chi tiết">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            />
          </Tooltip>

          {record.status === "DRAFT" && (
            <Popconfirm
              title="Chốt phiếu nhập kho?"
              description="Hệ thống sẽ tự động cộng số lượng vào tồn kho thực tế."
              onConfirm={() => handleComplete(record.id)}
              okText="Hoàn tất"
              cancelText="Hủy"
            >
              <Tooltip title="Chốt phiếu & Cộng tồn kho">
                <Button
                  type="text"
                  icon={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
                />
              </Tooltip>
            </Popconfirm>
          )}

          {record.status === "DRAFT" && (
            <Popconfirm
              title="Xác nhận hủy phiếu nhập?"
              description="Phiếu nhập đã hủy không thể hoàn tất lại."
              onConfirm={() => handleCancel(record.id)}
              okText="Hủy phiếu"
              cancelText="Quay lại"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Hủy phiếu">
                <Button
                  type="text"
                  danger
                  icon={<CloseCircleOutlined />}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER SECTION */}
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
          <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
            Quản lý Phiếu nhập kho từ Nhà cung cấp
          </Title>
          <Text style={{ color: "#64748b" }}>
            SCRUM-30: Ghi nhận hàng về đúng nhà cung cấp, đúng kho, đúng mã lô và cất vào đúng vị trí Khu / Kệ.
          </Text>
        </div>

        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadReceipts} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateOpen(true)}
            style={{ backgroundColor: "#2563eb" }}
          >
            Lập phiếu nhập kho
          </Button>
        </Space>
      </div>

      {/* STATISTIC METRIC CARDS */}
      <Row gutter={16}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <Statistic
              title="Tổng số phiếu nhập"
              value={total}
              prefix={<InboxOutlined style={{ color: "#2563eb" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <Statistic
              title="Chờ hoàn tất (DRAFT)"
              value={draftCount}
              valueStyle={{ color: "#f59e0b" }}
              prefix={<ClockCircleOutlined style={{ color: "#f59e0b" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <Statistic
              title="Đã hoàn tất (COMPLETED)"
              value={completedCount}
              valueStyle={{ color: "#16a34a" }}
              prefix={<FileDoneOutlined style={{ color: "#16a34a" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <Statistic
              title="Tổng lượng hàng trang này"
              value={totalReceivedQty}
              suffix="đơn vị"
              prefix={<AppstoreOutlined style={{ color: "#6366f1" }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* MAIN DATA TABLE & FILTER TOOLBAR */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
      >
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Tìm theo mã phiếu, nhà cung cấp, ghi chú..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => {
                setPage(1);
                loadReceipts();
              }}
              allowClear
            />
          </Col>

          <Col xs={12} sm={6} md={6}>
            <Select
              placeholder="Trạng thái phiếu"
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
              style={{ width: "100%" }}
            >
              <Option value="">Tất cả trạng thái</Option>
              <Option value="DRAFT">Nháp (DRAFT)</Option>
              <Option value="COMPLETED">Đã hoàn tất (COMPLETED)</Option>
              <Option value="CANCELLED">Đã hủy (CANCELLED)</Option>
            </Select>
          </Col>

          <Col xs={12} sm={6} md={6}>
            <Select
              placeholder="Lọc theo kho nhận"
              value={warehouseFilter}
              onChange={(val) => {
                setWarehouseFilter(val);
                setPage(1);
              }}
              allowClear
              style={{ width: "100%" }}
            >
              {options.warehouses.map((wh) => (
                <Option key={wh.id} value={wh.id}>
                  {wh.name}
                </Option>
              ))}
            </Select>
          </Col>
        </Row>

        <Table
          dataSource={receipts}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            showTotal: (totalCount) => `Tổng cộng ${totalCount} phiếu nhập`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </Card>

      {/* MODAL LẬP PHIẾU NHẬP */}
      <CreateReceiptModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setPage(1);
          loadReceipts();
        }}
      />

      {/* MODAL CHI TIẾT PHIẾU NHẬP */}
      <ReceiptDetailModal
        receipt={selectedReceipt}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onComplete={handleComplete}
        onCancel={handleCancel}
        loadingAction={actionLoading}
      />
    </div>
  );
};

export default InboundReceiptsIndex;
