import React, { useEffect, useState } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Space,
  Modal,
  message,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ShopOutlined,
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  UserOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  LockOutlined,
  WarningOutlined,
  UserSwitchOutlined,
} from "@ant-design/icons";
import {
  fetchCustomers,
  fetchCustomersWithTotal,
  fetchSalesReps,
  fetchTerritories,
  assignSalesRep,
  type CustomerItem,
  type SalesRepUser,
  type TerritoryItem,
} from "../../services/apiClient";
import CreateCustomerModal from "./CreateCustomerModal";

const { Title, Text } = Typography;

export const AdminCustomers: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRepUser[]>([]);
  const [territories, setTerritories] = useState<TerritoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filters
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<number | undefined>(undefined);
  const [selectedRep, setSelectedRep] = useState<number | undefined>(undefined);
  const [selectedGroup, setSelectedGroup] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  // KPI stats
  const [kpis, setKpis] = useState({ total: 0, active: 0, locked: 0, unassigned: 0 });

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [assignModalCustomer, setAssignModalCustomer] = useState<CustomerItem | null>(null);
  const [assignRepId, setAssignRepId] = useState<number | undefined>(undefined);
  const [assigning, setAssigning] = useState(false);

  // Truy vấn danh sách đại lý từ backend
  const fetchCustomersList = async (
    targetPage = currentPage,
    kw = searchKeyword,
    region = selectedRegion,
    rep = selectedRep,
    grp = selectedGroup,
    st = selectedStatus,
    size = pageSize
  ) => {
    setLoading(true);
    try {
      const result = await fetchCustomersWithTotal({
        page: targetPage,
        limit: size,
        search: kw.trim() || undefined,
        regionId: region,
        assignedRepId: rep,
        customerGroup: grp !== "ALL" ? grp : undefined,
        status: st !== "ALL" ? st : undefined,
      });
      setCustomers(result.data);
      setTotalRecords(result.total);
      setCurrentPage(targetPage);
    } catch {
      message.error("Lỗi khi tải danh sách đại lý.");
    } finally {
      setLoading(false);
    }
  };

  const loadKpis = async () => {
    try {
      const allCustomers = await fetchCustomers();
      const total = allCustomers.length;
      const active = allCustomers.filter((c) => c.is_active && !c.is_locked).length;
      const locked = allCustomers.filter((c) => c.is_locked).length;
      const unassigned = allCustomers.filter((c) => !c.sales_rep_id).length;
      setKpis({ total, active, locked, unassigned });
    } catch {
      // ignore
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [repsData, terrsData] = await Promise.all([
        fetchSalesReps().catch(() => []),
        fetchTerritories().catch(() => []),
      ]);
      setSalesReps(repsData);
      setTerritories(terrsData);
      await loadKpis();
      await fetchCustomersList(1);
    } catch {
      message.error("Không thể tải danh sách đại lý.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleSearch = () => {
    fetchCustomersList(1, searchKeyword, selectedRegion, selectedRep, selectedGroup, selectedStatus);
  };

  const handleResetFilters = () => {
    setSearchKeyword("");
    setSelectedRegion(undefined);
    setSelectedRep(undefined);
    setSelectedGroup("ALL");
    setSelectedStatus("ALL");
    fetchCustomersList(1, "", undefined, undefined, "ALL", "ALL");
  };

  const reloadCustomers = async () => {
    await loadKpis();
    await fetchCustomersList(currentPage);
  };

  // Quick Assign Submit
  const handleAssignSubmit = async () => {
    if (!assignModalCustomer || !assignRepId) {
      message.warning("Vui lòng chọn nhân viên kinh doanh.");
      return;
    }
    setAssigning(true);
    try {
      await assignSalesRep(assignModalCustomer.id, assignRepId);
      message.success("Phân công nhân viên phụ trách thành công!");
      setAssignModalCustomer(null);
      setAssignRepId(undefined);
      reloadCustomers();
    } catch (err: any) {
      message.error(err.message || "Phân công thất bại.");
    } finally {
      setAssigning(false);
    }
  };

  const columns: ColumnsType<CustomerItem> = [
    {
      title: "Mã đại lý",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (code: string) => (
        <Tag color="blue" style={{ fontWeight: 700, fontSize: 13, padding: "2px 8px" }}>
          {code}
        </Tag>
      ),
    },
    {
      title: "Tên đại lý & Thông tin liên hệ",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{name}</div>
          <Space size={8} wrap style={{ marginTop: 2 }}>
            {record.phone && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                SĐT: {record.phone}
              </Text>
            )}
            {record.address && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                • Đ/c: {record.address}
              </Text>
            )}
          </Space>
        </div>
      ),
    },
    {
      title: "Cấp đại lý",
      dataIndex: "customer_group",
      key: "customer_group",
      width: 140,
      render: (group: string) => {
        if (group === "DEALER_LEVEL_1") {
          return <Tag color="geekblue" style={{ fontWeight: 600 }}>Cấp 1 (VIP)</Tag>;
        }
        if (group === "DEALER_LEVEL_2") {
          return <Tag color="purple" style={{ fontWeight: 600 }}>Cấp 2</Tag>;
        }
        return <Tag color="default">Bán lẻ</Tag>;
      },
    },
    {
      title: "Địa bàn",
      dataIndex: "territory_name",
      key: "territory_name",
      width: 140,
      render: (_: any, record) => {
        const terr = territories.find((t) => t.id === record.territory_id);
        const name = record.territory_name || terr?.name;
        if (!name) return <Text type="secondary" style={{ fontSize: 12 }}>Chưa gán</Text>;
        return (
          <Tag icon={<EnvironmentOutlined />} color="green" style={{ fontWeight: 500 }}>
            {name}
          </Tag>
        );
      },
    },
    {
      title: "NVKD Phụ trách",
      key: "sales_rep",
      width: 220,
      render: (_, record) => {
        const rep = salesReps.find((r) => r.id === record.sales_rep_id);
        const repName = record.sales_rep_name || rep?.full_name || (rep?.username ? `@${rep.username}` : "");

        if (!record.sales_rep_id || !repName) {
          return (
            <Space>
              <Tag color="volcano" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                Chưa gán
              </Tag>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  setAssignModalCustomer(record);
                  setAssignRepId(undefined);
                }}
                style={{ padding: 0 }}
              >
                Gán ngay
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Tag color="blue" icon={<UserOutlined />} style={{ fontWeight: 600, fontSize: 13, padding: "3px 8px" }}>
              {repName}
            </Tag>
            <Tooltip title="Đổi nhân viên phụ trách">
              <Button
                type="text"
                size="small"
                icon={<UserSwitchOutlined />}
                onClick={() => {
                  setAssignModalCustomer(record);
                  setAssignRepId(record.sales_rep_id || undefined);
                }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "Hạn mức nợ",
      dataIndex: "debt_limit",
      key: "debt_limit",
      width: 130,
      align: "right",
      render: (limit: number) => (
        <span style={{ fontWeight: 600, color: "#334155" }}>
          {(limit || 0).toLocaleString("vi-VN")} đ
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "status",
      width: 140,
      render: (_, record) => {
        if (record.is_locked) {
          return (
            <Tooltip title={record.lock_reason || "Bị khóa do vượt hạn mức nợ"}>
              <Tag color="error" icon={<LockOutlined />} style={{ fontWeight: 600 }}>
                Khóa giao dịch
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 500 }}>
            Đang hoạt động
          </Tag>
        );
      },
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Bar */}
      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
          background: "#ffffff",
        }}
        bodyStyle={{ padding: "20px 24px" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontSize: 24,
                boxShadow: "0 8px 16px -4px rgba(37, 99, 235, 0.35)",
              }}
            >
              <ShopOutlined />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, fontWeight: 700, color: "#0f172a" }}>
                Quản lý Đại lý &amp; Khách hàng
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Thêm mới đại lý, quản lý hạn mức công nợ, phân công nhân viên kinh doanh phụ trách
              </Text>
            </div>
          </div>

          <Space size={12}>
            <Button
              icon={<ReloadOutlined />}
              onClick={reloadCustomers}
              loading={loading}
              style={{ borderRadius: 8, height: 40 }}
            >
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                borderRadius: 8,
                height: 40,
                backgroundColor: "#2563eb",
                fontWeight: 600,
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
              }}
            >
              Thêm đại lý mới
            </Button>
          </Space>
        </div>
      </Card>

      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              Tổng số đại lý
            </Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1e293b", marginTop: 4 }}>
              {kpis.total}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              Đang hoạt động
            </Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#16a34a", marginTop: 4 }}>
              {kpis.active}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              Chưa phân công NVKD
            </Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#ea580c", marginTop: 4 }}>
              {kpis.unassigned}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
              Đang bị khóa giao dịch
            </Text>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#dc2626", marginTop: 4 }}>
              {kpis.locked}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Table Card */}
      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
          background: "#ffffff",
        }}
        bodyStyle={{ padding: "20px 24px" }}
      >
        {/* Filters Toolbar */}
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }} align="middle">
          <Col xs={24} md={5}>
            <Input
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Tìm theo mã, tên hoặc SĐT..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
              style={{ borderRadius: 8, height: 38 }}
            />
          </Col>

          <Col xs={12} md={4}>
            <Select
              style={{ width: "100%", height: 38 }}
              placeholder="Khu vực / Địa bàn"
              allowClear
              value={selectedRegion}
              onChange={(val) => {
                setSelectedRegion(val);
                fetchCustomersList(1, searchKeyword, val, selectedRep, selectedGroup, selectedStatus, pageSize);
              }}
              options={territories.map((t) => ({ label: t.name, value: t.id }))}
            />
          </Col>

          <Col xs={12} md={4}>
            <Select
              style={{ width: "100%", height: 38 }}
              placeholder="NVKD phụ trách"
              allowClear
              value={selectedRep}
              onChange={(val) => {
                setSelectedRep(val);
                fetchCustomersList(1, searchKeyword, selectedRegion, val, selectedGroup, selectedStatus, pageSize);
              }}
              options={[
                { label: "⚠️ Chưa phân công", value: -1 },
                ...salesReps.map((r) => ({
                  label: r.full_name || r.username,
                  value: r.id,
                })),
              ]}
            />
          </Col>

          <Col xs={12} md={3}>
            <Select
              style={{ width: "100%", height: 38 }}
              value={selectedGroup}
              onChange={(val) => {
                setSelectedGroup(val);
                fetchCustomersList(1, searchKeyword, selectedRegion, selectedRep, val, selectedStatus, pageSize);
              }}
              options={[
                { label: "Tất cả cấp đại lý", value: "ALL" },
                { label: "Đại lý Cấp 1", value: "DEALER_LEVEL_1" },
                { label: "Đại lý Cấp 2", value: "DEALER_LEVEL_2" },
                { label: "Đại lý Bán lẻ", value: "RETAIL" },
              ]}
            />
          </Col>

          <Col xs={12} md={3}>
            <Select
              style={{ width: "100%", height: 38 }}
              value={selectedStatus}
              onChange={(val) => {
                setSelectedStatus(val);
                fetchCustomersList(1, searchKeyword, selectedRegion, selectedRep, selectedGroup, val, pageSize);
              }}
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Đang hoạt động", value: "ACTIVE" },
                { label: "Khóa giao dịch", value: "LOCKED" },
              ]}
            />
          </Col>

          <Col xs={24} md={5}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                style={{ borderRadius: 8, height: 38 }}
              >
                Lọc dữ liệu
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleResetFilters}
                style={{ borderRadius: 8, height: 38 }}
              >
                Đặt lại
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Table */}
        <Table
          columns={columns}
          dataSource={customers}
          rowKey="id"
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalRecords,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50"],
            showTotal: (total) => `Tổng cộng ${total} đại lý`,
            onChange: (p, size) => {
              setPageSize(size);
              fetchCustomersList(p, searchKeyword, selectedRegion, selectedRep, selectedGroup, selectedStatus, size);
            },
          }}
          locale={{ emptyText: "Chưa có đại lý nào phù hợp với bộ lọc." }}
          bordered
          style={{ borderRadius: 8, overflow: "hidden" }}
        />
      </Card>

      {/* Modal Thêm Đại Lý Mới */}
      <CreateCustomerModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => reloadCustomers()}
      />

      {/* Modal Gán Nhanh NVKD */}
      <Modal
        title={
          <Space>
            <UserSwitchOutlined style={{ color: "#2563eb" }} />
            <span>Phân công nhân viên phụ trách</span>
          </Space>
        }
        open={Boolean(assignModalCustomer)}
        onCancel={() => setAssignModalCustomer(null)}
        onOk={handleAssignSubmit}
        confirmLoading={assigning}
        okText="Lưu phân công"
        cancelText="Hủy"
        destroyOnClose
      >
        {assignModalCustomer && (
          <div style={{ marginTop: 12 }}>
            <p>
              Đại lý: <strong>{assignModalCustomer.name}</strong> ({assignModalCustomer.code})
            </p>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>
              Chọn nhân viên kinh doanh phụ trách:
            </div>
            <Select
              style={{ width: "100%" }}
              placeholder="Chọn NVKD"
              value={assignRepId}
              onChange={(val) => setAssignRepId(val)}
              options={salesReps.map((r) => ({
                label: (
                  <Space>
                    <UserOutlined style={{ color: "#2563eb" }} />
                    <span>{r.full_name || r.username} (@{r.username})</span>
                  </Space>
                ),
                value: r.id,
              }))}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdminCustomers;
