/**
 * NEXUS ENTERPRISE WMS - STOCK LEDGER VIEW (SỔ TỒN KHO CHI TIẾT)
 * Ticket: SCRUM-87 / SCRUM-35
 * Requirement: "Hàng dưới ngưỡng hiển thị nổi bật trong sổ tồn"
 * Module: Bảng kê chi tiết sổ tồn, Thanh đo trực quan (Stock Gauge), Nổi bật hàng dưới Min & Mô phỏng biến động tồn
 */

import { store } from './store.js';
import { audioAlert } from './audioAlert.js';

export class StockLedgerView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  }

  formatNumber(val) {
    return new Intl.NumberFormat('vi-VN').format(val);
  }

  render() {
    if (!this.container) return;

    const state = store.getState();
    const filteredItems = store.getFilteredItems();
    const kpis = store.getDashboardKPIs();

    this.container.innerHTML = `
      <section class="ledger-wrapper animate-fade-in">
        
        <!-- 1. THANH CÔNG CỤ BỘ LỌC ĐA CHIỀU (MULTI-CRITERIA FILTER BAR) -->
        <div class="ledger-toolbar">
          
          <div class="toolbar-top-row">
            <!-- Tìm kiếm từ khóa tức thời -->
            <div class="search-box-wrap">
              <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              <input type="text" id="ledger-search-input" class="search-input" 
                placeholder="Tìm theo SKU, tên sản phẩm, mã vạch Barcode, vị trí kệ..." 
                value="${state.searchQuery || ''}" />
              ${state.searchQuery ? `<button id="btn-clear-search" class="btn-clear">&times;</button>` : ''}
            </div>

            <!-- Bộ chọn Kho hàng -->
            <div class="filter-select-group">
              <label class="filter-label">Kho lưu trữ:</label>
              <select id="select-filter-warehouse" class="custom-select">
                <option value="ALL" ${state.activeWarehouseFilter === 'ALL' ? 'selected' : ''}>🌐 Tất cả các kho (Toàn quốc)</option>
                ${state.warehouses.map(w => `
                  <option value="${w.id}" ${state.activeWarehouseFilter === w.id ? 'selected' : ''}>
                    ${w.name}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Bộ chọn Ngành hàng -->
            <div class="filter-select-group">
              <label class="filter-label">Nhóm thiết bị:</label>
              <select id="select-filter-category" class="custom-select">
                <option value="ALL" ${state.activeCategoryFilter === 'ALL' ? 'selected' : ''}>Tất cả nhóm ngành</option>
                <option value="SERVER" ${state.activeCategoryFilter === 'SERVER' ? 'selected' : ''}>Máy Chủ & Data Center</option>
                <option value="LAPTOP" ${state.activeCategoryFilter === 'LAPTOP' ? 'selected' : ''}>Máy Tính Doanh Nghiệp</option>
                <option value="NETWORK" ${state.activeCategoryFilter === 'NETWORK' ? 'selected' : ''}>Thiết Bị Mạng Cisco</option>
                <option value="POWER" ${state.activeCategoryFilter === 'POWER' ? 'selected' : ''}>Nguồn UPS & Hạ Tầng</option>
                <option value="SECURITY" ${state.activeCategoryFilter === 'SECURITY' ? 'selected' : ''}>An Ninh Fortinet</option>
                <option value="STORAGE" ${state.activeCategoryFilter === 'STORAGE' ? 'selected' : ''}>Lưu Trữ Synology</option>
              </select>
            </div>

            <!-- Nút xuất Excel / Báo cáo Sổ Tồn -->
            <div class="toolbar-actions">
              <button class="btn btn-secondary btn-sm" id="btn-export-ledger-csv">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Xuất Sổ Tồn (CSV)
              </button>
            </div>

          </div>

          <!-- Dải lọc nhanh trạng thái cảnh báo (STATUS FILTER PILLS) -->
          <div class="status-pills-row">
            <span class="pills-label">Lọc nhanh theo mức độ an toàn:</span>
            
            <button class="filter-pill ${state.activeStatusFilter === 'ALL' ? 'active' : ''}" data-status="ALL">
              Tất cả (${kpis.totalRecords})
            </button>

            <!-- 🚨 NÚT LỌC NỔI BẬT: HÀNG DƯỚI NGƯỠNG TỐI THIỂU -->
            <button class="filter-pill pill-critical ${state.activeStatusFilter === 'BELOW_MIN' ? 'active pulse-critical' : ''}" data-status="BELOW_MIN">
              <span class="pill-dot red-dot"></span>
              🚨 Hàng Dưới Ngưỡng Tối Thiểu (${kpis.countBelowMin})
            </button>

            <button class="filter-pill pill-danger ${state.activeStatusFilter === 'CRITICAL_ONLY' ? 'active' : ''}" data-status="CRITICAL_ONLY">
              <span class="pill-dot amber-dot"></span>
              ⛔ Cháy Hàng Hoàn Toàn (${kpis.countStockout})
            </button>

            <button class="filter-pill pill-warning ${state.activeStatusFilter === 'NEAR_MIN' ? 'active' : ''}" data-status="NEAR_MIN">
              <span class="pill-dot yellow-dot"></span>
              ⚠️ Cận Ngưỡng Min (${kpis.countNearMin})
            </button>

            <button class="filter-pill pill-success ${state.activeStatusFilter === 'HEALTHY' ? 'active' : ''}" data-status="HEALTHY">
              <span class="pill-dot green-dot"></span>
              ✅ Tồn Kho An Toàn (${kpis.countHealthy})
            </button>

            <button class="filter-pill pill-purple ${state.activeStatusFilter === 'OVERSTOCK' ? 'active' : ''}" data-status="OVERSTOCK">
              <span class="pill-dot purple-dot"></span>
              📦 Dư Thừa Tồn (${kpis.countOverstock})
            </button>

            ${state.activeStatusFilter !== 'ALL' || state.activeWarehouseFilter !== 'ALL' || state.activeCategoryFilter !== 'ALL' || state.searchQuery ? `
              <button class="btn-reset-filters" id="btn-reset-all-filters">
                ✕ Xóa bộ lọc
              </button>
            ` : ''}
          </div>

        </div>

        <!-- 2. BẢNG SỔ TỒN KHO CHUYÊN NGHIỆP VỚI CÁC DÒNG HIGHLIGHT ĐỎ DƯỚI NGƯỠNG -->
        <div class="ledger-table-card">
          <div class="table-meta-bar">
            <span class="meta-count">Hiển thị <strong>${filteredItems.length}</strong> / ${kpis.totalRecords} bản ghi tồn kho</span>
            <div class="legend-items">
              <span class="legend-item"><span class="legend-box box-below-min"></span> Dưới mức tối thiểu</span>
              <span class="legend-item"><span class="legend-box box-stockout"></span> Cháy hàng (0 cái)</span>
              <span class="legend-item"><span class="legend-box box-healthy"></span> Đạt ngưỡng an toàn</span>
            </div>
          </div>

          <div class="table-responsive-wrapper">
            <table class="nexus-table nexus-table-ledger" id="main-stock-ledger-table">
              <thead>
                <tr>
                  <th class="col-status">Trạng Thái</th>
                  <th class="col-sku">Mã SKU & Sản Phẩm</th>
                  <th class="col-warehouse">Kho Hàng</th>
                  <th class="col-qty text-right">Tồn Vật Lý</th>
                  <th class="col-qty text-right">Giữ Chỗ</th>
                  <th class="col-qty text-right">Tồn Khả Dụng</th>
                  <th class="col-threshold text-right">Tồn Tối Thiểu (Min)</th>
                  <th class="col-gauge text-center">Thước Đo Ngưỡng Tồn</th>
                  <th class="col-deficit text-right">Chênh Lệch</th>
                  <th class="col-runway text-center">Dự Báo</th>
                  <th class="col-actions text-center">Thao Tác Kho & Đặt Hàng</th>
                </tr>
              </thead>
              <tbody>
                ${filteredItems.length === 0 ? `
                  <tr>
                    <td colspan="11" class="text-center py-12 text-muted">
                      Không tìm thấy sản phẩm nào khớp với điều kiện lọc.
                    </td>
                  </tr>
                ` : filteredItems.map(item => `
                  <!-- Dòng tồn kho: Được highlight viền đỏ rực và hiệu ứng nhấp nháy nếu rơi vào Dưới Ngưỡng hoặc Hết Hàng -->
                  <tr class="ledger-row ${item.rowHighlightClass}" id="row-${item.id}">
                    
                    <!-- 1. Trạng thái -->
                    <td class="cell-status">
                      <span class="badge ${item.badgeClass} ${item.isBelowMin ? 'badge-pulse-anim' : ''}">
                        ${item.statusLabel}
                      </span>
                    </td>

                    <!-- 2. SKU & Tên sản phẩm -->
                    <td class="cell-sku">
                      <div class="product-info-wrap">
                        <div class="sku-and-category">
                          <span class="sku-code font-mono">${item.sku}</span>
                          <span class="category-badge">${item.category}</span>
                        </div>
                        <span class="product-fullname" title="${item.productName}">
                          ${item.productName}
                        </span>
                        <div class="barcode-subtext font-mono">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14"></path></svg>
                          ${item.barcode} • ĐVT: ${item.unit}
                        </div>
                      </div>
                    </td>

                    <!-- 3. Kho & Vị trí Kệ -->
                    <td class="cell-warehouse">
                      <div class="warehouse-badge-wrap">
                        <span class="wh-tag" style="border-left: 3px solid ${item.warehouseColor};">
                          ${item.warehouseShortName}
                        </span>
                        <span class="bin-location font-mono">${item.binLocation || 'Khu chung'}</span>
                      </div>
                    </td>

                    <!-- 4. Tồn vật lý -->
                    <td class="text-right font-mono font-medium">
                      ${this.formatNumber(item.physicalStock)}
                    </td>

                    <!-- 5. Đang giữ chỗ đơn hàng -->
                    <td class="text-right font-mono text-muted">
                      ${item.reservedStock > 0 ? `-${item.reservedStock}` : '0'}
                    </td>

                    <!-- 6. TỒN KHẢ DỤNG (AVAILABLE STOCK) - NỔI BẬT NẾU < MIN -->
                    <td class="text-right cell-available">
                      <span class="available-stock-badge ${item.isStockout ? 'stock-zero' : item.isBelowMin ? 'stock-below-min' : 'stock-healthy'} font-mono font-bold">
                        ${this.formatNumber(item.availableStock)}
                      </span>
                    </td>

                    <!-- 7. NGƯỠNG TỒN TỐI THIỂU (MIN THRESHOLD) -->
                    <td class="text-right cell-threshold">
                      <div class="threshold-pill-wrap font-mono">
                        <span class="threshold-min font-bold ${item.isBelowMin ? 'text-rose' : 'text-main'}">
                          ${this.formatNumber(item.minThreshold)}
                        </span>
                        <span class="threshold-max text-muted text-xs">/ Max ${this.formatNumber(item.maxCapacity)}</span>
                        <button class="btn-edit-threshold-mini" data-item-id="${item.id}" title="Sửa nhanh mức tồn tối thiểu">
                          ✎
                        </button>
                      </div>
                    </td>

                    <!-- 8. THƯỚC ĐO TRỰC QUAN NGƯỠNG TỒN (STOCK GAUGE & MARKER) -->
                    <td class="cell-gauge">
                      <div class="stock-gauge-wrapper" title="Tồn khả dụng: ${item.availableStock} | Min: ${item.minThreshold} | Max: ${item.maxCapacity}">
                        <!-- Thanh tiến độ nền -->
                        <div class="gauge-track">
                          <div class="gauge-fill ${item.isStockout ? 'gauge-zero' : item.isBelowMin ? 'gauge-danger' : item.isNearMin ? 'gauge-warning' : 'gauge-healthy'}" 
                               style="width: ${item.fillPercent}%;"></div>
                          <!-- Vạch mốc chỉ đúng ngưỡng Tồn Tối Thiểu (Min Threshold Marker) -->
                          <div class="gauge-marker-min" style="left: ${item.minMarkerPercent}%;" title="Mốc Tồn Tối Thiểu: ${item.minThreshold}"></div>
                        </div>
                        <div class="gauge-labels font-mono text-xs">
                          <span>0</span>
                          <span class="text-rose font-bold">Min: ${item.minThreshold}</span>
                          <span>Max: ${item.maxCapacity}</span>
                        </div>
                      </div>
                    </td>

                    <!-- 9. CHÊNH LỆCH THIẾU HỤT SO VỚI MIN (DEFICIT) -->
                    <td class="text-right font-mono font-bold cell-deficit">
                      ${item.deficitQty > 0 ? `
                        <span class="deficit-badge-negative">
                          -${this.formatNumber(item.deficitQty)}
                        </span>
                      ` : `
                        <span class="text-emerald text-xs font-normal">
                          +${this.formatNumber(item.availableStock - item.minThreshold)}
                        </span>
                      `}
                    </td>

                    <!-- 10. DỰ BÁO RUNWAY -->
                    <td class="text-center cell-runway">
                      <span class="runway-tag ${item.runwayDays === 0 ? 'tag-zero' : item.runwayDays <= 3 ? 'tag-critical' : 'tag-normal'}">
                        ${item.runwayDays === 0 ? '0d (Hết)' : `${item.runwayDays}d`}
                      </span>
                    </td>

                    <!-- 11. CÁC THAO TÁC NGHIỆP VỤ & MÔ PHỎNG GIÁO VIÊN KIỂM THỬ -->
                    <td class="cell-actions text-center">
                      <div class="actions-group">
                        
                        <!-- Nút Đặt hàng NCC nếu dưới ngưỡng -->
                        ${item.isBelowMin ? `
                          <button class="btn btn-primary btn-xs btn-reorder-single" 
                            data-item-id="${item.id}"
                            data-sku="${item.sku}"
                            data-warehouse="${item.warehouseId}"
                            title="Tạo đề xuất đặt hàng NCC bù ${item.suggestedReorderQty} cái">
                            ⚡ Đặt NCC
                          </button>
                        ` : ''}

                        <!-- Nút Mô phỏng Xuất Kho (Simulation Test: Nhấn để thấy tồn giảm qua ngưỡng) -->
                        <div class="simulation-btn-group" title="Mô phỏng xuất/nhập thực tế cho giáo viên kiểm thử">
                          <button class="btn btn-sim-sub btn-xs btn-adjust-stock" 
                            data-item-id="${item.id}" 
                            data-delta="-5" 
                            title="Mô phỏng xuất kho 5 cái (Test cảnh báo rơi dưới Min)">
                            -5 Xuất
                          </button>
                          <button class="btn btn-sim-add btn-xs btn-adjust-stock" 
                            data-item-id="${item.id}" 
                            data-delta="15" 
                            title="Mô phỏng nhập bù tồn 15 cái">
                            +15 Nhập
                          </button>
                        </div>

                      </div>
                    </td>

                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </section>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    // 1. Tìm kiếm tức thời
    const searchInput = this.container.querySelector('#ledger-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        store.setSearchQuery(e.target.value);
      });
    }

    const btnClearSearch = this.container.querySelector('#btn-clear-search');
    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        store.setSearchQuery('');
      });
    }

    // 2. Thay đổi bộ lọc Kho
    const selectWh = this.container.querySelector('#select-filter-warehouse');
    if (selectWh) {
      selectWh.addEventListener('change', (e) => {
        store.setWarehouseFilter(e.target.value);
      });
    }

    // 3. Thay đổi bộ lọc Nhóm hàng
    const selectCat = this.container.querySelector('#select-filter-category');
    if (selectCat) {
      selectCat.addEventListener('change', (e) => {
        store.setCategoryFilter(e.target.value);
      });
    }

    // 4. Lọc nhanh theo trạng thái (Pills)
    this.container.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        const status = e.currentTarget.dataset.status;
        store.setStatusFilter(status);
      });
    });

    // 5. Xóa toàn bộ bộ lọc
    const btnResetAll = this.container.querySelector('#btn-reset-all-filters');
    if (btnResetAll) {
      btnResetAll.addEventListener('click', () => {
        store.setWarehouseFilter('ALL');
        store.setCategoryFilter('ALL');
        store.setStatusFilter('ALL');
        store.setSearchQuery('');
      });
    }

    // 6. Sửa nhanh mức tồn tối thiểu
    this.container.querySelectorAll('.btn-edit-threshold-mini').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.currentTarget.dataset.itemId;
        window.dispatchEvent(new CustomEvent('OPEN_THRESHOLD_MODAL', { detail: { itemId } }));
      });
    });

    // 7. Nút đặt hàng lẻ từng sản phẩm
    this.container.querySelectorAll('.btn-reorder-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sku = e.currentTarget.dataset.sku;
        const wh = e.currentTarget.dataset.warehouse;
        window.dispatchEvent(new CustomEvent('OPEN_PO_MODAL', { detail: { sku, warehouseId: wh } }));
      });
    });

    // 8. Mô phỏng xuất / nhập kho trực tiếp (Live Simulator - Điểm sáng chấm bài)
    this.container.querySelectorAll('.btn-adjust-stock').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.currentTarget.dataset.itemId;
        const delta = parseInt(e.currentTarget.dataset.delta, 10);
        
        const result = store.adjustPhysicalStock(itemId, delta);
        if (result && result.isDropBelowMin) {
          // Âm thanh cảnh báo bíp vang lên!
          audioAlert.playWarningBelowMin();
          // Hiển thị thông báo Toast cảnh báo khẩn
          window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
            detail: {
              type: 'error',
              title: '🚨 BÁO ĐỘNG TỒN DƯỚI NGƯỠNG MIN!',
              message: `SKU ${result.enriched.sku} tại ${result.enriched.warehouseShortName} vừa rơi xuống ${result.enriched.availableStock} chiếc (Tồn tối thiểu: ${result.enriched.minThreshold}). Vui lòng đặt hàng nhà cung cấp!`
            }
          }));
        } else if (delta > 0) {
          audioAlert.playSuccessChime();
          window.dispatchEvent(new CustomEvent('SHOW_TOAST', {
            detail: {
              type: 'success',
              title: '✅ ĐÃ NHẬP KHO THÀNH CÔNG',
              message: `Đã nhập +${delta} chiếc cho SKU ${result.enriched.sku}. Tồn khả dụng mới: ${result.enriched.availableStock} chiếc.`
            }
          }));
        }
      });
    });

    // 9. Xuất sổ tồn CSV
    const btnExportCSV = this.container.querySelector('#btn-export-ledger-csv');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => this._exportLedgerCSV());
    }
  }

  _exportLedgerCSV() {
    const items = store.getFilteredItems();
    const headers = ['Mã SKU', 'Tên Sản Phẩm', 'Kho Hàng', 'ĐVT', 'Tồn Vật Lý', 'Giữ Chỗ', 'Tồn Khả Dụng', 'Tồn Tối Thiểu (Min)', 'Sức Chứa Tối Đa (Max)', 'Chênh Lệch', 'Trạng Thái', 'Vị Trí Kệ'];
    const rows = items.map(i => [
      `"${i.sku}"`,
      `"${i.productName.replace(/"/g, '""')}"`,
      `"${i.warehouseName}"`,
      `"${i.unit}"`,
      i.physicalStock,
      i.reservedStock,
      i.availableStock,
      i.minThreshold,
      i.maxCapacity,
      i.deficitQty > 0 ? -i.deficitQty : (i.availableStock - i.minThreshold),
      `"${i.statusLabel}"`,
      `"${i.binLocation || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `So_Ton_Kho_Nexus_WMS_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
