import React from "react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  isLoading: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  isLoading,
}) => {
  if (total <= 0) return null;

  const startRecord = Math.min((page - 1) * pageSize + 1, total);
  const endRecord = Math.min(page * pageSize, total);

  // Generate page numbers to show around current page
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      if (start > 2) {
        pages.push("...");
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <nav className="pagination-bar" aria-label="Điều hướng phân trang">
      <div className="pagination-info">
        Hiển thị <strong>{startRecord}</strong> - <strong>{endRecord}</strong> trong tổng số{" "}
        <strong>{total}</strong> tài khoản
      </div>

      <div className="pagination-controls">
        <div className="page-size-selector">
          <label htmlFor="page-size-select" className="page-size-label">
            Số dòng:
          </label>
          <select
            id="page-size-select"
            className="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={isLoading}
          >
            <option value={10}>10 dòng/trang</option>
            <option value={20}>20 dòng/trang (mặc định)</option>
            <option value={50}>50 dòng/trang</option>
          </select>
        </div>

        <ul className="pagination-list">
          <li>
            <button
              type="button"
              className="page-btn page-nav-btn"
              onClick={() => onPageChange(1)}
              disabled={page <= 1 || isLoading}
              title="Trang đầu"
              aria-label="Trang đầu"
            >
              «
            </button>
          </li>
          <li>
            <button
              type="button"
              className="page-btn page-nav-btn"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || isLoading}
              title="Trang trước"
              aria-label="Trang trước"
            >
              ‹
            </button>
          </li>

          {getPageNumbers().map((p, idx) => {
            if (typeof p === "string") {
              return (
                <li key={`ellipsis-${idx}`} className="page-ellipsis" aria-hidden="true">
                  ...
                </li>
              );
            }

            const isCurrent = p === page;
            return (
              <li key={p}>
                <button
                  type="button"
                  className={`page-btn ${isCurrent ? "page-current" : ""}`}
                  onClick={() => onPageChange(p)}
                  disabled={isLoading || isCurrent}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {p}
                </button>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              className="page-btn page-nav-btn"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
              title="Trang sau"
              aria-label="Trang sau"
            >
              ›
            </button>
          </li>
          <li>
            <button
              type="button"
              className="page-btn page-nav-btn"
              onClick={() => onPageChange(totalPages)}
              disabled={page >= totalPages || isLoading}
              title="Trang cuối"
              aria-label="Trang cuối"
            >
              »
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
};
