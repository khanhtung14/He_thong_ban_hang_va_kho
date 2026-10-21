import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Empty,
  Spin,
  Descriptions,
  Divider,
  Alert,
  Input,
  Radio,
  Steps,
  message,
  Tooltip,
  Pagination,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  HistoryOutlined,
  EyeOutlined,
  ReloadOutlined,
  ShoppingOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  RedoOutlined,
  CheckOutlined,
  CarOutlined,
  CalendarOutlined,
  SearchOutlined,
  WarningOutlined,
  RightOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  fetchPortalOrders,
  fetchPortalOrderDetail,
  fetchReorderItems,
  createOrder,
  type OrderResponseItem,
  type OrderItemView,
  type ReorderItemDetail,
  type ReorderPreparationResponse,
  type CreateOrderPayload,
} from "../../services/apiClient";

const { Title, Text } = Typography;

interface CustomerOrdersProps {
  onNavigateToProducts?: () => void;
}

export const CustomerOrders: React.FC<CustomerOrdersProps> = ({
  onNavigateToProducts,
}) => {
  const [orders, setOrders] = useState<OrderResponseItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Bộ lọc & Tìm kiếm
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Modal Xem Chi Tiết
  const [selectedOrder, setSelectedOrder] = useState<OrderResponseItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // State cho tính năng Đặt lại đơn hàng (Reorder)
  const [reorderModalOpen, setReorderModalOpen] = useState<boolean>(false);
  const [reorderLoadingId, setReorderLoadingId] = useState<number | null>(null);
  const [reorderSubmitting, setReorderSubmitting] = useState<boolean>(false);
  const [reorderData, setReorderData] = useState<ReorderPreparationResponse | null>(null);
  const [reorderItems, setReorderItems] = useState<ReorderItemDetail[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<React.Key[]>([]);
  const [reorderNote, setReorderNote] = useState<string>("");

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== "undefined" && window.innerWidth < 768;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPortalOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Lỗi tải danh sách đơn hàng đại lý:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleGoToProducts = () => {
    if (onNavigateToProducts) {
      onNavigateToProducts();
    } else {
      window.location.href = "/portal/products";
    }
  };

  const formatDateTime = (dt?: string | null) => {
    if (!dt) return "-";
    try {
      const raw = String(dt).trim();
      const utcStr = raw.endsWith("Z") || raw.includes("+") ? raw : `${raw}Z`;
      return dayjs(utcStr).format(isMobile ? "DD/MM HH:mm" : "HH:mm DD/MM/YYYY");
    } catch {
      return dt;
    }
  };

  const formatDateOnly = (dt?: string | null) => {
    if (!dt) return "Đang xếp lịch";
    try {
      return dayjs(dt).format("DD/MM/YYYY");
    } catch {
      return dt;
    }
  };

  const formatMoney = (val?: number) => {
    if (!val && val !== 0) return "0 ₫";
    return `${val.toLocaleString("vi-VN")} ₫`;
  };

  // State phân trang trên mobile
  const [mobilePage, setMobilePage] = useState<number>(1);
  const mobilePageSize = 10;

  useEffect(() => {
    setMobilePage(1);
  }, [searchKeyword, statusFilter]);

  // Tag trạng thái cho dạng thẻ Mobile (gọn gàng, rõ ràng)
  const renderCardStatusTag = (status: string) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "DRAFT":
        return <Tag color="default" style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>Đơn nháp</Tag>;
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Tag color="gold" icon={<ClockCircleOutlined />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Chờ duyệt
          </Tag>
        );
      case "APPROVED":
        return (
          <Tag color="cyan" icon={<CheckCircleOutlined />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Đã duyệt
          </Tag>
        );
      case "PROCESSING":
        return (
          <Tag color="blue" icon={<SyncOutlined spin />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Đang xử lý
          </Tag>
        );
      case "SHIPPING":
      case "IN_TRANSIT":
        return (
          <Tag color="processing" icon={<CarOutlined />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Đang giao
          </Tag>
        );
      case "COMPLETED":
      case "DELIVERED":
        return (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Hoàn tất
          </Tag>
        );
      case "CANCELLED":
      case "REJECTED":
        return (
          <Tag color="default" icon={<CloseCircleOutlined />} style={{ margin: 0, borderRadius: 6, fontWeight: 500, fontSize: 12 }}>
            Đã hủy
          </Tag>
        );
      default:
        return <Tag color="default" style={{ margin: 0, borderRadius: 6, fontSize: 12 }}>{status}</Tag>;
    }
  };

  // Tag trạng thái trực quan: Trên mobile chỉ hiện ký hiệu icon kèm Tooltip; Trên desktop hiện đầy đủ icon + chữ
  const renderStatusTag = (status: string) => {
    const s = (status || "").toUpperCase();

    if (isMobile) {
      switch (s) {
        case "DRAFT":
          return (
            <Tooltip title="Đơn nháp" trigger={["click", "hover"]}>
              <Tag color="default" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <ClockCircleOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "PENDING":
        case "PENDING_APPROVAL":
          return (
            <Tooltip title="Chờ duyệt" trigger={["click", "hover"]}>
              <Tag color="gold" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <ClockCircleOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "APPROVED":
          return (
            <Tooltip title="Đã duyệt" trigger={["click", "hover"]}>
              <Tag color="cyan" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <CheckCircleOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "PROCESSING":
          return (
            <Tooltip title="Đang xử lý" trigger={["click", "hover"]}>
              <Tag color="blue" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <SyncOutlined spin style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "SHIPPING":
        case "IN_TRANSIT":
          return (
            <Tooltip title="Đang giao" trigger={["click", "hover"]}>
              <Tag color="processing" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <CarOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "COMPLETED":
        case "DELIVERED":
          return (
            <Tooltip title="Hoàn tất" trigger={["click", "hover"]}>
              <Tag color="success" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <CheckCircleOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        case "CANCELLED":
        case "REJECTED":
          return (
            <Tooltip title="Đã hủy" trigger={["click", "hover"]}>
              <Tag color="default" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                <CloseCircleOutlined style={{ fontSize: 13 }} />
              </Tag>
            </Tooltip>
          );
        default:
          return (
            <Tooltip title={status} trigger={["click", "hover"]}>
              <Tag color="default" style={{ margin: 0, padding: "2px 7px", borderRadius: 6, cursor: "pointer" }}>
                {status.slice(0, 2).toUpperCase()}
              </Tag>
            </Tooltip>
          );
      }
    }

    // Trên Desktop: hiển thị tag đầy đủ
    switch (s) {
      case "DRAFT":
        return <Tag color="default">Đơn nháp</Tag>;
      case "PENDING":
      case "PENDING_APPROVAL":
        return (
          <Tag color="gold" icon={<ClockCircleOutlined />} style={{ fontWeight: 500 }}>
            Chờ duyệt
          </Tag>
        );
      case "APPROVED":
        return (
          <Tag color="cyan" icon={<CheckCircleOutlined />} style={{ fontWeight: 500 }}>
            Đã duyệt
          </Tag>
        );
      case "PROCESSING":
        return (
          <Tag color="blue" icon={<SyncOutlined spin />} style={{ fontWeight: 500 }}>
            Đang xử lý
          </Tag>
        );
      case "SHIPPING":
      case "IN_TRANSIT":
        return (
          <Tag color="processing" icon={<CarOutlined />} style={{ fontWeight: 500 }}>
            Đang giao
          </Tag>
        );
      case "COMPLETED":
      case "DELIVERED":
        return (
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ fontWeight: 500 }}>
            Hoàn tất
          </Tag>
        );
      case "CANCELLED":
      case "REJECTED":
        return (
          <Tag color="default" icon={<CloseCircleOutlined />} style={{ fontWeight: 500 }}>
            Đã hủy
          </Tag>
        );
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  // Mở modal xem chi tiết đơn hàng
  const handleOpenDetail = async (order: OrderResponseItem) => {
    setSelectedOrder(order);
    setIsDetailModalOpen(true);
    setDetailLoading(true);
    try {
      const fullDetail = await fetchPortalOrderDetail(order.id);
      if (fullDetail) {
        setSelectedOrder(fullDetail);
      }
    } catch (err) {
      // Dùng dữ liệu hiện tại nếu API chi tiết có lỗi nhẹ
      console.warn("Dùng dữ liệu danh sách hiện có cho modal chi tiết:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Khởi chạy quy trình Đặt lại đơn hàng (Reorder)
  const handleStartReorder = async (orderId: number) => {
    setReorderLoadingId(orderId);
    try {
      const data = await fetchReorderItems(orderId);
      setReorderData(data);
      setReorderItems(data.items || []);
      // Mặc định chọn tất cả các mặt hàng còn kinh doanh
      setSelectedProductIds((data.items || []).map((it) => it.product_id));
      setReorderNote(`Đặt lại từ đơn hàng #${data.original_order_code}`);

      // Nếu có sản phẩm bị loại bỏ do ngừng kinh doanh, hiển thị cảnh báo bên dưới
      if (data.removed_items && data.removed_items.length > 0) {
        message.warning("Một số mặt hàng đã ngừng kinh doanh và được tự động bỏ qua.");
      }

      if (!data.items || data.items.length === 0) {
        return;
      }

      setReorderModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể lấy thông tin đặt lại đơn hàng.";
      message.error(msg);
    } finally {
      setReorderLoadingId(null);
    }
  };

  // Cập nhật số lượng của từng dòng hàng khi Reorder
  const handleQuantityChange = (productId: number, val: number | null) => {
    const qty = Math.max(1, Number(val) || 1);
    setReorderItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, quantity: qty, subtotal: qty * item.current_price }
          : item
      )
    );
  };

  // Gửi tạo đơn hàng mới từ các mặt hàng đã chọn
  const handleConfirmReorder = async () => {
    if (!reorderData) return;
    const selectedItems = reorderItems.filter((it) => selectedProductIds.includes(it.product_id));
    if (selectedItems.length === 0) {
      message.warning("Vui lòng chọn ít nhất 1 mặt hàng để đặt lại!");
      return;
    }

    setReorderSubmitting(true);
    try {
      const payload: CreateOrderPayload = {
        customer_id: reorderData.customer_id,
        warehouse_id: reorderData.warehouse_id || undefined,
        delivery_address_id: reorderData.default_delivery_point_id || undefined,
        items: selectedItems.map((it) => ({
          sku: it.sku,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.current_price,
        })),
        note: reorderNote,
        submit_for_approval: true,
      };

      await createOrder(payload);
      message.success("Đặt lại đơn hàng thành công! Đơn hàng mới đã được gửi duyệt.");
      setReorderModalOpen(false);
      setIsDetailModalOpen(false);
      await loadOrders();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể tạo đơn hàng đặt lại.";
      message.error(msg);
    } finally {
      setReorderSubmitting(false);
    }
  };

  // Lọc danh sách đơn hàng
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // 1. Tìm theo mã đơn hoặc địa chỉ
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const codeMatch = (ord.order_code || "").toLowerCase().includes(kw);
        const addrMatch = (typeof ord.delivery_address === "string" ? ord.delivery_address : "").toLowerCase().includes(kw);
        if (!codeMatch && !addrMatch) return false;
      }

      // 2. Lọc theo trạng thái
      if (statusFilter !== "ALL") {
        const st = (ord.status || "").toUpperCase();
        if (statusFilter === "PENDING") {
          if (!["PENDING", "PENDING_APPROVAL", "DRAFT"].includes(st)) return false;
        } else if (statusFilter === "PROCESSING") {
          if (!["APPROVED", "PROCESSING"].includes(st)) return false;
        } else if (statusFilter === "SHIPPING") {
          if (!["SHIPPING", "IN_TRANSIT"].includes(st)) return false;
        } else if (statusFilter === "COMPLETED") {
          if (!["COMPLETED", "DELIVERED"].includes(st)) return false;
        } else if (statusFilter === "CANCELLED") {
          if (!["CANCELLED", "REJECTED"].includes(st)) return false;
        }
      }

      return true;
    });
  }, [orders, searchKeyword, statusFilter]);

  // Dữ liệu phân trang cho danh sách thẻ Mobile
  const paginatedOrders = useMemo(() => {
    const start = (mobilePage - 1) * mobilePageSize;
    return filteredOrders.slice(start, start + mobilePageSize);
  }, [filteredOrders, mobilePage, mobilePageSize]);

  // Cột bảng danh sách đơn hàng (Tự động thu gọn chỉ hiện ký hiệu trên Mobile)
  const columns: ColumnsType<OrderResponseItem> = useMemo(
    () => [
      {
        title: "MÃ ĐƠN",
        dataIndex: "order_code",
        key: "order_code",
        width: isMobile ? 125 : 170,
        render: (code: string, record) => (
          <Space orientation="vertical" size={2}>
            <Text
              strong
              style={{ color: "#2563eb", fontSize: isMobile ? 13 : 14, cursor: "pointer" }}
              onClick={() => handleOpenDetail(record)}
            >
              {code}
            </Text>
            {record.is_partially_delivered && (
              <Tag
                color="orange"
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "0 4px",
                  lineHeight: "16px",
                  margin: 0,
                }}
              >
                Thiếu SP
              </Tag>
            )}
          </Space>
        ),
      },
      {
        title: "NGÀY ĐẶT",
        dataIndex: "created_at",
        key: "created_at",
        width: isMobile ? 110 : 160,
        render: (dt: string) => (
          <span style={{ color: "#475569", fontSize: isMobile ? 12 : 13 }}>
            {formatDateTime(dt)}
          </span>
        ),
      },
      {
        title: "NGÀY GIAO DỰ KIẾN",
        dataIndex: "expected_delivery_date",
        key: "expected_delivery_date",
        width: isMobile ? 120 : 170,
        render: (dateStr: string) => (
          <Space size={4} style={{ color: "#334155", fontSize: isMobile ? 12 : 13 }}>
            <CalendarOutlined style={{ color: "#64748b" }} />
            <span>{formatDateOnly(dateStr)}</span>
          </Space>
        ),
      },
      {
        title: "TỔNG TIỀN",
        dataIndex: "total_amount",
        key: "total_amount",
        width: isMobile ? 115 : 170,
        align: "right",
        render: (amount: number) => (
          <Text strong style={{ color: "#0f172a", fontSize: isMobile ? 13 : 15 }}>
            {formatMoney(amount)}
          </Text>
        ),
      },
      {
        title: isMobile ? "T.THÁI" : "TRẠNG THÁI",
        dataIndex: "status",
        key: "status",
        width: isMobile ? 65 : 150,
        align: "center",
        render: (status: string) => renderStatusTag(status),
      },
      {
        title: isMobile ? "T.TÁC" : "THAO TÁC",
        key: "action",
        width: isMobile ? 85 : 220,
        align: "center",
        render: (_, record) => {
          if (isMobile) {
            return (
              <Space size={6} style={{ justifyContent: "center" }}>
                <Tooltip title="Xem chi tiết đơn" trigger={["click", "hover"]}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined style={{ fontSize: 15, color: "#2563eb" }} />}
                    style={{
                      width: 32,
                      height: 32,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#eff6ff",
                      borderRadius: 6,
                      border: "1px solid #bfdbfe",
                    }}
                    onClick={() => handleOpenDetail(record)}
                  />
                </Tooltip>
                <Tooltip title="Đặt lại đơn này" trigger={["click", "hover"]}>
                  <Button
                    type="text"
                    size="small"
                    icon={<RedoOutlined style={{ fontSize: 14, color: "#059669" }} />}
                    style={{
                      width: 32,
                      height: 32,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#f0fdf4",
                      borderRadius: 6,
                      border: "1px solid #bbf7d0",
                    }}
                    loading={reorderLoadingId === record.id}
                    onClick={() => handleStartReorder(record.id)}
                  />
                </Tooltip>
              </Space>
            );
          }

          return (
            <Space size={4}>
              <Button
                type="link"
                icon={<EyeOutlined />}
                style={{ fontWeight: 500, color: "#2563eb", padding: "4px 8px" }}
                onClick={() => handleOpenDetail(record)}
              >
                Xem chi tiết
              </Button>
              <Button
                type="link"
                icon={<RedoOutlined />}
                style={{ fontWeight: 500, color: "#059669", padding: "4px 8px" }}
                loading={reorderLoadingId === record.id}
                onClick={() => handleStartReorder(record.id)}
              >
                Đặt lại đơn
              </Button>
            </Space>
          );
        },
      },
    ],
    [isMobile, reorderLoadingId]
  );

  // Cột bảng sản phẩm chi tiết trong Modal
  const modalItemColumns: ColumnsType<OrderItemView> = [
    {
      title: "#",
      key: "index",
      width: 45,
      align: "center",
      render: (_, __, idx) => idx + 1,
    },
    {
      title: "SKU",
      dataIndex: "sku",
      key: "sku",
      width: 110,
      render: (sku: string) => <Tag color="blue">{sku || "-"}</Tag>,
    },
    {
      title: "TÊN SẢN PHẨM",
      dataIndex: "product_name",
      key: "product_name",
      render: (name: string) => <Text strong style={{ color: "#1e293b" }}>{name}</Text>,
    },
    {
      title: "ĐVT",
      key: "unit",
      width: 80,
      align: "center",
      render: (_, r) => (
        <span style={{ color: "#64748b", fontSize: 13 }}>
          {r.unit || r.unit_name || "Cái"}
        </span>
      ),
    },
    {
      title: "SL ĐẶT",
      key: "ordered_quantity",
      width: 90,
      align: "center",
      render: (_, r) => {
        const qty = r.ordered_quantity !== undefined ? r.ordered_quantity : r.quantity;
        return (
          <span style={{ fontWeight: 600, color: "#334155" }}>
            {qty.toLocaleString("vi-VN")}
          </span>
        );
      },
    },
    {
      title: "SL THỰC GIAO",
      key: "delivered_quantity",
      width: 150,
      align: "center",
      render: (_, r) => {
        const orderStatus = (selectedOrder?.status || "").toUpperCase();
        // Kiểm tra xem đơn hàng đã đến giai đoạn xuất kho / vận chuyển / giao nhận hay chưa
        const isDeliveredOrDelivering = [
          "SHIPPING",
          "IN_TRANSIT",
          "DELIVERED",
          "COMPLETED",
          "PROCESSING",
        ].includes(orderStatus);

        if (!isDeliveredOrDelivering) {
          return (
            <Tag color="default" style={{ color: "#64748b", borderRadius: 4, fontWeight: 500, margin: 0 }}>
              Chờ xuất kho
            </Tag>
          );
        }

        const ordered = r.ordered_quantity !== undefined ? r.ordered_quantity : r.quantity;
        const delivered =
          r.delivered_quantity !== undefined && r.delivered_quantity !== null
            ? r.delivered_quantity
            : r.actual_quantity !== undefined && r.actual_quantity !== null
            ? r.actual_quantity
            : ordered;

        const isShort = r.is_partially_delivered || delivered < ordered;

        if (isShort) {
          const missing = ordered - delivered;
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <span style={{ color: "#ea580c", fontWeight: 700, fontSize: 14 }}>
                {delivered.toLocaleString("vi-VN")}
              </span>
              <Tag
                color="error"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  margin: 0,
                  padding: "0 6px",
                  lineHeight: "18px",
                  borderRadius: 4,
                }}
              >
                Giao thiếu {missing} {r.unit || "SP"}
              </Tag>
            </div>
          );
        }

        return (
          <span style={{ color: "#16a34a", fontWeight: 600 }}>
            {delivered.toLocaleString("vi-VN")}
          </span>
        );
      },
    },
    {
      title: "ĐƠN GIÁ",
      dataIndex: "unit_price",
      key: "unit_price",
      width: 120,
      align: "right",
      render: (p: number) => formatMoney(p),
    },
    {
      title: "THÀNH TIỀN",
      key: "total_price",
      width: 130,
      align: "right",
      render: (_, r) => {
        const total = r.total_price !== undefined ? r.total_price : (r.subtotal !== undefined ? r.subtotal : r.quantity * r.unit_price);
        return (
          <Text strong style={{ color: "#2563eb" }}>
            {formatMoney(total)}
          </Text>
        );
      },
    },
  ];

  // Tính trạng thái Stepper cho Modal Chi Tiết
  const getStepperStatus = (status?: string) => {
    const s = (status || "").toUpperCase();
    if (s === "CANCELLED" || s === "REJECTED") {
      return { current: 0, status: "error" as const, text: "Đơn hàng đã hủy" };
    }
    if (s === "DRAFT" || s === "PENDING" || s === "PENDING_APPROVAL") {
      return { current: 0, status: "process" as const, text: "Chờ duyệt đơn" };
    }
    if (s === "APPROVED") {
      return { current: 1, status: "finish" as const, text: "Đã duyệt đơn" };
    }
    if (s === "PROCESSING") {
      return { current: 2, status: "process" as const, text: "Đang xuất kho" };
    }
    if (s === "SHIPPING" || s === "IN_TRANSIT") {
      return { current: 3, status: "process" as const, text: "Đang giao hàng" };
    }
    if (s === "COMPLETED" || s === "DELIVERED") {
      return { current: 4, status: "finish" as const, text: "Hoàn tất" };
    }
    return { current: 0, status: "wait" as const, text: status || "" };
  };

  const stepperInfo = selectedOrder ? getStepperStatus(selectedOrder.status) : { current: 0, status: "wait" as const, text: "" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* 1. Header Khối "Đơn hàng của tôi" */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: 14,
          padding: "20px 24px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
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
              borderRadius: 12,
              background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              border: "1px solid #bfdbfe",
            }}
          >
            <ShoppingOutlined />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 19 }}>
              Đơn hàng của tôi
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Theo dõi trạng thái xử lý và tiến độ giao hàng của từng đơn
            </Text>
          </div>
        </div>

        <Space size={10} wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadOrders()}
            loading={loading}
            style={{ height: 38, borderRadius: 8, fontWeight: 500 }}
          >
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<ShoppingOutlined />}
            style={{
              backgroundColor: "#2563eb",
              height: 38,
              borderRadius: 8,
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(37, 99, 235, 0.25)",
            }}
            onClick={handleGoToProducts}
          >
            Tới trang Đặt hàng
          </Button>
        </Space>
      </div>

      {/* 2. Thanh lọc / Tìm kiếm đơn hàng */}
      <Card
        style={{
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          backgroundColor: "#ffffff",
        }}
        styles={{ body: { padding: "16px 20px" } }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
          }}
        >
          {/* Tìm kiếm theo mã đơn */}
          <div style={{ flex: "1 1 280px", maxWidth: 400 }}>
            <Input
              prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
              placeholder="Tìm theo mã đơn (VD: ORD-001)..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ borderRadius: 8, height: 38 }}
            />
          </div>

          {/* Lọc theo trạng thái */}
          <Radio.Group
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            buttonStyle="solid"
            style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
          >
            <Radio.Button value="ALL" style={{ borderRadius: 6, fontWeight: 500 }}>
              Tất cả ({orders.length})
            </Radio.Button>
            <Radio.Button value="PENDING" style={{ borderRadius: 6, fontWeight: 500 }}>
              Chờ duyệt
            </Radio.Button>
            <Radio.Button value="PROCESSING" style={{ borderRadius: 6, fontWeight: 500 }}>
              Đang xử lý
            </Radio.Button>
            <Radio.Button value="SHIPPING" style={{ borderRadius: 6, fontWeight: 500 }}>
              Đang giao
            </Radio.Button>
            <Radio.Button value="COMPLETED" style={{ borderRadius: 6, fontWeight: 500 }}>
              Hoàn tất
            </Radio.Button>
            <Radio.Button value="CANCELLED" style={{ borderRadius: 6, fontWeight: 500 }}>
              Đã hủy
            </Radio.Button>
          </Radio.Group>
        </div>
      </Card>

      {/* 3. Nội dung bảng hoặc Empty state (Dạng Thẻ trên Mobile, Dạng Bảng trên Desktop) */}
      <Card
        style={{
          borderRadius: 14,
          border: isMobile ? "none" : "1px solid #e2e8f0",
          boxShadow: isMobile ? "none" : "0 2px 8px rgba(0, 0, 0, 0.04)",
          backgroundColor: isMobile ? "transparent" : "#ffffff",
          overflow: "hidden",
        }}
        styles={{ body: { padding: isMobile ? 0 : (orders.length === 0 && !loading ? 40 : 0) } }}
      >
        {loading ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <Spin size="large" tip="Đang tải danh sách đơn hàng..." />
          </div>
        ) : orders.length === 0 ? (
          /* Empty State khi đại lý chưa có đơn hàng nào */
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#334155" }}>
                  Bạn chưa có đơn hàng nào
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Hãy chọn sản phẩm để tạo đơn hàng đầu tiên của đại lý
                </div>
              </div>
            }
          >
            <Button
              type="primary"
              icon={<ShoppingOutlined />}
              style={{
                backgroundColor: "#2563eb",
                height: 40,
                borderRadius: 8,
                fontWeight: 600,
                padding: "0 24px",
                marginTop: 12,
              }}
              onClick={handleGoToProducts}
            >
              Tới trang Đặt hàng
            </Button>
          </Empty>
        ) : filteredOrders.length === 0 ? (
          /* Empty State khi bộ lọc không có kết quả */
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>
                    Không tìm thấy đơn hàng nào phù hợp
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                    Vui lòng thử tìm với từ khóa hoặc trạng thái khác
                  </div>
                </div>
              }
            >
              <Button
                onClick={() => {
                  setSearchKeyword("");
                  setStatusFilter("ALL");
                }}
                style={{ borderRadius: 6, marginTop: 8 }}
              >
                Xóa bộ lọc
              </Button>
            </Empty>
          </div>
        ) : isMobile ? (
          /* Giao diện Dạng Thẻ tối ưu cho điện thoại: Bấm vào thẻ để xem chi tiết (không cần nút thao tác) */
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {paginatedOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => handleOpenDetail(ord)}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  padding: "12px 14px",
                  boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {/* Dòng 1: Mã đơn & Trạng thái */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: "#2563eb" }}>
                      {ord.order_code}
                    </span>
                    {ord.is_partially_delivered && (
                      <Tag
                        color="orange"
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "0 4px",
                          margin: 0,
                          lineHeight: "16px",
                        }}
                      >
                        Thiếu SP
                      </Tag>
                    )}
                  </div>
                  {renderCardStatusTag(ord.status)}
                </div>

                {/* Dòng 2: Ngày đặt & Ngày giao */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    color: "#64748b",
                    marginBottom: 6,
                  }}
                >
                  <span>
                    <ClockCircleOutlined style={{ marginRight: 4, color: "#94a3b8" }} />
                    {formatDateTime(ord.created_at)}
                  </span>
                  {ord.expected_delivery_date ? (
                    <span>
                      <CalendarOutlined style={{ marginRight: 4, color: "#94a3b8" }} />
                      Giao: {formatDateOnly(ord.expected_delivery_date)}
                    </span>
                  ) : null}
                </div>

                <Divider style={{ margin: "6px 0 8px 0" }} />

                {/* Dòng 3: Tổng tiền & Mũi tên xem chi tiết (Không cần nút thao tác) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 11, color: "#94a3b8", display: "block" }}>
                      Tổng thanh toán
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                      {formatMoney(ord.total_amount)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: "#2563eb",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <span>Chi tiết</span>
                    <RightOutlined style={{ fontSize: 11 }} />
                  </div>
                </div>
              </div>
            ))}

            {/* Phân trang trên mobile */}
            {filteredOrders.length > mobilePageSize && (
              <div style={{ display: "flex", justifyContent: "center", padding: "10px 0" }}>
                <Pagination
                  size="small"
                  current={mobilePage}
                  pageSize={mobilePageSize}
                  total={filteredOrders.length}
                  onChange={(p) => setMobilePage(p)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </div>
        ) : (
          <Table<OrderResponseItem>
            columns={columns}
            dataSource={filteredOrders}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
            }}
            scroll={{ x: 900 }}
          />
        )}
      </Card>

      {/* 4. Modal Xem Chi Tiết Đơn Hàng & Thông Tin Giao Nhận */}
      <Modal
        open={isDetailModalOpen}
        onCancel={() => {
          setIsDetailModalOpen(false);
          setSelectedOrder(null);
        }}
        centered
        width={920}
        styles={{
          body: {
            maxHeight: isMobile ? "calc(88vh - 90px)" : 680,
            minHeight: isMobile ? 320 : 460,
            overflowY: "auto",
            padding: isMobile ? "12px 14px 16px" : "16px 20px 10px",
          },
        }}
        footer={[
          <Button
            key="reorder"
            type="primary"
            icon={<RedoOutlined />}
            style={{
              backgroundColor: "#059669",
              borderColor: "#059669",
              fontWeight: 600,
              height: 40,
              borderRadius: 8,
              width: "100%",
            }}
            loading={reorderLoadingId === selectedOrder?.id}
            onClick={() => {
              if (selectedOrder) {
                handleStartReorder(selectedOrder.id);
              }
            }}
          >
            Đặt lại đơn này
          </Button>,
        ]}
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShoppingOutlined style={{ color: "#2563eb", fontSize: 20 }} />
            <div>
              <span style={{ fontWeight: 700, fontSize: isMobile ? 15 : 17, color: "#1e293b" }}>
                Chi tiết đơn hàng #{selectedOrder?.order_code}
              </span>
            </div>
          </div>
        }
      >
        {detailLoading ? (
          <div style={{ padding: "40px 0", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spin tip="Đang tải dữ liệu chi tiết đơn hàng..." />
          </div>
        ) : selectedOrder && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Timeline / Stepper trạng thái đơn (Nằm ngang chuẩn Mobile, từ đơn siêu gọn không bao giờ đè chữ) */}
            <div
              style={{
                background: "#f8fafc",
                borderRadius: 10,
                padding: "10px 10px 12px",
                border: "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>TIẾN ĐỘ XỬ LÝ:</span>
                <span style={{ fontWeight: 700, color: stepperInfo.status === "error" ? "#ef4444" : "#2563eb" }}>
                  {stepperInfo.text}
                </span>
              </div>

              {/* Thanh Stepper nằm ngang tùy biến chuẩn mobile, từ đơn cách nhau rộng rãi */}
              <div style={{ position: "relative", padding: "0 4px" }}>
                {/* Đường nối ngang */}
                <div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "10%",
                    right: "10%",
                    height: 2,
                    backgroundColor: "#e2e8f0",
                    zIndex: 0,
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      backgroundColor: stepperInfo.status === "error" ? "#ef4444" : "#2563eb",
                      width: `${Math.min(100, (stepperInfo.current / 4) * 100)}%`,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {/* 5 Bước nằm ngang đều đặn với nhãn từ đơn cực ngắn */}
                <div style={{ display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
                  {[
                    { title: "Tạo", index: 0 },
                    { title: "Duyệt", index: 1 },
                    { title: "Kho", index: 2 },
                    { title: "Giao", index: 3 },
                    { title: "Xong", index: 4 },
                  ].map((step) => {
                    const isPassed = stepperInfo.current > step.index;
                    const isCurrent = stepperInfo.current === step.index;
                    const isError = isCurrent && stepperInfo.status === "error";

                    return (
                      <div
                        key={step.index}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: `${100 / 5}%`,
                        }}
                      >
                        {/* Vòng tròn số / dấu check */}
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            backgroundColor: isError
                              ? "#ef4444"
                              : isCurrent
                              ? "#2563eb"
                              : isPassed
                              ? "#10b981"
                              : "#e2e8f0",
                            color: isCurrent || isPassed || isError ? "#ffffff" : "#64748b",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            marginBottom: 4,
                            boxShadow: isCurrent ? "0 0 0 3px rgba(37, 99, 235, 0.2)" : undefined,
                          }}
                        >
                          {isPassed ? (
                            <CheckOutlined style={{ fontSize: 9 }} />
                          ) : isError ? (
                            <CloseCircleOutlined style={{ fontSize: 9 }} />
                          ) : (
                            step.index + 1
                          )}
                        </div>

                        {/* Tên bước từ đơn siêu ngắn, đảm bảo khoảng cách giữa các chữ rộng rãi */}
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: isCurrent ? 700 : 500,
                            color: isError
                              ? "#ef4444"
                              : isCurrent
                              ? "#1d4ed8"
                              : isPassed
                              ? "#0f172a"
                              : "#94a3b8",
                            whiteSpace: "nowrap",
                            textAlign: "center",
                          }}
                        >
                          {step.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cảnh báo Giao thiếu sản phẩm nếu có */}
            {selectedOrder.is_partially_delivered && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined style={{ color: "#d97706" }} />}
                message={
                  <span style={{ fontWeight: 600, color: "#92400e", fontSize: isMobile ? 12 : 13 }}>
                    Thông báo: Đơn hàng được giao một phần
                  </span>
                }
                description={
                  <span style={{ fontSize: isMobile ? 11 : 12, color: "#78350f" }}>
                    Một số mặt hàng thực tế được giao ít hơn số lượng đặt do điều kiện kho bãi. Quý đại lý vui lòng đối chiếu số lượng thực giao chi tiết bên dưới.
                  </span>
                }
                style={{ borderRadius: 6, border: "1px solid #fde68a", backgroundColor: "#fffbeb", padding: "6px 10px" }}
              />
            )}

            {/* Thông tin đơn hàng & giao nhận (Tối ưu riêng cho Mobile hiển thị trọn vẹn 100%, không bị khuất) */}
            {isMobile ? (
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Mã đơn hàng:</span>
                  <Text strong style={{ color: "#2563eb", fontSize: 13 }}>{selectedOrder.order_code}</Text>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Trạng thái:</span>
                  {renderCardStatusTag(selectedOrder.status)}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Ngày đặt hàng:</span>
                  <span style={{ fontSize: 12, color: "#334155" }}>{formatDateTime(selectedOrder.created_at)}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Ngày giao dự kiến:</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>
                    <CalendarOutlined style={{ marginRight: 4 }} />
                    {formatDateOnly(selectedOrder.expected_delivery_date)}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Điểm nhận hàng:</span>
                  <span style={{ fontSize: 12, fontWeight: 500, textAlign: "right", color: "#1e293b" }}>
                    {selectedOrder.delivery_point_name || "Địa chỉ mặc định"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Địa chỉ giao:</span>
                  <span style={{ fontSize: 12, color: "#475569", textAlign: "right", wordBreak: "break-word" }}>
                    <EnvironmentOutlined style={{ color: "#ef4444", marginRight: 4 }} />
                    {typeof selectedOrder.delivery_address === "string"
                      ? selectedOrder.delivery_address
                      : selectedOrder.delivery_address?.address || "Chưa có địa chỉ"}
                  </span>
                </div>

                {selectedOrder.note && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#64748b", flexShrink: 0 }}>Ghi chú:</span>
                    <span style={{ fontSize: 12, color: "#475569", textAlign: "right" }}>{selectedOrder.note}</span>
                  </div>
                )}

                <Divider style={{ margin: "4px 0" }} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>Tổng thanh toán:</span>
                  <Text strong style={{ color: "#059669", fontSize: 16 }}>{formatMoney(selectedOrder.total_amount)}</Text>
                </div>
              </div>
            ) : (
              <Descriptions
                bordered
                size="small"
                column={{ xs: 1, sm: 3 }}
                style={{ flexShrink: 0 }}
              >
                <Descriptions.Item label="Mã đơn hàng">
                  <Text strong style={{ color: "#2563eb", fontSize: 13 }}>
                    {selectedOrder.order_code}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Trạng thái">
                  {renderCardStatusTag(selectedOrder.status)}
                </Descriptions.Item>
                <Descriptions.Item label="Ngày đặt hàng">
                  {formatDateTime(selectedOrder.created_at)}
                </Descriptions.Item>
                <Descriptions.Item label="Ngày giao dự kiến">
                  <Space size={4}>
                    <CalendarOutlined style={{ color: "#2563eb" }} />
                    <Text strong>{formatDateOnly(selectedOrder.expected_delivery_date)}</Text>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="Điểm giao hàng">
                  <Text strong>{selectedOrder.delivery_point_name || "Địa chỉ mặc định"}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="Tổng thanh toán">
                  <Text strong style={{ color: "#059669", fontSize: 15 }}>
                    {formatMoney(selectedOrder.total_amount)}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="Địa chỉ nhận" span={selectedOrder.note ? 2 : 3}>
                  <Space align="start" size={6}>
                    <EnvironmentOutlined style={{ color: "#ef4444", marginTop: 3 }} />
                    <span style={{ fontSize: 12 }}>
                      {typeof selectedOrder.delivery_address === "string"
                        ? selectedOrder.delivery_address
                        : selectedOrder.delivery_address?.address || "Chưa có địa chỉ"}
                    </span>
                  </Space>
                </Descriptions.Item>
                {selectedOrder.note && (
                  <Descriptions.Item label="Ghi chú" span={1}>
                    <span style={{ fontSize: 12 }}>{selectedOrder.note}</span>
                  </Descriptions.Item>
                )}
              </Descriptions>
            )}

            {/* Danh sách sản phẩm chi tiết - Dạng thẻ trên Mobile, Bảng trên Desktop */}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }}>
                  Danh sách sản phẩm trong đơn ({selectedOrder.items?.length || 0})
                </div>
                {selectedOrder.is_partially_delivered && (
                  <Tag color="error" style={{ fontWeight: 600, fontSize: 10, margin: 0 }}>
                    Có mặt hàng giao thiếu
                  </Tag>
                )}
              </div>

              <div>
                {isMobile ? (
                  /* Danh sách sản phẩm dạng THẺ trên điện thoại di động */
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(!selectedOrder.items || selectedOrder.items.length === 0) ? (
                      <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: 13 }}>
                        Không có thông tin chi tiết sản phẩm
                      </div>
                    ) : (
                      selectedOrder.items.map((r, idx) => {
                        const ordered = r.ordered_quantity !== undefined ? r.ordered_quantity : r.quantity;
                        const delivered =
                          r.delivered_quantity !== undefined && r.delivered_quantity !== null
                            ? r.delivered_quantity
                            : r.actual_quantity !== undefined && r.actual_quantity !== null
                            ? r.actual_quantity
                            : ordered;
                        const isShort = r.is_partially_delivered || delivered < ordered;
                        const missing = ordered - delivered;
                        const total = r.total_price !== undefined ? r.total_price : (r.subtotal !== undefined ? r.subtotal : r.quantity * r.unit_price);

                        const orderStatus = (selectedOrder?.status || "").toUpperCase();
                        const isDeliveredOrDelivering = [
                          "SHIPPING",
                          "IN_TRANSIT",
                          "DELIVERED",
                          "COMPLETED",
                          "PROCESSING",
                        ].includes(orderStatus);

                        return (
                          <div
                            key={r.id || idx}
                            style={{
                              backgroundColor: "#ffffff",
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                              padding: "10px 12px",
                              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
                            }}
                          >
                            {/* Dòng 1: Tên sản phẩm & Thành tiền */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", lineHeight: 1.3 }}>
                                  {r.product_name}
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                                  <Tag color="blue" style={{ fontSize: 10, padding: "0 4px", lineHeight: "16px", margin: 0 }}>
                                    {r.sku || "-"}
                                  </Tag>
                                  <span style={{ marginLeft: 6 }}>
                                    {formatMoney(r.unit_price)} / {r.unit || r.unit_name || "Cái"}
                                  </span>
                                </div>
                              </div>
                              <Text strong style={{ color: "#2563eb", fontSize: 14, whiteSpace: "nowrap" }}>
                                {formatMoney(total)}
                              </Text>
                            </div>

                            {/* Dòng 2: Số lượng đặt và Số lượng thực giao */}
                            <div
                              style={{
                                marginTop: 8,
                                paddingTop: 6,
                                borderTop: "1px dashed #f1f5f9",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: 12,
                              }}
                            >
                              <span style={{ color: "#475569" }}>
                                SL đặt: <strong style={{ color: "#1e293b" }}>{ordered.toLocaleString("vi-VN")}</strong>
                              </span>

                              <div>
                                {!isDeliveredOrDelivering ? (
                                  <Tag color="default" style={{ margin: 0, fontSize: 10, borderRadius: 4 }}>
                                    Chờ xuất kho
                                  </Tag>
                                ) : isShort ? (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ color: "#ea580c", fontWeight: 700 }}>
                                      Giao: {delivered.toLocaleString("vi-VN")}
                                    </span>
                                    <Tag color="error" style={{ margin: 0, fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>
                                      Thiếu {missing}
                                    </Tag>
                                  </div>
                                ) : (
                                  <span style={{ color: "#16a34a", fontWeight: 600 }}>
                                    Thực giao: {delivered.toLocaleString("vi-VN")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      overflowY: "auto",
                      maxHeight: 280,
                    }}
                  >
                    <Table<OrderItemView>
                      columns={modalItemColumns}
                      dataSource={selectedOrder.items || []}
                      rowKey={(r, idx) => r.id || idx || 0}
                      pagination={false}
                      size="small"
                      sticky
                      locale={{ emptyText: "Không có thông tin chi tiết sản phẩm" }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 5. Modal Đặt Lại Đơn Hàng (Reorder) */}
      <Modal
        open={reorderModalOpen}
        onCancel={() => setReorderModalOpen(false)}
        width={920}
        destroyOnClose
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              <RedoOutlined />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: "#1e293b" }}>
                Đặt lại đơn hàng (Reorder)
              </div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                Tạo đơn hàng mới dựa trên đơn #{reorderData?.original_order_code} với bảng giá hiện hành
              </div>
            </div>
          </div>
        }
        footer={[
          <Button key="cancel" onClick={() => setReorderModalOpen(false)} disabled={reorderSubmitting}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<CheckOutlined />}
            loading={reorderSubmitting}
            disabled={selectedProductIds.length === 0}
            style={{
              backgroundColor: "#059669",
              borderColor: "#059669",
              fontWeight: 600,
              height: 38,
            }}
            onClick={handleConfirmReorder}
          >
            Xác nhận đặt lại ({selectedProductIds.length} món)
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
          {/* Cảnh báo các sản phẩm ngừng kinh doanh nếu có */}
          {reorderData?.removed_items && reorderData.removed_items.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={
                <span style={{ fontWeight: 600 }}>
                  Một số mặt hàng đã ngừng kinh doanh và được tự động bỏ qua:
                </span>
              }
              description={
                <div style={{ marginTop: 6 }}>
                  {reorderData.removed_items.map((it, idx) => (
                    <div key={idx} style={{ fontSize: 13, color: "#92400e", marginBottom: 2 }}>
                      • <strong>{it.product_name}</strong> (SKU: {it.sku}) - {it.reason}
                    </div>
                  ))}
                </div>
              }
            />
          )}

          {/* Bảng danh sách mặt hàng đặt lại */}
          <Table<ReorderItemDetail>
            rowKey="product_id"
            rowSelection={{
              selectedRowKeys: selectedProductIds,
              onChange: (keys) => setSelectedProductIds(keys),
            }}
            dataSource={reorderItems}
            pagination={false}
            size="middle"
            columns={[
              {
                title: "MÃ SKU",
                dataIndex: "sku",
                key: "sku",
                width: 120,
                render: (sku) => <Tag color="blue">{sku}</Tag>,
              },
              {
                title: "TÊN SẢN PHẨM",
                dataIndex: "product_name",
                key: "product_name",
                render: (name) => <Text strong>{name}</Text>,
              },
              {
                title: "ĐƠN GIÁ CŨ",
                dataIndex: "old_price",
                key: "old_price",
                width: 130,
                align: "right",
                render: (p) => (
                  <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>
                    {formatMoney(p)}
                  </span>
                ),
              },
              {
                title: "ĐƠN GIÁ HIỆN TẠI",
                dataIndex: "current_price",
                key: "current_price",
                width: 150,
                align: "right",
                render: (p, record) => (
                  <Space direction="vertical" size={0} align="end">
                    <Text strong style={{ color: record.price_changed ? "#ea580c" : "#0f172a" }}>
                      {formatMoney(p)}
                    </Text>
                    {record.price_changed && (
                      <Tag color="orange" style={{ fontSize: 10, margin: 0 }}>
                        {p > record.old_price ? "Tăng giá" : "Giảm giá"}
                      </Tag>
                    )}
                  </Space>
                ),
              },
              {
                title: "SỐ LƯỢNG",
                dataIndex: "quantity",
                key: "quantity",
                width: 130,
                align: "center",
                render: (qty, record) => (
                  <Input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => handleQuantityChange(record.product_id, Number(e.target.value))}
                    style={{ width: 80, textAlign: "center" }}
                  />
                ),
              },
              {
                title: "THÀNH TIỀN",
                dataIndex: "subtotal",
                key: "subtotal",
                width: 150,
                align: "right",
                render: (sub) => (
                  <Text strong style={{ color: "#059669" }}>
                    {formatMoney(sub)}
                  </Text>
                ),
              },
            ]}
          />

          {/* Ghi chú đơn hàng mới */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
              Ghi chú cho đơn hàng mới:
            </div>
            <Input.TextArea
              rows={2}
              value={reorderNote}
              onChange={(e) => setReorderNote(e.target.value)}
              placeholder="Nhập ghi chú cho đơn hàng đặt lại (nếu có)..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerOrders;
