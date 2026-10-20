import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Space,
  Typography,
  message,
  Tabs,
  Row,
  Col,
  Statistic,
  Alert,
  Tooltip,
  DatePicker,
  Popconfirm,
  Badge,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AuditOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  BookOutlined,
  WarningOutlined,
} from "@ant-design/icons";

import {
  fetchAdjustments,
  fetchAdjustmentDetail,
  createAdjustment,
  approveAdjustment,
  rejectAdjustment,
  fetchStockCards,
  fetchWarehousesList,
  fetchLotsList,
  type InventoryAdjustmentDetail,
  type InventoryAdjustmentItemDetail,
  type CreateAdjustmentPayload,
  type CreateAdjustmentPayloadItem,
  type StockCardEntry,
} from "../../services/apiClient";
import { authenticatedFetch } from "../../services/sessionService";

const { Title, Text } = Typography;
const { Option } = Select;

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  baseUnit?: string;
  base_unit?: string;
  costPrice?: number;
  cost_price?: number;
  available_quantity?: number;
  available_qty?: number;
  stock_available?: number;
}

interface CreateAdjustmentFormValues {
  warehouseId: number;
  reason: string;
  note?: string;
}

interface InventoryAdjustmentManagementProps {
  currentUser?: {
    id?: number;
    username?: string;
    role?: string;
    full_name?: string;
  } | null;
  initialTab?: string;
}

export const InventoryAdjustmentManagement: React.FC<
  InventoryAdjustmentManagementProps
> = ({ currentUser, initialTab }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab || "adjustments");
  const [prevInitialTab, setPrevInitialTab] = useState<string | undefined>(initialTab);
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    setActiveTab(initialTab || "adjustments");
  }

  // Filter states for Adjustments
  const [warehouseFilter, setWarehouseFilter] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [reasonFilter, setReasonFilter] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalRecords, setTotalRecords] = useState<number>(0);

  // Data states
  const [adjustments, setAdjustments] = useState<InventoryAdjustmentDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Detail Modal state
  const [selectedAdjustment, setSelectedAdjustment] = useState<InventoryAdjustmentDetail | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [formWarehouseId, setFormWarehouseId] = useState<number | undefined>(undefined);
  const [formItems, setFormItems] = useState<
    Array<{
      key: string;
      productId: number;
      productName: string;
      sku: string;
      baseUnit: string;
      costPrice: number;
      availableQty: number;
      lotNumber?: string;
      adjustQty: number;
      lossValue: number;
      note?: string;
      availableLots?: Array<{ lotNumber: string; quantity: number }>;
    }>
  >([]);

  // Approve / Reject state
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Stock Cards states
  const [cardWarehouseId, setCardWarehouseId] = useState<number | undefined>(undefined);
  const [cardProductId, setCardProductId] = useState<number | undefined>(undefined);
  const [cardFromDate, setCardFromDate] = useState<string | undefined>(undefined);
  const [cardToDate, setCardToDate] = useState<string | undefined>(undefined);
  const [cardPage, setCardPage] = useState<number>(1);
  const [cardTotal, setCardTotal] = useState<number>(0);
  const [stockCards, setStockCards] = useState<StockCardEntry[]>([]);
  const [cardLoading, setCardLoading] = useState<boolean>(false);

  // Load Initial Warehouses & Products
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const whs = await fetchWarehousesList();
        setWarehouses(whs);

        const prodRes = await authenticatedFetch("/api/v1/products");
        if (prodRes.ok) {
          const prodJson = await prodRes.json();
          setProducts(prodJson.data || prodJson || []);
        }
      } catch (err) {
        console.error("Lỗi tải danh mục:", err);
      }
    };
    loadMetadata();
  }, []);

  // Load Adjustments List
  const loadAdjustments = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    try {
      const res = await fetchAdjustments({
        warehouseId: warehouseFilter,
        status: statusFilter,
        reason: reasonFilter,
        page: currentPage,
        limit: pageSize,
      });
      setAdjustments(res.data || []);
      setTotalRecords(res.pagination?.totalRecords || (res.data ? res.data.length : 0));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Không thể tải danh sách phiếu điều chỉnh.");
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter, statusFilter, reasonFilter, currentPage, pageSize]);

  useEffect(() => {
    if (activeTab === "adjustments") {
      const timer = setTimeout(() => {
        void loadAdjustments();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loadAdjustments]);

  // Load Stock Cards
  const loadStockCards = useCallback(async () => {
    await Promise.resolve();
    setCardLoading(true);
    try {
      const res = await fetchStockCards({
        warehouseId: cardWarehouseId,
        productId: cardProductId,
        fromDate: cardFromDate,
        toDate: cardToDate,
        page: cardPage,
        limit: 20,
      });
      setStockCards(res.data || []);
      setCardTotal(res.pagination?.totalRecords || (res.data ? res.data.length : 0));
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Không thể tải dữ liệu thẻ kho.");
    } finally {
      setCardLoading(false);
    }
  }, [cardWarehouseId, cardProductId, cardFromDate, cardToDate, cardPage]);

  useEffect(() => {
    if (activeTab === "stock-cards") {
      const timer = setTimeout(() => {
        void loadStockCards();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loadStockCards]);

  // View Detail
  const handleViewDetail = async (id: number) => {
    setDetailLoading(true);
    setIsDetailModalOpen(true);
    try {
      const detail = await fetchAdjustmentDetail(id);
      setSelectedAdjustment(detail);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Không thể tải chi tiết phiếu.");
    } finally {
      setDetailLoading(false);
    }
  };

  // Check if current user is the creator of the slip
  const isCreator = useCallback(
    (slip: InventoryAdjustmentDetail | null): boolean => {
      if (!slip || !currentUser) return false;
      if (slip.createdById && currentUser.id && slip.createdById === currentUser.id) {
        return true;
      }
      if (slip.createdByName && currentUser.username && slip.createdByName === currentUser.username) {
        return true;
      }
      return false;
    },
    [currentUser]
  );

  // Check if current user can approve/reject: strictly WH Manager only, not Admin
  const canApprove = useCallback(
    (slip: InventoryAdjustmentDetail | null): boolean => {
      if (!slip) return false;
      if (slip.status !== "PENDING") return false;
      const role = (currentUser?.role || "").toUpperCase();
      const isManager = role.includes("WH_MANAGER") || role.includes("QUAN_LY_KHO");
      if (!isManager) return false;
      // Creator CANNOT approve/reject their own slip
      return !isCreator(slip);
    },
    [currentUser, isCreator]
  );

  // Approve action
  const handleApprove = async (slipId: number, note?: string) => {
    setActionLoading(true);
    try {
      await approveAdjustment(slipId, note || "Đã kiểm tra thực tế, phê duyệt điều chỉnh tồn kho.");
      message.success("Phê duyệt phiếu điều chỉnh thành công! Tồn kho và Thẻ kho đã được cập nhật.");
      setIsDetailModalOpen(false);
      loadAdjustments();
      if (activeTab === "stock-cards") {
        loadStockCards();
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi khi phê duyệt phiếu điều chỉnh.");
    } finally {
      setActionLoading(false);
    }
  };

  // Reject action
  const handleRejectSubmit = async () => {
    if (!rejectingId) return;
    if (!rejectReason.trim()) {
      message.error("Vui lòng nhập lý do từ chối.");
      return;
    }
    setActionLoading(true);
    try {
      await rejectAdjustment(rejectingId, rejectReason.trim());
      message.success("Đã từ chối phiếu điều chỉnh.");
      setIsRejectModalOpen(false);
      setIsDetailModalOpen(false);
      setRejectReason("");
      setRejectingId(null);
      loadAdjustments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Lỗi khi từ chối phiếu điều chỉnh.");
    } finally {
      setActionLoading(false);
    }
  };

  // Add Item to Create Form
  const handleAddItem = (productId: number) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    const key = `${productId}-${Date.now()}`;
    const cost = Number(prod.costPrice || prod.cost_price || 0);

    const newItem = {
      key,
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      baseUnit: prod.baseUnit || prod.base_unit || "Đơn vị",
      costPrice: cost,
      availableQty: Number(prod.available_quantity || prod.available_qty || prod.stock_available || 100),
      adjustQty: 1,
      lossValue: cost * 1,
      note: "",
    };

    setFormItems((prev) => [...prev, newItem]);

    // Load Lots if warehouse is selected
    if (formWarehouseId) {
      fetchLotsList(prod.id, formWarehouseId).then((lots) => {
        setFormItems((current) =>
          current.map((item) => (item.key === key ? { ...item, availableLots: lots } : item))
        );
      });
    }
  };

  // Remove Item from Create Form
  const handleRemoveItem = (key: string) => {
    setFormItems((prev) => prev.filter((i) => i.key !== key));
  };

  // Update Item in Create Form
  const handleUpdateItem = (key: string, field: string, value: string | number | undefined) => {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item;
        const updated = { ...item, [field]: value };
        if (field === "adjustQty" || field === "costPrice") {
          const qty = field === "adjustQty" ? Number(value || 0) : item.adjustQty;
          const cost = field === "costPrice" ? Number(value || 0) : item.costPrice;
          updated.lossValue = Math.round(qty * cost);
        }
        return updated;
      })
    );
  };

  // Total loss in create form
  const totalFormLossValue = useMemo(() => {
    return formItems.reduce((acc, cur) => acc + (cur.lossValue || 0), 0);
  }, [formItems]);

  // Submit Create Form
  const handleCreateSubmit = async (values: CreateAdjustmentFormValues) => {
    if (formItems.length === 0) {
      message.error("Vui lòng thêm ít nhất một sản phẩm vào phiếu điều chỉnh.");
      return;
    }

    for (const item of formItems) {
      if (!item.adjustQty || item.adjustQty <= 0) {
        message.error(`Sản phẩm ${item.productName} phải có số lượng điều chỉnh > 0.`);
        return;
      }
    }

    setCreateLoading(true);
    try {
      const payload: CreateAdjustmentPayload = {
        warehouseId: values.warehouseId,
        reason: values.reason,
        note: values.note,
        lossValue: totalFormLossValue,
        items: formItems.map((i): CreateAdjustmentPayloadItem => ({
          productId: i.productId,
          lotNumber: i.lotNumber || undefined,
          adjustQty: -Math.abs(i.adjustQty),
          unitCost: i.costPrice,
          lossValue: i.lossValue,
          note: i.note,
        })),
      };

      await createAdjustment(payload);
      message.success("Lập phiếu điều chỉnh tồn kho thành công! Phiếu đang chờ Quản lý kho phê duyệt.");
      setIsCreateModalOpen(false);
      createForm.resetFields();
      setFormItems([]);
      loadAdjustments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : "Không thể tạo phiếu điều chỉnh.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Statistics
  const pendingCount = useMemo(() => {
    return adjustments.filter((a) => a.status === "PENDING").length;
  }, [adjustments]);

  const totalLossFormatted = useMemo(() => {
    const sum = adjustments
      .filter((a) => a.status === "APPROVED")
      .reduce((acc, cur) => acc + (cur.lossValue || 0), 0);
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(sum);
  }, [adjustments]);

  // Columns for Adjustments Table
  const adjustmentColumns: ColumnsType<InventoryAdjustmentDetail> = [
    {
      title: "Mã phiếu",
      dataIndex: "code",
      key: "code",
      render: (code: string, record) => (
        <a
          style={{ fontWeight: 600, color: "#1d4ed8" }}
          onClick={() => handleViewDetail(record.id)}
        >
          {code}
        </a>
      ),
    },
    {
      title: "Kho áp dụng",
      dataIndex: "warehouseName",
      key: "warehouseName",
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: "Lý do",
      dataIndex: "reason",
      key: "reason",
      render: (reason: string) => {
        let color = "default";
        let label = reason;
        if (reason === "DAMAGED") {
          color = "error";
          label = "Hàng hỏng";
        } else if (reason === "LOST") {
          color = "warning";
          label = "Hàng mất";
        } else if (reason === "EXPIRED") {
          color = "purple";
          label = "Hết hạn hủy";
        }
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: "Số mặt hàng",
      key: "itemsCount",
      render: (_, record) => <span>{record.items?.length || 0} SKU</span>,
    },
    {
      title: "Giá trị tổn thất",
      dataIndex: "lossValue",
      key: "lossValue",
      render: (val: number) => (
        <Text style={{ color: "#dc2626", fontWeight: 600 }}>
          {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val || 0)}
        </Text>
      ),
    },
    {
      title: "Người lập",
      dataIndex: "createdByName",
      key: "createdByName",
      render: (name: string, record) => (
        <div>
          <div>{name || "N/A"}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.createdAt ? new Date(record.createdAt).toLocaleDateString("vi-VN") : ""}
          </Text>
        </div>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        if (status === "APPROVED") {
          return (
            <Tag icon={<CheckCircleOutlined />} color="success">
              ĐÃ DUYỆT
            </Tag>
          );
        }
        if (status === "REJECTED") {
          return (
            <Tag icon={<CloseCircleOutlined />} color="error">
              TỪ CHỐI
            </Tag>
          );
        }
        return (
          <Tag icon={<ClockCircleOutlined />} color="gold">
            CHỜ DUYỆT
          </Tag>
        );
      },
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_, record) => {
        const canUserApprove = canApprove(record);
        const userIsCreator = isCreator(record);

        return (
          <Space size="middle">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record.id)}
            >
              Xem
            </Button>

            {record.status === "PENDING" && (
              <>
                {canUserApprove ? (
                  <>
                    <Popconfirm
                      title="Phê duyệt phiếu điều chỉnh"
                      description="Hành động này sẽ cập nhật tồn kho và ghi sổ thẻ kho. Bạn có chắc chắn duyệt?"
                      onConfirm={() => handleApprove(record.id)}
                      okText="Duyệt ngay"
                      cancelText="Hủy"
                    >
                      <Button
                        size="small"
                        type="primary"
                        style={{ backgroundColor: "#16a34a" }}
                        icon={<CheckCircleOutlined />}
                      >
                        Duyệt
                      </Button>
                    </Popconfirm>

                    <Button
                      size="small"
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => {
                        setRejectingId(record.id);
                        setIsRejectModalOpen(true);
                      }}
                    >
                      Từ chối
                    </Button>
                  </>
                ) : userIsCreator ? (
                  <Tooltip title="Người lập không được tự duyệt phiếu của chính mình. Vui lòng nhờ Quản lý kho khác xem xét.">
                    <Button size="small" disabled icon={<CheckCircleOutlined />}>
                      Tự lập
                    </Button>
                  </Tooltip>
                ) : null}
              </>
            )}
          </Space>
        );
      },
    },
  ];

  // Columns for Stock Cards Table
  const stockCardColumns: ColumnsType<StockCardEntry> = [
    {
      title: "Ngày ghi nhận",
      dataIndex: "date",
      key: "date",
      render: (dateStr: string) => (
        <span>{dateStr ? new Date(dateStr).toLocaleString("vi-VN") : "N/A"}</span>
      ),
    },
    {
      title: "Mã chứng từ",
      dataIndex: "documentNo",
      key: "documentNo",
      render: (doc: string) => <Text strong>{doc}</Text>,
    },
    {
      title: "Loại nghiệp vụ",
      dataIndex: "documentType",
      key: "documentType",
      render: (type: string) => {
        let color = "blue";
        if (type.includes("Điều chỉnh")) color = "orange";
        if (type.includes("Nhập")) color = "green";
        if (type.includes("Xuất")) color = "volcano";
        return <Tag color={color}>{type}</Tag>;
      },
    },
    {
      title: "Sản phẩm",
      key: "product",
      render: (_, record) => (
        <div>
          <Text strong>{record.productName}</Text>
          <div style={{ fontSize: 12, color: "#64748b" }}>SKU: {record.sku}</div>
        </div>
      ),
    },
    {
      title: "Kho",
      dataIndex: "warehouseName",
      key: "warehouseName",
    },
    {
      title: "Lô hàng",
      dataIndex: "lotNumber",
      key: "lotNumber",
      render: (lot) => (lot ? <Tag>{lot}</Tag> : <Text type="secondary">-</Text>),
    },
    {
      title: "SL Nhập",
      dataIndex: "inQty",
      key: "inQty",
      render: (qty: number) =>
        qty > 0 ? (
          <Text style={{ color: "#16a34a", fontWeight: 600 }}>+{qty}</Text>
        ) : (
          "-"
        ),
    },
    {
      title: "SL Xuất",
      dataIndex: "outQty",
      key: "outQty",
      render: (qty: number) =>
        qty > 0 ? (
          <Text style={{ color: "#dc2626", fontWeight: 600 }}>-{qty}</Text>
        ) : (
          "-"
        ),
    },
    {
      title: "Tồn sau",
      dataIndex: "afterQty",
      key: "afterQty",
      render: (qty) => (qty !== null && qty !== undefined ? <Text strong>{qty}</Text> : "-"),
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      render: (note) => <Text type="secondary">{note || "-"}</Text>,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Top Header & Actions */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space align="center" size="middle">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#eff6ff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#2563eb",
                  fontSize: 22,
                }}
              >
                <FileProtectOutlined />
              </div>
              <div>
                <Title level={4} style={{ margin: 0, color: "#0f172a" }}>
                  Điều chỉnh tồn kho & Thẻ kho
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  SCRUM-66: Xử lý hàng hỏng, mất, hết hạn minh bạch, phê duyệt 2 bước và truy xuất Thẻ kho.
                </Text>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={10} style={{ textAlign: "right" }}>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  if (activeTab === "adjustments") loadAdjustments();
                  else loadStockCards();
                }}
              >
                Làm mới
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ backgroundColor: "#2563eb" }}
                onClick={() => {
                  createForm.resetFields();
                  setFormItems([]);
                  setIsCreateModalOpen(true);
                }}
              >
                Lập phiếu điều chỉnh
              </Button>
            </Space>
          </Col>
        </Row>

        {/* Dashboard Statistics */}
        <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
          <Col xs={24} sm={8}>
            <Card
              size="small"
              style={{
                backgroundColor: "#fefce8",
                borderColor: "#fef08a",
                borderRadius: 8,
              }}
            >
              <Statistic
                title={<span style={{ color: "#854d0e" }}>Chờ phê duyệt</span>}
                value={pendingCount}
                suffix="phiếu"
                valueStyle={{ color: "#ca8a04", fontWeight: 700 }}
                prefix={<ClockCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              size="small"
              style={{
                backgroundColor: "#fef2f2",
                borderColor: "#fecaca",
                borderRadius: 8,
              }}
            >
              <Statistic
                title={<span style={{ color: "#991b1b" }}>Tổn thất đã duyệt</span>}
                value={totalLossFormatted}
                valueStyle={{ color: "#dc2626", fontWeight: 700, fontSize: 18 }}
                prefix={<WarningOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card
              size="small"
              style={{
                backgroundColor: "#f0fdf4",
                borderColor: "#bbf7d0",
                borderRadius: 8,
              }}
            >
              <Statistic
                title={<span style={{ color: "#166534" }}>Tổng số phiếu</span>}
                value={totalRecords}
                suffix="phiếu"
                valueStyle={{ color: "#16a34a", fontWeight: 700 }}
                prefix={<AuditOutlined />}
              />
            </Card>
          </Col>
        </Row>
      </Card>

      {/* Main Tabs Container */}
      <Card
        style={{
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #e2e8f0",
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "adjustments",
              label: (
                <Space>
                  <AuditOutlined />
                  <span>Danh sách phiếu điều chỉnh</span>
                  {pendingCount > 0 && <Badge count={pendingCount} overflowCount={99} />}
                </Space>
              ),
              children: (
                <div>
                  {/* Filters Bar */}
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={6}>
                      <Select
                        placeholder="Chọn kho áp dụng"
                        allowClear
                        style={{ width: "100%" }}
                        value={warehouseFilter}
                        onChange={(val) => {
                          setWarehouseFilter(val);
                          setCurrentPage(1);
                        }}
                      >
                        {warehouses.map((w) => (
                          <Option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Select
                        placeholder="Lọc theo trạng thái"
                        allowClear
                        style={{ width: "100%" }}
                        value={statusFilter}
                        onChange={(val) => {
                          setStatusFilter(val);
                          setCurrentPage(1);
                        }}
                      >
                        <Option value="PENDING">Chờ phê duyệt</Option>
                        <Option value="APPROVED">Đã phê duyệt</Option>
                        <Option value="REJECTED">Đã từ chối</Option>
                      </Select>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Select
                        placeholder="Lọc theo loại lý do"
                        allowClear
                        style={{ width: "100%" }}
                        value={reasonFilter}
                        onChange={(val) => {
                          setReasonFilter(val);
                          setCurrentPage(1);
                        }}
                      >
                        <Option value="DAMAGED">Hàng hỏng</Option>
                        <Option value="LOST">Hàng mất</Option>
                        <Option value="EXPIRED">Hết hạn hủy</Option>
                        <Option value="OTHER">Lý do khác</Option>
                      </Select>
                    </Col>
                  </Row>

                  <Table
                    columns={adjustmentColumns}
                    dataSource={adjustments}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                      current: currentPage,
                      pageSize: pageSize,
                      total: totalRecords,
                      showSizeChanger: true,
                      onChange: (page, size) => {
                        setCurrentPage(page);
                        setPageSize(size);
                      },
                    }}
                  />
                </div>
              ),
            },
            {
              key: "stock-cards",
              label: (
                <Space>
                  <BookOutlined />
                  <span>Thẻ kho (Sổ phát sinh)</span>
                </Space>
              ),
              children: (
                <div>
                  {/* Stock Cards Filters */}
                  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                    <Col xs={24} sm={6}>
                      <Select
                        placeholder="Lọc theo kho"
                        allowClear
                        style={{ width: "100%" }}
                        value={cardWarehouseId}
                        onChange={(val) => {
                          setCardWarehouseId(val);
                          setCardPage(1);
                        }}
                      >
                        {warehouses.map((w) => (
                          <Option key={w.id} value={w.id}>
                            {w.name}
                          </Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Select
                        placeholder="Lọc theo sản phẩm"
                        allowClear
                        showSearch
                        optionFilterProp="children"
                        style={{ width: "100%" }}
                        value={cardProductId}
                        onChange={(val) => {
                          setCardProductId(val);
                          setCardPage(1);
                        }}
                      >
                        {products.map((p) => (
                          <Option key={p.id} value={p.id}>
                            {p.sku} - {p.name}
                          </Option>
                        ))}
                      </Select>
                    </Col>
                    <Col xs={24} sm={8}>
                      <DatePicker.RangePicker
                        style={{ width: "100%" }}
                        placeholder={["Từ ngày", "Đến ngày"]}
                        onChange={(_, dateStrings) => {
                          setCardFromDate(dateStrings[0] || undefined);
                          setCardToDate(dateStrings[1] || undefined);
                          setCardPage(1);
                        }}
                      />
                    </Col>
                  </Row>

                  <Alert
                    message="Quy tắc Thẻ kho"
                    description="Mọi phiếu điều chỉnh đã được Quản lý kho duyệt đều tự động ghi nhận xuất giảm tồn kho thực tế trên thẻ kho. Các phiếu đang chờ duyệt hoặc bị từ chối không làm thay đổi biến động thực tế."
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />

                  <Table
                    columns={stockCardColumns}
                    dataSource={stockCards}
                    rowKey="id"
                    loading={cardLoading}
                    pagination={{
                      current: cardPage,
                      pageSize: 20,
                      total: cardTotal,
                      onChange: (p) => setCardPage(p),
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      {/* Modal Lập phiếu điều chỉnh */}
      <Modal
        title={
          <Space>
            <FileProtectOutlined style={{ color: "#2563eb" }} />
            <span>Lập phiếu điều chỉnh tồn kho mới</span>
          </Space>
        }
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateSubmit}
          initialValues={{ reason: "DAMAGED" }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="warehouseId"
                label="Kho áp dụng"
                rules={[{ required: true, message: "Vui lòng chọn kho áp dụng" }]}
              >
                <Select
                  placeholder="Chọn kho hàng"
                  onChange={(val) => {
                    setFormWarehouseId(val);
                    setFormItems([]);
                  }}
                >
                  {warehouses.map((w) => (
                    <Option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="reason"
                label="Loại lý do điều chỉnh"
                rules={[{ required: true, message: "Vui lòng chọn lý do" }]}
              >
                <Select>
                  <Option value="DAMAGED">Hàng hỏng / móp méo trong quá trình bốc dỡ</Option>
                  <Option value="LOST">Hàng mất / thất thoát khi kiểm kê</Option>
                  <Option value="EXPIRED">Hàng hết hạn sử dụng buộc phải tiêu hủy</Option>
                  <Option value="OTHER">Lý do kiểm toán khác</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="note" label="Ghi chú / Giải trình chi tiết">
            <Input.TextArea rows={2} placeholder="Nhập diễn giải cụ thể lý do điều chỉnh..." />
          </Form.Item>

          {/* Product Items Selector */}
          <div
            style={{
              padding: 16,
              backgroundColor: "#f8fafc",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <Text strong style={{ fontSize: 15 }}>
                Danh sách sản phẩm cần điều chỉnh giảm:
              </Text>
              <Select
                showSearch
                placeholder="+ Thêm sản phẩm vào phiếu"
                style={{ width: 320 }}
                value={undefined}
                disabled={!formWarehouseId}
                optionFilterProp="children"
                onChange={handleAddItem}
              >
                {products.map((p) => (
                  <Option key={p.id} value={p.id}>
                    {p.sku} - {p.name}
                  </Option>
                ))}
              </Select>
            </div>

            {!formWarehouseId && (
              <Alert
                message="Vui lòng chọn Kho áp dụng trước để thêm sản phẩm."
                type="warning"
                showIcon
              />
            )}

            {formItems.length === 0 && formWarehouseId && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8" }}>
                Chưa có sản phẩm nào được chọn. Nhấn "+ Thêm sản phẩm" ở trên để đưa vào phiếu.
              </div>
            )}

            {formItems.map((item) => (
              <Card
                key={item.key}
                size="small"
                style={{ marginBottom: 10, borderColor: "#cbd5e1" }}
              >
                <Row gutter={12} align="middle">
                  <Col span={7}>
                    <Text strong>{item.productName}</Text>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      SKU: {item.sku} | ĐVT: {item.baseUnit}
                    </div>
                  </Col>

                  <Col span={5}>
                    {item.availableLots && item.availableLots.length > 0 ? (
                      <div>
                        <Text style={{ fontSize: 12, display: "block" }}>Lô hàng:</Text>
                        <Select
                          placeholder="Chọn lô"
                          style={{ width: "100%" }}
                          size="small"
                          value={item.lotNumber}
                          onChange={(val) => handleUpdateItem(item.key, "lotNumber", val)}
                        >
                          {item.availableLots.map((l) => (
                            <Option key={l.lotNumber} value={l.lotNumber}>
                              {l.lotNumber} (Tồn: {l.quantity})
                            </Option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Không quản lý lô
                      </Text>
                    )}
                  </Col>

                  <Col span={4}>
                    <Text style={{ fontSize: 12, display: "block" }}>Số lượng hủy:</Text>
                    <InputNumber
                      size="small"
                      min={1}
                      style={{ width: "100%" }}
                      value={item.adjustQty}
                      onChange={(val) => handleUpdateItem(item.key, "adjustQty", val || 1)}
                    />
                  </Col>

                  <Col span={6}>
                    <Text style={{ fontSize: 12, display: "block" }}>Tổn thất dự tính:</Text>
                    <Text style={{ color: "#dc2626", fontWeight: 600 }}>
                      {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
                        item.lossValue || 0
                      )}
                    </Text>
                  </Col>

                  <Col span={2} style={{ textAlign: "right" }}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveItem(item.key)}
                    />
                  </Col>
                </Row>
              </Card>
            ))}

            {formItems.length > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  paddingTop: 8,
                  borderTop: "1px dashed #cbd5e1",
                  marginTop: 8,
                }}
              >
                <Space size="large">
                  <Text strong>Tổng giá trị tổn thất ước tính:</Text>
                  <Text style={{ color: "#dc2626", fontWeight: 700, fontSize: 18 }}>
                    {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
                      totalFormLossValue
                    )}
                  </Text>
                </Space>
              </div>
            )}
          </div>

          <div style={{ textAlign: "right" }}>
            <Space>
              <Button onClick={() => setIsCreateModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={createLoading}
                style={{ backgroundColor: "#2563eb" }}
                disabled={formItems.length === 0}
              >
                Tạo phiếu điều chỉnh
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Modal Chi tiết phiếu điều chỉnh & Phê duyệt */}
      <Modal
        title={
          <Space>
            <AuditOutlined style={{ color: "#2563eb" }} />
            <span>Chi tiết phiếu điều chỉnh tồn kho</span>
            {selectedAdjustment && (
              <Tag color={selectedAdjustment.status === "APPROVED" ? "success" : selectedAdjustment.status === "REJECTED" ? "error" : "gold"}>
                {selectedAdjustment.status === "APPROVED" ? "ĐÃ DUYỆT" : selectedAdjustment.status === "REJECTED" ? "TỪ CHỐI" : "CHỜ DUYỆT"}
              </Tag>
            )}
          </Space>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={null}
        width={850}
        loading={detailLoading}
      >
        {selectedAdjustment && (
          <div>
            {/* Creator / Approver Alert Notice */}
            {selectedAdjustment.status === "PENDING" && isCreator(selectedAdjustment) && (
              <Alert
                message="Chính sách phê duyệt"
                description="Bạn là người lập phiếu điều chỉnh này. Theo quy định kiểm toán, người lập và người duyệt không được là một, do đó bạn không thể tự duyệt phiếu của chính mình."
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Card size="small" style={{ marginBottom: 16, backgroundColor: "#f8fafc" }}>
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <Text type="secondary">Mã phiếu:</Text>
                  <div>
                    <Text strong style={{ fontSize: 16, color: "#1d4ed8" }}>
                      {selectedAdjustment.code}
                    </Text>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Kho áp dụng:</Text>
                  <div>
                    <Text strong>{selectedAdjustment.warehouseName}</Text>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Lý do điều chỉnh:</Text>
                  <div>
                    <Tag color="volcano">{selectedAdjustment.reason}</Tag>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Tổng giá trị tổn thất:</Text>
                  <div>
                    <Text style={{ color: "#dc2626", fontWeight: 700, fontSize: 16 }}>
                      {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
                        selectedAdjustment.lossValue || 0
                      )}
                    </Text>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Người lập phiếu:</Text>
                  <div>
                    <Text strong>{selectedAdjustment.createdByName || "N/A"}</Text>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {selectedAdjustment.createdAt ? new Date(selectedAdjustment.createdAt).toLocaleString("vi-VN") : ""}
                    </div>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">Người duyệt / Quyết định:</Text>
                  <div>
                    <Text strong>{selectedAdjustment.approvedByName || "Chưa có"}</Text>
                    {selectedAdjustment.approvedAt && (
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {new Date(selectedAdjustment.approvedAt).toLocaleString("vi-VN")}
                      </div>
                    )}
                  </div>
                </Col>
                {selectedAdjustment.note && (
                  <Col span={24}>
                    <Text type="secondary">Diễn giải người lập: </Text>
                    <Text>{selectedAdjustment.note}</Text>
                  </Col>
                )}
                {selectedAdjustment.approvalNote && (
                  <Col span={24}>
                    <Text type="secondary">Ghi chú phê duyệt: </Text>
                    <Text style={{ color: "#16a34a" }}>{selectedAdjustment.approvalNote}</Text>
                  </Col>
                )}
                {selectedAdjustment.rejectReason && (
                  <Col span={24}>
                    <Text type="secondary">Lý do từ chối: </Text>
                    <Text style={{ color: "#dc2626" }}>{selectedAdjustment.rejectReason}</Text>
                  </Col>
                )}
              </Row>
            </Card>

            <Title level={5} style={{ marginBottom: 8 }}>
              Chi tiết các dòng sản phẩm điều chỉnh:
            </Title>
            <Table
              size="small"
              dataSource={selectedAdjustment.items}
              rowKey="id"
              pagination={false}
              columns={[
                {
                  title: "Sản phẩm",
                  key: "product",
                  render: (_, item: InventoryAdjustmentItemDetail) => (
                    <div>
                      <Text strong>{item.productName}</Text>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        SKU: {item.sku} | ĐVT: {item.baseUnit}
                      </div>
                    </div>
                  ),
                },
                {
                  title: "Lô hàng",
                  dataIndex: "lotNumber",
                  key: "lotNumber",
                  render: (lot) => (lot ? <Tag>{lot}</Tag> : <Text type="secondary">-</Text>),
                },
                {
                  title: "Số lượng giảm",
                  dataIndex: "adjustQty",
                  key: "adjustQty",
                  render: (qty: number) => (
                    <Text style={{ color: "#dc2626", fontWeight: 600 }}>{qty}</Text>
                  ),
                },
                {
                  title: "Tồn trước",
                  dataIndex: "systemQty",
                  key: "systemQty",
                  render: (q) => (q !== null && q !== undefined ? q : "-"),
                },
                {
                  title: "Tồn sau",
                  dataIndex: "afterQty",
                  key: "afterQty",
                  render: (q) =>
                    selectedAdjustment.status === "APPROVED" && q !== null && q !== undefined ? (
                      <Text strong style={{ color: "#16a34a" }}>
                        {q}
                      </Text>
                    ) : (
                      "-"
                    ),
                },
                {
                  title: "Tổn thất",
                  dataIndex: "lossValue",
                  key: "lossValue",
                  render: (v: number) => (
                    <Text style={{ color: "#dc2626" }}>
                      {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
                        v || 0
                      )}
                    </Text>
                  ),
                },
                {
                  title: "Ghi chú dòng",
                  dataIndex: "note",
                  key: "note",
                  render: (n) => <Text type="secondary">{n || "-"}</Text>,
                },
              ]}
            />

            <div style={{ textAlign: "right", marginTop: 24 }}>
              <Space>
                <Button onClick={() => setIsDetailModalOpen(false)}>Đóng</Button>

                {selectedAdjustment.status === "PENDING" && canApprove(selectedAdjustment) && (
                  <>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      onClick={() => {
                        setRejectingId(selectedAdjustment.id);
                        setIsRejectModalOpen(true);
                      }}
                    >
                      Từ chối
                    </Button>

                    <Popconfirm
                      title="Phê duyệt phiếu điều chỉnh"
                      description="Hệ thống sẽ hạch toán giảm tồn kho thực tế và ghi sổ thẻ kho. Bạn có chắc chắn muốn duyệt?"
                      onConfirm={() => handleApprove(selectedAdjustment.id)}
                      okText="Xác nhận duyệt"
                      cancelText="Hủy"
                    >
                      <Button
                        type="primary"
                        style={{ backgroundColor: "#16a34a" }}
                        icon={<CheckCircleOutlined />}
                        loading={actionLoading}
                      >
                        Phê duyệt phiếu
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Nhập lý do từ chối */}
      <Modal
        title="Từ chối phiếu điều chỉnh tồn kho"
        open={isRejectModalOpen}
        onOk={handleRejectSubmit}
        onCancel={() => {
          setIsRejectModalOpen(false);
          setRejectReason("");
          setRejectingId(null);
        }}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true, loading: actionLoading }}
        cancelText="Hủy"
      >
        <p>Vui lòng ghi rõ lý do từ chối để lưu vào lịch sử kiểm toán:</p>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do từ chối (bắt buộc)..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default InventoryAdjustmentManagement;
