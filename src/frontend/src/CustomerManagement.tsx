import { useEffect, useState, FormEvent } from "react";
import { authenticatedFetch } from "./session";

export interface CustomerItem {
  id: number;
  code: string;
  name: string;
  customer_group?: string;
  sales_rep_id?: number | null;
  territory_id?: number | null;
  is_active: boolean;
  is_locked: boolean;
  lock_reason?: string | null;
  locked_at?: string | null;
  locked_by_id?: number | null;
  pending_orders_count: number;
  created_at?: string | null;
}

export interface CustomerManagementProps {
  onSelectCustomer?: (customer: CustomerItem) => void;
  userRole?: string;
}

export default function CustomerManagement({ userRole }: CustomerManagementProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterLocked, setFilterLocked] = useState<string>("ALL");
  const [notice, setNotice] = useState<{ text: string; type: "success" | "error" | "warning" } | null>(null);

  // Modal Lock states
  const [lockTarget, setLockTarget] = useState<CustomerItem | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);
  const [modalError, setModalError] = useState("");

  // Modal Detail states
  const [detailCustomer, setDetailCustomer] = useState<CustomerItem | null>(null);

  // New Customer Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({ code: "", name: "" });
  const [newCustomerError, setNewCustomerError] = useState("");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, [filterLocked]);

  async function loadCustomers(searchKeyword = search) {
    setLoading(true);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      if (filterLocked === "LOCKED") params.set("is_locked", "true");
      if (filterLocked === "ACTIVE") params.set("is_locked", "false");
      if (searchKeyword.trim()) params.set("search", searchKeyword.trim());

      const res = await authenticatedFetch(`/api/v1/customers?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Không tải được danh sách đại lý.");
      }
      const data: CustomerItem[] = await res.json();
      setCustomers(data);
    } catch (err: any) {
      setNotice({ text: err.message || "Lỗi khi tải danh sách đại lý.", type: "error" });
    } finally {
      setLoading(false);
    }
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    loadCustomers(search);
  }

  function openLockModal(customer: CustomerItem) {
    setLockTarget(customer);
    setLockReason("");
    setModalError("");
  }

  function closeLockModal() {
    setLockTarget(null);
    setLockReason("");
    setModalError("");
  }

  async function handleConfirmLock(e: FormEvent) {
    e.preventDefault();
    if (!lockTarget) return;

    const trimmedReason = lockReason.trim();
    if (!trimmedReason) {
      setModalError("Bắt buộc phải nhập lý do khóa giao dịch đại lý!");
      return;
    }

    setIsSubmittingLock(true);
    setModalError("");

    try {
      const res = await authenticatedFetch(`/api/v1/customers/${lockTarget.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Không thể khóa đại lý.");
      }

      setNotice({
        text: `Đã khóa giao dịch thành công đối với đại lý ${lockTarget.name} (${lockTarget.code}).`,
        type: "warning",
      });
      closeLockModal();
      loadCustomers();
    } catch (err: any) {
      setModalError(err.message || "Đã xảy ra lỗi khi khóa đại lý.");
    } finally {
      setIsSubmittingLock(false);
    }
  }

  async function handleUnlockCustomer(customer: CustomerItem) {
    if (!window.confirm(`Xác nhận mở khóa giao dịch cho đại lý "${customer.name}" (${customer.code})?`)) {
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/v1/customers/${customer.id}/unlock`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Không thể mở khóa đại lý.");
      }

      setNotice({
        text: `Đã mở khóa giao dịch cho đại lý ${customer.name} (${customer.code}). Đại lý có thể tiếp tục tạo đơn hàng.`,
        type: "success",
      });
      loadCustomers();
    } catch (err: any) {
      setNotice({ text: err.message || "Lỗi khi mở khóa đại lý.", type: "error" });
    }
  }

  async function handleCreateCustomer(e: FormEvent) {
    e.preventDefault();
    if (!newCustomerForm.code.trim() || !newCustomerForm.name.trim()) {
      setNewCustomerError("Vui lòng nhập đầy đủ mã và tên đại lý.");
      return;
    }

    setIsSubmittingNew(true);
    setNewCustomerError("");

    try {
      const res = await authenticatedFetch("/api/v1/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCustomerForm.code.trim(),
          name: newCustomerForm.name.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Không thể tạo đại lý mới.");
      }

      setNotice({ text: `Đã thêm mới đại lý ${data.name} (${data.code}) thành công.`, type: "success" });
      setIsNewModalOpen(false);
      setNewCustomerForm({ code: "", name: "" });
      loadCustomers();
    } catch (err: any) {
      setNewCustomerError(err.message || "Lỗi khi tạo đại lý.");
    } finally {
      setIsSubmittingNew(false);
    }
  }

  const isAccountantOrAdmin = userRole === "accountant" || userRole === "admin" || !userRole;

  return (
    <div className="workspace-panel" style={{ padding: 24 }}>
      <div className="workspace-page-heading" style={{ marginBottom: 20 }}>
        <div>
          <h2>Quản lý Đại lý & Khóa giao dịch (SCRUM-85)</h2>
          <p>Kế toán công nợ theo dõi khả năng thanh toán, khóa/mở giao dịch đại lý có nợ xấu hoặc vi phạm hạn mức.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="workspace-button is-secondary" onClick={() => loadCustomers()}>
            ↻ Làm mới
          </button>
          <button type="button" className="workspace-button" onClick={() => setIsNewModalOpen(true)}>
            ＋ Thêm đại lý
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`workspace-alert is-${notice.type}`}
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 8,
          }}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            style={{ background: "transparent", border: 0, cursor: "pointer", fontWeight: "bold" }}
          >
            ×
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="Tìm theo mã hoặc tên đại lý..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
          <button type="submit" className="workspace-button is-secondary">
            Tìm
          </button>
        </form>

        <select
          value={filterLocked}
          onChange={(e) => setFilterLocked(e.target.value)}
          style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13 }}
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang giao dịch (Không khóa)</option>
          <option value="LOCKED">Đã khóa giao dịch</option>
        </select>
      </div>

      {/* Table */}
      <div className="workspace-table-wrap">
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Mã đại lý</th>
              <th>Tên đại lý</th>
              <th>Trạng thái giao dịch</th>
              <th>Đơn dở dang</th>
              <th>Lý do khóa</th>
              <th style={{ textAlign: "right" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                  Đang tải dữ liệu đại lý...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#6b7280" }}>
                  Không tìm thấy đại lý nào.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong style={{ color: "#2563eb", fontFamily: "monospace" }}>{c.code}</strong>
                  </td>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    {c.is_locked ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 9px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: "#fee2e2",
                          color: "#b91c1c",
                          border: "1px solid #fca5a5",
                        }}
                      >
                        ⛔ ĐÃ KHÓA
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 9px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: "#dcfce7",
                          color: "#15803d",
                          border: "1px solid #86efac",
                        }}
                      >
                        ✓ Bình thường
                      </span>
                    )}
                  </td>
                  <td>
                    {c.pending_orders_count > 0 ? (
                      <span
                        style={{
                          color: c.is_locked ? "#b45309" : "#374151",
                          fontWeight: c.is_locked ? 700 : 500,
                          backgroundColor: c.is_locked ? "#fef3c7" : "transparent",
                          padding: c.is_locked ? "2px 8px" : 0,
                          borderRadius: 4,
                        }}
                      >
                        {c.pending_orders_count} đơn {c.is_locked ? "⚠️" : ""}
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>0 đơn</span>
                    )}
                  </td>
                  <td style={{ maxWidth: 220, fontSize: 12, color: c.is_locked ? "#dc2626" : "#9ca3af" }}>
                    {c.is_locked ? c.lock_reason || "Chưa có lý do" : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: 6 }}>
                      <button
                        type="button"
                        className="workspace-link-button"
                        onClick={() => setDetailCustomer(c)}
                        style={{ marginRight: 6 }}
                      >
                        Chi tiết
                      </button>

                      {isAccountantOrAdmin && (
                        c.is_locked ? (
                          <button
                            type="button"
                            className="workspace-button is-secondary"
                            style={{ minHeight: 30, padding: "0 10px", fontSize: 11, color: "#16a34a", borderColor: "#86efac" }}
                            onClick={() => handleUnlockCustomer(c)}
                          >
                            🔓 Mở khóa
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="workspace-button is-danger"
                            style={{ minHeight: 30, padding: "0 10px", fontSize: 11 }}
                            onClick={() => openLockModal(c)}
                          >
                            🔒 Khóa giao dịch
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL KHÓA ĐẠI LÝ (BẮT BUỘC NHẬP LÝ DO - SCRUM-85) */}
      {lockTarget && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingLock) closeLockModal();
          }}
        >
          <section className="workspace-modal" role="dialog" aria-modal="true" style={{ maxWidth: 480 }}>
            <button
              className="workspace-modal-close"
              onClick={closeLockModal}
              disabled={isSubmittingLock}
              aria-label="Đóng"
            >
              ×
            </button>
            <span
              className="workspace-modal-icon"
              style={{ backgroundColor: "#fee2e2", color: "#dc2626", borderColor: "#fca5a5" }}
            >
              ⚠️
            </span>
            <h2 style={{ color: "#991b1b" }}>Khóa giao dịch đại lý</h2>
            <p>
              Bạn đang chuẩn bị khóa đại lý <strong>{lockTarget.name}</strong> (Mã: <code>{lockTarget.code}</code>).
            </p>

            <div
              style={{
                backgroundColor: "#fffbeb",
                border: "1px solid #fef3c7",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 12,
                color: "#92400e",
                marginBottom: 16,
              }}
            >
              <strong>Lưu ý nghiệp vụ SCRUM-85:</strong> Sau khi bị khóa, đại lý sẽ <u>bị chặn hoàn toàn</u> việc tạo đơn
              hàng mới (kể cả trên cổng đặt hàng đại lý). Các đơn hàng dở dang hiện có ({lockTarget.pending_orders_count}{" "}
              đơn) vẫn được phép xử lý nhưng sẽ hiển thị cảnh báo nổi bật.
            </div>

            {modalError && (
              <div className="workspace-alert is-error" style={{ marginBottom: 14 }}>
                {modalError}
              </div>
            )}

            <form onSubmit={handleConfirmLock}>
              <label htmlFor="modal-lock-reason" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Lý do khóa đại lý <span style={{ color: "#dc2626" }}>* (Bắt buộc)</span>
              </label>
              <textarea
                id="modal-lock-reason"
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
                placeholder="Ví dụ: Nợ quá hạn 45 ngày; Mất khả năng thanh toán; Vượt trần mức tín dụng 50 triệu..."
                rows={3}
                required
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1.5px solid #d1d5db",
                  fontSize: 13,
                }}
              />

              <div className="workspace-modal-actions" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="workspace-button is-ghost"
                  onClick={closeLockModal}
                  disabled={isSubmittingLock}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="workspace-button is-danger"
                  disabled={isSubmittingLock || !lockReason.trim()}
                >
                  {isSubmittingLock ? "Đang xử lý khóa..." : "Xác nhận Khóa giao dịch"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* MODAL CHI TIẾT ĐẠI LÝ */}
      {detailCustomer && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailCustomer(null);
          }}
        >
          <section className="workspace-modal is-wide" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
            <button className="workspace-modal-close" onClick={() => setDetailCustomer(null)}>
              ×
            </button>
            <h2>Chi tiết Đại lý: {detailCustomer.code}</h2>
            <div style={{ marginTop: 16, display: "grid", gap: 10, fontSize: 13 }}>
              <div><strong>Tên đại lý:</strong> {detailCustomer.name}</div>
              <div><strong>Mã định danh:</strong> <code>{detailCustomer.code}</code></div>
              <div>
                <strong>Trạng thái:</strong>{" "}
                {detailCustomer.is_locked ? (
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>ĐÃ KHÓA GIAO DỊCH</span>
                ) : (
                  <span style={{ color: "#16a34a", fontWeight: 700 }}>Đang hoạt động bình thường</span>
                )}
              </div>
              {detailCustomer.is_locked && (
                <>
                  <div style={{ padding: 10, backgroundColor: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                    <div style={{ color: "#991b1b", fontWeight: 700 }}>Lý do khóa:</div>
                    <div style={{ color: "#7f1d1d", marginTop: 4 }}>{detailCustomer.lock_reason}</div>
                    {detailCustomer.locked_at && (
                      <small style={{ color: "#991b1b", display: "block", marginTop: 4 }}>
                        Thời gian khóa: {new Date(detailCustomer.locked_at).toLocaleString("vi-VN")}
                      </small>
                    )}
                  </div>
                </>
              )}
              <div><strong>Số đơn hàng dở dang:</strong> {detailCustomer.pending_orders_count} đơn</div>
            </div>
            <div className="workspace-modal-actions" style={{ marginTop: 20 }}>
              <button type="button" className="workspace-button" onClick={() => setDetailCustomer(null)}>
                Đóng
              </button>
            </div>
          </section>
        </div>
      )}

      {/* MODAL THÊM MỚI ĐẠI LÝ */}
      {isNewModalOpen && (
        <div
          className="workspace-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isSubmittingNew) setIsNewModalOpen(false);
          }}
        >
          <section className="workspace-modal" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
            <button
              className="workspace-modal-close"
              onClick={() => setIsNewModalOpen(false)}
              disabled={isSubmittingNew}
            >
              ×
            </button>
            <h2>Thêm mới Đại lý</h2>
            {newCustomerError && (
              <div className="workspace-alert is-error" style={{ marginBottom: 12 }}>
                {newCustomerError}
              </div>
            )}
            <form onSubmit={handleCreateCustomer}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                    Mã đại lý <span style={{ color: "red" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: DL-003"
                    value={newCustomerForm.code}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, code: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                    Tên đại lý <span style={{ color: "red" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Đại lý Hoàng Gia"
                    value={newCustomerForm.name}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #d1d5db" }}
                  />
                </div>
              </div>
              <div className="workspace-modal-actions" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="workspace-button is-ghost"
                  onClick={() => setIsNewModalOpen(false)}
                  disabled={isSubmittingNew}
                >
                  Hủy
                </button>
                <button type="submit" className="workspace-button" disabled={isSubmittingNew}>
                  {isSubmittingNew ? "Đang lưu..." : "Lưu đại lý"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
