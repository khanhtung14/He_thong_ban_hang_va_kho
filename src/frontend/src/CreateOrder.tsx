import { useEffect, useState, FormEvent } from "react";
import { authenticatedFetch } from "./session";
import type { CustomerItem } from "./CustomerManagement";

export interface ProductItem {
  sku: string;
  name: string;
  sale_price: number;
  stock_available?: number;
  unit?: string;
}

export interface CreateOrderProps {
  products: ProductItem[];
  onOrderCreated?: (order: any) => void;
  onCancel?: () => void;
}

export default function CreateOrder({ products, onOrderCreated, onCancel }: CreateOrderProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "">("");
  const [selectedProductSku, setSelectedProductSku] = useState<string>(products[0]?.sku || "SKU-001");
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(products[0]?.sale_price || 50000);
  const [note, setNote] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const prod = products.find((p) => p.sku === selectedProductSku);
    if (prod) {
      setUnitPrice(prod.sale_price);
    }
  }, [selectedProductSku, products]);

  async function loadCustomers() {
    setLoadingCustomers(true);
    try {
      const res = await authenticatedFetch("/api/v1/customers");
      if (res.ok) {
        const data: CustomerItem[] = await res.json();
        setCustomers(data);
        if (data.length > 0) {
          setSelectedCustomerId(data[0].id);
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoadingCustomers(false);
    }
  }

  const selectedCustomer = customers.find((c) => c.id === Number(selectedCustomerId));
  const isCustomerLocked = Boolean(selectedCustomer?.is_locked);

  const selectedProduct = products.find((p) => p.sku === selectedProductSku);
  const totalAmount = quantity * unitPrice;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCustomerId) {
      setErrorMessage("Vui lòng chọn đại lý đặt hàng.");
      return;
    }

    if (isCustomerLocked) {
      setErrorMessage(`Đại lý ${selectedCustomer?.name} đang bị KHÓA GIAO DỊCH! Không thể tạo đơn mới.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload = {
        customer_id: Number(selectedCustomerId),
        items: [
          {
            sku: selectedProductSku,
            product_name: selectedProduct?.name || selectedProductSku,
            quantity: Number(quantity),
            unit_price: Number(unitPrice),
          },
        ],
        note: note.trim() || null,
      };

      const res = await authenticatedFetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Backend returns detail if blocked
        throw new Error(data.detail || "Không thể tạo đơn hàng.");
      }

      setSuccessMessage(`Tạo đơn hàng ${data.order_code} thành công!`);
      if (onOrderCreated) {
        onOrderCreated(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Đã xảy ra lỗi khi tạo đơn hàng.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="workspace-panel" style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <div className="workspace-page-heading" style={{ marginBottom: 20 }}>
        <div>
          <h2>Tạo Đơn Hàng Mới (SCRUM-85 Validation)</h2>
          <p>Tạo đơn bán buôn cho đại lý. Hệ thống tự động kiểm tra trạng thái khóa của đại lý trước khi lập đơn.</p>
        </div>
      </div>

      {/* ALERT KHÓA ĐẠI LÝ NỔI BẬT NẾU ĐẠI LÝ ĐANG BỊ KHÓA */}
      {isCustomerLocked && selectedCustomer && (
        <div
          role="alert"
          style={{
            backgroundColor: "#fef2f2",
            border: "2px solid #ef4444",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.12)",
          }}
        >
          <span style={{ fontSize: 26, lineHeight: 1 }}>⛔</span>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: "0 0 6px", color: "#991b1b", fontSize: 16, fontWeight: 700 }}>
              CẢNH BÁO: ĐẠI LÝ ĐANG BỊ KHÓA GIAO DỊCH!
            </h4>
            <p style={{ margin: "0 0 6px", color: "#7f1d1d", fontSize: 13, lineHeight: 1.5 }}>
              Đại lý <strong>{selectedCustomer.name}</strong> (Mã: <code>{selectedCustomer.code}</code>) hiện đang bị{" "}
              <strong>Khóa giao dịch</strong> bởi Kế toán công nợ do dấu hiệu mất khả năng thanh toán hoặc quá hạn công nợ.
            </p>
            <div
              style={{
                backgroundColor: "#fee2e2",
                padding: "8px 12px",
                borderRadius: 6,
                color: "#b91c1c",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Lý do khóa: {selectedCustomer.lock_reason || "Không xác định"}
            </div>
            <p style={{ margin: "8px 0 0", color: "#991b1b", fontSize: 12, fontStyle: "italic" }}>
              Nút "Tạo đơn hàng" đã bị vô hiệu hóa (disabled). Vui lòng liên hệ Kế toán công nợ để mở khóa trước khi tiếp tục.
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="workspace-alert is-error" style={{ marginBottom: 16 }}>
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="workspace-alert is-success" style={{ marginBottom: 16 }}>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
            Chọn Đại lý đặt hàng <span style={{ color: "red" }}>*</span>
          </label>
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
            required
            disabled={loadingCustomers}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: isCustomerLocked ? "2px solid #ef4444" : "1px solid #d1d5db",
              fontSize: 14,
              backgroundColor: isCustomerLocked ? "#fff5f5" : "#fff",
            }}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code}) {c.is_locked ? " [⛔ ĐÃ KHÓA]" : ""}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Sản phẩm</label>
            <select
              value={selectedProductSku}
              onChange={(e) => setSelectedProductSku(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
            >
              {products.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Số lượng</label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
            />
          </div>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Đơn giá (VNĐ)</label>
            <input
              type="number"
              min={0}
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14 }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Ghi chú đơn hàng</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú giao hàng, điều kiện thanh toán..."
            rows={2}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }}
          />
        </div>

        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "#f8fafc",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            border: "1px solid #e2e8f0",
          }}
        >
          <span style={{ fontSize: 14, color: "#64748b" }}>Tổng giá trị tạm tính:</span>
          <strong style={{ fontSize: 20, color: "#2563eb" }}>
            {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(totalAmount)}
          </strong>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
          {onCancel && (
            <button type="button" className="workspace-button is-ghost" onClick={onCancel}>
              Hủy
            </button>
          )}
          {/* NÚT SUBMIT: BỊ DISABLE NẾU ĐẠI LÝ BỊ KHÓA */}
          <button
            type="submit"
            className="workspace-button"
            disabled={isSubmitting || isCustomerLocked}
            style={{
              minWidth: 160,
              backgroundColor: isCustomerLocked ? "#9ca3af" : "#2563eb",
              borderColor: isCustomerLocked ? "#9ca3af" : "#2563eb",
              cursor: isCustomerLocked ? "not-allowed" : "pointer",
            }}
          >
            {isSubmitting ? "Đang gửi đơn..." : isCustomerLocked ? "⛔ Đại lý bị khóa" : "Tạo đơn hàng"}
          </button>
        </div>
      </form>
    </div>
  );
}
