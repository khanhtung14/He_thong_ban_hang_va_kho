import { useState } from "react";
import { authenticatedFetch } from "./services/sessionService";
import { getAuthHeaders } from "./services/apiClient";
import type { components } from "./types/api.generated";

type ReturnCreate = components["schemas"]["ReturnCreate"];
type ReturnItem = components["schemas"]["ReturnItem"];
type PaymentCreate = components["schemas"]["PaymentCreate"];
type ReturnLine = ReturnItem & { deliveredQuantity: number };

type ReturnForm = {
  invoiceId: string;
  warehouseId: string;
  returnDate: string;
  reason: string;
};

const emptyReturn: ReturnForm = {
  invoiceId: "", warehouseId: "", returnDate: new Date().toISOString().slice(0, 10),
  reason: "",
};

function getMessage(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (typeof data.message === "string") return data.message;
    if (typeof data.detail === "string") return data.detail;
  }
  return fallback;
}

function getData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const data = value as Record<string, unknown>;
  return data.data && typeof data.data === "object" ? data.data as Record<string, unknown> : data;
}

export default function DebtManagement() {
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const [paymentForm, setPaymentForm] = useState({ customerId: "", amount: "", method: "BANK_TRANSFER", invoiceIds: "" });
  const [returnForm, setReturnForm] = useState<ReturnForm>(emptyReturn);
  const [invoiceOptions, setInvoiceOptions] = useState<Record<string, unknown>[]>([]);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [confirmId, setConfirmId] = useState("");
  const [creditReturnId, setCreditReturnId] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const request = async (url: string, init: RequestInit = {}) => {
    const response = await authenticatedFetch(url, { ...init, headers: { ...getAuthHeaders(), ...init.headers } });
    const data: unknown = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(getMessage(data, "Thao tác thất bại."));
    return data;
  };

  const sendReminder = async () => {
    setBusy("reminder"); setMessage("");
    try {
      const data = await request("/api/v1/debts/send-reminder", {
        method: "POST", body: JSON.stringify({ customerId: Number(customerId), invoiceId: Number(invoiceId) }),
      });
      const notifications = getData(data).notifications;
      setMessage(Array.isArray(notifications) && notifications.length > 0 ? String((notifications[0] as Record<string, unknown>).message || getMessage(data, "Đã gửi nhắc nợ.")) : getMessage(data, "Hóa đơn đã được nhắc hoặc chưa đến hạn."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể gửi nhắc nợ."); }
    finally { setBusy(null); }
  };

  const createPayment = async () => {
    setBusy("payment"); setMessage("");
    const payload: PaymentCreate = {
      customer_id: Number(paymentForm.customerId), amount: Number(paymentForm.amount),
      payment_method: paymentForm.method, payment_date: new Date().toISOString().slice(0, 10),
      invoice_ids: paymentForm.invoiceIds.split(",").map(Number).filter(Boolean),
    };
    try {
      const data = await request("/api/v1/payments", { method: "POST", body: JSON.stringify(payload) });
      const createdId = getData(data).id;
      setReceiptId(String(createdId ?? ""));
      setMessage(`Đã ghi nhận khoản thu. Mã phiếu: ${String(getData(data).receiptNumber ?? `PT-${createdId}`)}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể ghi nhận khoản thu."); }
    finally { setBusy(null); }
  };

  const downloadReceipt = async () => {
    setBusy("receipt"); setMessage("");
    try {
      const response = await authenticatedFetch(`/api/v1/payments/${Number(receiptId)}/receipt-pdf`, { headers: getAuthHeaders() });
      if (!response.ok) throw new Error(getMessage(await response.json().catch(() => ({})), "Không thể tải phiếu thu."));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `PhieuThu_${receiptId}.pdf`; link.click(); URL.revokeObjectURL(url);
      setMessage("Đã tải phiếu thu PDF.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải phiếu thu."); }
    finally { setBusy(null); }
  };

  const createReturn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy("return"); setMessage("");
    if (!returnForm.invoiceId || !returnForm.warehouseId || !returnForm.reason.trim()) { setMessage("Vui lòng chọn hóa đơn, nhập kho nhận và lý do trả."); setBusy(null); return; }
    const selectedLines = returnLines.filter((line) => line.quantity > 0);
    if (selectedLines.length === 0) { setMessage("Vui lòng chọn ít nhất một dòng hàng để trả."); setBusy(null); return; }
    if (selectedLines.some((line) => line.quantity > line.deliveredQuantity)) { setMessage("Số lượng trả không được vượt số lượng đã giao."); setBusy(null); return; }
    const payload: ReturnCreate = { invoice_id: Number(returnForm.invoiceId), warehouse_id: Number(returnForm.warehouseId), return_date: returnForm.returnDate, reason: returnForm.reason, items: selectedLines.map((line) => ({ product_id: line.product_id, unit_id: line.unit_id, lot_number: line.lot_number, quantity: line.quantity })) };
    try {
      const data = await request("/api/v1/returns", { method: "POST", body: JSON.stringify(payload) });
      setMessage(`Đã lập phiếu trả #${String(getData(data).id)} và chuyển chờ kho xác nhận.`); setReturnForm(emptyReturn); setReturnLines([]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể lập phiếu trả hàng."); }
    finally { setBusy(null); }
  };

  const loadInvoices = async () => {
    setBusy("invoices"); setMessage("");
    try {
      const data = await request("/api/v1/invoices");
      const list = getData(data).data;
      setInvoiceOptions(Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : []);
      setMessage("Đã tải danh sách hóa đơn chưa thanh toán.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tải danh sách hóa đơn."); }
    finally { setBusy(null); }
  };

  const selectInvoice = (value: string) => {
    const selected = invoiceOptions.find((invoice) => String(invoice.id) === value);
    const rawItems = selected?.items;
    const lines: ReturnLine[] = Array.isArray(rawItems) ? rawItems.flatMap((raw): ReturnLine[] => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const deliveredQuantity = Number(item.deliveredQuantity ?? 0);
      if (!Number.isFinite(deliveredQuantity) || deliveredQuantity <= 0) return [];
      return [{
        product_id: Number(item.productId), unit_id: Number(item.unitId ?? 1), lot_number: String(item.lotNumber ?? "UNKNOWN"),
        quantity: 0, deliveredQuantity,
      }];
    }) : [];
    setReturnForm((current) => ({ ...current, invoiceId: value }));
    setReturnLines(lines);
  };

  const updateReturnLineQuantity = (index: number, value: string) => {
    const quantity = Number(value);
    setReturnLines((lines) => lines.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Number.isFinite(quantity) ? quantity : 0 } : line));
  };

  const confirmReturn = async () => {
    setBusy("confirm"); setMessage("");
    try {
      const data = await request(`/api/v1/returns/${Number(confirmId)}/confirm-receipt`, { method: "POST" });
      setCreditReturnId(confirmId);
      setMessage(`Đã xác nhận nhận hàng và cộng tồn kho cho phiếu trả #${String(getData(data).id ?? confirmId)}. Có thể lập chứng từ SCRUM-65.`);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể xác nhận phiếu trả."); }
    finally { setBusy(null); }
  };

  const createCreditNote = async () => {
    setBusy("credit"); setMessage("");
    try {
      const data = await request(`/api/v1/returns/${Number(creditReturnId)}/credit-note`, { method: "POST", body: JSON.stringify({ returnId: Number(creditReturnId), note: creditNote }) });
      const result = getData(data);
      setMessage(`Đã tạo chứng từ giảm trừ #${String(result.id)} từ phiếu trả #${String(result.returnId ?? creditReturnId)}; giảm ${String(result.amount ?? 0)}, công nợ còn ${String(result.currentDebt ?? 0)}, hạn mức khả dụng ${String(result.availableCredit ?? 0)}. Hóa đơn gốc #${String(result.originalInvoiceId ?? "")} được giữ nguyên.`);
    }
    catch (error) { setMessage(error instanceof Error ? error.message : "Không thể tạo chứng từ giảm trừ."); }
    finally { setBusy(null); }
  };

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Quản lý công nợ và trả hàng</h1>
      <p>SCRUM-54 · SCRUM-55 · SCRUM-56 · SCRUM-65</p>
      {message && <p role="status" style={{ background: "#eef6ff", padding: 12 }}>{message}</p>}

      <section><h2>SCRUM-54 · Nhắc hạn thanh toán</h2><p>Gửi email/thông báo trước hạn 3 ngày, quá hạn và không gửi trùng trong cùng ngày.</p>
        <input aria-label="Mã đại lý" type="number" placeholder="Mã đại lý" value={customerId} onChange={e => setCustomerId(e.target.value)} />{" "}
        <input aria-label="Mã hóa đơn" type="number" placeholder="Mã hóa đơn" value={invoiceId} onChange={e => setInvoiceId(e.target.value)} />{" "}
        <button onClick={sendReminder} disabled={busy !== null || !customerId || !invoiceId}>{busy === "reminder" ? "Đang gửi..." : "Gửi nhắc nợ"}</button>
      </section>

      <section><h2>SCRUM-55 · Phiếu thu</h2><p>Ghi nhận khoản thu, sinh mã duy nhất và tải phiếu PDF có đại lý, số tiền, hình thức, người thu.</p>
        <div><input aria-label="Mã đại lý thu tiền" type="number" placeholder="Mã đại lý" value={paymentForm.customerId} onChange={e => setPaymentForm({...paymentForm, customerId: e.target.value})} />{" "}
        <input aria-label="Số tiền thu" type="number" min="1" placeholder="Số tiền" value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} />{" "}
        <select aria-label="Hình thức thanh toán" value={paymentForm.method} onChange={e => setPaymentForm({...paymentForm, method: e.target.value})}><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option></select>{" "}
        <input aria-label="Danh sách hóa đơn" placeholder="Mã hóa đơn, phân cách dấu phẩy" value={paymentForm.invoiceIds} onChange={e => setPaymentForm({...paymentForm, invoiceIds: e.target.value})} />{" "}
        <button onClick={createPayment} disabled={busy !== null}>{busy === "payment" ? "Đang lưu..." : "Ghi nhận khoản thu"}</button></div>
        <div style={{ marginTop: 10 }}><input aria-label="Mã phiếu thu cần tải" type="number" placeholder="Mã payment" value={receiptId} onChange={e => setReceiptId(e.target.value)} />{" "}<button onClick={downloadReceipt} disabled={busy !== null || !receiptId}>{busy === "receipt" ? "Đang tải..." : "In / tải PDF"}</button></div>
      </section>

      <section><h2>SCRUM-56 · Trả hàng</h2><p>Chọn hóa đơn gốc, chọn các dòng hàng và số lượng trả; lý do là bắt buộc.</p>
        <div style={{ marginBottom: 12 }}><button type="button" onClick={loadInvoices} disabled={busy !== null}>{busy === "invoices" ? "Đang tải hóa đơn..." : "Tải hóa đơn gốc"}</button>{" "}
          <select aria-label="Chọn hóa đơn gốc" value={returnForm.invoiceId} onChange={e => selectInvoice(e.target.value)} required>
            <option value="">-- Chọn hóa đơn gốc --</option>
            {invoiceOptions.map((invoice) => <option key={String(invoice.id)} value={String(invoice.id)}>Hóa đơn #{String(invoice.id)} · Đại lý #{String(invoice.customer_id ?? "")}</option>)}
          </select>
        </div>
        <form onSubmit={createReturn} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input aria-label="Kho nhận" type="number" placeholder="Kho nhận" value={returnForm.warehouseId} onChange={e => setReturnForm({...returnForm, warehouseId: e.target.value})} required />
          <input aria-label="Ngày trả" type="date" value={returnForm.returnDate} onChange={e => setReturnForm({...returnForm, returnDate: e.target.value})} required />
          <input aria-label="Lý do trả" placeholder="Lý do trả" value={returnForm.reason} onChange={e => setReturnForm({...returnForm, reason: e.target.value})} required />
          <button type="submit" disabled={busy !== null}>{busy === "return" ? "Đang lưu..." : "Lập phiếu trả"}</button>
        </form>
        {returnLines.length > 0 && <div style={{ overflowX: "auto", marginTop: 12 }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Sản phẩm</th><th>Số lô</th><th>Đã giao</th><th>Số lượng trả</th></tr></thead><tbody>{returnLines.map((line, index) => <tr key={`${line.product_id}-${line.lot_number}`}><td>{line.product_id}</td><td>{line.lot_number}</td><td>{line.deliveredQuantity}</td><td><input aria-label={`Số lượng trả sản phẩm ${line.product_id}`} type="number" min="0" max={line.deliveredQuantity} value={line.quantity} onChange={e => updateReturnLineQuantity(index, e.target.value)} /></td></tr>)}</tbody></table></div>}
        {returnForm.invoiceId && returnLines.length === 0 && <p role="status">Hóa đơn chưa có dòng hàng đã giao để trả.</p>}
        <div style={{ marginTop: 16 }}><strong>Quản lý kho xác nhận:</strong>{" "}<input aria-label="Mã phiếu trả cần xác nhận" type="number" placeholder="Mã phiếu trả" value={confirmId} onChange={e => setConfirmId(e.target.value)} />{" "}<button onClick={confirmReturn} disabled={busy !== null || !confirmId}>{busy === "confirm" ? "Đang xác nhận..." : "Xác nhận nhận hàng"}</button></div>
        <div style={{ marginTop: 10 }}><strong>SCRUM-65 · Kế toán lập chứng từ giảm trừ công nợ:</strong><p>Chỉ lập sau khi kho đã xác nhận phiếu trả. Chứng từ liên kết hóa đơn gốc, tính theo giá đã bán và không sửa hóa đơn gốc.</p>{" "}<input aria-label="Mã phiếu trả giảm trừ" type="number" placeholder="Mã phiếu trả" value={creditReturnId} onChange={e => setCreditReturnId(e.target.value)} />{" "}<input aria-label="Nội dung giảm trừ" placeholder="Nội dung" value={creditNote} onChange={e => setCreditNote(e.target.value)} />{" "}<button onClick={createCreditNote} disabled={busy !== null || !creditReturnId || !creditNote}>{busy === "credit" ? "Đang tạo..." : "Tạo chứng từ"}</button></div>
      </section>
    </main>
  );
}
