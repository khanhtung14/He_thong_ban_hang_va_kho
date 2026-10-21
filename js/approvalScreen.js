/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Order List & Credit Approval Screen View
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { store } from './store.js';
import { CreditRiskEngine } from './creditEngine.js';

export class ApprovalScreen {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.filterStatus = 'ALL';
    this.searchQuery = '';
    
    store.subscribe(() => this.render());
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const { orders } = state;

    const pendingCount = orders.filter(o => o.status === 'PENDING_APPROVAL').length;
    const approvedCount = orders.filter(o => o.status === 'APPROVED').length;
    const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;

    let filteredOrders = orders;
    if (this.filterStatus !== 'ALL') {
      filteredOrders = filteredOrders.filter(o => o.status === this.filterStatus);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filteredOrders = filteredOrders.filter(o => 
        o.orderNo.toLowerCase().includes(q) || 
        o.dealerName.toLowerCase().includes(q) || 
        o.salesRep.toLowerCase().includes(q)
      );
    }

    this.container.innerHTML = `
      <div class="approval-screen-layout">
        <!-- HEADER TRANG & BỘ LỌC -->
        <div class="approval-header-section">
          <div class="header-titles">
            <span class="section-tag"><i class="ph-bold ph-shield-check"></i> PHÂN HỆ QUẢN TRỊ TÍN DỤNG & ĐƠN HÀNG</span>
            <h2>Danh Sách Đơn Hàng & Luồng Phê Duyệt Công Nợ</h2>
            <p class="text-muted">Kiểm soát đơn hàng vượt hạn mức, thẩm định hồ sơ bảo lãnh và phê duyệt ngoại lệ</p>
          </div>

          <!-- KPI THỐNG KÊ NHANH -->
          <div class="approval-stats-strip">
            <div class="stat-badge-card total">
              <span class="stat-count font-mono">${orders.length}</span>
              <span class="stat-label">Tổng số đơn</span>
            </div>
            <div class="stat-badge-card pending">
              <span class="stat-count font-mono">${pendingCount}</span>
              <span class="stat-label">⏳ Chờ duyệt công nợ</span>
            </div>
            <div class="stat-badge-card approved">
              <span class="stat-count font-mono">${approvedCount}</span>
              <span class="stat-label">✅ Đã xác nhận / Duyệt</span>
            </div>
            <div class="stat-badge-card rejected">
              <span class="stat-count font-mono">${rejectedCount}</span>
              <span class="stat-label">❌ Đã từ chối</span>
            </div>
          </div>
        </div>

        <!-- BẢNG ĐIỀU KHIỂN BỘ LỌC & TÌM KIẾM -->
        <div class="approval-toolbar">
          <div class="filter-tabs-pills">
            <button class="pill-btn ${this.filterStatus === 'ALL' ? 'active' : ''}" data-status="ALL">
              Tất cả (${orders.length})
            </button>
            <button class="pill-btn pill-warning ${this.filterStatus === 'PENDING_APPROVAL' ? 'active' : ''}" data-status="PENDING_APPROVAL">
              ⏳ Cần duyệt công nợ (${pendingCount})
            </button>
            <button class="pill-btn pill-success ${this.filterStatus === 'APPROVED' ? 'active' : ''}" data-status="APPROVED">
              ✅ Đã duyệt (${approvedCount})
            </button>
            <button class="pill-btn pill-danger ${this.filterStatus === 'REJECTED' ? 'active' : ''}" data-status="REJECTED">
              ❌ Từ chối (${rejectedCount})
            </button>
          </div>

          <div class="search-input-box">
            <i class="ph-bold ph-magnifying-glass search-icon"></i>
            <input type="text" id="orderSearchInput" class="form-input" 
                   placeholder="Tìm theo mã đơn, tên đại lý, sales..." 
                   value="${this.searchQuery}">
          </div>
        </div>

        <!-- BẢNG DANH SÁCH ĐƠN HÀNG DOANH NGHIỆP -->
        <div class="table-container">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Mã Đơn Hàng</th>
                <th>Đại Lý / Khách Hàng</th>
                <th>Nhân Viên Kinh Doanh</th>
                <th>Tổng Tiền (Gồm VAT)</th>
                <th>Trạng Thái Phê Duyệt</th>
                <th>Thẩm Định Tín Dụng & Lý Do</th>
                <th class="text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${filteredOrders.length === 0 ? `
                <tr>
                  <td colspan="7" class="table-empty-row">
                    <i class="ph-bold ph-tray"></i>
                    Không có đơn hàng nào trong phân loại này.
                  </td>
                </tr>
              ` : filteredOrders.map(order => `
                <tr class="order-table-row ${order.status === 'PENDING_APPROVAL' ? 'row-highlight-pending' : ''}">
                  
                  <!-- MÃ ĐƠN & NGÀY TẠO -->
                  <td>
                    <div class="order-code-box">
                      <span class="order-no font-mono font-bold">${order.orderNo}</span>
                      <span class="order-time font-mono text-muted">${order.createdAt}</span>
                    </div>
                  </td>

                  <!-- ĐẠI LÝ -->
                  <td>
                    <div class="dealer-cell">
                      <span class="dealer-name font-bold">${order.dealerName}</span>
                      <span class="dealer-subcode font-mono text-muted">${order.dealerId}</span>
                    </div>
                  </td>

                  <!-- SALES REP -->
                  <td>
                    <div class="sales-rep-cell">
                      <i class="ph-bold ph-user-circle"></i>
                      <span>${order.salesRep}</span>
                    </div>
                  </td>

                  <!-- TỔNG TIỀN -->
                  <td>
                    <div class="order-price-cell font-mono font-bold">
                      ${CreditRiskEngine.formatVND(order.totalAmount)}
                    </div>
                  </td>

                  <!-- TRẠNG THÁI (TIÊU CHÍ 2: CẦN DUYỆT) -->
                  <td>
                    ${this.renderStatusBadge(order.status, order.statusLabel)}
                  </td>

                  <!-- THẨM ĐỊNH TÍN DỤNG & LÝ DO -->
                  <td class="credit-notes-cell">
                    <div class="credit-summary-text ${order.creditCheckStatus === 'EXCEEDED_LIMIT' ? 'text-danger font-semibold' : 'text-success'}">
                      <i class="ph-bold ${order.creditCheckStatus === 'EXCEEDED_LIMIT' ? 'ph-warning' : 'ph-seal-check'}"></i>
                      ${order.creditCheckSummary}
                    </div>
                    ${order.approvalReason ? `
                      <div class="approval-justification" title="${order.approvalReason}">
                        <em>" ${order.approvalReason} "</em>
                      </div>
                    ` : ''}
                  </td>

                  <!-- THAO TÁC -->
                  <td class="text-right">
                    <div class="action-buttons-group">
                      ${order.status === 'PENDING_APPROVAL' ? `
                        <button class="btn btn-sm btn-success btn-approve-order" data-id="${order.id}" title="Phê duyệt đơn hàng này">
                          <i class="ph-bold ph-check"></i> Duyệt
                        </button>
                        <button class="btn btn-sm btn-danger btn-reject-order" data-id="${order.id}" title="Từ chối đơn hàng">
                          <i class="ph-bold ph-x"></i> Từ chối
                        </button>
                      ` : ''}
                      
                      <button class="btn btn-sm btn-outline btn-view-order" data-id="${order.id}" title="Xem chi tiết đơn">
                        <i class="ph-bold ph-eye"></i>
                      </button>
                    </div>
                  </td>

                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;

    this.attachEventListeners();
  }

  renderStatusBadge(status, label) {
    if (status === 'PENDING_APPROVAL') {
      return `
        <span class="badge badge-warning font-bold">
          <i class="ph-bold ph-hourglass-high"></i> CẦN DUYỆT
        </span>
      `;
    }
    if (status === 'APPROVED') {
      return `
        <span class="badge badge-success font-bold">
          <i class="ph-bold ph-check-circle"></i> ĐÃ DUYỆT
        </span>
      `;
    }
    if (status === 'REJECTED') {
      return `
        <span class="badge badge-danger font-bold">
          <i class="ph-bold ph-x-circle"></i> TỪ CHỐI
        </span>
      `;
    }
    return `<span class="badge badge-outline">${label}</span>`;
  }

  attachEventListeners() {
    // 1. Chuyển đổi tab trạng thái
    const pillBtns = this.container.querySelectorAll('.pill-btn');
    pillBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterStatus = btn.dataset.status;
        this.render();
      });
    });

    // 2. Tìm kiếm
    const searchInput = document.getElementById('orderSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this.render();
      });
    }

    // 3. Nút Duyệt đơn (Kế toán phê duyệt)
    const approveBtns = this.container.querySelectorAll('.btn-approve-order');
    approveBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        if (window.AppModals) {
          window.AppModals.openConfirmApprovalModal(orderId);
        }
      });
    });

    // 4. Nút Từ chối đơn
    const rejectBtns = this.container.querySelectorAll('.btn-reject-order');
    rejectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        if (window.AppModals) {
          window.AppModals.openConfirmRejectModal(orderId);
        }
      });
    });

    // 5. Nút Xem chi tiết đơn
    const viewBtns = this.container.querySelectorAll('.btn-view-order');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.id;
        if (window.AppModals) {
          window.AppModals.openOrderDetailModal(orderId);
        }
      });
    });
  }
}
