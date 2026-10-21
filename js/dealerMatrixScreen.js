/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Dealer Credit Matrix & AR Aging Analysis Screen
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { store } from './store.js';
import { CreditRiskEngine } from './creditEngine.js';

export class DealerMatrixScreen {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    store.subscribe(() => this.render());
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const { dealers, config } = state;

    this.container.innerHTML = `
      <div class="matrix-screen-layout">
        
        <!-- HEADER MA TRẬN & CẤU HÌNH CHÍNH SÁCH CÔNG NỢ -->
        <div class="matrix-header-box">
          <div class="matrix-title-wrap">
            <span class="section-tag"><i class="ph-bold ph-chart-polar"></i> GIÁM SÁT RỦI RO TÍN DỤNG DOANH NGHIỆP</span>
            <h2>Bảng Tổng Hợp Công Nợ & Báo Cáo Tuổi Nợ (AR Aging Report)</h2>
            <p class="text-muted">Theo dõi hạn mức, nợ quá hạn và trạng thái khóa cổng tín dụng theo thời gian thực</p>
          </div>

          <!-- BỘ ĐIỀU CHỈNH CHÍNH SÁCH CÔNG NỢ (POLICY CONTROLLER CHO GIẢNG VIÊN THỬ NGHIỆM) -->
          <div class="policy-controller-card">
            <div class="policy-header">
              <i class="ph-fill ph-sliders-horizontal"></i>
              <span>CẤU HÌNH CHÍNH SÁCH TÀI CHÍNH</span>
            </div>
            <div class="policy-body">
              <label for="maxOverdueInput">
                Số ngày quá hạn tối đa cho phép trước khi <strong>Khóa Cứng</strong>:
              </label>
              <div class="policy-input-group">
                <input type="number" id="maxOverdueInput" class="form-input font-mono" 
                       value="${config.defaultMaxOverdueDays}" min="0" max="180">
                <span class="input-unit">ngày</span>
                <button class="btn btn-sm btn-primary" id="btnUpdatePolicy">Áp dụng</button>
              </div>
              <div class="policy-note">
                <i class="ph-bold ph-lightbulb"></i> 
                <em>Gợi ý Giảng viên: Thử đổi thành <strong>60 ngày</strong> để mở khóa cho ĐL Thăng Long, hoặc đổi thành <strong>0 ngày</strong> để khóa mọi đại lý có nợ quá hạn dù chỉ 1 ngày!</em>
              </div>
            </div>
          </div>
        </div>

        <!-- BẢNG TỔNG HỢP CÔNG NỢ TOÀN HỆ THỐNG ĐẠI LÝ -->
        <div class="table-container matrix-table-container">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Mã & Tên Đại Lý</th>
                <th>Cấp Bậc & Khu Vực</th>
                <th>Hạn Mức Tín Dụng</th>
                <th>Công Nợ Hiện Tại</th>
                <th>Hạn Mức Còn Lại</th>
                <th>Tỉ Lệ Sử Dụng</th>
                <th>Tuổi Nợ Tối Đa</th>
                <th>Trạng Thái Cổng Khóa</th>
                <th class="text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${dealers.map(d => {
                const evalInfo = CreditRiskEngine.evaluateCreditGatekeeper(d, 0, config.defaultMaxOverdueDays);
                const isCurrent = store.getCurrentDealer().id === d.id;

                return `
                  <tr class="matrix-row ${evalInfo.isOverdueBlocked ? 'row-blocked-bg' : ''} ${isCurrent ? 'row-current-active' : ''}">
                    <td>
                      <div class="dealer-info-primary">
                        <span class="font-bold">${d.name}</span>
                        <div class="dealer-sub-code font-mono text-muted">
                          Mã: ${d.code} | MST: ${d.taxCode}
                        </div>
                      </div>
                    </td>

                    <td>
                      <span class="badge ${d.tierBadge}">${d.tier}</span>
                      <div class="region-subtext text-muted">${d.region}</div>
                    </td>

                    <td class="font-mono font-bold">
                      ${CreditRiskEngine.formatVND(d.creditLimit)}
                    </td>

                    <td class="font-mono font-semibold ${d.currentDebt > 0 ? 'text-warning' : ''}">
                      ${CreditRiskEngine.formatVND(d.currentDebt)}
                    </td>

                    <td class="font-mono font-bold ${evalInfo.remainingCredit > 0 ? 'text-success' : 'text-danger'}">
                      ${CreditRiskEngine.formatVND(evalInfo.remainingCredit)}
                    </td>

                    <td>
                      <div class="mini-utilization-wrap">
                        <span class="mini-pct font-mono ${evalInfo.currentUtilizationPct >= 90 ? 'text-danger' : ''}">
                          ${evalInfo.currentUtilizationPct}%
                        </span>
                        <div class="mini-bar-track">
                          <div class="mini-bar-fill ${evalInfo.currentUtilizationPct >= 90 ? 'fill-danger' : (evalInfo.currentUtilizationPct >= 70 ? 'fill-warning' : 'fill-success')}" 
                               style="width: ${evalInfo.currentUtilizationPct}%;">
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div class="aging-badge-cell">
                        ${evalInfo.maxOverdueDays > 0 ? `
                          <span class="badge ${evalInfo.isOverdueBlocked ? 'badge-danger font-bold' : 'badge-warning'}">
                            ${evalInfo.maxOverdueDays} ngày quá hạn
                          </span>
                        ` : `
                          <span class="badge badge-success">Trong hạn (0d)</span>
                        `}
                      </div>
                    </td>

                    <td>
                      ${evalInfo.isOverdueBlocked ? `
                        <span class="badge badge-danger font-bold">
                          <i class="ph-bold ph-lock"></i> KHÓA CỨNG TẠO ĐƠN
                        </span>
                      ` : (evalInfo.currentUtilizationPct >= 90 ? `
                        <span class="badge badge-warning">
                          <i class="ph-bold ph-warning"></i> CẬN HẠN MỨC
                        </span>
                      ` : `
                        <span class="badge badge-success">
                          <i class="ph-bold ph-check"></i> BÌNH THƯỜNG
                        </span>
                      `)}
                    </td>

                    <td class="text-right">
                      <div class="action-buttons-group">
                        <button class="btn btn-sm btn-outline btn-switch-dealer" data-id="${d.id}" title="Chọn làm đại lý để tạo đơn ngay">
                          <i class="ph-bold ph-arrow-square-out"></i> Tạo đơn
                        </button>
                        ${d.unpaidInvoices && d.unpaidInvoices.length > 0 ? `
                          <button class="btn btn-sm btn-light btn-view-dealer-invoices" data-id="${d.id}" title="Xem hóa đơn nợ chi tiết">
                            <i class="ph-bold ph-receipt"></i> Sổ nợ (${d.unpaidInvoices.length})
                          </button>
                        ` : ''}
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- PHẦN CHI TIẾT BẢNG KÊ HÓA ĐƠN NỢ TỒN ĐỌNG (ACCOUNTS RECEIVABLE AGING) -->
        <div class="aging-detail-section">
          <div class="aging-header">
            <h3><i class="ph-bold ph-clock-countdown"></i> Chi Tiết Hóa Đơn Nợ Toàn Hệ Thống</h3>
            <span class="text-muted">Danh sách các hóa đơn phát sinh công nợ chưa quyết toán</span>
          </div>

          <div class="table-container">
            <table class="enterprise-table">
              <thead>
                <tr>
                  <th>Mã Hóa Đơn</th>
                  <th>Mã Đơn Gốc</th>
                  <th>Đại Lý</th>
                  <th>Ngày Phát Hành</th>
                  <th>Hạn Thanh Toán</th>
                  <th>Số Tiền Nợ</th>
                  <th>Số Ngày Quá Hạn</th>
                  <th>Tình Trạng</th>
                  <th class="text-right">Thao Tác Thử Nghiệm</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderAllInvoices(dealers, config.defaultMaxOverdueDays)}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    this.attachEventListeners();
  }

  renderAllInvoices(dealers, maxAllowedDays) {
    const rows = [];
    dealers.forEach(dealer => {
      (dealer.unpaidInvoices || []).forEach(inv => {
        const isViolating = (inv.overdueDays || 0) > maxAllowedDays;
        rows.push(`
          <tr class="${isViolating ? 'row-violating' : ''}">
            <td class="font-mono font-bold">${inv.invoiceNo}</td>
            <td class="font-mono text-muted">${inv.orderNo}</td>
            <td><strong>${dealer.name}</strong></td>
            <td class="font-mono">${inv.issueDate}</td>
            <td class="font-mono">${inv.dueDate}</td>
            <td class="font-mono font-bold text-warning">${CreditRiskEngine.formatVND(inv.remainingAmount)}</td>
            <td>
              <span class="font-mono font-bold ${isViolating ? 'text-danger' : (inv.overdueDays > 0 ? 'text-warning' : 'text-success')}">
                ${inv.overdueDays > 0 ? `${inv.overdueDays} ngày` : '0 ngày (Trong hạn)'}
              </span>
            </td>
            <td>
              ${isViolating ? `
                <span class="badge badge-danger font-bold">
                  <i class="ph-bold ph-prohibit"></i> Quá hạn vi phạm (> ${maxAllowedDays}d)
                </span>
              ` : (inv.overdueDays > 0 ? `
                <span class="badge badge-warning">Trong ân hạn (<= ${maxAllowedDays}d)</span>
              ` : `
                <span class="badge badge-success">Chưa đến hạn</span>
              `)}
            </td>
            <td class="text-right">
              <button class="btn btn-sm btn-light btn-settle-invoice" 
                      data-dealer="${dealer.id}" 
                      data-invoice="${inv.invoiceNo}" 
                      title="Mô phỏng khách hàng thanh toán hóa đơn này để mở khóa tức thì">
                <i class="ph-bold ph-hand-coins"></i> Tất toán thử nghiệm
              </button>
            </td>
          </tr>
        `);
      });
    });

    if (rows.length === 0) {
      return `<tr><td colspan="9" class="table-empty-row">Không có hóa đơn nợ nào tồn đọng!</td></tr>`;
    }

    return rows.join('');
  }

  attachEventListeners() {
    // 1. Cập nhật chính sách số ngày quá hạn
    const btnUpdate = document.getElementById('btnUpdatePolicy');
    const inputOverdue = document.getElementById('maxOverdueInput');
    if (btnUpdate && inputOverdue) {
      btnUpdate.addEventListener('click', () => {
        const days = parseInt(inputOverdue.value, 10);
        if (!isNaN(days) && days >= 0) {
          store.updateMaxOverdueDays(days);
          if (window.AppNotifications) {
            window.AppNotifications.toast('info', `Đã cập nhật chính sách: Nợ quá hạn tối đa ${days} ngày.`);
          }
        }
      });
    }

    // 2. Chuyển sang tạo đơn cho đại lý này
    const switchBtns = this.container.querySelectorAll('.btn-switch-dealer');
    switchBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dealerId = btn.dataset.id;
        store.setDealer(dealerId);
        if (window.AppNavigation) {
          window.AppNavigation.switchTab('order-screen');
        }
      });
    });

    // 3. Xem hóa đơn đại lý
    const viewInvBtns = this.container.querySelectorAll('.btn-view-dealer-invoices');
    viewInvBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dealerId = btn.dataset.id;
        store.setDealer(dealerId);
        if (window.AppModals) {
          window.AppModals.openOverdueInvoicesModal();
        }
      });
    });

    // 4. Tất toán hóa đơn thử nghiệm
    const settleBtns = this.container.querySelectorAll('.btn-settle-invoice');
    settleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const dealerId = btn.dataset.dealer;
        const invoiceNo = btn.dataset.invoice;
        store.settleOverdueInvoice(dealerId, invoiceNo);
        if (window.AppNotifications) {
          window.AppNotifications.toast('success', `Đã tất toán hóa đơn ${invoiceNo} thành công! Công nợ và trạng thái khóa đã được cập nhật lại.`);
        }
      });
    });
  }
}
