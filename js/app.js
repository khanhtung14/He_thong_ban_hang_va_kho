/**
 * NEXUS ENTERPRISE WMS - APPLICATION ENTRY POINT & CONTROLLER
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Quản lý điều hướng Tabs, Ticker cảnh báo thời gian thực, Quản lý Kịch bản Demo & Toasts
 */

import { store } from './store.js';
import { audioAlert } from './audioAlert.js';
import { KpiDashboardView } from './kpiDashboard.js';
import { StockLedgerView } from './stockLedgerView.js';
import { ThresholdManagerView } from './thresholdManager.js';
import { ProcurementPoModal } from './procurementPo.js';
import { ModalsManager } from './modals.js';
import { DEMO_SCENARIOS } from './mockData.js';

class NexusWmsApp {
  constructor() {
    this.dashboardView = null;
    this.stockLedgerView = null;
    this.thresholdView = null;
    this.poModal = null;
    this.modalsManager = null;
  }

  init() {
    console.log('[NEXUS WMS] Khởi động hệ thống Quản lý Tồn kho & Cảnh báo Tồn tối thiểu (SCRUM-35)...');

    // Khởi tạo các view component
    this.dashboardView = new KpiDashboardView('tab-content-dashboard');
    this.stockLedgerView = new StockLedgerView('tab-content-ledger');
    this.thresholdView = new ThresholdManagerView('tab-content-threshold');
    this.poModal = new ProcurementPoModal();
    this.modalsManager = new ModalsManager();

    // Hỗ trợ Deep Linking qua URL Hash (#dashboard, #ledger, #threshold, #reorder)
    const hash = window.location.hash.replace('#', '');
    if (['dashboard', 'ledger', 'threshold', 'reorder'].includes(hash)) {
      store.setActiveTab(hash);
    }

    // Render giao diện ban đầu
    this._renderHeaderAndMeta();
    this._renderActiveTab();
    this._bindHeaderEvents();
    this._bindToastListener();

    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '');
      if (['dashboard', 'ledger', 'threshold', 'reorder'].includes(newHash)) {
        store.setActiveTab(newHash);
      }
    });

    // Lắng nghe biến động Reactive từ Store
    store.subscribe((state, eventType, payload) => {
      this._handleStateChange(state, eventType, payload);
    });
  }

  _renderHeaderAndMeta() {
    const state = store.getState();
    const kpis = store.getDashboardKPIs();

    // 1. Cập nhật Ticker cảnh báo chạy chữ trên Header
    const tickerEl = document.getElementById('header-alert-ticker');
    if (tickerEl) {
      if (kpis.countBelowMin > 0) {
        tickerEl.className = 'alert-ticker ticker-alert animate-pulse';
        tickerEl.innerHTML = `
          <span class="ticker-badge">🚨 BÁO ĐỘNG TỒN THẤP:</span>
          <span class="ticker-text">
            Phát hiện <strong>${kpis.countBelowMin} SKU</strong> đang ở dưới mức tồn tối thiểu (${kpis.countStockout} SKU cháy hàng 0 chiếc). Cần đặt hàng NCC trước khi đứt hàng!
          </span>
          <button class="ticker-btn" id="btn-ticker-view-ledger">Xử lý ngay &rarr;</button>
        `;
        const btnTicker = tickerEl.querySelector('#btn-ticker-view-ledger');
        if (btnTicker) {
          btnTicker.addEventListener('click', () => {
            store.setStatusFilter('BELOW_MIN');
            store.setActiveTab('ledger');
          });
        }
      } else {
        tickerEl.className = 'alert-ticker ticker-healthy';
        tickerEl.innerHTML = `
          <span class="ticker-badge">✅ KHO AN TOÀN:</span>
          <span class="ticker-text">Tất cả các SKU tại toàn bộ các kho đều đang duy trì trên mức tồn tối thiểu quy định.</span>
        `;
      }
    }

    // 2. Cập nhật Badge số lượng cảnh báo trên Tab Sổ Tồn
    const tabLedgerBadge = document.getElementById('tab-ledger-badge');
    if (tabLedgerBadge) {
      tabLedgerBadge.textContent = kpis.countBelowMin;
      tabLedgerBadge.style.display = kpis.countBelowMin > 0 ? 'inline-flex' : 'none';
    }

    // 3. Đồng bộ nút bật/tắt âm thanh
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.innerHTML = state.soundEnabled
        ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg> Bật Chuông Cảnh Báo`
        : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg> Tắt Chuông`;
      soundBtn.classList.toggle('active', state.soundEnabled);
    }
  }

  _renderActiveTab() {
    const state = store.getState();
    const activeTab = state.activeTab;

    // Ẩn tất cả các tab container
    document.querySelectorAll('.tab-page-container').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.app-nav-tab').forEach(el => el.classList.remove('active'));

    // Bật tab hiện tại
    const targetContent = document.getElementById(`tab-content-${activeTab}`);
    const targetNav = document.getElementById(`nav-tab-${activeTab}`);

    if (targetContent) targetContent.classList.remove('hidden');
    if (targetNav) targetNav.classList.add('active');

    // Gọi render cho view tương ứng
    if (activeTab === 'dashboard') {
      this.dashboardView.render();
    } else if (activeTab === 'ledger') {
      this.stockLedgerView.render();
    } else if (activeTab === 'threshold') {
      this.thresholdView.render();
    } else if (activeTab === 'reorder') {
      this._renderReorderCenterTab();
    }
  }

  _renderReorderCenterTab() {
    const container = document.getElementById('tab-content-reorder');
    if (!container) return;

    const poRecommendations = store.getPORecommendations();
    const kpis = store.getDashboardKPIs();

    container.innerHTML = `
      <section class="reorder-center-wrapper animate-fade-in">
        
        <div class="reorder-header-card">
          <div class="header-content">
            <div class="header-badge">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
              <span>Mục tiêu đề bài: "để đặt hàng nhà cung cấp trước khi đứt hàng chứ không phải sau."</span>
            </div>
            <h2 class="header-title">Trung Tâm Đề Xuất Đặt Hàng Bù Tồn Kho (Auto Replenishment Hub)</h2>
            <p class="header-desc">
              Tự động tập hợp toàn bộ SKU đang bị thiếu hụt dưới mức tồn an toàn, tính toán số lượng đặt tối ưu (MOQ) 
              và gom thành từng Đơn Đặt Hàng Nhà Cung Cấp (Purchase Order - PO) hoàn chỉnh sẵn sàng phát hành.
            </p>
          </div>

          <div class="reorder-kpi-pill font-mono">
            <span>Dự toán bổ sung tồn: <strong class="text-cyan text-lg">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(kpis.totalSuggestedReorderCost)}</strong></span>
            <span class="text-xs text-muted">(${kpis.totalSuggestedReorderUnits} đơn vị thiết bị)</span>
          </div>
        </div>

        <div class="po-groups-list">
          ${poRecommendations.length === 0 ? `
            <div class="empty-state-box py-12 text-center text-muted">
              🎉 Không có nhà cung cấp nào cần phát hành PO. Tất cả SKU đều đang duy trì mức tồn trên ngưỡng an toàn!
            </div>
          ` : poRecommendations.map(group => `
            <div class="po-group-card ${group.maxUrgency >= 4 ? 'group-urgent' : ''}">
              
              <div class="group-header">
                <div class="supplier-info">
                  <div class="supplier-name font-bold text-lg">${group.supplier.name}</div>
                  <div class="supplier-sub font-mono text-xs text-muted">
                    Mã NCC: ${group.supplier.code} • Lead Time: <strong>${group.supplier.leadTimeDays} ngày</strong> • Điều khoản: ${group.supplier.paymentTerms}
                  </div>
                </div>

                <div class="group-actions">
                  <div class="group-cost font-mono">
                    <span class="text-xs text-muted">Dự toán PO:</span>
                    <span class="font-bold text-cyan text-base">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(group.totalEstimatedCost)}</span>
                  </div>
                  <button class="btn btn-primary btn-sm btn-generate-group-po" data-supplier-id="${group.supplier.id}">
                    ⚡ Sinh Đơn PO (${group.items.length} SKU)
                  </button>
                </div>
              </div>

              <div class="group-items-table-wrap">
                <table class="nexus-table nexus-table-sm">
                  <thead>
                    <tr>
                      <th>Mã SKU</th>
                      <th>Tên Hàng Hóa</th>
                      <th>Kho Tiếp Nhận</th>
                      <th class="text-right">Tồn Khả Dụng</th>
                      <th class="text-right">Mức Min</th>
                      <th class="text-right">Thiếu Hụt</th>
                      <th class="text-right">SL Đề Xuất Đặt</th>
                      <th class="text-right">Ước Tính Chi Phí</th>
                      <th class="text-center">Số Ngày Runway</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${group.items.map(i => `
                      <tr class="${i.isStockout ? 'row-stockout' : 'row-below-min'}">
                        <td class="font-mono font-bold">${i.sku}</td>
                        <td class="product-name-truncate">${i.productName}</td>
                        <td><span class="wh-tag">${i.warehouseShortName}</span></td>
                        <td class="text-right font-mono font-bold text-rose">${i.availableStock}</td>
                        <td class="text-right font-mono text-muted">${i.minThreshold}</td>
                        <td class="text-right font-mono text-rose font-bold">-${i.deficitQty}</td>
                        <td class="text-right font-mono font-bold text-cyan">+${i.suggestedReorderQty}</td>
                        <td class="text-right font-mono">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.suggestedReorderCost)}</td>
                        <td class="text-center font-mono">
                          <span class="runway-chip ${i.runwayDays === 0 ? 'runway-zero' : 'runway-critical'}">
                            ${i.runwayDays === 0 ? '0d (Hết sạch)' : `${i.runwayDays} ngày`}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>

            </div>
          `).join('')}
        </div>

      </section>
    `;

    // Bind event sinh PO theo nhóm NCC
    container.querySelectorAll('.btn-generate-group-po').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const supId = e.currentTarget.dataset.supplierId;
        window.dispatchEvent(new CustomEvent('OPEN_PO_MODAL', { detail: { supplierId: supId } }));
      });
    });
  }

  _bindHeaderEvents() {
    // 1. Chuyển đổi Tab chính
    document.querySelectorAll('.app-nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const tabName = e.currentTarget.dataset.tab;
        window.location.hash = tabName;
        store.setActiveTab(tabName);
      });
    });

    // 2. Chuyển Kho toàn cục ở Header
    const globalWhSelect = document.getElementById('global-warehouse-selector');
    if (globalWhSelect) {
      globalWhSelect.addEventListener('change', (e) => {
        store.setWarehouseFilter(e.target.value);
      });
    }

    // 3. Chuyển đổi Kịch bản Demo cho giáo viên
    const scenarioSelect = document.getElementById('demo-scenario-selector');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        const scenarioId = e.target.value;
        store.loadDemoScenario(scenarioId);

        const scenarioObj = DEMO_SCENARIOS.find(s => s.id === scenarioId);
        window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
          detail: {
            type: 'info',
            title: `🔄 ĐÃ TẢI KỊCH BẢN: ${scenarioObj ? scenarioObj.title : scenarioId}`,
            message: scenarioObj ? scenarioObj.description : 'Đã tải dữ liệu kiểm thử kịch bản'
          }
        }));
      });
    }

    // 4. Bật / Tắt âm thanh cảnh báo
    const btnSound = document.getElementById('btn-toggle-sound');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        store.toggleSound();
        const state = store.getState();
        audioAlert.setMuted(!state.soundEnabled);
        if (state.soundEnabled) {
          audioAlert.playSuccessChime();
        }
      });
    }

    // 5. Nút Reset toàn bộ hệ thống về ban đầu
    const btnResetSystem = document.getElementById('btn-reset-system');
    if (btnResetSystem) {
      btnResetSystem.addEventListener('click', () => {
        if (confirm('Khôi phục toàn bộ dữ liệu mẫu WMS ban đầu (Reset Database)?')) {
          store.resetAll();
          window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
            detail: {
              type: 'info',
              title: '🔄 ĐÃ KHÔI PHỤC DỮ LIỆU BAN ĐẦU',
              message: 'Toàn bộ dữ liệu tồn kho và cấu hình ngưỡng đã được tải lại thành công.'
            }
          }));
        }
      });
    }
  }

  _handleStateChange(state, eventType, payload) {
    this._renderHeaderAndMeta();

    // Re-render tab đang mở
    if (state.activeTab === 'dashboard') {
      this.dashboardView.render();
    } else if (state.activeTab === 'ledger') {
      this.stockLedgerView.render();
    } else if (state.activeTab === 'threshold') {
      this.thresholdView.render();
    } else if (state.activeTab === 'reorder') {
      this._renderReorderCenterTab();
    }

    // Đồng bộ dropdown kho ở header
    const globalWh = document.getElementById('global-warehouse-selector');
    if (globalWh && globalWh.value !== state.activeWarehouseFilter) {
      globalWh.value = state.activeWarehouseFilter;
    }
  }

  _bindToastListener() {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    window.addEventListener('SHOW_TOAST', (e) => {
      const { type = 'info', title = '', message = '', duration = 5000 } = e.detail || {};

      const toast = document.createElement('div');
      toast.className = `nexus-toast toast-${type} animate-slide-in`;

      let iconSvg = '';
      if (type === 'error' || type === 'critical') {
        iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      } else if (type === 'warning') {
        iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      } else if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      } else {
        iconSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      }

      toast.innerHTML = `
        <div class="toast-icon-wrap">${iconSvg}</div>
        <div class="toast-content">
          ${title ? `<div class="toast-title font-bold">${title}</div>` : ''}
          <div class="toast-msg">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
      `;

      toastContainer.appendChild(toast);

      const closeToast = () => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
      };

      toast.querySelector('.toast-close').addEventListener('click', closeToast);
      setTimeout(closeToast, duration);
    });
  }
}

// Khởi chạy khi DOM đã sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  const app = new NexusWmsApp();
  app.init();
});
