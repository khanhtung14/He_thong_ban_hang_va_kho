/**
 * DISTRICARE CRM - Data Store & State Management
 * Kiến trúc Reactive Observer Pattern, tự động đồng bộ LocalStorage, xử lý Audit Log & Nghiệp vụ chuyển giao
 */

import { INITIAL_EMPLOYEES, INITIAL_AGENCIES, INITIAL_HANDOVERS, INITIAL_AUDIT_LOGS } from './data.js';

const STORAGE_KEYS = {
  EMPLOYEES: 'districare_employees_v1',
  AGENCIES: 'districare_agencies_v1',
  HANDOVERS: 'districare_handovers_v1',
  AUDIT_LOGS: 'districare_audit_logs_v1',
  CURRENT_USER_ID: 'districare_current_user_id_v1'
};

class Store {
  constructor() {
    this.listeners = new Set();
    this.employees = [];
    this.agencies = [];
    this.handovers = [];
    this.auditLogs = [];
    this.currentUserId = 'NV001'; // Default: Quản lý Nguyễn Hồng Vĩnh
    this.init();
  }

  init() {
    try {
      const storedEmployees = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      const storedAgencies = localStorage.getItem(STORAGE_KEYS.AGENCIES);
      const storedHandovers = localStorage.getItem(STORAGE_KEYS.HANDOVERS);
      const storedAuditLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      const storedUserId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);

      this.employees = storedEmployees ? JSON.parse(storedEmployees) : [...INITIAL_EMPLOYEES];
      this.agencies = storedAgencies ? JSON.parse(storedAgencies) : [...INITIAL_AGENCIES];
      this.handovers = storedHandovers ? JSON.parse(storedHandovers) : [...INITIAL_HANDOVERS];
      this.auditLogs = storedAuditLogs ? JSON.parse(storedAuditLogs) : [...INITIAL_AUDIT_LOGS];

      if (storedUserId && this.employees.some(e => e.id === storedUserId)) {
        this.currentUserId = storedUserId;
      } else {
        this.currentUserId = 'NV001';
      }

      this.saveToStorage();
    } catch (err) {
      console.warn('Lỗi đọc LocalStorage, khởi tạo dữ liệu mặc định:', err);
      this.resetToDefault();
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(this.employees));
      localStorage.setItem(STORAGE_KEYS.AGENCIES, JSON.stringify(this.agencies));
      localStorage.setItem(STORAGE_KEYS.HANDOVERS, JSON.stringify(this.handovers));
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs));
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, this.currentUserId);
    } catch (err) {
      console.error('Không thể lưu LocalStorage:', err);
    }
  }

  resetToDefault() {
    this.employees = JSON.parse(JSON.stringify(INITIAL_EMPLOYEES));
    this.agencies = JSON.parse(JSON.stringify(INITIAL_AGENCIES));
    this.handovers = JSON.parse(JSON.stringify(INITIAL_HANDOVERS));
    this.auditLogs = JSON.parse(JSON.stringify(INITIAL_AUDIT_LOGS));
    this.currentUserId = 'NV001';
    this.saveToStorage();
    this.notify({ type: 'RESET_DATA' });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event) {
    this.saveToStorage();
    this.listeners.forEach(fn => {
      try {
        fn(event, this);
      } catch (err) {
        console.error('Lỗi listener trong Store notify:', err);
      }
    });
  }

  // --- USER CONTEXT & RBAC ---
  getCurrentUser() {
    const user = this.employees.find(e => e.id === this.currentUserId);
    return user || this.employees[0];
  }

  setCurrentUser(userId) {
    const found = this.employees.find(e => e.id === userId);
    if (!found) return false;
    this.currentUserId = userId;
    this.notify({ type: 'USER_SWITCHED', user: found });
    return true;
  }

  isManager() {
    const u = this.getCurrentUser();
    return u && u.role === 'MANAGER';
  }

  // --- GETTERS ---
  getEmployees() {
    return [...this.employees];
  }

  getEmployeeById(id) {
    return this.employees.find(e => e.id === id) || null;
  }

  getAgencies() {
    return [...this.agencies];
  }

  getAgencyById(id) {
    return this.agencies.find(a => a.id === id) || null;
  }

  getHandovers() {
    return [...this.handovers].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getAuditLogs() {
    return [...this.auditLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Acceptance Criterion 1 & 2:
   * Lọc danh sách đại lý theo phân quyền (RBAC / Row-Level Security) và các tiêu chí tìm kiếm
   */
  getVisibleAgencies(filters = {}) {
    const currentUser = this.getCurrentUser();
    let list = [...this.agencies];

    // QUY TẮC BẢO MẬT HÀNG (Row-Level Security):
    // Nhân viên kinh doanh chỉ nhìn thấy đại lý mình phụ trách chính!
    if (currentUser.role === 'SALES_REP') {
      list = list.filter(a => a.assignedSalesId === currentUser.id);
    }

    // Bộ lọc nghiệp vụ
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.shortName.toLowerCase().includes(q) ||
        a.province.toLowerCase().includes(q) ||
        (a.taxId && a.taxId.includes(q))
      );
    }

    if (filters.region && filters.region !== 'ALL') {
      list = list.filter(a => a.region === filters.region);
    }

    if (filters.tier && filters.tier !== 'ALL') {
      list = list.filter(a => a.tier === filters.tier);
    }

    if (filters.assigneeId && filters.assigneeId !== 'ALL') {
      if (filters.assigneeId === 'UNASSIGNED') {
        list = list.filter(a => !a.assignedSalesId);
      } else {
        list = list.filter(a => a.assignedSalesId === filters.assigneeId);
      }
    }

    return list;
  }

  // --- ACTIONS (NGHIỆP VỤ) ---

  /**
   * Acceptance Criterion 1:
   * Gán một nhân viên phụ trách chính cho mỗi đại lý
   */
  assignAgencyPrimaryRep({ agencyId, employeeId, notes = '' }) {
    const agency = this.agencies.find(a => a.id === agencyId);
    if (!agency) {
      throw new Error(`Không tìm thấy đại lý có mã ID: ${agencyId}`);
    }

    const oldRep = agency.assignedSalesId ? this.getEmployeeById(agency.assignedSalesId) : null;
    const newRep = employeeId ? this.getEmployeeById(employeeId) : null;
    const actor = this.getCurrentUser();

    // Cập nhật
    agency.assignedSalesId = employeeId || null;
    agency.status = employeeId ? 'ACTIVE' : 'PENDING_ASSIGN';
    agency.lastContactDate = new Date().toISOString().split('T')[0];

    // Ghi nhật ký Audit Log
    const auditRecord = {
      id: 'LOG' + Date.now(),
      timestamp: new Date().toISOString(),
      actorName: actor.name,
      actorRole: actor.roleTitle,
      action: 'SINGLE_ASSIGN',
      targetAgencyCode: agency.code,
      targetAgencyName: agency.name,
      oldAssignee: oldRep ? oldRep.name : 'Chưa phân công',
      newAssignee: newRep ? newRep.name : 'Bỏ gán (Chưa phân công)',
      notes: notes || `Phân công nhân viên phụ trách chính trực tiếp bởi ${actor.name}`
    };

    this.auditLogs.unshift(auditRecord);
    this.notify({
      type: 'AGENCY_ASSIGNED',
      agency,
      oldRep,
      newRep,
      auditRecord
    });

    return { agency, oldRep, newRep };
  }

  /**
   * Acceptance Criterion 3:
   * Chuyển giao địa bàn hàng loạt khi nhân viên nghỉ, có ghi lịch sử đầy đủ
   */
  executeBulkHandover({
    fromEmployeeId,
    toEmployeeId,
    agencyIds,
    reason,
    reasonText,
    effectiveDate,
    notes
  }) {
    if (!fromEmployeeId || !toEmployeeId) {
      throw new Error('Vui lòng chọn nhân viên bàn giao và nhân viên tiếp nhận hợp lệ.');
    }
    if (fromEmployeeId === toEmployeeId) {
      throw new Error('Nhân viên tiếp nhận không được trùng với nhân viên bàn giao!');
    }
    if (!agencyIds || agencyIds.length === 0) {
      throw new Error('Danh sách đại lý chuyển giao không được để trống.');
    }

    const fromEmp = this.getEmployeeById(fromEmployeeId);
    const toEmp = this.getEmployeeById(toEmployeeId);
    if (!fromEmp || !toEmp) {
      throw new Error('Không tìm thấy thông tin nhân sự trong hệ thống.');
    }

    const actor = this.getCurrentUser();
    const transferredAgencies = [];

    // Cập nhật từng đại lý
    agencyIds.forEach(id => {
      const agency = this.agencies.find(a => a.id === id);
      if (agency) {
        agency.assignedSalesId = toEmployeeId;
        agency.status = 'ACTIVE';
        transferredAgencies.push({
          id: agency.id,
          code: agency.code,
          name: agency.name,
          region: agency.region,
          province: agency.province,
          tier: agency.tier,
          monthlyRevenue: agency.monthlyRevenue,
          debtBalance: agency.debtBalance
        });
      }
    });

    // Nếu nhân sự cũ đang trong trạng thái RESIGNING (xin nghỉ) và đã chuyển hết đại lý:
    const remainingAgencies = this.agencies.filter(a => a.assignedSalesId === fromEmployeeId);
    if (fromEmp.status === 'RESIGNING' && remainingAgencies.length === 0) {
      fromEmp.status = 'HANDED_OVER'; // Đã hoàn thành bàn giao
      fromEmp.notes = (fromEmp.notes || '') + ' [Đã hoàn tất bàn giao địa bàn toàn bộ]';
    }

    // Tạo mã phiếu bàn giao chuẩn
    const yearMonth = new Date().toISOString().slice(0, 7).replace('-', '');
    const handoverIndex = String(this.handovers.length + 1).padStart(3, '0');
    const handoverCode = `HO-${yearMonth}-${handoverIndex}`;

    const newHandover = {
      id: 'HO' + Date.now(),
      code: handoverCode,
      timestamp: new Date().toISOString(),
      effectiveDate: effectiveDate || new Date().toISOString().split('T')[0],
      transferredById: actor.id,
      transferredByName: actor.name,
      fromEmployeeId: fromEmp.id,
      fromEmployeeName: fromEmp.name,
      fromEmployeeRole: fromEmp.roleTitle,
      toEmployeeId: toEmp.id,
      toEmployeeName: toEmp.name,
      toEmployeeRole: toEmp.roleTitle,
      agencyIds: [...agencyIds],
      agenciesSummary: transferredAgencies,
      totalRevenue: transferredAgencies.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0),
      totalDebt: transferredAgencies.reduce((sum, a) => sum + (a.debtBalance || 0), 0),
      reason: reason || 'RESIGNATION',
      reasonText: reasonText || 'Bàn giao chuyển giao địa bàn',
      notes: notes || 'Hoàn tất bàn giao hồ sơ khách hàng, công nợ và chỉ tiêu doanh số.',
      status: 'COMPLETED'
    };

    this.handovers.unshift(newHandover);

    // Ghi Audit Log cho hệ thống
    const auditRecord = {
      id: 'LOG' + Date.now(),
      timestamp: new Date().toISOString(),
      actorName: actor.name,
      actorRole: actor.roleTitle,
      action: 'BULK_HANDOVER',
      code: handoverCode,
      notes: `Chuyển giao hàng loạt ${transferredAgencies.length} đại lý từ [${fromEmp.name}] sang [${toEmp.name}]. Lý do: ${newHandover.reasonText}`
    };

    this.auditLogs.unshift(auditRecord);

    this.notify({
      type: 'BULK_HANDOVER_EXECUTED',
      handover: newHandover,
      transferredAgencies
    });

    return newHandover;
  }

  // --- STATS & METRICS ---
  getDashboardMetrics() {
    const user = this.getCurrentUser();
    const isMgr = user.role === 'MANAGER';

    const visibleAgencies = this.getVisibleAgencies();
    const totalCount = visibleAgencies.length;
    const allAgencies = this.agencies;

    if (isMgr) {
      const assignedCount = allAgencies.filter(a => a.assignedSalesId).length;
      const unassignedCount = allAgencies.filter(a => !a.assignedSalesId).length;
      const totalRevenue = allAgencies.reduce((acc, a) => acc + (a.monthlyRevenue || 0), 0);
      const totalDebt = allAgencies.reduce((acc, a) => acc + (a.debtBalance || 0), 0);
      const activeSalesReps = this.employees.filter(e => e.role === 'SALES_REP' && e.status === 'ACTIVE').length;
      const resigningReps = this.employees.filter(e => e.status === 'RESIGNING').length;

      return {
        isManager: true,
        totalAgencies: allAgencies.length,
        assignedAgencies: assignedCount,
        unassignedAgencies: unassignedCount,
        assignedPercentage: Math.round((assignedCount / allAgencies.length) * 100),
        totalRevenue,
        totalDebt,
        activeSalesReps,
        resigningReps,
        totalHandovers: this.handovers.length
      };
    } else {
      // Dành cho nhân viên kinh doanh
      const myRevenue = visibleAgencies.reduce((acc, a) => acc + (a.monthlyRevenue || 0), 0);
      const myDebt = visibleAgencies.reduce((acc, a) => acc + (a.debtBalance || 0), 0);
      const targetRevenue = user.targetRevenue || 10000000000;
      const targetProgress = Math.min(100, Math.round((myRevenue / targetRevenue) * 100));

      return {
        isManager: false,
        myAgenciesCount: visibleAgencies.length,
        myRevenue,
        myDebt,
        targetRevenue,
        targetProgress,
        diamondAgencies: visibleAgencies.filter(a => a.tier === 'DIAMOND').length,
        goldAgencies: visibleAgencies.filter(a => a.tier === 'GOLD').length
      };
    }
  }

  // Phân tích tải công việc nhân viên (Workload Distribution)
  getSalesWorkload() {
    const salesReps = this.employees.filter(e => e.role === 'SALES_REP');
    return salesReps.map(rep => {
      const repsAgencies = this.agencies.filter(a => a.assignedSalesId === rep.id);
      const totalRev = repsAgencies.reduce((s, a) => s + (a.monthlyRevenue || 0), 0);
      return {
        id: rep.id,
        name: rep.name,
        avatar: rep.avatar,
        status: rep.status,
        region: rep.region,
        agencyCount: repsAgencies.length,
        totalRevenue: totalRev,
        isResigning: rep.status === 'RESIGNING'
      };
    });
  }
}

export const store = new Store();
