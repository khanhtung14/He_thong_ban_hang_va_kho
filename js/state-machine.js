/**
 * ORDER LIFECYCLE & FINITE STATE MACHINE (FSM) ENGINE
 * Định nghĩa chuyển trạng thái, các ràng buộc nghiệp vụ (Guards),
 * Quy tắc huỷ đơn & Nhánh Trả hàng (RMA)
 */

class OrderStateMachine {
  constructor(inventoryService) {
    this.inventoryService = inventoryService;
    this.STORAGE_KEY_ORDERS = "scrum13_orders";
    this.init();
  }

  init() {
    const savedOrders = localStorage.getItem(this.STORAGE_KEY_ORDERS);
    if (!savedOrders) {
      this.orders = JSON.parse(JSON.stringify(INITIAL_ORDERS));
      this.persistOrders();
    } else {
      this.orders = JSON.parse(savedOrders);
    }
  }

  persistOrders() {
    localStorage.setItem(this.STORAGE_KEY_ORDERS, JSON.stringify(this.orders));
  }

  getAllOrders() {
    return [...this.orders].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }

  getOrderById(orderId) {
    return this.orders.find(o => o.id === orderId);
  }

  /**
   * KIỂM TRA ĐIỀU KIỆN HUỶ ĐƠN HÀNG (Guard Check)
   * Theo đề bài:
   * - Huỷ bắt buộc nhập lý do và tự động nhả tồn đang giữ chỗ
   * - Đơn đã xuất kho thì không huỷ được, phải đi đường trả hàng
   */
  canCancelOrder(order) {
    if (!order) return { allowed: false, code: "NOT_FOUND", message: "Không tìm thấy đơn hàng." };

    if (order.status === "CANCELLED") {
      return { allowed: false, code: "ALREADY_CANCELLED", message: "Đơn hàng này đã bị huỷ trước đó." };
    }

    if (order.status === "CLOSED") {
      return { allowed: false, code: "ALREADY_CLOSED", message: "Đơn hàng đã đóng sổ kế toán hoàn tất, không thể huỷ." };
    }

    // RÀNG BUỘC SỐNG CÒN CỦA ĐỀ BÀI: Đơn đã xuất kho thì không huỷ được, phải đi đường trả hàng!
    if (order.status === "DISPATCHED" || order.status === "DELIVERED") {
      return {
        allowed: false,
        code: "DISPATCHED_LOCKED",
        message: "Đơn hàng đã xuất kho (đã bàn giao vận chuyển). Theo quy định vận hành kho, không thể huỷ trực tiếp mà bắt buộc phải chuyển sang quy trình Trả Hàng (RMA)!",
        suggestReturn: true
      };
    }

    if (order.status === "RETURN_PROCESSING") {
      return { allowed: false, code: "IN_RETURN", message: "Đơn đang trong tiến trình xử lý trả hàng hoàn kho." };
    }

    // Các trạng thái được phép huỷ: DRAFT, PENDING_APPROVAL, APPROVED, PICKING
    return {
      allowed: true,
      hasReservation: order.status === "APPROVED" || order.status === "PICKING",
      message: "Đơn hợp lệ để huỷ."
    };
  }

  /**
   * THỰC HIỆN HUỶ ĐƠN HÀNG
   * Validation bắt buộc lý do & tự động nhả tồn kho giữ chỗ
   */
  cancelOrder(orderId, { reasonCategory, detailedReason, actor = "Trần Minh Quân (Sales)" }) {
    const order = this.getOrderById(orderId);
    const guard = this.canCancelOrder(order);

    if (!guard.allowed) {
      return { success: false, code: guard.code, message: guard.message };
    }

    // Validate lý do bắt buộc (tối thiểu 10 ký tự)
    if (!reasonCategory || reasonCategory.trim() === "") {
      return { success: false, code: "MISSING_REASON_CATEGORY", message: "Vui lòng chọn danh mục lý do huỷ đơn hàng." };
    }
    if (!detailedReason || detailedReason.trim().length < 8) {
      return {
        success: false,
        code: "INVALID_DETAILED_REASON",
        message: "Lý do chi tiết bắt buộc nhập và phải từ 8 ký tự trở lên để phục vụ báo cáo quản trị."
      };
    }

    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });
    const prevStatus = order.status;

    // 1. Tự động giải phóng tồn kho nếu trước đó đã giữ chỗ
    let releaseResult = null;
    if (prevStatus === "APPROVED" || prevStatus === "PICKING") {
      releaseResult = this.inventoryService.releaseStockOnCancel(order, {
        category: reasonCategory,
        detailedReason: detailedReason
      }, actor);
    }

    // 2. Cập nhật dữ liệu huỷ đơn
    order.status = "CANCELLED";
    order.updatedAt = timestamp;
    order.cancellation = {
      cancelledAt: timestamp,
      cancelledBy: actor,
      reasonCategory: reasonCategory,
      detailedReason: detailedReason.trim(),
      inventoryReleased: releaseResult ? releaseResult.success : false,
      releasedQuantities: releaseResult ? releaseResult.releasedList : []
    };

    // 3. Ghi nhận lịch sử vòng đời đơn hàng
    order.history.unshift({
      time: timestamp,
      actor: actor,
      action: "Huỷ đơn hàng & Giải phóng tồn kho",
      detail: `Lý do: [${reasonCategory}] - ${detailedReason.trim()}. ${
        releaseResult && releaseResult.releasedList.length > 0
          ? `Hệ thống tự động nhả tồn ${releaseResult.releasedList.map(r => `${r.name} (x${r.qty})`).join(", ")} về kho khả dụng.`
          : "Đơn chưa giữ chỗ nên không phát sinh nhả tồn."
      }`
    });

    this.persistOrders();

    return {
      success: true,
      order: order,
      releaseResult: releaseResult,
      message: `Đơn hàng ${order.code} đã được huỷ thành công. Đã tự động giải phóng tồn kho giữ chỗ!`
    };
  }

  /**
   * KHỞI TẠO QUY TRÌNH TRẢ HÀNG (RMA - Return Merchandise Authorization)
   * Nghiệp vụ bắt buộc cho đơn đã xuất kho
   */
  initiateReturnOrder(orderId, { reasonCategory, detailedReason, returnCondition, actor = "Trần Minh Quân (Sales)" }) {
    const order = this.getOrderById(orderId);
    if (!order) return { success: false, message: "Không tìm thấy đơn hàng." };

    if (order.status !== "DISPATCHED" && order.status !== "DELIVERED") {
      return { success: false, message: "Chỉ đơn hàng đã xuất kho hoặc đã giao mới có thể lập phiếu Trả hàng (RMA)." };
    }

    if (!reasonCategory || !detailedReason || detailedReason.trim().length < 8) {
      return { success: false, message: "Vui lòng chọn lý do và nhập chi tiết lý do trả hàng (tối thiểu 8 ký tự)." };
    }

    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });
    const rmaCode = "RMA-" + Date.now().toString().slice(-6);

    order.status = "RETURN_PROCESSING";
    order.updatedAt = timestamp;
    order.returnOrder = {
      rmaCode: rmaCode,
      createdAt: timestamp,
      createdBy: actor,
      reasonCategory: reasonCategory,
      detailedReason: detailedReason.trim(),
      condition: returnCondition || "Nguyên đai nguyên kiện / Chưa mở seal",
      status: "AWAITING_RECEIVING", // Chờ kho nhận và kiểm tra
      restocked: false
    };

    order.history.unshift({
      time: timestamp,
      actor: actor,
      action: `Khởi tạo yêu cầu trả hàng (${rmaCode})`,
      detail: `Lý do: [${reasonCategory}] - ${detailedReason.trim()}. Đang điều phối thu hồi hàng về kho Thủ Đức.`
    });

    this.persistOrders();

    return {
      success: true,
      order: order,
      rmaCode: rmaCode,
      message: `Đã khởi tạo phiếu Trả hàng ${rmaCode} thành công cho đơn ${order.code}!`
    };
  }

  /**
   * HOÀN TẤT TRẢ HÀNG VÀ NHẬP KHO LẠI (Dành cho Thủ kho test flow hoàn chỉnh)
   */
  completeReturnRestock(orderId, actor = "Lê Văn Hùng (Thủ kho)") {
    const order = this.getOrderById(orderId);
    if (!order || order.status !== "RETURN_PROCESSING" || !order.returnOrder) {
      return { success: false, message: "Đơn không ở trạng thái xử lý trả hàng." };
    }

    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });
    this.inventoryService.restockReturnedGoods(order, order.returnOrder, actor);

    order.returnOrder.status = "COMPLETED_RESTOCKED";
    order.returnOrder.restocked = true;
    order.returnOrder.completedAt = timestamp;
    order.updatedAt = timestamp;

    order.history.unshift({
      time: timestamp,
      actor: actor,
      action: "Kho hoàn tất tiếp nhận hàng trả & Nhập lại kho vật lý",
      detail: `Biên bản kiểm tra ${order.returnOrder.rmaCode} đạt tiêu chuẩn. Đã hoàn nhập lại ${order.items.reduce((s, i) => s + i.quantity, 0)} sản phẩm vào tồn kho vật lý.`
    });

    this.persistOrders();
    return { success: true, message: "Đã kiểm hàng trả và hoàn nhập kho thành công!" };
  }

  /**
   * CHUYỂN BƯỚC TIẾP THEO TRONG VÒNG ĐỜI (Simulation engine)
   */
  advanceToNextStatus(orderId, actor = "Hệ thống") {
    const order = this.getOrderById(orderId);
    if (!order) return { success: false, message: "Không tìm thấy đơn." };

    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });

    switch (order.status) {
      case "DRAFT":
        order.status = "PENDING_APPROVAL";
        order.updatedAt = timestamp;
        order.history.unshift({
          time: timestamp,
          actor: actor,
          action: "Gửi phê duyệt đơn hàng",
          detail: "Sales đã hoàn tất báo giá và gửi yêu cầu phê duyệt đến Trưởng phòng kinh doanh."
        });
        break;

      case "PENDING_APPROVAL":
        // Kiểm tra tồn kho trước khi duyệt
        const reserveCheck = this.inventoryService.reserveStockForOrder(order, actor);
        if (!reserveCheck.success) {
          return { success: false, message: reserveCheck.message };
        }
        order.status = "APPROVED";
        order.updatedAt = timestamp;
        order.history.unshift({
          time: timestamp,
          actor: actor,
          action: "Phê duyệt đơn hàng",
          detail: "Quản lý kinh doanh phê duyệt. Đã kích hoạt GIỮ CHỖ TỒN KHO tự động."
        });
        break;

      case "APPROVED":
        order.status = "PICKING";
        order.updatedAt = timestamp;
        order.warehouse.operatorName = "Lê Văn Hùng (Thủ kho)";
        order.warehouse.pickProgress = "Bắt đầu nhặt hàng từ vị trí kệ...";
        order.history.unshift({
          time: timestamp,
          actor: "Lê Văn Hùng (Thủ kho)",
          action: "Tiếp nhận soạn hàng",
          detail: "Thủ kho đã in Pick-list và đang lấy hàng tại các vị trí kệ kho Thủ Đức."
        });
        break;

      case "PICKING":
        // Xuất kho -> trừ tồn vật lý, giải phóng giữ chỗ
        order.status = "DISPATCHED";
        order.updatedAt = timestamp;
        const dispatchNote = "XK-" + Date.now().toString().slice(-6);
        order.warehouse.dispatchNoteNumber = dispatchNote;
        order.warehouse.pickProgress = "Đã đóng gói hoàn chỉnh và niêm phong";
        if (!order.carrier) {
          order.carrier = {
            name: "Giao Hàng Nhanh Express (B2B)",
            trackingCode: "GHN-" + Date.now().toString().slice(-8),
            driverPhone: "0909.555.777"
          };
        }
        this.inventoryService.deductPhysicalStockOnDispatch(order, "Thủ kho (Xuất kho " + dispatchNote + ")");
        order.history.unshift({
          time: timestamp,
          actor: "Lê Văn Hùng (Thủ kho)",
          action: "Xác nhận xuất kho",
          detail: `Đã xuất kho theo Phiếu ${dispatchNote}. Trừ tồn vật lý và bàn giao cho tài xế vận chuyển.`
        });
        break;

      case "DISPATCHED":
        order.status = "DELIVERED";
        order.updatedAt = timestamp;
        order.history.unshift({
          time: timestamp,
          actor: order.carrier ? order.carrier.name : "Đơn vị vận chuyển",
          action: "Xác nhận giao hàng thành công",
          detail: "Khách hàng đã nhận hàng, đồng kiểm và ký biên bản giao nhận đầy đủ."
        });
        break;

      case "DELIVERED":
        order.status = "CLOSED";
        order.updatedAt = timestamp;
        order.history.unshift({
          time: timestamp,
          actor: "Kế toán bán hàng",
          action: "Đóng đơn hàng (Closed)",
          detail: "Đã thu đủ tiền hàng, hoàn tất hạch toán kế toán và xuất hóa đơn điện tử VAT."
        });
        break;

      default:
        return { success: false, message: `Trạng thái ${order.status} không thể chuyển tiếp tiếp tục.` };
    }

    this.persistOrders();
    return { success: true, order: order, message: `Đơn đã chuyển sang trạng thái: ${ORDER_STATUSES[order.status].label}` };
  }

  /**
   * TẠO ĐƠN HÀNG MỚI (Dành cho Sales tạo và test từ A-Z)
   */
  createOrder(newOrderData) {
    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });
    const orderCode = "SO-" + Math.floor(100 + Math.random() * 900);
    const orderId = "ORD-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);

    const order = {
      id: orderId,
      code: orderCode,
      createdAt: timestamp,
      updatedAt: timestamp,
      salesRep: {
        id: "SALES-01",
        name: "Trần Minh Quân",
        email: "quan.tm@techcorp.vn",
        phone: "0912.888.777"
      },
      customer: newOrderData.customer,
      items: newOrderData.items,
      status: "DRAFT",
      warehouse: {
        name: "Kho Tổng Thủ Đức (Khu Công nghệ Cao)",
        operatorName: "Chờ điều phối",
        binSummary: "Tự động phân bổ kệ theo SKU",
        pickProgress: "Chưa phân công",
        dispatchNoteNumber: null
      },
      paymentMethod: newOrderData.paymentMethod || "Chuyển khoản công nợ",
      notes: newOrderData.notes || "",
      cancellation: null,
      returnOrder: null,
      history: [
        {
          time: timestamp,
          actor: "Trần Minh Quân (Sales)",
          action: "Tạo đơn hàng nháp",
          detail: "Khởi tạo đơn hàng mới trên hệ thống OMS."
        }
      ]
    };

    this.orders.unshift(order);
    this.persistOrders();
    return { success: true, order: order };
  }

  resetToDefault() {
    localStorage.removeItem(this.STORAGE_KEY_ORDERS);
    this.init();
  }
}

window.orderStateMachine = new OrderStateMachine(window.inventoryService);
