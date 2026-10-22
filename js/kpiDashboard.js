/**
 * NEXUS ENTERPRISE WMS - WAREHOUSE EXECUTIVE DASHBOARD
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Trực quan hóa số liệu KPI, Biểu đồ phân tích Chart.js & Bảng cảnh báo sớm đứt hàng (Runway Alert)
 */

import { store } from './store.js';

export class KpiDashboardView {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chartStatusPerWarehouse = null;
    this.chartTopDeficits = null;
    this.chartCategoryValue = null;
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  }

  formatNumber(val) {
    return new Intl.NumberFormat('vi-VN').format(val);
  }

  render() {
    if (!this.container) return;

    const kpis = store.getDashboardKPIs();
    const state = store.getState();
    const enrichedItems = store.getEnrichedInventoryItems();

    // Lọc ra các sản phẩm dưới ngưỡng hoặc sắp đứt hàng (Runway < 7 ngày)
    const lowStockItems = enrichedItems
      .filter(item => {
        const matchWh = (state.activeWarehouseFilter === 'ALL' || item.warehouseId === state.activeWarehouseFilter);
        return matchWh && (item.isBelowMin || item.runwayDays <= 7);
      })
      .sort((a, b) => a.runwayDays - b.runwayDays || b.deficitQty - a.deficitQty);

    this.container.innerHTML = `
      <!-- 1. DẢI KPI STRIP ĐỈNH CAO: TẬP TRUNG VÀO CẢNH BÁO TỒN DƯỚI NGƯỠNG -->
      <section class="kpi-grid animate-fade-in" aria-label="Warehouse Operational KPIs">
        
        <!-- KPI 1: TỔNG SKU THEO DÕI -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Tổng Bản Ghi SKU - Kho</span>
            <div class="kpi-icon-wrap icon-blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value">${kpis.totalRecords}</span>
            <span class="kpi-subtext">Vị trí lưu kho</span>
          </div>
          <div class="kpi-footer">
            <span class="kpi-badge badge-neutral">${this.formatNumber(kpis.totalPhysicalUnits)} chiếc tồn vật lý</span>
          </div>
        </div>

        <!-- KPI 2: TỔNG GIÁ TRỊ TỒN KHO -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Tổng Giá Trị Tồn Kho</span>
            <div class="kpi-icon-wrap icon-purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value text-purple">${this.formatCurrency(kpis.totalInventoryValue)}</span>
          </div>
          <div class="kpi-footer">
            <span class="kpi-badge badge-neutral">Giá vốn nhập khẩu</span>
          </div>
        </div>

        <!-- KPI 3: TIÊU CHÍ CỐT LÕI - SKU DƯỚI NGƯỠNG TỐI THIỂU (HIGHLIGHT ĐỎ CRIMSON GLOW) -->
        <div class="kpi-card kpi-card-critical ${kpis.countBelowMin > 0 ? 'pulse-alert-card' : ''}">
          <div class="kpi-header">
            <div class="kpi-title-with-badge">
              <span class="kpi-title text-rose font-bold">SKU Dưới Ngưỡng Tối Thiểu</span>
              <span class="badge-pulse-dot"></span>
            </div>
            <div class="kpi-icon-wrap icon-rose">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value text-rose-glow">${kpis.countBelowMin} <span class="kpi-unit">SKU</span></span>
          </div>
          <div class="kpi-footer">
            <span class="kpi-badge badge-critical-pill">🚨 CẦN ĐẶT HÀNG NCC NGAY</span>
            <button class="btn-link-action" id="btn-quick-filter-below-min">Xem chi tiết sổ tồn &rarr;</button>
          </div>
        </div>

        <!-- KPI 4: HÀNG HẾT HOÀN TOÀN (STOCKOUT = 0) -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Đã Hết Hàng (Stockout)</span>
            <div class="kpi-icon-wrap icon-amber">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value ${kpis.countStockout > 0 ? 'text-amber' : 'text-emerald'}">${kpis.countStockout} <span class="kpi-unit">SKU</span></span>
          </div>
          <div class="kpi-footer">
            <span class="kpi-badge ${kpis.countStockout > 0 ? 'badge-amber' : 'badge-emerald'}">
              ${kpis.countStockout > 0 ? 'Tồn khả dụng = 0 cái' : 'Không có đứt hàng'}
            </span>
          </div>
        </div>

        <!-- KPI 5: TỶ LỆ KHO KHỎE MẠNH (HEALTH RATE %) -->
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Tỷ Lệ Tồn Kho An Toàn</span>
            <div class="kpi-icon-wrap icon-emerald">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value text-emerald">${kpis.healthRate}%</span>
          </div>
          <div class="kpi-footer">
            <div class="health-progress-bar">
              <div class="health-progress-fill" style="width: ${kpis.healthRate}%;"></div>
            </div>
          </div>
        </div>

        <!-- KPI 6: GIÁ TRỊ ĐỀ XUẤT ĐẶT HÀNG BÙ TỒN NCC -->
        <div class="kpi-card kpi-card-reorder">
          <div class="kpi-header">
            <span class="kpi-title">Dự Toán Đặt Hàng NCC</span>
            <div class="kpi-icon-wrap icon-cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            </div>
          </div>
          <div class="kpi-value-wrap">
            <span class="kpi-value text-cyan">${this.formatCurrency(kpis.totalSuggestedReorderCost)}</span>
          </div>
          <div class="kpi-footer">
            <button class="btn btn-primary btn-sm btn-reorder-now" id="btn-quick-generate-po">
              ⚡ Tạo Đơn PO Đặt Hàng
            </button>
          </div>
        </div>

      </section>

      <!-- 2. TRỰC QUAN HÓA BIỂU ĐỒ DOANH NGHIỆP (CHARTS GRID) -->
      <section class="charts-section animate-fade-in">
        <div class="charts-grid-3col">
          
          <!-- Chart 1: So sánh Tình Trạng Tồn Kho Theo Từng Kho -->
          <div class="chart-box">
            <div class="chart-header">
              <div class="chart-title-wrap">
                <h4 class="chart-title">Hiện Trạng Tồn Kho Theo Từng Kho</h4>
                <span class="chart-subtitle">So sánh số lượng SKU: Bình thường vs Dưới Min vs Cháy hàng</span>
              </div>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="chart-warehouse-status"></canvas>
            </div>
          </div>

          <!-- Chart 2: Top SKU Thiếu Hụt Nghiêm Trọng Nhất So Với Tồn Tối Thiểu -->
          <div class="chart-box">
            <div class="chart-header">
              <div class="chart-title-wrap">
                <h4 class="chart-title">Top SKU Thiếu Hụt Nghiêm Trọng (Shortage Gap)</h4>
                <span class="chart-subtitle">So sánh Tồn Khả Dụng vs Ngưỡng Tồn Tối Thiểu (Min)</span>
              </div>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="chart-top-deficits"></canvas>
            </div>
          </div>

          <!-- Chart 3: Phân Bổ Giá Trị Tồn Kho Theo Danh Mục -->
          <div class="chart-box">
            <div class="chart-header">
              <div class="chart-title-wrap">
                <h4 class="chart-title">Cơ Cấu Giá Trị Tồn Theo Nhóm Ngành</h4>
                <span class="chart-subtitle">Tỷ trọng vốn đầu tư lưu kho theo danh mục thiết bị</span>
              </div>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="chart-category-value"></canvas>
            </div>
          </div>

        </div>
      </section>

      <!-- 3. BẢNG CẢNH BÁO SỚM & DỰ BÁO RUNWAY (STOCKOUT RUNWAY FORECAST) -->
      <section class="runway-alert-section animate-fade-in">
        <div class="section-header-bar">
          <div class="section-title-wrap">
            <div class="pulse-icon-indicator"></div>
            <div>
              <h3 class="section-title">Trung Tâm Cảnh Báo Sớm: Nguy Cơ Đứt Hàng Trong 7 Ngày</h3>
              <p class="section-desc">Phân tích tốc độ tiêu thụ hàng ngày (Burn rate) và thời gian giao hàng của NCC để cảnh báo trước khi đứt hàng chứ không phải sau.</p>
            </div>
          </div>
          <div class="section-actions">
            <button class="btn btn-secondary btn-sm" id="btn-export-runway-csv">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Xuất Báo Cáo Cảnh Báo
            </button>
            <button class="btn btn-primary btn-sm" id="btn-open-po-modal-from-runway">
              ⚡ Đặt Hàng Bù Tồn Toàn Bộ (${lowStockItems.length} SKU)
            </button>
          </div>
        </div>

        <div class="table-responsive-wrapper">
          <table class="nexus-table" id="table-runway-alerts">
            <thead>
              <tr>
                <th>Mức Độ</th>
                <th>Mã SKU / Sản Phẩm</th>
                <th>Kho Lưu Trữ</th>
                <th class="text-right">Tồn Khả Dụng</th>
                <th class="text-right">Ngưỡng Tối Thiểu (Min)</th>
                <th class="text-right">Thiếu Hụt</th>
                <th class="text-right">Tốc Độ Xuất (cái/ngày)</th>
                <th class="text-center">Số Ngày Còn Lại (Runway)</th>
                <th>Nhà Cung Cấp</th>
                <th class="text-right">Đề Xuất Đặt</th>
                <th class="text-center">Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              ${lowStockItems.length === 0 ? `
                <tr>
                  <td colspan="11" class="text-center py-8 text-muted">
                    🎉 Tuyệt vời! Hiện tại không có SKU nào dưới ngưỡng tối thiểu hoặc có nguy cơ đứt hàng.
                  </td>
                </tr>
              ` : lowStockItems.map(item => `
                <tr class="${item.rowHighlightClass}">
                  <td class="text-center">
                    <span class="badge ${item.badgeClass}">${item.statusLabel}</span>
                  </td>
                  <td>
                    <div class="sku-cell">
                      <span class="sku-code">${item.sku}</span>
                      <span class="product-name-truncate" title="${item.productName}">${item.productName}</span>
                    </div>
                  </td>
                  <td>
                    <span class="warehouse-tag" style="border-left-color: ${item.warehouseColor};">
                      ${item.warehouseShortName}
                    </span>
                  </td>
                  <td class="text-right font-mono font-bold ${item.isBelowMin ? 'text-rose' : 'text-main'}">
                    ${item.availableStock} ${item.unit}
                  </td>
                  <td class="text-right font-mono text-muted">
                    ${item.minThreshold} ${item.unit}
                  </td>
                  <td class="text-right font-mono font-bold text-rose">
                    ${item.deficitQty > 0 ? `-${item.deficitQty}` : '0'}
                  </td>
                  <td class="text-right font-mono">
                    ${item.dailyBurnRate} / ngày
                  </td>
                  <td class="text-center">
                    <span class="runway-chip ${item.runwayDays === 0 ? 'runway-zero' : item.runwayDays <= 3 ? 'runway-critical' : 'runway-warning'}">
                      ⏱️ ${item.runwayDays === 0 ? 'Đã hết sạch!' : `Còn ${item.runwayDays} ngày`}
                    </span>
                  </td>
                  <td>
                    <span class="supplier-tag">${item.supplierId} (LT: ${item.leadTimeDays}d)</span>
                  </td>
                  <td class="text-right font-mono text-cyan font-bold">
                    +${item.suggestedReorderQty} ${item.unit}
                    <div class="text-xs text-muted font-normal">${this.formatCurrency(item.suggestedReorderCost)}</div>
                  </td>
                  <td class="text-center">
                    <button class="btn btn-primary btn-xs btn-order-single-sku" 
                      data-item-id="${item.id}"
                      data-sku="${item.sku}"
                      data-warehouse="${item.warehouseId}">
                      Đặt Ngay
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;

    this._bindEvents();
    this._renderCharts();
  }

  _bindEvents() {
    // Nút xem chi tiết sổ tồn
    const btnQuickFilter = this.container.querySelector('#btn-quick-filter-below-min');
    if (btnQuickFilter) {
      btnQuickFilter.addEventListener('click', () => {
        store.setStatusFilter('BELOW_MIN');
        store.setActiveTab('ledger');
      });
    }

    // Nút tạo PO nhanh từ Dashboard
    const btnQuickPo = this.container.querySelector('#btn-quick-generate-po');
    const btnRunwayPo = this.container.querySelector('#btn-open-po-modal-from-runway');
    const handleOpenPO = () => {
      window.dispatchEvent(new CustomEvent('OPEN_PO_MODAL', { detail: { supplierId: 'ALL' } }));
    };
    if (btnQuickPo) btnQuickPo.addEventListener('click', handleOpenPO);
    if (btnRunwayPo) btnRunwayPo.addEventListener('click', handleOpenPO);

    // Nút đặt lẻ từng SKU
    this.container.querySelectorAll('.btn-order-single-sku').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sku = e.target.closest('button').dataset.sku;
        const wh = e.target.closest('button').dataset.warehouse;
        window.dispatchEvent(new CustomEvent('OPEN_PO_MODAL', { detail: { sku, warehouseId: wh } }));
      });
    });

    // Xuất CSV báo cáo cảnh báo
    const btnExportRunway = this.container.querySelector('#btn-export-runway-csv');
    if (btnExportRunway) {
      btnExportRunway.addEventListener('click', () => this._exportRunwayReportCSV());
    }
  }

  _renderCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js chưa sẵn sàng.');
      return;
    }

    // Dọn dẹp charts cũ để tránh memory leak
    if (this.chartStatusPerWarehouse) this.chartStatusPerWarehouse.destroy();
    if (this.chartTopDeficits) this.chartTopDeficits.destroy();
    if (this.chartCategoryValue) this.chartCategoryValue.destroy();

    const state = store.getState();
    const enriched = store.getEnrichedInventoryItems();

    // ================= 1. BIỂU ĐỒ 1: TỒN KHO THEO KHO =================
    const ctx1 = document.getElementById('chart-warehouse-status');
    if (ctx1) {
      const warehouseLabels = state.warehouses.map(w => w.shortName);
      const healthyCounts = [];
      const belowMinCounts = [];
      const stockoutCounts = [];

      state.warehouses.forEach(w => {
        const itemsInWh = enriched.filter(i => i.warehouseId === w.id);
        const healthy = itemsInWh.filter(i => i.isHealthy || i.isNearMin || i.isOverstock).length;
        const belowMin = itemsInWh.filter(i => i.isBelowMin && !i.isStockout).length;
        const stockout = itemsInWh.filter(i => i.isStockout).length;

        healthyCounts.push(healthy);
        belowMinCounts.push(belowMin);
        stockoutCounts.push(stockout);
      });

      this.chartStatusPerWarehouse = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: warehouseLabels,
          datasets: [
            {
              label: 'An Toàn / Ổn Định',
              data: healthyCounts,
              backgroundColor: '#10b981',
              borderRadius: 4
            },
            {
              label: '🚨 Dưới Ngưỡng Min',
              data: belowMinCounts,
              backgroundColor: '#f43f5e',
              borderRadius: 4
            },
            {
              label: '⛔ Cháy Hàng (Stockout = 0)',
              data: stockoutCounts,
              backgroundColor: '#ef4444',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
            }
          },
          scales: {
            x: {
              stacked: true,
              ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans' } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              stacked: true,
              ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
          }
        }
      });
    }

    // ================= 2. BIỂU ĐỒ 2: TOP SKU THIẾU HỤT NGHIÊM TRỌNG =================
    const ctx2 = document.getElementById('chart-top-deficits');
    if (ctx2) {
      const topLow = enriched
        .filter(i => i.isBelowMin)
        .sort((a, b) => b.deficitQty - a.deficitQty)
        .slice(0, 6);

      const labels = topLow.map(i => `${i.sku} (${i.warehouseShortName})`);
      const availableData = topLow.map(i => i.availableStock);
      const minData = topLow.map(i => i.minThreshold);

      this.chartTopDeficits = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: labels.length > 0 ? labels : ['Không có hàng thiếu'],
          datasets: [
            {
              label: 'Tồn Khả Dụng',
              data: labels.length > 0 ? availableData : [0],
              backgroundColor: '#3b82f6',
              borderRadius: 4
            },
            {
              label: 'Ngưỡng Tồn Tối Thiểu (Min)',
              data: labels.length > 0 ? minData : [0],
              backgroundColor: '#f43f5e',
              borderRadius: 4
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 11 } }
            }
          },
          scales: {
            x: {
              ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 10 } },
              grid: { display: false }
            }
          }
        }
      });
    }

    // ================= 3. BIỂU ĐỒ 3: CƠ CẤU GIÁ TRỊ TỒN KHO THEO NGÀNH =================
    const ctx3 = document.getElementById('chart-category-value');
    if (ctx3) {
      const categoryMap = new Map();
      enriched.forEach(item => {
        const cat = item.category || 'Khác';
        const val = item.totalInventoryValue || 0;
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + val);
      });

      const catLabels = Array.from(categoryMap.keys());
      const catValues = Array.from(categoryMap.values()).map(v => Math.round(v / 1000000)); // Triệu VNĐ

      this.chartCategoryValue = new Chart(ctx3, {
        type: 'doughnut',
        data: {
          labels: catLabels,
          datasets: [
            {
              data: catValues,
              backgroundColor: [
                '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#3b82f6'
              ],
              borderColor: '#0e1524',
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: '#94a3b8', boxWidth: 12, font: { family: 'Plus Jakarta Sans', size: 10 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.label}: ${new Intl.NumberFormat('vi-VN').format(context.raw)} Triệu VNĐ`;
                }
              }
            }
          },
          cutout: '65%'
        }
      });
    }
  }

  _exportRunwayReportCSV() {
    const enriched = store.getEnrichedInventoryItems();
    const lowStock = enriched.filter(i => i.isBelowMin || i.runwayDays <= 7);

    const headers = ['Mã SKU', 'Tên Sản Phẩm', 'Kho Hàng', 'Tồn Khả Dụng', 'Ngưỡng Tối Thiểu', 'Thiếu Hụt', 'Tốc Độ Tiêu Thụ/Ngày', 'Số Ngày Tồn Còn Lại', 'Mã NCC', 'Số Lượng Cần Đặt', 'Ước Tính Chi Phí (VNĐ)'];
    const rows = lowStock.map(i => [
      `"${i.sku}"`,
      `"${i.productName.replace(/"/g, '""')}"`,
      `"${i.warehouseName}"`,
      i.availableStock,
      i.minThreshold,
      i.deficitQty,
      i.dailyBurnRate,
      i.runwayDays,
      `"${i.supplierId}"`,
      i.suggestedReorderQty,
      i.suggestedReorderCost
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_Cao_Canh_Bao_Dut_Hang_SCRUM35_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
