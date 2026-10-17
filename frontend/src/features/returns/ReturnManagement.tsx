import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import {
  CheckCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import {
  createReturnOrder,
  fetchEligibleReturnInvoices,
  fetchReturnOrders,
  fetchReturnableInvoice,
  fetchWarehouseDirectory,
  receiveReturnOrder,
  type EligibleReturnInvoice,
  type ReturnOrder,
  type ReturnReceipt,
  type ReturnableInvoice,
  type ReturnableItem,
  type WarehouseDirectory,
} from "../../services/apiClient";

const { Text, Title } = Typography;

interface ReturnManagementProps {
  mode: "sales" | "warehouse";
}

interface ReturnLineEntry {
  quantity: number;
  unitId?: number;
  unitName: string;
  conversionRate: number;
}

const lineKey = (item: ReturnableItem) =>
  `${item.productId}:${item.lotNumber ?? ""}`;

const statusLabel: Record<string, string> = {
  PENDING: "Chờ kho nhận",
  PENDING_RECEIPT: "Chờ kho nhận",
  RECEIVED: "Đã nhận",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
};

export default function ReturnManagement({ mode }: ReturnManagementProps) {
  const [invoices, setInvoices] = useState<EligibleReturnInvoice[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDirectory>([]);
  const [invoice, setInvoice] = useState<ReturnableInvoice | null>(null);
  const [invoiceId, setInvoiceId] = useState<number>();
  const [returnDate, setReturnDate] = useState<Dayjs>(dayjs());
  const [reason, setReason] = useState("");
  const [warehouseId, setWarehouseId] = useState<number>();
  const [lineEntries, setLineEntries] = useState<Record<string, ReturnLineEntry>>({});
  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [conditions, setConditions] = useState<Record<number, "GOOD" | "DAMAGED">>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receivingId, setReceivingId] = useState<number>();

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      setReturns(await fetchReturnOrders());
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải phiếu trả hàng.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSalesOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [availableInvoices, activeWarehouses] = await Promise.all([
        fetchEligibleReturnInvoices(),
        fetchWarehouseDirectory(),
      ]);
      setInvoices(availableInvoices);
      setWarehouses(activeWarehouses);
      setWarehouseId((current) => current ?? activeWarehouses[0]?.id);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải dữ liệu lập phiếu.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      try {
        const returnOrders = await fetchReturnOrders();
        if (active) setReturns(returnOrders);
        if (mode === "sales") {
          const [availableInvoices, activeWarehouses] = await Promise.all([
            fetchEligibleReturnInvoices(),
            fetchWarehouseDirectory(),
          ]);
          if (active) {
            setInvoices(availableInvoices);
            setWarehouses(activeWarehouses);
            setWarehouseId((current) => current ?? activeWarehouses[0]?.id);
          }
        }
      } catch (error) {
        if (active) {
          message.error(error instanceof Error ? error.message : "Không thể tải dữ liệu trả hàng.");
        }
      }
    };
    void loadInitialData();
    return () => {
      active = false;
    };
  }, [mode]);

  const handleInvoiceChange = async (selectedId: number) => {
    setInvoiceId(selectedId);
    setInvoice(null);
    setLineEntries({});
    setLoading(true);
    try {
      const details = await fetchReturnableInvoice(selectedId);
      setInvoice(details);
      setLineEntries(
        Object.fromEntries(
          details.items.map((item) => {
            const unit = item.units.find((candidate) => candidate.isBaseUnit) ?? item.units[0];
            return [
              lineKey(item),
              {
                quantity: 0,
                unitId: unit?.unitId,
                unitName: unit?.unitName ?? item.baseUnit,
                conversionRate: unit?.conversionRate ?? 1,
              },
            ];
          }),
        ),
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể tải chi tiết hóa đơn.");
    } finally {
      setLoading(false);
    }
  };

  const setLineEntry = (item: ReturnableItem, patch: Partial<ReturnLineEntry>) => {
    const key = lineKey(item);
    setLineEntries((current) => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  };

  const handleCreate = async () => {
    const selectedLines =
      invoice?.items
        .map((item) => ({ item, entry: lineEntries[lineKey(item)] }))
        .filter((line) => line.entry && line.entry.quantity > 0) ?? [];
    if (!invoiceId || !warehouseId || !reason.trim() || selectedLines.length === 0) {
      message.error("Hãy chọn hóa đơn, kho nhận, nhập lý do và ít nhất một dòng hàng.");
      return;
    }

    setSaving(true);
    try {
      await createReturnOrder({
        invoiceId,
        warehouseId,
        returnDate: returnDate.format("YYYY-MM-DD"),
        reason: reason.trim(),
        items: selectedLines.map(({ item, entry }) => ({
          productId: item.productId,
          unitId: entry.unitId,
          lotNumber: item.manageByLot ? item.lotNumber : undefined,
          quantity: entry.quantity,
        })),
      });
      message.success("Đã tạo phiếu trả hàng, chờ Quản lý kho xác nhận.");
      setInvoiceId(undefined);
      setInvoice(null);
      setReason("");
      setLineEntries({});
      await Promise.all([loadSalesOptions(), loadReturns()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Tạo phiếu trả hàng thất bại.");
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async (returnOrder: ReturnOrder) => {
    const items: ReturnReceipt["items"] = [];
    for (const item of returnOrder.items) {
      const condition = conditions[item.id];
      if (!condition) {
        message.error("Hãy xác nhận tình trạng cho tất cả dòng hàng.");
        return;
      }
      items.push({ returnItemId: item.id, condition });
    }
    setReceivingId(returnOrder.id);
    try {
      await receiveReturnOrder(returnOrder.id, {
        items,
      });
      message.success("Đã xác nhận nhận hàng và cập nhật tồn kho.");
      setConditions((current) => {
        const updated = { ...current };
        returnOrder.items.forEach((item) => delete updated[item.id]);
        return updated;
      });
      await loadReturns();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Không thể xác nhận nhận hàng.");
    } finally {
      setReceivingId(undefined);
    }
  };

  const returnColumns = useMemo<ColumnsType<ReturnOrder>>(
    () => [
      { title: "Phiếu", dataIndex: "id", render: (id: number) => `#${id}` },
      { title: "Hóa đơn", dataIndex: "invoiceId", render: (id: number) => `#${id}` },
      { title: "Đại lý", dataIndex: "customerName" },
      {
        title: "Ngày lập",
        dataIndex: "returnDate",
        render: (value: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "-"),
      },
      {
        title: "Trạng thái",
        dataIndex: "status",
        render: (value: string) => (
          <Tag color={value === "RECEIVED" ? "green" : value === "PENDING_RECEIPT" ? "gold" : "default"}>
            {statusLabel[value] ?? value}
          </Tag>
        ),
      },
      {
        title: "Chi tiết",
        render: (_, record) => (
          <Space direction="vertical" size={2}>
            {record.items.map((item) => (
              <Text key={item.id}>
                {item.sku ?? `SKU #${item.productId}`} · {item.quantity} {item.unitName ?? ""}{" "}
                {item.lotNumber ? `· Lô ${item.lotNumber}` : ""}
                {item.condition ? `· ${item.condition === "GOOD" ? "Hàng tốt" : "Hàng lỗi"}` : ""}
              </Text>
            ))}
          </Space>
        ),
      },
    ],
    [],
  );

  const receiveColumns = useMemo<ColumnsType<ReturnOrder["items"][number]>>(
    () => [
      { title: "SKU", dataIndex: "sku", render: (sku: string | null, item) => sku ?? `#${item.productId}` },
      {
        title: "Số lượng",
        render: (_, item) => `${item.quantity} ${item.unitName ?? ""} (${item.baseQuantity} đơn vị cơ sở)`,
      },
      { title: "Lô", dataIndex: "lotNumber", render: (value: string | null) => value ?? "Không quản lý lô" },
      {
        title: "Tình trạng nhận",
        render: (_, item) => (
          <Select
            aria-label={`Tình trạng SKU ${item.sku ?? item.productId}`}
            placeholder="Chọn tình trạng"
            value={conditions[item.id]}
            onChange={(value: "GOOD" | "DAMAGED") =>
              setConditions((current) => ({ ...current, [item.id]: value }))
            }
            options={[
              { value: "GOOD", label: "Hàng tốt — nhập tồn khả dụng" },
              { value: "DAMAGED", label: "Hàng hỏng — nhập kho hàng lỗi" },
            ]}
            style={{ minWidth: 240 }}
          />
        ),
      },
    ],
    [conditions],
  );

  const pendingReturns = returns.filter((item) => item.status === "PENDING_RECEIPT");

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card>
        <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
          <Space>
            <RollbackOutlined style={{ color: "#1677ff", fontSize: 22 }} />
            <div>
              <Title level={3} style={{ margin: 0 }}>
                {mode === "sales" ? "Lập phiếu trả hàng" : "Xác nhận hàng đại lý trả"}
              </Title>
              <Text type="secondary">
                {mode === "sales"
                  ? "Chọn hóa đơn gốc, mặt hàng và số lượng còn được trả."
                  : "Kiểm tra từng dòng hàng; hàng hỏng được tách khỏi tồn khả dụng."}
              </Text>
            </div>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadReturns()} loading={loading}>
            Làm mới
          </Button>
        </Space>
      </Card>

      {mode === "sales" && (
        <Card title="Thông tin phiếu trả">
          <Space direction="vertical" size="middle" style={{ display: "flex" }}>
            <Space wrap align="start">
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Chọn hóa đơn gốc"
                value={invoiceId}
                onChange={(value: number) => void handleInvoiceChange(value)}
                options={invoices.map((item) => ({
                  value: item.id,
                  label: `HĐ #${item.id} · ${item.customerName} · ${item.invoiceDate ? dayjs(item.invoiceDate).format("DD/MM/YYYY") : ""}`,
                }))}
                style={{ minWidth: 340 }}
              />
              <Select
                placeholder="Chọn kho nhận"
                value={warehouseId}
                onChange={setWarehouseId}
                options={warehouses.map((item) => ({
                  value: item.id,
                  label: `${item.code} · ${item.name}`,
                }))}
                style={{ minWidth: 280 }}
              />
              <DatePicker value={returnDate} onChange={(value) => value && setReturnDate(value)} />
            </Space>
            {invoice && (
              <>
                <Alert
                  type="info"
                  showIcon
                  message={`Đại lý: ${invoice.customerName}. Số lượng trả đã trừ các phiếu đang chờ và đã nhận.`}
                />
                <Table
                  rowKey={lineKey}
                  dataSource={invoice.items}
                  pagination={false}
                  columns={[
                    {
                      title: "Sản phẩm",
                      render: (_, item) => (
                        <Space direction="vertical" size={0}>
                          <Text strong>{item.sku} · {item.productName}</Text>
                          <Text type="secondary">
                            Đã giao {item.deliveredBaseQuantity} {item.baseUnit}; còn trả{" "}
                            {item.returnableBaseQuantity} {item.baseUnit}
                          </Text>
                        </Space>
                      ),
                    },
                    {
                      title: "Lô",
                      dataIndex: "lotNumber",
                      render: (value: string | null, item) => item.manageByLot ? value : "Không quản lý lô",
                    },
                    {
                      title: "Đơn vị",
                      render: (_, item) => {
                        const current = lineEntries[lineKey(item)];
                        return item.units.length ? (
                          <Select
                            value={current?.unitId}
                            onChange={(unitId: number) => {
                              const unit = item.units.find((candidate) => candidate.unitId === unitId);
                              if (unit) setLineEntry(item, {
                                quantity: 0,
                                unitId,
                                unitName: unit.unitName,
                                conversionRate: unit.conversionRate,
                              });
                            }}
                            options={item.units.map((unit) => ({
                              value: unit.unitId,
                              label: `${unit.unitName} (×${unit.conversionRate})`,
                            }))}
                            style={{ minWidth: 150 }}
                          />
                        ) : item.baseUnit;
                      },
                    },
                    {
                      title: "Số lượng trả",
                      render: (_, item) => {
                        const entry = lineEntries[lineKey(item)];
                        const max = entry ? item.returnableBaseQuantity / entry.conversionRate : 0;
                        return (
                          <InputNumber
                            min={0}
                            max={max}
                            step={1}
                            value={entry?.quantity ?? 0}
                            onChange={(value) => setLineEntry(item, { quantity: value ?? 0 })}
                          />
                        );
                      },
                    },
                  ]}
                />
              </>
            )}
            <Input.TextArea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              showCount
              rows={3}
              placeholder="Lý do trả hàng (bắt buộc)"
            />
            <Button type="primary" onClick={() => void handleCreate()} loading={saving} disabled={!invoices.length || !warehouses.length}>
              Tạo phiếu chờ kho xác nhận
            </Button>
          </Space>
        </Card>
      )}

      {mode === "warehouse" && (
        <Card title={`Phiếu chờ nhận (${pendingReturns.length})`}>
          {pendingReturns.length === 0 ? (
            <Empty description="Không có phiếu trả nào đang chờ nhận." />
          ) : (
            <Space direction="vertical" style={{ display: "flex" }} size="middle">
              {pendingReturns.map((returnOrder) => (
                <Card
                  key={returnOrder.id}
                  size="small"
                  title={`Phiếu #${returnOrder.id} · Hóa đơn #${returnOrder.invoiceId} · ${returnOrder.customerName ?? "Đại lý"}`}
                  extra={<Tag color="gold">Chờ nhận</Tag>}
                >
                  <Space direction="vertical" style={{ display: "flex" }}>
                    <Text>Lý do: {returnOrder.reason}</Text>
                    <Table
                      rowKey="id"
                      dataSource={returnOrder.items}
                      columns={receiveColumns}
                      pagination={false}
                      size="small"
                    />
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      loading={receivingId === returnOrder.id}
                      disabled={returnOrder.items.some((item) => !conditions[item.id])}
                      onClick={() => void handleReceive(returnOrder)}
                    >
                      Xác nhận nhận hàng
                    </Button>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Card>
      )}

      <Card title={mode === "sales" ? "Lịch sử phiếu trả" : "Phiếu đã xử lý"}>
        <Table
          rowKey="id"
          dataSource={returns}
          columns={returnColumns}
          loading={loading}
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: "Chưa có phiếu trả hàng." }}
        />
      </Card>
    </Space>
  );
}
