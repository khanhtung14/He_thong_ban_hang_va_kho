import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Row,
  Col,
  Progress,
  Drawer,
  Descriptions,
  Typography,
  Tooltip,
  Segmented,
  Empty,
  Spin,
  Alert,
  message,
  Table,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SearchOutlined,
  FilterOutlined,
  ReloadOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  ShopOutlined,
  UserOutlined,
  CheckCircleOutlined,
  LockOutlined,
  ShoppingCartOutlined,
  EyeOutlined,
  AppstoreOutlined,
  BarsOutlined,
  CompassOutlined,
  ClearOutlined,
  AlertOutlined,
} from "@ant-design/icons";

import {
  fetchCustomersWithTotal,
  fetchTerritories,
  type CustomerItem,
  type TerritoryItem,
} from "../../services/apiClient";

const { Title, Text } = Typography;

interface SalesCustomerListProps {
  currentRepName?: string;
  onSelectCustomerForOrder?: (customer: CustomerItem) => void;
}

export const SalesCustomerList: React.FC<SalesCustomerListProps> = ({
  currentRepName,
  onSelectCustomerForOrder,
}) => {
  // --- States ---
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Danh mục bộ lọc
  const [territories, setTerritories] = useState<TerritoryItem[]>([]);

  // Tiêu chí tìm kiếm & Lọc
  const [search, setSearch] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<string>("ALL");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Phân trang & Chế độ xem
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(24);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  // Drawer chi tiết đại lý
  const [detailCustomer, setDetailCustomer] = useState<CustomerItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // --- Tải danh mục địa bàn ---
  useEffect(() => {
    fetchTerritories()
      .then((terrs) => setTerritories(terrs))
      .catch(() => []);
  }, []);

  // --- Hàm gọi API tìm kiếm & Lọc server-side ---
  const loadCustomers = useCallback(
    async (
      page = currentPage,
      searchTerm = search,
      region = regionFilter,
      group = groupFilter,
      status = statusFilter,
      size = pageSize
    ) => {
      setLoading(true);
      try {
        const regionParam =
          region !== "ALL" && region !== undefined
            ? Number(region)
            : undefined;

        const result = await fetchCustomersWithTotal({
          page,
          pageSize: size,
          limit: size,
          search: searchTerm.trim() || undefined,
          regionId: regionParam,
          customerGroup: group !== "ALL" ? group : undefined,
          status: status !== "ALL" ? status : undefined,
        });

        setCustomers(result.data);
        setTotalCount(result.total);
        setCurrentPage(page);
      } catch (err: any) {
        message.error(err.message || "Lỗi khi tải danh sách đại lý.");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, search, regionFilter, groupFilter, statusFilter]
  );

  // Tải danh sách ngay khi mount hoặc khi thay đổi các bộ lọc dropdown
  useEffect(() => {
    loadCustomers(1, search, regionFilter, groupFilter, statusFilter, pageSize);
  }, [regionFilter, groupFilter, statusFilter, pageSize]);

  // Debounced search (300ms) riêng cho ô nhập từ khóa tìm kiếm
  useEffect(() => {
    const timer = setTimeout(() => {
      loadCustomers(1, search, regionFilter, groupFilter, statusFilter, pageSize);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Đặt lại toàn bộ bộ lọc
  const handleResetFilters = () => {
    setSearch("");
    setRegionFilter("ALL");
    setGroupFilter("ALL");
    setStatusFilter("ALL");
    setCurrentPage(1);
    loadCustomers(1, "", "ALL", "ALL", "ALL", pageSize);
  };

  // Định dạng tiền tệ
  const formatMoney = (val?: number) => {
    if (!val) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  // Tính toán số liệu thống kê nhanh
  const stats = useMemo(() => {
    const total = totalCount;
    const active = customers.filter((c) => !c.is_locked && c.is_active).length;
    const locked = customers.filter((c) => c.is_locked).length;
    const totalDebt = customers.reduce((sum, c) => sum + (c.current_debt || 0), 0);
    return { total, active, locked, totalDebt };
  }, [totalCount, customers]);

  // Nhãn phân nhóm khách hàng
  const getCustomerGroupBadge = (group: string) => {
    switch (group) {
      case "DEALER_LEVEL_1":
        return <Tag color="blue" style={{ fontWeight: 600 }}>Đại lý Cấp 1</Tag>;
      case "DEALER_LEVEL_2":
        return <Tag color="cyan" style={{ fontWeight: 600 }}>Đại lý Cấp 2</Tag>;
      case "DISTRIBUTOR":
        return <Tag color="purple" style={{ fontWeight: 600 }}>Nhà phân phối</Tag>;
      case "WHOLESALE":
        return <Tag color="geekblue" style={{ fontWeight: 600 }}>Bán buôn / Khách sỉ</Tag>;
      default:
        return <Tag color="default">Khách lẻ</Tag>;
    }
  };

  // Xem chi tiết đại lý
  const handleOpenDetail = (customer: CustomerItem) => {
    setDetailCustomer(customer);
    setIsDrawerOpen(true);
  };

  // Tạo liên kết bản đồ chỉ đường Google Maps
  const getGoogleMapsUrl = (address?: string | null, name?: string) => {
    const query = encodeURIComponent(`${name || ""} ${address || ""}`.trim());
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  };

  // Cấu hình cột Table View
  const columns: ColumnsType<CustomerItem> = [
    {
      title: "MÃ & TÊN ĐẠI LÝ",
      key: "name",
      render: (_, r) => (
        <div>
          <Space>
            <Text strong style={{ color: "#1e40af", fontSize: 13 }}>
              {r.code}
            </Text>
            {getCustomerGroupBadge(r.customer_group)}
          </Space>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#0f172a", marginTop: 2 }}>
            {r.name}
          </div>
          {r.address && (
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
              <EnvironmentOutlined style={{ marginRight: 4, color: "#94a3b8" }} />
              {r.address}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "SỐ ĐIỆN THOẠI",
      key: "phone",
      width: 170,
      render: (_, r) =>
        r.phone ? (
          <a
            href={`tel:${r.phone}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#16a34a",
              fontWeight: 600,
              padding: "4px 8px",
              background: "#f0fdf4",
              borderRadius: 6,
              border: "1px solid #bbf7d0",
              textDecoration: "none",
            }}
          >
            <PhoneOutlined /> {r.phone}
          </a>
        ) : (
          <Text type="secondary" italic>Chưa có SĐT</Text>
        ),
    },
    {
      title: "ĐỊA BÀN / TUYẾN",
      key: "territory",
      width: 160,
      render: (_, r) => (
        <Space orientation="vertical" size={2}>
          <Tag color="geekblue" icon={<CompassOutlined />}>
            {r.territory_name || "Chưa gắn tuyến"}
          </Tag>
          {r.sales_rep_name && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              <UserOutlined /> {r.sales_rep_name}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "CÔNG NỢ / HẠN MỨC",
      key: "debt",
      width: 200,
      render: (_, r) => {
        const debt = r.current_debt || 0;
        const limit = r.debt_limit || 0;
        const percent = limit > 0 ? Math.min(Math.round((debt / limit) * 100), 100) : 0;
        const isNearLimit = limit > 0 && percent >= (r.warning_threshold_percent || 80);

        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: debt > 0 ? "#dc2626" : "#16a34a", fontWeight: 700 }}>
                {formatMoney(debt)}
              </span>
              <span style={{ color: "#64748b" }}>/ {formatMoney(limit)}</span>
            </div>
            {limit > 0 && (
              <Progress
                percent={percent}
                size="small"
                status={r.is_locked ? "exception" : isNearLimit ? "exception" : "normal"}
                strokeColor={r.is_locked ? "#ef4444" : isNearLimit ? "#f59e0b" : "#3b82f6"}
                showInfo={false}
              />
            )}
          </div>
        );
      },
    },
    {
      title: "TRẠNG THÁI",
      key: "status",
      width: 170,
      render: (_, r) =>
        r.is_locked ? (
          <Tooltip title={`Lý do khóa: ${r.lock_reason || "Khóa nợ quá hạn"}`}>
            <Tag color="error" icon={<LockOutlined />} style={{ fontWeight: 600 }}>
              BỊ KHÓA
            </Tag>
          </Tooltip>
        ) : (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 600 }}>
            Đang hoạt động
          </Tag>
        ),
    },
    {
      title: "THAO TÁC",
      key: "actions",
      width: 140,
      align: "center",
      render: (_, r) => (
        <Space size="small">
          <Tooltip title="Xem chi tiết">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDetail(r)}
            />
          </Tooltip>
          <Tooltip title={r.is_locked ? "Đại lý bị khóa không thể lên đơn" : "Lên đơn ngay"}>
            <Button
              size="small"
              type="primary"
              disabled={r.is_locked}
              style={{
                backgroundColor: r.is_locked ? "#94a3b8" : "#2563eb",
                borderColor: r.is_locked ? "#94a3b8" : "#2563eb",
              }}
              icon={<ShoppingCartOutlined />}
              onClick={() => onSelectCustomerForOrder?.(r)}
            />
          </Tooltip>
          {r.phone && (
            <Tooltip title="Gọi điện ngay">
              <Button
                size="small"
                type="primary"
                style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
                icon={<PhoneOutlined />}
                href={`tel:${r.phone}`}
              />
            </Tooltip>
          )}
          {r.address && (
            <Tooltip title="Chỉ đường trên Google Maps">
              <Button
                size="small"
                icon={<EnvironmentOutlined style={{ color: "#2563eb" }} />}
                href={getGoogleMapsUrl(r.address, r.name)}
                target="_blank"
                rel="noreferrer"
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1. Header & Thống kê nhanh */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)",
          borderRadius: 16,
          padding: "20px 24px",
          color: "#fff",
          boxShadow: "0 10px 25px -5px rgba(37, 99, 235, 0.25)",
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  backdropFilter: "blur(8px)",
                }}
              >
                <CompassOutlined />
              </div>
              <div>
                <Title level={3} style={{ color: "#fff", margin: 0, fontWeight: 700 }}>
                  Tìm Kiếm & Tra Cứu Đại Lý Trong Tuyến
                </Title>
                <Text style={{ color: "#bfdbfe", fontSize: 13 }}>
                  Tối ưu cho Nhân viên kinh doanh tìm nhanh khách hàng ngoài thị trường
                  {currentRepName ? ` • Phụ trách: ${currentRepName}` : ""}
                </Text>
              </div>
            </div>
          </Col>

          <Col xs={24} md={10}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  padding: "8px 16px",
                  borderRadius: 10,
                  backdropFilter: "blur(6px)",
                  textAlign: "center",
                  minWidth: 100,
                }}
              >
                <div style={{ fontSize: 11, color: "#dbeafe" }}>Tổng đại lý</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{stats.total}</div>
              </div>
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  padding: "8px 16px",
                  borderRadius: 10,
                  backdropFilter: "blur(6px)",
                  textAlign: "center",
                  minWidth: 100,
                }}
              >
                <div style={{ fontSize: 11, color: "#bbf7d0" }}>Đang hoạt động</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#86efac" }}>
                  {stats.active}
                </div>
              </div>
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  padding: "8px 16px",
                  borderRadius: 10,
                  backdropFilter: "blur(6px)",
                  textAlign: "center",
                  minWidth: 100,
                }}
              >
                <div style={{ fontSize: 11, color: "#fecaca" }}>Bị khóa nợ</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fca5a5" }}>
                  {stats.locked}
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </div>

      {/* 2. Thanh tìm kiếm tức thì & Bộ lọc */}
      <Card
        style={{
          borderRadius: 14,
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
          border: "1px solid #e2e8f0",
        }}
        styles={{ body: { padding: 18 } }}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          {/* Hàng 1: Ô tìm kiếm nổi bật */}
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={14} lg={16}>
              <Input
                size="large"
                allowClear
                prefix={<SearchOutlined style={{ color: "#2563eb", fontSize: 18, marginRight: 4 }} />}
                placeholder="Tìm nhanh theo mã đại lý, tên hoặc số điện thoại..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  borderRadius: 10,
                  fontSize: 15,
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
                }}
              />
            </Col>
            <Col xs={24} md={10} lg={8}>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
                {/* Chế độ xem: Thẻ / Bảng */}
                <Segmented
                  value={viewMode}
                  onChange={(val) => setViewMode(val as "card" | "table")}
                  options={[
                    {
                      label: "Thẻ tuyến đường",
                      value: "card",
                      icon: <AppstoreOutlined />,
                    },
                    {
                      label: "Dạng bảng",
                      value: "table",
                      icon: <BarsOutlined />,
                    },
                  ]}
                  style={{
                    backgroundColor: "#f1f5f9",
                    padding: 3,
                    borderRadius: 8,
                  }}
                />

                <Tooltip title="Đặt lại toàn bộ tiêu chí">
                  <Button
                    icon={<ClearOutlined />}
                    onClick={handleResetFilters}
                    style={{ borderRadius: 8 }}
                  >
                    Xóa lọc
                  </Button>
                </Tooltip>

                <Tooltip title="Tải lại dữ liệu">
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => loadCustomers(currentPage)}
                    loading={loading}
                    style={{ borderRadius: 8 }}
                  />
                </Tooltip>
              </div>
            </Col>
          </Row>

          {/* Hàng 2: Các bộ lọc dropdown */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              paddingTop: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13 }}>
              <FilterOutlined /> <span>Bộ lọc:</span>
            </div>

            {/* Lọc theo Khu vực / Địa bàn */}
            <Select
              style={{ minWidth: 170 }}
              value={regionFilter}
              onChange={(val) => {
                setRegionFilter(val);
                setCurrentPage(1);
              }}
              placeholder="Khu vực / Tuyến"
              options={[
                { label: "Tất cả khu vực", value: "ALL" },
                ...territories.map((t) => ({ label: `Khu vực: ${t.name}`, value: String(t.id) })),
              ]}
            />

            {/* Lọc theo Phân nhóm đại lý */}
            <Select
              style={{ minWidth: 175 }}
              value={groupFilter}
              onChange={(val) => {
                setGroupFilter(val);
                setCurrentPage(1);
              }}
              placeholder="Nhóm khách hàng"
              options={[
                { label: "Tất cả nhóm đại lý", value: "ALL" },
                { label: "Đại lý Cấp 1", value: "DEALER_LEVEL_1" },
                { label: "Đại lý Cấp 2", value: "DEALER_LEVEL_2" },
                { label: "Nhà phân phối", value: "DISTRIBUTOR" },
                { label: "Khách sỉ / Bán buôn", value: "WHOLESALE" },
                { label: "Khách lẻ", value: "RETAIL" },
              ]}
            />

            {/* Lọc theo Trạng thái hoạt động / Khóa */}
            <Select
              style={{ minWidth: 170 }}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setCurrentPage(1);
              }}
              placeholder="Trạng thái giao dịch"
              options={[
                { label: "Tất cả trạng thái", value: "ALL" },
                { label: "Đang hoạt động", value: "ACTIVE" },
                { label: "Bị khóa giao dịch", value: "LOCKED" },
                { label: "Ngừng hoạt động", value: "INACTIVE" },
              ]}
            />

            {/* Huy hiệu thông báo số kết quả */}
            <div style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>
              Tìm thấy <Text strong style={{ color: "#2563eb" }}>{totalCount}</Text> đại lý phù hợp
            </div>
          </div>
        </Space>
      </Card>

      {/* 3. Nội dung hiển thị danh sách đại lý */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: "#64748b" }}>Đang tải danh sách đại lý trong tuyến...</div>
        </div>
      ) : customers.length === 0 ? (
        <Card style={{ borderRadius: 14, textAlign: "center", padding: "40px 0" }}>
          <Empty
            description={
              search
                ? `Không tìm thấy đại lý nào khớp với từ khóa "${search}".`
                : "Không tìm thấy đại lý nào theo bộ lọc đã chọn."
            }
          >
            <Button type="primary" onClick={handleResetFilters}>
              Đặt lại bộ lọc
            </Button>
          </Empty>
        </Card>
      ) : viewMode === "card" ? (
        /* --- CHẾ ĐỘ THẺ TUYẾN ĐƯỜNG (CARD VIEW - Tối ưu cho Mobile / Đi ngoài đường) --- */
        <div>
          <Row gutter={[16, 16]}>
            {customers.map((c) => {
              const debt = c.current_debt || 0;
              const limit = c.debt_limit || 0;
              const percent = limit > 0 ? Math.min(Math.round((debt / limit) * 100), 100) : 0;
              const isNearLimit = limit > 0 && percent >= (c.warning_threshold_percent || 80);

              return (
                <Col xs={24} sm={12} lg={8} xl={6} key={c.id}>
                  <Card
                    hoverable
                    style={{
                      borderRadius: 14,
                      border: c.is_locked ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                      backgroundColor: c.is_locked ? "#fff5f5" : "#ffffff",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    styles={{
                      body: {
                        padding: 16,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        flex: 1,
                      },
                    }}
                  >
                    {/* Dải trạng thái đầu card */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 4,
                        backgroundColor: c.is_locked ? "#ef4444" : "#10b981",
                      }}
                    />

                    <div>
                      {/* Tiêu đề & Mã đại lý */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Tag
                          color="blue"
                          style={{
                            margin: 0,
                            fontWeight: 700,
                            fontSize: 12,
                            borderRadius: 6,
                          }}
                        >
                          {c.code}
                        </Tag>
                        {c.is_locked ? (
                          <Tag
                            color="error"
                            icon={<LockOutlined />}
                            style={{ margin: 0, fontWeight: 700, borderRadius: 6 }}
                          >
                            BỊ KHÓA
                          </Tag>
                        ) : (
                          <Tag
                            color="success"
                            icon={<CheckCircleOutlined />}
                            style={{ margin: 0, fontWeight: 600, borderRadius: 6 }}
                          >
                            Hoạt động
                          </Tag>
                        )}
                      </div>

                      {/* Tên đại lý */}
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "#0f172a",
                          lineHeight: 1.3,
                          marginBottom: 6,
                        }}
                      >
                        {c.name}
                      </div>

                      {/* Phân nhóm khách hàng & Tuyến */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {getCustomerGroupBadge(c.customer_group)}
                        {c.territory_name && (
                          <Tag
                            icon={<CompassOutlined />}
                            style={{ margin: 0, borderRadius: 6 }}
                          >
                            {c.territory_name}
                          </Tag>
                        )}
                      </div>

                      {/* Cảnh báo lý do khóa nếu có */}
                      {c.is_locked && c.lock_reason && (
                        <div
                          style={{
                            backgroundColor: "#fee2e2",
                            border: "1px solid #fecaca",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            color: "#991b1b",
                            marginBottom: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <AlertOutlined />
                          <span>{c.lock_reason}</span>
                        </div>
                      )}

                      {/* Số điện thoại (Nút Gọi Điện Trực Tiếp - Click to Call) */}
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            backgroundColor: "#16a34a",
                            color: "#ffffff",
                            padding: "8px 12px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 14,
                            textDecoration: "none",
                            marginBottom: 10,
                            boxShadow: "0 2px 6px rgba(22, 163, 74, 0.25)",
                            transition: "all 0.2s",
                          }}
                        >
                          <PhoneOutlined style={{ fontSize: 16 }} />
                          <span>Gọi ngay: {c.phone}</span>
                        </a>
                      ) : (
                        <div
                          style={{
                            backgroundColor: "#f8fafc",
                            border: "1px dashed #cbd5e1",
                            borderRadius: 8,
                            padding: "6px 10px",
                            fontSize: 12,
                            color: "#94a3b8",
                            textAlign: "center",
                            marginBottom: 10,
                          }}
                        >
                          Chưa có số điện thoại
                        </div>
                      )}

                      {/* Địa chỉ giao hàng & Chỉ đường */}
                      {c.address && (
                        <div
                          style={{
                            backgroundColor: "#f8fafc",
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 12,
                            color: "#475569",
                            marginBottom: 12,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, lineHeight: 1.4 }}>
                            <EnvironmentOutlined style={{ color: "#ef4444", marginRight: 4 }} />
                            <span>{c.address}</span>
                          </div>
                          <Tooltip title="Mở bản đồ Google Maps">
                            <a
                              href={getGoogleMapsUrl(c.address, c.name)}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "#2563eb",
                                fontSize: 11,
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              Chỉ đường
                            </a>
                          </Tooltip>
                        </div>
                      )}

                      {/* Dư nợ & Hạn mức tín dụng */}
                      <div
                        style={{
                          backgroundColor: "#f1f5f9",
                          borderRadius: 8,
                          padding: "8px 10px",
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ color: "#64748b" }}>Dư nợ / Hạn mức:</span>
                          <span
                            style={{
                              color: debt > 0 ? "#dc2626" : "#16a34a",
                              fontWeight: 700,
                            }}
                          >
                            {formatMoney(debt)}
                          </span>
                        </div>
                        {limit > 0 ? (
                          <>
                            <Progress
                              percent={percent}
                              size="small"
                              status={c.is_locked ? "exception" : isNearLimit ? "exception" : "normal"}
                              strokeColor={
                                c.is_locked ? "#ef4444" : isNearLimit ? "#f59e0b" : "#3b82f6"
                              }
                              showInfo={false}
                            />
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 11,
                                color: "#64748b",
                                marginTop: 2,
                              }}
                            >
                              <span>Đã dùng: {percent}%</span>
                              <span>Hạn mức: {formatMoney(limit)}</span>
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>
                            Chưa thiết lập hạn mức nợ
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer Thao tác */}
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        paddingTop: 10,
                        borderTop: "1px solid #f1f5f9",
                      }}
                    >
                      <Button
                        style={{ flex: 1, borderRadius: 8 }}
                        icon={<EyeOutlined />}
                        onClick={() => handleOpenDetail(c)}
                      >
                        Chi tiết
                      </Button>
                      <Button
                        type="primary"
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          backgroundColor: c.is_locked ? "#94a3b8" : "#2563eb",
                          borderColor: c.is_locked ? "#94a3b8" : "#2563eb",
                        }}
                        disabled={c.is_locked}
                        icon={<ShoppingCartOutlined />}
                        onClick={() => {
                          if (onSelectCustomerForOrder) {
                            onSelectCustomerForOrder(c);
                          } else {
                            message.info(
                              `Đã chọn đại lý ${c.name} (${c.code}). Đang chuyển sang màn hình lên đơn...`
                            );
                          }
                        }}
                      >
                        Lên đơn
                      </Button>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      ) : (
        /* --- CHẾ ĐỘ BẢNG (TABLE VIEW) --- */
        <Card
          style={{
            borderRadius: 14,
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.04)",
            border: "1px solid #e2e8f0",
          }}
          styles={{ body: { padding: 0 } }}
        >
          <Table
            columns={columns}
            dataSource={customers}
            rowKey="id"
            loading={loading}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: totalCount,
              onChange: (p, s) => {
                setCurrentPage(p);
                setPageSize(s);
                loadCustomers(p, search, regionFilter, groupFilter, statusFilter, s);
              },
              showTotal: (total) => `Tổng cộng: ${total} đại lý`,
              showSizeChanger: true,
              pageSizeOptions: ["12", "24", "48", "96"],
            }}
            size="middle"
          />
        </Card>
      )}

      {/* 4. Drawer Xem chi tiết đại lý */}
      <Drawer
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShopOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <span>Hồ sơ chi tiết đại lý</span>
          </div>
        }
        placement="right"
        width={520}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        extra={
          detailCustomer?.phone && (
            <Button
              type="primary"
              style={{ backgroundColor: "#16a34a", borderColor: "#16a34a" }}
              icon={<PhoneOutlined />}
              href={`tel:${detailCustomer.phone}`}
            >
              Gọi ngay
            </Button>
          )
        }
      >
        {detailCustomer && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Header tóm tắt */}
            <div
              style={{
                backgroundColor: detailCustomer.is_locked ? "#fff1f2" : "#f0fdf4",
                border: detailCustomer.is_locked ? "1px solid #fecdd3" : "1px solid #bbf7d0",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong style={{ fontSize: 16, color: "#1e3a8a" }}>
                  {detailCustomer.code}
                </Text>
                {detailCustomer.is_locked ? (
                  <Tag color="error" icon={<LockOutlined />} style={{ fontWeight: 700 }}>
                    BỊ KHÓA GIAO DỊCH
                  </Tag>
                ) : (
                  <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 700 }}>
                    ĐANG HOẠT ĐỘNG
                  </Tag>
                )}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 4 }}>
                {detailCustomer.name}
              </div>
              <div style={{ marginTop: 8 }}>
                {getCustomerGroupBadge(detailCustomer.customer_group)}
              </div>
            </div>

            {/* Cảnh báo khóa nợ */}
            {detailCustomer.is_locked && (
              <Alert
                message="Lý do khóa đại lý"
                description={
                  detailCustomer.lock_reason ||
                  "Đại lý bị khóa chặn giao dịch do nợ quá hạn hoặc vi phạm chính sách bán hàng."
                }
                type="error"
                showIcon
              />
            )}

            {/* Thông tin liên lạc & Địa chỉ */}
            <Card size="small" title="Thông tin liên hệ & Địa bàn" style={{ borderRadius: 10 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Số điện thoại">
                  {detailCustomer.phone ? (
                    <a href={`tel:${detailCustomer.phone}`} style={{ color: "#16a34a", fontWeight: 700 }}>
                      <PhoneOutlined /> {detailCustomer.phone}
                    </a>
                  ) : (
                    <Text type="secondary">Chưa cập nhật</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Địa chỉ giao hàng">
                  {detailCustomer.address ? (
                    <div>
                      <div>{detailCustomer.address}</div>
                      <a
                        href={getGoogleMapsUrl(detailCustomer.address, detailCustomer.name)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "#2563eb", marginTop: 4, display: "inline-block" }}
                      >
                        <EnvironmentOutlined /> Chỉ đường trên Google Maps
                      </a>
                    </div>
                  ) : (
                    <Text type="secondary">Chưa cập nhật</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="Tuyến / Địa bàn">
                  {detailCustomer.territory_name || "Chưa gắn tuyến"}
                </Descriptions.Item>
                <Descriptions.Item label="NVKD phụ trách">
                  {detailCustomer.sales_rep_name || "Chưa phân công"}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Tình hình công nợ & Hạn mức */}
            <Card size="small" title="Hạn mức & Tình hình công nợ" style={{ borderRadius: 10 }}>
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Dư nợ hiện tại">
                  <Text strong style={{ color: (detailCustomer.current_debt || 0) > 0 ? "#dc2626" : "#16a34a", fontSize: 15 }}>
                    {formatMoney(detailCustomer.current_debt)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Hạn mức tín dụng">
                  {formatMoney(detailCustomer.debt_limit)}
                </Descriptions.Item>
                <Descriptions.Item label="Số ngày nợ tối đa">
                  {detailCustomer.max_due_days ? `${detailCustomer.max_due_days} ngày` : "Chưa cài đặt"}
                </Descriptions.Item>
                <Descriptions.Item label="Ngưỡng cảnh báo">
                  {detailCustomer.warning_threshold_percent ? `${detailCustomer.warning_threshold_percent}%` : "80%"}
                </Descriptions.Item>
                <Descriptions.Item label="Đơn hàng dở dang">
                  {detailCustomer.pending_orders_count || 0} đơn
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* Nút hành động */}
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {detailCustomer.phone && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: "#16a34a", borderColor: "#16a34a", borderRadius: 8 }}
                  icon={<PhoneOutlined />}
                  href={`tel:${detailCustomer.phone}`}
                >
                  Gọi điện thoại
                </Button>
              )}
              <Button
                type="primary"
                style={{
                  flex: 1,
                  borderRadius: 8,
                  backgroundColor: detailCustomer.is_locked ? "#94a3b8" : "#2563eb",
                  borderColor: detailCustomer.is_locked ? "#94a3b8" : "#2563eb",
                }}
                disabled={detailCustomer.is_locked}
                icon={<ShoppingCartOutlined />}
                onClick={() => {
                  setIsDrawerOpen(false);
                  if (onSelectCustomerForOrder) {
                    onSelectCustomerForOrder(detailCustomer);
                  } else {
                    message.info(`Đang chuyển sang tạo đơn cho ${detailCustomer.name}...`);
                  }
                }}
              >
                Tạo đơn hàng
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default SalesCustomerList;
