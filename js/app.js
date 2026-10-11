/**
 * DISTRICARE CRM - Main Application Bootstrap
 * Khởi tạo UI Controller, cấu hình ứng dụng và hỗ trợ điều hướng URL demo trực tiếp
 */

import { UIController } from './ui.js';
import { store } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = new UIController();
  app.init();
  window.distriCareApp = app;

  // Xử lý Query Parameters để hỗ trợ giáo viên / kiểm thử truy cập nhanh mọi kịch bản
  const params = new URLSearchParams(window.location.search);
  if (params.has('user')) {
    store.setCurrentUser(params.get('user'));
  }
  if (params.has('tab')) {
    app.switchTab(params.get('tab'));
  }
  if (params.get('modal') === 'handover') {
    const fromId = params.get('from') || 'NV006';
    app.handoverManager.openWizard(fromId);
    if (params.has('step')) {
      app.handoverManager.goToStep(parseInt(params.get('step'), 10));
    }
  } else if (params.get('modal') === 'doc') {
    const hoId = params.get('id') || 'HO001';
    app.handoverManager.openHandoverDocumentModal(hoId);
  } else if (params.get('modal') === 'tech') {
    app.openTechDocsModal();
  }

  console.log('DistriCare CRM initialized successfully.');
});
