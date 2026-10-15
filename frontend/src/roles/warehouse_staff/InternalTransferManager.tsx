import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Modal,
  Drawer,
  Descriptions,
  Popconfirm,
  message,
  Tabs,
  Badge,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  CheckCircleOutlined,
  SwapOutlined,
  SearchOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ArrowRightOutlined,
  InboxOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type {
  InternalTransfer,
  WarehouseOption,
  TransferStatus,
} from "../../types/internalTransfer";
import {
  fetchInternalTransfers,
  fetchWarehouses,
  cancelInternalTransfer,
} from "../../services/internalTransferService";
import InternalTransferForm from "./InternalTransferForm";
import InternalTransferConfirmModal from "./InternalTransferConfirmModal";

const { Title, Text } = Typography;
const { Option } = Select;

export const InternalTransferManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);

  // Bộ lọc
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [warehouseFilter, setWarehouseFilter] = useState<number | undefined>();
  const [searchText, setSearchText] = useState("");

  // Modals & Drawers state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [confirmModalTransfer, setConfirmModalTransfer] = useState<InternalTransfer | null>(null);
  const [detailDrawerTransfer, setDetailDrawerTransfer] = useState<InternalTransfer | null>(null);

  // Load danh sách kho
  useEffect(() => {
    fetchWarehouses()
      .then(setWarehouses)
      .catch((err) => console.error("Lỗi tải kho:", err));
  }, []);

  // Tải danh sách phiếu chuyển kho
  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInternalTransfers({
        warehouse_id: warehouseFilter,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        search: searchText.trim() || undefined,
      });
      setTransfers(data);
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách phiếu chuyển kho.");
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter, statusFilter, searchText]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  // Hủy phiếu chuyển kho
  const handleCancelTransfer = async (transferId: number) => {
    try {
      await cancelInternalTransfer(transferId);
      message.success("Đã hủy phiếu chuyển kho và hoàn trả hàng về kho xuất.");
      loadTransfers();
    } catch (err: any) {
      message.error(err.message || "Không thể hủy phiếu chuyển kho.");
    }
  };

  // Thống kê nhanh
  const totalCount = transfers.length;
  const pendingCount = transfers.filter((t) => t.status === "PENDING").length;
  const completedCount = transfers.filter((t) => t.status === "COMPLETED").length;
  const cancelledCount = transfers.filter((t) => t.status === "CANCELLED").length;

  // Cột bảng
  const columns = [
    {
      title: "Mã phiếu",
      dataIndex: "transfer_code",
      key: "transfer_code",
      width: 170,
      render: (code: string, record: InternalTransfer) => (
        <a
          onClick={() => setDetailDrawerTransfer(record)}
          style={{ fontWeight: 600, color: "#2563eb" }}
        >
          {code}
        </a>
      ),
    },
    {
      title: "Hành trình điều chuyển",
      key: "route",
      width: 280,
      render: (_: any, record: InternalTransfer) => (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 500, color: "#334155" }}>{record.from_warehouse_name}</span>
            <ArrowRightOutlined style={{ color: "#2563eb", fontSize: 12 }} />
            <span style={{ fontWeight: 600, color: "#16a34a" }}>{record.to_warehouse_name}</span>
          </div>
        </div>
      ),
    },
    {
      title: "Hàng hóa",
      key: "itemsSummary",
      width: 140,
      render: (_: any, record: InternalTransfer) => {
        const totalSent = record.items.reduce((acc, i) => acc + i.sent_quantity, 0);
        return (
          <div>
            <div><strong>{record.items.length}</strong> mặt hàng</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Tổng SL: {totalSent}</div>
          </div>
        );
      },
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (status: TransferStatus) => {
        if (status === "PENDING") {
          return (
            <Tag color="warning" icon={<ClockCircleOutlined />} style={{ borderRadius: 12, padding: "2px 10px" }}>
              Đang chuyển / Chờ nhận
            </Tag>
          );
        }
        if (status === "COMPLETED") {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />} style={{ borderRadius: 12, padding: "2px 10px" }}>
              Đã hoàn thành
            </Tag>
          );
        }
        return (
          <Tag color="default" icon={<CloseCircleOutlined />} style={{ borderRadius: 12, padding: "2px 10px" }}>
            Đã hủy
          </Tag>
        );
      },
    },
    {
      title: "Người tạo / Thời gian",
      key: "created",
      width: 190,
      render: (_: any, record: InternalTransfer) => (
        <div style={{ fontSize: 13 }}>
          <div>{record.created_by || "Hệ thống"}</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {record.created_at ? new Date(record.created_at).toLocaleString("vi-VN") : "—"}
          </div>
        </div>
      ),
    },
    {
      title: "Người nhận / Xác nhận",
      key: "confirmed",
      width: 190,
      render: (_: any, record: InternalTransfer) => (
        <div style={{ fontSize: 13 }}>
          {record.confirmed_by ? (
            <>
              <div><strong>{record.confirmed_by}</strong></div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {record.confirmed_at ? new Date(record.confirmed_at).toLocaleString("vi-VN") : "—"}
              </div>
            </>
          ) : (
            <span style={{ color: "#94a3b8" }}>Chưa nhận</span>
          )}
        </div>
      ),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 200,
      fixed: "right" as const,
      render: (_: any, record: InternalTransfer) => (
        <Space size="small">
          {record.status === "PENDING" && (
            <Tooltip title="Kho đến kiểm tra số lượng và xác nhận nhận hàng">
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => setConfirmModalTransfer(record)}
                style={{ background: "#16a34a", borderColor: "#16a34a" }}
              >
                Nhận hàng
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Xem chi tiết phiếu">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setDetailDrawerTransfer(record)}
            />
          </Tooltip>

          {record.status === "PENDING" && (
            <Popconfirm
              title="Hủy phiếu chuyển kho"
              description="Hàng hóa đã xuất sẽ được hoàn trả lại tồn kho kho xuất. Bạn có chắc chắn muốn hủy phiếu này?"
              onConfirm={() => handleCancelTransfer(record.id)}
              okText="Đồng ý hủy"
              cancelText="Không"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="Hủy phiếu & hoàn kho">
                <Button size="small" danger icon={<CloseCircleOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header & Tiêu đề */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0, color: "#0f172a" }}>
            Quản Lý Chuyển Kho Nội Bộ
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Lập phiếu điều chuyển hàng hóa, theo dõi luân chuyển và xác nhận thực nhận giữa các kho
          </Text>
        </div>

        <Space>
          <Button icon={<SyncOutlined />} onClick={loadTransfers} loading={loading}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateModalOpen(true)}
            size="large"
            style={{
              background: "#2563eb",
              borderColor: "#2563eb",
              fontWeight: 600,
              boxShadow: "0 4px 14px rgba(37, 99, 235, 0.3)",
            }}
          >
            Lập phiếu chuyển kho
          </Button>
        </Space>
      </div>

      {/* Thẻ thống kê */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: "#64748b" }}>Tổng số phiếu</span>}
              value={totalCount}
              prefix={<InboxOutlined style={{ color: "#2563eb" }} />}
              valueStyle={{ fontWeight: 700, color: "#1e293b" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, border: "1px solid #fed7aa", background: "#fffaf0" }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: "#c2410c" }}>Đang chuyển (Chờ nhận)</span>}
              value={pendingCount}
              prefix={<ClockCircleOutlined style={{ color: "#ea580c" }} />}
              valueStyle={{ fontWeight: 700, color: "#ea580c" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, border: "1px solid #bbf7d0", background: "#f0fdf4" }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: "#15803d" }}>Đã hoàn thành</span>}
              value={completedCount}
              prefix={<CheckCircleOutlined style={{ color: "#16a34a" }} />}
              valueStyle={{ fontWeight: 700, color: "#16a34a" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, border: "1px solid #e2e8f0" }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: "#64748b" }}>Đã hủy</span>}
              value={cancelledCount}
              prefix={<CloseCircleOutlined style={{ color: "#94a3b8" }} />}
              valueStyle={{ fontWeight: 700, color: "#64748b" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Bộ lọc & Bảng danh sách */}
      <Card style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ marginBottom: 16 }}>
          <Tabs
            activeKey={statusFilter}
            onChange={setStatusFilter}
            items={[
              { key: "ALL", label: `Tất cả (${totalCount})` },
              {
                key: "PENDING",
                label: (
                  <span>
                    Chờ nhận hàng <Badge count={pendingCount} style={{ backgroundColor: "#ea580c", marginLeft: 6 }} />
                  </span>
                ),
              },
              { key: "COMPLETED", label: `Đã hoàn thành (${completedCount})` },
              { key: "CANCELLED", label: `Đã hủy (${cancelledCount})` },
            ]}
          />

          <Row gutter={16} align="middle">
            <Col xs={24} md={12} lg={8}>
              <Input
                placeholder="Tìm kiếm theo mã phiếu (TRF-...)"
                prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>

            <Col xs={24} md={12} lg={8}>
              <Select
                placeholder="-- Lọc theo kho hàng --"
                value={warehouseFilter}
                onChange={setWarehouseFilter}
                allowClear
                style={{ width: "100%" }}
              >
                {warehouses.map((wh) => (
                  <Option key={wh.id} value={wh.id}>
                    [{wh.code}] {wh.name}
                  </Option>
                ))}
              </Select>
            </Col>
          </Row>
        </div>

        <Table
          dataSource={transfers}
          columns={columns}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          bordered={false}
        />
      </Card>

      {/* Modal Lập Phiếu Chuyển Kho */}
      <Modal
        title={null}
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        width={950}
        destroyOnClose
      >
        <InternalTransferForm
          onSuccess={() => {
            setIsCreateModalOpen(false);
            loadTransfers();
          }}
          onCancel={() => setIsCreateModalOpen(false)}
        />
      </Modal>

      {/* Modal Xác Nhận Nhận Hàng Cho Kho Đến */}
      <InternalTransferConfirmModal
        visible={!!confirmModalTransfer}
        transfer={confirmModalTransfer}
        onSuccess={() => {
          setConfirmModalTransfer(null);
          loadTransfers();
        }}
        onCancel={() => setConfirmModalTransfer(null)}
      />

      {/* Drawer Chi Tiết Phiếu Chuyển */}
      <Drawer
        title={
          <Space>
            <SwapOutlined style={{ color: "#2563eb" }} />
            <span>Chi tiết phiếu chuyển kho: <strong>{detailDrawerTransfer?.transfer_code}</strong></span>
          </Space>
        }
        open={!!detailDrawerTransfer}
        onClose={() => setDetailDrawerTransfer(null)}
        width={750}
      >
        {detailDrawerTransfer && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Mã phiếu" span={2}>
                <Text code strong>{detailDrawerTransfer.transfer_code}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Kho xuất">
                <span style={{ fontWeight: 600 }}>{detailDrawerTransfer.from_warehouse_name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Kho nhận">
                <span style={{ fontWeight: 600, color: "#16a34a" }}>{detailDrawerTransfer.to_warehouse_name}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {detailDrawerTransfer.status === "PENDING" && <Tag color="warning">Đang chuyển</Tag>}
                {detailDrawerTransfer.status === "COMPLETED" && <Tag color="success">Đã hoàn thành</Tag>}
                {detailDrawerTransfer.status === "CANCELLED" && <Tag color="default">Đã hủy</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Người lập">
                {detailDrawerTransfer.created_by || "Hệ thống"}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày tạo">
                {detailDrawerTransfer.created_at ? new Date(detailDrawerTransfer.created_at).toLocaleString("vi-VN") : "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Người nhận">
                {detailDrawerTransfer.confirmed_by || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Ngày nhận">
                {detailDrawerTransfer.confirmed_at ? new Date(detailDrawerTransfer.confirmed_at).toLocaleString("vi-VN") : "—"}
              </Descriptions.Item>
            </Descriptions>

            <Title level={5}>Danh Sách Sản Phẩm Chuyển</Title>
            <Table
              dataSource={detailDrawerTransfer.items}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
              columns={[
                {
                  title: "STT",
                  width: 50,
                  align: "center",
                  render: (_: any, __: any, idx: number) => idx + 1,
                },
                {
                  title: "Sản phẩm",
                  key: "name",
                  render: (_: any, item: any) => (
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>SKU: {item.product_sku}</div>
                    </div>
                  ),
                },
                {
                  title: "ĐVT",
                  dataIndex: "unit",
                  width: 80,
                  align: "center",
                  render: (unit: string) => <Tag color="blue">{unit}</Tag>,
                },
                {
                  title: "SL Gửi",
                  dataIndex: "sent_quantity",
                  width: 90,
                  align: "center",
                  render: (qty: number) => <strong>{qty}</strong>,
                },
                {
                  title: "SL Thực nhận",
                  dataIndex: "received_quantity",
                  width: 110,
                  align: "center",
                  render: (qty: number | null) => (
                    <span style={{ fontWeight: 600, color: qty !== null ? "#16a34a" : "#94a3b8" }}>
                      {qty !== null ? qty : "Chưa nhận"}
                    </span>
                  ),
                },
                {
                  title: "Lý do chênh lệch",
                  dataIndex: "discrepancy_reason",
                  render: (reason: string | null) => (
                    reason ? (
                      <Text type="danger" style={{ fontSize: 12 }}>
                        {reason}
                      </Text>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default InternalTransferManager;
