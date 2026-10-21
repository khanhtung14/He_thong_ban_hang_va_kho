/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Enterprise Modal Dialogs System
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { store } from './store.js';
import { CreditRiskEngine } from './creditEngine.js';

export class ModalManager {
  constructor() {
    this.modalOverlay = document.getElementById('globalModalOverlay');
    this.modalContainer = document.getElementById('globalModalContainer');
    this.activeModal = null;
    this.initCloseListeners();
  }

  initCloseListeners() {
    if (this.modalOverlay) {
      this.modalOverlay.addEventListener('click', (e) => {
        if (e.target === this.modalOverlay) {
          this.close();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.close();
      }
    });
  }

  open(contentHtml, customClass = '') {
    if (!this.modalOverlay || !this.modalContainer) return;
    this.modalContainer.className = `modal-dialog-box ${customClass}`;
    this.modalContainer.innerHTML = contentHtml;
    this.modalOverlay.classList.add('active');
    this.activeModal = true;
    document.body.style.overflow = 'hidden';

    // Auto bind close buttons
    const closeBtns = this.modalContainer.querySelectorAll('.btn-close-modal, .modal-close-icon');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });
  }

  close() {
    if (!this.modalOverlay) return;
    this.modalOverlay.classList.remove('active');
    this.activeModal = null;
    document.body.style.overflow = '';
  }

  // MODAL 1: PHIẾU ĐỀ XUẤT DUYỆT VƯỢT HẠN MỨC (TIÊU CHÍ 2)
  openApprovalRequestModal() {
    const state = store.getState();
    const { currentDealer, cartTotals, creditEvaluation } = state;

    const html = `
      <div class="modal-header header-warning">
        <div class="modal-title-wrap">
          <i class="ph-fill ph-file-text modal-header-icon"></i>
          <div>
            <h3 class="modal-title">Phiếu Đề Xuất Phê Duyệt Vượt Hạn Mức Tín Dụng</h3>
            <span class="modal-subtitle">Trình Kế toán trưởng & Ban Giám Đốc xem xét ngoại lệ</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        
        <!-- BẢNG ĐỐI CHIẾU THẨM ĐỊNH TÀI CHÍNH TỨC THỜI -->
        <div class="credit-audit-comparison">
          <div class="audit-row">
            <span class="audit-label">Đại lý đề xuất:</span>
            <span class="audit-value font-bold">${currentDealer.name} (${currentDealer.code})</span>
          </div>
          <div class="audit-row">
            <span class="audit-label">Hạn mức tín dụng được cấp:</span>
            <span class="audit-value font-mono font-bold">${CreditRiskEngine.formatVND(creditEvaluation.creditLimit)}</span>
          </div>
          <div class="audit-row">
            <span class="audit-label">Công nợ hiện tại:</span>
            <span class="audit-value font-mono">${CreditRiskEngine.formatVND(creditEvaluation.currentDebt)}</span>
          </div>
          <div class="audit-row">
            <span class="audit-label">Giá trị đơn hàng mới:</span>
            <span class="audit-value font-mono text-primary font-bold">${CreditRiskEngine.formatVND(cartTotals.grandTotal)}</span>
          </div>
          <div class="audit-row row-danger">
            <span class="audit-label font-bold text-danger">Tổng nợ dự kiến sau đơn:</span>
            <span class="audit-value font-mono font-bold text-danger">${CreditRiskEngine.formatVND(creditEvaluation.projectedTotalDebt)}</span>
          </div>
          <div class="audit-row row-danger-highlight">
            <span class="audit-label font-bold">Số tiền vượt hạn mức (+):</span>
            <span class="audit-value font-mono font-bold text-danger text-lg">+ ${CreditRiskEngine.formatVND(creditEvaluation.exceededAmount)}</span>
          </div>
        </div>

        <!-- FORM NHẬP LÝ DO & CAM KẾT THANH TOÁN CỦA SALES -->
        <form id="formApprovalRequest" class="approval-form">
          <div class="form-group">
            <label class="form-label" for="approvalReasonInput">
              Lý do xin duyệt vượt hạn mức <span class="text-danger">*</span>:
            </label>
            
            <!-- Quick tags -->
            <div class="quick-tags-container">
              <span class="quick-tag" data-text="Khách hàng tham gia đấu thầu dự án trọng điểm cấp bách">🎯 Dự án cấp bách</span>
              <span class="quick-tag" data-text="Khách cam kết chuyển khoản thanh toán khoản nợ cũ trong vòng 5 ngày làm việc">⏱️ Cam kết trả trong 5 ngày</span>
              <span class="quick-tag" data-text="Đã có Thư bảo lãnh thanh toán của Ngân hàng Vietcombank">🏦 Có bảo lãnh ngân hàng</span>
              <span class="quick-tag" data-text="Đại lý chiến lược VIP Tier 1, doanh thu cam kết quý trên 5 tỷ">⭐ Đối tác VIP chiến lược</span>
            </div>

            <textarea id="approvalReasonInput" class="form-textarea" rows="3" 
                      placeholder="Nhập giải trình lý do xuất kho vượt hạn mức cho đơn hàng này..." required>Khách hàng tham gia đấu thầu dự án trọng điểm cấp bách, đại lý cam kết thanh toán đợt 1 trong 7 ngày tới.</textarea>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" for="commitmentDateInput">
                Ngày cam kết thanh toán <span class="text-danger">*</span>:
              </label>
              <input type="date" id="commitmentDateInput" class="form-input" 
                     value="2026-10-27" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="approverSelect">
                Cấp phê duyệt thẩm quyền:
              </label>
              <select id="approverSelect" class="form-select">
                <option value="Kế toán trưởng (KTT)">Kế toán trưởng</option>
                <option value="Giám đốc Tài chính (CFO)">Giám đốc Tài chính (CFO)</option>
                <option value="Tổng Giám Đốc (CEO)">Tổng Giám Đốc (CEO)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="collateralInput">
              Tài sản bảo lãnh / Chứng từ kèm theo (nếu có):
            </label>
            <input type="text" id="collateralInput" class="form-input" 
                   placeholder="Ví dụ: Giấy cam kết thanh toán số 42/CK-AD, Thư bảo lãnh BIDV...">
          </div>
        </form>

      </div>

      <div class="modal-footer">
        <button class="btn btn-outline btn-close-modal">Hủy bỏ</button>
        <button class="btn btn-warning" id="btnConfirmSubmitApproval">
          <i class="ph-bold ph-paper-plane-tilt"></i> Xác Nhận Gửi Phê Duyệt
        </button>
      </div>
    `;

    this.open(html, 'modal-md');

    // Quick tag insert
    const tags = this.modalContainer.querySelectorAll('.quick-tag');
    const reasonTextarea = this.modalContainer.querySelector('#approvalReasonInput');
    tags.forEach(tag => {
      tag.addEventListener('click', () => {
        if (reasonTextarea) {
          reasonTextarea.value = tag.dataset.text;
        }
      });
    });

    // Handle submit
    const btnSubmit = this.modalContainer.querySelector('#btnConfirmSubmitApproval');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', () => {
        const reason = reasonTextarea?.value.trim();
        const commitmentDate = this.modalContainer.querySelector('#commitmentDateInput')?.value;
        const approver = this.modalContainer.querySelector('#approverSelect')?.value;
        const collateral = this.modalContainer.querySelector('#collateralInput')?.value;

        if (!reason) {
          alert('Vui lòng nhập lý do giải trình vượt hạn mức!');
          return;
        }

        try {
          const order = store.submitOrder({
            reason,
            commitmentDate,
            approver,
            collateral
          });

          this.close();

          if (window.AppNotifications) {
            window.AppNotifications.toast(
              'warning',
              `Đơn hàng #${order.orderNo} đã tạo với trạng thái [CẦN DUYỆT] và chuyển tới ${approver}!`
            );
          }

          if (window.AppModals) {
            window.AppModals.openOrderSuccessModal(order);
          }
        } catch (err) {
          alert(err.message);
        }
      });
    }
  }

  // MODAL 2: BẢNG KÊ HÓA ĐƠN QUÁ HẠN (TIÊU CHÍ 3)
  openOverdueInvoicesModal() {
    const state = store.getState();
    const { currentDealer, config } = state;
    const unpaidInvoices = currentDealer.unpaidInvoices || [];
    const maxAllowed = config.defaultMaxOverdueDays;

    const html = `
      <div class="modal-header header-danger">
        <div class="modal-title-wrap">
          <i class="ph-fill ph-lock-key modal-header-icon"></i>
          <div>
            <h3 class="modal-title">Bảng Kê Hóa Đơn Nợ Quá Hạn & Lý Do Khóa Cổng</h3>
            <span class="modal-subtitle">Đại lý: ${currentDealer.name} (${currentDealer.code})</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        
        <div class="lock-explanation-banner">
          <div class="banner-title">
            <i class="ph-bold ph-warning-octagon"></i> QUY ĐỊNH CHẶN TẠO ĐƠN DO NỢ QUÁ HẠN:
          </div>
          <p>
            Theo Điều 4 Quy chế Tín dụng Doanh nghiệp: Nếu đại lý phát sinh bất kỳ hóa đơn nào quá hạn thanh toán 
            vượt quá <strong>${maxAllowed} ngày</strong>, hệ thống tự động <strong>KHÓA TOÀN BỘ QUYỀN TẠO ĐƠN</strong> 
            cho đến khi khách hàng hoàn tất việc thanh toán hoặc kế toán ghi nhận tất toán nợ.
          </p>
        </div>

        <div class="table-container modal-table">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Số Hóa Đơn</th>
                <th>Mã Đơn Gốc</th>
                <th>Ngày Phát Hành</th>
                <th>Hạn Thanh Toán</th>
                <th>Số Tiền Nợ</th>
                <th>Số Ngày Quá Hạn</th>
                <th>Tình Trạng</th>
                <th class="text-right">Tất Toán Test</th>
              </tr>
            </thead>
            <tbody>
              ${unpaidInvoices.length === 0 ? `
                <tr><td colspan="8" class="table-empty-row">Không có hóa đơn nợ quá hạn.</td></tr>
              ` : unpaidInvoices.map(inv => {
                const isViolating = (inv.overdueDays || 0) > maxAllowed;
                return `
                  <tr class="${isViolating ? 'row-violating' : ''}">
                    <td class="font-mono font-bold">${inv.invoiceNo}</td>
                    <td class="font-mono text-muted">${inv.orderNo}</td>
                    <td class="font-mono">${inv.issueDate}</td>
                    <td class="font-mono">${inv.dueDate}</td>
                    <td class="font-mono font-bold text-danger">${CreditRiskEngine.formatVND(inv.remainingAmount)}</td>
                    <td>
                      <span class="font-mono font-bold ${isViolating ? 'text-danger' : 'text-warning'}">
                        ${inv.overdueDays} ngày
                      </span>
                    </td>
                    <td>
                      ${isViolating ? `
                        <span class="badge badge-danger font-bold">Vi phạm (> ${maxAllowed}d)</span>
                      ` : `
                        <span class="badge badge-warning">Trong ân hạn</span>
                      `}
                    </td>
                    <td class="text-right">
                      <button class="btn btn-sm btn-light btn-settle-modal" 
                              data-invoice="${inv.invoiceNo}" 
                              title="Tất toán ngay hóa đơn này để kiểm tra mở khóa">
                        <i class="ph-bold ph-hand-coins"></i> Trả nợ (Test)
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

      </div>

      <div class="modal-footer">
        <span class="text-muted text-sm">
          <i class="ph-bold ph-lightbulb"></i> Bạn có thể click <strong>"Trả nợ (Test)"</strong> để giả lập khách hàng thanh toán và thấy hệ thống mở khóa ngay lập tức!
        </span>
        <button class="btn btn-outline btn-close-modal">Đóng</button>
      </div>
    `;

    this.open(html, 'modal-lg');

    // Attach settle test events
    const settleBtns = this.modalContainer.querySelectorAll('.btn-settle-modal');
    settleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const invNo = btn.dataset.invoice;
        store.settleOverdueInvoice(currentDealer.id, invNo);
        if (window.AppNotifications) {
          window.AppNotifications.toast('success', `Đã ghi nhận thanh toán hóa đơn ${invNo}!`);
        }
        this.close();
      });
    });
  }

  // MODAL 3: THÔNG BÁO TẠO ĐƠN THÀNH CÔNG
  openOrderSuccessModal(order) {
    const isPending = order.status === 'PENDING_APPROVAL';

    const html = `
      <div class="modal-header ${isPending ? 'header-warning' : 'header-success'}">
        <div class="modal-title-wrap">
          <i class="ph-fill ${isPending ? 'ph-hourglass-high' : 'ph-check-circle'} modal-header-icon"></i>
          <div>
            <h3 class="modal-title">${isPending ? 'Đơn Hàng Đã Gửi Phê Duyệt Công Nợ' : 'Tạo Đơn Hàng Thành Công!'}</h3>
            <span class="modal-subtitle">Mã đơn: #${order.orderNo} | Đại lý: ${order.dealerName}</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        
        <div class="success-order-card">
          <div class="status-callout ${isPending ? 'callout-warning' : 'callout-success'}">
            <div class="callout-title font-bold">
              Trạng thái đơn hàng: ${order.statusLabel}
            </div>
            <p class="callout-text">
              ${isPending 
                ? 'Đơn hàng đã được đánh dấu CẦN DUYỆT và chuyển tới Kế toán trưởng thẩm định bảo lãnh công nợ.' 
                : 'Đơn hàng nằm trọn trong hạn mức tín dụng và được xác nhận tức thời, sẵn sàng xuất kho.'}
            </p>
          </div>

          <div class="order-receipt-summary">
            <div class="receipt-row">
              <span>Đại lý mua hàng:</span>
              <strong>${order.dealerName}</strong>
            </div>
            <div class="receipt-row">
              <span>Nhân viên phụ trách:</span>
              <span>${order.salesRep}</span>
            </div>
            <div class="receipt-row">
              <span>Thời gian lập:</span>
              <span class="font-mono">${order.createdAt}</span>
            </div>
            <div class="receipt-row">
              <span>Tổng thanh toán (gồm VAT):</span>
              <strong class="font-mono text-primary text-lg">${CreditRiskEngine.formatVND(order.totalAmount)}</strong>
            </div>
            ${isPending ? `
              <div class="receipt-row">
                <span>Lý do vượt hạn mức:</span>
                <span class="text-italic text-warning">"${order.approvalReason}"</span>
              </div>
            ` : ''}
          </div>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn btn-outline btn-close-modal">Tạo đơn tiếp theo</button>
        <button class="btn btn-primary" id="btnGoToApprovalScreen">
          <i class="ph-bold ph-list-checks"></i> Xem trong Danh Sách Đơn Hàng
        </button>
      </div>
    `;

    this.open(html, 'modal-md');

    const btnGo = this.modalContainer.querySelector('#btnGoToApprovalScreen');
    if (btnGo) {
      btnGo.addEventListener('click', () => {
        this.close();
        if (window.AppNavigation) {
          window.AppNavigation.switchTab('approval-screen');
        }
      });
    }
  }

  // MODAL 4: XEM CHI TIẾT ĐƠN HÀNG
  openOrderDetailModal(orderId) {
    const state = store.getState();
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const html = `
      <div class="modal-header">
        <div class="modal-title-wrap">
          <i class="ph-fill ph-receipt modal-header-icon"></i>
          <div>
            <h3 class="modal-title">Chi Tiết Đơn Hàng #${order.orderNo}</h3>
            <span class="modal-subtitle">Ngày tạo: ${order.createdAt}</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        
        <div class="order-detail-meta-grid">
          <div>
            <span class="text-muted text-sm">Đại lý:</span>
            <div class="font-bold">${order.dealerName}</div>
          </div>
          <div>
            <span class="text-muted text-sm">Nhân viên phụ trách:</span>
            <div>${order.salesRep}</div>
          </div>
          <div>
            <span class="text-muted text-sm">Trạng thái:</span>
            <div><span class="badge badge-warning">${order.statusLabel}</span></div>
          </div>
          <div>
            <span class="text-muted text-sm">Kiểm soát tín dụng:</span>
            <div class="text-sm font-semibold">${order.creditCheckSummary}</div>
          </div>
        </div>

        <div class="table-container modal-table mt-4">
          <table class="enterprise-table">
            <thead>
              <tr>
                <th>Tên Sản Phẩm</th>
                <th class="text-center">Số Lượng</th>
                <th class="text-right">Đơn Giá</th>
                <th class="text-right">Thành Tiền</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map(item => `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td class="text-center font-mono">${item.quantity}</td>
                  <td class="text-right font-mono">${CreditRiskEngine.formatVND(item.price)}</td>
                  <td class="text-right font-mono font-bold">${CreditRiskEngine.formatVND(item.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" class="text-right font-semibold">Tạm tính trước thuế:</td>
                <td class="text-right font-mono">${CreditRiskEngine.formatVND(order.totalBeforeVat)}</td>
              </tr>
              <tr>
                <td colspan="3" class="text-right font-semibold">Thuế GTGT (VAT 10%):</td>
                <td class="text-right font-mono">${CreditRiskEngine.formatVND(order.vatAmount)}</td>
              </tr>
              <tr class="row-grand-total">
                <td colspan="3" class="text-right font-bold text-lg">TỔNG CỘNG:</td>
                <td class="text-right font-mono font-bold text-primary text-lg">${CreditRiskEngine.formatVND(order.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

      </div>

      <div class="modal-footer">
        <button class="btn btn-outline btn-close-modal">Đóng</button>
      </div>
    `;

    this.open(html, 'modal-lg');
  }

  // MODAL 5: XÁC NHẬN PHÊ DUYỆT ĐƠN (KẾ TOÁN TRƯỞNG)
  openConfirmApprovalModal(orderId) {
    const state = store.getState();
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const html = `
      <div class="modal-header header-success">
        <div class="modal-title-wrap">
          <i class="ph-fill ph-seal-check modal-header-icon"></i>
          <div>
            <h3 class="modal-title">Phê Duyệt Đơn Hàng Vượt Hạn Mức</h3>
            <span class="modal-subtitle">Đơn hàng: #${order.orderNo} | Đại lý: ${order.dealerName}</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        <p>
          Bạn đang đóng vai trò <strong>Kế toán trưởng / Giám đốc Tài chính</strong>.
          <br>
          Bạn có đồng ý phê duyệt ngoại lệ cho đơn hàng <strong>${CreditRiskEngine.formatVND(order.totalAmount)}</strong> này để tiến hành xuất kho?
        </p>
        <div class="form-group mt-3">
          <label class="form-label" for="approverNoteInput">Ghi chú phê duyệt của Kế toán:</label>
          <input type="text" id="approverNoteInput" class="form-input" 
                 value="Đồng ý cấp ngoại lệ, yêu cầu đại lý thanh toán đúng cam kết ngày ${order.paymentCommitmentDate || 'hạn tới'}.">
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline btn-close-modal">Hủy</button>
        <button class="btn btn-success" id="btnDoApprove">
          <i class="ph-bold ph-check"></i> Xác Nhận Phê Duyệt
        </button>
      </div>
    `;

    this.open(html, 'modal-md');

    const btnApprove = this.modalContainer.querySelector('#btnDoApprove');
    if (btnApprove) {
      btnApprove.addEventListener('click', () => {
        const note = this.modalContainer.querySelector('#approverNoteInput')?.value;
        store.approveOrder(orderId, note);
        this.close();
        if (window.AppNotifications) {
          window.AppNotifications.toast('success', `Đơn hàng #${order.orderNo} đã được Kế toán phê duyệt thành công!`);
        }
      });
    }
  }

  // MODAL 6: TỪ CHỐI ĐƠN HÀNG
  openConfirmRejectModal(orderId) {
    const state = store.getState();
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return;

    const html = `
      <div class="modal-header header-danger">
        <div class="modal-title-wrap">
          <i class="ph-fill ph-x-circle modal-header-icon"></i>
          <div>
            <h3 class="modal-title">Từ Chối Đơn Hàng Vượt Hạn Mức</h3>
            <span class="modal-subtitle">Đơn hàng: #${order.orderNo} | Đại lý: ${order.dealerName}</span>
          </div>
        </div>
        <button class="modal-close-icon"><i class="ph-bold ph-x"></i></button>
      </div>

      <div class="modal-body">
        <p>
          Từ chối đơn hàng sẽ chuyển trạng thái sang <strong>TỪ CHỐI (REJECTED)</strong> và không ghi nhận công nợ.
        </p>
        <div class="form-group mt-3">
          <label class="form-label" for="rejectReasonInput">Lý do từ chối:</label>
          <input type="text" id="rejectReasonInput" class="form-input" 
                 value="Rủi ro công nợ cao, đại lý cần thu xếp trả bớt nợ cũ trước khi cấp hạn mức mới.">
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-outline btn-close-modal">Hủy</button>
        <button class="btn btn-danger" id="btnDoReject">
          <i class="ph-bold ph-x"></i> Xác Nhận Từ Chối
        </button>
      </div>
    `;

    this.open(html, 'modal-md');

    const btnReject = this.modalContainer.querySelector('#btnDoReject');
    if (btnReject) {
      btnReject.addEventListener('click', () => {
        const reason = this.modalContainer.querySelector('#rejectReasonInput')?.value;
        store.rejectOrder(orderId, reason);
        this.close();
        if (window.AppNotifications) {
          window.AppNotifications.toast('error', `Đơn hàng #${order.orderNo} đã bị từ chối.`);
        }
      });
    }
  }
}
