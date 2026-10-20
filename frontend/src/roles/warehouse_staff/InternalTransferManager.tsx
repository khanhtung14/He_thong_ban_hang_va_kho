import React, { useState, useEffect, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Typography,
  Select,
  Row,
  Col,
  Alert,
  Spin,
  Badge,
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  InboxOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";

import {
  getInternalTransfers,
  getInternalTransferById,
  type InternalTransfer,
  type InternalTransferStatus,
} from "../../services/internalTransferService";
import { InternalTransferForm } from "../../components/InternalTransferForm";
import { InternalTransferConfirmModal } from "../../components/InternalTransferConfirmModal";

const { Title, Text } = Typography;

export const InternalTransferManager: React.FC = () => {
  const [transfers, setTransfers] = useState<InternalTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<InternalTransfer | null>(null);

  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Tải danh sách phiếu luân chuyển
  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInternalTransfers({ status: statusFilter });
      setTransfers(res.data || []);
    } catch (err) {
      console.error("Lỗi tải danh sách phiếu chuyển kho:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  // Mở modal xác nhận nhận hàng
  const handleOpenConfirm = async (transfer: InternalTransfer) => {
    // Tải chi tiết đầy đủ để đảm bảo có danh sách details
    try {
      const fullDetail = await getInternalTransferById(transfer.id);
      setSelectedTransfer(fullDetail.data || transfer);
    } catch {
      setSelectedTransfer(transfer);
    }
    setConfirmModalOpen(true);
  };

  // Mở modal xem chi tiết
  const handleOpenDetail = async (transfer: InternalTransfer) => {
    try {
      const fullDetail = await getInternalTransferById(transfer.id);
      setSelectedTransfer(fullDetail.data || transfer);
    } catch {
      setSelectedTransfer(transfer);
    }
    setDetailModalOpen(true);
  };

  const getStatusBadge = (status: InternalTransferStatus) => {
    switch (status) {
      case "IN_TRANSIT":
        return (
          <Tag color="orange" icon={<ClockCircleOutlined />}>
            Đang vận chuyển (In-transit)
          </Tag>
        );
      case "COMPLETED":
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            Đã nhận đủ (Completed)
          </Tag>
        );
      case "CANCELLED":
        return <Tag color="default">Đã hủy</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const columns: ColumnsType<InternalTransfer> = [
    {
      title: "Mã phiếu",
      dataIndex: "id",
      key: "id",
      width: 100,
      render: (id) => <Text strong>#{id}</Text>,
    },
    {
      title: "Kho xuất phát (Kho gửi)",
      key: "from_warehouse",
      render: (_, r) => (
        <Text strong style={{ color: "var(--accent-text, #3730A3)" }}>
          {r.from_warehouse_name || `Kho #${r.from_warehouse_id}`}
        </Text>
      ),
    },
    {
      title: "",
      key: "arrow",
      width: 40,
      align: "center",
      render: () => <ArrowRightOutlined style={{ color: "#94a3b8" }} />,
    },
    {
      title: "Kho đích đến (Kho nhận)",
      key: "to_warehouse",
      render: (_, r) => (
        <Text strong style={{ color: "var(--success-text, #166534)" }}>
          {r.to_warehouse_name || `Kho #${r.to_warehouse_id}`}
        </Text>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 220,
      render: (status: InternalTransferStatus) => getStatusBadge(status),
    },
    {
      title: "Số mặt hàng",
      key: "item_count",
      width: 120,
      align: "center",
      render: (_, r) => <Badge count={r.details?.length || 0} showZero color="#4F46E5" />,
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (val: string) =>
        val ? new Date(val).toLocaleString("vi-VN") : "—",
    },
    {
      title: "Hành động",
      key: "actions",
      width: 220,
      render: (_, r) => (
        <Space size="small">
          {r.status === "IN_TRANSIT" && (
            <Button
              type="primary"
              size="small"
              icon={<InboxOutlined />}
              onClick={() => handleOpenConfirm(r)}
              style={{
                background: "var(--accent-primary, #4F46E5)",
                borderColor: "var(--accent-primary, #4F46E5)",
              }}
            >
              Xác nhận nhận hàng
            </Button>
          )}
          <Tooltip title="Xem chi tiết phiếu chuyển">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDetail(r)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {showCreateForm ? (
        <InternalTransferForm
          onSuccess={() => {
            loadTransfers();
            setShowCreateForm(false);
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : (
        <Card
          title={
            <Space align="center">
              <SendOutlined style={{ color: "var(--accent-primary, #4F46E5)", fontSize: 20 }} />
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  Quản Lý Luân Chuyển Hàng Hóa Nội Bộ
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  Theo dõi hàng đang trên đường (In-transit) và tiếp nhận kiểm đếm vào kho đích.
                </Text>
              </div>
            </Space>
          }
          extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={loadTransfers} loading={loading}>
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setShowCreateForm(true)}
                style={{
                  background: "var(--accent-primary, #4F46E5)",
                  borderColor: "var(--accent-primary, #4F46E5)",
                }}
              >
                + Lập phiếu chuyển kho
              </Button>
            </Space>
          }
          style={{
            borderRadius: "var(--radius-lg, 12px)",
            boxShadow: "var(--shadow-sm, 0 1px 2px 0 rgba(0, 0, 0, 0.05))",
          }}
        >
          {/* Bộ lọc trạng thái */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={12} md={8}>
              <Select
                placeholder="-- Lọc theo trạng thái --"
                allowClear
                style={{ width: "100%" }}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val)}
                options={[
                  { value: "IN_TRANSIT", label: "Đang vận chuyển (IN_TRANSIT)" },
                  { value: "COMPLETED", label: "Đã hoàn thành (COMPLETED)" },
                  { value: "CANCELLED", label: "Đã hủy (CANCELLED)" },
                ]}
              />
            </Col>
          </Row>

          <Table
            dataSource={transfers}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10, showTotal: (t) => `Tổng số: ${t} phiếu` }}
            size="middle"
          />
        </Card>
      )}

      {/* Modal xác nhận nhận hàng */}
      <InternalTransferConfirmModal
        open={confirmModalOpen}
        transfer={selectedTransfer}
        onClose={() => {
          setConfirmModalOpen(false);
          setSelectedTransfer(null);
        }}
        onSuccess={() => {
          loadTransfers();
        }}
      />

      {/* Modal xem chi tiết phiếu */}
      {detailModalOpen && selectedTransfer && (
        <Card
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90%",
            maxWidth: 700,
            zIndex: 1000,
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          }}
          title={`Chi tiết phiếu chuyển kho #${selectedTransfer.id}`}
          extra={
            <Button size="small" onClick={() => setDetailModalOpen(false)}>
              Đóng
            </Button>
          }
        >
          <div style={{ marginBottom: 12 }}>
            <Text>
              Tuyến: <b>{selectedTransfer.from_warehouse_name}</b> <ArrowRightOutlined />{" "}
              <b>{selectedTransfer.to_warehouse_name}</b>
            </Text>
            <br />
            <Text>Trạng thái: {getStatusBadge(selectedTransfer.status)}</Text>
          </div>
          <Table
            dataSource={selectedTransfer.details || []}
            rowKey="id"
            pagination={false}
            size="small"
            columns={[
              { title: "STT", render: (_, __, idx) => idx + 1, width: 50 },
              {
                title: "Sản phẩm",
                render: (_, d) => d.product_name || `ID #${d.product_id}`,
              },
              { title: "Số gửi", dataIndex: "quantity_sent", width: 90 },
              {
                title: "Số nhận",
                render: (_, d) =>
                  d.quantity_received !== null && d.quantity_received !== undefined
                    ? d.quantity_received
                    : "—",
                width: 90,
              },
              {
                title: "Lý do chênh lệch",
                dataIndex: "discrepancy_reason",
                render: (r) => r || "—",
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
};

export default InternalTransferManager;
