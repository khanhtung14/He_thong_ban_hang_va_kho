import React, { useState } from "react";
import { createPriceList } from "../../api";

export interface CreatePriceListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newPriceList: any) => void;
}

export const CreatePriceListModal: React.FC<CreatePriceListModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [code, setCode] = useState("");
  const [customerGroup, setCustomerGroup] = useState("DEALER_LEVEL_1");
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [sku1Price, setSku1Price] = useState(480000);
  const [sku1Floor, setSku1Floor] = useState(450000);
  const [sku2Price, setSku2Price] = useState(240000);
  const [sku2Floor, setSku2Floor] = useState(220000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Vui lòng nhập mã bảng giá");
      return;
    }
    setError("");
    setSubmitting(true);

    const payload = {
      code: code.trim().toUpperCase(),
      customer_group: customerGroup,
      start_date: startDate,
      end_date: endDate,
      items: [
        { sku: "SKU-001", sale_price: Number(sku1Price), floor_price: Number(sku1Floor) },
        { sku: "SKU-002", sale_price: Number(sku2Price), floor_price: Number(sku2Floor) },
      ],
    };

    try {
      const created = await createPriceList(payload);
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối khi gửi yêu cầu.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              +
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Khai báo bảng giá mới (S2-10)
              </h3>
              <p className="text-xs text-slate-400">
                Áp dụng theo nhóm khách hàng & khoảng thời gian hiệu lực
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium border border-rose-100">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã bảng giá *
              </label>
              <input
                type="text"
                placeholder="VD: PL-DEALER1-Q4"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nhóm khách hàng áp dụng
              </label>
              <select
                value={customerGroup}
                onChange={(e) => setCustomerGroup(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
              >
                <option value="DEALER_LEVEL_1">Đại lý Cấp 1</option>
                <option value="DEALER_LEVEL_2">Đại lý Cấp 2</option>
                <option value="RETAIL">Khách lẻ</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày bắt đầu hiệu lực
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ngày kết thúc hiệu lực
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Price lines */}
          <div className="pt-2">
            <span className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Dòng giá sản phẩm (Giá bán & Giá sàn)
            </span>

            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              {/* Line 1: Red bull */}
              <div className="grid grid-cols-12 gap-2 items-center text-xs">
                <div className="col-span-5">
                  <strong className="block text-slate-800">SKU-001</strong>
                  <span className="text-[11px] text-slate-400">Red Bull 250ml</span>
                </div>
                <div className="col-span-4">
                  <label className="text-[10px] text-slate-500 block">Giá bán (₫)</label>
                  <input
                    type="number"
                    value={sku1Price}
                    onChange={(e) => setSku1Price(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-slate-500 block">Giá sàn (₫)</label>
                  <input
                    type="number"
                    value={sku1Floor}
                    onChange={(e) => setSku1Floor(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-rose-600 font-semibold"
                  />
                </div>
              </div>

              {/* Line 2: Highlands */}
              <div className="grid grid-cols-12 gap-2 items-center text-xs pt-2 border-t border-slate-200/60">
                <div className="col-span-5">
                  <strong className="block text-slate-800">SKU-002</strong>
                  <span className="text-[11px] text-slate-400">Highlands 235ml</span>
                </div>
                <div className="col-span-4">
                  <label className="text-[10px] text-slate-500 block">Giá bán (₫)</label>
                  <input
                    type="number"
                    value={sku2Price}
                    onChange={(e) => setSku2Price(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[10px] text-slate-500 block">Giá sàn (₫)</label>
                  <input
                    type="number"
                    value={sku2Floor}
                    onChange={(e) => setSku2Floor(Number(e.target.value))}
                    className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-rose-600 font-semibold"
                  />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 italic">
              * Quy tắc kinh doanh: Nhân viên bán dưới giá sàn sẽ bắt buộc phải gửi đơn qua Quản lý kinh doanh duyệt.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-600/20 transition-all"
            >
              {submitting ? "Đang lưu..." : "Lưu bảng giá nháp"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatePriceListModal;
