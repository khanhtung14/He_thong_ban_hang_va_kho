import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Tabs,
  Table,
  Button,
  Modal,
  Select,
  Input,
  Form,
  Tag,
  Space,
  Popconfirm,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
  message,
  Tooltip,
  Divider,
  Steps,
} from "antd";
import type { TableProps } from "antd";
import {
  TeamOutlined,
  SwapOutlined,
  HistoryOutlined,
  SearchOutlined,
  UserSwitchOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  ArrowRightOutlined,
  UserOutlined,
  EnvironmentOutlined,
  ShopOutlined,
  PlusOutlined,
} from "@ant-design/icons";

import {
  fetchCustomers,
  fetchSalesReps,
  assignSalesToCustomer,
  assignSalesBatch,
  bulkHandoverSales,
  fetchHandoverHistory,
  type CustomerItem,
  type SalesRepUser,
  type HandoverRecord,
} from "../../services/salesAssignmentService";

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export const SalesAssignmentManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("1");

  // ---------------------------------------------------------------------------
  // Data State
  // ---------------------------------------------------------------------------
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRepUser[]>([]);
  const [historyItems, setHistoryItems] = useState<HandoverRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState<number>(0);
  const [historyPage, setHistoryPage] = useState<number>(1);

  const [loadingCustomers, setLoadingCustomers] = useState<boolean>(false);
  const [loadingReps, setLoadingReps] = useState<boolean>(false);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Tab 1: Filters & Selection
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [selectedRegion, setSelectedRegion] = useState<string>("ALL");
  const [selectedRepFilter, setSelectedRepFilter] = useState<string>("ALL");
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Tab 1: Single/Batch Assignment Modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [targetCustomer, setTargetCustomer] = useState<CustomerItem | null>(null);
  const [assignForm] = Form.useForm();
  const [submittingAssign, setSubmittingAssign] = useState<boolean>(false);

  // Tab 2: Bulk Handover Wizard State
  const [fromUserId, setFromUserId] = useState<number | undefined>(undefined);
  const [toUserId, setToUserId] = useState<number | undefined>(undefined);
  const [fromUserCustomers, setFromUserCustomers] = useState<CustomerItem[]>([]);
  const [loadingFromCustomers, setLoadingFromCustomers] = useState<boolean>(false);
  const [selectedHandoverCustomerKeys, setSelectedHandoverCustomerKeys] = useState<React.Key[]>([]);
  const [reasonCategory, setReasonCategory] = useState<string>("Nhân viên nghỉ việc");
  const [customReason, setCustomReason] = useState<string>("");
  const [handoverNotes, setHandoverNotes] = useState<string>("");
  const [submittingHandover, setSubmittingHandover] = useState<boolean>(false);

  // ---------------------------------------------------------------------------
  // Initial Data Load
  // ---------------------------------------------------------------------------
  const loadInitialData = async () => {
    setLoadingCustomers(true);
    setLoadingReps(true);
    try {
      const [custList, repsList] = await Promise.all([
        fetchCustomers(),
        fetchSalesReps(),
      ]);
      setCustomers(custList);
      setSalesReps(repsList);
    } catch (err: any) {
      message.error(err.message || "Không thể tải dữ liệu đại lý và nhân sự.");
    } finally {
      setLoadingCustomers(false);
      setLoadingReps(false);
    }
  };

  const loadHistory = async (page = 1) => {
    setLoadingHistory(true);
    try {
      const res = await fetchHandoverHistory({ page, limit: 10 });
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } catch (err: any) {
      message.error(err.message || "Không thể tải lịch sử bàn giao.");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadInitialData();
    loadHistory(1);
  }, []);

  // ---------------------------------------------------------------------------
  // Tab 1: Phân công đại lý
  // ---------------------------------------------------------------------------
  const regionsList = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.region) set.add(c.region);
    });
    return Array.from(set);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase().trim();
        const matchCode = c.code.toLowerCase().includes(kw);
        const matchName = c.name.toLowerCase().includes(kw);
        const matchPhone = (c.phone || "").toLowerCase().includes(kw);
        if (!matchCode && !matchName && !matchPhone) return false;
      }
      if (selectedRegion !== "ALL" && c.region !== selectedRegion) {
        return false;
      }
      if (selectedRepFilter === "UNASSIGNED" && c.sales_rep_id) {
        return false;
      }
      if (selectedRepFilter === "ASSIGNED" && !c.sales_rep_id) {
        return false;
      }
      if (
        selectedRepFilter !== "ALL" &&
        selectedRepFilter !== "UNASSIGNED" &&
        selectedRepFilter !== "ASSIGNED" &&
        String(c.sales_rep_id) !== selectedRepFilter
      ) {
        return false;
      }
      return true;
    });
  }, [customers, searchKeyword, selectedRegion, selectedRepFilter]);

  const stats = useMemo(() => {
    const total = customers.length;
    const assigned = customers.filter((c) => !!c.sales_rep_id).length;
    const unassigned = total - assigned;
    return { total, assigned, unassigned };
  }, [customers]);

  const openSingleAssignModal = (customer: CustomerItem) => {
    setTargetCustomer(customer);
    assignForm.setFieldsValue({
      sales_user_id: customer.sales_rep_id || undefined,
      region: customer.region || undefined,
    });
    setIsAssignModalOpen(true);
  };

  const openBatchAssignModal = () => {
    if (selectedRowKeys.length === 0) {
      message.warning("Vui lòng chọn ít nhất một đại lý từ danh sách để gán hàng loạt.");
      return;
    }
    setTargetCustomer(null);
    assignForm.resetFields();
    setIsAssignModalOpen(true);
  };

  const handleSaveAssignment = async () => {
    try {
      const values = await assignForm.validateFields();
      setSubmittingAssign(true);

      if (targetCustomer) {
        // Gán đơn lẻ từ bảng
        await assignSalesToCustomer(targetCustomer.id, {
          sales_user_id: values.sales_user_id,
          region: values.region,
        });
        message.success(`Đã phân công thành công đại lý ${targetCustomer.name}!`);
      } else if (selectedRowKeys.length > 0) {
        // Gán hàng loạt từ checkbox
        const ids = selectedRowKeys.map((k) => Number(k));
        await assignSalesBatch(ids, values.sales_user_id, values.region);
        message.success(`Đã phân công hàng loạt ${ids.length} đại lý thành công!`);
        setSelectedRowKeys([]);
      } else if (values.customer_id) {
        // Gán đơn lẻ khi bấm "Phân công mới"
        const chosen = customers.find((c) => c.id === values.customer_id);
        await assignSalesToCustomer(values.customer_id, {
          sales_user_id: values.sales_user_id,
          region: values.region,
        });
        message.success(`Đã phân công thành công đại lý ${chosen?.name || ""}!`);
      }

      setIsAssignModalOpen(false);
      assignForm.resetFields();
      setTargetCustomer(null);
      // Reload danh sách đại lý
      const updated = await fetchCustomers();
      setCustomers(updated);
    } catch (err: any) {
      message.error(err.message || "Không thể thực hiện phân công.");
    } finally {
      setSubmittingAssign(false);
    }
  };

  const customerColumns: TableProps<CustomerItem>["columns"] = [
    {
      title: "Mã ĐL",
      dataIndex: "code",
      key: "code",
      width: 120,
      render: (code: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>,
    },
    {
      title: "Tên Đại Lý",
      dataIndex: "name",
      key: "name",
      render: (name: string, record) => (
        <div>
          <Text strong style={{ fontSize: 14 }}>{name}</Text>
          {record.phone && (
            <div style={{ fontSize: 12, color: "#64748b" }}>
              SĐT: {record.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Khu Vực / Địa Bàn",
      dataIndex: "region",
      key: "region",
      width: 170,
      render: (region?: string) => (
        <span>
          <EnvironmentOutlined style={{ color: "#0284c7", marginRight: 6 }} />
          {region || <Text type="secondary">Chưa cập nhật</Text>}
        </span>
      ),
    },
    {
      title: "NVKD Phụ Trách Chính",
      key: "sales_rep",
      width: 240,
      render: (_: any, record: CustomerItem) => {
        const rep = salesReps.find((r) => r.id === record.sales_rep_id);
        if (rep) {
          return (
            <Tag color="cyan" style={{ padding: "4px 8px", fontSize: 13, borderRadius: 6 }}>
              <UserOutlined style={{ marginRight: 6 }} />
              <span style={{ fontWeight: 600 }}>{rep.full_name}</span>
              <span style={{ color: "#0891b2", marginLeft: 4, fontSize: 11 }}>
                (@{rep.username})
              </span>
            </Tag>
          );
        }
        return (
          <Tag color="orange" style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6 }}>
            <ExclamationCircleOutlined style={{ marginRight: 6 }} />
            Chưa phân công
          </Tag>
        );
      },
    },
    {
      title: "Trạng Thái",
      dataIndex: "is_locked",
      key: "is_locked",
      width: 130,
      render: (locked: boolean) =>
        locked ? (
          <Tag color="error">Đang bị khóa</Tag>
        ) : (
          <Tag color="success">Hoạt động</Tag>
        ),
    },
    {
      title: "Thao Tác",
      key: "action",
      width: 140,
      align: "center",
      render: (_: any, record: CustomerItem) => (
        <Button
          type="primary"
          size="small"
          icon={<UserSwitchOutlined />}
          style={{ borderRadius: 6 }}
          onClick={() => openSingleAssignModal(record)}
        >
          Gán phụ trách
        </Button>
      ),
    },
  ];

  const rowSelection: TableProps<CustomerItem>["rowSelection"] = {
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    },
  };

  // ---------------------------------------------------------------------------
  // Tab 2: Bàn giao hàng loạt
  // ---------------------------------------------------------------------------
  const handleSelectFromUser = async (userId: number) => {
    setFromUserId(userId);
    setSelectedHandoverCustomerKeys([]);
    setLoadingFromCustomers(true);
    try {
      const list = await fetchCustomers({ sales_rep_id: userId });
      setFromUserCustomers(list);
      // Mặc định chọn tất cả đại lý
      setSelectedHandoverCustomerKeys(list.map((c) => c.id));
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách đại lý của nhân viên này.");
      setFromUserCustomers([]);
    } finally {
      setLoadingFromCustomers(false);
    }
  };

  const handleConfirmHandover = async () => {
    if (!fromUserId) {
      message.error("Vui lòng chọn nhân viên bàn giao.");
      return;
    }
    if (!toUserId) {
      message.error("Vui lòng chọn nhân viên tiếp nhận.");
      return;
    }
    if (fromUserId === toUserId) {
      message.error("Nhân viên tiếp nhận phải khác nhân viên bàn giao.");
      return;
    }
    if (selectedHandoverCustomerKeys.length === 0) {
      message.error("Vui lòng chọn ít nhất một đại lý cần bàn giao.");
      return;
    }
    const finalReason =
      reasonCategory === "Khác..." ? customReason.trim() : reasonCategory.trim();
    if (!finalReason) {
      message.error("Vui lòng nhập lý do bàn giao chi tiết.");
      return;
    }

    setSubmittingHandover(true);
    try {
      const payload = {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        customer_ids: selectedHandoverCustomerKeys.map((k) => Number(k)),
        reason: finalReason,
        notes: handoverNotes.trim() || undefined,
      };

      const res = await bulkHandoverSales(payload);
      message.success(
        res.message || `Đã bàn giao thành công ${selectedHandoverCustomerKeys.length} đại lý!`
      );

      // Reset state
      setFromUserId(undefined);
      setToUserId(undefined);
      setFromUserCustomers([]);
      setSelectedHandoverCustomerKeys([]);
      setReasonCategory("Nhân viên nghỉ việc");
      setCustomReason("");
      setHandoverNotes("");

      // Refresh data
      loadInitialData();
      loadHistory(1);
      setActiveTab("3"); // Chuyển sang Tab Lịch sử bàn giao để xem ngay kết quả
    } catch (err: any) {
      message.error(err.message || "Không thể thực hiện bàn giao hàng loạt.");
    } finally {
      setSubmittingHandover(false);
    }
  };

  const fromRep = salesReps.find((r) => r.id === fromUserId);
  const toRep = salesReps.find((r) => r.id === toUserId);

  // ---------------------------------------------------------------------------
  // Tab 3: Lịch sử bàn giao
  // ---------------------------------------------------------------------------
  const historyColumns: TableProps<HandoverRecord>["columns"] = [
    {
      title: "Mã Đợt",
      dataIndex: "code",
      key: "code",
      width: 140,
      render: (code: string) => <Tag color="purple" style={{ fontWeight: 600 }}>{code}</Tag>,
    },
    {
      title: "Thời Gian",
      dataIndex: "handover_date",
      key: "handover_date",
      width: 170,
      render: (dateStr: string) => {
        try {
          const d = new Date(dateStr);
          return (
            <span style={{ fontSize: 13, color: "#334155" }}>
              {d.toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
          );
        } catch {
          return dateStr;
        }
      },
    },
    {
      title: "Người Bàn Giao",
      dataIndex: "from_user_name",
      key: "from_user_name",
      render: (name: string) => (
        <Tag color="red" style={{ fontWeight: 600, padding: "2px 8px" }}>
          {name}
        </Tag>
      ),
    },
    {
      title: "Người Tiếp Nhận",
      dataIndex: "to_user_name",
      key: "to_user_name",
      render: (name: string) => (
        <Tag color="green" style={{ fontWeight: 600, padding: "2px 8px" }}>
          {name}
        </Tag>
      ),
    },
    {
      title: "Số Lượng Đại Lý",
      dataIndex: "customer_count",
      key: "customer_count",
      width: 140,
      align: "center",
      render: (count: number, record: HandoverRecord) => (
        <Tooltip title={`Danh sách ID đại lý: ${record.customer_ids?.join(", ") || "Toàn bộ"}`}>
          <Tag color="blue" style={{ fontSize: 13, padding: "2px 10px", fontWeight: 700 }}>
            {count} đại lý
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: "Lý Do Chuyển Giao",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string, record: HandoverRecord) => (
        <div>
          <Text strong>{reason}</Text>
          {record.notes && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
              Ghi chú: {record.notes}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Người Thực Hiện",
      dataIndex: "transferred_by_name",
      key: "transferred_by_name",
      width: 160,
      render: (name?: string) => (
        <span style={{ color: "#475569", fontSize: 13 }}>
          {name || "Quản lý kinh doanh"}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Phẳng Đồng Bộ Hệ Thống */}
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
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: "#1e293b" }}>
            Phân công &amp; Bàn giao đại lý
          </Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            Quản lý phân công địa bàn, theo dõi người chịu trách nhiệm chính của từng đại lý và
            chuyển giao hàng loạt.
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              loadInitialData();
              loadHistory(historyPage);
              message.success("Đã làm mới dữ liệu!");
            }}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              if (selectedRowKeys.length > 0) {
                openBatchAssignModal();
              } else {
                setTargetCustomer(null);
                assignForm.resetFields();
                setIsAssignModalOpen(true);
              }
            }}
          >
            Phân công mới
          </Button>
        </Space>
      </div>

      {/* 3 Thẻ Thống Kê Phẳng */}
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
            />
          </Card>
        </Col>
      </Row>

      {/* Main Tabs Container */}
      <Card
        bordered={false}
        style={{ borderRadius: 12, boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)" }}
        bodyStyle={{ padding: "16px 24px" }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(k) => {
            setActiveTab(k);
            if (k === "3") loadHistory(1);
          }}
          type="line"
          size="large"
          items={[
            {
              key: "1",
              label: (
                <span>
                  <TeamOutlined /> Phân công phụ trách đại lý
                </span>
              ),
              children: (
                <div>
                  {/* Toolbar & Filters */}
                  <Row
                    justify="space-between"
                    align="middle"
                    gutter={[16, 16]}
                    style={{ marginBottom: 16 }}
                  >
                    <Col xs={24} lg={16}>
                      <Space wrap size="middle">
                        <Input
                          placeholder="Tìm theo mã, tên đại lý hoặc SĐT..."
                          prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                          value={searchKeyword}
                          onChange={(e) => setSearchKeyword(e.target.value)}
                          allowClear
                          style={{ width: 280, borderRadius: 8 }}
                        />

                        <Select
                          value={selectedRegion}
                          onChange={setSelectedRegion}
                          style={{ width: 180 }}
                        >
                          <Option value="ALL">Khu vực: Tất cả</Option>
                          {regionsList.map((r) => (
                            <Option key={r} value={r}>
                              Khu vực: {r}
                            </Option>
                          ))}
                        </Select>

                        <Select
                          value={selectedRepFilter}
                          onChange={setSelectedRepFilter}
                          style={{ width: 220 }}
                        >
                          <Option value="ALL">NVKD: Tất cả</Option>
                          <Option value="ASSIGNED">Đã có người phụ trách</Option>
                          <Option value="UNASSIGNED">Chưa có người phụ trách</Option>
                          {salesReps.map((rep) => (
                            <Option key={rep.id} value={String(rep.id)}>
                              {rep.full_name} (@{rep.username})
                            </Option>
                          ))}
                        </Select>

                        <Button
                          icon={<ReloadOutlined />}
                          onClick={() => loadInitialData()}
                          loading={loadingCustomers}
                          style={{ borderRadius: 8 }}
                        >
                          Làm mới
                        </Button>
                      </Space>
                    </Col>

                    <Col xs={24} lg={8} style={{ textAlign: "right" }}>
                      <Space>
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
                      </Space>
                    </Col>
                  </Row>

                  {/* Batch Selection Banner */}
                  {selectedRowKeys.length > 0 && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginBottom: 16, borderRadius: 8 }}
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

                  {/* Customers Table */}
                  <Table<CustomerItem>
                    rowKey="id"
                    rowSelection={rowSelection}
                    columns={customerColumns}
                    dataSource={filteredCustomers}
                    loading={loadingCustomers}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      pageSizeOptions: ["10", "20", "50"],
                      showTotal: (total) => `Tổng số ${total} đại lý`,
                    }}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                  />
                </div>
              ),
            },
            {
              key: "2",
              label: (
                <span>
                  <SwapOutlined /> Bàn giao địa bàn hàng loạt
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
                    {/* Step 1 & Step 2 Card */}
                    <Col xs={24} md={10}>
                      <Card
                        title="Thông Tin Nhân Sự Bàn Giao"
                        bordered
                        style={{ borderRadius: 10, height: "100%" }}
                      >
                        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                          <div>
                            <Text strong style={{ display: "block", marginBottom: 6 }}>
                              1. Nhân viên bàn giao (From Sales):
                            </Text>
                            <Select
                              placeholder="-- Chọn nhân viên bàn giao --"
                              style={{ width: "100%" }}
                              size="large"
                              loading={loadingReps}
                              value={fromUserId}
                              onChange={handleSelectFromUser}
                              showSearch
                              optionFilterProp="children"
                            >
                              {salesReps.map((r) => {
                                const count = customers.filter(
                                  (c) => c.sales_rep_id === r.id
                                ).length;
                                return (
                                  <Option key={r.id} value={r.id}>
                                    {r.full_name} (@{r.username}) · {count} đại lý
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
                              2. Nhân viên tiếp nhận (To Sales):
                            </Text>
                            <Select
                              placeholder="-- Chọn nhân viên tiếp nhận --"
                              style={{ width: "100%" }}
                              size="large"
                              loading={loadingReps}
                              value={toUserId}
                              onChange={setToUserId}
                              showSearch
                              optionFilterProp="children"
                            >
                              {salesReps
                                .filter((r) => r.id !== fromUserId)
                                .map((r) => (
                                  <Option key={r.id} value={r.id}>
                                    {r.full_name} (@{r.username})
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
                                  Nhân viên nhận: <strong>{toRep.full_name}</strong>
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

                    {/* Step 3: Customers Checklist Card */}
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
                                  title: "Khu vực",
                                  dataIndex: "region",
                                  key: "region",
                                  width: 140,
                                  render: (r) => r || "—",
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
                                    <strong>{fromRep?.full_name}</strong> sang{" "}
                                    <strong>{toRep?.full_name}</strong>?
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
            {
              key: "3",
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử bàn giao
                </span>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 16,
                    }}
                  >
                    <div>
                      <Title level={4} style={{ margin: 0 }}>
                        Nhật Ký Chuyển Giao Đại Lý
                      </Title>
                      <Text type="secondary">
                        Lưu giữ toàn bộ lịch sử bàn giao địa bàn và nhân sự phụ trách phục vụ đối chiếu, kiểm toán
                      </Text>
                    </div>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => loadHistory(historyPage)}
                      loading={loadingHistory}
                      style={{ borderRadius: 8 }}
                    >
                      Tải lại lịch sử
                    </Button>
                  </div>

                  <Table<HandoverRecord>
                    rowKey="id"
                    columns={historyColumns}
                    dataSource={historyItems}
                    loading={loadingHistory}
                    pagination={{
                      current: historyPage,
                      total: historyTotal,
                      pageSize: 10,
                      onChange: (p) => loadHistory(p),
                      showTotal: (total) => `Tổng số ${total} đợt bàn giao`,
                    }}
                    style={{ borderRadius: 8, overflow: "hidden" }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Gán phụ trách (Đơn lẻ, Hàng loạt, hoặc Phân công mới) */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UserSwitchOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>
              {targetCustomer
                ? `Phân Công Phụ Trách: ${targetCustomer.name}`
                : selectedRowKeys.length > 0
                ? `Phân Công Hàng Loạt Cho ${selectedRowKeys.length} Đại Lý`
                : "Phân Công Đại Lý Mới"}
            </span>
          </div>
        }
        open={isAssignModalOpen}
        onOk={handleSaveAssignment}
        onCancel={() => {
          setIsAssignModalOpen(false);
          setTargetCustomer(null);
          assignForm.resetFields();
        }}
        confirmLoading={submittingAssign}
        okText="Lưu Phân Công"
        cancelText="Hủy"
        destroyOnClose
        style={{ borderRadius: 12 }}
      >
        <Form form={assignForm} layout="vertical" style={{ marginTop: 16 }}>
          {targetCustomer ? (
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
                Mã đại lý: <strong>{targetCustomer.code}</strong>
              </div>
              <div style={{ fontSize: 13, color: "#475569" }}>
                Tên đại lý: <strong>{targetCustomer.name}</strong>
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
                      [{c.code}] {c.name} {rep ? `(Phụ trách: ${rep.full_name})` : "(Chưa gán)"}
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
                  {r.full_name} (@{r.username}) {r.phone ? `· ${r.phone}` : ""}
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
    </div>
  );
};

export default SalesAssignmentManager;
