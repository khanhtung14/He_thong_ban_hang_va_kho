/**
 * Main Application Orchestrator
 * Khởi tạo giao diện, liên kết State, RBAC, Bộ lọc, Bảng dữ liệu, Biểu đồ và Toasts
 */

import { USERS, AGENTS } from './mockData.js';
import { rbacService } from './rbac.js';
import { orderStore } from './store.js';
import { renderKPISummary } from './kpi.js';
import { setupFilterBar } from './filters.js';
import { setupOrderTable } from './table.js';
import { renderAnalyticsCharts } from './charts.js';
import { setupOrderDetailModal } from './modal.js';
import { exportOrdersToCsv } from './export.js';

// Khởi tạo Toast System toàn cục
window.showToast = function(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type} animate-slide-left`;
  
  const icons = {
    success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    warning: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-message">${message}</div>
    <button class="toast-close">✕</button>
  `;

  container.appendChild(toast);

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Khởi tạo modal chi tiết
  const orderModal = setupOrderDetailModal();

  // 2. Setup Filter Bar
  const filterContainer = document.getElementById('filter-bar-container');
  if (filterContainer) {
    setupFilterBar(filterContainer);
  }

  // 3. Setup Order Table
  const tableContainer = document.getElementById('order-table-container');
  if (tableContainer) {
    setupOrderTable(tableContainer, (order) => {
      orderModal.open(order);
    });
  }

  // 4. Header RBAC User Selector
  const userSelect = document.getElementById('rbac-user-select');
  if (userSelect) {
    userSelect.addEventListener('change', (e) => {
      const selectedUserId = e.target.value;
      rbacService.setCurrentUserById(selectedUserId);
      const user = rbacService.getCurrentUser();
      
      if (user.role === 'manager') {
        window.showToast(`Đã chuyển sang vai trò: Quản lý kinh doanh (Toàn quyền công ty)`, 'info');
      } else {
        const agentNames = user.assignedAgents.map(id => AGENTS.find(a => a.id === id)?.name).join(', ');
        window.showToast(`Đã chuyển sang vai trò: ${user.name} - Giới hạn dữ liệu đại lý: ${agentNames}`, 'warning');
      }
    });
  }

  // 5. Nút Bật/Tắt Biểu đồ phân tích
  const toggleChartsBtn = document.getElementById('toggle-charts-btn');
  const chartsSection = document.getElementById('analytics-section');
  if (toggleChartsBtn && chartsSection) {
    toggleChartsBtn.addEventListener('click', () => {
      const isHidden = chartsSection.classList.toggle('hidden');
      toggleChartsBtn.innerHTML = isHidden 
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Mở biểu đồ phân tích`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg> Thu gọn biểu đồ`;
      
      if (!isHidden) {
        renderAnalyticsCharts(orderStore.getState());
      }
    });
  }

  // 6. Nút Xuất Excel toàn bộ tập kết quả lọc
  const exportAllBtn = document.getElementById('export-all-btn');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', () => {
      const state = orderStore.getState();
      const filename = `bao-cao-kinh-doanh-${new Date().toISOString().slice(0, 10)}.csv`;
      exportOrdersToCsv(state.sortedOrders, filename);
    });
  }

  // 7. Subscribe cập nhật KPI Summary, RBAC Alert Banner & Charts
  const kpiContainer = document.getElementById('kpi-summary-container');
  const rbacBanner = document.getElementById('rbac-banner');
  const activeUserAvatar = document.getElementById('active-user-avatar');
  const activeUserName = document.getElementById('active-user-name');
  const activeUserRole = document.getElementById('active-user-role');

  orderStore.subscribe((state) => {
    // Cập nhật KPIs
    if (kpiContainer) {
      renderKPISummary(kpiContainer, state);
    }

    // Cập nhật Biểu đồ
    if (chartsSection && !chartsSection.classList.contains('hidden')) {
      renderAnalyticsCharts(state);
    }

    // Cập nhật Header Profile
    if (activeUserAvatar) activeUserAvatar.src = state.currentUser.avatar;
    if (activeUserName) activeUserName.textContent = state.currentUser.name;
    if (activeUserRole) activeUserRole.textContent = state.currentUser.roleTitle;

    // Cập nhật RBAC Security Banner
    if (rbacBanner) {
      if (!state.isManager) {
        const assignedNames = state.allowedAgents.map(a => `<span class="rbac-agent-chip">${a.name}</span>`).join(' ');
        rbacBanner.innerHTML = `
          <div class="rbac-banner-inner">
            <div class="rbac-badge-pulse">
              <span class="pulse-dot"></span>
              QUY CHẾ PHÂN QUYỀN BẢO MẬT (RBAC)
            </div>
            <div class="rbac-banner-text">
              Bạn đang đăng nhập với vai trò <strong>Nhân viên kinh doanh (${state.currentUser.name})</strong>. Hệ thống tự động giới hạn chỉ hiển thị số liệu và đơn hàng của các đại lý bạn trực tiếp quản lý: ${assignedNames}.
            </div>
          </div>
        `;
        rbacBanner.classList.remove('hidden');
      } else {
        rbacBanner.classList.add('hidden');
      }
    }
  });

  // Chào mừng mở ứng dụng
  setTimeout(() => {
    window.showToast('Hệ thống Quản lý Bán hàng & Phân phối Toàn công ty đã sẵn sàng.', 'info');
  }, 600);
});
