/**
 * Mobile-First Warehouse Pick List & Batch Picking Management Component (EP-06 / SCRUM-36 / SCRUM-40).
 * Tailored for smartphone touch screens used by warehouse staff while walking the warehouse floor.
 */

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Spin,
  Alert,
  message,
  Input,
  Progress,
  Tag,
  Modal,
} from "antd";
import {
  EnvironmentOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  PlusOutlined,
  MinusOutlined,
  ArrowLeftOutlined,
  ReloadOutlined,
  CheckOutlined,
  InboxOutlined,
  FileTextOutlined,
  AppstoreAddOutlined,
  HistoryOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  getPendingApprovedOrders,
  createBatchPickList,
  getPickLists,
  getPickListById,
  executePickList,
  type PendingOrder,
  type PickList,
  type PickListDetail,
} from "../../services/pickListService";

const COMMON_SHORTAGE_REASONS = [
  "Hết hàng trên kệ",
  "Hàng móp méo / rách bao bì",
  "Không tìm thấy vị trí lưu trữ",
  "Sai lệch kiểm kê thực tế",
  "Hàng cận date không xuất được",
];

export const PickListManager: React.FC = () => {
  // Navigation tabs: 'execute' | 'create' | 'list'
  const [activeTab, setActiveTab] = useState<"execute" | "create" | "list">("list");

  // Loading states
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Data states
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [batchNote, setBatchNote] = useState("");

  const [pickLists, setPickLists] = useState<PickList[]>([]);
  const [activePickList, setActivePickList] = useState<PickList | null>(null);

  // Active execution state for items: map of detail_id -> { actual_qty, missing_reason, is_completed }
  const [executionState, setExecutionState] = useState<
    Record<number, { actual_qty: number; missing_reason: string; is_completed: boolean }>
  >({});

  const [searchFilter, setSearchFilter] = useState("");

  // 1. Fetch pending orders for batch picking
  const loadPendingOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingApprovedOrders();
      setPendingOrders(data);
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách đơn hàng đã duyệt.");
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch list of pick lists
  const loadPickLists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPickLists();
      setPickLists(data);
      // Auto open first pending or in-progress pick list if activeTab is execute and no activePickList
      if (!activePickList && data.length > 0) {
        const inProgress = data.find((p) => p.status !== "COMPLETED") || data[0];
        if (inProgress) {
          // Keep activePickList updated
        }
      }
    } catch (err: any) {
      message.error(err.message || "Không thể tải danh sách phiếu soạn.");
    } finally {
      setLoading(false);
    }
  }, [activePickList]);

  // Initial load
  useEffect(() => {
    loadPickLists();
    loadPendingOrders();
  }, [loadPickLists, loadPendingOrders]);

  // Load a specific pick list into Execution mode
  const openPickList = async (pickListId: number) => {
    setLoading(true);
    try {
      const detail = await getPickListById(pickListId);
      setActivePickList(detail);

      // Initialize execution form state
      const initialMap: Record<
        number,
        { actual_qty: number; missing_reason: string; is_completed: boolean }
      > = {};

      detail.details.forEach((d) => {
        initialMap[d.id] = {
          actual_qty: d.actual_qty > 0 ? d.actual_qty : d.required_qty,
          missing_reason: d.missing_reason || "",
          is_completed: d.is_completed || d.status === "COMPLETED",
        };
      });

      setExecutionState(initialMap);
      setActiveTab("execute");
    } catch (err: any) {
      message.error(err.message || "Không thể tải chi tiết phiếu soạn.");
    } finally {
      setLoading(false);
    }
  };

  // Toggle select an order for batch picking
  const toggleOrderSelection = (id: number) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllOrders = () => {
    if (selectedOrderIds.length === pendingOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pendingOrders.map((o) => o.id));
    }
  };

  // Handle create batch pick list
  const handleCreateBatch = async () => {
    if (selectedOrderIds.length === 0) {
      message.warning("Vui lòng chọn ít nhất 1 đơn hàng để tạo phiếu soạn!");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createBatchPickList(
        selectedOrderIds,
        undefined,
        batchNote || undefined
      );
      message.success(`Đã tạo phiếu soạn gộp ${created.code} thành công!`);
      setSelectedOrderIds([]);
      setBatchNote("");
      await loadPickLists();
      // Immediately open execution mode for this newly created pick list!
      openPickList(created.id);
    } catch (err: any) {
      message.error(err.message || "Tạo phiếu soạn gộp thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  // Update execution item state
  const handleQtyChange = (detailId: number, val: number, requiredQty: number) => {
    const nextVal = Math.max(0, val);
    setExecutionState((prev) => {
      const current = prev[detailId] || {
        actual_qty: requiredQty,
        missing_reason: "",
        is_completed: false,
      };
      return {
        ...prev,
        [detailId]: {
          ...current,
          actual_qty: nextVal,
          // Mark completed automatically if picked
          is_completed: nextVal > 0,
        },
      };
    });
  };

  const handleReasonChange = (detailId: number, reason: string) => {
    setExecutionState((prev) => {
      const current = prev[detailId];
      if (!current) return prev;
      return {
        ...prev,
        [detailId]: {
          ...current,
          missing_reason: reason,
        },
      };
    });
  };

  const handleToggleComplete = (detailId: number, requiredQty: number) => {
    setExecutionState((prev) => {
      const current = prev[detailId] || {
        actual_qty: requiredQty,
        missing_reason: "",
        is_completed: false,
      };
      const nextCompleted = !current.is_completed;
      return {
        ...prev,
        [detailId]: {
          ...current,
          is_completed: nextCompleted,
          actual_qty: nextCompleted && current.actual_qty === 0 ? requiredQty : current.actual_qty,
        },
      };
    });
  };

  const handlePickFull = (detailId: number, requiredQty: number) => {
    setExecutionState((prev) => ({
      ...prev,
      [detailId]: {
        actual_qty: requiredQty,
        missing_reason: "",
        is_completed: true,
      },
    }));
  };

  // Save & execute pick list
  const handleSubmitExecution = async () => {
    if (!activePickList) return;

    // Validate Acceptance Criteria 4 on client first to provide instant feedback
    for (const d of activePickList.details) {
      const state = executionState[d.id];
      if (!state) continue;

      if (state.actual_qty < d.required_qty) {
        if (!state.missing_reason || !state.missing_reason.trim()) {
          Modal.confirm({
            title: "Thiếu lý do soạn thiếu",
            icon: <ExclamationCircleOutlined style={{ color: "#ef4444" }} />,
            content: (
              <div>
                Sản phẩm <strong>{d.product_name || d.sku}</strong> soạn thiếu (
                {state.actual_qty} / {d.required_qty} {d.unit_name || "cái"}).
                <br />
                <span style={{ color: "#ef4444", fontWeight: 600 }}>
                  Bắt buộc phải nhập &quot;Lý do soạn thiếu&quot; theo quy định kho!
                </span>
              </div>
            ),
            okText: "Điền lý do ngay",
            cancelButtonProps: { style: { display: "none" } },
          });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const payloadItems = activePickList.details.map((d) => {
        const state = executionState[d.id] || {
          actual_qty: d.required_qty,
          missing_reason: "",
          is_completed: true,
        };
        return {
          detail_id: d.id,
          actual_qty: state.actual_qty,
          missing_reason:
            state.actual_qty < d.required_qty ? state.missing_reason.trim() : null,
          is_completed: state.is_completed,
        };
      });

      const updated = await executePickList(activePickList.id, {
        items: payloadItems,
        note: "Thủ kho xác nhận qua di động",
      });

      message.success("Đã lưu tiến độ soạn hàng thành công!");
      setActivePickList(updated);
      await loadPickLists();
    } catch (err: any) {
      message.error(err.message || "Cập nhật tiến độ soạn hàng thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered items in active pick list
  const filteredDetails = useMemo(() => {
    if (!activePickList?.details) return [];
    if (!searchFilter.trim()) return activePickList.details;
    const q = searchFilter.toLowerCase();
    return activePickList.details.filter(
      (d) =>
        (d.product_name && d.product_name.toLowerCase().includes(q)) ||
        (d.sku && d.sku.toLowerCase().includes(q)) ||
        (d.location_code && d.location_code.toLowerCase().includes(q))
    );
  }, [activePickList, searchFilter]);

  // Progress computation
  const progressStats = useMemo(() => {
    if (!activePickList?.details?.length) return { percent: 0, completedCount: 0, totalCount: 0 };
    const total = activePickList.details.length;
    let completed = 0;
    activePickList.details.forEach((d) => {
      const st = executionState[d.id];
      if (st?.is_completed) completed++;
    });
    return {
      percent: Math.round((completed / total) * 100),
      completedCount: completed,
      totalCount: total,
    };
  }, [activePickList, executionState]);

  return (
    <div className="picklist-mobile-container" style={{ minHeight: "100vh" }}>
      {/* 1. TOP MOBILE HEADER & TAB SWITCHER */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          color: "#ffffff",
          padding: "16px 20px",
          borderRadius: "0 0 20px 20px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Quản lý kho tác nghiệp
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>
              Phiếu Soạn Hàng (Pick List)
            </div>
          </div>
          <button
            onClick={() => {
              loadPickLists();
              loadPendingOrders();
            }}
            className="touch-btn"
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "#ffffff",
              border: "none",
              padding: "0 12px",
              height: 40,
            }}
            title="Tải lại dữ liệu"
          >
            <ReloadOutlined spin={loading} style={{ fontSize: 18 }} />
          </button>
        </div>

        {/* Tab selection buttons (Large touch targets for mobile) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={() => setActiveTab("list")}
            className="touch-btn"
            style={{
              background: activeTab === "list" ? "#4f46e5" : "rgba(255,255,255,0.08)",
              color: "#ffffff",
              border: activeTab === "list" ? "1px solid #818cf8" : "none",
              fontSize: 13,
              gap: 6,
              padding: "8px 4px",
            }}
          >
            <HistoryOutlined /> Danh sách ({pickLists.length})
          </button>

          <button
            onClick={() => setActiveTab("create")}
            className="touch-btn"
            style={{
              background: activeTab === "create" ? "#4f46e5" : "rgba(255,255,255,0.08)",
              color: "#ffffff",
              border: activeTab === "create" ? "1px solid #818cf8" : "none",
              fontSize: 13,
              gap: 6,
              padding: "8px 4px",
            }}
          >
            <AppstoreAddOutlined /> Tạo gộp ({pendingOrders.length})
          </button>

          <button
            onClick={() => {
              if (!activePickList && pickLists.length > 0) {
                openPickList(pickLists[0].id);
              } else {
                setActiveTab("execute");
              }
            }}
            className="touch-btn"
            style={{
              background: activeTab === "execute" ? "#4f46e5" : "rgba(255,255,255,0.08)",
              color: "#ffffff",
              border: activeTab === "execute" ? "1px solid #818cf8" : "none",
              fontSize: 13,
              gap: 6,
              padding: "8px 4px",
            }}
          >
            <CheckCircleOutlined /> Soạn hàng
          </button>
        </div>
      </div>

      {loading && !activePickList && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: "#64748b", fontWeight: 500 }}>
            Đang tải dữ liệu kho hàng...
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DANH SÁCH CÁC PHIẾU SOẠN HÀNG (LIST MODE)                          */}
      {/* ========================================================================= */}
      {activeTab === "list" && !loading && (
        <div style={{ padding: "0 12px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
              Lịch sử phiếu soạn hàng
            </div>
            <button
              onClick={() => setActiveTab("create")}
              className="touch-btn"
              style={{
                background: "#4f46e5",
                color: "#ffffff",
                border: "none",
                padding: "8px 16px",
                fontSize: 14,
                gap: 6,
              }}
            >
              <PlusOutlined /> Tạo phiếu mới
            </button>
          </div>

          {pickLists.length === 0 ? (
            <div
              className="picklist-card"
              style={{ padding: 32, textAlign: "center", color: "#64748b" }}
            >
              <InboxOutlined style={{ fontSize: 48, color: "#94a3b8", marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 600 }}>Chưa có phiếu soạn hàng nào</div>
              <p style={{ marginTop: 6, fontSize: 14 }}>
                Chọn các đơn hàng đã duyệt để gom thành đợt nhặt hàng (Batch Picking).
              </p>
              <button
                onClick={() => setActiveTab("create")}
                className="touch-btn"
                style={{
                  background: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 24px",
                  marginTop: 16,
                  fontSize: 14,
                }}
              >
                Gộp đơn soạn hàng ngay
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {pickLists.map((p) => {
                const isDone = p.status === "COMPLETED";
                return (
                  <div
                    key={p.id}
                    onClick={() => openPickList(p.id)}
                    className="picklist-card"
                    style={{
                      padding: 16,
                      cursor: "pointer",
                      borderLeft: isDone ? "6px solid #22c55e" : "6px solid #f59e0b",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                          {p.code}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {p.created_at ? new Date(p.created_at).toLocaleString("vi-VN") : "Hôm nay"}
                        </div>
                      </div>
                      <Tag color={isDone ? "success" : "warning"} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 6 }}>
                        {isDone ? "ĐÃ HOÀN TẤT" : "ĐANG SOẠN"}
                      </Tag>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 13, color: "#334155" }}>
                      <div>
                        Mặt hàng: <strong>{p.total_items} SKU</strong>
                      </div>
                      <div>
                        Tổng lượng: <strong>{p.total_required_qty}</strong>
                      </div>
                      {p.total_actual_qty > 0 && (
                        <div>
                          Đã nhặt: <strong>{p.total_actual_qty}</strong>
                        </div>
                      )}
                    </div>

                    {p.order_ids && p.order_ids.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                        Gộp từ {p.order_ids.length} đơn hàng: {p.order_ids.map((oid) => `#${oid}`).join(", ")}
                      </div>
                    )}

                    <div style={{ marginTop: 12, textAlign: "right" }}>
                      <span style={{ color: "#4f46e5", fontWeight: 700, fontSize: 14 }}>
                        {isDone ? "Xem chi tiết →" : "Vào soạn hàng ngay →"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TẠO PHIẾU SOẠN GỘP BATCH PICKING (CREATE MODE)                     */}
      {/* ========================================================================= */}
      {activeTab === "create" && (
        <div style={{ padding: "0 12px" }}>
          <div className="picklist-card" style={{ padding: 16, marginBottom: 16, background: "#f8fafc" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#1e293b" }}>
              Gộp đơn soạn hàng (Batch Picking)
            </div>
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 4, marginBottom: 12 }}>
              Hệ thống sẽ tự động gộp các mặt hàng giống nhau, cộng dồn số lượng và sắp xếp tối ưu theo vị trí kệ hàng (Aisle/Rack/Shelf).
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <button
                onClick={selectAllOrders}
                className="touch-btn"
                style={{
                  background: "#ffffff",
                  border: "1.5px solid #cbd5e1",
                  padding: "8px 14px",
                  fontSize: 13,
                  color: "#334155",
                }}
              >
                {selectedOrderIds.length === pendingOrders.length && pendingOrders.length > 0
                  ? "Bỏ chọn tất cả"
                  : `Chọn tất cả (${pendingOrders.length})`}
              </button>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4f46e5" }}>
                Đã chọn: {selectedOrderIds.length} đơn
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <Input
                placeholder="Ghi chú phiếu soạn (VD: Soạn đợt sáng giao Q. Cầu Giấy)"
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                style={{ height: 44, borderRadius: 10, fontSize: 14 }}
              />
            </div>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="picklist-card" style={{ padding: 32, textAlign: "center", color: "#64748b" }}>
              <CheckCircleOutlined style={{ fontSize: 44, color: "#22c55e", marginBottom: 12 }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>
                Không có đơn hàng nào chờ soạn
              </div>
              <p style={{ marginTop: 6, fontSize: 13 }}>
                Tất cả các đơn đã duyệt đều đã được gom phiếu soạn hoặc giao xong.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pendingOrders.map((order) => {
                const isSelected = selectedOrderIds.includes(order.id);
                return (
                  <div
                    key={order.id}
                    onClick={() => toggleOrderSelection(order.id)}
                    className="picklist-card"
                    style={{
                      padding: "14px 16px",
                      cursor: "pointer",
                      border: isSelected ? "2px solid #4f46e5" : "1.5px solid #e2e8f0",
                      background: isSelected ? "#f5f3ff" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {/* Checkbox circle indicator for mobile touch */}
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        border: isSelected ? "none" : "2px solid #94a3b8",
                        background: isSelected ? "#4f46e5" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        flexShrink: 0,
                        fontSize: 16,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {isSelected && <CheckOutlined />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                          {order.order_code}
                        </span>
                        <Tag color="blue" style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>
                          {order.total_items} sản phẩm
                        </Tag>
                      </div>

                      <div style={{ fontSize: 13, color: "#475569", marginTop: 4, fontWeight: 500 }}>
                        {order.customer_name || `Khách hàng #${order.customer_id}`}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        <span>
                          {order.created_at ? new Date(order.created_at).toLocaleDateString("vi-VN") : ""}
                        </span>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>
                          {order.total_amount.toLocaleString("vi-VN")} đ
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sticky Bottom Bar for Create Action */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#ffffff",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "center",
              zIndex: 100,
            }}
          >
            <div style={{ maxWidth: 680, width: "100%" }}>
              <button
                disabled={selectedOrderIds.length === 0 || submitting}
                onClick={handleCreateBatch}
                className="touch-btn"
                style={{
                  width: "100%",
                  height: 50,
                  background: selectedOrderIds.length > 0 ? "#4f46e5" : "#cbd5e1",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 16,
                  fontWeight: 700,
                  gap: 8,
                  cursor: selectedOrderIds.length > 0 ? "pointer" : "not-allowed",
                  boxShadow: selectedOrderIds.length > 0 ? "0 4px 14px rgba(79, 70, 229, 0.4)" : "none",
                }}
              >
                {submitting ? (
                  <Spin size="small" />
                ) : (
                  <>
                    <AppstoreAddOutlined style={{ fontSize: 20 }} />
                    Tạo phiếu soạn gộp ({selectedOrderIds.length} đơn)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THỰC THI SOẠN HÀNG TRÊN KỆ KHO (EXECUTE MODE)                      */}
      {/* ========================================================================= */}
      {activeTab === "execute" && activePickList && (
        <div style={{ padding: "0 12px" }}>
          {/* Pick List Execution Header */}
          <div
            className="picklist-card"
            style={{
              padding: 16,
              marginBottom: 14,
              background: "#ffffff",
              border: "1.5px solid #c7d2fe",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                onClick={() => setActiveTab("list")}
                className="touch-btn"
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  padding: "6px 12px",
                  fontSize: 13,
                  color: "#334155",
                  gap: 6,
                }}
              >
                <ArrowLeftOutlined /> Quay lại
              </button>

              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
                  {activePickList.code}
                </span>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Kho: Kho Tổng (ID {activePickList.warehouse_id || 1})
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "#475569" }}>Tiến độ nhặt hàng:</span>
                <span style={{ fontWeight: 700, color: "#4f46e5" }}>
                  {progressStats.completedCount}/{progressStats.totalCount} mặt hàng ({progressStats.percent}%)
                </span>
              </div>
              <Progress
                percent={progressStats.percent}
                status={progressStats.percent === 100 ? "success" : "active"}
                strokeColor="#4f46e5"
                showInfo={false}
              />
            </div>

            {/* Search Box on Warehouse Floor */}
            <div style={{ marginTop: 12 }}>
              <Input
                prefix={<SearchOutlined style={{ color: "#94a3b8" }} />}
                placeholder="Tìm nhanh theo vị trí (A-01), mã SKU hoặc tên SP..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                allowClear
                style={{ height: 44, borderRadius: 10, fontSize: 14 }}
              />
            </div>
          </div>

          {/* Route Optimization Notice */}
          <Alert
            message={
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                📍 Danh sách đã sắp xếp tối ưu theo đường đi (Lộ trình: Dãy A → B → C)
              </span>
            }
            type="info"
            showIcon
            style={{ marginBottom: 14, borderRadius: 12 }}
          />

          {/* List of Product Cards (Optimized Picking Order) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {filteredDetails.map((item, index) => {
              const state = executionState[item.id] || {
                actual_qty: item.required_qty,
                missing_reason: "",
                is_completed: false,
              };

              const isShortage = state.actual_qty < item.required_qty;
              const isReasonMissing = isShortage && (!state.missing_reason || !state.missing_reason.trim());

              return (
                <div
                  key={item.id}
                  className={`picklist-card ${state.is_completed ? "completed" : ""} ${isShortage ? "shortage" : ""}`}
                  style={{
                    padding: 16,
                    border: isReasonMissing
                      ? "2px solid #ef4444"
                      : state.is_completed
                      ? "2px solid #22c55e"
                      : "1.5px solid #e2e8f0",
                  }}
                >
                  {/* Top Line: Step number & Location/Bin */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          background: "#312e81",
                          color: "#ffffff",
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: 9999,
                        }}
                      >
                        #{item.pick_sequence || index + 1}
                      </span>

                      {/* Location Badge (AC 1) */}
                      <span className="location-badge">
                        <EnvironmentOutlined />
                        Vị trí: {item.location_code || "KHO-CHUNG"}
                      </span>
                    </div>

                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                      SKU: {item.sku || "N/A"}
                    </span>
                  </div>

                  {/* Product Name */}
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginTop: 8, lineHeight: 1.4 }}>
                    {item.product_name || item.sku}
                  </div>

                  {/* Required Qty & Contributing Orders */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 6,
                      padding: "8px 12px",
                      background: "#f8fafc",
                      borderRadius: 10,
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Số lượng yêu cầu:</span>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>
                        {item.required_qty} <span style={{ fontSize: 13, fontWeight: 500 }}>{item.unit_name || "cái"}</span>
                      </div>
                    </div>

                    {item.order_ids && item.order_ids.length > 0 && (
                      <div style={{ textAlign: "right", fontSize: 11, color: "#4f46e5", fontWeight: 600 }}>
                        <FileTextOutlined /> Gộp {item.order_ids.length} đơn ({item.order_ids.map((id) => `#${id}`).join(", ")})
                      </div>
                    )}
                  </div>

                  {/* Touch Picking Counter & Controls */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                      Số lượng thực soạn:
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {/* Decrement button */}
                      <button
                        onClick={() => handleQtyChange(item.id, state.actual_qty - 1, item.required_qty)}
                        className="touch-btn"
                        style={{
                          width: 48,
                          height: 48,
                          background: "#f1f5f9",
                          border: "1.5px solid #cbd5e1",
                          color: "#1e293b",
                          fontSize: 18,
                        }}
                      >
                        <MinusOutlined />
                      </button>

                      {/* Numeric Input */}
                      <input
                        type="number"
                        min="0"
                        value={state.actual_qty}
                        onChange={(e) =>
                          handleQtyChange(item.id, parseFloat(e.target.value) || 0, item.required_qty)
                        }
                        style={{
                          flex: 1,
                          height: 48,
                          borderRadius: 10,
                          border: isReasonMissing ? "2px solid #ef4444" : "1.5px solid #94a3b8",
                          textAlign: "center",
                          fontSize: 20,
                          fontWeight: 800,
                          color: isShortage ? "#dc2626" : "#0f172a",
                          background: "#ffffff",
                        }}
                      />

                      {/* Increment button */}
                      <button
                        onClick={() => handleQtyChange(item.id, state.actual_qty + 1, item.required_qty)}
                        className="touch-btn"
                        style={{
                          width: 48,
                          height: 48,
                          background: "#f1f5f9",
                          border: "1.5px solid #cbd5e1",
                          color: "#1e293b",
                          fontSize: 18,
                        }}
                      >
                        <PlusOutlined />
                      </button>

                      {/* Fast "Nhặt đủ" button */}
                      <button
                        onClick={() => handlePickFull(item.id, item.required_qty)}
                        className="touch-btn"
                        style={{
                          height: 48,
                          padding: "0 14px",
                          background: state.actual_qty === item.required_qty ? "#dcfce7" : "#eef2ff",
                          border: state.actual_qty === item.required_qty ? "1.5px solid #86efac" : "1.5px solid #c7d2fe",
                          color: state.actual_qty === item.required_qty ? "#15803d" : "#4338ca",
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        Đủ {item.required_qty}
                      </button>
                    </div>
                  </div>

                  {/* AC 4: Shortage Warning & Mandatory Reason Input */}
                  {isShortage && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: "#fff1f2",
                        border: "1.5px solid #fca5a5",
                        borderRadius: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "#b91c1c",
                          fontWeight: 700,
                          fontSize: 13,
                          marginBottom: 6,
                        }}
                      >
                        <WarningOutlined /> Soạn thiếu{" "}
                        {item.required_qty - state.actual_qty} {item.unit_name || "cái"}. Bắt buộc nhập lý do!
                      </div>

                      <Input.TextArea
                        rows={2}
                        placeholder="Nhập lý do soạn thiếu (Bắt buộc)..."
                        value={state.missing_reason}
                        onChange={(e) => handleReasonChange(item.id, e.target.value)}
                        style={{
                          borderRadius: 8,
                          fontSize: 13,
                          border: isReasonMissing ? "2px solid #ef4444" : "1px solid #cbd5e1",
                        }}
                      />

                      {/* Quick Choice Reason Chips */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {COMMON_SHORTAGE_REASONS.map((reason) => (
                          <span
                            key={reason}
                            onClick={() => handleReasonChange(item.id, reason)}
                            style={{
                              cursor: "pointer",
                              fontSize: 11,
                              padding: "4px 8px",
                              borderRadius: 6,
                              background: state.missing_reason === reason ? "#b91c1c" : "#ffffff",
                              color: state.missing_reason === reason ? "#ffffff" : "#475569",
                              border: "1px solid #fecdd3",
                              fontWeight: 500,
                              userSelect: "none",
                            }}
                          >
                            + {reason}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completion toggle button */}
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
                    <button
                      onClick={() => handleToggleComplete(item.id, item.required_qty)}
                      className="touch-btn"
                      style={{
                        width: "100%",
                        height: 42,
                        background: state.is_completed ? "#22c55e" : "#f8fafc",
                        color: state.is_completed ? "#ffffff" : "#475569",
                        border: state.is_completed ? "none" : "1.5px solid #cbd5e1",
                        fontSize: 14,
                        gap: 8,
                      }}
                    >
                      <CheckCircleOutlined />
                      {state.is_completed ? "Đã soạn xong dòng này ✓" : "Đánh dấu hoàn thành"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom Action Bar for Confirmation & Save */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#ffffff",
              boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "center",
              zIndex: 100,
            }}
          >
            <div style={{ maxWidth: 680, width: "100%", display: "flex", gap: 10 }}>
              <button
                disabled={submitting}
                onClick={handleSubmitExecution}
                className="touch-btn"
                style={{
                  flex: 1,
                  height: 50,
                  background: "#16a34a",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 16,
                  fontWeight: 700,
                  gap: 8,
                  boxShadow: "0 4px 14px rgba(22, 163, 74, 0.4)",
                }}
              >
                {submitting ? (
                  <Spin size="small" />
                ) : (
                  <>
                    <CheckCircleOutlined style={{ fontSize: 20 }} />
                    Lưu & Xác nhận soạn hàng
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback if no active pick list selected in execute tab */}
      {activeTab === "execute" && !activePickList && !loading && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Alert
            message="Chưa chọn phiếu soạn hàng"
            description="Vui lòng chọn một phiếu từ tab 'Danh sách' hoặc tạo phiếu gộp mới."
            type="warning"
            showIcon
          />
          <button
            onClick={() => setActiveTab("list")}
            className="touch-btn"
            style={{
              marginTop: 16,
              background: "#4f46e5",
              color: "#ffffff",
              border: "none",
              padding: "10px 20px",
              fontSize: 14,
            }}
          >
            Quay lại danh sách phiếu
          </button>
        </div>
      )}
    </div>
  );
};

export default PickListManager;
