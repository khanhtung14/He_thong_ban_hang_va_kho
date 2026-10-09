import React from "react";

export interface TerritoryItem {
  id: string;
  name: string;
  current: string;
  target: string;
  percentage: number;
  colorClass: string;
}

export interface ProductMarginItem {
  sku: string;
  name: string;
  revenue: number;
  margin: string;
  units_sold: number;
}

export interface TerritoryProgressProps {
  territories?: TerritoryItem[];
  area?: string;
  topSale?: {
    name: string;
    region: string;
    kpiPercentage: number;
  };
  productMargins?: ProductMarginItem[];
  onRewardTopSale?: () => void;
  loading?: boolean;
}

export const TerritoryProgress: React.FC<TerritoryProgressProps> = ({
  territories: _territories = [],
  topSale: _topSale,
  productMargins = [],
  onRewardTopSale: _onRewardTopSale,
  loading = false,
}) => {
  const formatMoney = (val: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(val);


  if (loading) {
    return (
      <section className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] animate-pulse">
        <div className="h-4 bg-slate-100 rounded w-44 mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-slate-50 rounded-lg"></div>
          <div className="h-10 bg-slate-50 rounded-lg"></div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">

      {/* 3. Top Margin Products (From Real API Data: /api/v1/reports/sales-margin) */}
      <section className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-50 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
            <h2 className="text-sm font-bold text-slate-800">
              Hiệu quả SKU sinh lời (Margin)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Từ Báo cáo Doanh số</span>
        </div>

        {productMargins.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {productMargins.map((p) => (
              <div key={p.sku} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold text-slate-800">{p.name}</div>
                  <div className="text-[11px] text-slate-400">{p.sku} · {p.units_sold} đơn vị bán</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900">{formatMoney(p.revenue)}</div>
                  <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                    Lãi {p.margin}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            Chưa có số liệu sản phẩm sinh lời từ báo cáo.
          </div>
        )}
      </section>
    </div>
  );
};

export default TerritoryProgress;
