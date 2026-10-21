/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Application State Store (Quản lý trạng thái tập trung)
 * Ticket: SCRUM-86 / SCRUM-9
 */

import { SYSTEM_CONFIG, INITIAL_DEALERS, INITIAL_PRODUCTS, INITIAL_ORDERS } from './mockData.js';
import { CreditRiskEngine } from './creditEngine.js';

class StateStore {
  constructor() {
    this.config = { ...SYSTEM_CONFIG };
    this.dealers = JSON.parse(JSON.stringify(INITIAL_DEALERS));
    this.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    this.orders = JSON.parse(JSON.stringify(INITIAL_ORDERS));
    
    // Khởi tạo đại lý mặc định: DL-001
    this.currentDealerId = 'DL-001';
    
    // Giỏ hàng màn hình tạo đơn
    this.cart = []; // [{ productId, sku, name, price, quantity, subtotal, unit }]
    
    // Ghi chú đơn hàng & thông tin bổ sung
    this.orderMeta = {
      notes: '',
      deliveryAddress: '',
      paymentMethod: 'DEBT_ACCOUNTING', // Ghi nhận công nợ
      priority: 'STANDARD'
    };

    // Subscriptions
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error('[Store] Error in listener callback:', err);
      }
    }
  }

  getState() {
    const currentDealer = this.getCurrentDealer();
    const cartTotals = this.getCartTotals();
    const creditEvaluation = CreditRiskEngine.evaluateCreditGatekeeper(
      currentDealer,
      cartTotals.grandTotal,
      this.config.defaultMaxOverdueDays
    );

    return {
      config: this.config,
      dealers: this.dealers,
      products: this.products,
      orders: this.orders,
      currentDealer,
      cart: this.cart,
      cartTotals,
      creditEvaluation,
      orderMeta: this.orderMeta
    };
  }

  getCurrentDealer() {
    return this.dealers.find(d => d.id === this.currentDealerId) || this.dealers[0];
  }

  // Set Dealer
  setDealer(dealerId) {
    if (this.currentDealerId !== dealerId) {
      this.currentDealerId = dealerId;
      this.notify();
    }
  }

  // Chọn nhanh kịch bản kiểm thử (Preset Scenario cho Giảng viên)
  applyPresetScenario(scenarioKey) {
    const dealer = this.dealers.find(d => d.presetScenario === scenarioKey);
    if (!dealer) return;

    this.currentDealerId = dealer.id;
    this.cart = []; // Reset giỏ hàng trước

    // Tự động thêm giỏ hàng phù hợp để Giảng viên test ngay:
    if (scenarioKey === 'NORMAL_SAFE') {
      // Thêm 1 Server 115M (Tổng 126.5M VAT -> Nợ lên 266.5M / 600M -> Vẫn An toàn)
      this.addToCart('PRD-001', 1);
    } else if (scenarioKey === 'OVER_LIMIT') {
      // Đang nợ 350M / 400M (còn 50M). Thêm 1 Macbook 89M -> Tổng vượt 400M -> Test ngay Vượt Hạn Mức
      this.addToCart('PRD-002', 1);
    } else if (scenarioKey === 'OVERDUE_BLOCKED') {
      // Đang có nợ quá hạn 56 ngày vi phạm -> Thêm sản phẩm để thấy NÚT TẠO ĐƠN BỊ KHÓA CỨNG
      this.addToCart('PRD-003', 2);
    } else if (scenarioKey === 'BORDERLINE') {
      // Đang nợ 494M / 500M (còn đúng 6M). Thêm 1 SSD 14.2M -> Lập tức kích hoạt Cần duyệt
      this.addToCart('PRD-007', 1);
    }

    this.notify();
  }

  // Cart operations
  addToCart(productId, quantity = 1) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const existingIndex = this.cart.findIndex(item => item.productId === productId);
    if (existingIndex > -1) {
      this.cart[existingIndex].quantity += quantity;
      this.cart[existingIndex].subtotal = this.cart[existingIndex].quantity * this.cart[existingIndex].price;
    } else {
      this.cart.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        unit: product.unit,
        quantity: quantity,
        subtotal: quantity * product.price,
        image: product.image
      });
    }
    this.notify();
  }

  updateCartItemQuantity(productId, quantity) {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      this.removeFromCart(productId);
      return;
    }

    const item = this.cart.find(i => i.productId === productId);
    if (item) {
      item.quantity = qty;
      item.subtotal = item.quantity * item.price;
      this.notify();
    }
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.productId !== productId);
    this.notify();
  }

  clearCart() {
    this.cart = [];
    this.notify();
  }

  getCartTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + item.subtotal, 0);
    const vatRate = this.config.vatRate;
    const vatAmount = Math.round(subtotal * vatRate);
    const grandTotal = subtotal + vatAmount;
    const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal,
      vatRate,
      vatAmount,
      grandTotal,
      totalItems
    };
  }

  // Tạo đơn hàng (Submit Order)
  submitOrder(approvalPayload = null) {
    const dealer = this.getCurrentDealer();
    const cartTotals = this.getCartTotals();
    
    if (this.cart.length === 0) {
      throw new Error('Giỏ hàng trống! Vui lòng chọn ít nhất một sản phẩm.');
    }

    // Đánh giá công nợ tại thời điểm chốt đơn
    const evalResult = CreditRiskEngine.evaluateCreditGatekeeper(
      dealer, 
      cartTotals.grandTotal, 
      this.config.defaultMaxOverdueDays
    );

    // KIỂM TRA ĐIỀU KIỆN 3: BỊ CHẶN HOÀN TOÀN DO NỢ QUÁ HẠN
    if (evalResult.isOverdueBlocked) {
      throw new Error(
        `[CHẶN TẠO ĐƠN HOÀN TOÀN] Đại lý ${dealer.name} có khoản nợ quá hạn (${evalResult.maxOverdueDays} ngày) vượt mức cho phép (${evalResult.maxOverdueDaysAllowed} ngày). Không thể tạo đơn dưới bất kỳ hình thức nào!`
      );
    }

    // KIỂM TRA ĐIỀU KIỆN 2: VƯỢT HẠN MỨC -> ĐÁNH DẤU CẦN DUYỆT
    let finalStatus = 'APPROVED';
    let statusLabel = 'Đã xác nhận (Approved)';
    let approvalReason = 'Đơn hàng trong hạn mức tín dụng - Hệ thống tự động duyệt.';
    let creditCheckStatus = 'PASSED';
    let creditCheckSummary = `Trong hạn mức (Tổng nợ sau đơn: ${CreditRiskEngine.formatShortVND(evalResult.projectedTotalDebt)} / ${CreditRiskEngine.formatShortVND(dealer.creditLimit)})`;

    if (evalResult.isExceededLimit) {
      finalStatus = 'PENDING_APPROVAL';
      statusLabel = 'Chờ duyệt công nợ (Pending Approval)';
      creditCheckStatus = 'EXCEEDED_LIMIT';
      creditCheckSummary = `Vượt hạn mức tín dụng +${CreditRiskEngine.formatVND(evalResult.exceededAmount)} (Tổng nợ dự kiến ${CreditRiskEngine.formatShortVND(evalResult.projectedTotalDebt)} / ${CreditRiskEngine.formatShortVND(dealer.creditLimit)})`;
      
      approvalReason = approvalPayload?.reason || 'Đơn vượt hạn mức tín dụng. Yêu cầu xem xét phê duyệt ngoại lệ.';
    }

    const orderId = `ORD-${Date.now().toString().slice(-4)}`;
    const orderNo = `NEX-ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder = {
      id: orderId,
      orderNo: orderNo,
      dealerId: dealer.id,
      dealerName: dealer.name,
      salesRep: dealer.salesRep,
      createdAt: new Date().toLocaleString('vi-VN'),
      totalBeforeVat: cartTotals.subtotal,
      vatAmount: cartTotals.vatAmount,
      totalAmount: cartTotals.grandTotal,
      status: finalStatus,
      statusLabel: statusLabel,
      creditCheckStatus: creditCheckStatus,
      creditCheckSummary: creditCheckSummary,
      approvalReason: approvalReason,
      approvalRequestedAt: finalStatus === 'PENDING_APPROVAL' ? new Date().toLocaleString('vi-VN') : null,
      requestedBy: dealer.salesRep,
      approver: finalStatus === 'PENDING_APPROVAL' ? (approvalPayload?.approver || 'Kế toán trưởng & GĐ Tài chính') : 'Hệ thống tự động',
      paymentCommitmentDate: approvalPayload?.commitmentDate || null,
      collateralInfo: approvalPayload?.collateral || null,
      items: JSON.parse(JSON.stringify(this.cart))
    };

    // Lưu đơn hàng vào danh sách (đưa lên đầu)
    this.orders.unshift(newOrder);

    // Nếu đơn được duyệt ngay (trong hạn mức) -> Tăng công nợ hiện tại của đại lý
    if (finalStatus === 'APPROVED') {
      dealer.currentDebt += cartTotals.grandTotal;
    }

    // Reset giỏ hàng
    this.cart = [];
    this.notify();

    return newOrder;
  }

  // Thao tác Kế toán phê duyệt đơn
  approveOrder(orderId, approverNote = '') {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    const dealer = this.dealers.find(d => d.id === order.dealerId);
    order.status = 'APPROVED';
    order.statusLabel = 'Đã phê duyệt (Approved)';
    order.approvedAt = new Date().toLocaleString('vi-VN');
    order.approverNote = approverNote || 'Kế toán trưởng đã thẩm định bảo lãnh và phê duyệt đơn hàng.';

    // Cập nhật công nợ cho đại lý
    if (dealer) {
      dealer.currentDebt += order.totalAmount;
    }

    this.notify();
  }

  // Thao tác Kế toán từ chối đơn
  rejectOrder(orderId, rejectReason = '') {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;

    order.status = 'REJECTED';
    order.statusLabel = 'Đã từ chối (Rejected)';
    order.rejectedAt = new Date().toLocaleString('vi-VN');
    order.rejectReason = rejectReason || 'Từ chối do rủi ro công nợ cao và không có bảo lãnh hợp lệ.';

    this.notify();
  }

  // Giảng viên thanh toán hoá đơn nợ quá hạn để mở khóa đại lý (Interactive Testing Tool)
  settleOverdueInvoice(dealerId, invoiceNo) {
    const dealer = this.dealers.find(d => d.id === dealerId);
    if (!dealer || !dealer.unpaidInvoices) return;

    const invoice = dealer.unpaidInvoices.find(inv => inv.invoiceNo === invoiceNo);
    if (invoice) {
      dealer.currentDebt = Math.max(0, dealer.currentDebt - invoice.remainingAmount);
      dealer.unpaidInvoices = dealer.unpaidInvoices.filter(inv => inv.invoiceNo !== invoiceNo);
      
      // Kiểm tra lại xem còn nợ quá hạn không
      const remainingViolations = dealer.unpaidInvoices.filter(
        inv => (inv.overdueDays || 0) > this.config.defaultMaxOverdueDays
      );
      if (remainingViolations.length === 0) {
        dealer.status = 'ACTIVE';
        dealer.riskLevel = 'MEDIUM';
      }
      this.notify();
    }
  }

  // Cập nhật cấu hình chính sách (Cho Giảng viên thử nghiệm điều chỉnh số ngày quá hạn)
  updateMaxOverdueDays(days) {
    this.config.defaultMaxOverdueDays = Number(days);
    this.notify();
  }
}

export const store = new StateStore();
