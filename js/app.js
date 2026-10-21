/**
 * MAIN CONTROLLER & APPLICATION ENTRY POINT
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

import { OrderManager } from './orderManager.js';
import { PrintService } from './printService.js';
import { WarehouseScannerSimulator } from './scannerSimulator.js';
import { SignaturePad } from './signaturePad.js';
import { AGENCIES, PRODUCTS, SALES_REPRESENTATIVES } from './mockData.js';
import { formatCurrency } from './numberToWords.js';

class NexusPrintApp {
  constructor() {
    this.orderManager = new OrderManager();
    this.printService = new PrintService(this.orderManager);
    this.scannerSimulator = new WarehouseScannerSimulator(this.orderManager);
    this.signaturePad = null;
    this.zoomLevel = 1.0;

    this.dom = {
      // Containers
      paperContainer: document.getElementById('paper-container'),
      orderListScroller: document.getElementById('order-list-scroller'),
      zoomLevelText: document.getElementById('zoom-level-text'),
      
      // Buttons
      btnPrint: document.getElementById('btn-print'),
      btnExportPdf: document.getElementById('btn-export-pdf'),
      btnOpenSignModal: document.getElementById('btn-open-sign-modal'),
      btnOpenScannerModal: document.getElementById('btn-open-scanner-modal'),
      btnOpenNewOrderModal: document.getElementById('btn-open-new-order-modal'),
      btnZoomIn: document.getElementById('btn-zoom-in'),
      btnZoomOut: document.getElementById('btn-zoom-out'),
      btnZoomFit: document.getElementById('btn-zoom-fit'),

      // Format toggles
      btnProfileA4: document.getElementById('toggle-profile-a4'),
      btnProfileK80: document.getElementById('toggle-profile-k80'),

      // Option checkboxes
      chkLogo: document.getElementById('chk-show-logo'),
      chkBarcode: document.getElementById('chk-show-barcode'),
      chkQRCode: document.getElementById('chk-show-qrcode'),
      chkSignatures: document.getElementById('chk-show-signatures'),
      chkWatermark: document.getElementById('chk-show-watermark'),
      chkTerms: document.getElementById('chk-show-terms'),

      // Modals
      signModal: document.getElementById('sign-modal'),
      scannerModal: document.getElementById('scanner-modal'),
      newOrderModal: document.getElementById('new-order-modal'),

      // Sign Modal Elements
      signCanvas: document.getElementById('signature-canvas'),
      signerNameInput: document.getElementById('signer-name-input'),
      btnClearSign: document.getElementById('btn-clear-signature'),
      btnSampleSign: document.getElementById('btn-sample-signature'),
      btnApplySign: document.getElementById('btn-apply-signature'),

      // Scanner Modal Elements
      scanInput: document.getElementById('scanner-barcode-input'),
      btnTriggerScan: document.getElementById('btn-trigger-scan'),
      scannerResultBox: document.getElementById('scanner-result-box'),

      // New Order Modal Elements
      newOrderAgencySelect: document.getElementById('new-order-agency-select'),
      newOrderProductSelect: document.getElementById('new-order-product-select'),
      newOrderQtyInput: document.getElementById('new-order-qty-input'),
      newOrderDiscountInput: document.getElementById('new-order-discount-input'),
      newOrderDeliveryDate: document.getElementById('new-order-delivery-date'),
      newOrderNotes: document.getElementById('new-order-notes'),
      newOrderItemsTableBody: document.getElementById('new-order-items-tbody'),
      btnAddOrderItem: document.getElementById('btn-add-order-item'),
      btnSubmitNewOrder: document.getElementById('btn-submit-new-order'),
      newOrderSubtotalPreview: document.getElementById('new-order-subtotal-preview'),

      // Role switcher in header
      salesRepSelect: document.getElementById('sales-rep-select'),
      repAvatar: document.getElementById('active-rep-avatar'),
      repName: document.getElementById('active-rep-name'),
      repRole: document.getElementById('active-rep-role')
    };

    this.draftItems = [];
    this.init();
  }

  init() {
    this._initSignaturePad();
    this._bindEvents();
    this._renderOrderSelectorList();
    this._renderInvoicePreview();
    this._populateNewOrderDropdowns();

    // Lắng nghe thay đổi từ orderManager
    this.orderManager.subscribe(() => {
      this._renderOrderSelectorList();
      this._renderInvoicePreview();
    });
  }

  _initSignaturePad() {
    if (this.dom.signCanvas) {
      this.signaturePad = new SignaturePad(this.dom.signCanvas);
    }
  }

  _bindEvents() {
    // In ấn & Xuất PDF
    this.dom.btnPrint?.addEventListener('click', () => {
      this.printService.printInvoice();
    });

    this.dom.btnExportPdf?.addEventListener('click', async () => {
      const activeOrder = this.orderManager.getActiveOrder();
      if (!activeOrder) return;
      this.dom.btnExportPdf.classList.add('loading');
      this.dom.btnExportPdf.innerText = 'Đang tạo PDF...';
      try {
        await this.printService.exportPDF(activeOrder);
      } finally {
        this.dom.btnExportPdf.classList.remove('loading');
        this.dom.btnExportPdf.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Xuất PDF</span>
        `;
      }
    });

    // Profile Toggles (A4 vs K80)
    this.dom.btnProfileA4?.addEventListener('click', () => {
      this.printService.setProfile('a4');
      this.dom.btnProfileA4.classList.add('active');
      this.dom.btnProfileK80.classList.remove('active');
      this._renderInvoicePreview();
    });

    this.dom.btnProfileK80?.addEventListener('click', () => {
      this.printService.setProfile('k80');
      this.dom.btnProfileK80.classList.add('active');
      this.dom.btnProfileA4.classList.remove('active');
      this._renderInvoicePreview();
    });

    // Options Checkboxes
    const optCheckboxes = [
      { el: this.dom.chkLogo, key: 'showLogo' },
      { el: this.dom.chkBarcode, key: 'showBarcode' },
      { el: this.dom.chkQRCode, key: 'showQRCode' },
      { el: this.dom.chkSignatures, key: 'showSignatures' },
      { el: this.dom.chkWatermark, key: 'showWatermark' },
      { el: this.dom.chkTerms, key: 'showTerms' }
    ];

    optCheckboxes.forEach(({ el, key }) => {
      el?.addEventListener('change', () => {
        this.printService.updateOptions({ [key]: el.checked });
        this._renderInvoicePreview();
      });
    });

    // Zoom Controls
    this.dom.btnZoomIn?.addEventListener('click', () => this._changeZoom(0.1));
    this.dom.btnZoomOut?.addEventListener('click', () => this._changeZoom(-0.1));
    this.dom.btnZoomFit?.addEventListener('click', () => this._resetZoom());

    // Role Switcher in Header
    this.dom.salesRepSelect?.addEventListener('change', (e) => {
      const repId = e.target.value;
      const rep = SALES_REPRESENTATIVES.find(r => r.id === repId);
      if (rep) {
        this.dom.repAvatar.src = rep.avatar;
        this.dom.repName.innerText = rep.name;
        this.dom.repRole.innerText = rep.role;
        // Cập nhật người lập đơn cho đơn hiện tại
        const activeOrder = this.orderManager.getActiveOrder();
        if (activeOrder) {
          activeOrder.salesRepId = repId;
          this._renderInvoicePreview();
        }
      }
    });

    // Modal Events
    this._bindModalEvents();
  }

  _bindModalEvents() {
    // 1. Signature Modal
    this.dom.btnOpenSignModal?.addEventListener('click', () => {
      const activeOrder = this.orderManager.getActiveOrder();
      const agency = this.orderManager.getAgency(activeOrder?.agencyId);
      if (this.dom.signerNameInput) {
        this.dom.signerNameInput.value = activeOrder?.signedByAgent?.signerName || agency?.representative || '';
      }
      this.signaturePad?.clear();
      this._openModal(this.dom.signModal);
    });

    this.dom.btnClearSign?.addEventListener('click', () => {
      this.signaturePad?.clear();
    });

    this.dom.btnSampleSign?.addEventListener('click', () => {
      const name = this.dom.signerNameInput?.value || 'Vũ Mạnh Cường';
      this.signaturePad?.generateSampleSignature(name);
    });

    this.dom.btnApplySign?.addEventListener('click', () => {
      const name = this.dom.signerNameInput?.value.trim() || 'Đại diện Đại lý';
      let dataUrl = null;
      if (!this.signaturePad?.isEmpty()) {
        dataUrl = this.signaturePad.toDataURL();
      }
      this.orderManager.signActiveOrder(name, dataUrl);
      this._closeModal(this.dom.signModal);
    });

    // 2. Scanner Simulator Modal
    this.dom.btnOpenScannerModal?.addEventListener('click', () => {
      const activeOrder = this.orderManager.getActiveOrder();
      if (this.dom.scanInput && activeOrder) {
        this.dom.scanInput.value = activeOrder.barcodeText;
      }
      this._openModal(this.dom.scannerModal);
      this._executeScan();
    });

    this.dom.btnTriggerScan?.addEventListener('click', () => {
      this._executeScan();
    });

    this.dom.scanInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this._executeScan();
      }
    });

    // 3. New Order Modal
    this.dom.btnOpenNewOrderModal?.addEventListener('click', () => {
      this._resetNewOrderForm();
      this._openModal(this.dom.newOrderModal);
    });

    this.dom.btnAddOrderItem?.addEventListener('click', () => {
      this._addItemToDraft();
    });

    this.dom.btnSubmitNewOrder?.addEventListener('click', () => {
      this._submitNewOrder();
    });

    // Close buttons on all modals
    document.querySelectorAll('.modal-close-trigger').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-backdrop');
        if (modal) this._closeModal(modal);
      });
    });

    // Close modal when clicking backdrop outside modal-box
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          this._closeModal(backdrop);
        }
      });
    });
  }

  _openModal(modalEl) {
    if (modalEl) modalEl.classList.add('open');
  }

  _closeModal(modalEl) {
    if (modalEl) modalEl.classList.remove('open');
  }

  _changeZoom(delta) {
    this.zoomLevel = Math.max(0.5, Math.min(1.8, this.zoomLevel + delta));
    this._applyZoom();
  }

  _resetZoom() {
    this.zoomLevel = 1.0;
    this._applyZoom();
  }

  _applyZoom() {
    if (this.dom.paperContainer) {
      this.dom.paperContainer.style.transform = `scale(${this.zoomLevel})`;
    }
    if (this.dom.zoomLevelText) {
      this.dom.zoomLevelText.innerText = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  _renderOrderSelectorList() {
    if (!this.dom.orderListScroller) return;

    const orders = this.orderManager.getAllOrders();
    const activeId = this.orderManager.getActiveOrderId();

    this.dom.orderListScroller.innerHTML = orders.map(order => {
      const agency = this.orderManager.getAgency(order.agencyId);
      const fin = this.orderManager.calculateFinancials(order);
      const isActive = order.orderId === activeId;
      const isSigned = order.signedByAgent?.isSigned;

      return `
        <div class="order-select-card ${isActive ? 'active' : ''}" data-order-id="${order.orderId}">
          <div class="order-card-row-top">
            <span class="order-card-code">${order.orderId}</span>
            <span class="order-card-price">${fin.formattedTotalAmount}</span>
          </div>
          <div class="order-card-agency">${agency.shortName}</div>
          <div class="order-card-row-bottom">
            <span>${new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
            <span class="status-badge ${isSigned ? 'confirmed' : 'pending'}">
              ${isSigned ? '✓ Đã xác nhận' : '⏳ Chờ ký'}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Gắn event click cho các card
    this.dom.orderListScroller.querySelectorAll('.order-select-card').forEach(card => {
      card.addEventListener('click', () => {
        const orderId = card.getAttribute('data-order-id');
        this.orderManager.setActiveOrderId(orderId);
      });
    });
  }

  _renderInvoicePreview() {
    if (!this.dom.paperContainer) return;
    const activeOrder = this.orderManager.getActiveOrder();
    this.dom.paperContainer.innerHTML = this.printService.renderInvoiceHTML(activeOrder);
  }

  _executeScan() {
    const code = this.dom.scanInput?.value.trim() || '';
    const res = this.scannerSimulator.scan(code);

    if (!this.dom.scannerResultBox) return;

    if (!res.success) {
      this.dom.scannerResultBox.innerHTML = `
        <div class="scan-error-msg" style="color: #ef4444; padding: 12px; background: rgba(239,68,68,0.1); border-radius: 6px; border: 1px solid rgba(239,68,68,0.3);">
          <strong>LỖI QUÉT:</strong> ${res.message}
        </div>
      `;
      return;
    }

    const agency = this.orderManager.getAgency(res.order.agencyId);
    const fin = this.orderManager.calculateFinancials(res.order);

    this.dom.scannerResultBox.innerHTML = `
      <div class="scanner-result-card animate-fade-in">
        <div class="scan-status-header">
          <span class="scan-status-tag">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            TRA CỨU THÀNH CÔNG (WMS VERIFIED)
          </span>
          <span style="font-family: var(--font-mono); font-size: 0.75rem; color: #60a5fa;">${res.scannedAt}</span>
        </div>

        <div class="scan-detail-grid">
          <div class="scan-detail-item">
            <span class="scan-detail-label">Mã đơn hàng:</span>
            <span class="scan-detail-val text-mono" style="color: #38bdf8;">${res.order.orderId}</span>
          </div>
          <div class="scan-detail-item">
            <span class="scan-detail-label">Vị trí Kệ hàng:</span>
            <span class="scan-detail-val text-mono" style="color: #f59e0b;">${res.assignedBin}</span>
          </div>
          <div class="scan-detail-item">
            <span class="scan-detail-label">Đại lý nhận hàng:</span>
            <span class="scan-detail-val">${agency.shortName}</span>
          </div>
          <div class="scan-detail-item">
            <span class="scan-detail-label">Tổng kiện / Số lượng:</span>
            <span class="scan-detail-val font-bold">${res.totalPieces} sản phẩm</span>
          </div>
          <div class="scan-detail-item">
            <span class="scan-detail-label">Giá trị phiếu:</span>
            <span class="scan-detail-val font-bold" style="color: #34d399;">${fin.formattedTotalAmount}</span>
          </div>
          <div class="scan-detail-item">
            <span class="scan-detail-label">Tình trạng xác nhận:</span>
            <span class="scan-detail-val" style="color: ${res.order.signedByAgent?.isSigned ? '#34d399' : '#fbbf24'};">
              ${res.order.signedByAgent?.isSigned ? '✓ Đại lý đã ký tại chỗ' : 'Chưa có chữ ký đại lý'}
            </span>
          </div>
        </div>

        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.72rem; color: #94a3b8;">Kho: ${res.warehouseLocation}</span>
          <button id="btn-select-scanned-order" class="btn btn-primary btn-sm">Xem & In đơn này</button>
        </div>
      </div>
    `;

    document.getElementById('btn-select-scanned-order')?.addEventListener('click', () => {
      this.orderManager.setActiveOrderId(res.order.orderId);
      this._closeModal(this.dom.scannerModal);
    });
  }

  _populateNewOrderDropdowns() {
    if (this.dom.newOrderAgencySelect) {
      this.dom.newOrderAgencySelect.innerHTML = AGENCIES.map(a => `
        <option value="${a.id}">${a.code} - ${a.name} (${a.tier})</option>
      `).join('');
    }

    if (this.dom.newOrderProductSelect) {
      this.dom.newOrderProductSelect.innerHTML = PRODUCTS.map(p => `
        <option value="${p.sku}">${p.sku} - ${p.name} (${formatCurrency(p.basePrice)})</option>
      `).join('');
    }

    if (this.dom.newOrderDeliveryDate) {
      const afterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
      this.dom.newOrderDeliveryDate.value = afterTomorrow;
    }
  }

  _resetNewOrderForm() {
    this.draftItems = [
      {
        sku: PRODUCTS[0].sku,
        name: PRODUCTS[0].name,
        unit: PRODUCTS[0].unit,
        quantity: 5,
        unitPrice: PRODUCTS[0].basePrice,
        lineDiscountPercent: 5,
        note: 'Hàng kiểm tra tại chỗ'
      }
    ];
    this._renderDraftItemsTable();
  }

  _addItemToDraft() {
    const sku = this.dom.newOrderProductSelect?.value;
    const product = PRODUCTS.find(p => p.sku === sku) || PRODUCTS[0];
    const qty = parseInt(this.dom.newOrderQtyInput?.value || '1', 10);
    const disc = parseFloat(this.dom.newOrderDiscountInput?.value || '0');

    this.draftItems.push({
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      quantity: Math.max(1, qty),
      unitPrice: product.basePrice,
      lineDiscountPercent: Math.max(0, disc),
      note: 'Nhập tại chỗ'
    });

    this._renderDraftItemsTable();
  }

  _renderDraftItemsTable() {
    if (!this.dom.newOrderItemsTableBody) return;

    let subtotal = 0;
    this.dom.newOrderItemsTableBody.innerHTML = this.draftItems.map((item, idx) => {
      const lineTotal = item.quantity * item.unitPrice * (1 - item.lineDiscountPercent / 100);
      subtotal += lineTotal;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${item.sku}</strong></td>
          <td>${item.name}</td>
          <td class="text-center">${item.quantity} ${item.unit}</td>
          <td class="text-right">${formatCurrency(item.unitPrice)}</td>
          <td class="text-center">${item.lineDiscountPercent}%</td>
          <td class="text-right font-bold">${formatCurrency(lineTotal)}</td>
          <td class="text-center">
            <button class="btn btn-outline btn-sm remove-draft-btn" data-index="${idx}" style="padding: 2px 6px; color: #ef4444;">✕</button>
          </td>
        </tr>
      `;
    }).join('');

    if (this.dom.newOrderSubtotalPreview) {
      this.dom.newOrderSubtotalPreview.innerText = formatCurrency(subtotal);
    }

    this.dom.newOrderItemsTableBody.querySelectorAll('.remove-draft-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        this.draftItems.splice(idx, 1);
        this._renderDraftItemsTable();
      });
    });
  }

  _submitNewOrder() {
    if (this.draftItems.length === 0) {
      alert('Vui lòng thêm ít nhất một sản phẩm vào đơn hàng!');
      return;
    }

    const agencyId = this.dom.newOrderAgencySelect?.value || 'DL-01';
    const repId = this.dom.salesRepSelect?.value || 'user-nam';
    const deliveryDate = this.dom.newOrderDeliveryDate?.value;
    const notes = this.dom.newOrderNotes?.value.trim();

    const created = this.orderManager.createOrder({
      agencyId,
      salesRepId: repId,
      expectedDeliveryDate: deliveryDate,
      generalNotes: notes || 'Đơn chốt tại chỗ với đại lý.',
      items: this.draftItems
    });

    this._closeModal(this.dom.newOrderModal);
  }
}

// Khởi tạo ứng dụng khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  window.nexusApp = new NexusPrintApp();
});
