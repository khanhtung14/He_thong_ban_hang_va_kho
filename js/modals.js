/**
 * NEXUS ENTERPRISE WMS - MODALS CONTROLLER
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Modal khai báo ngưỡng tồn tối thiểu đơn lẻ & Khai báo hàng loạt (Batch Threshold Update)
 */

import { store } from './store.js';
import { InventoryEngine } from './inventoryEngine.js';

export class ModalsManager {
  constructor() {
    this.editModalEl = document.getElementById('modal-edit-threshold');
    this.batchModalEl = document.getElementById('modal-batch-threshold');
    this.activeItemId = null;

    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    window.addEventListener('OPEN_THRESHOLD_MODAL', (e) => {
      this.openEditModal(e.detail || {});
    });

    window.addEventListener('OPEN_BATCH_MODAL', (e) => {
      this.openBatchModal(e.detail || {});
    });
  }

  openEditModal({ itemId = null, isNew = false }) {
    if (!this.editModalEl) return;

    this.activeItemId = itemId;
    const state = store.getState();
    const enrichedItems = store.getEnrichedInventoryItems();

    let targetItem = itemId ? enrichedItems.find(i => i.id === itemId) : enrichedItems[0];
    if (!targetItem) targetItem = enrichedItems[0];

    const modalBody = this.editModalEl.querySelector('.modal-content-container');
    if (!modalBody) return;

    const smartRec = InventoryEngine.calculateSmartSafetyThreshold(targetItem.dailyBurnRate, targetItem.leadTimeDays);

    modalBody.innerHTML = `
      <form id="form-edit-threshold" class="threshold-form animate-fade-in">
        
        <div class="form-header-badge">
          <span>Khai báo cấu hình: ${targetItem.sku} • ${targetItem.warehouseShortName}</span>
        </div>

        <div class="form-grid-2col">
          <!-- Kho lưu trữ -->
          <div class="form-group">
            <label class="form-label">Kho áp dụng:</label>
            <input type="text" class="custom-input" value="${targetItem.warehouseName}" disabled />
            <input type="hidden" id="edit-wh-id" value="${targetItem.warehouseId}" />
          </div>

          <!-- SKU & Sản phẩm -->
          <div class="form-group">
            <label class="form-label">Mã SKU & Tên sản phẩm:</label>
            <input type="text" class="custom-input" value="${targetItem.sku} - ${targetItem.productName}" disabled />
            <input type="hidden" id="edit-sku-code" value="${targetItem.sku}" />
          </div>
        </div>

        <!-- THÔNG TIN HIỆN TRẠNG TỒN THỰC TẾ -->
        <div class="stock-status-callout">
          <div class="callout-col">
            <span class="callout-label">Tồn Khả Dụng Hiện Tại:</span>
            <span class="callout-val font-mono font-bold ${targetItem.isBelowMin ? 'text-rose' : 'text-emerald'}">
              ${targetItem.availableStock} ${targetItem.unit}
            </span>
          </div>
          <div class="callout-col">
            <span class="callout-label">Tồn Vật Lý / Giữ Chỗ:</span>
            <span class="callout-val font-mono text-muted">${targetItem.physicalStock} / ${targetItem.reservedStock}</span>
          </div>
          <div class="callout-col">
            <span class="callout-label">Tốc Độ Tiêu Thụ:</span>
            <span class="callout-val font-mono">${targetItem.dailyBurnRate} cái / ngày</span>
          </div>
          <div class="callout-col">
            <span class="callout-label">Hiện Trạng:</span>
            <span class="badge ${targetItem.badgeClass}">${targetItem.statusLabel}</span>
          </div>
        </div>

        <!-- CÁC TRƯỜNG THIẾT LẬP NGƯỠNG -->
        <div class="form-grid-2col">
          
          <!-- Ngưỡng tồn tối thiểu (Min) -->
          <div class="form-group highlight-field">
            <div class="label-with-hint">
              <label class="form-label font-bold text-rose">Mức Tồn Tối Thiểu (Min Threshold) *</label>
              <span class="hint-text">Ngưỡng báo động đứt hàng</span>
            </div>
            <div class="input-with-unit">
              <input type="number" id="input-edit-min" min="0" max="9999" class="custom-input font-mono font-bold" 
                value="${targetItem.minThreshold}" required />
              <span class="input-unit">${targetItem.unit}</span>
            </div>
          </div>

          <!-- Sức chứa tối đa (Max) -->
          <div class="form-group">
            <div class="label-with-hint">
              <label class="form-label">Sức Chứa Tối Đa (Max Capacity) *</label>
              <span class="hint-text">Giới hạn không vượt quá</span>
            </div>
            <div class="input-with-unit">
              <input type="number" id="input-edit-max" min="1" max="9999" class="custom-input font-mono" 
                value="${targetItem.maxCapacity}" required />
              <span class="input-unit">${targetItem.unit}</span>
            </div>
          </div>

          <!-- Số lượng đặt hàng kinh tế (Reorder Qty) -->
          <div class="form-group">
            <div class="label-with-hint">
              <label class="form-label">Số Lượng Đặt Hàng Mỗi Lần (MOQ) *</label>
              <span class="hint-text">Lô đặt hàng tối thiểu</span>
            </div>
            <div class="input-with-unit">
              <input type="number" id="input-edit-reorder" min="1" max="9999" class="custom-input font-mono" 
                value="${targetItem.reorderQuantity}" required />
              <span class="input-unit">${targetItem.unit}</span>
            </div>
          </div>

          <!-- Lead time NCC -->
          <div class="form-group">
            <div class="label-with-hint">
              <label class="form-label">Thời Gian Giao Hàng NCC (Lead Time) *</label>
              <span class="hint-text">Số ngày từ lúc đặt đến khi nhập kho</span>
            </div>
            <div class="input-with-unit">
              <input type="number" id="input-edit-lead" min="1" max="90" class="custom-input font-mono" 
                value="${targetItem.leadTimeDays}" required />
              <span class="input-unit">Ngày</span>
            </div>
          </div>

        </div>

        <!-- TRỢ LÝ THÔNG MINH GỢI Ý THUẬT TOÁN SCM -->
        <div class="smart-formula-box">
          <div class="formula-icon">⚡</div>
          <div class="formula-info">
            <div class="formula-title">Gợi ý từ Thuật Toán An Toàn Kho SCM (Lean Inventory)</div>
            <div class="formula-desc">
              Dựa trên tiêu thụ trung bình (${targetItem.dailyBurnRate} cái/ngày) và Lead Time (${targetItem.leadTimeDays} ngày), mức tồn tối thiểu khuyên dùng là <strong>${smartRec.recommendedMin} ${targetItem.unit}</strong>, sức chứa tối đa là <strong>${smartRec.recommendedMax} ${targetItem.unit}</strong>.
            </div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-use-smart-suggestion"
            data-min="${smartRec.recommendedMin}"
            data-max="${smartRec.recommendedMax}"
            data-reorder="${smartRec.recommendedReorderQty}">
            Áp Dụng Gợi Ý Này
          </button>
        </div>

        <!-- DỰ BÁO TRẠNG THÁI SAU KHI LƯU (REAL-TIME IMPACT PREVIEW) -->
        <div class="impact-preview-box" id="impact-preview-container">
          <!-- Cập nhật tự động khi gõ input -->
        </div>

        <!-- LÝ DO ĐIỀU CHỈNH (AUDIT REASON) -->
        <div class="form-group">
          <label class="form-label">Lý do điều chỉnh (Kiểm toán nội bộ WMS):</label>
          <input type="text" id="input-edit-reason" class="custom-input" 
            placeholder="Ví dụ: Tăng tồn tối thiểu đón mùa cao điểm quý 4 / Đại lý đặt trước hợp đồng lớn..." 
            value="Điều chỉnh mức tồn tối thiểu theo định kỳ đánh giá an toàn chuỗi cung ứng" required />
        </div>

        <!-- NÚT THAO TÁC -->
        <div class="modal-form-actions">
          <button type="button" class="btn btn-secondary btn-close-modal">Hủy Bỏ</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-threshold">
            💾 Lưu Khai Báo Ngưỡng An Toàn
          </button>
        </div>

      </form>
    `;

    this._bindEditModalEvents(targetItem);
    this.editModalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  _bindEditModalEvents(targetItem) {
    const minInput = this.editModalEl.querySelector('#input-edit-min');
    const maxInput = this.editModalEl.querySelector('#input-edit-max');
    const previewContainer = this.editModalEl.querySelector('#impact-preview-container');

    const updatePreview = () => {
      const newMin = parseInt(minInput.value, 10) || 0;
      const newMax = parseInt(maxInput.value, 10) || (newMin * 2);
      const avail = targetItem.availableStock;

      let willBeBelow = avail < newMin;
      let willBeStockout = avail === 0;
      let deficit = willBeBelow ? (newMin - avail) : 0;

      previewContainer.innerHTML = `
        <div class="preview-item">
          <span class="preview-title">Dự báo sau khi áp dụng:</span>
          ${willBeStockout ? `
            <span class="badge badge-stockout">⛔ CHÁY HÀNG (0 CÁI) - CẦN ĐẶT HÀNG GẤP</span>
          ` : willBeBelow ? `
            <span class="badge badge-below-min">🚨 DƯỚI NGƯỠNG TỐI THIỂU (Thiếu hụt ${deficit} cái)</span>
          ` : `
            <span class="badge badge-healthy">✅ ĐẠT VÙNG AN TOÀN (Cao hơn Min ${avail - newMin} cái)</span>
          `}
        </div>
      `;
    };

    if (minInput && maxInput) {
      minInput.addEventListener('input', updatePreview);
      maxInput.addEventListener('input', updatePreview);
      updatePreview();
    }

    // Nút áp dụng gợi ý SCM
    const btnSmart = this.editModalEl.querySelector('#btn-use-smart-suggestion');
    if (btnSmart) {
      btnSmart.addEventListener('click', (e) => {
        const sMin = e.target.dataset.min;
        const sMax = e.target.dataset.max;
        const sReorder = e.target.dataset.reorder;
        if (minInput) minInput.value = sMin;
        if (maxInput) maxInput.value = sMax;
        const reorderInput = this.editModalEl.querySelector('#input-edit-reorder');
        if (reorderInput) reorderInput.value = sReorder;
        updatePreview();
      });
    }

    // Đóng modal
    this.editModalEl.querySelectorAll('.btn-close-modal').forEach(b => {
      b.addEventListener('click', () => {
        this.editModalEl.classList.add('hidden');
        document.body.classList.remove('modal-open');
      });
    });

    // Submit form
    const form = this.editModalEl.querySelector('#form-edit-threshold');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const minVal = parseInt(minInput.value, 10);
        const maxVal = parseInt(maxInput.value, 10);
        const reorderVal = parseInt(this.editModalEl.querySelector('#input-edit-reorder').value, 10);
        const leadVal = parseInt(this.editModalEl.querySelector('#input-edit-lead').value, 10);
        const reason = this.editModalEl.querySelector('#input-edit-reason').value;

        if (maxVal < minVal) {
          alert('Lỗi nghiệp vụ: Sức chứa tối đa (Max) không được nhỏ hơn Mức tồn tối thiểu (Min)!');
          return;
        }

        const enriched = store.updateThreshold({
          itemId: targetItem.id,
          minThreshold: minVal,
          maxCapacity: maxVal,
          reorderQuantity: reorderVal,
          leadTimeDays: leadVal,
          reason
        });

        this.editModalEl.classList.add('hidden');
        document.body.classList.remove('modal-open');

        window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
          detail: {
            type: enriched.isBelowMin ? 'warning' : 'success',
            title: '✅ ĐÃ CẬP NHẬT NGƯỠNG AN TOÀN',
            message: `SKU ${enriched.sku} tại ${enriched.warehouseShortName} đã được cập nhật: Min = ${minVal}, Max = ${maxVal}. Trạng thái hiện tại: ${enriched.statusLabel}`
          }
        }));
      });
    }
  }

  openBatchModal({ warehouseId = 'ALL' }) {
    if (!this.batchModalEl) return;

    const state = store.getState();
    const modalBody = this.batchModalEl.querySelector('.modal-content-container');
    if (!modalBody) return;

    modalBody.innerHTML = `
      <form id="form-batch-threshold" class="threshold-form animate-fade-in">
        
        <div class="form-header-badge">
          <span>⚡ Điều chỉnh ngưỡng tồn tối thiểu hàng loạt theo tỷ lệ %</span>
        </div>

        <p class="form-desc text-muted">
          Áp dụng cho các đợt cao điểm bán hàng (Tăng tồn tối thiểu để dự phòng) hoặc chuyển mùa (Giảm tồn tối thiểu để giải phóng vốn lưu động).
        </p>

        <div class="form-grid-2col">
          <div class="form-group">
            <label class="form-label">Kho áp dụng:</label>
            <select id="batch-wh-select" class="custom-select">
              <option value="ALL">🌐 Tất cả các kho (Toàn quốc)</option>
              ${state.warehouses.map(w => `
                <option value="${w.id}" ${warehouseId === w.id ? 'selected' : ''}>${w.name}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Nhóm ngành hàng áp dụng:</label>
            <select id="batch-cat-select" class="custom-select">
              <option value="ALL">Tất cả các nhóm ngành</option>
              <option value="SERVER">Máy Chủ & Data Center</option>
              <option value="LAPTOP">Máy Tính Doanh Nghiệp</option>
              <option value="NETWORK">Thiết Bị Mạng Cisco</option>
              <option value="POWER">Nguồn UPS APC</option>
              <option value="SECURITY">Bảo Mật Fortinet</option>
              <option value="STORAGE">Lưu Trữ Synology</option>
            </select>
          </div>
        </div>

        <!-- TỶ LỆ ĐIỀU CHỈNH % -->
        <div class="form-group highlight-field">
          <label class="form-label font-bold">Tỷ lệ điều chỉnh Mức Tồn Tối Thiểu (%):</label>
          <div class="quick-percent-buttons">
            <button type="button" class="btn-percent" data-val="10">+10%</button>
            <button type="button" class="btn-percent active" data-val="20">+20% (Khuyên dùng mùa cao điểm)</button>
            <button type="button" class="btn-percent" data-val="30">+30%</button>
            <button type="button" class="btn-percent" data-val="-10">-10% (Giảm tồn)</button>
            <button type="button" class="btn-percent" data-val="-20">-20%</button>
          </div>
          <input type="number" id="batch-percent-input" class="custom-input font-mono font-bold mt-2" value="20" required />
        </div>

        <div class="form-group">
          <label class="form-label">Lý do điều chỉnh hàng loạt:</label>
          <input type="text" id="batch-reason-input" class="custom-input" 
            value="Nâng ngưỡng tồn kho an toàn đón đợt bán hàng cao điểm cuối năm" required />
        </div>

        <div class="modal-form-actions">
          <button type="button" class="btn btn-secondary btn-close-modal">Hủy Bỏ</button>
          <button type="submit" class="btn btn-primary">
            ⚡ Thực Hiện Cập Nhật Hàng Loạt
          </button>
        </div>

      </form>
    `;

    this._bindBatchModalEvents();
    this.batchModalEl.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }

  _bindBatchModalEvents() {
    this.batchModalEl.querySelectorAll('.btn-close-modal').forEach(b => {
      b.addEventListener('click', () => {
        this.batchModalEl.classList.add('hidden');
        document.body.classList.remove('modal-open');
      });
    });

    const percentInput = this.batchModalEl.querySelector('#batch-percent-input');
    this.batchModalEl.querySelectorAll('.btn-percent').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.batchModalEl.querySelectorAll('.btn-percent').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        if (percentInput) percentInput.value = e.currentTarget.dataset.val;
      });
    });

    const form = this.batchModalEl.querySelector('#form-batch-threshold');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const wh = this.batchModalEl.querySelector('#batch-wh-select').value;
        const cat = this.batchModalEl.querySelector('#batch-cat-select').value;
        const percent = parseFloat(percentInput.value) || 0;
        const reason = this.batchModalEl.querySelector('#batch-reason-input').value;

        const count = store.batchUpdateThreshold({
          warehouseId: wh,
          categoryCode: cat,
          percentMultiplier: percent,
          reason
        });

        this.batchModalEl.classList.add('hidden');
        document.body.classList.remove('modal-open');

        window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
          detail: {
            type: 'success',
            title: '✅ CẬP NHẬT HÀNG LOẠT THÀNH CÔNG',
            message: `Đã cập nhật tỷ lệ ${percent > 0 ? `+${percent}` : percent}% cho ${count} bản ghi tồn kho SKU!`
          }
        }));
      });
    }
  }
}
