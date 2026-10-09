import React from "react";

export interface ApprovalItem {
  id: string;
  type: "price_list" | "below_floor" | "credit_limit";
  typeLabel: string;
  badgeBg: string;
  badgeText: string;
  title: string;
  reason: string;
  amount: string;
  code: string;
  assigneeLabel: string;
  assigneeName: string;
  approveActionLabel: string;
  priceListId?: number;
}

export interface ApprovalListProps {
  items: ApprovalItem[];
  onApprove: (item: ApprovalItem) => void;
  onReject: (item: ApprovalItem) => void;
  onViewAll?: () => void;
  loading?: boolean;
}

export const ApprovalList: React.FC<ApprovalListProps> = ({
  items,
  onApprove,
  onReject,
  onViewAll,
  loading = false,
}) => {
  return (
    <section className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-50 mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
          <h2 className="text-base font-bold text-slate-800">
            Hộp thư phê duyệt hạn mức & đơn ngoại lệ
          </h2>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
        >
          Xem tất cả ({items.length.toString().padStart(2, "0")})
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-xl bg-slate-50 border border-slate-100 h-28"></div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="py-12 text-center text-slate-400 text-sm">
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Hiện tại không có yêu cầu phê duyệt nào cần xử lý.
        </div>
      )}

      {/* Approval Items List */}
      {!loading && (
        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all flex flex-col justify-between gap-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  {/* Badge square icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${item.badgeBg} ${item.badgeText}`}
                  >
                    {item.typeLabel}
                  </div>

                  {/* Title & Reason */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-xs text-amber-700 bg-amber-50/60 px-2 py-0.5 rounded mt-1.5 inline-block font-medium border border-amber-100/50">
                      Lý do: {item.reason}
                    </p>
                  </div>
                </div>

                {/* Amount & Code */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-extrabold text-slate-900 tracking-tight">
                    {item.amount}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {item.code}
                  </div>
                </div>
              </div>

              {/* Footer action bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-50">
                <div className="text-xs text-slate-500">
                  <span>{item.assigneeLabel}: </span>
                  <strong className="text-slate-700 font-semibold">
                    {item.assigneeName}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onReject(item)}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors"
                  >
                    Từ chối
                  </button>
                  <button
                    onClick={() => onApprove(item)}
                    className="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 transition-all"
                  >
                    {item.approveActionLabel}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default ApprovalList;
