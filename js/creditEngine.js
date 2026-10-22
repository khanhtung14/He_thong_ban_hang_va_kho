/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Credit Risk Gatekeeper & Policy Engine (Hệ Thống Kiểm Soát & Thẩm Định Tín Dụng)
 * Ticket: SCRUM-86 / SCRUM-9
 * 
 * CORE ACCEPTANCE CRITERIA IMPLEMENTATION:
 * 1. Hiển thị công nợ hiện tại, hạn mức và phần còn lại ngay trên màn hình tạo đơn.
 * 2. Tổng đơn + công nợ hiện tại vượt hạn mức -> Đơn bị đánh dấu CẦN DUYỆT (PENDING_APPROVAL).
 * 3. Đại lý có khoản quá hạn quá số ngày cho phép -> CHẶN TẠO ĐƠN HOÀN TOÀN (HARD BLOCK).
 */

export class CreditRiskEngine {
  /**
   * Định dạng tiền tệ VNĐ chuẩn ngân hàng
   * @param {number} amount 
   * @returns {string} ví dụ: "150.000.000 ₫"
   */
  static formatVND(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return '0 ₫';
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(amount);
  }

  /**
   * Định dạng số thập phân ngắn gọn (ví dụ: 120.5 triệu hoặc 1.2 tỷ)
   */
  static formatShortVND(amount) {
    if (!amount) return '0 ₫';
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_000_000_000) {
      return `${sign}${(abs / 1_000_000_000).toFixed(2)} tỷ ₫`;
    }
    if (abs >= 1_000_000) {
      return `${sign}${(abs / 1_000_000).toFixed(1)} triệu ₫`;
    }
    return CreditRiskEngine.formatVND(amount);
  }

  /**
   * Tính toán thẩm định công nợ đa tầng thời gian thực
   * @param {Object} dealer Thông tin đại lý được chọn
   * @param {number} orderTotalAmount Tổng tiền đơn hàng hiện tại (bao gồm VAT)
   * @param {number} customMaxOverdueDays Tuỳ biến số ngày quá hạn cho phép từ cấu hình (tuỳ chọn)
   */
  static evaluateCreditGatekeeper(dealer, orderTotalAmount = 0, customMaxOverdueDays = null) {
    if (!dealer) {
      return {
        hasDealer: false,
        canSubmit: false,
        decision: 'NO_DEALER',
        statusLabel: 'Chưa chọn đại lý',
        alertLevel: 'INFO'
      };
    }

    const creditLimit = Number(dealer.creditLimit || 0);
    const currentDebt = Number(dealer.currentDebt || 0);
    const orderTotal = Math.max(0, Number(orderTotalAmount || 0));
    const maxOverdueDaysAllowed = customMaxOverdueDays !== null 
      ? Number(customMaxOverdueDays) 
      : Number(dealer.maxOverdueDaysAllowed ?? 30);

    // 1. Chỉ số hiện tại của đại lý trước khi lên đơn
    const remainingCredit = Math.max(0, creditLimit - currentDebt);
    const currentUtilizationPct = creditLimit > 0 
      ? Math.min(100, Math.round((currentDebt / creditLimit) * 100)) 
      : 100;

    // 2. Chỉ số dự kiến sau khi cộng đơn hàng này
    const projectedTotalDebt = currentDebt + orderTotal;
    const projectedRemaining = creditLimit - projectedTotalDebt;
    const isExceededLimit = projectedTotalDebt > creditLimit;
    const exceededAmount = isExceededLimit ? (projectedTotalDebt - creditLimit) : 0;
    const projectedUtilizationPct = creditLimit > 0 
      ? Math.round((projectedTotalDebt / creditLimit) * 100) 
      : 100;

    // 3. Phân tích nợ quá hạn (Aging Invoices Analysis)
    const unpaidInvoices = Array.isArray(dealer.unpaidInvoices) ? dealer.unpaidInvoices : [];
    
    // Tìm các hoá đơn vi phạm: có số ngày quá hạn > maxOverdueDaysAllowed
    const violatingInvoices = unpaidInvoices.filter(inv => {
      const overdue = Number(inv.overdueDays || 0);
      return overdue > maxOverdueDaysAllowed;
    });

    const maxOverdueDays = unpaidInvoices.length > 0 
      ? Math.max(0, ...unpaidInvoices.map(i => Number(i.overdueDays || 0))) 
      : 0;

    const totalOverdueAmount = unpaidInvoices
      .filter(inv => (inv.overdueDays || 0) > 0)
      .reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);

    const violatingOverdueAmount = violatingInvoices
      .reduce((sum, inv) => sum + (inv.remainingAmount || 0), 0);

    // TIÊU CHÍ 3: Có khoản quá hạn quá số ngày cho phép -> CHẶN TẠO ĐƠN HOÀN TOÀN
    const isOverdueBlocked = violatingInvoices.length > 0;

    // 4. Quyết định của Cổng Kiểm Soát Rủi Ro (Gatekeeper Engine)
    let decision = 'APPROVED';
    let alertLevel = 'SUCCESS';
    let canSubmit = true;
    let orderTargetStatus = 'APPROVED';
    let statusBadgeText = 'Đủ điều kiện duyệt ngay';
    let statusDescription = 'Đơn hàng nằm trong hạn mức tín dụng và không có nợ quá hạn vi phạm.';
    let actionButtonText = 'Tạo & Duyệt Đơn Ngay';
    let actionButtonIcon = 'check-circle';
    let requireApprovalModal = false;

    if (isOverdueBlocked) {
      // ƯU TIÊN CAO NHẤT: KHÓA CỨNG
      decision = 'HARD_BLOCKED';
      alertLevel = 'CRITICAL';
      canSubmit = false;
      orderTargetStatus = null;
      statusBadgeText = 'BỊ CHẶN HOÀN TOÀN (Nợ Quá Hạn)';
      statusDescription = `Đại lý có ${violatingInvoices.length} khoản nợ quá hạn lên đến ${maxOverdueDays} ngày (vượt mốc cho phép ${maxOverdueDaysAllowed} ngày). Hệ thống khóa quyền tạo đơn hàng.`;
      actionButtonText = '🚫 Bị Khóa Tạo Đơn';
      actionButtonIcon = 'lock';
      requireApprovalModal = false;
    } else if (isExceededLimit && orderTotal > 0) {
      // TIÊU CHÍ 2: VƯỢT HẠN MỨC -> ĐÁNH DẤU CẦN DUYỆT
      decision = 'PENDING_APPROVAL';
      alertLevel = 'WARNING';
      canSubmit = true; // Vẫn cho bấm gửi để đi vào quy trình Duyệt ngoại lệ
      orderTargetStatus = 'PENDING_APPROVAL';
      statusBadgeText = 'VƯỢT HẠN MỨC (Cần Phê Duyệt)';
      statusDescription = `Tổng nợ dự kiến (${CreditRiskEngine.formatShortVND(projectedTotalDebt)}) vượt hạn mức ${CreditRiskEngine.formatShortVND(creditLimit)} một khoản ${CreditRiskEngine.formatShortVND(exceededAmount)}. Đơn hàng sẽ được chuyển sang trạng thái CẦN DUYỆT.`;
      actionButtonText = '📋 Gửi Yêu Cầu Duyệt Vượt Hạn Mức';
      actionButtonIcon = 'alert-triangle';
      requireApprovalModal = true;
    } else if (currentUtilizationPct >= 90) {
      // Cảnh báo tiệm cận trần hạn mức (85% - 100%)
      alertLevel = 'CAUTION';
      statusBadgeText = 'Cận Hạn Mức (Khả dụng thấp)';
      statusDescription = `Hạn mức khả dụng còn lại chỉ còn ${CreditRiskEngine.formatShortVND(remainingCredit)}. Cần kiểm tra kỹ trước khi xuất thêm hàng.`;
    }

    return {
      hasDealer: true,
      dealerId: dealer.id,
      dealerCode: dealer.code,
      dealerName: dealer.name,
      creditLimit,
      currentDebt,
      remainingCredit,
      currentUtilizationPct,
      // Khi thêm đơn:
      orderTotal,
      projectedTotalDebt,
      projectedRemaining,
      projectedUtilizationPct,
      isExceededLimit,
      exceededAmount,
      // Nợ quá hạn:
      maxOverdueDaysAllowed,
      maxOverdueDays,
      unpaidInvoices,
      violatingInvoices,
      totalOverdueAmount,
      violatingOverdueAmount,
      isOverdueBlocked,
      // Quyết định:
      decision, // 'APPROVED' | 'PENDING_APPROVAL' | 'HARD_BLOCKED'
      alertLevel, // 'SUCCESS' | 'CAUTION' | 'WARNING' | 'CRITICAL'
      canSubmit,
      orderTargetStatus,
      statusBadgeText,
      statusDescription,
      actionButtonText,
      actionButtonIcon,
      requireApprovalModal
    };
  }
}
