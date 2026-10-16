import React, { useEffect, useState, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Modal,
  Form,
  message,
  Typography,
  Tabs,
  Alert,
  Popconfirm,
  Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  UserSwitchOutlined,
  HistoryOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  ShopOutlined,
  UserOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import CreateCustomerModal from "../admin/CreateCustomerModal";
import DeliveryAddressesModal from "../../components/DeliveryAddressesModal";
import CreditLimitModal from "../../components/CreditLimitModal";
import { getCurrentUserRole } from "../../services/sessionService";
import {
  fetchCustomersWithTotal,
  fetchSalesReps,
  fetchTerritories,
  assignSalesRep,
  handoverCustomers,
  fetchHandoverHistory,
  type CustomerItem,
  type SalesRepUser,
  type TerritoryItem,
  type HandoverLogItem,
} from "../../services/apiClient";

const { Title, Text } = Typography;

export const CustomerTerritoryManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState("customers");
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedCustomerForAddress, setSelectedCustomerForAddress] = useState<CustomerItem | null>(null);

  // State Danh sách đại lý & bộ lọc từ server
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRepUser[]>([]);
  const [territories, setTerritories] = useState<TerritoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [repFilter, setRepFilter] = useState<string>("ALL");
  const [regionFilter, setRegionFilter] = useState<string | number>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalRecords, setTotalRecords] = useState(0);

  // State Modal Điều chỉnh hạn mức tín dụng & ngày nợ
  const userRole = (getCurrentUserRole() || "").trim().toUpperCase().replace(/[ -]/g, "_");
  const canEditCreditLimit = [
    "ACCOUNTANT",
    "KE_TOAN",
    "SALES_MANAGER",
    "QUAN_LY_KINH_DOANH",
    "SALESMANAGER",
  ].includes(userRole);

  const [creditLimitModal, setCreditLimitModal] = useState<{
    visible: boolean;
    customer: CustomerItem | null;
  }>({
    visible: false,
    customer: null,
  });

  // State Modal Phân công 1 đại lý
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<number | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // State Bàn giao hàng loạt
  const [fromRepId, setFromRepId] = useState<number | undefined>(undefined);
  const [toRepId, setToRepId] = useState<number | undefined>(undefined);
  const [handoverReason, setHandoverReason] = useState("");
  const [handoverLoading, setHandoverLoading] = useState(false);

  // State Lịch sử bàn giao
  const [historyLogs, setHistoryLogs] = useState<HandoverLogItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Truy vấn danh sách đại lý và lọc từ backend (server-side query & filter)
  const fetchCustomersList = useCallback(
    async (
      targetPage = currentPage,
      currentSearch = search,
      currentRep = repFilter,
      currentRegion = regionFilter,
      currentGroup = groupFilter,
      currentStatus = statusFilter,
      currentSize = pageSize
    ) => {
      setLoading(true);
      try {
        const assignedRepParam =
          currentRep === "UNASSIGNED"
            ? -1
            : currentRep !== "ALL"
              ? Number(currentRep)
              : undefined;

        const regionParam =
          currentRegion !== "ALL" && currentRegion !== undefined
            ? Number(currentRegion)
            : undefined;

        const result = await fetchCustomersWithTotal({
          page: targetPage,
          limit: currentSize,
          search: currentSearch.trim() || undefined,
          assignedRepId: assignedRepParam,
          regionId: regionParam,
          customerGroup: currentGroup !== "ALL" ? currentGroup : undefined,
          status: currentStatus !== "ALL" ? currentStatus : undefined,
        });

        setCustomers(result.data);
        setTotalRecords(result.total);
        setCurrentPage(targetPage);
      } catch (err: any) {
        message.error(err.message || "Lỗi khi tải dữ liệu đại lý.");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, search, repFilter, regionFilter, groupFilter, statusFilter]
  );

  const loadData = useCallback(async () => {
    fetchCustomersList(currentPage);
  }, [fetchCustomersList, currentPage]);

  const loadInitialData = useCallback(async () => {
    try {
      const [repsData, terrsData] = await Promise.all([
        fetchSalesReps().catch(() => []),
        fetchTerritories().catch(() => []),
      ]);
      setSalesReps(repsData);
      setTerritories(terrsData);
    } catch {
      // bỏ qua lỗi load phụ
    }
    fetchCustomersList(1);
  }, [fetchCustomersList]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSearch = () => {
    fetchCustomersList(1, search, repFilter, regionFilter, groupFilter, statusFilter);
  };

  const handleResetFilter = () => {
    setSearch("");
    setRepFilter("ALL");
    setRegionFilter("ALL");
    setGroupFilter("ALL");
    setStatusFilter("ALL");
    fetchCustomersList(1, "", "ALL", "ALL", "ALL", "ALL");
  };

  // Tải lịch sử bàn giao
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const logs = await fetchHandoverHistory();
      setHistoryLogs(logs);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi tải lịch sử bàn giao.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Xử lý gán 1 NVKD cho đại lý
  const handleAssignSubmit = async () => {
    if (!selectedCustomer || !selectedRepId) {
      message.warning("Vui lòng chọn nhân viên kinh doanh phụ trách!");
      return;
    }
    setAssignLoading(true);
    try {
      await assignSalesRep(selectedCustomer.id, selectedRepId);
      message.success(
        `Đã phân công NVKD cho đại lý ${selectedCustomer.name} thành công!`
      );
      setAssignModalOpen(false);
      setSelectedCustomer(null);
      setSelectedRepId(null);
      loadData();
    } catch (err: any) {
      message.error(err.message || "Không thể phân công nhân viên.");
    } finally {
      setAssignLoading(false);
    }
  };

  // Xử lý chuyển giao hàng loạt
  const handleBulkHandover = async () => {
    if (!fromRepId) {
      message.warning("Vui lòng chọn nhân viên cần bàn giao!");
      return;
    }
    if (!toRepId) {
      message.warning("Vui lòng chọn nhân viên mới tiếp nhận!");
      return;
    }
    if (fromRepId === toRepId) {
      message.warning("Nhân viên bàn giao và tiếp nhận không được trùng nhau!");
      return;
    }
    if (!handoverReason.trim()) {
      message.warning("Vui lòng nhập lý do chuyển giao địa bàn!");
      return;
    }

    setHandoverLoading(true);
    try {
      const res = await handoverCustomers({
        frOMSalesRepId: fromRepId,
        toSalesRepId: toRepId,
        reason: handoverReason.trim(),
      });
      message.success(res.message || "Chuyển giao địa bàn hàng loạt thành công!");
      setFromRepId(undefined);
      setToRepId(undefined);
      setHandoverReason("");
      loadData();
      setActiveTab("history");
    } catch (err: any) {
      message.error(err.message || "Lỗi khi chuyển giao địa bàn.");
    } finally {
      setHandoverLoading(false);
    }
  };

  // Định dạng số tiền
  const formatMoney = (val?: number) => {
    if (!val) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  // Đại lý đang phụ trách của NVKD được chọn bàn giao
  const assignedCustomersToHandover = customers.filter(
    (c) => c.sales_rep_id === fromRepId
  );

  // Columns Bảng Đại lý
  const customerColumns: ColumnsType<CustomerItem> = [
    {
      title: "MÃ ĐẠI LÝ",
      dataIndex: "code",
      key: "code",
      render: (code: string) => <Text strong style={{ color: "#1e40af" }}>{code}</Text>,
    },
    {
      title: "TÊN ĐẠI LÝ",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          {record.phone && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              SĐT: {record.phone}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "PHÂN NHÓM",
      dataIndex: "customer_group",
      key: "customer_group",
      render: (grp: string) => {
        const color =
          grp === "DEALER_LEVEL_1" ? "blue" : grp === "DEALER_LEVEL_2" ? "cyan" : "default";
        const label =
          grp === "DEALER_LEVEL_1" ? "Đại lý Cấp 1" : grp === "DEALER_LEVEL_2" ? "Đại lý Cấp 2" : "Khách lẻ";
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "ĐỊA BÀN / KHU VỰC",
      key: "territory",
      render: (_, r) => {
        const terr = territories.find((t) => t.id === r.territory_id);
        const name = r.territory_name || terr?.name;
        return name ? (
          <Tag color="cyan">{name}</Tag>
        ) : (
          <Text type="secondary" style={{ fontStyle: "italic", fontSize: 12 }}>Chưa gán địa bàn</Text>
        );
      },
    },
    {
      title: "NVKD PHỤ TRÁCH CHÍNH",
      key: "sales_rep",
      render: (_, r) => {
        const rep = salesReps.find((s) => s.id === r.sales_rep_id);
        const name = r.sales_rep_name || rep?.full_name || (rep?.username ? `@${rep.username}` : "");
        if (name) {
          return (
            <Tag icon={<UserOutlined />} color="geekblue" style={{ fontSize: 13, padding: "3px 8px", fontWeight: 600 }}>
              {name}
            </Tag>
          );
        }
        return (
          <Tag color="orange" style={{ fontSize: 12 }}>
            Chưa phân công
          </Tag>
        );
      },
    },
    {
      title: "HẠN MỨC NỢ",
      dataIndex: "debt_limit",
      key: "debt_limit",
      render: (limit) => formatMoney(limit),
    },
    {
      title: "DƯ NỢ HIỆN TẠI",
      dataIndex: "current_debt",
      key: "current_debt",
      render: (debt) => (
        <span style={{ color: debt > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
          {formatMoney(debt)}
        </span>
      ),
    },
    {
      title: "TRẠNG THÁI",
      key: "status",
      render: (_, r) => (
        <Tag color={r.is_locked ? "error" : "success"}>
          {r.is_locked ? "Bị khóa" : "Hoạt động"}
        </Tag>
      ),
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 290,
      render: (_, r) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EnvironmentOutlined />}
            onClick={() => {
              setSelectedCustomerForAddress(r);
              setIsAddressModalOpen(true);
            }}
            style={{ color: "#2563eb", borderColor: "#93c5fd" }}
          >
            Điểm giao
          </Button>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<UserSwitchOutlined />}
            onClick={() => {
              setSelectedCustomer(r);
              setSelectedRepId(r.sales_rep_id || null);
              setAssignModalOpen(true);
            }}
          >
            {r.sales_rep_id ? "Đổi NVKD" : "Gán NVKD"}
          </Button>
          <Tooltip title={canEditCreditLimit ? "Điều chỉnh hạn mức tín dụng & ngày nợ" : "Xem hạn mức tín dụng & ngày nợ (Chỉ xem)"}>
            <Button
              size="small"
              icon={<SafetyCertificateOutlined style={{ color: "#059669" }} />}
              onClick={() => setCreditLimitModal({ visible: true, customer: r })}
            >
              {canEditCreditLimit ? "Hạn mức" : "Xem hạn mức"}
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Columns Lịch sử Bàn giao
  const historyColumns: ColumnsType<HandoverLogItem> = [
    {
      title: "THỜI GIAN",
      dataIndex: "created_at",
      key: "created_at",
      render: (d: string) => (d ? new Date(d).toLocaleString("vi-VN") : "—"),
    },
    {
      title: "ĐẠI LÝ",
      key: "customer",
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.customer_name || "—"}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.customer_code}</Text>
        </div>
      ),
    },
    {
      title: "NVKD BÀN GIAO",
      dataIndex: "from_sales_rep_name",
      key: "from_sales_rep_name",
      render: (name) => name || <Text type="secondary">Chưa có (Gán mới)</Text>,
    },
    {
      title: "NVKD TIẾP NHẬN",
      dataIndex: "to_sales_rep_name",
      key: "to_sales_rep_name",
      render: (name) => <Tag color="green" icon={<CheckCircleOutlined />}>{name}</Tag>,
    },
    {
      title: "NGƯỜI THỰC HIỆN",
      dataIndex: "transferred_by_name",
      key: "transferred_by_name",
      render: (name) => name || "Hệ thống",
    },
    {
      title: "LÝ DO BÀN GIAO",
      dataIndex: "reason",
      key: "reason",
      render: (reason) => reason || "—",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tiêu đề trang */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Phân công & Quản lý Địa bàn Đại lý
          </Title>
          <Text type="secondary">
            Phân công nhân viên kinh doanh phụ trách đại lý và bàn giao địa bàn hàng loạt khi có biến động nhân sự.
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<SwapOutlined />}
            onClick={() => setActiveTab("handover")}
            style={{ backgroundColor: "#2563eb" }}
          >
            Chuyển giao hàng loạt
          </Button>
        </Space>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "customers",
              label: (
                <span>
                  <ShopOutlined /> Danh sách Đại lý & Phân công
                </span>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Thanh tìm kiếm & Bộ lọc (Server-side) */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input
                      prefix={<SearchOutlined />}
                      placeholder="Tìm theo mã, tên, SĐT đại lý..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onPressEnter={handleSearch}
                      style={{ width: 260, borderRadius: 8 }}
                      allowClear
                    />
                    <Select
                      value={regionFilter}
                      onChange={(v) => {
                        setRegionFilter(v);
                        fetchCustomersList(1, search, repFilter, v, groupFilter, statusFilter, pageSize);
                      }}
                      style={{ width: 200 }}
                      placeholder="Địa bàn / Khu vực"
                    >
                      <Select.Option value="ALL">Tất cả Địa bàn</Select.Option>
                      {territories.map((t) => (
                        <Select.Option key={t.id} value={t.id}>
                          {t.name}
                        </Select.Option>
                      ))}
                    </Select>
                    <Select
                      value={repFilter}
                      onChange={(v) => {
                        setRepFilter(v);
                        fetchCustomersList(1, search, v, regionFilter, groupFilter, statusFilter, pageSize);
                      }}
                      style={{ width: 220 }}
                      placeholder="Lọc theo NVKD phụ trách"
                    >
                      <Select.Option value="ALL">Tất cả NVKD phụ trách</Select.Option>
                      <Select.Option value="UNASSIGNED">Chưa phân công phụ trách</Select.Option>
                      {salesReps.map((rep) => (
                        <Select.Option key={rep.id} value={String(rep.id)}>
                          {rep.full_name || rep.username}
                        </Select.Option>
                      ))}
                    </Select>
                    <Select
                      value={groupFilter}
                      onChange={(v) => {
                        setGroupFilter(v);
                        fetchCustomersList(1, search, repFilter, regionFilter, v, statusFilter, pageSize);
                      }}
                      style={{ width: 160 }}
                      placeholder="Phân nhóm"
                    >
                      <Select.Option value="ALL">Tất cả nhóm</Select.Option>
                      <Select.Option value="DEALER_LEVEL_1">Đại lý Cấp 1</Select.Option>
                      <Select.Option value="DEALER_LEVEL_2">Đại lý Cấp 2</Select.Option>
                      <Select.Option value="RETAIL">Khách lẻ / Sỉ</Select.Option>
                    </Select>
                    <Select
                      value={statusFilter}
                      onChange={(v) => {
                        setStatusFilter(v);
                        fetchCustomersList(1, search, repFilter, regionFilter, groupFilter, v, pageSize);
                      }}
                      style={{ width: 160 }}
                      placeholder="Trạng thái"
                    >
                      <Select.Option value="ALL">Tất cả trạng thái</Select.Option>
                      <Select.Option value="ACTIVE">Hoạt động</Select.Option>
                      <Select.Option value="LOCKED">Bị khóa</Select.Option>
                    </Select>
                    <Button
                      type="primary"
                      icon={<SearchOutlined />}
                      onClick={handleSearch}
                      style={{ borderRadius: 8 }}
                    >
                      Lọc dữ liệu
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleResetFilter}
                      style={{ borderRadius: 8 }}
                    >
                      Đặt lại
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => setIsCreateCustomerModalOpen(true)}
                      style={{
                        borderRadius: 8,
                        backgroundColor: "#16a34a",
                        fontWeight: 600,
                        marginLeft: "auto",
                      }}
                    >
                      Thêm đại lý mới
                    </Button>
                  </div>

                  {/* Bảng danh sách đại lý (Dữ liệu từ server) */}
                  <Table
                    columns={customerColumns}
                    dataSource={customers}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                      current: currentPage,
                      pageSize: pageSize,
                      total: totalRecords,
                      showTotal: (total) => `Tổng cộng: ${total} đại lý`,
                      showSizeChanger: true,
                      pageSizeOptions: ["10", "15", "20", "50"],
                      onChange: (page, size) => {
                        setPageSize(size);
                        fetchCustomersList(page, search, repFilter, regionFilter, groupFilter, statusFilter, size);
                      },
                    }}
                    bordered
                    size="middle"
                  />
                </div>
              ),
            },
            {
              key: "handover",
              label: (
                <span>
                  <SwapOutlined /> Bàn giao Địa bàn Hàng loạt
                </span>
              ),
              children: (
                <div style={{ maxWidth: 800, margin: "16px auto", display: "flex", flexDirection: "column", gap: 20 }}>
                  <Alert
                    message="Chuyển giao địa bàn hàng loạt"
                    description="Khi nhân viên kinh doanh nghỉ việc hoặc chuyển đổi khu vực phụ trách, chức năng này cho phép chuyển toàn bộ hoặc các đại lý của nhân viên đó sang một nhân viên kinh doanh mới tiếp nhận. Tất cả lịch sử bàn giao sẽ được ghi nhận minh bạch."
                    type="info"
                    showIcon
                  />

                  <Form layout="vertical" style={{ background: "#f8fafc", padding: 24, borderRadius: 12, border: "1px solid #e2e8f0" }}>
                    <Form.Item
                      label={<Text strong>1. Nhân viên bàn giao (Nghỉ việc / Chuyển địa bàn)</Text>}
                      required
                    >
                      <Select
                        placeholder="Chọn nhân viên bàn giao..."
                        value={fromRepId}
                        onChange={(v) => setFromRepId(v)}
                        size="large"
                      >
                        {salesReps.map((rep) => {
                          const count = customers.filter((c) => c.sales_rep_id === rep.id).length;
                          return (
                            <Select.Option key={rep.id} value={rep.id}>
                              {rep.full_name || rep.username} ({count} đại lý đang phụ trách)
                            </Select.Option>
                          );
                        })}
                      </Select>
                    </Form.Item>

                    {fromRepId && (
                      <div style={{ marginBottom: 16, padding: 12, background: "#ffffff", borderRadius: 8, border: "1px solid #cbd5e1" }}>
                        <Text strong>Danh sách đại lý sẽ được chuyển giao ({assignedCustomersToHandover.length} đại lý):</Text>
                        {assignedCustomersToHandover.length === 0 ? (
                          <div style={{ color: "#64748b", marginTop: 4 }}>Nhân viên này hiện không phụ trách đại lý nào.</div>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                            {assignedCustomersToHandover.map((c) => (
                              <Tag key={c.id} color="blue">
                                {c.code} - {c.name}
                              </Tag>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <Form.Item
                      label={<Text strong>2. Nhân viên kinh doanh tiếp nhận</Text>}
                      required
                    >
                      <Select
                        placeholder="Chọn nhân viên mới tiếp nhận bàn giao..."
                        value={toRepId}
                        onChange={(v) => setToRepId(v)}
                        size="large"
                      >
                        {salesReps
                          .filter((rep) => rep.id !== fromRepId)
                          .map((rep) => (
                            <Select.Option key={rep.id} value={rep.id}>
                              {rep.full_name || rep.username}
                            </Select.Option>
                          ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      label={<Text strong>3. Lý do chuyển giao địa bàn</Text>}
                      required
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder="Nhập lý do bàn giao (bắt buộc, ví dụ: Nhân viên nghỉ việc bàn giao tuyến, điều động khu vực kinh doanh...)"
                        value={handoverReason}
                        onChange={(e) => setHandoverReason(e.target.value)}
                      />
                    </Form.Item>

                    <Popconfirm
                      title="Xác nhận chuyển giao địa bàn hàng loạt?"
                      description={`Toàn bộ ${assignedCustomersToHandover.length} đại lý sẽ được chuyển sang nhân viên tiếp nhận.`}
                      onConfirm={handleBulkHandover}
                      okText="Xác nhận"
                      cancelText="Hủy"
                    >
                      <Button
                        type="primary"
                        size="large"
                        icon={<CheckCircleOutlined />}
                        loading={handoverLoading}
                        disabled={assignedCustomersToHandover.length === 0 || !toRepId}
                        style={{ width: "100%", backgroundColor: "#2563eb", height: 46, borderRadius: 8 }}
                      >
                        Thực hiện Chuyển giao hàng loạt
                      </Button>
                    </Popconfirm>
                  </Form>
                </div>
              ),
            },
            {
              key: "history",
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử Chuyển giao Địa bàn
                </span>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Text type="secondary">
                      Nhật ký ghi nhận chi tiết các đợt phân công và chuyển giao đại lý giữa các nhân viên kinh doanh.
                    </Text>
                    <Button icon={<ReloadOutlined />} onClick={() => loadHistory()}>
                      Tải lại lịch sử
                    </Button>
                  </div>
                  <Table
                    columns={historyColumns}
                    dataSource={historyLogs}
                    rowKey="id"
                    loading={historyLoading}
                    pagination={{ pageSize: 15 }}
                    bordered
                    size="middle"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Phân công 1 đại lý */}
      <Modal
        title={`Phân công NVKD cho đại lý: ${selectedCustomer?.name}`}
        open={assignModalOpen}
        onCancel={() => {
          setAssignModalOpen(false);
          setSelectedCustomer(null);
          setSelectedRepId(null);
        }}
        onOk={handleAssignSubmit}
        confirmLoading={assignLoading}
        okText="Lưu phân công"
        cancelText="Hủy"
      >
        <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Text type="secondary">Mã đại lý: </Text>
            <Text strong>{selectedCustomer?.code}</Text>
          </div>
          <div>
            <Text type="secondary">NVKD hiện tại: </Text>
            <Text strong>{selectedCustomer?.sales_rep_name || "Chưa phân công"}</Text>
          </div>
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>
              Chọn Nhân viên kinh doanh chịu trách nhiệm chính:
            </Text>
            <Select
              style={{ width: "100%" }}
              placeholder="Chọn nhân viên kinh doanh..."
              value={selectedRepId}
              onChange={(val) => setSelectedRepId(val)}
            >
              {salesReps.map((rep) => (
                <Select.Option key={rep.id} value={rep.id}>
                  {rep.full_name || rep.username} ({rep.email || "NVKD"})
                </Select.Option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      {/* Modal Thêm Đại Lý Mới */}
      <CreateCustomerModal
        isOpen={isCreateCustomerModalOpen}
        onClose={() => setIsCreateCustomerModalOpen(false)}
        onSuccess={() => loadData()}
      />

      {/* Modal Quản lý điểm giao hàng (SCRUM-20) */}
      <DeliveryAddressesModal
        isOpen={isAddressModalOpen}
        onClose={() => {
          setIsAddressModalOpen(false);
          setSelectedCustomerForAddress(null);
        }}
        customerId={selectedCustomerForAddress?.id || null}
        customerName={selectedCustomerForAddress?.name}
        customerCode={selectedCustomerForAddress?.code}
      />

      {/* Modal Điều chỉnh hạn mức tín dụng & ngày nợ */}
      <CreditLimitModal
        visible={creditLimitModal.visible}
        customer={creditLimitModal.customer}
        onClose={() => setCreditLimitModal({ visible: false, customer: null })}
        onSuccess={() => fetchCustomersList(currentPage)}
      />
    </div>
  );
};

export default CustomerTerritoryManagement;
