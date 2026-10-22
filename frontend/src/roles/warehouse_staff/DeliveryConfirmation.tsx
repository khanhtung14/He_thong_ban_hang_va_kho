import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Alert, Button, Card, Image as AntImage, Input, Radio, Select, Typography, type SelectProps, message } from "antd";
import { CheckCircleFilled, CloseCircleFilled, DeleteOutlined, FileImageOutlined, InboxOutlined, ReloadOutlined } from "@ant-design/icons";
import { getAuthToken } from "../../services/apiClient";
import type { components, paths } from "../../types/api.generated";
import "./DeliveryConfirmation.css";

type DeliveryStatus = NonNullable<components["schemas"]["Body_confirm_delivery_api_v1_deliveries__dispatch_id__confirm_pod_post"]["deliveryStatus"]>;
type FailureReason = components["schemas"]["Body_confirm_delivery_api_v1_deliveries__dispatch_id__confirm_pod_post"]["failureReason"];
type DeliveryResponse = paths["/api/v1/deliveries/{dispatch_id}/confirm-pod"]["post"]["responses"][200]["content"]["application/json"];
type StoredConfirmationResponse = paths["/api/v1/deliveries/{dispatch_id}/confirm-pod"]["get"]["responses"][200]["content"]["application/json"];
type PendingDispatchListResponse = paths["/api/v1/deliveries/pending-confirmations"]["get"]["responses"][200]["content"]["application/json"];

const failureReasons: { value: NonNullable<FailureReason>; label: string }[] = [
  { value: "CUSTOMER_CLOSED", label: "Đại lý đóng cửa" },
  { value: "CUSTOMER_REFUSED", label: "Đại lý từ chối nhận" },
  { value: "NO_CONTACT", label: "Không liên hệ được người nhận" },
  { value: "ADDRESS_NOT_FOUND", label: "Không tìm thấy địa chỉ" },
  { value: "OTHER", label: "Lý do khác" },
];
const maxFileBytes = 5 * 1024 * 1024;
const validFile = (file: File) => ["image/jpeg", "image/png"].includes(file.type) && file.size <= maxFileBytes;

export default function DeliveryConfirmation() {
  const [status, setStatus] = useState<DeliveryStatus>("DELIVERED");
  const [dispatchId, setDispatchId] = useState("");
  const [pendingDispatches, setPendingDispatches] = useState<PendingDispatchListResponse["data"]>([]);
  const [pendingDispatchesLoading, setPendingDispatchesLoading] = useState(false);
  const [pendingDispatchesError, setPendingDispatchesError] = useState("");
  const [showPendingDispatches, setShowPendingDispatches] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [note, setNote] = useState("");
  const [failureReason, setFailureReason] = useState<FailureReason>();
  const [returnWarehouseId, setReturnWarehouseId] = useState<number>();
  const [warehouses, setWarehouses] = useState<NonNullable<SelectProps["options"]>>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string }>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [proofPreviews, setProofPreviews] = useState<string[]>([]);
  const [existingConfirmation, setExistingConfirmation] = useState<StoredConfirmationResponse["data"]>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => proofPreviews.forEach((url) => URL.revokeObjectURL(url)), [proofPreviews]);

  const loadPendingDispatches = useCallback(async () => {
    setPendingDispatchesLoading(true);
    setPendingDispatchesError("");
    try {
      const token = getAuthToken();
      const response = await fetch("/api/v1/deliveries/pending-confirmations?limit=100", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Không tải được danh sách phiếu xuất đang chờ giao.");
      const body = await response.json() as PendingDispatchListResponse;
      setPendingDispatches(body.data);
    } catch (error) {
      setPendingDispatchesError(error instanceof Error ? error.message : "Không tải được danh sách phiếu xuất.");
    } finally {
      setPendingDispatchesLoading(false);
    }
  }, []);

  useEffect(() => { void loadPendingDispatches(); }, [loadPendingDispatches]);

  const loadWarehouses = async () => {
    if (warehouses.length) return;
    const token = getAuthToken();
    const response = await fetch("/api/v1/warehouses", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error("Không tải được danh sách kho.");
    const body = await response.json();
    const rows: unknown = Array.isArray(body) ? body : body.data;
    const options = Array.isArray(rows) ? rows.flatMap((row: unknown) => {
      if (!row || typeof row !== "object") return [];
      const id = Reflect.get(row, "id");
      const name = Reflect.get(row, "name");
      const active = Reflect.get(row, "is_active");
      return Number.isSafeInteger(id) && typeof name === "string" && active === true ? [{ value: id as number, label: name }] : [];
    }) : [];
    setWarehouses(options);
  };

  const loadSavedConfirmation = async (id: number, token: string | null) => {
    const response = await fetch(`/api/v1/deliveries/${id}/confirm-pod`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (response.status === 404) {
      setExistingConfirmation(undefined);
      setProofPreviews([]);
      setResult(undefined);
      return;
    }
    if (!response.ok) throw new Error("Không tải được kết quả giao hàng đã lưu.");
    const saved = await response.json() as StoredConfirmationResponse;
    setExistingConfirmation(saved.data);
    setResult({ type: "success", text: saved.data.deliveryStatus === "DELIVERED" ? `Phiếu xuất ${saved.data.dispatchId} đã giao thành công.` : `Phiếu xuất ${saved.data.dispatchId} đã ghi nhận giao thất bại.` });
    const previews = await Promise.all(saved.data.proofImages.map(async (url) => {
      try {
        const proofResponse = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        return proofResponse.ok ? URL.createObjectURL(await proofResponse.blob()) : "";
      } catch { return ""; }
    }));
    setProofPreviews(previews.filter(Boolean));
  };

  const chooseFiles = (list: FileList | File[]) => {
    const selected = Array.from(list);
    const invalid = selected.find((file) => !validFile(file));
    if (invalid) {
      setErrors((current) => ({ ...current, proofImages: `${invalid.name}: chỉ nhận ảnh JPG/PNG tối đa 5 MB mỗi ảnh.` }));
      return;
    }
    if (selected.length > 5) {
      setErrors((current) => ({ ...current, proofImages: "Chỉ tải lên tối đa 5 ảnh chứng từ." }));
      return;
    }
    setErrors((current) => ({ ...current, proofImages: "" }));
    setFiles(selected);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    const id = Number(dispatchId);
    if (!Number.isSafeInteger(id) || id <= 0) next.dispatchId = "Nhập mã phiếu xuất là số nguyên dương.";
    if (existingConfirmation?.dispatchId === id) next.dispatchId = "Phiếu xuất này đã có kết quả giao hàng.";
    if (status === "DELIVERED") {
      if (!receiverName.trim()) next.receiverName = "Nhập người nhận hàng.";
      if (!receivedDate || Number.isNaN(new Date(receivedDate).getTime())) next.receivedDate = "Chọn thời điểm giao hàng hợp lệ.";
      if (!files.length) next.proofImages = "Tải lên ít nhất một ảnh biên bản có chữ ký.";
    } else {
      if (!failureReason) next.failureReason = "Chọn lý do giao không thành công.";
      if (!returnWarehouseId) next.returnWarehouseId = "Chọn kho nhận lại hàng.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !validate()) return;
    setResult(undefined);
    const id = Number(dispatchId);
    const payload = new FormData();
    payload.set("deliveryStatus", status);
    payload.set("note", note.trim());
    if (status === "DELIVERED") {
      payload.set("receiverName", receiverName.trim());
      payload.set("receivedDate", new Date(receivedDate).toISOString());
      files.forEach((file) => payload.append("proofImages", file));
    } else {
      payload.set("failureReason", failureReason!);
      payload.set("returnWarehouseId", String(returnWarehouseId));
    }
    setBusy(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/v1/deliveries/${id}/confirm-pod`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: payload });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = body && typeof body === "object" ? Reflect.get(body, "detail") : undefined;
        throw new Error(typeof detail === "string" ? detail : "Không thể xác nhận kết quả giao hàng.");
      }
      const confirmation = body as DeliveryResponse;
      const text = confirmation.data.deliveryStatus === "DELIVERED"
        ? `Đã xác nhận giao thành công cho phiếu xuất ${confirmation.data.dispatchId}.`
        : `Đã ghi nhận giao thất bại. Hàng được nhập lại kho #${confirmation.data.returnWarehouseId}.`;
      setResult({ type: "success", text });
      setPendingDispatches((current) => current.filter((dispatch) => dispatch.dispatchId !== id));
      setExistingConfirmation(confirmation.data as StoredConfirmationResponse["data"]);
      message.success("Đã lưu kết quả giao hàng.");
      // Refresh proof URLs for the saved record. Failure here must not turn a successful POST into an error.
      void loadSavedConfirmation(id, token).catch(() => undefined);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Đã xảy ra lỗi.";
      setResult({ type: "error", text });
      message.error(text);
    } finally { setBusy(false); }
  };

  const reset = () => {
    setDispatchId(""); setReceiverName(""); setReceivedDate(""); setNote(""); setFailureReason(undefined);
    setReturnWarehouseId(undefined); setFiles([]); setErrors({}); setResult(undefined); setExistingConfirmation(undefined); setProofPreviews([]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const dispatchError = errors.dispatchId;
  const proofError = errors.proofImages;
  const matchingDispatches = pendingDispatches.filter((dispatch) =>
    !dispatchId || String(dispatch.dispatchId).includes(dispatchId) || String(dispatch.orderId).includes(dispatchId));

  return (
    <main className="delivery-page">
      <header className="delivery-page__heading">
        <div><span className="delivery-page__eyebrow">ĐIỀU PHỐI · PHIẾU GIAO HÀNG</span><Typography.Title level={2}>Xác nhận kết quả giao hàng</Typography.Title>
          <p>Ghi nhận kết quả giao, người nhận và chứng từ cho từng phiếu xuất.</p></div>
        <span className="delivery-page__secure"><CheckCircleFilled /> Dữ liệu được lưu theo phiếu xuất</span>
      </header>
      <Card className="delivery-card" bordered={false}>
        <form onSubmit={submit} noValidate>
          {result && <Alert className="delivery-result" type={result.type} showIcon message={result.text} />}
          {existingConfirmation && <div className="delivery-saved"><span className="delivery-saved__icon"><CheckCircleFilled /></span><div><strong>Đã có kết quả giao hàng</strong><span>Trạng thái: {existingConfirmation.deliveryStatus === "DELIVERED" ? "Giao thành công" : "Giao không thành công"}</span></div></div>}

          <section className="delivery-section">
            <div className="delivery-section__heading"><span className="delivery-section__number">01</span><div><h3>Thông tin giao hàng</h3><p>Chọn kết quả và nhập thông tin liên quan đến phiếu xuất.</p></div></div>
            <div className="delivery-field">
              <label htmlFor="dispatch-id">Mã phiếu xuất <span className="required-mark">*</span></label>
              <div className="dispatch-picker" onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShowPendingDispatches(false);
              }}>
                <Input id="dispatch-id" value={dispatchId} status={dispatchError ? "error" : undefined} aria-describedby={dispatchError ? "dispatch-id-error" : undefined} aria-haspopup="listbox" aria-expanded={showPendingDispatches} aria-controls={showPendingDispatches ? "pending-dispatch-options" : undefined} onFocus={() => setShowPendingDispatches(true)} onKeyDown={(event) => {
                  if (event.key === "Escape") setShowPendingDispatches(false);
                  if (event.key === "ArrowDown" && showPendingDispatches) {
                    event.preventDefault();
                    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".pending-dispatch-option")?.focus();
                  }
                }} onChange={(event) => {
                  setDispatchId(event.target.value); setExistingConfirmation(undefined); setResult(undefined); setProofPreviews([]); setErrors((old) => ({ ...old, dispatchId: "" }));
                }} onBlur={() => {
                  const id = Number(dispatchId);
                  if (Number.isSafeInteger(id) && id > 0) void loadSavedConfirmation(id, getAuthToken()).catch((error) => message.error(error.message));
                }} inputMode="numeric" placeholder="Nhập hoặc chọn phiếu xuất" required />
                {showPendingDispatches && <div className="pending-dispatch-menu">
                  <div className="pending-dispatch-menu__header"><strong>Phiếu xuất đang chờ giao</strong><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void loadPendingDispatches()} disabled={pendingDispatchesLoading} aria-label="Tải lại danh sách phiếu xuất"><ReloadOutlined /> Tải lại</button></div>
                  {pendingDispatchesLoading ? <div className="pending-dispatch-menu__empty">Đang tải danh sách…</div>
                    : pendingDispatchesError ? <div className="pending-dispatch-menu__error" role="alert">{pendingDispatchesError}</div>
                      : matchingDispatches.length ? <div id="pending-dispatch-options" role="listbox" aria-label="Phiếu xuất đang chờ xác nhận">{matchingDispatches.map((dispatch) => <button className="pending-dispatch-option" key={dispatch.dispatchId} type="button" role="option" aria-selected={dispatchId === String(dispatch.dispatchId)} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                        setDispatchId(String(dispatch.dispatchId)); setExistingConfirmation(undefined); setResult(undefined); setProofPreviews([]); setErrors((old) => ({ ...old, dispatchId: "" })); setShowPendingDispatches(false);
                      }}><strong>Phiếu xuất #{dispatch.dispatchId}</strong><span>Đơn hàng #{dispatch.orderId}</span></button>)}</div>
                        : <div className="pending-dispatch-menu__empty">{dispatchId ? "Không tìm thấy phiếu khớp với mã bạn nhập." : "Không có phiếu nào đang chờ xác nhận."}<small>Bạn vẫn có thể nhập ID phiếu xuất nếu đã biết.</small></div>}
                </div>}
              </div>
              {dispatchError && <span className="field-error" id="dispatch-id-error">{dispatchError}</span>}
            </div>
            <fieldset className="delivery-status"><legend>Kết quả giao <span className="required-mark">*</span></legend><Radio.Group value={status} onChange={(event) => {
              const nextStatus = event.target.value as DeliveryStatus; setStatus(nextStatus); setErrors({});
              if (nextStatus === "FAILED") void loadWarehouses().catch((error) => message.error(error.message));
            }}>
              <Radio value="DELIVERED"><span className="status-choice"><CheckCircleFilled /><span><strong>Giao thành công</strong><small>Đã bàn giao hàng cho người nhận</small></span></span></Radio>
              <Radio value="FAILED"><span className="status-choice status-choice--failed"><CloseCircleFilled /><span><strong>Giao không thành công</strong><small>Ghi nhận lý do và đưa hàng về kho</small></span></span></Radio>
            </Radio.Group></fieldset>

            {status === "DELIVERED" ? <div className="delivery-grid">
              <div className="delivery-field"><label htmlFor="receiver-name">Người nhận hàng <span className="required-mark">*</span></label><Input id="receiver-name" value={receiverName} status={errors.receiverName ? "error" : undefined} aria-describedby={errors.receiverName ? "receiver-name-error" : undefined} onChange={(event) => { setReceiverName(event.target.value); setErrors((old) => ({ ...old, receiverName: "" })); }} maxLength={150} placeholder="Nhập họ tên người nhận" required />{errors.receiverName && <span className="field-error" id="receiver-name-error">{errors.receiverName}</span>}</div>
              <div className="delivery-field"><label htmlFor="received-date">Thời điểm giao hàng <span className="required-mark">*</span></label><Input id="received-date" type="datetime-local" value={receivedDate} status={errors.receivedDate ? "error" : undefined} aria-describedby={errors.receivedDate ? "received-date-error" : undefined} onChange={(event) => { setReceivedDate(event.target.value); setErrors((old) => ({ ...old, receivedDate: "" })); }} required />{errors.receivedDate && <span className="field-error" id="received-date-error">{errors.receivedDate}</span>}</div>
            </div> : <div className="delivery-grid">
              <div className="delivery-field"><label htmlFor="failure-reason">Lý do giao không thành công <span className="required-mark">*</span></label><Select id="failure-reason" value={failureReason} status={errors.failureReason ? "error" : undefined} aria-describedby={errors.failureReason ? "failure-reason-error" : undefined} onChange={(value) => { setFailureReason(value); setErrors((old) => ({ ...old, failureReason: "" })); }} options={failureReasons} placeholder="Chọn lý do" />{errors.failureReason && <span className="field-error" id="failure-reason-error">{errors.failureReason}</span>}</div>
              <div className="delivery-field"><label htmlFor="return-warehouse">Kho nhận lại hàng <span className="required-mark">*</span></label><Select id="return-warehouse" value={returnWarehouseId} status={errors.returnWarehouseId ? "error" : undefined} aria-describedby={errors.returnWarehouseId ? "return-warehouse-error" : undefined} onChange={(value) => { setReturnWarehouseId(value); setErrors((old) => ({ ...old, returnWarehouseId: "" })); }} options={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))} placeholder="Chọn kho" />{errors.returnWarehouseId && <span className="field-error" id="return-warehouse-error">{errors.returnWarehouseId}</span>}</div>
              <Alert className="return-note" type="info" showIcon message="Hàng sẽ được ghi nhận nhập lại kho theo đúng lô xuất." />
            </div>}
          </section>

          <section className="delivery-section delivery-section--proof">
            <div className="delivery-section__heading"><span className="delivery-section__number">02</span><div><h3>{status === "DELIVERED" ? "Chứng từ giao hàng" : "Ghi chú bổ sung"}</h3><p>{status === "DELIVERED" ? "Tải ảnh biên bản có chữ ký để lưu cùng phiếu xuất." : "Thông tin thêm giúp đối soát kết quả giao."}</p></div></div>
            {status === "DELIVERED" && <div className={`proof-upload ${proofError ? "proof-upload--error" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFiles(event.dataTransfer.files); }}>
              <input ref={fileInput} className="visually-hidden" type="file" name="proofImages" accept="image/jpeg,image/png" multiple aria-label="Chọn ảnh biên bản giao hàng" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFiles(event.target.files ?? [])} />
              <span className="proof-upload__icon"><InboxOutlined /></span><strong>Ảnh biên bản có chữ ký <span className="required-mark">*</span></strong>
              <span className="proof-upload__hint">Kéo ảnh vào đây hoặc chọn từ thiết bị · JPG, PNG · tối đa 5 MB/ảnh, 5 ảnh</span>
              <Button htmlType="button" onClick={() => fileInput.current?.click()}>Chọn ảnh</Button>
              {!!files.length && <ul className="proof-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><FileImageOutlined /><span>{file.name}<small>{(file.size / 1024 / 1024).toFixed(2)} MB</small></span><button type="button" aria-label={`Xóa ${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><DeleteOutlined /></button></li>)}</ul>}
            </div>}
            {proofError && <span className="field-error" id="proof-images-error" role="alert">{proofError}</span>}
            {!!proofPreviews.length && <div className="saved-proofs"><strong>Ảnh chứng từ đã lưu</strong><div>{proofPreviews.map((url) => <AntImage key={url} src={url} width={120} alt="Ảnh chứng từ giao hàng đã lưu" />)}</div></div>}
            <div className="delivery-field delivery-note"><label htmlFor="delivery-note">Ghi chú <span className="optional-label">Không bắt buộc</span></label><Input.TextArea id="delivery-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Nhập thông tin bổ sung nếu cần" showCount /></div>
          </section>
          <footer className="delivery-actions"><Button htmlType="button" onClick={reset} disabled={busy}>Hủy</Button><Button type="primary" htmlType="submit" loading={busy} disabled={busy || !!existingConfirmation}>{busy ? "Đang lưu kết quả…" : "Xác nhận giao hàng"}</Button></footer>
        </form>
      </Card>
    </main>
  );
}
