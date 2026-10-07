import React from "react";

export interface StatCardProps {
  title: string;
  value: string;
  target?: string;
  badgeText?: string;
  badgeTone?: "green" | "blue" | "amber" | "rose" | "purple";
  subText?: string;
  tagText?: string;
  iconType?: "trend-up" | "shield" | "clock" | "alert";
  isUrgent?: boolean;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  target,
  badgeText,
  badgeTone = "blue",
  subText,
  tagText,
  iconType = "trend-up",
  isUrgent = false,
  loading = false,
}) => {
  if (loading) {
    return (
      <article className="bg-white rounded-2xl p-5 border border-slate-100/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] animate-pulse">
        <div className="flex items-center justify-between mb-3">
          <div className="h-3.5 bg-slate-100 rounded w-24"></div>
          <div className="w-8 h-8 rounded-full bg-slate-100"></div>
        </div>
        <div className="h-8 bg-slate-100 rounded w-28 mb-3"></div>
        <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
          <div className="h-3 bg-slate-100 rounded w-20"></div>
          <div className="h-3 bg-slate-100 rounded w-12"></div>
        </div>
      </article>
    );
  }
  const renderIcon = () => {
    switch (iconType) {
      case "trend-up":
        return (
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        );
      case "shield":
        return (
          <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
        );
      case "clock":
        return (
          <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case "alert":
        return (
          <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
    }
  };

  const getBadgeClasses = (tone: string) => {
    switch (tone) {
      case "green":
        return "bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold";
      case "amber":
        return "bg-amber-50 text-amber-700 border border-amber-100 font-semibold";
      case "rose":
        return "bg-rose-50 text-rose-700 border border-rose-100 font-semibold";
      case "purple":
        return "bg-purple-50 text-purple-700 border border-purple-100 font-semibold";
      case "blue":
      default:
        return "bg-blue-50 text-blue-700 border border-blue-100 font-semibold";
    }
  };

  return (
    <article
      className={`bg-white rounded-2xl p-5 border transition-all duration-200 hover:shadow-md ${
        isUrgent
          ? "border-rose-100 hover:border-rose-200 shadow-xs"
          : "border-slate-100/90 hover:border-slate-200 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]"
      }`}
    >
      {/* Header: Title and icon */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-semibold ${
            isUrgent ? "text-rose-600" : "text-slate-500"
          }`}
        >
          {title}
        </span>
        {renderIcon()}
      </div>

      {/* Main value display */}
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className={`text-2xl font-extrabold tracking-tight ${
            isUrgent ? "text-rose-600" : "text-slate-900"
          }`}
        >
          {value}
        </span>
        {target && (
          <span className="text-xs font-medium text-slate-400">
            {target}
          </span>
        )}
      </div>

      {/* Footer details & tags */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-50 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          {badgeText && (
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] ${getBadgeClasses(
                badgeTone
              )}`}
            >
              {badgeText}
            </span>
          )}
          {subText && (
            <span className="text-[11px] text-slate-500">{subText}</span>
          )}
        </div>

        {tagText && (
          <span className="text-[11px] font-semibold text-blue-600 bg-blue-50/80 px-2 py-0.5 rounded">
            {tagText}
          </span>
        )}
      </div>
    </article>
  );
};

export default StatCard;
