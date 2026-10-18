/**
 * KPI Summary Banner Component
 * Phục vụ yêu cầu: "Hiển thị tổng tiền của tập kết quả đang lọc"
 * Đi kèm các chỉ số phân tích chuyên sâu cho Quản lý kinh doanh
 */

export function formatCurrencyVND(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCompactNumber(number) {
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', compactDisplay: 'short' }).format(number);
}

export function renderKPISummary(container, state) {
  const { kpi, accessibleOrdersCount, isManager, currentUser } = state;

  const html = `
    <div class="kpi-grid">
      <!-- KPI 1: Tổng tiền tập kết quả đang lọc (TRỌNG TÂM ĐỀ BÀI) -->
      <div class="kpi-card kpi-card-primary">
        <div class="kpi-card-header">
          <span class="kpi-label">Tổng tiền (Tập đang lọc)</span>
          <div class="kpi-icon-wrap bg-emerald-glow">
            <svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
          </div>
        </div>
        <div class="kpi-main-metric">
          <span class="kpi-value text-emerald" id="kpi-total-amount">${formatCurrencyVND(kpi.grossTotalAmount)}</span>
        </div>
        <div class="kpi-subtext">
          <span class="kpi-badge kpi-badge-success">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
            Hiệu lực: ${formatCurrencyVND(kpi.totalRevenue)}
          </span>
          <span class="kpi-hint">Đã trừ đơn hủy (${kpi.statusCounts.cancelled} đơn)</span>
        </div>
      </div>

      <!-- KPI 2: Số lượng đơn hàng -->
      <div class="kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-label">Số lượng đơn hàng</span>
          <div class="kpi-icon-wrap bg-blue-glow">
            <svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </div>
        </div>
        <div class="kpi-main-metric">
          <span class="kpi-value">${kpi.count}</span>
          <span class="kpi-unit">/ ${accessibleOrdersCount} đơn được cấp quyền</span>
        </div>
        <div class="kpi-subtext">
          <div class="kpi-progress-bar">
            <div class="kpi-progress-fill" style="width: ${accessibleOrdersCount ? Math.round((kpi.count / accessibleOrdersCount) * 100) : 0}%"></div>
          </div>
          <span class="kpi-hint">Chiếm ${accessibleOrdersCount ? Math.round((kpi.count / accessibleOrdersCount) * 100) : 0}% tổng dữ liệu khả dụng</span>
        </div>
      </div>

      <!-- KPI 3: Giá trị trung bình đơn (AOV) -->
      <div class="kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-label">Giá trị TB / Đơn (AOV)</span>
          <div class="kpi-icon-wrap bg-purple-glow">
            <svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
        </div>
        <div class="kpi-main-metric">
          <span class="kpi-value">${formatCurrencyVND(kpi.aov)}</span>
        </div>
        <div class="kpi-subtext">
          <span class="kpi-badge kpi-badge-purple">Chỉ số quy mô</span>
          <span class="kpi-hint">Đơn trung bình toàn phân khúc</span>
        </div>
      </div>

      <!-- KPI 4: Đơn chờ xử lý & Giao hàng -->
      <div class="kpi-card">
        <div class="kpi-card-header">
          <span class="kpi-label">Chờ duyệt & Đang giao</span>
          <div class="kpi-icon-wrap bg-amber-glow">
            <svg class="kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
        </div>
        <div class="kpi-main-metric">
          <span class="kpi-value text-amber">${kpi.statusCounts.pending + kpi.statusCounts.processing + kpi.statusCounts.shipping}</span>
          <span class="kpi-unit">đơn cần theo dõi</span>
        </div>
        <div class="kpi-status-mini-pills">
          <span class="mini-pill pending">Chờ: ${kpi.statusCounts.pending}</span>
          <span class="mini-pill processing">Xử lý: ${kpi.statusCounts.processing}</span>
          <span class="mini-pill shipping">Giao: ${kpi.statusCounts.shipping}</span>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
