import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import { ClockCircleOutlined, ReloadOutlined, TruckOutlined } from "@ant-design/icons";
import { getAuthToken } from "../../services/apiClient";
import type { paths } from "../../types/api.generated";

type TripsResponse = paths["/api/v1/deliveries/trips/active"]["get"]["responses"][200]["content"]["application/json"];
type Trip = TripsResponse["data"][number];
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export default function ActiveDeliveryTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getAuthToken();
      const response = await fetch("/api/v1/deliveries/trips/active", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(response.status === 403 ? "Tài khoản không có quyền xem chuyến giao." : "Không tải được danh sách chuyến giao.");
      const body = await response.json() as TripsResponse;
      setTrips(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được danh sách chuyến giao.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTrips(); }, [loadTrips]);
  const dispatchColumns = [
    { title: "Phiếu xuất", dataIndex: "dispatchId", key: "dispatchId", render: (id: number) => `PX-${id}` },
    { title: "Đơn hàng", dataIndex: "orderId", key: "orderId", render: (id: number) => `DH-${id}` },
    { title: "Đại lý", dataIndex: "customerName", key: "customerName" },
    { title: "Ngày giao dự kiến", dataIndex: "desiredDeliveryDate", key: "desiredDeliveryDate", render: (date: string | null) => date || "—" },
    { title: "Trạng thái", dataIndex: "status", key: "status", render: (status: string) => <Tag color={status === "DELIVERED" ? "green" : status === "SHIPPED" ? "blue" : "default"}>{status === "DELIVERED" ? "Đã giao" : status === "SHIPPED" ? "Đang giao" : status}</Tag> },
  ];

  return <main style={{ display: "grid", gap: 20 }}>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div><Typography.Text type="secondary">VẬN HÀNH KHO · THEO DÕI GIAO HÀNG</Typography.Text><Typography.Title level={2} style={{ margin: "4px 0" }}>Hàng đang trên đường</Typography.Title><Typography.Text type="secondary">Theo dõi tiến độ từng chuyến và giá trị các phiếu chưa giao.</Typography.Text></div>
      <Button icon={<ReloadOutlined />} onClick={() => void loadTrips()} loading={loading}>Làm mới</Button>
    </header>
    {error && <Alert type="error" showIcon message={error} />}
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}><Card><Statistic title="Chuyến đang chạy" value={trips.length} prefix={<TruckOutlined />} /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="Điểm giao còn lại" value={trips.reduce((sum, trip) => sum + trip.remainingStops, 0)} /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="Giá trị đơn đang trên đường" value={currency.format(trips.reduce((sum, trip) => sum + trip.onRoadAmount, 0))} valueStyle={{ fontSize: 22 }} /></Card></Col>
    </Row>
    {trips.length === 0 && !loading ? <Card><Empty description="Hiện không có chuyến giao nào đang chạy." /></Card> : trips.map((trip) => <Card key={trip.tripId} loading={loading} title={<Space><TruckOutlined />{trip.routeName || `Chuyến #${trip.tripId}`}</Space>} extra={trip.isOverdue ? <Tag color="red" icon={<ClockCircleOutlined />}>Quá giờ dự kiến</Tag> : <Tag color="blue">Đang chạy</Tag>}>
      <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Typography.Text type="secondary">Tài xế</Typography.Text><div>{trip.driverName}</div></Col>
        <Col xs={12} md={6}><Typography.Text type="secondary">Phương tiện</Typography.Text><div>{trip.vehicleNumber}</div></Col>
        <Col xs={12} md={6}><Typography.Text type="secondary">Tiến độ</Typography.Text><div>{trip.deliveredStops} đã giao · {trip.remainingStops} còn lại</div></Col>
        <Col xs={12} md={6}><Typography.Text type="secondary">Dự kiến hoàn tất</Typography.Text><div>{trip.expectedCompletionAt ? new Date(trip.expectedCompletionAt).toLocaleString("vi-VN") : "Chưa thiết lập"}</div></Col>
        <Col span={24}><Typography.Text type="secondary">Giá trị phiếu chưa giao</Typography.Text><div><Typography.Text strong>{currency.format(trip.onRoadAmount)}</Typography.Text></div></Col>
      </Row>
      {trip.isOverdue && <Alert type="warning" showIcon message="Chuyến đã quá thời gian dự kiến và còn phiếu chưa xác nhận giao." style={{ marginBottom: 16 }} />}
      <Table rowKey="dispatchId" size="small" pagination={false} columns={dispatchColumns} dataSource={trip.dispatches} scroll={{ x: 650 }} />
    </Card>)}
  </main>;
}
