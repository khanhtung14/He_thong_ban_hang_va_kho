import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Button, Card, DatePicker, Descriptions, Drawer, Empty, Input,
  Progress, Select, Space, Statistic, Table, Tag, Timeline, Typography,
} from "antd";
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  InboxOutlined, ReloadOutlined, SearchOutlined, TruckOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { getAuthToken } from "../../services/apiClient";
import type { paths } from "../../types/api.generated";

type ListResponse = paths["/api/v1/deliveries/track"]["get"]["responses"][200]["content"]["application/json"];
type DetailResponse = paths["/api/v1/deliveries/track/{order_id}"]["get"]["responses"][200]["content"]["application/json"];
type OrderSummary = ListResponse["data"]["items"][number];
type OrderDetail = DetailResponse["data"];
type Status = string;

const statusLabels: Record<string, string> = {
  APPROVED: "Đã duyệt", PREPARING: "Đang soạn", DISPATCHED: "Đã xuất",
  IN_DELIVERY: "Đang giao", DELIVERED: "Đã giao", DELIVERY_FAILED: "Giao thất bại",
  DRAFT: "Bản nháp", PENDING: "Chờ duyệt", PENDING_APPROVAL: "Chờ duyệt",
  PROCESSING: "Đang xử lý", COMPLETED: "Hoàn tất", CANCELLED: "Đã hủy",
};
const statusColors: Record<string, string> = {
  APPROVED: "geekblue", PREPARING: "blue", DISPATCHED: "cyan", IN_DELIVERY: "processing",
  DELIVERED: "success", DELIVERY_FAILED: "error", CANCELLED: "default", PENDING: "gold",
  PENDING_APPROVAL: "gold", DRAFT: "default", PROCESSING: "blue",
};
const statusOptions = [
  { value: "APPROVED", label: "Đã duyệt" }, { value: "PREPARING", label: "Đang soạn" },
  { value: "DISPATCHED", label: "Đã xuất" }, { value: "IN_DELIVERY", label: "Đang giao" },
  { value: "DELIVERED", label: "Đã giao" }, { value: "DELIVERY_FAILED", label: "Giao thất bại" },
  { value: "PENDING", label: "Chờ duyệt" }, { value: "CANCELLED", label: "Đã hủy" },
];
const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "Chưa ghi nhận";
const fmtDateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
const qty = (value?: number | null) => value == null ? "Chưa có dữ liệu" : new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 3 }).format(value);

function StatusBadge({ status }: { status: Status }) {
  return <Tag color={statusColors[status] || "default"}>{statusLabels[status] || status}</Tag>;
}

export default function DeliveryTracking() {
  const [list, setList] = useState<ListResponse["data"]>();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<OrderDetail>();
  const [selectedOrderId, setSelectedOrderId] = useState<number>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) query.set("search", search.trim());
    if (status) query.set("status", status);
    if (dateRange) {
      query.set("fromDate", dateRange[0]);
      query.set("toDate", dateRange[1]);
    }
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/v1/deliveries/track?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(response.status === 403 ? "Tài khoản chưa được gắn hồ sơ đại lý hoặc không có quyền xem đơn." : "Không tải được danh sách theo dõi giao hàng.");
      const result = await response.json() as ListResponse;
      setList(result.data);
      setOrders(result.data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được danh sách đơn hàng.");
    } finally {
      setLoading(false);
    }
  }, [dateRange, page, pageSize, search, status]);

  useEffect(() => { void Promise.resolve().then(loadOrders); }, [loadOrders]);

  const openDetail = async (orderId: number) => {
    setSelectedOrderId(orderId);
    setDetail(undefined);
    setDetailError("");
    setDetailLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/v1/deliveries/track/${orderId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(response.status === 404 ? "Đơn hàng không tồn tại hoặc ngoài phạm vi tài khoản." : "Không tải được chi tiết giao hàng.");
      const result = await response.json() as DetailResponse;
      setDetail(result.data);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Không tải được chi tiết đơn hàng.");
    } finally {
      setDetailLoading(false);
    }
  };

  const applyFilters = () => { setPage(1); setSearch(searchDraft); };
  const clearFilters = () => {
    setSearchDraft(""); setSearch(""); setStatus(undefined); setDateRange(null); setPage(1);
  };

  const columns: ColumnsType<OrderSummary> = useMemo(() => [
    { title: "Mã đơn hàng", dataIndex: "orderCode", key: "orderCode", width: 165, render: (code: string) => <Typography.Text strong style={{ color: "#164b89" }}>{code}</Typography.Text> },
    { title: "Ngày đặt", dataIndex: "createdAt", key: "createdAt", width: 125, align: "center", render: fmtDateOnly },
    { title: "Trạng thái", dataIndex: "currentStatus", key: "currentStatus", width: 145, align: "center", render: (value: string) => <StatusBadge status={value} /> },
    { title: "Tiến độ giao", dataIndex: "deliveryProgress", key: "deliveryProgress", width: 160, align: "center", render: (value: number | null) => value == null ? <Typography.Text type="secondary">Chưa xuất</Typography.Text> : <Progress percent={value} size="small" /> },
    { title: "Dòng hàng", dataIndex: "lineCount", key: "lineCount", width: 95, align: "center" },
    { title: "Cập nhật gần nhất", dataIndex: "lastUpdatedAt", key: "lastUpdatedAt", width: 145, align: "center", render: fmtDateOnly },
    { title: "Thao tác", key: "action", width: 125, align: "center", fixed: "right", render: (_, order) => <Button type="link" onClick={() => void openDetail(order.orderId)}>Xem chi tiết</Button> },
  ], []);

  const itemColumns = useMemo<ColumnsType<OrderDetail["items"][number]>>(() => [
    { title: "Mã sản phẩm", dataIndex: "sku", key: "sku", width: 130, render: (value: string | null) => value || "—" },
    { title: "Tên sản phẩm", dataIndex: "productName", key: "productName", width: 220 },
    { title: "Đơn vị", dataIndex: "unitName", key: "unitName", width: 90, render: (value: string | null) => value || "—" },
    { title: "Số lượng đặt", dataIndex: "orderedQuantity", key: "orderedQuantity", width: 115, align: "right", render: qty },
    { title: "Thực giao", dataIndex: "actualDeliveredQuantity", key: "actualDeliveredQuantity", width: 125, align: "right", render: qty },
    { title: "Chênh lệch", dataIndex: "quantityDifference", key: "quantityDifference", width: 120, align: "right", render: (value: number | null) => value == null ? <Typography.Text type="secondary">Chưa chốt</Typography.Text> : <Typography.Text type={value < 0 ? "danger" : undefined}>{value > 0 ? "+" : ""}{qty(value)}</Typography.Text> },
    { title: "Ghi chú", dataIndex: "note", key: "note", width: 250, render: (value: string | null) => value || "—" },
  ], []);

  const timelineItems = detail?.timeline.map((step) => ({
    color: step.state === "exception" ? "red" : step.state === "completed" ? "green" : step.state === "current" ? "blue" : "gray",
    dot: step.state === "exception" ? <CloseCircleOutlined /> : step.state === "completed" ? <CheckCircleOutlined /> : step.state === "current" ? <ClockCircleOutlined /> : <InboxOutlined />,
    children: <div className="tracking-timeline-step">
      <div className="tracking-timeline-step__title"><strong>{step.label}</strong><span>{fmtDate(step.occurredAt)}</span></div>
      {step.note && <Typography.Text type="secondary">{step.note}</Typography.Text>}
      {step.state === "exception" && <Tag color="error">Có sự cố giao hàng</Tag>}
    </div>,
  }));

  const totalOrdered = detail?.items.reduce((sum, item) => sum + item.orderedQuantity, 0);
  const totalDelivered = detail?.items.every((item) => item.actualDeliveredQuantity != null)
    ? detail.items.reduce((sum, item) => sum + (item.actualDeliveredQuantity || 0), 0)
    : null;
  const deliveredPercent = list?.stats.totalOrders
    ? Math.round((list.stats.deliveredOrders / list.stats.totalOrders) * 100)
    : 0;

  return <main className="delivery-tracking-page">
    <div className="delivery-tracking-page__heading">
      <div><Typography.Text className="delivery-tracking-page__eyebrow">ĐẠI LÝ · ĐƠN HÀNG</Typography.Text><Typography.Title level={2}>Theo dõi giao hàng</Typography.Title><Typography.Text type="secondary">Cập nhật tiến độ và chuẩn bị người nhận khi xe tới.</Typography.Text></div>
      <Button icon={<ReloadOutlined />} onClick={() => void loadOrders()} loading={loading}>Làm mới</Button>
    </div>
    {error && <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => void loadOrders()}>Thử lại</Button>} />}
    {list && <section className="delivery-tracking-overview">
      <div className="delivery-tracking-stats">
        <Card className="delivery-tracking-stat"><Statistic title="Tổng đơn hàng" value={list.stats.totalOrders} prefix={<InboxOutlined />} /></Card>
        <Card className="delivery-tracking-stat"><Statistic title="Đang xử lý" value={list.stats.processingOrders} prefix={<ClockCircleOutlined />} /></Card>
        <Card className="delivery-tracking-stat"><Statistic title="Đang giao" value={list.stats.inDeliveryOrders} prefix={<TruckOutlined />} /></Card>
        <Card className="delivery-tracking-stat"><Statistic title="Đã giao" value={list.stats.deliveredOrders} prefix={<CheckCircleOutlined />} /></Card>
      </div>
      <Card className="delivery-tracking-progress-card" title="Tình hình giao hàng">
        <div className="delivery-tracking-progress-highlight">
          <span className="delivery-tracking-progress-highlight__value">{list.stats.inDeliveryOrders}</span>
          <span className="delivery-tracking-progress-highlight__label">đơn đang trên đường giao</span>
        </div>
        <div className="delivery-tracking-progress-caption">
          <span>Tỷ lệ đơn đã giao</span><strong>{deliveredPercent}%</strong>
        </div>
        <Progress percent={deliveredPercent} showInfo={false} />
        <div className="delivery-tracking-progress-footnote">
          {list.stats.deliveredOrders} / {list.stats.totalOrders} đơn đã giao thành công
        </div>
        <Button type="link" className="delivery-tracking-progress-link" onClick={() => { setStatus("IN_DELIVERY"); setPage(1); }}>
          Xem đơn đang giao <TruckOutlined />
        </Button>
      </Card>
    </section>}

    <Card className="delivery-tracking-list-card" title="Danh sách đơn hàng" extra={list ? <Typography.Text type="secondary">{list.total} đơn</Typography.Text> : null}>
      <div className="delivery-tracking-filters">
        <Input.Search value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} onSearch={applyFilters} placeholder="Tìm mã đơn hàng" allowClear style={{ maxWidth: 280 }} />
        <Select allowClear value={status} onChange={(value) => { setStatus(value); setPage(1); }} placeholder="Tất cả trạng thái" options={statusOptions} style={{ minWidth: 180 }} />
        <DatePicker.RangePicker onChange={(dates) => { setDateRange(dates?.[0] && dates[1] ? [dates[0].format("YYYY-MM-DD"), dates[1].format("YYYY-MM-DD")] : null); setPage(1); }} />
        <Space className="delivery-tracking-filter-actions"><Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>Tìm kiếm</Button><Button onClick={clearFilters}>Xóa lọc</Button></Space>
      </div>
      <div className="delivery-tracking-table-wrap"><Table<OrderSummary>
        rowKey="orderId"
        columns={columns}
        dataSource={orders}
        loading={loading}
        locale={{ emptyText: <Empty description="Không tìm thấy đơn hàng phù hợp." /> }}
        scroll={{ x: 1000 }}
        pagination={{ current: page, pageSize, total: list?.total || 0, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (total) => `${total} đơn hàng`, onChange: (nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); } }}
      /></div>
    </Card>

    <Drawer title={detail ? `Chi tiết giao hàng · ${detail.orderCode}` : "Chi tiết giao hàng"} open={Boolean(detail) || detailLoading || Boolean(detailError)} onClose={() => { setDetail(undefined); setDetailError(""); setSelectedOrderId(undefined); }} width="min(900px, 100vw)">
      {detailError && <Alert type="error" showIcon message={detailError} action={<Button size="small" onClick={() => selectedOrderId && void openDetail(selectedOrderId)}>Thử lại</Button>} />}
      {detailLoading && <Card loading />}
      {detail && <div className="delivery-tracking-detail">
        <div className="delivery-tracking-detail__top"><div><Typography.Title level={4} style={{ marginBottom: 8 }}>{detail.orderCode}</Typography.Title><StatusBadge status={detail.currentStatus} /></div><Typography.Text type="secondary">Đặt ngày {fmtDate(detail.createdAt)}</Typography.Text></div>
        {(detail.recipientName || detail.deliveryAddress) && <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} items={[
          ...(detail.recipientName ? [{ key: "recipient", label: "Người nhận", children: detail.recipientName }] : []),
          ...(detail.deliveryAddress ? [{ key: "address", label: "Địa điểm giao", children: detail.deliveryAddress }] : []),
        ]} />}
        {detail.dispatches.some((dispatch) => dispatch.deliveryStatus === "FAILED") && <Alert className="delivery-tracking-failure" type="error" showIcon message="Đơn có phiếu giao thất bại" description={detail.dispatches.filter((dispatch) => dispatch.deliveryStatus === "FAILED").map((dispatch) => `Phiếu ${dispatch.dispatchId}: ${dispatch.failureReason || "Không ghi rõ lý do"} · ${fmtDate(dispatch.confirmedAt)}`).join("\n")} />}
        <Card size="small" title="Tiến trình giao hàng" className="delivery-tracking-timeline-card"><Timeline items={timelineItems} /></Card>
        <Card size="small" title="Chi tiết dòng hàng" className="delivery-tracking-items-card">
          <Table rowKey="orderItemId" size="small" columns={itemColumns} dataSource={detail.items} pagination={false} scroll={{ x: 1000 }} summary={() => <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={3}><strong>Tổng</strong></Table.Summary.Cell><Table.Summary.Cell index={3} align="right"><strong>{qty(totalOrdered)}</strong></Table.Summary.Cell><Table.Summary.Cell index={4} align="right"><strong>{qty(totalDelivered)}</strong></Table.Summary.Cell><Table.Summary.Cell index={5} colSpan={2} /></Table.Summary.Row>} />
        </Card>
      </div>}
    </Drawer>
  </main>;
}
