/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Application Main Controller & Bootstrap
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { store } from './store.js';
import { OrderScreen } from './orderScreen.js';
import { ApprovalScreen } from './approvalScreen.js';
import { DealerMatrixScreen } from './dealerMatrixScreen.js';
import { ModalManager } from './modals.js';
import { NotificationManager } from './notifications.js';

class App {
  constructor() {
    this.currentTab = 'order-screen';
    this.screens = {};
  }

  init() {
    // 1. Initialize Global Managers
    window.AppModals = new ModalManager();
    window.AppNotifications = new NotificationManager();
    window.AppNavigation = this;

    // 2. Initialize Screens
    this.screens['order-screen'] = new OrderScreen('orderScreenContainer');
    this.screens['approval-screen'] = new ApprovalScreen('approvalScreenContainer');
    this.screens['matrix-screen'] = new DealerMatrixScreen('matrixScreenContainer');

    // 3. Render initial screen
    this.switchTab(this.currentTab);

    // 4. Bind Navigation & Scenario Events
    this.bindNavigationEvents();
    this.bindScenarioPresetEvents();

    // 5. Update Badges
    store.subscribe((state) => {
      this.updateBadges(state);
    });

    this.updateBadges(store.getState());

    console.log('🚀 NEXUS OMS (SCRUM-86 / SCRUM-9) initialized successfully.');
  }

  switchTab(tabId) {
    this.currentTab = tabId;

    // Update Tab Buttons
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Containers
    const containers = document.querySelectorAll('.tab-view-container');
    containers.forEach(cont => {
      if (cont.id === `${tabId}Container`) {
        cont.classList.add('active');
      } else {
        cont.classList.remove('active');
      }
    });

    // Render active screen
    if (this.screens[tabId]) {
      this.screens[tabId].render();
    }
  }

  bindNavigationEvents() {
    const navButtons = document.querySelectorAll('.nav-tab-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });
  }

  bindScenarioPresetEvents() {
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const scenarioKey = btn.dataset.scenario;
        
        // Active visual state
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Apply preset
        store.applyPresetScenario(scenarioKey);

        // Switch to Order screen so user/lecturer sees immediate result
        this.switchTab('order-screen');

        if (window.AppNotifications) {
          const scenarioLabels = {
            NORMAL_SAFE: '🟢 Đã kích hoạt Kịch bản 1: Đại lý An Toàn (Trong hạn mức, tạo đơn bình thường)',
            OVER_LIMIT: '🟡 Đã kích hoạt Kịch bản 2: Vượt Hạn Mức (Đơn chuyển sang trạng thái CẦN DUYỆT)',
            OVERDUE_BLOCKED: '🔴 Đã kích hoạt Kịch bản 3: Nợ Quá Hạn Vi Phạm (Hệ thống KHÓA CỨNG hoàn toàn)',
            BORDERLINE: '🟣 Đã kích hoạt Kịch bản 4: Cận Hạn Mức Biên 98.8%',
            CLEAN_NEW: '⚪ Đã kích hoạt Kịch bản 5: Đại lý mới 100% không có nợ'
          };
          window.AppNotifications.toast('info', scenarioLabels[scenarioKey] || 'Đã áp dụng kịch bản kiểm thử');
        }
      });
    });
  }

  updateBadges(state) {
    const pendingOrders = state.orders.filter(o => o.status === 'PENDING_APPROVAL').length;
    const pendingBadge = document.getElementById('pendingApprovalBadge');
    if (pendingBadge) {
      if (pendingOrders > 0) {
        pendingBadge.style.display = 'inline-flex';
        pendingBadge.textContent = pendingOrders;
      } else {
        pendingBadge.style.display = 'none';
      }
    }
  }
}

// Bootstrap when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
