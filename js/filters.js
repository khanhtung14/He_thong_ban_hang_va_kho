/**
 * Smart Multi-Dimensional Filter Bar Component
 * Đáp ứng đầy đủ các yêu cầu lọc:
 * 1. Trạng thái (Status)
 * 2. Đại lý (Agent)
 * 3. Nhân viên (Sales Rep)
 * 4. Khu vực (Region)
 * 5. Khoảng thời gian (Date Range)
 * Và tuân thủ RBAC cho Nhân viên kinh doanh.
 */

import { REGIONS, AGENTS, USERS, ORDER_STATUSES } from './mockData.js';
import { orderStore } from './store.js';
import { rbacService } from './rbac.js';

export function setupFilterBar(container) {
  let debounceTimeout = null;

  function render(state) {
    const { filters, isManager, currentUser, allowedAgents, accessibleOrdersCount, kpi } = state;

    // Tính số lượng đơn theo từng trạng thái trong tập dữ liệu quyền hạn hiện tại
    const accessibleOrders = rbacService.filterAccessibleOrders(orderStore.allOrders);
    const countByStatus = {
      all: accessibleOrders.length,
      pending: accessibleOrders.filter(o => o.status === 'pending').length,
      processing: accessibleOrders.filter(o => o.status === 'processing').length,
      shipping: accessibleOrders.filter(o => o.status === 'shipping').length,
      completed: accessibleOrders.filter(o => o.status === 'completed').length,
      cancelled: accessibleOrders.filter(o => o.status === 'cancelled').length
    };

    // Đại lý khả dụng phụ thuộc vào quyền hạn và bộ lọc Khu vực đang chọn
    let availableAgents = allowedAgents;
    if (filters.regionId !== 'all') {
      availableAgents = availableAgents.filter(a => a.regionId === filters.regionId);
    }

    const html = `
      <div class="filter-card">
        <!-- Hàng 1: Tìm kiếm nhanh & Quick Status Pills -->
        <div class="filter-top-row">
          <!-- Ô tìm kiếm thông minh -->
          <div class="search-input-wrapper">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input 
              type="text" 
              id="filter-search-input" 
              class="search-input" 
              placeholder="Tìm theo mã đơn (ORD-...), tên khách hàng, số điện thoại, địa chỉ..." 
              value="${filters.search}"
            />
            ${filters.search ? `<button id="clear-search-btn" class="clear-search-btn" title="Xóa tìm kiếm">✕</button>` : ''}
          </div>

          <!-- Quick Status Filter Pills -->
          <div class="status-pills-row" id="status-pills">
            <button class="status-pill ${filters.status === 'all' ? 'active' : ''}" data-status="all">
              Tất cả <span class="pill-badge">${countByStatus.all}</span>
            </button>
            <button class="status-pill pill-pending ${filters.status === 'pending' ? 'active' : ''}" data-status="pending">
              <span class="pill-dot bg-amber"></span> Chờ duyệt <span class="pill-badge">${countByStatus.pending}</span>
            </button>
            <button class="status-pill pill-processing ${filters.status === 'processing' ? 'active' : ''}" data-status="processing">
              <span class="pill-dot bg-blue"></span> Đang xử lý <span class="pill-badge">${countByStatus.processing}</span>
            </button>
            <button class="status-pill pill-shipping ${filters.status === 'shipping' ? 'active' : ''}" data-status="shipping">
              <span class="pill-dot bg-purple"></span> Đang giao <span class="pill-badge">${countByStatus.shipping}</span>
            </button>
            <button class="status-pill pill-completed ${filters.status === 'completed' ? 'active' : ''}" data-status="completed">
              <span class="pill-dot bg-emerald"></span> Hoàn thành <span class="pill-badge">${countByStatus.completed}</span>
            </button>
            <button class="status-pill pill-cancelled ${filters.status === 'cancelled' ? 'active' : ''}" data-status="cancelled">
              <span class="pill-dot bg-rose"></span> Đã hủy <span class="pill-badge">${countByStatus.cancelled}</span>
            </button>
          </div>
        </div>

        <!-- Hàng 2: Bộ lọc chi tiết Đa chiều (Khu vực, Đại lý, Nhân viên, Thời gian) -->
        <div class="filter-controls-grid">
          <!-- 1. Lọc theo Khu vực -->
          <div class="filter-group">
            <label class="filter-label" for="select-region">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Khu vực
            </label>
            <div class="select-wrapper">
              <select id="select-region" class="filter-select">
                <option value="all" ${filters.regionId === 'all' ? 'selected' : ''}>Toàn bộ khu vực</option>
                ${REGIONS.map(r => `
                  <option value="${r.id}" ${filters.regionId === r.id ? 'selected' : ''}>${r.name}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- 2. Lọc theo Đại lý (Có ràng buộc theo RBAC) -->
          <div class="filter-group">
            <label class="filter-label" for="select-agent">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Đại lý phân phối
              ${!isManager ? `<span class="rbac-tag-micro" title="Giới hạn theo đại lý được phân công">Khóa RBAC</span>` : ''}
            </label>
            <div class="select-wrapper">
              <select id="select-agent" class="filter-select">
                <option value="all" ${filters.agentId === 'all' ? 'selected' : ''}>
                  ${isManager ? 'Tất cả đại lý' : 'Tất cả đại lý phụ trách (' + allowedAgents.length + ')'}
                </option>
                ${availableAgents.map(a => `
                  <option value="${a.id}" ${filters.agentId === a.id ? 'selected' : ''}>${a.name}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- 3. Lọc theo Nhân viên kinh doanh -->
          <div class="filter-group">
            <label class="filter-label" for="select-sales-rep">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Nhân viên phụ trách
            </label>
            <div class="select-wrapper">
              <select id="select-sales-rep" class="filter-select" ${!isManager ? 'disabled' : ''}>
                <option value="all" ${filters.salesRepId === 'all' ? 'selected' : ''}>Tất cả nhân viên</option>
                ${USERS.filter(u => u.role === 'sales').map(u => `
                  <option value="${u.id}" ${filters.salesRepId === u.id ? 'selected' : ''}>${u.name} (${u.roleTitle.split('(')[1]?.replace(')', '') || ''})</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- 4. Lọc theo Khoảng thời gian (Presets) -->
          <div class="filter-group">
            <label class="filter-label" for="select-date-preset">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Khoảng thời gian
            </label>
            <div class="select-wrapper">
              <select id="select-date-preset" class="filter-select">
                <option value="all" ${filters.datePreset === 'all' ? 'selected' : ''}>Toàn thời gian</option>
                <option value="today" ${filters.datePreset === 'today' ? 'selected' : ''}>Hôm nay (17/10/2026)</option>
                <option value="7days" ${filters.datePreset === '7days' ? 'selected' : ''}>7 ngày gần nhất</option>
                <option value="30days" ${filters.datePreset === '30days' ? 'selected' : ''}>30 ngày qua</option>
                <option value="this_month" ${filters.datePreset === 'this_month' ? 'selected' : ''}>Tháng 10/2026</option>
                <option value="custom" ${filters.datePreset === 'custom' ? 'selected' : ''}>Tùy chỉnh ngày...</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Hàng mở rộng nếu chọn Tùy chỉnh ngày -->
        ${filters.datePreset === 'custom' ? `
          <div class="custom-date-row animate-fade-in">
            <div class="date-input-group">
              <span class="date-prefix">Từ ngày:</span>
              <input type="date" id="input-start-date" class="filter-date-input" value="${filters.startDate || '2026-10-01'}" />
            </div>
            <div class="date-input-group">
              <span class="date-prefix">Đến ngày:</span>
              <input type="date" id="input-end-date" class="filter-date-input" value="${filters.endDate || '2026-10-17'}" />
            </div>
            <button id="apply-custom-date-btn" class="btn btn-secondary btn-sm">Áp dụng</button>
          </div>
        ` : ''}

        <!-- Thanh tóm tắt điều kiện lọc đang có hiệu lực (Active filter tags) -->
        <div class="active-filters-bar">
          <div class="active-tags-list">
            <span class="active-label">Đang lọc theo:</span>
            
            ${filters.search ? `
              <span class="filter-tag">
                Từ khóa: "<strong>${filters.search}</strong>"
                <button class="tag-remove" data-remove="search">×</button>
              </span>
            ` : ''}

            ${filters.status !== 'all' ? `
              <span class="filter-tag">
                Trạng thái: <strong>${ORDER_STATUSES.find(s => s.id === filters.status)?.label || filters.status}</strong>
                <button class="tag-remove" data-remove="status">×</button>
              </span>
            ` : ''}

            ${filters.regionId !== 'all' ? `
              <span class="filter-tag">
                Khu vực: <strong>${REGIONS.find(r => r.id === filters.regionId)?.name}</strong>
                <button class="tag-remove" data-remove="regionId">×</button>
              </span>
            ` : ''}

            ${filters.agentId !== 'all' ? `
              <span class="filter-tag">
                Đại lý: <strong>${AGENTS.find(a => a.id === filters.agentId)?.name}</strong>
                <button class="tag-remove" data-remove="agentId">×</button>
              </span>
            ` : ''}

            ${filters.salesRepId !== 'all' && isManager ? `
              <span class="filter-tag">
                Nhân viên: <strong>${USERS.find(u => u.id === filters.salesRepId)?.name}</strong>
                <button class="tag-remove" data-remove="salesRepId">×</button>
              </span>
            ` : ''}

            ${filters.datePreset !== 'all' ? `
              <span class="filter-tag">
                Thời gian: <strong>${getDatePresetLabel(filters.datePreset)}</strong>
                <button class="tag-remove" data-remove="datePreset">×</button>
              </span>
            ` : ''}

            ${!hasActiveFilters(filters, isManager) ? `
              <span class="filter-tag-empty">Hiển thị toàn bộ dữ liệu có quyền truy cập</span>
            ` : ''}
          </div>

          <!-- Nút Đặt lại tất cả bộ lọc -->
          ${hasActiveFilters(filters, isManager) ? `
            <button id="reset-filters-btn" class="btn-link text-rose">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Đặt lại bộ lọc
            </button>
          ` : ''}
        </div>
      </div>
    `;

    container.innerHTML = html;
    bindEvents(container);
  }

  function getDatePresetLabel(preset) {
    switch (preset) {
      case 'today': return 'Hôm nay';
      case '7days': return '7 ngày gần nhất';
      case '30days': return '30 ngày qua';
      case 'this_month': return 'Tháng 10/2026';
      case 'custom': return 'Tùy chọn';
      default: return 'Toàn thời gian';
    }
  }

  function hasActiveFilters(filters, isManager) {
    return filters.search !== '' ||
      filters.status !== 'all' ||
      filters.regionId !== 'all' ||
      filters.agentId !== 'all' ||
      (isManager && filters.salesRepId !== 'all') ||
      filters.datePreset !== 'all';
  }

  function bindEvents(container) {
    // Search input debounce
    const searchInput = container.querySelector('#filter-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        const val = e.target.value;
        debounceTimeout = setTimeout(() => {
          orderStore.setFilter('search', val);
        }, 250);
      });
    }

    const clearSearchBtn = container.querySelector('#clear-search-btn');
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        orderStore.setFilter('search', '');
      });
    }

    // Status pills click
    container.querySelectorAll('.status-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const status = e.currentTarget.dataset.status;
        orderStore.setFilter('status', status);
      });
    });

    // Region select
    const regionSelect = container.querySelector('#select-region');
    if (regionSelect) {
      regionSelect.addEventListener('change', (e) => {
        orderStore.setFilter('regionId', e.target.value);
      });
    }

    // Agent select
    const agentSelect = container.querySelector('#select-agent');
    if (agentSelect) {
      agentSelect.addEventListener('change', (e) => {
        orderStore.setFilter('agentId', e.target.value);
      });
    }

    // Sales Rep select
    const salesRepSelect = container.querySelector('#select-sales-rep');
    if (salesRepSelect) {
      salesRepSelect.addEventListener('change', (e) => {
        orderStore.setFilter('salesRepId', e.target.value);
      });
    }

    // Date Preset select
    const datePresetSelect = container.querySelector('#select-date-preset');
    if (datePresetSelect) {
      datePresetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'custom') {
          orderStore.setFilters({
            datePreset: 'custom',
            startDate: '2026-10-01',
            endDate: '2026-10-17'
          });
        } else {
          orderStore.setFilter('datePreset', val);
        }
      });
    }

    // Custom Date Apply
    const applyDateBtn = container.querySelector('#apply-custom-date-btn');
    if (applyDateBtn) {
      applyDateBtn.addEventListener('click', () => {
        const startDate = container.querySelector('#input-start-date')?.value || '';
        const endDate = container.querySelector('#input-end-date')?.value || '';
        orderStore.setFilters({
          datePreset: 'custom',
          startDate,
          endDate
        });
      });
    }

    // Tag remove buttons
    container.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const removeKey = e.currentTarget.dataset.remove;
        if (removeKey === 'datePreset') {
          orderStore.setFilters({ datePreset: 'all', startDate: '', endDate: '' });
        } else if (removeKey === 'search') {
          orderStore.setFilter('search', '');
        } else {
          orderStore.setFilter(removeKey, 'all');
        }
      });
    });

    // Reset filters
    const resetBtn = container.querySelector('#reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        orderStore.resetFilters();
      });
    }
  }

  // Subscribe to store updates
  orderStore.subscribe(render);
}
