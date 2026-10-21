/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Toast Notifications & User Feedback
 * Ticket: SCRUM-86 / SCRUM-9
 */

export class NotificationManager {
  constructor() {
    this.container = document.getElementById('toastContainer');
  }

  toast(type = 'info', message = '', duration = 4000) {
    if (!this.container) return;

    const toastEl = document.createElement('div');
    toastEl.className = `enterprise-toast toast-${type} animate-slide-in`;

    let icon = 'ph-info';
    let title = 'Thông báo hệ thống';

    if (type === 'success') {
      icon = 'ph-check-circle';
      title = 'Thành công';
    } else if (type === 'warning') {
      icon = 'ph-warning';
      title = 'Cảnh báo công nợ';
    } else if (type === 'error') {
      icon = 'ph-x-circle';
      title = 'Lỗi / Chặn giao dịch';
    }

    toastEl.innerHTML = `
      <div class="toast-icon-wrap">
        <i class="ph-bold ${icon}"></i>
      </div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close-btn"><i class="ph-bold ph-x"></i></button>
    `;

    this.container.appendChild(toastEl);

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.dismiss(toastEl);
      });
    }

    setTimeout(() => {
      this.dismiss(toastEl);
    }, duration);
  }

  dismiss(toastEl) {
    toastEl.classList.remove('animate-slide-in');
    toastEl.classList.add('animate-slide-out');
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 300);
  }
}
