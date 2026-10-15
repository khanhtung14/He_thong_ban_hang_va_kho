/**
 * DISTRICARE CRM - Phân Quyền & Kiểm Soát Truy Cập Dữ Liệu (RBAC & Row-Level Security)
 * Phục vụ tiêu chí:
 * 1. Quản lý kinh doanh: Toàn quyền cấu hình, phân công, chuyển giao, xem mọi đại lý & log.
 * 2. Nhân viên kinh doanh: Bảo mật hàng (RLS) - chỉ nhìn thấy đại lý mình phụ trách.
 */

export const ROLES = {
  MANAGER: 'MANAGER',
  SALES_REP: 'SALES_REP'
};

export const PERMISSIONS = {
  VIEW_ALL_AGENCIES: 'VIEW_ALL_AGENCIES',
  ASSIGN_PRIMARY_REP: 'ASSIGN_PRIMARY_REP',
  EXECUTE_BULK_HANDOVER: 'EXECUTE_BULK_HANDOVER',
  VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
  VIEW_WORKLOAD_ANALYTICS: 'VIEW_WORKLOAD_ANALYTICS',
  EXPORT_HANDOVER_DOCUMENT: 'EXPORT_HANDOVER_DOCUMENT',
  UPDATE_AGENCY_NOTES: 'UPDATE_AGENCY_NOTES'
};

const ROLE_PERMISSIONS = {
  [ROLES.MANAGER]: [
    PERMISSIONS.VIEW_ALL_AGENCIES,
    PERMISSIONS.ASSIGN_PRIMARY_REP,
    PERMISSIONS.EXECUTE_BULK_HANDOVER,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.VIEW_WORKLOAD_ANALYTICS,
    PERMISSIONS.EXPORT_HANDOVER_DOCUMENT,
    PERMISSIONS.UPDATE_AGENCY_NOTES
  ],
  [ROLES.SALES_REP]: [
    PERMISSIONS.EXPORT_HANDOVER_DOCUMENT,
    PERMISSIONS.UPDATE_AGENCY_NOTES
  ]
};

export class RBACService {
  static hasPermission(user, permission) {
    if (!user || !user.role) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes(permission);
  }

  static getSecurityContextDescription(user) {
    if (user.role === ROLES.MANAGER) {
      return {
        mode: 'MANAGER_ALL_ACCESS',
        badgeClass: 'badge-manager',
        title: 'Toàn Quyền Quản Lý (Full Access)',
        description: 'Bạn đang đăng nhập với tư cách Quản lý kinh doanh. Bạn có toàn quyền xem tất cả đại lý toàn quốc, gán nhân viên phụ trách chính, thực hiện chuyển giao hàng loạt và xem nhật ký kiểm toán.',
        icon: 'shield-check'
      };
    } else {
      return {
        mode: 'ROW_LEVEL_SECURITY',
        badgeClass: 'badge-rep',
        title: 'Bảo Mật Hàng (Row-Level Security Active)',
        description: `Bạn đang xem với quyền Nhân viên kinh doanh [${user.name}]. Hệ thống tự động cô lập dữ liệu (Data Isolation): Chỉ hiển thị các đại lý do chính bạn phụ trách chính. Các tính năng điều chuyển cấu hình quản trị được ẩn đi.`,
        icon: 'lock-closed'
      };
    }
  }
}
