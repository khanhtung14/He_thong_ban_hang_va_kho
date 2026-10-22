/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Order Creation Screen View (Màn hình Tạo Đơn Hàng & Giám Sát Công Nợ)
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { store } from './store.js';
import { CreditRiskEngine } from './creditEngine.js';

export class OrderScreen {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.selectedCategory = 'ALL';
    this.searchQuery = '';
    
    // Subscribe to store updates
    store.subscribe(() => this.render());
  }

  render() {
    if (!this.container) return;
    const state = store.getState();
    const { currentDealer, cart, cartTotals, creditEvaluation, products, dealers } = state;

    this.container.innerHTML = `
      <div class="order-screen-layout">
        <!-- CỘT BÊN TRÁI: CHỌN ĐẠI LÝ & BỘ SƯU TẬP SẢN PHẨM -->
        <div class="order-main-col">
          
          <!-- KHỐI 1: HỒ SƠ ĐẠI LÝ & BỘ CHỈ SỐ CÔNG NỢ THỜI GIAN THỰC (TIÊU CHÍ 1 ĐỀ BÀI) -->
          <section class="dealer-profile-card">
            <div class="card-header-flex">
              <div class="header-left">
                <span class="section-tag"><i class="ph-bold ph-identification-card"></i> THÔNG TIN ĐẠI LÝ & TÍN DỤNG</span>
                <h2 class="dealer-title">${currentDealer.name}</h2>
                <div class="dealer-meta-tags">
                  <span class="badge ${currentDealer.tierBadge}"><i class="ph-bold ph-seal-check"></i> ${currentDealer.tier}</span>
                  <span class="badge badge-outline"><i class="ph-bold ph-map-pin"></i> ${currentDealer.region}</span>
                  <span class="badge badge-outline"><i class="ph-bold ph-user"></i> ${currentDealer.salesRep}</span>
                  <span class="badge badge-outline"><i class="ph-bold ph-receipt"></i> Hạn thanh toán: Net ${currentDealer.paymentTermDays} ngày</span>
                </div>
              </div>

              <!-- SELECTOR ĐỔI ĐẠI LÝ NHANH -->
              <div class="dealer-switcher-box">
                <label for="dealerSelectInput"><i class="ph-bold ph-arrows-left-right"></i> Chọn đối tác / Đại lý:</label>
                <select id="dealerSelectInput" class="form-select">
                  ${dealers.map(d => `
                    <option value="${d.id}" ${d.id === currentDealer.id ? 'selected' : ''}>
                      ${d.code} - ${d.name} (${CreditRiskEngine.formatShortVND(d.creditLimit)})
                    </option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- THANH ĐO & BỘ CHỈ SỐ CÔNG NỢ CHI TIẾT (TIÊU CHÍ 1: CÔNG NỢ HIỆN TẠI, HẠN MỨC, PHẦN CÒN LẠI) -->
            <div class="credit-telemetry-dashboard">
              <div class="telemetry-grid">
                
                <!-- THẺ 1: HẠN MỨC CÔNG NỢ (CREDIT LIMIT) -->
                <div class="kpi-metric-card limit-card">
                  <div class="metric-label">
                    <span>Hạn mức tín dụng</span>
                    <i class="ph-bold ph-shield-check metric-icon"></i>
                  </div>
                  <div class="metric-value font-mono">${CreditRiskEngine.formatVND(creditEvaluation.creditLimit)}</div>
                  <div class="metric-caption">Quy chế HĐ cấp tối đa</div>
                </div>

                <!-- THẺ 2: CÔNG NỢ HIỆN TẠI (CURRENT DEBT) -->
                <div class="kpi-metric-card debt-card">
                  <div class="metric-label">
                    <span>Công nợ hiện tại</span>
                    <i class="ph-bold ph-wallet metric-icon"></i>
                  </div>
                  <div class="metric-value font-mono text-warning">${CreditRiskEngine.formatVND(creditEvaluation.currentDebt)}</div>
                  <div class="metric-caption">Đang nợ các kỳ trước (${creditEvaluation.currentUtilizationPct}% hạn mức)</div>
                </div>

                <!-- THẺ 3: HẠN MỨC CÒN LẠI (REMAINING AVAILABLE CREDIT) -->
                <div class="kpi-metric-card remaining-card ${creditEvaluation.remainingCredit < 20000000 ? 'text-danger-bg' : ''}">
                  <div class="metric-label">
                    <span>Hạn mức còn lại</span>
                    <i class="ph-bold ph-coins metric-icon"></i>
                  </div>
                  <div class="metric-value font-mono ${creditEvaluation.remainingCredit > 0 ? 'text-success' : 'text-danger'}">
                    ${CreditRiskEngine.formatVND(creditEvaluation.remainingCredit)}
                  </div>
                  <div class="metric-caption">Khả dụng trước khi đặt đơn</div>
                </div>

                <!-- THẺ 4: TỔNG NỢ DỰ KIẾN SAU ĐƠN (PROJECTED EXPOSURE) -->
                <div class="kpi-metric-card projected-card ${creditEvaluation.isExceededLimit ? 'border-danger-glow' : ''}">
                  <div class="metric-label">
                    <span>Tổng nợ sau đơn này</span>
                    <i class="ph-bold ph-chart-line-up metric-icon"></i>
                  </div>
                  <div class="metric-value font-mono ${creditEvaluation.isExceededLimit ? 'text-danger' : 'text-info'}">
                    ${CreditRiskEngine.formatVND(creditEvaluation.projectedTotalDebt)}
                  </div>
                  <div class="metric-caption">
                    ${creditEvaluation.isExceededLimit 
                      ? `<span class="badge-tag-danger">Vượt ${CreditRiskEngine.formatShortVND(creditEvaluation.exceededAmount)}</span>`
                      : `Còn dư ${CreditRiskEngine.formatShortVND(creditEvaluation.projectedRemaining)}`}
                  </div>
                </div>

              </div>

              <!-- THANH GAUGE BIỂU THỊ SỬ DỤNG HẠN MỨC CÔNG NỢ ĐỘNG -->
              <div class="credit-utilization-bar-wrapper">
                <div class="bar-header-info">
                  <span class="bar-title">
                    <i class="ph-bold ph-gauge"></i> Mức độ sử dụng hạn mức tín dụng:
                  </span>
                  <span class="bar-stats font-mono">
                    Hiện tại: <strong>${creditEvaluation.currentUtilizationPct}%</strong>
                    ${cartTotals.grandTotal > 0 ? ` ➔ Sau đơn: <strong class="${creditEvaluation.projectedUtilizationPct > 100 ? 'text-danger' : 'text-primary'}">${creditEvaluation.projectedUtilizationPct}%</strong>` : ''}
                  </span>
                </div>
                
                <div class="progress-track">
                  <!-- Mức nợ hiện tại -->
                  <div class="progress-fill current-debt-fill" style="width: ${Math.min(100, creditEvaluation.currentUtilizationPct)}%;"></div>
                  <!-- Phần nợ tăng thêm do đơn hàng này -->
                  ${cartTotals.grandTotal > 0 ? `
                    <div class="progress-fill order-debt-fill ${creditEvaluation.isExceededLimit ? 'fill-exceeded' : ''}" 
                         style="width: ${Math.min(100 - Math.min(100, creditEvaluation.currentUtilizationPct), Math.max(0, creditEvaluation.projectedUtilizationPct - creditEvaluation.currentUtilizationPct))}%;">
                    </div>
                  ` : ''}
                  <!-- Vạch mốc trần 100% -->
                  <div class="threshold-line" title="Ngưỡng trần 100% Hạn Mức">
                    <span class="threshold-tag">Hạn mức 100%</span>
                  </div>
                </div>

                <div class="progress-legend">
                  <span class="legend-item"><span class="legend-dot color-current"></span> Công nợ hiện tại</span>
                  <span class="legend-item"><span class="legend-dot color-order"></span> Đơn hàng đang tạo (+${CreditRiskEngine.formatShortVND(cartTotals.grandTotal)})</span>
                  <span class="legend-item"><span class="legend-dot color-safe"></span> Khả dụng an toàn</span>
                  ${creditEvaluation.isExceededLimit ? `<span class="legend-item text-danger"><span class="legend-dot color-exceeded"></span> <strong>VƯỢT TRẦN (+${CreditRiskEngine.formatShortVND(creditEvaluation.exceededAmount)})</strong></span>` : ''}
                </div>
              </div>

              <!-- TIÊU CHÍ 3: BANNER CẢNH BÁO KHÓA CỨNG HOÀN TOÀN KHI CÓ KHOẢN QUÁ HẠN -->
              ${creditEvaluation.isOverdueBlocked ? `
                <div class="critical-lock-banner animate-pulse">
                  <div class="banner-icon-box">
                    <i class="ph-fill ph-lock-key"></i>
                  </div>
                  <div class="banner-content">
                    <div class="banner-title">
                      🚫 CHẶN TẠO ĐƠN HOÀN TOÀN: ĐẠI LÝ VI PHẠM NỢ QUÁ HẠN
                    </div>
                    <div class="banner-desc">
                      Đại lý có <strong>${creditEvaluation.violatingInvoices.length} khoản nợ</strong> đã quá hạn thanh toán 
                      lên tới <strong class="text-white">${creditEvaluation.maxOverdueDays} ngày</strong> (vượt quy định tối đa <strong>${creditEvaluation.maxOverdueDaysAllowed} ngày</strong> của công ty).
                      Tổng số tiền nợ quá hạn vi phạm: <strong class="text-white font-mono">${CreditRiskEngine.formatVND(creditEvaluation.violatingOverdueAmount)}</strong>.
                      <div class="banner-action-row">
                        <button class="btn btn-sm btn-light" id="btnViewOverdueInvoices">
                          <i class="ph-bold ph-list-magnifying-glass"></i> Xem bảng kê hóa đơn quá hạn (${creditEvaluation.violatingInvoices.length})
                        </button>
                        <span class="banner-hint">Theo quy chế tài chính: Nhân viên không được tạo đơn cho đến khi khách hàng tất toán nợ quá hạn.</span>
                      </div>
                    </div>
                  </div>
                </div>
              ` : ''}

              <!-- TIÊU CHÍ 2: CẢNH BÁO KHI TỔNG ĐƠN + CÔNG NỢ VƯỢT HẠN MỨC -> ĐÁNH DẤU CẦN DUYỆT -->
              ${!creditEvaluation.isOverdueBlocked && creditEvaluation.isExceededLimit ? `
                <div class="warning-approval-banner">
                  <div class="banner-icon-box warning">
                    <i class="ph-fill ph-warning-octagon"></i>
                  </div>
                  <div class="banner-content">
                    <div class="banner-title">
                      ⚠️ CẢNH BÁO TÍN DỤNG: ĐƠN HÀNG VƯỢT HẠN MỨC CÔNG NỢ (+${CreditRiskEngine.formatVND(creditEvaluation.exceededAmount)})
                    </div>
                    <div class="banner-desc">
                      Tổng nợ sau đơn là <strong>${CreditRiskEngine.formatVND(creditEvaluation.projectedTotalDebt)}</strong> vượt hạn mức được cấp <strong>${CreditRiskEngine.formatVND(creditEvaluation.creditLimit)}</strong>.
                      <br>
                      <strong>Quy trình xử lý:</strong> Đơn hàng sẽ <strong>KHÔNG</strong> được duyệt tự động mà được đánh dấu chuyển sang trạng thái 
                      <span class="badge badge-warning font-bold"><i class="ph-bold ph-hourglass-high"></i> CẦN DUYỆT (PENDING APPROVAL)</span> 
                      và gửi tới Kế toán trưởng & Giám đốc tài chính phê duyệt ngoại lệ.
                    </div>
                  </div>
                </div>
              ` : ''}

            </div>
          </section>

          <!-- KHỐI 2: DANH MỤC SẢN PHẨM & TÌM KIẾM -->
          <section class="product-catalog-section">
            <div class="catalog-toolbar">
              <div class="toolbar-title-wrap">
                <h3 class="catalog-heading"><i class="ph-bold ph-package"></i> Danh Mục Thiết Bị & Hàng Hóa</h3>
                <span class="text-muted">Chọn sản phẩm thêm vào đơn hàng</span>
              </div>

              <!-- TÌM KIẾM & BỘ LỌC DANH MỤC -->
              <div class="catalog-filter-controls">
                <div class="search-input-box">
                  <i class="ph-bold ph-magnifying-glass search-icon"></i>
                  <input type="text" id="catalogSearchInput" class="form-input" 
                         placeholder="Tìm theo tên sản phẩm, mã SKU..." 
                         value="${this.searchQuery}">
                </div>
                
                <div class="category-tabs">
                  <button class="cat-pill ${this.selectedCategory === 'ALL' ? 'active' : ''}" data-cat="ALL">Tất cả</button>
                  <button class="cat-pill ${this.selectedCategory === 'Máy Chủ & Data Center' ? 'active' : ''}" data-cat="Máy Chủ & Data Center">Máy Chủ</button>
                  <button class="cat-pill ${this.selectedCategory === 'Máy Tính Doanh Nghiệp' ? 'active' : ''}" data-cat="Máy Tính Doanh Nghiệp">Máy Tính</button>
                  <button class="cat-pill ${this.selectedCategory === 'Thiết Bị Mạng' ? 'active' : ''}" data-cat="Thiết Bị Mạng">Mạng & An Ninh</button>
                  <button class="cat-pill ${this.selectedCategory === 'Lưu Trữ & Backup' ? 'active' : ''}" data-cat="Lưu Trữ & Backup">Lưu Trữ</button>
                </div>
              </div>
            </div>

            <!-- LƯỚI SẢN PHẨM -->
            <div class="products-grid">
              ${this.renderProductsList(products, creditEvaluation.isOverdueBlocked)}
            </div>
          </section>

        </div>

        <!-- CỘT BÊN PHẢI: CHI TIẾT GIỎ HÀNG & NÚT CHỐT ĐƠN / GỬI DUYỆT -->
        <aside class="order-cart-col">
          <div class="cart-sticky-container">
            
            <div class="cart-header">
              <div class="cart-title">
                <i class="ph-bold ph-shopping-cart-simple"></i>
                <span>Chi Tiết Đơn Hàng</span>
                <span class="cart-counter">${cartTotals.totalItems} món</span>
              </div>
              ${cart.length > 0 ? `
                <button class="btn-text-danger" id="btnClearCart" title="Xóa toàn bộ giỏ hàng">
                  <i class="ph-bold ph-trash"></i> Xóa
                </button>
              ` : ''}
            </div>

            <!-- DANH SÁCH MÓN TRONG ĐƠN -->
            <div class="cart-items-wrapper">
              ${cart.length === 0 ? `
                <div class="cart-empty-state">
                  <div class="empty-icon-wrap">
                    <i class="ph-thin ph-shopping-bag-open"></i>
                  </div>
                  <h4>Chưa có sản phẩm nào</h4>
                  <p>Vui lòng nhấn "+ Thêm vào đơn" từ danh mục sản phẩm bên trái để bắt đầu lập đơn.</p>
                </div>
              ` : `
                <div class="cart-items-list">
                  ${cart.map(item => `
                    <div class="cart-item-row" data-id="${item.productId}">
                      <div class="item-icon-box">${item.image || '📦'}</div>
                      <div class="item-info">
                        <div class="item-name">${item.name}</div>
                        <div class="item-sku-price font-mono">
                          ${CreditRiskEngine.formatVND(item.price)} / ${item.unit}
                        </div>
                      </div>
                      
                      <!-- BỘ TĂNG GIẢM SỐ LƯỢNG -->
                      <div class="item-stepper">
                        <button class="step-btn btn-dec" data-id="${item.productId}">-</button>
                        <input type="number" class="step-input font-mono" value="${item.quantity}" min="1" max="99" data-id="${item.productId}">
                        <button class="step-btn btn-inc" data-id="${item.productId}">+</button>
                      </div>

                      <div class="item-subtotal font-mono">
                        ${CreditRiskEngine.formatShortVND(item.subtotal)}
                      </div>

                      <button class="btn-remove-item" data-id="${item.productId}" title="Xóa sản phẩm">
                        <i class="ph-bold ph-x"></i>
                      </button>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- TỔNG TIỀN VÀ THUẾ VAT -->
            <div class="cart-financial-summary">
              <div class="summary-line">
                <span class="text-muted">Tiền hàng tạm tính:</span>
                <span class="font-mono">${CreditRiskEngine.formatVND(cartTotals.subtotal)}</span>
              </div>
              <div class="summary-line">
                <span class="text-muted">Thuế VAT (10%):</span>
                <span class="font-mono">${CreditRiskEngine.formatVND(cartTotals.vatAmount)}</span>
              </div>
              <div class="summary-divider"></div>
              <div class="summary-line line-grand-total">
                <span>Tổng cộng đơn hàng:</span>
                <span class="grand-total-amount font-mono text-primary">${CreditRiskEngine.formatVND(cartTotals.grandTotal)}</span>
              </div>
            </div>

            <!-- KHỐI QUYẾT ĐỊNH & THẨM ĐỊNH TỰ ĐỘNG CỦA HỆ THỐNG (GATEKEEPER VERDICT) -->
            <div class="gatekeeper-verdict-box status-${creditEvaluation.alertLevel.toLowerCase()}">
              <div class="verdict-header">
                <span class="verdict-label">KẾT QUẢ THẨM ĐỊNH TÍN DỤNG:</span>
                <span class="badge badge-${creditEvaluation.alertLevel.toLowerCase()}">
                  ${creditEvaluation.statusBadgeText}
                </span>
              </div>
              <p class="verdict-desc">${creditEvaluation.statusDescription}</p>
            </div>

            <!-- NÚT HÀNH ĐỘNG DUYỆT ĐƠN / TẠO ĐƠN / BỊ CHẶN -->
            <div class="cart-action-footer">
              ${this.renderActionButton(creditEvaluation, cartTotals)}
            </div>

          </div>
        </aside>

      </div>
    `;

    this.attachEventListeners();
  }

  renderProductsList(products, isOverdueBlocked) {
    let filtered = products;
    if (this.selectedCategory !== 'ALL') {
      filtered = filtered.filter(p => p.category === this.selectedCategory);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      return `
        <div class="empty-products-notice">
          <i class="ph-bold ph-magnifying-glass"></i>
          Không tìm thấy sản phẩm nào phù hợp với từ khóa "${this.searchQuery}"
        </div>
      `;
    }

    return filtered.map(prod => `
      <div class="product-item-card">
        <div class="prod-badge-category">${prod.category}</div>
        <div class="prod-visual">
          <span class="prod-icon-emoji">${prod.image}</span>
        </div>
        <div class="prod-details">
          <span class="prod-sku font-mono">${prod.sku}</span>
          <h4 class="prod-name" title="${prod.name}">${prod.name}</h4>
          
          <div class="prod-meta-row">
            <span class="prod-stock"><i class="ph-bold ph-check"></i> Còn ${prod.stock} ${prod.unit}</span>
            <span class="prod-price font-mono">${CreditRiskEngine.formatVND(prod.price)}</span>
          </div>

          <button class="btn btn-primary btn-add-prod ${isOverdueBlocked ? 'btn-disabled-lock' : ''}" 
                  data-id="${prod.id}" 
                  ${isOverdueBlocked ? 'disabled title="Đại lý đang bị khóa do nợ quá hạn"' : ''}>
            ${isOverdueBlocked 
              ? '<i class="ph-bold ph-lock"></i> Đang bị khóa nợ' 
              : '<i class="ph-bold ph-plus-circle"></i> Thêm vào đơn'}
          </button>
        </div>
      </div>
    `).join('');
  }

  renderActionButton(creditEvaluation, cartTotals) {
    // Nếu giỏ hàng rỗng
    if (cartTotals.grandTotal === 0) {
      return `
        <button class="btn btn-action-main btn-disabled" disabled>
          <i class="ph-bold ph-shopping-bag"></i> Vui lòng chọn sản phẩm vào đơn
        </button>
      `;
    }

    // TIÊU CHÍ 3: BỊ CHẶN HOÀN TOÀN DO CÓ NỢ QUÁ HẠN > SỐ NGÀY CHO PHÉP
    if (creditEvaluation.isOverdueBlocked) {
      return `
        <button class="btn btn-action-main btn-action-blocked" id="btnBlockedOrder" disabled>
          <i class="ph-fill ph-prohibit"></i> CHẶN TẠO ĐƠN HOÀN TOÀN
        </button>
        <div class="blocked-subtext text-danger">
          <i class="ph-bold ph-info"></i> Bắt buộc thu hồi nợ quá hạn (${creditEvaluation.maxOverdueDays} ngày) trước khi được lên đơn tiếp theo.
        </div>
      `;
    }

    // TIÊU CHÍ 2: VƯỢT HẠN MỨC -> ĐÁNH DẤU CẦN DUYỆT (GỬI YÊU CẦU DUYỆT)
    if (creditEvaluation.isExceededLimit) {
      return `
        <button class="btn btn-action-main btn-action-approval" id="btnRequestApproval">
          <i class="ph-fill ph-file-text"></i> GỬI YÊU CẦU DUYỆT VƯỢT HẠN MỨC
        </button>
        <div class="action-subtext text-warning">
          <i class="ph-bold ph-info"></i> Đơn sẽ được đánh dấu <strong>CẦN DUYỆT</strong> (+${CreditRiskEngine.formatShortVND(creditEvaluation.exceededAmount)})
        </div>
      `;
    }

    // TRONG HẠN MỨC: TỰ ĐỘNG DUYỆT NGAY
    return `
      <button class="btn btn-action-main btn-action-approve" id="btnSubmitOrderNormal">
        <i class="ph-fill ph-check-circle"></i> TẠO & DUYỆT ĐƠN HÀNG NGAY
      </button>
      <div class="action-subtext text-success">
        <i class="ph-bold ph-seal-check"></i> Đủ điều kiện - Đơn sẽ ở trạng thái <strong>ĐÃ XÁC NHẬN (APPROVED)</strong>
      </div>
    `;
  }

  attachEventListeners() {
    // 1. Chuyển đổi đại lý
    const dealerSelect = document.getElementById('dealerSelectInput');
    if (dealerSelect) {
      dealerSelect.addEventListener('change', (e) => {
        store.setDealer(e.target.value);
      });
    }

    // 2. Lọc danh mục sản phẩm
    const catBtns = this.container.querySelectorAll('.cat-pill');
    catBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedCategory = btn.dataset.cat;
        this.render();
      });
    });

    // 3. Tìm kiếm sản phẩm
    const searchInput = document.getElementById('catalogSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        // Chỉ re-render danh mục để giữ focus
        const grid = this.container.querySelector('.products-grid');
        const state = store.getState();
        if (grid) {
          grid.innerHTML = this.renderProductsList(state.products, state.creditEvaluation.isOverdueBlocked);
          this.attachProductAddEvents();
        }
      });
    }

    this.attachProductAddEvents();
    this.attachCartEvents();
    this.attachActionEvents();
  }

  attachProductAddEvents() {
    const addBtns = this.container.querySelectorAll('.btn-add-prod:not([disabled])');
    addBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const prodId = btn.dataset.id;
        store.addToCart(prodId, 1);
        if (window.AppNotifications) {
          window.AppNotifications.toast('success', 'Đã thêm sản phẩm vào đơn hàng');
        }
      });
    });
  }

  attachCartEvents() {
    // Tăng số lượng
    const incBtns = this.container.querySelectorAll('.btn-inc');
    incBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const prodId = btn.dataset.id;
        const state = store.getState();
        const item = state.cart.find(i => i.productId === prodId);
        if (item) store.updateCartItemQuantity(prodId, item.quantity + 1);
      });
    });

    // Giảm số lượng
    const decBtns = this.container.querySelectorAll('.btn-dec');
    decBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const prodId = btn.dataset.id;
        const state = store.getState();
        const item = state.cart.find(i => i.productId === prodId);
        if (item) store.updateCartItemQuantity(prodId, item.quantity - 1);
      });
    });

    // Nhập trực tiếp số lượng
    const stepInputs = this.container.querySelectorAll('.step-input');
    stepInputs.forEach(input => {
      input.addEventListener('change', () => {
        const prodId = input.dataset.id;
        store.updateCartItemQuantity(prodId, input.value);
      });
    });

    // Xóa từng món
    const removeBtns = this.container.querySelectorAll('.btn-remove-item');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const prodId = btn.dataset.id;
        store.removeFromCart(prodId);
      });
    });

    // Xóa giỏ hàng
    const clearBtn = document.getElementById('btnClearCart');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        store.clearCart();
      });
    }
  }

  attachActionEvents() {
    // Xem bảng kê hóa đơn nợ quá hạn
    const btnViewOverdue = document.getElementById('btnViewOverdueInvoices');
    if (btnViewOverdue) {
      btnViewOverdue.addEventListener('click', () => {
        if (window.AppModals) {
          window.AppModals.openOverdueInvoicesModal();
        }
      });
    }

    // Nút tạo đơn trong hạn mức (Tự động duyệt ngay)
    const btnSubmitNormal = document.getElementById('btnSubmitOrderNormal');
    if (btnSubmitNormal) {
      btnSubmitNormal.addEventListener('click', () => {
        try {
          const order = store.submitOrder();
          if (window.AppNotifications) {
            window.AppNotifications.toast(
              'success', 
              `Đơn hàng #${order.orderNo} đã tạo thành công & ĐÃ XÁC NHẬN trong hạn mức!`
            );
          }
          if (window.AppModals) {
            window.AppModals.openOrderSuccessModal(order);
          }
        } catch (err) {
          if (window.AppNotifications) {
            window.AppNotifications.toast('error', err.message);
          }
        }
      });
    }

    // Nút gửi yêu cầu duyệt vượt hạn mức (Tiêu chí 2)
    const btnRequestApproval = document.getElementById('btnRequestApproval');
    if (btnRequestApproval) {
      btnRequestApproval.addEventListener('click', () => {
        if (window.AppModals) {
          window.AppModals.openApprovalRequestModal();
        }
      });
    }
  }
}
