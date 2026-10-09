import React, { useState } from "react";

export interface HeaderProps {
  fullName?: string;
  roleName?: string;
  avatarUrl?: string;
  notificationCount?: number;
  onProfileClick?: () => void;
  onLogout?: () => void;
}

export const HeaderTailwind: React.FC<HeaderProps> = ({
  fullName = "Lê Quản Lý Kinh Doanh",
  roleName = "Quản lý kinh doanh",
  avatarUrl,
  notificationCount = 3,
  onProfileClick,
  onLogout,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);

  // Avatar initials if no image
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .slice(-2)
    .join("")
    .toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-slate-100 px-6 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
      {/* Left side: System status badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full border border-emerald-100">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          {/* <span>Hệ thống trực tuyến · {roleName}</span> */}
        </div>
      </div>

      {/* Right side: Notifications & User profile & Logout */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Notification bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Thông báo"
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors relative cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {notificationCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                {notificationCount}
              </span>
            )}
          </button>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 py-3 z-50 animate-fade-in">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Thông báo cần xử lý
                </span>
                <span className="text-xs text-blue-600 font-medium">Hệ thống</span>
              </div>
              <div className="p-4 text-center text-xs text-slate-400">
                {notificationCount > 0 ? `Bạn có ${notificationCount} yêu cầu đang chờ xử lý` : "Không có thông báo mới"}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-[1px] h-8 bg-slate-200" />

        {/* User profile capsule */}
        <button
          onClick={onProfileClick}
          className="flex items-center gap-3 p-1 pl-2 pr-3 rounded-full hover:bg-slate-100/80 transition-colors group cursor-pointer"
        >
          {/* Avatar image or fallback badge */}
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-900 font-bold text-xs flex items-center justify-center ring-2 ring-yellow-400/20 shadow-sm">
              {initials}
            </div>
          )}

          {/* User info */}
          <div className="text-left hidden sm:block">
            <div className="text-sm font-semibold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">
              {fullName}
            </div>
            <div className="text-xs text-slate-500 leading-tight">
              {roleName}
            </div>
          </div>
        </button>

        {/* Logout button */}
        {/* {onLogout && (
          <button
            onClick={onLogout}
            title="Đăng xuất"
            aria-label="Đăng xuất khỏi hệ thống"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/60 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden md:inline">Đăng xuất</span>
          </button>
        )} */}
      </div>
    </header>
  );
};

export default HeaderTailwind;
