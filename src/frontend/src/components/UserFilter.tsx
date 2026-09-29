import React, { FormEvent } from "react";
import { ROLE_OPTIONS, STATUS_OPTIONS } from "../types/user";

interface UserFilterProps {
  search: string;
  role: string;
  status: string;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApplySearch: () => void;
  onClearFilters: () => void;
  isLoading: boolean;
}

export const UserFilter: React.FC<UserFilterProps> = ({
  search,
  role,
  status,
  onSearchChange,
  onRoleChange,
  onStatusChange,
  onApplySearch,
  onClearFilters,
  isLoading,
}) => {
  const hasActiveFilters = Boolean(search.trim() || role || status);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onApplySearch();
  };

  return (
    <section className="filter-card" aria-label="Bộ lọc và tìm kiếm người dùng">
      <form onSubmit={handleSubmit} className="filter-form">
        <div className="filter-search-group">
          <label htmlFor="search-input" className="sr-only">
            Tìm kiếm theo họ tên, tên đăng nhập, số điện thoại
          </label>
          <div className="search-input-wrap">
            <svg
              className="search-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              id="search-input"
              type="text"
              className="filter-input search-input"
              placeholder="Tìm theo họ tên, tên đăng nhập, số điện thoại..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              disabled={isLoading}
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                title="Xóa từ khóa"
                onClick={() => {
                  onSearchChange("");
                  onApplySearch();
                }}
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="filter-btn btn-search"
            disabled={isLoading}
          >
            Tìm kiếm
          </button>
        </div>

        <div className="filter-selects-group">
          <div className="filter-control">
            <label htmlFor="role-select" className="filter-label">
              Vai trò:
            </label>
            <select
              id="role-select"
              className="filter-select"
              value={role}
              onChange={(e) => onRoleChange(e.target.value)}
              disabled={isLoading}
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-control">
            <label htmlFor="status-select" className="filter-label">
              Trạng thái:
            </label>
            <select
              id="status-select"
              className="filter-select"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
              disabled={isLoading}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="filter-btn btn-clear"
              onClick={onClearFilters}
              disabled={isLoading}
              title="Đặt lại toàn bộ điều kiện lọc và tìm kiếm"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Xóa bộ lọc
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
