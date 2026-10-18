/**
 * NEXUS OMS // ENTERPRISE ORDER MANAGEMENT APPLICATION CONTROLLER
 * Điều khiển giao diện, bộ lọc, tương tác vai trò, Modal kiểm toán & thông báo Toast
 */

class NexusApp {
  constructor() {
    this.stateMachine = window.orderStateMachine;
    this.inventory = window.inventoryService;
    
    this.currentFilter = "ALL";
    this.searchQuery = "";
    this.selectedOrderId = null;
    this.currentRole = {
      id: "SALES_REP",
      name: "Trần Minh Quân",
      title: "Nhân viên kinh doanh (Sales)"
    };

    this.init();
  }

  init() {
    const orders = this.stateMachine.getAllOrders();
    if (orders.length > 0) {
      this.selectedOrderId = orders[0].id;
    }

    this.bindEvents();
    this.renderKPIs();
    this.renderOrdersList();
    this.renderOrderDetail();
  }

  // Format tiền tệ VNĐ
  formatCurrency(amount) {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
  }

  showToast(type, title, message) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <h5>${title}</h5>
        <p>${message}</p>
      </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  bindEvents() {
    // Filter tabs
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        tabBtns.forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        this.currentFilter = e.target.getAttribute("data-status");
        this.renderOrdersList();
      });
    });

    // Search input
    const searchInput = document.getElementById("orderSearchInput");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderOrdersList();
      });
    }

    // Role switcher
    const roleSelect = document.getElementById("activeRoleSelect");
    if (roleSelect) {
      roleSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "SALES_REP") {
          this.currentRole = { id: "SALES_REP", name: "Trần Minh Quân", title: "Nhân viên kinh doanh (Sales)" };
        } else if (val === "SALES_MGR") {
          this.currentRole = { id: "SALES_MGR", name: "Nguyễn Tuấn Kiệt", title: "Quản lý kinh doanh (Manager)" };
        } else if (val === "WAREHOUSE") {
          this.currentRole = { id: "WAREHOUSE", name: "Lê Văn Hùng", title: "Thủ kho (Kho Thủ Đức)" };
        } else if (val === "CARRIER") {
          this.currentRole = { id: "CARRIER", name: "Ahamove / GHTK", title: "Đơn vị vận chuyển" };
        }
        document.getElementById("currentRoleName").innerText = this.currentRole.name;
        document.getElementById("currentRoleTitle").innerText = this.currentRole.title;
        this.showToast("info", "Chuyển đổi vai trò", `Bạn đang tương tác với tư cách: ${this.currentRole.name} (${this.currentRole.title})`);
        this.renderOrderDetail();
      });
    }

    // Reset Demo Button
    const resetBtn = document.getElementById("btnResetDemo");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Bạn có muốn khôi phục lại toàn bộ dữ liệu đơn hàng và kho về trạng thái mẫu ban đầu?")) {
          this.stateMachine.resetToDefault();
          this.inventory.resetToDefault();
          const orders = this.stateMachine.getAllOrders();
          this.selectedOrderId = orders[0].id;
          this.renderKPIs();
          this.renderOrdersList();
          this.renderOrderDetail();
          this.showToast("success", "Khôi phục thành công", "Toàn bộ dữ liệu mẫu đã được reset về mặc định.");
        }
      });
    }

    // Modal Triggers
    const btnOpenInventory = document.getElementById("btnOpenInventoryModal");
    if (btnOpenInventory) {
      btnOpenInventory.addEventListener("click", () => this.openInventoryModal());
    }

    const btnNewOrder = document.getElementById("btnNewOrderModal");
    if (btnNewOrder) {
      btnNewOrder.addEventListener("click", () => this.openNewOrderModal());
    }

    // Modal Close buttons
    document.querySelectorAll(".modal-close-btn, .btn-modal-cancel").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const modal = e.target.closest(".modal-backdrop");
        if (modal) modal.classList.remove("open");
      });
    });

    // Form Huỷ Đơn Submit
    const cancelForm = document.getElementById("cancelOrderForm");
    if (cancelForm) {
      cancelForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleConfirmCancelOrder();
      });
    }

    // Form Trả Hàng (RMA) Submit
    const returnForm = document.getElementById("returnOrderForm");
    if (returnForm) {
      returnForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleConfirmReturnOrder();
      });
    }

    // Form Tạo Đơn Mới Submit
    const newOrderForm = document.getElementById("newOrderForm");
    if (newOrderForm) {
      newOrderForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleConfirmCreateOrder();
      });
    }
  }

  renderKPIs() {
    const orders = this.stateMachine.getAllOrders();
    const products = this.inventory.getAllProducts();

    const totalOrders = orders.length;
    const warehouseProcessing = orders.filter(o => o.status === "APPROVED" || o.status === "PICKING").length;
    const totalReservedStock = products.reduce((acc, p) => acc + p.reservedStock, 0);
    const dispatchedCount = orders.filter(o => o.status === "DISPATCHED" || o.status === "DELIVERED" || o.status === "CLOSED").length;
    const cancelledCount = orders.filter(o => o.status === "CANCELLED").length;
    const returnCount = orders.filter(o => o.status === "RETURN_PROCESSING").length;

    document.getElementById("kpiTotalOrders").innerText = totalOrders;
    document.getElementById("kpiWarehouseCount").innerText = warehouseProcessing;
    document.getElementById("kpiReservedStock").innerText = totalReservedStock + " món";
    document.getElementById("kpiDispatchedCount").innerText = dispatchedCount;
    document.getElementById("kpiCancelledCount").innerText = cancelledCount;
    document.getElementById("kpiReturnsCount").innerText = returnCount;
  }

  renderOrdersList() {
    const orders = this.stateMachine.getAllOrders();
    const container = document.getElementById("ordersListContainer");
    if (!container) return;

    let filtered = orders;

    // Filter theo status
    if (this.currentFilter !== "ALL") {
      filtered = filtered.filter(o => o.status === this.currentFilter);
    }

    // Filter theo search
    if (this.searchQuery) {
      filtered = filtered.filter(o => {
        const text = `${o.code} ${o.customer.name} ${o.customer.phone} ${o.items.map(i => i.name + i.sku).join(" ")}`.toLowerCase();
        return text.includes(this.searchQuery);
      });
    }

    document.getElementById("orderListCountBadge").innerText = `${filtered.length} đơn`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted);">
          <svg style="width: 40px; height: 40px; margin-bottom: 0.5rem; opacity: 0.4;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
          <p style="font-size: 0.82rem; font-weight: 600;">Không tìm thấy đơn hàng phù hợp</p>
          <span style="font-size: 0.72rem;">Thử đổi từ khoá tìm kiếm hoặc chuyển tab bộ lọc khác</span>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(order => {
      const statusMeta = ORDER_STATUSES[order.status] || { label: order.status, badgeClass: "badge-draft" };
      const totalAmount = order.items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
      const isSelected = order.id === this.selectedOrderId;

      return `
        <div class="order-card-item ${isSelected ? "selected" : ""}" data-order-id="${order.id}">
          <div class="card-top-row">
            <span class="order-code-badge">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
              ${order.code}
            </span>
            <span class="badge-status ${statusMeta.badgeClass}">${statusMeta.label}</span>
          </div>

          <div class="card-customer-row" title="${order.customer.name}">
            ${order.customer.name}
          </div>

          <div class="card-items-summary">
            <span>📦 ${order.items.reduce((s, i) => s + i.quantity, 0)} sản phẩm: ${order.items[0].name.substring(0, 26)}...</span>
          </div>

          <div class="card-bottom-row">
            <span class="order-created-time">🕒 ${order.createdAt}</span>
            <span class="card-total-amount">${this.formatCurrency(totalAmount)}</span>
          </div>
        </div>
      `;
    }).join("");

    // Add click listeners to cards
    container.querySelectorAll(".order-card-item").forEach(card => {
      card.addEventListener("click", () => {
        const orderId = card.getAttribute("data-order-id");
        this.selectedOrderId = orderId;
        this.renderOrdersList();
        this.renderOrderDetail();
      });
    });
  }

  renderOrderDetail() {
    const container = document.getElementById("orderDetailContainer");
    if (!container) return;

    const order = this.stateMachine.getOrderById(this.selectedOrderId);
    if (!order) {
      container.innerHTML = `<div style="padding: 3rem; text-align: center; color: var(--text-muted);">Vui lòng chọn một đơn hàng để xem chi tiết.</div>`;
      return;
    }

    const statusMeta = ORDER_STATUSES[order.status] || { label: order.status, badgeClass: "badge-draft", description: "" };
    const guard = this.stateMachine.canCancelOrder(order);
    const subtotal = order.items.reduce((s, i) => s + (i.unitPrice * i.quantity), 0);
    const vat = subtotal * 0.1;
    const total = subtotal + vat;

    // Render action buttons based on status & business guards
    let actionButtonsHtml = "";

    // Nút huỷ đơn (Business Rule 2 & 3)
    if (order.status === "CANCELLED") {
      actionButtonsHtml += `
        <span class="badge-status badge-cancelled" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
          ❌ Đơn hàng đã huỷ
        </span>
      `;
    } else if (order.status === "CLOSED") {
      actionButtonsHtml += `
        <span class="badge-status badge-closed" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">
          ✔ Đơn đã đóng
        </span>
      `;
    } else if (order.status === "DISPATCHED" || order.status === "DELIVERED") {
      // RULE: Đơn đã xuất kho thì KHÔNG HUỶ ĐƯỢC, PHẢI ĐI ĐƯỜNG TRẢ HÀNG!
      actionButtonsHtml += `
        <button class="btn btn-danger-locked" title="Đơn đã xuất kho thì không huỷ được, phải đi đường trả hàng" onclick="app.showLockedCancelNotice('${order.code}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          Huỷ đơn (Bị khoá do đã xuất kho)
        </button>
        <button class="btn btn-warning" onclick="app.openReturnOrderModal('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
          Khởi tạo Phiếu Trả Hàng (RMA)
        </button>
      `;
    } else if (order.status === "RETURN_PROCESSING") {
      actionButtonsHtml += `
        <button class="btn btn-success" onclick="app.handleCompleteRestock('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Thủ kho xác nhận Nhập Lại Hàng Vào Tồn Kho
        </button>
      `;
    } else {
      // Được phép huỷ: DRAFT, PENDING_APPROVAL, APPROVED, PICKING
      actionButtonsHtml += `
        <button class="btn btn-danger" onclick="app.openCancelOrderModal('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          Huỷ đơn (Tự động nhả tồn giữ chỗ)
        </button>
      `;
    }

    // Nút chuyển bước tiếp theo trong quy trình (Simulation Step)
    if (order.status === "DRAFT") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          Gửi phê duyệt đơn hàng
        </button>
      `;
    } else if (order.status === "PENDING_APPROVAL") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Quản lý duyệt (Kích hoạt Giữ Chỗ Tồn Kho)
        </button>
      `;
    } else if (order.status === "APPROVED") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
          Thủ kho tiếp nhận soạn hàng
        </button>
      `;
    } else if (order.status === "PICKING") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
          Xác nhận Xuất kho (Trừ tồn thực tế & Giao vận)
        </button>
      `;
    } else if (order.status === "DISPATCHED") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
          Giao hàng thành công (Khách đã nhận)
        </button>
      `;
    } else if (order.status === "DELIVERED") {
      actionButtonsHtml += `
        <button class="btn btn-primary" onclick="app.handleAdvanceStep('${order.id}')">
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
          Đóng đơn (Hạch toán xong)
        </button>
      `;
    }

    // Nút in phiếu
    actionButtonsHtml += `
      <button class="btn btn-outline" onclick="window.print()">
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
        In hoá đơn / Phiếu xuất
      </button>
    `;

    // 7 STAGES DEFINITION
    const stages = [
      { key: "DRAFT", label: "1. Nháp" },
      { key: "PENDING_APPROVAL", label: "2. Chờ duyệt" },
      { key: "APPROVED", label: "3. Đã duyệt" },
      { key: "PICKING", label: "4. Đang soạn hàng" },
      { key: "DISPATCHED", label: "5. Đã xuất kho" },
      { key: "DELIVERED", label: "6. Đã giao" },
      { key: "CLOSED", label: "7. Đóng" }
    ];

    const currentStageIndex = ORDER_STATUSES[order.status] ? ORDER_STATUSES[order.status].stepIndex : -1;

    let stepperHtml = `
      <div class="stepper-section">
        <div class="stepper-header">
          <span class="stepper-title">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            Theo dõi Vòng đời Đơn hàng & Kho bãi (Real-time Pipeline)
          </span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Cập nhật lần cuối: ${order.updatedAt || order.createdAt}</span>
        </div>

        <div class="stepper-track">
          ${stages.map((st, idx) => {
            let stateClass = "";
            let iconOrNum = idx + 1;
            if (currentStageIndex > idx) {
              stateClass = "completed";
              iconOrNum = "✓";
            } else if (currentStageIndex === idx) {
              stateClass = "current";
            }
            return `
              <div class="stepper-step ${stateClass}">
                <div class="step-circle">${iconOrNum}</div>
                <div class="step-label">${st.label}</div>
              </div>
            `;
          }).join("")}
        </div>
    `;

    // Hiển thị Banner cảnh báo Huỷ hoặc Trả hàng trong Stepper
    if (order.status === "CANCELLED" && order.cancellation) {
      stepperHtml += `
        <div class="stepper-cancelled-alert">
          <div class="cancelled-alert-icon">❌</div>
          <div class="cancelled-alert-body">
            <h4>ĐƠN HÀNG ĐÃ BỊ HUỶ - TỰ ĐỘNG GIẢI PHÓNG TỒN KHO GIỮ CHỖ</h4>
            <p><strong>Thời điểm huỷ:</strong> ${order.cancellation.cancelledAt} bởi <strong>${order.cancellation.cancelledBy}</strong></p>
            <p><strong>Danh mục lý do:</strong> ${order.cancellation.reasonCategory}</p>
            <p><strong>Chi tiết lý do:</strong> ${order.cancellation.detailedReason}</p>
            <div class="inventory-released-tag">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              Hệ thống đã tự động hoàn trả toàn bộ số lượng giữ chỗ về tồn kho khả dụng!
            </div>
          </div>
        </div>
      `;
    } else if (order.status === "RETURN_PROCESSING" && order.returnOrder) {
      stepperHtml += `
        <div class="stepper-cancelled-alert return-alert">
          <div class="cancelled-alert-icon">🔄</div>
          <div class="cancelled-alert-body">
            <h4>QUY TRÌNH TRẢ HÀNG & NHẬP KHO LẠI (RMA: ${order.returnOrder.rmaCode})</h4>
            <p><strong>Lý do trả hàng:</strong> ${order.returnOrder.reasonCategory} - ${order.returnOrder.detailedReason}</p>
            <p><strong>Tình trạng hàng:</strong> ${order.returnOrder.condition}</p>
            <p><strong>Trạng thái hoàn kho:</strong> ${order.returnOrder.restocked ? "✅ Đã nhập trả vào tồn thực tế" : "⏳ Đang vận chuyển về kho để thủ kho kiểm đếm"}</p>
          </div>
        </div>
      `;
    }

    stepperHtml += `</div>`;

    // WAREHOUSE TELEMETRY CONSOLE ("Không phải gọi hỏi kho")
    const warehouseHtml = `
      <div class="warehouse-telemetry-box">
        <div class="telemetry-header">
          <div class="telemetry-title">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            Trung tâm Giám sát Kho Real-time (WMS Telemetry)
          </div>
          <div class="live-pulse-badge">
            <span class="live-dot"></span>
            Đồng bộ trực tuyến • Không cần gọi kho
          </div>
        </div>

        <div class="telemetry-grid">
          <div class="telemetry-item">
            <div class="telemetry-item-label">Kho phụ trách & Nhân viên</div>
            <div class="telemetry-item-val">${order.warehouse.name}</div>
            <div style="font-size: 0.72rem; color: #38bdf8; margin-top: 2px;">👤 ${order.warehouse.operatorName}</div>
          </div>

          <div class="telemetry-item">
            <div class="telemetry-item-label">Vị trí Kệ hàng (Bin Location)</div>
            <div class="telemetry-item-val" style="font-family: var(--font-mono); color: #fbbf24;">📍 ${order.warehouse.binSummary}</div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">Tối ưu lộ trình nhặt hàng tự động</div>
          </div>

          <div class="telemetry-item">
            <div class="telemetry-item-label">Tiến độ Soạn hàng (Pick-list)</div>
            <div class="telemetry-item-val">${order.warehouse.pickProgress}</div>
            <div style="font-size: 0.72rem; color: #4ade80; margin-top: 2px;">
              ${order.status === "PICKING" ? "⚡ Đang quét mã vạch Barcode" : (order.status === "DISPATCHED" ? "✔ Đã niêm phong" : "Chờ xử lý")}
            </div>
          </div>

          <div class="telemetry-item">
            <div class="telemetry-item-label">Biên bản Xuất kho / Vận chuyển</div>
            <div class="telemetry-item-val" style="font-family: var(--font-mono);">
              ${order.warehouse.dispatchNoteNumber ? `📄 ${order.warehouse.dispatchNoteNumber}` : "Chưa lập phiếu"}
            </div>
            <div style="font-size: 0.72rem; color: #94a3b8; margin-top: 2px;">
              ${order.carrier ? `🚚 ${order.carrier.name} (${order.carrier.trackingCode})` : "Chưa bàn giao nhà xe"}
            </div>
          </div>
        </div>
      </div>
    `;

    // ITEMS TABLE & TÌNH TRẠNG GIỮ CHỖ TỒN KHO
    const itemsTableHtml = `
      <div class="table-responsive">
        <table class="table-items">
          <thead>
            <tr>
              <th>Sản phẩm & Thông số</th>
              <th>Vị trí Kệ Kho</th>
              <th style="text-align: right;">Đơn giá</th>
              <th style="text-align: center;">Số lượng</th>
              <th>Trạng thái Tồn kho</th>
              <th style="text-align: right;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => {
              let stockPillHtml = "";
              if (order.status === "CANCELLED") {
                stockPillHtml = `<span class="stock-status-pill stock-released">Đã nhả tồn</span>`;
              } else if (order.status === "DISPATCHED" || order.status === "DELIVERED" || order.status === "CLOSED") {
                stockPillHtml = `<span class="stock-status-pill stock-deducted">Đã xuất vật lý</span>`;
              } else if (order.status === "APPROVED" || order.status === "PICKING") {
                stockPillHtml = `<span class="stock-status-pill stock-reserved">Đang giữ chỗ</span>`;
              } else {
                stockPillHtml = `<span class="stock-status-pill" style="background:#e2e8f0; color:#475569;">Chưa giữ chỗ</span>`;
              }

              const itemTotal = item.unitPrice * item.quantity;
              return `
                <tr>
                  <td>
                    <div class="prod-cell">
                      <div class="prod-info">
                        <h5>${item.name}</h5>
                        <div class="prod-sku">SKU: ${item.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="bin-tag">${item.binLocation}</span>
                  </td>
                  <td style="text-align: right; font-weight: 600;">${this.formatCurrency(item.unitPrice)}</td>
                  <td style="text-align: center; font-weight: 700; font-size: 0.9rem;">${item.quantity}</td>
                  <td>${stockPillHtml}</td>
                  <td style="text-align: right; font-weight: 700; color: var(--navy-900);">${this.formatCurrency(itemTotal)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    // FINANCIAL SUMMARY
    const financialHtml = `
      <div class="financial-box">
        <div class="summary-row">
          <span>Tổng tiền hàng (Chưa VAT):</span>
          <span>${this.formatCurrency(subtotal)}</span>
        </div>
        <div class="summary-row">
          <span>Thuế GTGT (VAT 10%):</span>
          <span>${this.formatCurrency(vat)}</span>
        </div>
        <div class="summary-row">
          <span>Phí vận chuyển bốc dỡ:</span>
          <span style="color: #059669; font-weight: 600;">Miễn phí (Ưu đãi B2B)</span>
        </div>
        <div class="summary-row total-row">
          <span>TỔNG CỘNG THANH TOÁN:</span>
          <span>${this.formatCurrency(total)}</span>
        </div>
      </div>
    `;

    // CUSTOMER & DISPATCH METADATA
    const customerHtml = `
      <div class="info-card-box">
        <div class="card-section-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
          Thông tin Khách hàng & Giao nhận
        </div>
        <div class="info-group">
          <div class="info-label">Tên Doanh Nghiệp / Tổ chức</div>
          <div class="info-val">${order.customer.name}</div>
        </div>
        <div class="info-group">
          <div class="info-label">Người nhận & Số điện thoại</div>
          <div class="info-val">📞 ${order.customer.contact} - ${order.customer.phone}</div>
        </div>
        <div class="info-group">
          <div class="info-label">Địa chỉ nhận hàng</div>
          <div class="info-val">📍 ${order.customer.address}</div>
        </div>
        <div class="info-group">
          <div class="info-label">Phương thức thanh toán</div>
          <div class="info-val">💳 ${order.paymentMethod}</div>
        </div>
        <div class="info-group">
          <div class="info-label">Ghi chú giao hàng</div>
          <div class="info-val" style="color: var(--text-muted); font-style: italic;">"${order.notes || "Không có ghi chú đặc biệt"}"</div>
        </div>
      </div>
    `;

    // TIMELINE AUDIT TRAIL
    const historyHtml = `
      <div class="history-timeline-section">
        <div class="card-section-title">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Nhật ký Kiểm toán Vòng đời & Tồn kho (Full Audit Trail)
        </div>
        <div class="timeline-list">
          ${order.history.map(item => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-content-box">
                <div class="timeline-meta">
                  <span class="timeline-actor">👤 ${item.actor}</span>
                  <span>🕒 ${item.time}</span>
                </div>
                <div class="timeline-action">${item.action}</div>
                <div class="timeline-detail">${item.detail}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    // ASSEMBLE ALL INTO DETAIL PANEL
    container.innerHTML = `
      <div class="detail-header-card">
        <div class="order-headline">
          <div class="order-headline-code">
            <h2>${order.code}</h2>
            <span class="badge-status ${statusMeta.badgeClass}">${statusMeta.label}</span>
          </div>
          <div class="order-meta-info">
            <span>Mã hệ thống: <strong>${order.id}</strong></span>
            <span>Khởi tạo lúc: <strong>${order.createdAt}</strong></span>
            <span>Nhân viên phụ trách: <strong>${order.salesRep.name}</strong></span>
          </div>
        </div>

        <div class="detail-actions-toolbar">
          ${actionButtonsHtml}
        </div>
      </div>

      ${stepperHtml}

      ${warehouseHtml}

      <div class="order-content-grid">
        <div>
          <div class="card-section-title">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
            Danh mục Sản phẩm & Trạng thái Giữ chỗ Kho
          </div>
          ${itemsTableHtml}
          ${financialHtml}
        </div>

        <div>
          ${customerHtml}
        </div>
      </div>

      ${historyHtml}
    `;
  }

  // Chuyển bước tiếp theo trong vòng đời
  handleAdvanceStep(orderId) {
    const res = this.stateMachine.advanceToNextStatus(orderId, `${this.currentRole.name} (${this.currentRole.title})`);
    if (res.success) {
      this.showToast("success", "Cập nhật vòng đời", res.message);
      this.renderKPIs();
      this.renderOrdersList();
      this.renderOrderDetail();
    } else {
      this.showToast("error", "Không thể chuyển trạng thái", res.message);
    }
  }

  // Hiển thị thông báo khi đơn đã xuất kho mà cố bấm huỷ (Enforcing business rule 3)
  showLockedCancelNotice(orderCode) {
    alert(
      `[QUY TẮC NGHIỆP VỤ KHO BÃI]\n` +
      `Đơn hàng ${orderCode} ĐÃ XUẤT KHO và bàn giao đơn vị vận chuyển!\n\n` +
      `Theo quy định của đề bài và vận hành kho:\n` +
      `- Đơn đã xuất kho thì KHÔNG HUỶ ĐƯỢC.\n` +
      `- Bắt buộc phải đi đường TRẢ HÀNG (RMA) để điều phối thu hồi hàng và kiểm tra trước khi hoàn kho.\n\n` +
      `Vui lòng bấm nút "Khởi tạo Phiếu Trả Hàng (RMA)" bên cạnh.`
    );
  }

  // Mở modal huỷ đơn
  openCancelOrderModal(orderId) {
    const order = this.stateMachine.getOrderById(orderId);
    if (!order) return;

    const modal = document.getElementById("cancelOrderModal");
    if (!modal) return;

    document.getElementById("cancelModalOrderCode").innerText = order.code;
    document.getElementById("cancelOrderIdInput").value = order.id;

    const itemsSummaryBox = document.getElementById("cancelModalReservedNotice");
    if (order.status === "APPROVED" || order.status === "PICKING") {
      itemsSummaryBox.style.display = "block";
      itemsSummaryBox.innerHTML = `
        <strong>Tự động nhả tồn đang giữ chỗ:</strong> Đơn này đang giữ chỗ ${order.items.reduce((s, i) => s + i.quantity, 0)} sản phẩm. 
        Khi huỷ, hệ thống sẽ tự động hoàn trả số lượng này về tồn kho khả dụng để các Sales khác có thể bán ngay!
      `;
    } else {
      itemsSummaryBox.style.display = "none";
    }

    document.getElementById("cancelReasonCategory").value = "";
    document.getElementById("cancelDetailedReason").value = "";
    document.getElementById("cancelCommitCheckbox").checked = false;

    modal.classList.add("open");
  }

  // Xác nhận huỷ đơn
  handleConfirmCancelOrder() {
    const orderId = document.getElementById("cancelOrderIdInput").value;
    const category = document.getElementById("cancelReasonCategory").value;
    const detail = document.getElementById("cancelDetailedReason").value;
    const committed = document.getElementById("cancelCommitCheckbox").checked;

    if (!category) {
      alert("Vui lòng chọn danh mục lý do huỷ đơn hàng.");
      return;
    }
    if (!detail || detail.trim().length < 8) {
      alert("Lý do chi tiết bắt buộc nhập và phải từ 8 ký tự trở lên để đảm bảo quy trình kiểm toán.");
      return;
    }
    if (!committed) {
      alert("Vui lòng tích xác nhận cam kết nhả tồn kho.");
      return;
    }

    const res = this.stateMachine.cancelOrder(orderId, {
      reasonCategory: category,
      detailedReason: detail,
      actor: `${this.currentRole.name} (${this.currentRole.title})`
    });

    if (res.success) {
      document.getElementById("cancelOrderModal").classList.remove("open");
      this.showToast("success", "Huỷ đơn thành công", res.message);
      this.renderKPIs();
      this.renderOrdersList();
      this.renderOrderDetail();
    } else {
      this.showToast("error", "Lỗi huỷ đơn", res.message);
    }
  }

  // Mở modal trả hàng (RMA)
  openReturnOrderModal(orderId) {
    const order = this.stateMachine.getOrderById(orderId);
    if (!order) return;

    const modal = document.getElementById("returnOrderModal");
    if (!modal) return;

    document.getElementById("returnModalOrderCode").innerText = order.code;
    document.getElementById("returnOrderIdInput").value = order.id;
    document.getElementById("returnReasonCategory").value = "";
    document.getElementById("returnDetailedReason").value = "";

    modal.classList.add("open");
  }

  // Xác nhận trả hàng (RMA)
  handleConfirmReturnOrder() {
    const orderId = document.getElementById("returnOrderIdInput").value;
    const category = document.getElementById("returnReasonCategory").value;
    const detail = document.getElementById("returnDetailedReason").value;
    const condition = document.getElementById("returnCondition").value;

    if (!category) {
      alert("Vui lòng chọn lý do trả hàng.");
      return;
    }
    if (!detail || detail.trim().length < 8) {
      alert("Vui lòng nhập chi tiết lý do trả hàng (tối thiểu 8 ký tự).");
      return;
    }

    const res = this.stateMachine.initiateReturnOrder(orderId, {
      reasonCategory: category,
      detailedReason: detail,
      returnCondition: condition,
      actor: `${this.currentRole.name} (${this.currentRole.title})`
    });

    if (res.success) {
      document.getElementById("returnOrderModal").classList.remove("open");
      this.showToast("warning", "Khởi tạo Trả Hàng (RMA)", res.message);
      this.renderKPIs();
      this.renderOrdersList();
      this.renderOrderDetail();
    } else {
      this.showToast("error", "Lỗi tạo phiếu trả hàng", res.message);
    }
  }

  // Thủ kho xác nhận nhập kho trả hàng
  handleCompleteRestock(orderId) {
    const res = this.stateMachine.completeReturnRestock(orderId, `${this.currentRole.name} (${this.currentRole.title})`);
    if (res.success) {
      this.showToast("success", "Hoàn nhập kho thành công", res.message);
      this.renderKPIs();
      this.renderOrdersList();
      this.renderOrderDetail();
    } else {
      this.showToast("error", "Lỗi hoàn nhập", res.message);
    }
  }

  // Mở modal quản lý tồn kho & audit log
  openInventoryModal() {
    const modal = document.getElementById("inventoryModal");
    if (!modal) return;

    const products = this.inventory.getAllProducts();
    const logs = this.inventory.getAllLogs();

    const tbody = document.getElementById("inventoryTableBody");
    tbody.innerHTML = products.map(p => `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700;">${p.sku}</td>
        <td style="font-weight: 600;">${p.name}</td>
        <td><span class="bin-tag">${p.binLocation}</span></td>
        <td style="text-align: right; font-weight: 700;">${p.physicalStock} ${p.unit}</td>
        <td style="text-align: right; font-weight: 700; color: #d97706;">${p.reservedStock} ${p.unit}</td>
        <td style="text-align: right; font-weight: 800; color: #059669; font-size: 0.95rem;">${p.availableStock} ${p.unit}</td>
      </tr>
    `).join("");

    const logsTbody = document.getElementById("inventoryLogsBody");
    logsTbody.innerHTML = logs.map(l => {
      let typeBadge = "";
      if (l.type === "RESERVE") {
        typeBadge = `<span style="background: #dbeafe; color: #1e40af; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem;">GIỮ CHỖ (+${l.quantityDelta})</span>`;
      } else if (l.type === "RELEASE_CANCEL") {
        typeBadge = `<span style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem;">NHẢ TỒN (${l.quantityDelta})</span>`;
      } else if (l.type === "DISPATCH_DEDUCT") {
        typeBadge = `<span style="background: #cffafe; color: #0e7490; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem;">XUẤT KHO (${l.quantityDelta})</span>`;
      } else {
        typeBadge = `<span style="background: #fef3c7; color: #b45309; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem;">TRẢ HÀNG (+${l.quantityDelta})</span>`;
      }

      return `
        <tr>
          <td style="font-size: 0.72rem; color: var(--text-muted);">${l.timestamp}</td>
          <td style="font-family: var(--font-mono); font-weight: 700;">${l.sku}</td>
          <td>${typeBadge}</td>
          <td style="font-size: 0.75rem;">👤 ${l.operator}</td>
          <td style="font-size: 0.75rem;">${l.note}</td>
        </tr>
      `;
    }).join("");

    modal.classList.add("open");
  }

  // Mở modal tạo đơn mới
  openNewOrderModal() {
    const modal = document.getElementById("newOrderModal");
    if (!modal) return;

    const products = this.inventory.getAllProducts();
    const select = document.getElementById("newOrderProductSelect");
    select.innerHTML = products.map(p => `
      <option value="${p.id}" data-sku="${p.sku}" data-price="${p.price}" data-name="${p.name}" data-bin="${p.binLocation}">
        ${p.name} - [Khả dụng: ${p.availableStock} ${p.unit}] - ${this.formatCurrency(p.price)}
      </option>
    `).join("");

    modal.classList.add("open");
  }

  // Xác nhận tạo đơn mới
  handleConfirmCreateOrder() {
    const custName = document.getElementById("newCustName").value.trim();
    const custContact = document.getElementById("newCustContact").value.trim();
    const custPhone = document.getElementById("newCustPhone").value.trim();
    const custAddress = document.getElementById("newCustAddress").value.trim();
    const prodSelect = document.getElementById("newOrderProductSelect");
    const qty = parseInt(document.getElementById("newOrderQuantity").value, 10);
    const notes = document.getElementById("newOrderNotes").value.trim();

    if (!custName || !custPhone || !custAddress) {
      alert("Vui lòng điền đầy đủ tên khách hàng, số điện thoại và địa chỉ nhận hàng.");
      return;
    }
    if (isNaN(qty) || qty < 1) {
      alert("Số lượng sản phẩm không hợp lệ.");
      return;
    }

    const selectedOption = prodSelect.options[prodSelect.selectedIndex];
    const prodId = selectedOption.value;
    const prodSku = selectedOption.getAttribute("data-sku");
    const prodName = selectedOption.getAttribute("data-name");
    const prodPrice = parseFloat(selectedOption.getAttribute("data-price"));
    const binLocation = selectedOption.getAttribute("data-bin");

    const newOrderData = {
      customer: {
        name: custName,
        contact: custContact || custName,
        phone: custPhone,
        address: custAddress,
        email: "khachhang@doanhnghiep.vn"
      },
      items: [
        {
          productId: prodId,
          sku: prodSku,
          name: prodName,
          unitPrice: prodPrice,
          quantity: qty,
          reserved: false,
          binLocation: binLocation
        }
      ],
      paymentMethod: "Chuyển khoản thanh toán",
      notes: notes
    };

    const res = this.stateMachine.createOrder(newOrderData);
    if (res.success) {
      document.getElementById("newOrderModal").classList.remove("open");
      this.selectedOrderId = res.order.id;
      this.showToast("success", "Tạo đơn thành công", `Đơn hàng ${res.order.code} đã được tạo ở trạng thái Nháp!`);
      this.renderKPIs();
      this.renderOrdersList();
      this.renderOrderDetail();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new NexusApp();
});
