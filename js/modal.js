/**
 * Order Detail Modal Component
 * Xem chi tiết đơn hàng, timeline giao vận, chi tiết hóa đơn & in phiếu giao hàng
 */

import { AGENTS, REGIONS, USERS, ORDER_STATUSES } from './mockData.js';
import { formatCurrencyVND } from './kpi.js';
import { orderStore } from './store.js';

export function setupOrderDetailModal() {
  const modalContainer = document.getElementById('order-detail-modal-container');

  function open(order) {
    const agent = AGENTS.find(a => a.id === order.agentId) || { name: order.agentId, phone: '', address: '' };
    const region = REGIONS.find(r => r.id === order.regionId) || { name: order.regionId };
    const salesRep = USERS.find(u => u.id === order.salesRepId) || { name: 'Chưa phân công', email: '', avatar: '' };
    const statusMeta = ORDER_STATUSES.find(s => s.id === order.status) || { label: order.status, color: '#94a3b8' };

    const subTotal = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalDiscount = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity * (item.discount / 100)), 0);

    const html = `
      <div class="modal-backdrop animate-fade-in" id="modal-backdrop">
        <div class="modal-card animate-scale-up" id="modal-card">
          <!-- Header Modal -->
          <div class="modal-header">
            <div class="modal-title-wrap">
              <div class="modal-order-id-group">
                <span class="modal-code">${order.id}</span>
                <span class="status-badge status-${order.status}">
                  <span class="status-dot"></span>
                  ${statusMeta.label}
                </span>
              </div>
              <span class="modal-subtitle">Thời gian đặt: ${new Date(order.createdAt).toLocaleString('vi-VN')}</span>
            </div>
            <div class="modal-header-actions">
              <button class="btn btn-secondary btn-sm" id="btn-print-invoice">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                In phiếu giao hàng
              </button>
              <button class="modal-close-btn" id="modal-close-btn" title="Đóng modal">✕</button>
            </div>
          </div>

          <!-- Body Modal -->
          <div class="modal-body">
            <!-- Stepper Timeline trạng thái đơn hàng -->
            <div class="order-stepper-box">
              <div class="stepper-step ${getStepClass(order.status, 'pending')}">
                <div class="step-circle">1</div>
                <div class="step-label">Tiếp nhận đơn</div>
              </div>
              <div class="stepper-line ${getLineClass(order.status, 'processing')}"></div>
              <div class="stepper-step ${getStepClass(order.status, 'processing')}">
                <div class="step-circle">2</div>
                <div class="step-label">Đóng gói kho</div>
              </div>
              <div class="stepper-line ${getLineClass(order.status, 'shipping')}"></div>
              <div class="stepper-step ${getStepClass(order.status, 'shipping')}">
                <div class="step-circle">3</div>
                <div class="step-label">Đang vận chuyển</div>
              </div>
              <div class="stepper-line ${getLineClass(order.status, 'completed')}"></div>
              <div class="stepper-step ${getStepClass(order.status, 'completed')}">
                <div class="step-circle">4</div>
                <div class="step-label">Hoàn tất giao</div>
              </div>
            </div>

            <!-- Grid thông tin khách hàng & Đại lý phụ trách -->
            <div class="modal-info-grid">
              <!-- Cột 1: Khách hàng & Giao nhận -->
              <div class="info-panel">
                <div class="info-panel-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Thông tin khách hàng & Giao nhận
                </div>
                <div class="info-list">
                  <div class="info-item">
                    <span class="info-k">Họ và tên / Đơn vị:</span>
                    <span class="info-v font-bold text-light">${order.customer.name}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Số điện thoại:</span>
                    <span class="info-v text-cyan">${order.customer.phone}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Địa chỉ nhận hàng:</span>
                    <span class="info-v">${order.customer.address}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Ghi chú đơn hàng:</span>
                    <span class="info-v text-amber">${order.notes || 'Không có ghi chú'}</span>
                  </div>
                </div>
              </div>

              <!-- Cột 2: Đại lý, Nhân viên & Thanh toán -->
              <div class="info-panel">
                <div class="info-panel-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  Đại lý phụ trách & Thanh toán
                </div>
                <div class="info-list">
                  <div class="info-item">
                    <span class="info-k">Đại lý phân phối:</span>
                    <span class="info-v font-bold">${agent.name}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Khu vực địa lý:</span>
                    <span class="info-v"><span class="region-pill region-${order.regionId.toLowerCase()}">${region.name}</span></span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Nhân viên phụ trách:</span>
                    <span class="info-v text-light">${salesRep.name} (${salesRep.email})</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Phương thức thanh toán:</span>
                    <span class="info-v font-medium">${order.paymentMethod}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-k">Tình trạng thanh toán:</span>
                    <span class="info-v text-emerald font-bold">${order.paymentStatus}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Bảng danh mục sản phẩm chi tiết -->
            <div class="modal-table-wrap">
              <h4 class="modal-section-title">Chi tiết sản phẩm đặt hàng</h4>
              <table class="modal-items-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Tên sản phẩm</th>
                    <th>Phân loại</th>
                    <th class="text-right">Đơn giá</th>
                    <th class="text-center">Số lượng</th>
                    <th class="text-right">Chiết khấu</th>
                    <th class="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map((item, idx) => {
                    const itemTotal = item.quantity * item.unitPrice * (1 - item.discount / 100);
                    return `
                      <tr>
                        <td>${idx + 1}</td>
                        <td class="font-medium text-light">${item.product.name}</td>
                        <td><span class="category-pill">${item.product.category}</span></td>
                        <td class="text-right">${formatCurrencyVND(item.unitPrice)}</td>
                        <td class="text-center font-bold">${item.quantity}</td>
                        <td class="text-right text-amber">${item.discount > 0 ? `-${item.discount}%` : '0%'}</td>
                        <td class="text-right font-bold text-light">${formatCurrencyVND(itemTotal)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Tổng kết tài chính đơn hàng -->
            <div class="modal-financial-summary">
              <div class="summary-line">
                <span>Tạm tính tiền hàng:</span>
                <span>${formatCurrencyVND(subTotal)}</span>
              </div>
              <div class="summary-line">
                <span>Tổng chiết khấu khuyến mại:</span>
                <span class="text-rose">-${formatCurrencyVND(totalDiscount)}</span>
              </div>
              <div class="summary-line line-total">
                <span class="text-light font-bold">Tổng tiền thanh toán cuối cùng:</span>
                <span class="text-emerald font-bold text-xl">${formatCurrencyVND(order.totalAmount)}</span>
              </div>
            </div>

            <!-- Thanh thay đổi trạng thái nhanh bên trong modal -->
            <div class="modal-status-changer">
              <span class="modal-status-label">Cập nhật trạng thái đơn này:</span>
              <div class="status-btn-group">
                <button class="status-action-btn ${order.status === 'pending' ? 'active' : ''}" data-change="pending">Chờ duyệt</button>
                <button class="status-action-btn ${order.status === 'processing' ? 'active' : ''}" data-change="processing">Đang xử lý</button>
                <button class="status-action-btn ${order.status === 'shipping' ? 'active' : ''}" data-change="shipping">Đang giao hàng</button>
                <button class="status-action-btn ${order.status === 'completed' ? 'active' : ''}" data-change="completed">Đã hoàn thành</button>
                <button class="status-action-btn ${order.status === 'cancelled' ? 'active' : ''}" data-change="cancelled">Hủy đơn</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    modalContainer.innerHTML = html;

    // Events
    const backdrop = modalContainer.querySelector('#modal-backdrop');
    const closeBtn = modalContainer.querySelector('#modal-close-btn');

    const closeModal = () => {
      modalContainer.innerHTML = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
      });
    }

    // Change status from modal
    modalContainer.querySelectorAll('.status-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const newStatus = e.currentTarget.dataset.change;
        orderStore.updateOrderStatus(order.id, newStatus);
        order.status = newStatus;
        if (window.showToast) {
          window.showToast(`Đã chuyển đơn ${order.id} sang trạng thái "${ORDER_STATUSES.find(s => s.id === newStatus)?.label}"`, 'success');
        }
        open(order); // Re-render modal with updated status
      });
    });

    // Print invoice
    const printBtn = modalContainer.querySelector('#btn-print-invoice');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }
  }

  function getStepClass(currentStatus, stepName) {
    if (currentStatus === 'cancelled') return 'step-cancelled';
    const orderLevels = { pending: 1, processing: 2, shipping: 3, completed: 4 };
    const stepLevels = { pending: 1, processing: 2, shipping: 3, completed: 4 };
    const curLevel = orderLevels[currentStatus] || 1;
    const thisLevel = stepLevels[stepName] || 1;

    if (curLevel > thisLevel) return 'step-done';
    if (curLevel === thisLevel) return 'step-active';
    return 'step-inactive';
  }

  function getLineClass(currentStatus, targetStep) {
    if (currentStatus === 'cancelled') return '';
    const orderLevels = { pending: 1, processing: 2, shipping: 3, completed: 4 };
    const curLevel = orderLevels[currentStatus] || 1;
    const targetLevels = { processing: 2, shipping: 3, completed: 4 };
    if (curLevel >= targetLevels[targetStep]) return 'line-active';
    return '';
  }

  return { open };
}
