import { FormEvent, useState } from "react";

const styles = `
  * { box-sizing: border-box; }
  body { min-width: 320px; min-height: 100vh; margin: 0; background: #f8fafc; color: #1f2937; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .inventory-page { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
  .inventory-card { width: min(100%, 460px); padding: clamp(24px, 6vw, 40px); border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgb(15 23 42 / 8%); }
  .inventory-brand { margin: 0 0 8px; color: #2563eb; font-size: 14px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .inventory-card h1 { margin: 0; font-size: 26px; line-height: 1.25; }
  .inventory-subtitle { margin: 10px 0 24px; color: #6b7280; font-size: 14px; line-height: 1.5; }
  .inventory-field { display: grid; gap: 8px; margin-bottom: 18px; }
  .inventory-field label { font-size: 14px; font-weight: 600; }
  .inventory-input { width: 100%; min-height: 46px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; color: inherit; background: #fff; font: inherit; }
  .inventory-input:focus { outline: 3px solid #bfdbfe; border-color: #2563eb; }
  .inventory-select { appearance: none; background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 12px center; background-size: 16px; padding-right: 36px; cursor: pointer; }
  .inventory-error { margin: 0 0 18px; padding: 12px; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b; background: #fef2f2; font-size: 14px; line-height: 1.5; }
  .inventory-result { margin: 0 0 20px; padding: 16px; border: 1px solid #bbf7d0; border-radius: 10px; background: #f0fdf4; color: #166534; }
  .result-title { margin: 0 0 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #15803d; }
  .result-value { font-size: 20px; font-weight: 700; margin: 6px 0; color: #14532d; }
  .result-details { font-size: 13px; color: #166534; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .inventory-submit { width: 100%; min-height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 8px; color: #fff; background: #2563eb; font: inherit; font-weight: 700; cursor: pointer; transition: background .15s ease; }
  .inventory-submit:hover:not(:disabled) { background: #1d4ed8; }
  .inventory-submit:focus-visible { outline: 3px solid #93c5fd; outline-offset: 3px; }
  .inventory-submit:disabled { cursor: wait; opacity: .7; }
  .inventory-spinner { width: 17px; height: 17px; border: 2px solid rgb(255 255 255 / 45%); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 360px) { .inventory-page { padding: 16px 12px; } .inventory-card { padding: 22px 18px; } }
`;

type TransactionResponse = {
    id: number;
    product_id: number;
    unit_name: string;
    input_quantity: number;
    conversion_rate_snapshot: number;
    base_quantity: number;
};

type ApiError = {
    detail?: string | Array<{ msg?: string }>;
};

export default function InventoryForm() {
    const [productId, setProductId] = useState<string>("");
    const [unitName, setUnitName] = useState<string>("Lon");
    const [inputQuantity, setInputQuantity] = useState<string>("");
    const [baseQuantity, setBaseQuantity] = useState<number | null>(null);
    const [transaction, setTransaction] = useState<TransactionResponse | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string>("");

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const parsedProductId = parseInt(productId, 10);
        const parsedQuantity = parseFloat(inputQuantity);

        if (!productId || isNaN(parsedProductId) || parsedProductId <= 0) {
            setError("Vui lòng nhập ID sản phẩm hợp lệ (số nguyên dương).");
            return;
        }

        if (!unitName) {
            setError("Vui lòng chọn đơn vị tính.");
            return;
        }

        if (!inputQuantity || isNaN(parsedQuantity)) {
            setError("Vui lòng nhập số lượng hợp lệ.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch("http://127.0.0.1:8000/inventory/transaction", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    product_id: parsedProductId,
                    unit_name: unitName,
                    input_quantity: parsedQuantity,
                }),
            });

            if (response.ok) {
                const data = (await response.json()) as TransactionResponse;
                // Cập nhật state base_quantity và dữ liệu giao dịch từ API trả về
                setBaseQuantity(data.base_quantity);
                setTransaction(data);
                setError("");
                return;
            }

            const errData = (await response.json().catch(() => ({}))) as ApiError;
            if (typeof errData.detail === "string") {
                setError(errData.detail);
            } else if (Array.isArray(errData.detail) && errData.detail[0]?.msg) {
                setError(errData.detail[0].msg);
            } else {
                setError("Không thể lưu giao dịch kho. Vui lòng thử lại.");
            }
        } catch {
            setError("Không thể kết nối đến máy chủ API (http://127.0.0.1:8000). Vui lòng kiểm tra lại dịch vụ backend.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <style>{styles}</style>
            <main className="inventory-page">
                <section className="inventory-card" aria-labelledby="inventory-title">
                    <p className="inventory-brand">OMS · Quản lý Kho</p>
                    <h1 id="inventory-title">Nhập xuất kho</h1>
                    <p className="inventory-subtitle">Nhập thông tin sản phẩm và quy đổi số lượng tồn kho tự động.</p>

                    <form onSubmit={handleSubmit}>
                        <div className="inventory-field">
                            <label htmlFor="product_id">Mã sản phẩm (Product ID)</label>
                            <input
                                className="inventory-input"
                                id="product_id"
                                name="product_id"
                                type="number"
                                min="1"
                                placeholder="Nhập ID sản phẩm (vd: 1)"
                                value={productId}
                                onChange={(e) => setProductId(e.target.value)}
                                required
                            />
                        </div>

                        <div className="inventory-field">
                            <label htmlFor="unit_name">Đơn vị tính (Unit Name)</label>
                            <select
                                className="inventory-input inventory-select"
                                id="unit_name"
                                name="unit_name"
                                value={unitName}
                                onChange={(e) => setUnitName(e.target.value)}
                                required
                            >
                                <option value="Lon">Lon</option>
                                <option value="Lốc">Lốc</option>
                                <option value="Thùng">Thùng</option>
                            </select>
                        </div>

                        <div className="inventory-field">
                            <label htmlFor="input_quantity">Số lượng nhập/xuất (Input Quantity)</label>
                            <input
                                className="inventory-input"
                                id="input_quantity"
                                name="input_quantity"
                                type="number"
                                step="any"
                                placeholder="Nhập số lượng (vd: 10)"
                                value={inputQuantity}
                                onChange={(e) => setInputQuantity(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <p className="inventory-error" role="alert">
                                {error}
                            </p>
                        )}

                        {baseQuantity !== null && (
                            <div className="inventory-result" role="status">
                                <p className="result-title">Kết quả quy đổi tồn kho</p>
                                <div className="result-value">
                                    Số lượng chuẩn (base_quantity): <span>{baseQuantity}</span>
                                </div>
                                {transaction && (
                                    <div className="result-details">
                                        <span>Mã giao dịch: #{transaction.id}</span>
                                        <span>·</span>
                                        <span>Tỷ lệ quy đổi: {transaction.conversion_rate_snapshot}</span>
                                        <span>·</span>
                                        <span>Đơn vị: {transaction.unit_name}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        <button className="inventory-submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting && <span className="inventory-spinner" aria-hidden="true" />}
                            {isSubmitting ? "Đang xử lý giao dịch…" : "Lưu giao dịch kho"}
                        </button>
                    </form>

                    <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: "14px" }}>
                        <a href="/login" style={{ color: "#2563eb", textDecoration: "none" }}>Đăng nhập</a>
                        <span style={{ margin: "0 8px", color: "#9ca3af" }}>·</span>
                        <a href="/change-password" style={{ color: "#2563eb", textDecoration: "none" }}>Đổi mật khẩu</a>
                    </p>
                </section>
            </main>
        </>
    );
}
