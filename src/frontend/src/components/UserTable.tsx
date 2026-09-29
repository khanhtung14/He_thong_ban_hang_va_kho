import React from "react";
import { AccountStatus, Role, User } from "../types/user";

interface UserTableProps {
  users: User[];
  startIndex: number;
  isLoading: boolean;
  onEditUser: (user: User) => void;
  onToggleStatus: (user: User) => void;
  togglingUserId: number | null;
}

export const UserTable: React.FC<UserTableProps> = ({
  users,
  startIndex,
  isLoading,
  onEditUser,
  onToggleStatus,
  togglingUserId,
}) => {
  const getStatusBadge = (status: AccountStatus) => {
    switch (status) {
      case "ACTIVE":
        return <span className="status-badge badge-active">Hoạt động</span>;
      case "LOCKED":
        return <span className="status-badge badge-locked">Tạm khóa</span>;
      case "PENDING_ACTIVATION":
        return <span className="status-badge badge-pending">Chờ kích hoạt</span>;
      case "DISABLED":
        return <span className="status-badge badge-disabled">Vô hiệu hóa</span>;
      default:
        return <span className="status-badge badge-disabled">{status}</span>;
    }
  };

  const getRoleBadges = (roles: Role[]) => {
    if (!roles || roles.length === 0) {
      return <span className="role-badge role-badge-default">Chưa phân vai trò</span>;
    }
    return (
      <div className="role-badges-wrap">
        {roles.map((r) => (
          <span key={r.id || r.code} className="role-badge" title={r.description || r.name}>
            {r.name || r.code}
          </span>
        ))}
      </div>
    );
  };

  const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return new Intl.DateTimeFormat("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="table-responsive-container">
      <table className="user-table" aria-label="Bảng danh sách tài khoản người dùng">
        <thead>
          <tr>
            <th scope="col" className="col-stt">STT</th>
            <th scope="col">Tên tài khoản</th>
            <th scope="col">Họ và tên</th>
            <th scope="col">Email</th>
            <th scope="col">Số điện thoại</th>
            <th scope="col">Vai trò</th>
            <th scope="col" className="col-status">Trạng thái</th>
            <th scope="col">Ngày tạo</th>
            <th scope="col" className="col-actions">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user, idx) => {
            const isToggling = togglingUserId === user.id;
            const isLocked = user.status === "LOCKED";

            return (
              <tr key={user.id} className={isLocked ? "row-locked" : ""}>
                <td className="col-stt text-muted">{startIndex + idx}</td>
                <td className="cell-username">
                  <span className="font-semibold text-primary">{user.username}</span>
                </td>
                <td className="cell-name">{user.full_name}</td>
                <td className="cell-email">
                  <a href={`mailto:${user.email}`} className="email-link">
                    {user.email}
                  </a>
                </td>
                <td className="cell-phone">{user.phone || <span className="text-muted">—</span>}</td>
                <td className="cell-roles">{getRoleBadges(user.roles)}</td>
                <td className="col-status">{getStatusBadge(user.status)}</td>
                <td className="cell-date text-muted">{formatDate(user.created_at)}</td>
                <td className="col-actions">
                  <div className="action-buttons-group">
                    <button
                      type="button"
                      className="btn-action btn-edit"
                      onClick={() => onEditUser(user)}
                      disabled={isLoading || isToggling}
                      title={`Chỉnh sửa tài khoản ${user.username}`}
                      aria-label={`Chỉnh sửa tài khoản ${user.username}`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        width="15"
                        height="15"
                        aria-hidden="true"
                      >
                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.882l-3.154 1.262a.5.5 0 01-.65-.65z" />
                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                      </svg>
                      <span>Sửa</span>
                    </button>

                    <button
                      type="button"
                      className={`btn-action ${isLocked ? "btn-unlock" : "btn-lock"}`}
                      onClick={() => onToggleStatus(user)}
                      disabled={isLoading || isToggling}
                      title={
                        isLocked
                          ? `Mở khóa tài khoản ${user.username}`
                          : `Tạm khóa tài khoản ${user.username}`
                      }
                      aria-label={
                        isLocked
                          ? `Mở khóa tài khoản ${user.username}`
                          : `Tạm khóa tài khoản ${user.username}`
                      }
                    >
                      {isToggling ? (
                        <span className="mini-spinner" aria-hidden="true" />
                      ) : isLocked ? (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          width="15"
                          height="15"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M14.5 9V6a4.5 4.5 0 00-9 0v3h-1A1.5 1.5 0 003 10.5v6A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5v-6A1.5 1.5 0 0015.5 9h-1zm-6-3a2.5 2.5 0 015 0v3h-5V6zm1.5 7.75a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          width="15"
                          height="15"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                      <span>{isLocked ? "Mở khóa" : "Khóa"}</span>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
