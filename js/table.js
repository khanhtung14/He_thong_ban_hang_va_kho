/**
 * Enterprise Order Data Table Component
 * Tính năng:
 * - Hiển thị danh sách đơn hàng chuyên nghiệp
 * - Sắp xếp đa cột (Sorting)
 * - Chọn hàng loạt & Thao tác nhanh (Batch Actions)
 * - Phân trang thông minh (Smart Pagination)
 * - Định dạng tiền tệ VNĐ và trạng thái sắc nét
 */

import { AGENTS, REGIONS, USERS, ORDER_STATUSES } from './mockData.js';
import { orderStore } from './store.js';
import { formatCurrencyVND } from './kpi.js';

export function setupOrderTable(container, onOpenDetail) {
  function render(state) {
    const {
      paginatedOrders,
      totalCount,
      totalPages,
      currentPage,
      pageSize,
      sort,
      selectedOrderIds,
      kpi
    } = state;

    const pageOrderIds = paginatedOrders.map(o => o.id);
    const isAllSelected = pageOrderIds.length > 0 && pageOrderIds.every(id => selectedOrderIds.includes(id));
    const isSomeSelected = pageOrderIds.some(id => selectedOrderIds.includes(id)) && !isAllSelected;

    const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalCount);

    const pageTotalAmount = paginatedOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const html = `
      <div class="table-card">
        <!-- Thanh công cụ trên bảng & Bulk action bar -->
        <div class="table-toolbar">
          <div class="table-title-group">
            <h3 class="table-title">Danh sách đơn hàng toàn hệ thống</h3>
            <span class="table-subtitle">Đang hiển thị <strong>${startItem} - ${endItem}</strong> trên <strong>${totalCount}</strong> kết quả (Tổng tiền trang: <strong class="text-emerald">${formatCurrencyVND(pageTotalAmount)}</strong>)</span>
          </div>

          <!-- Thanh thao tác chọn hàng loạt (Hiển thị khi có chọn ít nhất 1 dòng) -->
          ${selectedOrderIds.length > 0 ? `
            <div class="bulk-actions-strip animate-slide-down">
              <span class="bulk-count">Đã chọn <strong>${selectedOrderIds.length}</strong> đơn hàng</span>
              <div class="bulk-buttons">
                <select id="bulk-status-select" class="bulk-select">
                  <option value="">-- Đổi trạng thái hàng loạt --</option>
                  <option value="pending">Chờ duyệt</option>
                  <option value="processing">Đang xử lý</option>
                  <option value="shipping">Đang giao hàng</option>
                  <option value="completed">Đã hoàn thành</option>
                  <option value="cancelled">Hủy đơn</option>
                </select>
                <button id="bulk-export-btn" class="btn btn-secondary btn-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Xuất Excel (${selectedOrderIds.length})
                </button>
                <button id="bulk-clear-btn" class="btn-ghost btn-sm text-muted">Bỏ chọn</button>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Khung bảng dữ liệu cuộn ngang linh hoạt -->
        <div class="table-responsive">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th class="th-checkbox">
                  <input type="checkbox" id="select-all-checkbox" ${isAllSelected ? 'checked' : ''} class="custom-checkbox" />
                </th>
                <th class="th-sortable" data-sort="id">
                  <div class="th-content">
                    <span>Mã đơn hàng</span>
                    ${renderSortIcon('id', sort)}
                  </div>
                </th>
                <th class="th-sortable" data-sort="createdAt">
                  <div class="th-content">
                    <span>Thời gian đặt</span>
                    ${renderSortIcon('createdAt', sort)}
                  </div>
                </th>
                <th class="th-sortable" data-sort="customerName">
                  <div class="th-content">
                    <span>Khách hàng & Địa chỉ</span>
                    ${renderSortIcon('customerName', sort)}
                  </div>
                </th>
                <th>Đại lý & Khu vực</th>
                <th>Nhân viên phụ trách</th>
                <th>Sản phẩm tóm tắt</th>
                <th class="th-sortable text-right" data-sort="totalAmount">
                  <div class="th-content justify-end">
                    <span>Tổng tiền</span>
                    ${renderSortIcon('totalAmount', sort)}
                  </div>
                </th>
                <th class="th-sortable" data-sort="status">
                  <div class="th-content">
                    <span>Trạng thái</span>
                    ${renderSortIcon('status', sort)}
                  </div>
                </th>
                <th class="text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              ${paginatedOrders.length === 0 ? `
                <tr>
                  <td colspan="10" class="empty-table-cell">
                    <div class="empty-state">
                      <div class="empty-icon-wrap">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                      </div>
                      <h4 class="empty-title">Không tìm thấy đơn hàng phù hợp</h4>
                      <p class="empty-desc">Không có đơn hàng nào thỏa mãn các tiêu chí lọc đang chọn hoặc trong phạm vi phân quyền của bạn.</p>
                      <button id="empty-reset-btn" class="btn btn-primary btn-sm">Đặt lại bộ lọc</button>
                    </div>
                  </td>
                </tr>
              ` : paginatedOrders.map(order => {
                const isSelected = selectedOrderIds.includes(order.id);
                const agent = AGENTS.find(a => a.id === order.agentId) || { name: order.agentId };
                const region = REGIONS.find(r => r.id === order.regionId) || { name: order.regionId };
                const salesRep = USERS.find(u => u.id === order.salesRepId) || { name: 'Chưa phân công', avatar: '' };
                const statusMeta = ORDER_STATUSES.find(s => s.id === order.status) || { label: order.status, color: '#94a3b8' };
                const formattedDate = formatDateTime(order.createdAt);
                const itemsCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
                const primaryItem = order.items[0]?.product?.name || 'Sản phẩm';

                return `
                  <tr class="table-row ${isSelected ? 'row-selected' : ''}" data-order-id="${order.id}">
                    <td class="td-checkbox">
                      <input type="checkbox" class="row-checkbox custom-checkbox" data-id="${order.id}" ${isSelected ? 'checked' : ''} />
                    </td>
                    <td class="td-order-id">
                      <div class="order-id-badge" title="Bấm để xem chi tiết" data-action="view-detail" data-id="${order.id}">
                        <span>${order.id}</span>
                      </div>
                    </td>
                    <td class="td-date">
                      <div class="date-text">${formattedDate.date}</div>
                      <div class="time-text">${formattedDate.time}</div>
                    </td>
                    <td class="td-customer">
                      <div class="customer-name" title="${escapeHtml(order.customer.name)}">${escapeHtml(order.customer.name)}</div>
                      <div class="customer-phone">${order.customer.phone}</div>
                      <div class="customer-address" title="${escapeHtml(order.customer.address)}">${escapeHtml(order.customer.address)}</div>
                    </td>
                    <td class="td-agent">
                      <div class="agent-name">${escapeHtml(agent.name)}</div>
                      <div class="region-pill region-${order.regionId.toLowerCase()}">${region.name}</div>
                    </td>
                    <td class="td-sales">
                      <div class="sales-rep-cell">
                        <img src="${salesRep.avatar}" alt="${salesRep.name}" class="sales-avatar" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(salesRep.name)}&background=3b82f6&color=fff'" />
                        <span class="sales-name">${salesRep.name}</span>
                      </div>
                    </td>
                    <td class="td-items">
                      <div class="item-primary" title="${escapeHtml(primaryItem)}">${escapeHtml(primaryItem)}</div>
                      <div class="item-count-badge">${itemsCount} sản phẩm ${order.items.length > 1 ? `(+${order.items.length - 1} loại)` : ''}</div>
                    </td>
                    <td class="td-amount text-right">
                      <div class="amount-val ${order.status === 'cancelled' ? 'amount-cancelled' : ''}">${formatCurrencyVND(order.totalAmount)}</div>
                      <div class="payment-badge ${order.paymentStatus === 'Đã thanh toán' ? 'pay-paid' : 'pay-pending'}">${order.paymentStatus}</div>
                    </td>
                    <td class="td-status">
                      <span class="status-badge status-${order.status}">
                        <span class="status-dot"></span>
                        ${statusMeta.label}
                      </span>
                    </td>
                    <td class="td-actions text-center">
                      <div class="action-btn-group">
                        <button class="action-btn btn-view" title="Xem chi tiết đầy đủ" data-action="view-detail" data-id="${order.id}">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button class="action-btn btn-quick-status" title="Đổi trạng thái nhanh" data-action="quick-status" data-id="${order.id}">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Thanh phân trang thông minh (Smart Pagination) -->
        <div class="table-pagination-footer">
          <div class="pagination-page-size">
            <span class="pagination-label">Hiển thị mỗi trang:</span>
            <select id="page-size-select" class="pagination-select">
              <option value="10" ${pageSize === 10 ? 'selected' : ''}>10 dòng</option>
              <option value="20" ${pageSize === 20 ? 'selected' : ''}>20 dòng</option>
              <option value="50" ${pageSize === 50 ? 'selected' : ''}>50 dòng</option>
            </select>
          </div>

          <div class="pagination-nav">
            <button id="page-first-btn" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} title="Trang đầu">«</button>
            <button id="page-prev-btn" class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''} title="Trang trước">‹</button>
            
            <div class="pagination-numbers">
              ${renderPaginationButtons(currentPage, totalPages)}
            </div>

            <button id="page-next-btn" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} title="Trang tiếp">›</button>
            <button id="page-last-btn" class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''} title="Trang cuối">»</button>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
    bindTableEvents(container, state, onOpenDetail);
  }

  function renderSortIcon(field, sort) {
    if (sort.field !== field) {
      return `<svg class="sort-icon sort-inactive" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>`;
    }
    if (sort.direction === 'asc') {
      return `<svg class="sort-icon sort-active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m7 9 5-5 5 5"/></svg>`;
    }
    return `<svg class="sort-icon sort-active" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m7 15 5 5 5-5"/></svg>`;
  }

  function renderPaginationButtons(current, total) {
    let pages = [];
    if (total <= 5) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      if (current <= 3) {
        pages = [1, 2, 3, 4, '...', total];
      } else if (current >= total - 2) {
        pages = [1, '...', total - 3, total - 2, total - 1, total];
      } else {
        pages = [1, '...', current - 1, current, current + 1, '...', total];
      }
    }

    return pages.map(p => {
      if (p === '...') {
        return `<span class="pagination-ellipsis">...</span>`;
      }
      return `
        <button class="pagination-number ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>
      `;
    }).join('');
  }

  function formatDateTime(isoString) {
    const d = new Date(isoString);
    const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return { date, time };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function bindTableEvents(container, state, onOpenDetail) {
    // Checkbox chọn tất cả
    const selectAllCheckbox = container.querySelector('#select-all-checkbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', () => {
        const pageOrderIds = state.paginatedOrders.map(o => o.id);
        orderStore.toggleSelectAllOnPage(pageOrderIds);
      });
    }

    // Checkbox từng hàng
    container.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        orderStore.toggleSelectOrder(id);
      });
    });

    // Sắp xếp các cột
    container.querySelectorAll('.th-sortable').forEach(th => {
      th.addEventListener('click', (e) => {
        const sortField = e.currentTarget.dataset.sort;
        orderStore.setSort(sortField);
      });
    });

    // Xem chi tiết đơn hàng
    container.querySelectorAll('[data-action="view-detail"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const orderId = e.currentTarget.dataset.id;
        const order = state.paginatedOrders.find(o => o.id === orderId) || orderStore.allOrders.find(o => o.id === orderId);
        if (order && onOpenDetail) {
          onOpenDetail(order);
        }
      });
    });

    // Đổi trạng thái nhanh
    container.querySelectorAll('[data-action="quick-status"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const orderId = e.currentTarget.dataset.id;
        const order = orderStore.allOrders.find(o => o.id === orderId);
        if (!order) return;
        
        const nextStatusMap = {
          pending: 'processing',
          processing: 'shipping',
          shipping: 'completed',
          completed: 'pending',
          cancelled: 'pending'
        };
        const nextStatus = nextStatusMap[order.status] || 'pending';
        orderStore.updateOrderStatus(orderId, nextStatus);
        
        if (window.showToast) {
          window.showToast(`Đã chuyển đơn ${orderId} sang trạng thái mới`, 'success');
        }
      });
    });

    // Phân trang
    const pageSizeSelect = container.querySelector('#page-size-select');
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', (e) => {
        orderStore.setPageSize(e.target.value);
      });
    }

    const firstBtn = container.querySelector('#page-first-btn');
    if (firstBtn) firstBtn.addEventListener('click', () => orderStore.setPage(1));

    const prevBtn = container.querySelector('#page-prev-btn');
    if (prevBtn) prevBtn.addEventListener('click', () => orderStore.setPage(Math.max(1, state.currentPage - 1)));

    const nextBtn = container.querySelector('#page-next-btn');
    if (nextBtn) nextBtn.addEventListener('click', () => orderStore.setPage(Math.min(state.totalPages, state.currentPage + 1)));

    const lastBtn = container.querySelector('#page-last-btn');
    if (lastBtn) lastBtn.addEventListener('click', () => orderStore.setPage(state.totalPages));

    container.querySelectorAll('.pagination-number').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = Number(e.currentTarget.dataset.page);
        if (page) orderStore.setPage(page);
      });
    });

    // Bulk actions
    const bulkStatusSelect = container.querySelector('#bulk-status-select');
    if (bulkStatusSelect) {
      bulkStatusSelect.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        if (newStatus && state.selectedOrderIds.length > 0) {
          orderStore.batchUpdateStatus(state.selectedOrderIds, newStatus);
          if (window.showToast) {
            window.showToast(`Đã cập nhật ${state.selectedOrderIds.length} đơn hàng sang trạng thái mới!`, 'success');
          }
        }
      });
    }

    const bulkClearBtn = container.querySelector('#bulk-clear-btn');
    if (bulkClearBtn) {
      bulkClearBtn.addEventListener('click', () => {
        orderStore.clearSelection();
      });
    }

    const bulkExportBtn = container.querySelector('#bulk-export-btn');
    if (bulkExportBtn) {
      bulkExportBtn.addEventListener('click', () => {
        const selected = orderStore.allOrders.filter(o => state.selectedOrderIds.includes(o.id));
        if (window.exportOrdersToCsv) {
          window.exportOrdersToCsv(selected, `don-hang-da-chon-${state.selectedOrderIds.length}.csv`);
        }
      });
    }

    // Empty state reset button
    const emptyResetBtn = container.querySelector('#empty-reset-btn');
    if (emptyResetBtn) {
      emptyResetBtn.addEventListener('click', () => {
        orderStore.resetFilters();
      });
    }
  }

  orderStore.subscribe(render);
}
