import React from "react";

export interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: any;
}

export const ExportReportModal: React.FC<ExportReportModalProps> = ({
  isOpen,
  onClose,
  reportData,
}) => {
  if (!isOpen) return null;

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(val);

  const handleDownloadCSV = () => {
    if (!reportData) return;
    const rows = [
      ["Bao cao Doanh so va Bien loi nhuan Gop - OMS"],
      ["Ky bao cao", reportData.period || "2026-Q3"],
      ["Tong doanh thu", reportData.total_revenue || 0],
      ["Tong gia von (COGS)", reportData.total_cogs || 0],
      ["Loi nhuan gop", reportData.gross_profit || 0],
      ["Bien loi nhuan", reportData.margin || "0%"],
      [],
      ["SKU", "Ten san pham", "So luong ban", "Doanh thu", "Gia von", "Bien loi nhuan"],
    ];

    if (Array.isArray(reportData.details)) {
      reportData.details.forEach((d: any) => {
        rows.push([d.sku, d.name, d.units_sold, d.revenue, d.cost_price, d.margin]);
      });
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Bao_cao_loi_nhuan_${reportData.period || "2026"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              📊
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Xuất báo cáo Doanh số & Biên lợi nhuận
              </h3>
              <p className="text-xs text-slate-400">
                Dữ liệu tài chính bảo mật dành riêng cho Quản lý kinh doanh
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

        {/* Content Preview */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block">Kỳ báo cáo:</span>
              <strong className="text-slate-800 text-sm">{reportData?.period || "—"}</strong>
            </div>
            <div>
              <span className="text-slate-400 block">Biên lợi nhuận gộp:</span>
              <strong className="text-emerald-700 text-sm font-bold">{reportData?.margin || "0%"}</strong>
            </div>
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-slate-400 block">Tổng doanh thu:</span>
              <strong className="text-slate-900 text-sm font-bold">
                {formatMoney(reportData?.total_revenue || 0)}
              </strong>
            </div>
            <div className="pt-2 border-t border-slate-200/60">
              <span className="text-slate-400 block">Lợi nhuận gộp:</span>
              <strong className="text-emerald-600 text-sm font-bold">
                {formatMoney(reportData?.gross_profit || 0)}
              </strong>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Chi tiết mặt hàng ({reportData?.details?.length || 0} SKUs):</span>
            <ul className="mt-2 space-y-1.5 max-h-36 overflow-y-auto">
              {reportData?.details?.map((d: any) => (
                <li key={d.sku} className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                  <span>{d.name} ({d.sku})</span>
                  <span className="font-semibold text-slate-800">{formatMoney(d.revenue)} · Lãi {d.margin}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Đóng
            </button>
            <button
              onClick={handleDownloadCSV}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Tải file Excel / CSV</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportReportModal;
