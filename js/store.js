/**
 * Reactive State Management Store for Enterprise Order System
 * Manages Filter state, Pagination, Sorting, RBAC scope, and Live KPI calculations
 */

import { ORDERS, AGENTS, USERS } from './mockData.js';
import { rbacService } from './rbac.js';

class OrderStore {
  constructor() {
    this.allOrders = [...ORDERS];
    
    // Bộ lọc đa tiêu chí theo yêu cầu Jira SCRUM-86
    this.filters = {
      search: '',
      status: 'all',
      regionId: 'all',
      agentId: 'all',
      salesRepId: 'all',
      datePreset: 'all', // 'all', 'today', '7days', '30days', 'this_month', 'custom'
      startDate: '',
      endDate: ''
    };

    // Sắp xếp
    this.sort = {
      field: 'createdAt',
      direction: 'desc' // 'desc' | 'asc'
    };

    // Phân trang
    this.pagination = {
      page: 1,
      pageSize: 10
    };

    // Danh sách chọn hàng loạt
    this.selectedOrderIds = new Set();

    // Event listeners
    this.listeners = [];

    // Lắng nghe thay đổi User từ RBAC để re-filter
    rbacService.onUserChange(() => {
      // Khi đổi sang nhân viên, reset agentId về 'all' hoặc đại lý hợp lệ của họ
      const allowedAgentIds = rbacService.getAllowedAgentIds();
      if (!rbacService.isManager()) {
        if (this.filters.agentId !== 'all' && !allowedAgentIds.includes(this.filters.agentId)) {
          this.filters.agentId = 'all';
        }
        // Khóa salesRepId về chính nhân viên đó
        this.filters.salesRepId = rbacService.getCurrentUser().id;
      } else {
        this.filters.salesRepId = 'all';
      }
      this.pagination.page = 1;
      this.selectedOrderIds.clear();
      this.notify();
    });
  }

  subscribe(callback) {
    this.listeners.push(callback);
    // Notify immediately on subscribe
    callback(this.getState());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach(cb => cb(state));
  }

  setFilter(key, value) {
    this.filters[key] = value;
    this.pagination.page = 1; // Reset về trang 1 khi lọc
    this.notify();
  }

  setFilters(partialFilters) {
    this.filters = { ...this.filters, ...partialFilters };
    this.pagination.page = 1;
    this.notify();
  }

  resetFilters() {
    this.filters = {
      search: '',
      status: 'all',
      regionId: 'all',
      agentId: 'all',
      salesRepId: rbacService.isManager() ? 'all' : rbacService.getCurrentUser().id,
      datePreset: 'all',
      startDate: '',
      endDate: ''
    };
    this.pagination.page = 1;
    this.notify();
  }

  setSort(field) {
    if (this.sort.field === field) {
      this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sort.field = field;
      this.sort.direction = 'desc';
    }
    this.notify();
  }

  setPage(page) {
    this.pagination.page = page;
    this.notify();
  }

  setPageSize(pageSize) {
    this.pagination.pageSize = Number(pageSize);
    this.pagination.page = 1;
    this.notify();
  }

  toggleSelectOrder(orderId) {
    if (this.selectedOrderIds.has(orderId)) {
      this.selectedOrderIds.delete(orderId);
    } else {
      this.selectedOrderIds.add(orderId);
    }
    this.notify();
  }

  toggleSelectAllOnPage(pageOrderIds) {
    const allSelected = pageOrderIds.every(id => this.selectedOrderIds.has(id));
    if (allSelected) {
      pageOrderIds.forEach(id => this.selectedOrderIds.delete(id));
    } else {
      pageOrderIds.forEach(id => this.selectedOrderIds.add(id));
    }
    this.notify();
  }

  clearSelection() {
    this.selectedOrderIds.clear();
    this.notify();
  }

  updateOrderStatus(orderId, newStatus) {
    const order = this.allOrders.find(o => o.id === orderId);
    if (order) {
      order.status = newStatus;
      this.notify();
    }
  }

  batchUpdateStatus(orderIds, newStatus) {
    this.allOrders.forEach(o => {
      if (orderIds.includes(o.id)) {
        o.status = newStatus;
      }
    });
    this.selectedOrderIds.clear();
    this.notify();
  }

  /**
   * Tính toán bộ kết quả đang lọc (Filtered Orders) & Dữ liệu tổng hợp (KPIs)
   */
  getState() {
    // 1. Phân quyền RBAC trước tiên: Nhân viên kinh doanh chỉ thấy đơn thuộc đại lý phụ trách
    const accessibleOrders = rbacService.filterAccessibleOrders(this.allOrders);

    // 2. Lọc theo các tiêu chí giao diện
    const filteredOrders = accessibleOrders.filter(order => {
      // Tìm kiếm từ khóa (Mã đơn, Tên KH, Số ĐT, Địa chỉ)
      if (this.filters.search) {
        const q = this.filters.search.toLowerCase().trim();
        const matchId = order.id.toLowerCase().includes(q);
        const matchCustomer = order.customer.name.toLowerCase().includes(q);
        const matchPhone = order.customer.phone.toLowerCase().includes(q);
        const matchAddress = order.customer.address.toLowerCase().includes(q);
        const matchNotes = (order.notes || '').toLowerCase().includes(q);
        if (!matchId && !matchCustomer && !matchPhone && !matchAddress && !matchNotes) {
          return false;
        }
      }

      // Trạng thái
      if (this.filters.status !== 'all' && order.status !== this.filters.status) {
        return false;
      }

      // Khu vực
      if (this.filters.regionId !== 'all' && order.regionId !== this.filters.regionId) {
        return false;
      }

      // Đại lý
      if (this.filters.agentId !== 'all' && order.agentId !== this.filters.agentId) {
        return false;
      }

      // Nhân viên kinh doanh
      if (this.filters.salesRepId !== 'all' && order.salesRepId !== this.filters.salesRepId) {
        return false;
      }

      // Khoảng thời gian
      if (this.filters.datePreset !== 'all') {
        const orderDate = new Date(order.createdAt);
        const now = new Date('2026-10-17T12:00:00'); // Mốc hiện tại đồng bộ dữ liệu mẫu

        if (this.filters.datePreset === 'today') {
          const isToday = orderDate.toISOString().slice(0, 10) === '2026-10-17';
          if (!isToday) return false;
        } else if (this.filters.datePreset === '7days') {
          const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < past7 || orderDate > now) return false;
        } else if (this.filters.datePreset === '30days') {
          const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (orderDate < past30 || orderDate > now) return false;
        } else if (this.filters.datePreset === 'this_month') {
          const currentYearMonth = '2026-10';
          if (!order.createdAt.startsWith(currentYearMonth)) return false;
        } else if (this.filters.datePreset === 'custom') {
          if (this.filters.startDate) {
            const start = new Date(this.filters.startDate + 'T00:00:00');
            if (orderDate < start) return false;
          }
          if (this.filters.endDate) {
            const end = new Date(this.filters.endDate + 'T23:59:59');
            if (orderDate > end) return false;
          }
        }
      }

      return true;
    });

    // 3. Sắp xếp (Sorting)
    const sortedOrders = [...filteredOrders].sort((a, b) => {
      let valA, valB;
      if (this.sort.field === 'totalAmount') {
        valA = a.totalAmount;
        valB = b.totalAmount;
      } else if (this.sort.field === 'createdAt') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      } else if (this.sort.field === 'id') {
        valA = a.id;
        valB = b.id;
      } else if (this.sort.field === 'customerName') {
        valA = a.customer.name;
        valB = b.customer.name;
      } else if (this.sort.field === 'status') {
        valA = a.status;
        valB = b.status;
      } else {
        valA = a.createdAt;
        valB = b.createdAt;
      }

      if (valA < valB) return this.sort.direction === 'asc' ? -1 : 1;
      if (valA > valB) return this.sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    // 4. Tính toán KPIs kết quả lọc (Hiển thị tổng tiền tập kết quả đang lọc)
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.totalAmount : 0), 0);
    const grossTotalAmount = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const count = filteredOrders.length;
    const aov = count > 0 ? Math.round(totalRevenue / (filteredOrders.filter(o => o.status !== 'cancelled').length || 1)) : 0;
    
    const statusCounts = {
      pending: filteredOrders.filter(o => o.status === 'pending').length,
      processing: filteredOrders.filter(o => o.status === 'processing').length,
      shipping: filteredOrders.filter(o => o.status === 'shipping').length,
      completed: filteredOrders.filter(o => o.status === 'completed').length,
      cancelled: filteredOrders.filter(o => o.status === 'cancelled').length,
    };

    const completedRate = count > 0 ? Math.round((statusCounts.completed / count) * 100) : 0;

    // 5. Phân trang
    const totalPages = Math.max(1, Math.ceil(sortedOrders.length / this.pagination.pageSize));
    const currentPage = Math.min(this.pagination.page, totalPages);
    const startIndex = (currentPage - 1) * this.pagination.pageSize;
    const paginatedOrders = sortedOrders.slice(startIndex, startIndex + this.pagination.pageSize);

    return {
      allOrdersCount: this.allOrders.length,
      accessibleOrdersCount: accessibleOrders.length,
      filteredOrders,
      sortedOrders,
      paginatedOrders,
      totalCount: sortedOrders.length,
      totalPages,
      currentPage,
      pageSize: this.pagination.pageSize,
      sort: this.sort,
      filters: this.filters,
      selectedOrderIds: Array.from(this.selectedOrderIds),
      kpi: {
        totalRevenue,        // Tổng doanh thu thực tế (loại đơn hủy)
        grossTotalAmount,    // Tổng tiền của toàn bộ tập lọc
        count,
        aov,                 // Giá trị trung bình đơn
        statusCounts,
        completedRate
      },
      currentUser: rbacService.getCurrentUser(),
      isManager: rbacService.isManager(),
      allowedAgents: rbacService.getAllowedAgents()
    };
  }
}

export const orderStore = new OrderStore();
