/**
 * NEXUS ENTERPRISE WMS - THRESHOLD CONFIGURATION MANAGER
 * Ticket: SCRUM-87 / SCRUM-35
 * Requirement 1: "Khai báo tồn tối thiểu theo SKU và theo kho"
 * Module: Quản lý thiết lập ngưỡng tồn kho an toàn (Min/Max/Reorder Qty/Lead Time) & Nhật ký Audit Trail
 */

import { store } from './store.js';
import { InventoryEngine } from './inventoryEngine.js';

export class ThresholdManagerView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.selectedWarehouse = 'WH-HN';
    this.selectedCategory = 'ALL';
  }

  formatNumber(val) {
    return new Intl.NumberFormat('vi-VN').format(val);
  }

  render() {
    if (!this.container) return;

    const state = store.getState();
    const enriched = store.getEnrichedInventoryItems();

    // Lọc theo kho và ngành đang chọn trong tab cấu hình
    const items = enriched.filter(item => {
      const matchWh = (this.selectedWarehouse === 'ALL' || item.warehouseId === this.selectedWarehouse);
      const matchCat = (this.selectedCategory === 'ALL' || item.categoryCode === this.selectedCategory);
      return matchWh && matchCat;
    });

    const activeWhObj = state.warehouses.find(w => w.id === this.selectedWarehouse);

    this.container.innerHTML = `
      <section class="threshold-wrapper animate-fade-in">
        
        <!-- HEADER CỦA TAB KHAI BÁO NGƯỠNG -->
        <div class="threshold-header-card">
          <div class="header-content">
            <div class="header-badge">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Tiêu chí 1: Khai báo tồn tối thiểu theo SKU và theo kho</span>
            </div>
            <h2 class="header-title">Thiết Lập Ngưỡng Tồn Kho An Toàn (Safety Stock Policy)</h2>
            <p class="header-desc">
              Khai báo mức tồn tối thiểu độc lập cho từng mặt hàng (SKU) tại từng kho riêng biệt. 
              Khi tồn khả dụng thực tế chạm hoặc tụt xuống dưới ngưỡng này, hệ thống sẽ tự động phát tín hiệu cảnh báo trên Sổ Tồn và Dashboard.
            </p>
          </div>

          <div class="header-actions">
            <button class="btn btn-secondary btn-sm" id="btn-open-batch-modal">
              ⚡ Khai Báo Hàng Loạt Theo %
            </button>
            <button class="btn btn-primary btn-sm" id="btn-create-new-threshold">
              ➕ Khai Báo Ngưỡng Cho SKU Mới
            </button>
          </div>
        </div>

        <!-- BỘ LỌC ĐIỀU HƯỚNG MA TRẬN KHO -->
        <div class="threshold-nav-bar">
          <div class="warehouse-tabs-strip">
            <span class="strip-label">Chọn Kho Quản Trị:</span>
            <button class="wh-nav-tab ${this.selectedWarehouse === 'ALL' ? 'active' : ''}" data-wh="ALL">
              🌐 Toàn Bộ 4 Kho
            </button>
            ${state.warehouses.map(w => `
              <button class="wh-nav-tab ${this.selectedWarehouse === w.id ? 'active' : ''}" data-wh="${w.id}">
                <span class="wh-dot" style="background-color: ${w.color};"></span>
                ${w.shortName}
              </button>
            `).join('')}
          </div>

          <div class="category-select-mini">
            <select id="select-threshold-category" class="custom-select custom-select-sm">
              <option value="ALL" ${this.selectedCategory === 'ALL' ? 'selected' : ''}>Tất cả nhóm ngành</option>
              <option value="SERVER" ${this.selectedCategory === 'SERVER' ? 'selected' : ''}>Máy Chủ & Data Center</option>
              <option value="LAPTOP" ${this.selectedCategory === 'LAPTOP' ? 'selected' : ''}>Máy Tính Doanh Nghiệp</option>
              <option value="NETWORK" ${this.selectedCategory === 'NETWORK' ? 'selected' : ''}>Thiết Bị Mạng Cisco</option>
              <option value="POWER" ${this.selectedCategory === 'POWER' ? 'selected' : ''}>Nguồn UPS APC</option>
              <option value="SECURITY" ${this.selectedCategory === 'SECURITY' ? 'selected' : ''}>Bảo Mật Fortinet</option>
              <option value="STORAGE" ${this.selectedCategory === 'STORAGE' ? 'selected' : ''}>Lưu Trữ Synology</option>
            </select>
          </div>
        </div>

        <!-- BẢNG DANH MỤC THIẾT LẬP NGƯỠNG TỒN TỐI THIỂU -->
        <div class="threshold-table-card">
          <div class="table-header-info">
            <div>
              <span class="table-subtitle font-bold text-main">
                Danh sách khai báo ngưỡng (${items.length} bản ghi SKU tại ${activeWhObj ? activeWhObj.name : 'Tất cả các kho'})
              </span>
            </div>
            <span class="text-xs text-muted">
              Công thức tiêu chuẩn: Min Threshold = (Tốc độ tiêu thụ ngày × Lead Time NCC) + Buffer an toàn
            </span>
          </div>

          <div class="table-responsive-wrapper">
            <table class="nexus-table nexus-table-threshold">
              <thead>
                <tr>
                  <th>Mã SKU & Sản Phẩm</th>
                  <th>Kho Áp Dụng</th>
                  <th class="text-right">Tồn Khả Dụng</th>
                  <th class="text-right">Ngưỡng Tồn Tối Thiểu (Min)</th>
                  <th class="text-right">Sức Chứa Tối Đa (Max)</th>
                  <th class="text-right">Số Lượng Đặt Hàng (MOQ)</th>
                  <th class="text-center">Lead Time (Ngày)</th>
                  <th>Gợi Ý Thuật Toán SCM</th>
                  <th class="text-center">Trạng Thái Sau Khai Báo</th>
                  <th class="text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => {
                  const smartCalc = InventoryEngine.calculateSmartSafetyThreshold(item.dailyBurnRate, item.leadTimeDays);
                  return `
                    <tr class="threshold-row ${item.isBelowMin ? 'row-below-min-alert' : ''}">
                      <td>
                        <div class="sku-cell">
                          <span class="sku-code font-mono">${item.sku}</span>
                          <span class="product-name-truncate font-medium" title="${item.productName}">${item.productName}</span>
                          <span class="text-xs text-muted">Nhóm: ${item.category} • ĐVT: ${item.unit}</span>
                        </div>
                      </td>
                      <td>
                        <span class="wh-tag" style="border-left: 3px solid ${item.warehouseColor};">
                          ${item.warehouseShortName}
                        </span>
                      </td>
                      <td class="text-right font-mono font-bold ${item.isBelowMin ? 'text-rose' : 'text-main'}">
                        ${this.formatNumber(item.availableStock)} ${item.unit}
                      </td>
                      <td class="text-right font-mono font-bold cell-highlight-min">
                        <span class="min-badge ${item.isBelowMin ? 'min-badge-alert' : 'min-badge-normal'}">
                          ${this.formatNumber(item.minThreshold)} ${item.unit}
                        </span>
                      </td>
                      <td class="text-right font-mono text-muted">
                        ${this.formatNumber(item.maxCapacity)} ${item.unit}
                      </td>
                      <td class="text-right font-mono text-cyan">
                        ${this.formatNumber(item.reorderQuantity)} ${item.unit}
                      </td>
                      <td class="text-center font-mono">
                        ${item.leadTimeDays} ngày
                      </td>
                      <td>
                        <div class="smart-rec-chip font-mono text-xs">
                          <span>Khuyên dùng: <strong>${smartCalc.recommendedMin}</strong> ${item.unit}</span>
                          <button class="btn-apply-smart-mini" 
                            data-item-id="${item.id}"
                            data-min="${smartCalc.recommendedMin}"
                            data-max="${smartCalc.recommendedMax}"
                            data-reorder="${smartCalc.recommendedReorderQty}"
                            title="Bấm để tự động áp dụng gợi ý thuật toán">
                            ⚡ Áp Dụng
                          </button>
                        </div>
                      </td>
                      <td class="text-center">
                        <span class="badge ${item.badgeClass}">${item.statusLabel}</span>
                      </td>
                      <td class="text-center">
                        <button class="btn btn-secondary btn-xs btn-open-edit-modal" 
                          data-item-id="${item.id}">
                          ✎ Điều Chỉnh
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. NHẬT KÝ KIỂM TOÁN (AUDIT TRAIL LOGS) -->
        <div class="audit-trail-card">
          <div class="audit-header">
            <h4 class="audit-title">Nhật Ký Kiểm Toán Thay Đổi Cấu Hình Tồn Kho (Audit Trail)</h4>
            <span class="audit-subtitle">Lưu vết toàn bộ thao tác điều chỉnh ngưỡng an toàn và giao dịch phát sinh</span>
          </div>
          <div class="audit-list">
            ${state.auditLogs.slice(0, 8).map(log => `
              <div class="audit-item">
                <div class="audit-meta">
                  <span class="audit-time font-mono">${log.timestamp}</span>
                  <span class="audit-actor font-bold">${log.actor}</span>
                  <span class="audit-action-tag">${log.action}</span>
                </div>
                <div class="audit-details">
                  <span class="audit-target font-mono">${log.warehouseId} • ${log.sku}</span>
                  <span class="audit-values">Mức Min: <strong>${log.oldMin}</strong> &rarr; <strong>${log.newMin}</strong></span>
                  <span class="audit-reason text-muted font-italic">"${log.reason}"</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </section>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    // 1. Chuyển kho trong tab khai báo
    this.container.querySelectorAll('.wh-nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.selectedWarehouse = e.currentTarget.dataset.wh;
        this.render();
      });
    });

    // 2. Chuyển nhóm ngành
    const selectCat = this.container.querySelector('#select-threshold-category');
    if (selectCat) {
      selectCat.addEventListener('change', (e) => {
        this.selectedCategory = e.target.value;
        this.render();
      });
    }

    // 3. Mở modal chỉnh sửa đơn lẻ
    this.container.querySelectorAll('.btn-open-edit-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.currentTarget.dataset.itemId;
        window.dispatchEvent(new CustomEvent('OPEN_THRESHOLD_MODAL', { detail: { itemId } }));
      });
    });

    // 4. Áp dụng nhanh gợi ý SCM
    this.container.querySelectorAll('.btn-apply-smart-mini').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const b = e.currentTarget;
        const itemId = b.dataset.itemId;
        const newMin = parseInt(b.dataset.min, 10);
        const newMax = parseInt(b.dataset.max, 10);
        const newReorder = parseInt(b.dataset.reorder, 10);

        store.updateThreshold({
          itemId,
          minThreshold: newMin,
          maxCapacity: newMax,
          reorderQuantity: newReorder,
          reason: 'Áp dụng đề xuất từ thuật toán Safety Stock SCM'
        });

        window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
          detail: {
            type: 'success',
            title: '✅ ĐÃ CẬP NHẬT NGƯỠNG AN TOÀN',
            message: `Đã thiết lập Min = ${newMin}, Max = ${newMax} cho sản phẩm.`
          }
        }));
      });
    });

    // 5. Mở modal khai báo hàng loạt
    const btnBatch = this.container.querySelector('#btn-open-batch-modal');
    if (btnBatch) {
      btnBatch.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('OPEN_BATCH_MODAL', { detail: { warehouseId: this.selectedWarehouse } }));
      });
    }

    // 6. Khai báo cho SKU mới
    const btnNew = this.container.querySelector('#btn-create-new-threshold');
    if (btnNew) {
      btnNew.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('OPEN_THRESHOLD_MODAL', { detail: { isNew: true } }));
      });
    }
  }
}
