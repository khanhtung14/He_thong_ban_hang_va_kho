import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import { PrinterOutlined, ReloadOutlined, TruckOutlined } from "@ant-design/icons";
import {
  createDeliveryTrip,
  fetchActiveDeliveryTrips,
  fetchAvailableDeliveryDispatches,
  type ActiveDeliveryTrip,
  type AvailableDeliveryDispatch,
} from "../../services/apiClient";
import "./DeliveryTripManagement.css";

const { Title, Text } = Typography;

export const DeliveryTripManagement: React.FC = () => {
  const [dispatches, setDispatches] = useState<AvailableDeliveryDispatch[]>([]);
  const [trips, setTrips] = useState<ActiveDeliveryTrip[]>([]);
  const [selectedIds, setSelectedIds] = useState<React.Key[]>([]);
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [routeName, setRouteName] = useState("");
  const [estimatedDeliveryAt, setEstimatedDeliveryAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [printTrip, setPrintTrip] = useState<ActiveDeliveryTrip | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [available, active] = await Promise.all([
        fetchAvailableDeliveryDispatches(),
        fetchActiveDeliveryTrips(),
      ]);
      setDispatches(available);
      setTrips(active);
      setSelectedIds((current) => current.filter((id) => available.some((row) => row.dispatchId === id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tải dữ liệu chuyến giao.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: TableColumnsType<AvailableDeliveryDispatch> = useMemo(() => [
    { title: "Phiếu xuất", dataIndex: "dispatchId", render: (id: number) => <strong>PX-{id}</strong> },
    { title: "Đơn hàng", dataIndex: "orderCode" },
    { title: "Đại lý", dataIndex: "customerName" },
    { title: "Khu vực", dataIndex: "regionName" },
    { title: "Người nhận", dataIndex: "receiverName", render: (name: string) => name || "—" },
    { title: "Số điện thoại", dataIndex: "phone", render: (phone: string) => phone || "—" },
    { title: "Địa chỉ giao", dataIndex: "address", render: (address: string) => address || "Chưa có địa chỉ mặc định" },
  ], []);

  const submit = async () => {
    if (!selectedIds.length || !driverName.trim() || !vehicleNumber.trim() || !routeName.trim() || !estimatedDeliveryAt) {
      setError("Chọn ít nhất một phiếu xuất, điền thông tin chuyến và giờ giao dự kiến.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await createDeliveryTrip({
        driverName: driverName.trim(),
        vehicleNumber: vehicleNumber.trim(),
        routeName: routeName.trim(),
        estimatedDeliveryAt: new Date(estimatedDeliveryAt).toISOString(),
        dispatchIds: selectedIds.map(Number),
      });
      setSelectedIds([]);
      setDriverName("");
      setVehicleNumber("");
      setRouteName("");
      setEstimatedDeliveryAt("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể tạo chuyến giao.");
    } finally {
      setSaving(false);
    }
  };

  const printSelectedTrip = (trip: ActiveDeliveryTrip) => {
    setPrintTrip(trip);
    window.setTimeout(() => window.print(), 0);
  };

  return (
    <div className="delivery-trip-page">
      <div className="delivery-trip-heading">
        <div>
          <Text type="secondary">KHO VẬN / GIAO HÀNG</Text>
          <Title level={2}>Phân tuyến giao hàng</Title>
          <Text>Gom phiếu xuất theo khu vực, phân công tài xế và in danh sách điểm giao.</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Làm mới</Button>
      </div>

      {error && <Alert className="delivery-trip-alert" type="error" showIcon message={error} />}

      <Card title="Tạo chuyến giao" extra={<Tag color="blue">{selectedIds.length} phiếu đã chọn</Tag>}>
        <Row gutter={[16, 16]} className="delivery-trip-form">
          <Col xs={24} md={8}><label htmlFor="delivery-driver">Tài xế</label><Input id="delivery-driver" value={driverName} onChange={(event) => setDriverName(event.target.value)} placeholder="Tên tài xế" maxLength={150} /></Col>
          <Col xs={24} md={8}><label htmlFor="delivery-vehicle">Phương tiện</label><Input id="delivery-vehicle" value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value)} placeholder="Biển số xe" maxLength={50} /></Col>
          <Col xs={24} md={8}><label htmlFor="delivery-route">Tuyến giao</label><Input id="delivery-route" value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Ví dụ: Cầu Giấy - Từ Liêm" maxLength={150} /></Col>
          <Col xs={24} md={8}><label htmlFor="delivery-eta">Giờ giao dự kiến</label><Input id="delivery-eta" type="datetime-local" value={estimatedDeliveryAt} onChange={(event) => setEstimatedDeliveryAt(event.target.value)} /></Col>
        </Row>
        <div className="delivery-trip-table-heading">
          <Title level={5}>Phiếu xuất chờ phân tuyến</Title>
          <Text type="secondary">Chọn các phiếu thuộc cùng một vòng giao.</Text>
        </div>
        <Table<AvailableDeliveryDispatch>
          rowKey="dispatchId"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={dispatches}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys, rows) => {
              const regions = new Set(rows.map((row) => row.regionName));
              if (regions.size > 1) {
                setError("Mỗi chuyến chỉ gom phiếu xuất thuộc cùng một khu vực.");
                return;
              }
              setError("");
              setSelectedIds(keys);
              if (rows.length && !routeName.trim()) setRouteName(`Tuyến ${rows[0].regionName}`);
            },
          }}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: "Không có phiếu xuất nào đang chờ xếp chuyến." }}
          scroll={{ x: 850 }}
        />
        <div className="delivery-trip-submit"><Button type="primary" icon={<TruckOutlined />} loading={saving} disabled={loading || !selectedIds.length} onClick={() => void submit()}>Tạo chuyến giao</Button></div>
      </Card>

      <section className="delivery-active-trips">
        <div className="delivery-trip-table-heading"><Title level={3}>Chuyến đang giao</Title><Text type="secondary">Theo dõi số điểm đã giao và còn lại.</Text></div>
        {!loading && trips.length === 0 ? <div className="delivery-trip-empty">Chưa có chuyến giao đang hoạt động.</div> : (
          <Row gutter={[16, 16]}>
            {trips.map((trip) => (
              <Col xs={24} xl={12} key={trip.id}>
                <Card className="delivery-active-card" title={<Space><TruckOutlined />{trip.routeName || `Chuyến #${trip.id}`}</Space>} extra={<Button icon={<PrinterOutlined />} onClick={() => printSelectedTrip(trip)}>In danh sách</Button>}>
                  {trip.isOverdue && <Alert type="error" showIcon message="Chuyến đã quá giờ dự kiến, vẫn còn điểm chưa giao." />}
                  <div className="delivery-trip-meta"><span><Text type="secondary">Tài xế</Text><strong>{trip.driverName}</strong></span><span><Text type="secondary">Phương tiện</Text><strong>{trip.vehicleNumber}</strong></span><span><Text type="secondary">Tiến độ</Text><strong>{trip.deliveredStops}/{trip.deliveredStops + trip.remainingStops} điểm</strong></span><span><Text type="secondary">Dự kiến</Text><strong>{trip.estimatedDeliveryAt ? new Date(trip.estimatedDeliveryAt).toLocaleString("vi-VN") : "Chưa đặt giờ"}</strong></span></div>
                  <div className="delivery-transit-value"><Text type="secondary">Giá trị hàng còn trên đường</Text><strong>{trip.isAmountComplete && trip.inTransitAmount !== null ? `${new Intl.NumberFormat("vi-VN").format(trip.inTransitAmount)} ₫` : "Chưa đủ dữ liệu phiếu xuất để tính"}</strong></div>
                  <ol className="delivery-stop-list">
                    {trip.stops.map((stop) => <li key={stop.dispatchId}>
                      <div><strong>{stop.orderCode} · {stop.customerName}</strong><span>{stop.receiverName || "Người nhận chưa khai báo"} · {stop.phone || "Chưa có số điện thoại"}</span><span>{stop.address || "Chưa có địa chỉ giao mặc định"}</span></div>
                      <Tag color={stop.deliveryStatus === "DELIVERED" ? "green" : "processing"}>{stop.deliveryStatus === "DELIVERED" ? "Đã giao" : "Còn trên chuyến"}</Tag>
                    </li>)}
                  </ol>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </section>

      {printTrip && <div className="delivery-print-sheet">
        <h1>Danh sách điểm giao — {printTrip.routeName}</h1>
        <p>Tài xế: {printTrip.driverName}　 |　 Phương tiện: {printTrip.vehicleNumber}</p>
        <ol>{printTrip.stops.map((stop) => <li key={stop.dispatchId}><strong>{stop.orderCode} — {stop.customerName}</strong><br />Người nhận: {stop.receiverName || "—"}　|　Điện thoại: {stop.phone || "—"}<br />Địa chỉ: {stop.address || "—"}</li>)}</ol>
      </div>}
    </div>
  );
};

export default DeliveryTripManagement;
