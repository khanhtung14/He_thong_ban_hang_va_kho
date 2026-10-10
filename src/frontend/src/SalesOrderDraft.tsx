import { useEffect, useMemo, useState, type FormEvent } from "react";
import { authenticatedFetch } from "./session";
import "./SalesOrderDraft.css";

type SalesCustomer = {
  id: number;
  code: string;
  name: string;
  is_locked: boolean;
  lock_reason?: string | null;
};

type DeliveryPoint = {
  id: number;
  customer_id: number;
  name: string;
  address: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  is_default: boolean;
};

type ProductUnit = {
  id: number;
  unit_code: string;
  unit_name: string;
  conversion_factor: number;
  is_base_unit: boolean;
};

type SalesProduct = {
  id: number;
  sku: string;
  name: string;
  sale_price: number;
  discount_percent: number;
  units: ProductUnit[];
};

type DraftItem = {
  id: number;
  product_id: number | null;
  sku: string;
  product_name: string;
  unit_id: number | null;
  unit_code: string | null;
  unit_name: string | null;
  conversion_factor: number;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  line_subtotal: number;
  discount_amount: number;
  line_total: number;
};

type SalesDraft = {
  id: number;
  order_code: string;
  customer_id: number;
  customer_name: string;
  delivery_point_id: number | null;
  delivery_point_name: string | null;
  delivery_address: string | null;
  desired_delivery_date: string | null;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  note: string | null;
  items: DraftItem[];
};

type DraftLine = {
  key: string;
  product: SalesProduct;
  unitId: number;
  quantity: number;
  unitPrice: number;
};

type ApiError = { detail?: string };

async function readResponse<T>(response: Response): Promise<T> {
  const result = await response.json().catch(() => ({} as T & ApiError));
  if (!response.ok) {
    throw new Error((result as ApiError).detail ?? "Không thể tải dữ liệu đơn hàng.");
  }
  return result as T;
}

function localToday(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function SalesOrderDraft() {
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [products, setProducts] = useState<SalesProduct[]>([]);
  const [drafts, setDrafts] = useState<SalesDraft[]>([]);
  const [customerId, setCustomerId] = useState<number | "">("");
  const [deliveryPointId, setDeliveryPointId] = useState<number | "">("");
  const [deliveryDate, setDeliveryDate] = useState(localToday);
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [note, setNote] = useState("");
  const [draftId, setDraftId] = useState<number | null>(null);
  const [draftCode, setDraftCode] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingDraftId, setOpeningDraftId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [productError, setProductError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [nextLineKey, setNextLineKey] = useState(1);

  useEffect(() => {
    let active = true;
    async function loadInitialData() {
      setInitialLoading(true);
      setErrorMessage("");
      try {
        const [loadedCustomers, loadedDrafts] = await Promise.all([
          authenticatedFetch("/api/v1/sales-orders/customers").then((response) =>
            readResponse<SalesCustomer[]>(response),
          ),
          authenticatedFetch("/api/v1/sales-orders/drafts").then((response) =>
            readResponse<SalesDraft[]>(response),
          ),
        ]);
        if (active) {
          setCustomers(loadedCustomers);
          setDrafts(loadedDrafts);
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Không tải được dữ liệu đơn hàng.");
      } finally {
        if (active) setInitialLoading(false);
      }
    }
    void loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setProductLoading(true);
      setProductError("");
      try {
        const query = new URLSearchParams({ search: productSearch.trim() });
        const data = await readResponse<SalesProduct[]>(
          await authenticatedFetch(`/api/v1/sales-orders/products?${query}`),
        );
        if (active) setProducts(data);
      } catch (error) {
        if (active) setProductError(error instanceof Error ? error.message : "Không tải được sản phẩm.");
      } finally {
        if (active) setProductLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [productSearch]);

  useEffect(() => {
    let active = true;
    if (!customerId) {
      setDeliveryPoints([]);
      setDeliveryPointId("");
      return () => {
        active = false;
      };
    }
    async function loadDeliveryPoints() {
      setDeliveryLoading(true);
      setDeliveryPointId("");
      try {
        const query = new URLSearchParams({ customer_id: String(customerId) });
        const points = await readResponse<DeliveryPoint[]>(
          await authenticatedFetch(`/api/v1/sales-orders/delivery-points?${query}`),
        );
        if (active) {
          setDeliveryPoints(points);
          const preferred = points.find((point) => point.is_default) ?? points[0];
          setDeliveryPointId(preferred?.id ?? "");
        }
      } catch (error) {
        if (active) {
          setDeliveryPoints([]);
          setErrorMessage(error instanceof Error ? error.message : "Không tải được điểm giao.");
        }
      } finally {
        if (active) setDeliveryLoading(false);
      }
    }
    void loadDeliveryPoints();
    return () => {
      active = false;
    };
  }, [customerId]);

  const selectedCustomer = customers.find((customer) => customer.id === Number(customerId));
  const totals = useMemo(() => lines.reduce(
    (sum, line) => {
      const lineSubtotal = roundMoney(line.unitPrice * line.quantity);
      const lineDiscount = roundMoney(lineSubtotal * line.product.discount_percent / 100);
      sum.subtotal += lineSubtotal;
      sum.discount += lineDiscount;
      return sum;
    },
    { subtotal: 0, discount: 0 },
  ), [lines]);
  const totalDue = roundMoney(totals.subtotal - totals.discount);

  function addProduct(product: SalesProduct) {
    const unit = product.units.find((item) => item.is_base_unit) ?? product.units[0];
    if (!unit) return;
    const unitPrice = roundMoney(product.sale_price * unit.conversion_factor);
    setLines((current) => [...current, {
      key: `line-${nextLineKey}`,
      product,
      unitId: unit.id,
      quantity: 1,
      unitPrice,
    }]);
    setNextLineKey((value) => value + 1);
  }

  function updateLine(key: string, changes: Partial<Pick<DraftLine, "unitId" | "quantity">>) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const unit = line.product.units.find((item) => item.id === (changes.unitId ?? line.unitId));
      return {
        ...line,
        ...changes,
        unitPrice: unit ? roundMoney(line.product.sale_price * unit.conversion_factor) : line.unitPrice,
      };
    }));
  }

  function openNewDraft() {
    setDraftId(null);
    setDraftCode("");
    setCustomerId("");
    setDeliveryPointId("");
    setDeliveryDate(localToday());
    setLines([]);
    setNote("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function reopenDraft(id: number) {
    setOpeningDraftId(id);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const draft = await readResponse<SalesDraft>(
        await authenticatedFetch(`/api/v1/sales-orders/drafts/${id}`),
      );
      setDraftId(draft.id);
      setDraftCode(draft.order_code);
      setCustomerId(draft.customer_id);
      setDeliveryPointId(draft.delivery_point_id ?? "");
      setDeliveryDate(draft.desired_delivery_date ?? localToday());
      setNote(draft.note ?? "");
      setLines(draft.items.map((item, index) => {
        const unit: ProductUnit = {
          id: item.unit_id ?? 0,
          unit_code: item.unit_code ?? "",
          unit_name: item.unit_name ?? "Đơn vị đã lưu",
          conversion_factor: item.conversion_factor,
          is_base_unit: item.conversion_factor === 1,
        };
        const product: SalesProduct = {
          id: item.product_id ?? 0,
          sku: item.sku,
          name: item.product_name,
          sale_price: item.conversion_factor > 0
            ? item.unit_price / item.conversion_factor
            : item.unit_price,
          discount_percent: item.discount_percent,
          units: [unit],
        };
        return {
          key: `reopened-${draft.id}-${index}`,
          product,
          unitId: unit.id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        };
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không mở được đơn nháp.");
    } finally {
      setOpeningDraftId(null);
    }
  }

  async function refreshDrafts() {
    const data = await readResponse<SalesDraft[]>(
      await authenticatedFetch("/api/v1/sales-orders/drafts"),
    );
    setDrafts(data);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (!customerId || !deliveryPointId || !deliveryDate) {
      setErrorMessage("Chọn đại lý, điểm giao và ngày giao mong muốn trước khi lưu.");
      return;
    }
    if (selectedCustomer?.is_locked && draftId === null) {
      setErrorMessage("Đại lý đang bị khóa giao dịch, không thể tạo đơn mới.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: Number(customerId),
        delivery_point_id: Number(deliveryPointId),
        desired_delivery_date: deliveryDate,
        note: note.trim() || null,
        items: lines.map((line) => ({
          product_id: line.product.id,
          unit_id: line.unitId,
          quantity: line.quantity,
        })),
      };
      const response = await authenticatedFetch(
        draftId === null
          ? "/api/v1/sales-orders/drafts"
          : `/api/v1/sales-orders/drafts/${draftId}`,
        {
          method: draftId === null ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const saved = await readResponse<SalesDraft>(response);
      setDraftId(saved.id);
      setDraftCode(saved.order_code);
      await refreshDrafts();
      setSuccessMessage(`Đã lưu nháp ${saved.order_code}. Bạn có thể mở lại để nhập tiếp.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không lưu được đơn nháp.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sales-order-page">
      <header className="sales-order-heading">
        <div>
          <h2>Tạo đơn hàng</h2>
          <p>Chọn đại lý, điểm giao và thêm các mặt hàng cần đặt.</p>
        </div>
        <button className="workspace-button is-secondary" type="button" onClick={openNewDraft}>
          Đơn mới
        </button>
      </header>

      {errorMessage && <div className="workspace-alert is-error" role="alert">{errorMessage}</div>}
      {successMessage && <div className="workspace-alert is-success" role="status">{successMessage}</div>}

      <section className="sales-order-drafts" aria-labelledby="draft-list-title">
        <div className="sales-order-section-heading">
          <h3 id="draft-list-title">Đơn nháp của tôi</h3>
          <span>{drafts.length}</span>
        </div>
        {initialLoading ? (
          <p className="sales-order-state">Đang tải đơn nháp…</p>
        ) : drafts.length === 0 ? (
          <p className="sales-order-state">Chưa có đơn nháp đã lưu.</p>
        ) : (
          <div className="sales-order-draft-list">
            {drafts.map((draft) => (
              <button
                type="button"
                key={draft.id}
                className={`sales-order-draft-option${draft.id === draftId ? " is-current" : ""}`}
                onClick={() => void reopenDraft(draft.id)}
                disabled={openingDraftId !== null}
              >
                <span><strong>{draft.order_code}</strong><small>{draft.customer_name}</small></span>
                <span>{formatMoney(draft.total_amount)}</span>
                <span>{openingDraftId === draft.id ? "Đang mở…" : "Mở"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {initialLoading ? (
        <div className="sales-order-state" role="status">Đang tải thông tin đại lý…</div>
      ) : customers.length === 0 ? (
        <div className="sales-order-empty" role="status">
          <strong>Chưa có đại lý trong phạm vi được giao.</strong>
          <span>Kiểm tra phân công nhân viên và nạp dữ liệu đại lý vào hệ thống.</span>
        </div>
      ) : (
        <form className="sales-order-form" onSubmit={saveDraft}>
          <section className="sales-order-section" aria-labelledby="delivery-section-title">
            <div className="sales-order-section-heading">
              <h3 id="delivery-section-title">Thông tin giao hàng</h3>
              {draftCode && <span className="sales-order-code">{draftCode}</span>}
            </div>
            <div className="sales-order-fields">
              <label>
                Đại lý
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value ? Number(event.target.value) : "")}
                  required
                >
                  <option value="">Chọn đại lý</option>
                  {customers.map((customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                      disabled={customer.is_locked && draftId === null}
                    >
                      {customer.code} · {customer.name}{customer.is_locked ? " · Đang khóa" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Điểm giao hàng
                <select
                  value={deliveryPointId}
                  onChange={(event) => setDeliveryPointId(event.target.value ? Number(event.target.value) : "")}
                  disabled={!customerId || deliveryLoading || deliveryPoints.length === 0}
                  required
                >
                  <option value="">
                    {deliveryLoading ? "Đang tải điểm giao…" : "Chọn điểm giao"}
                  </option>
                  {deliveryPoints.map((point) => (
                    <option key={point.id} value={point.id}>{point.name} · {point.address}</option>
                  ))}
                </select>
                {customerId && !deliveryLoading && deliveryPoints.length === 0 && (
                  <small className="sales-order-field-hint">Đại lý chưa có điểm giao được lưu.</small>
                )}
              </label>
              <label>
                Ngày giao mong muốn
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(event) => setDeliveryDate(event.target.value)}
                  required
                />
              </label>
            </div>
            {selectedCustomer?.is_locked && (
              <div className="sales-order-lock-warning" role="alert">
                Đại lý đang khóa giao dịch. Đơn nháp đã có vẫn có thể tiếp tục cập nhật.
                {selectedCustomer.lock_reason ? ` Lý do: ${selectedCustomer.lock_reason}` : ""}
              </div>
            )}
          </section>

          <section className="sales-order-section" aria-labelledby="items-section-title">
            <div className="sales-order-section-heading">
              <h3 id="items-section-title">Sản phẩm</h3>
              <span>{lines.length} dòng hàng</span>
            </div>
            <label className="sales-order-search">
              Tìm theo mã hoặc tên sản phẩm
              <input
                type="search"
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Nhập SKU hoặc tên sản phẩm"
              />
            </label>
            {productLoading ? (
              <p className="sales-order-state">Đang tìm sản phẩm…</p>
            ) : productError ? (
              <div className="workspace-alert is-error" role="alert">{productError}</div>
            ) : products.length === 0 ? (
              <div className="sales-order-empty" role="status">
                <strong>{productSearch ? "Không tìm thấy sản phẩm phù hợp." : "Danh mục chưa có sản phẩm."}</strong>
                <span>{productSearch ? "Thử tìm bằng một phần mã hoặc tên khác." : "Nạp catalog sản phẩm và đơn vị tính để bắt đầu tạo đơn."}</span>
              </div>
            ) : (
              <div className="sales-order-product-results" aria-label="Kết quả tìm sản phẩm">
                {products.map((product) => (
                  <button
                    className="sales-order-product-result"
                    type="button"
                    key={product.id}
                    onClick={() => addProduct(product)}
                    disabled={product.units.length === 0}
                    title={product.units.length === 0 ? "Sản phẩm chưa có đơn vị bán" : "Thêm mặt hàng"}
                  >
                    <span><strong>{product.name}</strong><small>{product.sku}</small></span>
                    <span>{formatMoney(product.sale_price)}<small>/{product.units.find((unit) => unit.is_base_unit)?.unit_name ?? "đơn vị gốc"}</small></span>
                    <span className="sales-order-add-icon" aria-hidden="true">+</span>
                  </button>
                ))}
              </div>
            )}

            {lines.length > 0 && (
              <div className="sales-order-lines">
                {lines.map((line) => {
                  const unit = line.product.units.find((item) => item.id === line.unitId);
                  const lineSubtotal = roundMoney(line.unitPrice * line.quantity);
                  const lineDiscount = roundMoney(lineSubtotal * line.product.discount_percent / 100);
                  return (
                    <article className="sales-order-line" key={line.key}>
                      <div className="sales-order-line-heading">
                        <span><strong>{line.product.name}</strong><small>{line.product.sku}</small></span>
                        <button
                          className="sales-order-remove"
                          type="button"
                          onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                          aria-label={`Xóa ${line.product.name}`}
                        >
                          Xóa
                        </button>
                      </div>
                      <div className="sales-order-line-controls">
                        <label>
                          Đơn vị tính
                          <select
                            value={line.unitId}
                            onChange={(event) => updateLine(line.key, { unitId: Number(event.target.value) })}
                          >
                            {line.product.units.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.unit_name} · {option.conversion_factor} {option.unit_code}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Số lượng
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={1_000_000}
                            step={1}
                            value={line.quantity}
                            onChange={(event) => updateLine(line.key, {
                              quantity: Math.max(1, Math.min(1_000_000, Number(event.target.value) || 1)),
                            })}
                            required
                          />
                        </label>
                        <div className="sales-order-line-price">
                          <small>Đơn giá · {unit?.unit_name ?? "đơn vị"}</small>
                          <strong>{formatMoney(line.unitPrice)}</strong>
                        </div>
                        <div className="sales-order-line-total">
                          <small>Thành tiền</small>
                          <strong>{formatMoney(lineSubtotal - lineDiscount)}</strong>
                        </div>
                      </div>
                      <p className="sales-order-discount-note">
                        Chiết khấu {line.product.discount_percent}% · {formatMoney(lineDiscount)}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="sales-order-section" aria-labelledby="note-section-title">
            <h3 id="note-section-title">Ghi chú đơn hàng</h3>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Ghi chú giao hàng hoặc yêu cầu tại cửa hàng"
            />
          </section>

          <section className="sales-order-summary" aria-label="Tổng tiền đơn hàng" aria-live="polite">
            <div><span>Tổng tiền hàng</span><strong>{formatMoney(totals.subtotal)}</strong></div>
            <div><span>Chiết khấu</span><strong>- {formatMoney(totals.discount)}</strong></div>
            <div className="sales-order-due"><span>Tổng phải thu</span><strong>{formatMoney(totalDue)}</strong></div>
          </section>

          <footer className="sales-order-actions">
            <button
              className="workspace-button is-secondary"
              type="submit"
              disabled={saving || deliveryLoading || !customerId || !deliveryPointId}
            >
              {saving ? "Đang lưu…" : draftId ? "Cập nhật đơn nháp" : "Lưu đơn nháp"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}