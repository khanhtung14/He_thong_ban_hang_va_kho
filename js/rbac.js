/**
 * RBAC (Role-Based Access Control) Module
 * Đáp ứng yêu cầu nghiệp vụ:
 * "Nhân viên kinh doanh chỉ thấy đơn của đại lý mình phụ trách"
 * "Quản lý kinh doanh xem toàn bộ tình hình bán hàng công ty"
 */

import { USERS, AGENTS } from './mockData.js';

class RBACService {
  constructor() {
    // Mặc định đăng nhập với vai trò Quản lý kinh doanh để thấy toàn bộ màn hình
    this.currentUser = USERS[0];
    this.listeners = [];
  }

  getCurrentUser() {
    return this.currentUser;
  }

  isManager() {
    return this.currentUser.role === 'manager';
  }

  setCurrentUserById(userId) {
    const user = USERS.find(u => u.id === userId);
    if (user) {
      this.currentUser = user;
      this.notifyListeners();
    }
  }

  /**
   * Lấy danh sách ID các đại lý mà user hiện tại được phép truy cập
   */
  getAllowedAgentIds() {
    if (this.isManager()) {
      return AGENTS.map(a => a.id);
    }
    return this.currentUser.assignedAgents || [];
  }

  /**
   * Lấy danh sách đối tượng đại lý hợp lệ cho user hiện tại
   */
  getAllowedAgents() {
    const allowedIds = this.getAllowedAgentIds();
    return AGENTS.filter(a => allowedIds.includes(a.id));
  }

  /**
   * Kiểm tra một đơn hàng có thuộc quyền xem của user hiện tại không
   */
  canAccessOrder(order) {
    if (this.isManager()) return true;
    const allowedIds = this.getAllowedAgentIds();
    return allowedIds.includes(order.agentId);
  }

  /**
   * Lọc tập đơn hàng theo quyền RBAC cơ bản trước khi áp dụng các bộ lọc UI
   */
  filterAccessibleOrders(orders) {
    if (this.isManager()) return orders;
    const allowedIds = new Set(this.getAllowedAgentIds());
    return orders.filter(order => allowedIds.has(order.agentId));
  }

  onUserChange(callback) {
    this.listeners.push(callback);
  }

  notifyListeners() {
    this.listeners.forEach(cb => cb(this.currentUser));
  }
}

export const rbacService = new RBACService();
