import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  Row,
  Col,
  Statistic,
  Steps,
  Divider,
} from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import {
  SearchOutlined,
  UserSwitchOutlined,
  HistoryOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ShopOutlined,
  UserOutlined,
  PlusOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import CreateCustomerModal from "../admin/CreateCustomerModal";
import DeliveryAddressesModal from "../../components/DeliveryAddressesModal";
import CreditLimitModal from "../../components/CreditLimitModal";
import {
  fetchCustomersWithTotal,
  fetchSalesReps as fetchSalesRepsApi,
  fetchTerritories,
  assignSalesRep,
  type CustomerItem,
  type SalesRepUser,
  type TerritoryItem,
} from "../../services/apiClient";
import {
  fetchCustomers as fetchAllCustomers,
  assignSalesToCustomer,
  assignSalesBatch,
  bulkHandoverSales,
  fetchHandoverHistory,
  type HandoverRecord,
} from "../../services/salesAssignmentService";

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export const CustomerTerritoryManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("customers");
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [selectedCustomerForAddress, setSelectedCustomerForAddress] = useState<CustomerItem | null>(null);

  // Dữ liệu tổng thể dùng để thống kê
  const [allCustomers, setAllCustomers] = useState<CustomerItem[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  // State Danh sách đại lý phân trang & bộ lọc
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

  // Checkbox chọn đại lý hàng loạt ở Tab 1
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // State Modal Điều chỉnh hạn mức tín dụng & ngày nợ
  const [creditLimitModal, setCreditLimitModal] = useState<{
    visible: boolean;
    customer: CustomerItem | null;
  }>({
    visible: false,
    customer: null,
  });

  // State Modal Phân công (Đơn lẻ & Hàng loạt)
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [assignForm] = Form.useForm();
  const [assignLoading, setAssignLoading] = useState(false);

  // State Tab 2: Bàn giao hàng loạt
  const [fromUserId, setFromUserId] = useState<number | undefined>(undefined);
  const [toUserId, setToUserId] = useState<number | undefined>(undefined);
  const [fromUserCustomers, setFromUserCustomers] = useState<CustomerItem[]>([]);
  const [loadingFromCustomers, setLoadingFromCustomers] = useState<boolean>(false);
  const [selectedHandoverCustomerKeys, setSelectedHandoverCustomerKeys] = useState<React.Key[]>([]);
  const [reasonCategory, setReasonCategory] = useState<string>("Nhân viên nghỉ việc");
  const [customReason, setCustomReason] = useState<string>("");
  const [handoverNotes, setHandoverNotes] = useState<string>("");
  const [submittingHandover, setSubmittingHandover] = useState<boolean>(false);

  // State Tab 3: Lịch sử bàn giao
  const [historyItems, setHistoryItems] = useState<HandoverRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(1);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<HandoverRecord | null>(null);

  // Load danh sách tổng để tính thẻ thống kê
  const loadStatsData = useCallback(async () => {
    setLoadingAll(true);
    try {
      const all = await fetchAllCustomers();
      setAllCustomers(all);
    } catch {
      // bỏ qua lỗi stats nếu không thể fetch
    } finally {
      setLoadingAll(false);
    }
  }, []);

  // Tính toán 3 thẻ thống kê ở trên cùng
  const stats = useMemo(() => {
    const list = allCustomers.length > 0 ? allCustomers : customers;
    const total = allCustomers.length > 0 ? allCustomers.length : totalRecords;
    const assigned = list.filter((c) => !!c.sales_rep_id).length;
    const unassigned = Math.max(0, total - assigned);
    return {
      total,
      assigned: allCustomers.length > 0 ? assigned : list.filter((c) => !!c.sales_rep_id).length,
      unassigned: allCustomers.length > 0 ? unassigned : list.filter((c) => !c.sales_rep_id).length,
    };
  }, [allCustomers, customers, totalRecords]);

  // Truy vấn danh sách đại lý phân trang & lọc từ backend
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
    loadStatsData();
  }, [fetchCustomersList, currentPage, loadStatsData]);

  const loadInitialData = useCallback(async () => {
    try {
      const [repsData, terrsData] = await Promise.all([
        fetchSalesRepsApi().catch(() => []),
        fetchTerritories().catch(() => []),
      ]);
      setSalesReps(repsData);
      setTerritories(terrsData);
    } catch {
      // bỏ qua lỗi load phụ
    }
    fetchCustomersList(1);
    loadStatsData();
  }, [fetchCustomersList, loadStatsData]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const handleSearch = () => {
    fetchCustomersList(1, search, repFilter, regionFilter, groupFilter, statusFilter, pageSize);
  };

  const handleResetFilter = () => {
    setSearch("");
    setRepFilter("ALL");
    setRegionFilter("ALL");
    setGroupFilter("ALL");
    setStatusFilter("ALL");
    fetchCustomersList(1, "", "ALL", "ALL", "ALL", "ALL", pageSize);
  };

  // Tải lịch sử bàn giao (Tab 3)
  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await fetchHandoverHistory({ page, limit: 10 });
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } catch (err: any) {
      message.error(err.message || "Lỗi khi tải lịch sử bàn giao.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory(1);
    }
  }, [activeTab, loadHistory]);

  // Modal Phân công (Mở đơn lẻ hoặc Mở hàng loạt)
  const openSingleAssignModal = (customer: CustomerItem) => {
    setSelectedCustomer(customer);
    assignForm.setFieldsValue({
      sales_user_id: customer.sales_rep_id || undefined,
      region: customer.region || customer.territory_name || undefined,
    });
    setAssignModalOpen(true);
  };

  const openBatchAssignModal = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một đại lý từ danh sách để gán hàng loạt.");
      return;
    }
    setSelectedCustomer(null);
    assignForm.resetFields();
    setAssignModalOpen(true);
  };

  const openCreateAssignModal = () => {
    setSelectedCustomer(null);
    assignForm.resetFields();
    setAssignModalOpen(true);
  };

  const handleSaveAssignment = async () => {
    try {
      const values = await assignForm.validateFields();
      setAssignLoading(true);

      if (selectedCustomer) {
        // Gán 1 đại lý
        await assignSalesToCustomer(selectedCustomer.id, {
          sales_user_id: values.sales_user_id,
          region: values.region,
        });
        message.success(`Đã phân công thành công đại lý ${selectedCustomer.name}!`);
      } else if (selectedRowKeys.length > 0) {
        // Gán hàng loạt qua checkbox
        const ids = selectedRowKeys.map((k) => Number(k));
        await assignSalesBatch(ids, values.sales_user_id, values.region);
        message.success(`Đã phân công hàng loạt ${ids.length} đại lý thành công!`);
        setSelectedRowKeys([]);
      } else if (values.customer_id) {
        // Gán qua dropdown chọn đại lý
        const chosen = customers.find((c) => c.id === values.customer_id);
        await assignSalesToCustomer(values.customer_id, {
          sales_user_id: values.sales_user_id,
          region: values.region,
        });
        message.success(`Đã phân công thành công đại lý ${chosen?.name || ""}!`);
      }

      setAssignModalOpen(false);
      assignForm.resetFields();
      setSelectedCustomer(null);
      loadData();
    } catch (err: any) {
      message.error(err.message || "Không thể thực hiện phân công.");
    } finally {
      setAssignLoading(false);
    }
  };

  // Tab 2: Khi chọn nhân viên bàn giao (From User)
  const handleSelectFromUser = async (userId: number) => {
    setFromUserId(userId);
    setSelectedHandoverCustomerKeys([]);
    setLoadingFromCustomers(true);
    try {
      const list = await fetchAllCustomers({ sales_rep_id: userId });
      setFromUserCustomers(list);
      // Mặc định chọn tất cả đại lý của NVKD này để chuyển giao thuận tiện
      setSelectedHandoverCustomerKeys(list.map((c) => c.id));
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách đại lý của nhân viên này.");
      setFromUserCustomers([]);
    } finally {
      setLoadingFromCustomers(false);
    }
  };

  const fromRep = useMemo(
    () => salesReps.find((r) => r.id === fromUserId),
    [salesReps, fromUserId]
  );
  const toRep = useMemo(
    () => salesReps.find((r) => r.id === toUserId),
    [salesReps, toUserId]
  );

  // Tab 2: Xác nhận chuyển giao hàng loạt
  const handleConfirmHandover = async () => {
    if (!fromUserId) {
      message.warning("Vui lòng chọn nhân viên bàn giao!");
      return;
    }
    if (!toUserId) {
      message.warning("Vui lòng chọn nhân viên tiếp nhận!");
      return;
    }
    if (fromUserId === toUserId) {
      message.warning("Nhân viên bàn giao và nhân viên tiếp nhận không được trùng nhau!");
      return;
    }
    if (selectedHandoverCustomerKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất 1 đại lý để bàn giao!");
      return;
    }

    const finalReason =
      reasonCategory === "Khác..."
        ? customReason.trim()
        : reasonCategory;

    if (!finalReason) {
      message.warning("Vui lòng nhập lý do bàn giao địa bàn!");
      return;
    }

    setSubmittingHandover(true);
    try {
      const res = await bulkHandoverSales({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        customer_ids: selectedHandoverCustomerKeys.map((k) => Number(k)),
        reason: finalReason,
        notes: handoverNotes.trim() || undefined,
      });

      message.success(
        res.message ||
          `Đã chuyển giao thành công ${selectedHandoverCustomerKeys.length} đại lý từ ${fromRep?.full_name} sang ${toRep?.full_name}!`
      );

      // Reset form bàn giao
      setFromUserId(undefined);
      setToUserId(undefined);
      setFromUserCustomers([]);
      setSelectedHandoverCustomerKeys([]);
      setHandoverNotes("");
      setCustomReason("");
      setReasonCategory("Nhân viên nghỉ việc");

      // Cập nhật lại dữ liệu & chuyển sang tab Lịch sử
      loadData();
      setActiveTab("history");
    } catch (err: any) {
      message.error(err.message || "Lỗi khi thực hiện bàn giao hàng loạt.");
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Định dạng số tiền
  const formatMoney = (val?: number) => {
    if (!val) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  // Cấu hình chọn dòng cho bảng đại lý (Tab 1)
  const rowSelection: TableProps<CustomerItem>["rowSelection"] = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  // Columns Bảng Đại lý (Tab 1)
  const customerColumns: ColumnsType<CustomerItem> = [
    {
      title: "MÃ ĐẠI LÝ",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (code: string) => (
        <Text strong style={{ color: "#1e40af" }}>
          {code}
        </Text>
      ),
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
      width: 140,
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
      width: 170,
      render: (_, r) => {
        const terr = territories.find((t) => t.id === r.territory_id);
        const name = r.territory_name || terr?.name || r.region;
        return name ? (
          <Tag color="cyan">{name}</Tag>
        ) : (
          <Text type="secondary" style={{ fontStyle: "italic", fontSize: 12 }}>
            Chưa gán địa bàn
          </Text>
        );
      },
    },
    {
      title: "NVKD PHỤ TRÁCH CHÍNH",
      key: "sales_rep",
      width: 220,
      render: (_, r) => {
        const rep = salesReps.find((s) => s.id === r.sales_rep_id);
        const name = r.sales_rep_name || rep?.full_name || (rep?.username ? `@${rep.username}` : "");
        if (name) {
          return (
            <Tag
              icon={<UserOutlined />}
              color="geekblue"
              style={{ fontSize: 13, padding: "3px 8px", fontWeight: 600 }}
            >
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
      width: 140,
      render: (limit) => formatMoney(limit),
    },
    {
      title: "DƯ NỢ HIỆN TẠI",
      dataIndex: "current_debt",
      key: "current_debt",
      width: 140,
      render: (debt) => (
        <span style={{ color: (debt || 0) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
          {formatMoney(debt)}
        </span>
      ),
    },
    {
      title: "TRẠNG THÁI",
      key: "status",
      width: 110,
      render: (_, r) => (
        <Tag color={r.is_locked ? "error" : "success"}>
          {r.is_locked ? "Bị khóa" : "Hoạt động"}
        </Tag>
      ),
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 280,
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
            onClick={() => openSingleAssignModal(r)}
          >
            {r.sales_rep_id ? "Đổi NVKD" : "Gán NVKD"}
          </Button>
          <Tooltip title="Điều chỉnh hạn mức tín dụng & ngày nợ">
            <Button
              size="small"
              icon={<SafetyCertificateOutlined style={{ color: "#059669" }} />}
              onClick={() => setCreditLimitModal({ visible: true, customer: r })}
            >
              Hạn mức
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  // Columns Lịch sử Bàn giao (Tab 3)
  const historyColumns: ColumnsType<HandoverRecord> = [
    {
      title: "THỜI GIAN",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (d: string) => (d ? new Date(d).toLocaleString("vi-VN") : "—"),
    },
    {
      title: "MÃ BIÊN BẢN",
      dataIndex: "code",
      key: "code",
      width: 130,
      render: (code: string) => <Tag color="blue">{code || "—"}</Tag>,
    },
    {
      title: "NVKD BÀN GIAO",
      dataIndex: "from_user_name",
      key: "from_user_name",
      render: (name) => (
        <Space>
          <UserOutlined style={{ color: "#ef4444" }} />
          <Text strong>{name || "Chưa có (Gán mới)"}</Text>
        </Space>
      ),
    },
    {
      title: "NVKD TIẾP NHẬN",
      dataIndex: "to_user_name",
      key: "to_user_name",
      render: (name) => (
        <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 600 }}>
          {name}
        </Tag>
      ),
    },
    {
      title: "SỐ ĐẠI LÝ",
      dataIndex: "customer_count",
      key: "customer_count",
      width: 110,
      align: "center",
      render: (cnt) => <Tag color="cyan">{cnt} đại lý</Tag>,
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
      render: (reason, record) => (
        <div>
          <div>{reason || "—"}</div>
          {record.notes && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Ghi chú: {record.notes}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "CHI TIẾT",
      key: "detail",
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          type="link"
          onClick={() => setSelectedHistoryDetail(record)}
        >
          Xem ĐL
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tiêu đề trang & Thao tác nhanh */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Đại lý & Phân công Địa bàn
          </Title>
          <Text type="secondary">
            Quản lý thông tin đại lý, phân bổ nhân viên kinh doanh phụ trách và bàn giao địa bàn hàng loạt.
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
            Chuyển giao địa bàn
          </Button>
        </Space>
      </div>

      {/* CỤM 3 THẺ THỐNG KÊ Ở TRÊN CÙNG */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={<span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Tổng số đại lý</span>}
              value={stats.total}
              valueStyle={{ fontWeight: 700, color: "#1e293b", fontSize: 24 }}
              prefix={<ShopOutlined style={{ color: "#2563eb", marginRight: 8, fontSize: 22 }} />}
              loading={loadingAll && stats.total === 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={<span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Đã phân công</span>}
              value={stats.assigned}
              valueStyle={{ fontWeight: 700, color: "#16a34a", fontSize: 24 }}
              prefix={<CheckCircleOutlined style={{ color: "#16a34a", marginRight: 8, fontSize: 22 }} />}
              loading={loadingAll && stats.total === 0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card
            bordered
            style={{ borderRadius: 10, backgroundColor: "#ffffff" }}
            bodyStyle={{ padding: "16px 20px" }}
          >
            <Statistic
              title={<span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Chưa phân công</span>}
              value={stats.unassigned}
              valueStyle={{ fontWeight: 700, color: "#d97706", fontSize: 24 }}
              prefix={<ExclamationCircleOutlined style={{ color: "#d97706", marginRight: 8, fontSize: 22 }} />}
              loading={loadingAll && stats.total === 0}
            />
          </Card>
        </Col>
      </Row>

      {/* Card chứa hệ thống 3 Tab chính */}
      <Card
        bordered={false}
        style={{ borderRadius: 12, boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)" }}
        bodyStyle={{ padding: "16px 24px" }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => {
            setActiveTab(k);
            if (k === "history") loadHistory(1);
          }}
          type="line"
          size="large"
          items={[
            // =====================================================================
            // TAB 1: DANH SÁCH ĐẠI LÝ & PHÂN CÔNG
            // =====================================================================
            {
              key: "customers",
              label: (
                <span>
                  <TeamOutlined /> Danh sách Đại lý & Phân công
                </span>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Thanh tìm kiếm & Bộ lọc */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input
                      prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
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
                      style={{ width: 190 }}
                      placeholder="Địa bàn / Khu vực"
                    >
                      <Option value="ALL">Tất cả Địa bàn</Option>
                      {territories.map((t) => (
                        <Option key={t.id} value={t.id}>
                          {t.name}
                        </Option>
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
                      <Option value="ALL">Tất cả NVKD phụ trách</Option>
                      <Option value="UNASSIGNED">Chưa phân công phụ trách</Option>
                      {salesReps.map((rep) => (
                        <Option key={rep.id} value={String(rep.id)}>
                          {rep.full_name || rep.username}
                        </Option>
                      ))}
                    </Select>
                    <Select
                      value={groupFilter}
                      onChange={(v) => {
                        setGroupFilter(v);
                        fetchCustomersList(1, search, repFilter, regionFilter, v, statusFilter, pageSize);
                      }}
                      style={{ width: 150 }}
                      placeholder="Phân nhóm"
                    >
                      <Option value="ALL">Tất cả nhóm</Option>
                      <Option value="DEALER_LEVEL_1">Đại lý Cấp 1</Option>
                      <Option value="DEALER_LEVEL_2">Đại lý Cấp 2</Option>
                      <Option value="RETAIL">Khách lẻ / Sỉ</Option>
                    </Select>
                    <Select
                      value={statusFilter}
                      onChange={(v) => {
                        setStatusFilter(v);
                        fetchCustomersList(1, search, repFilter, regionFilter, groupFilter, v, pageSize);
                      }}
                      style={{ width: 150 }}
                      placeholder="Trạng thái"
                    >
                      <Option value="ALL">Tất cả trạng thái</Option>
                      <Option value="ACTIVE">Hoạt động</Option>
                      <Option value="LOCKED">Bị khóa</Option>
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

                    <Space style={{ marginLeft: "auto" }}>
                      {selectedRowKeys.length > 0 && (
                        <Button
                          type="primary"
                          icon={<UserSwitchOutlined />}
                          style={{
                            backgroundColor: "#059669",
                            borderColor: "#059669",
                            borderRadius: 8,
                            fontWeight: 600,
                          }}
                          onClick={openBatchAssignModal}
                        >
                          Gán hàng loạt ({selectedRowKeys.length} đại lý)
                        </Button>
                      )}
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setIsCreateCustomerModalOpen(true)}
                        style={{
                          borderRadius: 8,
                          backgroundColor: "#16a34a",
                          fontWeight: 600,
                        }}
                      >
                        Thêm đại lý mới
                      </Button>
                    </Space>
                  </div>

                  {/* Banner chọn hàng loạt khi có tickbox */}
                  {selectedRowKeys.length > 0 && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ borderRadius: 8 }}
                      message={
                        <Space>
                          <span>
                            Đang chọn <strong>{selectedRowKeys.length}</strong> đại lý.
                          </span>
                          <Button
                            type="link"
                            size="small"
                            onClick={() => setSelectedRowKeys([])}
                          >
                            Bỏ chọn tất cả
                          </Button>
                        </Space>
                      }
                    />
                  )}

                  {/* Bảng danh sách đại lý */}
                  <Table<CustomerItem>
                    rowSelection={rowSelection}
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

            // =====================================================================
            // TAB 2: BÀN GIAO ĐỊA BÀN HÀNG LOẠT
            // =====================================================================
            {
              key: "handover",
              label: (
                <span>
                  <SwapOutlined /> Bàn giao Địa bàn Hàng loạt
                </span>
              ),
              children: (
                <div style={{ maxWidth: 1100, margin: "0 auto", padding: "12px 0" }}>
                  <Steps
                    current={fromUserId ? (toUserId ? 2 : 1) : 0}
                    style={{ marginBottom: 32 }}
                    items={[
                      {
                        title: "Bước 1: Nhân viên bàn giao",
                        description: "Chọn nhân sự cũ chuyển công tác / nghỉ việc",
                      },
                      {
                        title: "Bước 2: Nhân viên tiếp nhận",
                        description: "Chọn nhân sự mới phụ trách thay thế",
                      },
                      {
                        title: "Bước 3: Xác nhận danh sách",
                        description: "Kiểm tra đại lý & lưu biên bản bàn giao",
                      },
                    ]}
                  />

                  <Row gutter={[24, 24]}>
                    {/* Cột trái: Thông tin nhân sự & Lý do */}
                    <Col xs={24} md={10}>
                      <Card
                        title="Thông Tin Nhân Sự Bàn Giao"
                        bordered
                        style={{ borderRadius: 10, height: "100%" }}
                      >
                        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                          <div>
                            <Text strong style={{ display: "block", marginBottom: 6 }}>
                              1. Nhân viên bàn giao (Nghỉ việc / Chuyển vùng):
                            </Text>
                            <Select
                              placeholder="-- Chọn nhân viên bàn giao --"
                              style={{ width: "100%" }}
                              size="large"
                              value={fromUserId}
                              onChange={handleSelectFromUser}
                              showSearch
                              optionFilterProp="children"
                            >
                              {salesReps.map((r) => {
                                const count = (allCustomers.length > 0 ? allCustomers : customers).filter(
                                  (c) => c.sales_rep_id === r.id
                                ).length;
                                return (
                                  <Option key={r.id} value={r.id}>
                                    {r.full_name || r.username} ({count} đại lý)
                                  </Option>
                                );
                              })}
                            </Select>
                            {fromRep && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "8px 12px",
                                  backgroundColor: "#f8fafc",
                                  borderRadius: 6,
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                <div style={{ fontSize: 13, color: "#334155" }}>
                                  Email: <strong>{fromRep.email}</strong>
                                </div>
                                <div style={{ fontSize: 13, color: "#334155" }}>
                                  Đang phụ trách:{" "}
                                  <Tag color="blue">{fromUserCustomers.length} đại lý</Tag>
                                </div>
                              </div>
                            )}
                          </div>

                          <Divider style={{ margin: "8px 0" }}>
                            <ArrowRightOutlined style={{ color: "#2563eb" }} />
                          </Divider>

                          <div>
                            <Text strong style={{ display: "block", marginBottom: 6 }}>
                              2. Nhân viên tiếp nhận (NVKD mới thay thế):
                            </Text>
                            <Select
                              placeholder="-- Chọn nhân viên tiếp nhận --"
                              style={{ width: "100%" }}
                              size="large"
                              value={toUserId}
                              onChange={setToUserId}
                              showSearch
                              optionFilterProp="children"
                            >
                              {salesReps
                                .filter((r) => r.id !== fromUserId)
                                .map((r) => (
                                  <Option key={r.id} value={r.id}>
                                    {r.full_name || r.username}
                                  </Option>
                                ))}
                            </Select>
                            {toRep && (
                              <div
                                style={{
                                  marginTop: 8,
                                  padding: "8px 12px",
                                  backgroundColor: "#f0fdf4",
                                  borderRadius: 6,
                                  border: "1px solid #bbf7d0",
                                }}
                              >
                                <div style={{ fontSize: 13, color: "#166534" }}>
                                  Nhân viên nhận: <strong>{toRep.full_name || toRep.username}</strong>
                                </div>
                                <div style={{ fontSize: 13, color: "#166534" }}>
                                  Email: {toRep.email}
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <Text strong style={{ display: "block", marginBottom: 6 }}>
                              Lý do bàn giao (Bắt buộc):
                            </Text>
                            <Select
                              style={{ width: "100%" }}
                              size="large"
                              value={reasonCategory}
                              onChange={(val) => {
                                setReasonCategory(val);
                                if (val !== "Khác...") {
                                  setCustomReason("");
                                }
                              }}
                            >
                              <Option value="Nhân viên nghỉ việc">Nhân viên nghỉ việc</Option>
                              <Option value="Điều chuyển công tác / địa bàn">
                                Điều chuyển công tác / địa bàn
                              </Option>
                              <Option value="Tái cơ cấu đội ngũ">Tái cơ cấu đội ngũ</Option>
                              <Option value="Khác...">Khác...</Option>
                            </Select>

                            {reasonCategory === "Khác..." && (
                              <div style={{ marginTop: 8 }}>
                                <TextArea
                                  rows={3}
                                  placeholder="Nhập lý do bàn giao chi tiết (Bắt buộc)..."
                                  value={customReason}
                                  onChange={(e) => setCustomReason(e.target.value)}
                                />
                              </div>
                            )}
                          </div>

                          <div>
                            <Text strong style={{ display: "block", marginBottom: 6 }}>
                              Ghi chú bổ sung:
                            </Text>
                            <TextArea
                              rows={3}
                              placeholder="Nhập ghi chú bàn giao hồ sơ, công nợ, hợp đồng..."
                              value={handoverNotes}
                              onChange={(e) => setHandoverNotes(e.target.value)}
                            />
                          </div>
                        </Space>
                      </Card>
                    </Col>

                    {/* Cột phải: Danh sách đại lý chuyển giao & Nút xác nhận */}
                    <Col xs={24} md={14}>
                      <Card
                        title={
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>3. Danh Sách Đại Lý Chuyển Giao</span>
                            {fromUserCustomers.length > 0 && (
                              <Tag color="cyan">
                                Đã chọn {selectedHandoverCustomerKeys.length} / {fromUserCustomers.length}
                              </Tag>
                            )}
                          </div>
                        }
                        bordered
                        style={{ borderRadius: 10, height: "100%", display: "flex", flexDirection: "column" }}
                        bodyStyle={{ flex: 1, display: "flex", flexDirection: "column" }}
                      >
                        {!fromUserId ? (
                          <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
                            <UserOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                            <div>Vui lòng chọn <strong>Nhân viên bàn giao</strong> ở bước 1 để tải danh sách đại lý.</div>
                          </div>
                        ) : fromUserCustomers.length === 0 ? (
                          <div style={{ padding: "40px 20px", textAlign: "center" }}>
                            <Alert
                              type="warning"
                              showIcon
                              message="Nhân viên này hiện không phụ trách đại lý nào."
                              description="Bạn có thể chọn nhân viên khác hoặc gán đại lý cho nhân viên này trước."
                            />
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 16 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Text type="secondary" style={{ fontSize: 13 }}>
                                Tick chọn các đại lý cần chuyển giao sang nhân sự mới:
                              </Text>
                              <Space>
                                <Button
                                  size="small"
                                  onClick={() => setSelectedHandoverCustomerKeys(fromUserCustomers.map((c) => c.id))}
                                >
                                  Chọn tất cả
                                </Button>
                                <Button
                                  size="small"
                                  onClick={() => setSelectedHandoverCustomerKeys([])}
                                >
                                  Bỏ chọn
                                </Button>
                              </Space>
                            </div>

                            <Table<CustomerItem>
                              rowKey="id"
                              size="small"
                              rowSelection={{
                                selectedRowKeys: selectedHandoverCustomerKeys,
                                onChange: (keys) => setSelectedHandoverCustomerKeys(keys),
                              }}
                              dataSource={fromUserCustomers}
                              loading={loadingFromCustomers}
                              pagination={{ pageSize: 6 }}
                              columns={[
                                {
                                  title: "Mã",
                                  dataIndex: "code",
                                  key: "code",
                                  width: 100,
                                  render: (c) => <Tag color="blue">{c}</Tag>,
                                },
                                {
                                  title: "Tên đại lý",
                                  dataIndex: "name",
                                  key: "name",
                                },
                                {
                                  title: "Khu vực / Địa bàn",
                                  dataIndex: "region",
                                  key: "region",
                                  width: 150,
                                  render: (r, row) => r || row.territory_name || "—",
                                },
                              ]}
                            />

                            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #f1f5f9", textAlign: "right" }}>
                              <Popconfirm
                                title="Xác nhận bàn giao đại lý hàng loạt?"
                                description={
                                  <div style={{ maxWidth: 320 }}>
                                    Bạn có chắc chắn muốn chuyển giao{" "}
                                    <strong>{selectedHandoverCustomerKeys.length} đại lý</strong> từ{" "}
                                    <strong>{fromRep?.full_name || fromRep?.username}</strong> sang{" "}
                                    <strong>{toRep?.full_name || toRep?.username}</strong>?
                                  </div>
                                }
                                onConfirm={handleConfirmHandover}
                                okText="Bàn giao ngay"
                                cancelText="Hủy bỏ"
                                okButtonProps={{
                                  danger: true,
                                  loading: submittingHandover,
                                }}
                                disabled={
                                  !fromUserId ||
                                  !toUserId ||
                                  selectedHandoverCustomerKeys.length === 0
                                }
                              >
                                <Button
                                  type="primary"
                                  size="large"
                                  icon={<SwapOutlined />}
                                  style={{
                                    backgroundColor: "#2563eb",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                  }}
                                  loading={submittingHandover}
                                  disabled={
                                    !fromUserId ||
                                    !toUserId ||
                                    selectedHandoverCustomerKeys.length === 0
                                  }
                                >
                                  Xác Nhận Bàn Giao Hàng Loạt
                                </Button>
                              </Popconfirm>
                            </div>
                          </div>
                        )}
                      </Card>
                    </Col>
                  </Row>
                </div>
              ),
            },

            // =====================================================================
            // TAB 3: LỊCH SỬ CHUYỂN GIAO ĐỊA BÀN
            // =====================================================================
            {
              key: "history",
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử Chuyển giao Địa bàn
                </span>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <Title level={4} style={{ margin: 0 }}>
                        Nhật Ký Chuyển Giao & Phân Công Địa Bàn
                      </Title>
                      <Text type="secondary">
                        Lưu giữ đầy đủ lịch sử bàn giao giữa các nhân viên kinh doanh để quản lý và đối soát minh bạch.
                      </Text>
                    </div>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => loadHistory(historyPage)}
                      loading={historyLoading}
                      style={{ borderRadius: 8 }}
                    >
                      Tải lại lịch sử
                    </Button>
                  </div>

                  <Table<HandoverRecord>
                    rowKey="id"
                    columns={historyColumns}
                    dataSource={historyItems}
                    loading={historyLoading}
                    pagination={{
                      current: historyPage,
                      total: historyTotal,
                      pageSize: 10,
                      onChange: (p) => loadHistory(p),
                      showTotal: (total) => `Tổng số ${total} đợt bàn giao`,
                    }}
                    bordered
                    size="middle"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Phân công (Đơn lẻ & Hàng loạt) */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserSwitchOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              {selectedCustomer
                ? `Phân Công Phụ Trách: ${selectedCustomer.name}`
                : selectedRowKeys.length > 0
                ? `Phân Công Hàng Loạt Cho ${selectedRowKeys.length} Đại Lý`
                : "Phân Công Đại Lý Mới"}
            </span>
          </div>
        }
        open={assignModalOpen}
        onOk={handleSaveAssignment}
        onCancel={() => {
          setAssignModalOpen(false);
          setSelectedCustomer(null);
          assignForm.resetFields();
        }}
        confirmLoading={assignLoading}
        okText="Lưu Phân Công"
        cancelText="Hủy"
        destroyOnClose
        style={{ borderRadius: 12 }}
      >
        <Form form={assignForm} layout="vertical" style={{ marginTop: 16 }}>
          {selectedCustomer ? (
            <div
              style={{
                backgroundColor: "#f8fafc",
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 16,
                border: "1px solid #e2e8f0",
              }}
            >
              <div style={{ fontSize: 13, color: "#475569" }}>
                Mã đại lý: <strong>{selectedCustomer.code}</strong>
              </div>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Tên đại lý: <strong>{selectedCustomer.name}</strong>
              </div>
            </div>
          ) : selectedRowKeys.length > 0 ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Bạn đang chuẩn bị cập nhật người phụ trách chính cho ${selectedRowKeys.length} đại lý được chọn.`}
            />
          ) : (
            <Form.Item
              name="customer_id"
              label="Chọn đại lý cần phân công"
              rules={[{ required: true, message: "Vui lòng chọn đại lý!" }]}
            >
              <Select
                placeholder="-- Tìm và chọn đại lý --"
                size="large"
                showSearch
                optionFilterProp="children"
              >
                {customers.map((c) => {
                  const rep = salesReps.find((r) => r.id === c.sales_rep_id);
                  return (
                    <Option key={c.id} value={c.id}>
                      [{c.code}] {c.name} {rep ? `(Phụ trách: ${rep.full_name || rep.username})` : "(Chưa gán)"}
                    </Option>
                  );
                })}
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="sales_user_id"
            label="Nhân viên kinh doanh phụ trách chính"
            rules={[{ required: true, message: "Vui lòng chọn nhân viên kinh doanh!" }]}
          >
            <Select
              placeholder="-- Chọn nhân viên kinh doanh --"
              size="large"
              showSearch
              optionFilterProp="children"
            >
              {salesReps.map((r) => (
                <Option key={r.id} value={r.id}>
                  {r.full_name || r.username} {r.phone ? `· ${r.phone}` : ""}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="region"
            label="Khu vực / Địa bàn phụ trách"
            tooltip="Tùy chọn cập nhật vùng thị trường cho đại lý (ví dụ: Miền Bắc, Hà Nội - Cầu Giấy...)"
          >
            <Input placeholder="Ví dụ: Hà Nội, TP.HCM, Miền Bắc..." size="large" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Xem chi tiết danh sách đại lý của 1 đợt bàn giao */}
      <Modal
        title={`Chi tiết bàn giao: ${selectedHistoryDetail?.code || ""}`}
        open={!!selectedHistoryDetail}
        onCancel={() => setSelectedHistoryDetail(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedHistoryDetail(null)}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedHistoryDetail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#f8fafc", padding: 12, borderRadius: 8 }}>
              <div>Từ: <strong>{selectedHistoryDetail.from_user_name || "—"}</strong></div>
              <div>Đến: <strong>{selectedHistoryDetail.to_user_name}</strong></div>
              <div>Lý do: {selectedHistoryDetail.reason}</div>
              <div>Số lượng đại lý: <Tag color="blue">{selectedHistoryDetail.customer_count}</Tag></div>
            </div>
            <div>
              <Text strong>ID các đại lý được chuyển giao:</Text>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(selectedHistoryDetail.customer_ids || []).map((cid) => (
                  <Tag key={cid} color="geekblue">
                    ID #{cid}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Thêm đại lý mới */}
      <CreateCustomerModal
        open={isCreateCustomerModalOpen}
        onCancel={() => setIsCreateCustomerModalOpen(false)}
        onSuccess={() => {
          setIsCreateCustomerModalOpen(false);
          loadData();
        }}
      />

      {/* Modal Quản lý Điểm giao hàng */}
      {selectedCustomerForAddress && (
        <DeliveryAddressesModal
          open={isAddressModalOpen}
          customer={selectedCustomerForAddress}
          onClose={() => {
            setIsAddressModalOpen(false);
            setSelectedCustomerForAddress(null);
          }}
        />
      )}

      {/* Modal Điều chỉnh hạn mức tín dụng */}
      <CreditLimitModal
        visible={creditLimitModal.visible}
        customer={creditLimitModal.customer}
        onClose={() => setCreditLimitModal({ visible: false, customer: null })}
        onSuccess={() => {
          loadData();
        }}
      />
    </div>
  );
};

export default CustomerTerritoryManagement;
