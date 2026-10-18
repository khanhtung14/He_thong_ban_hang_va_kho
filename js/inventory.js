/**
 * INVENTORY & STOCK RESERVATION ENGINE
 * Quản lý logic Tồn vật lý, Giữ chỗ (Reserved Stock), Khả dụng (Available Stock)
 * và Ghi nhận vết kiểm toán (Audit Trail)
 */

class InventoryService {
  constructor() {
    this.STORAGE_KEY_PRODUCTS = "scrum13_products";
    this.STORAGE_KEY_LOGS = "scrum13_stock_logs";
    this.init();
  }

  init() {
    const savedProducts = localStorage.getItem(this.STORAGE_KEY_PRODUCTS);
    const savedLogs = localStorage.getItem(this.STORAGE_KEY_LOGS);

    if (!savedProducts) {
      this.products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
      this.persistProducts();
    } else {
      this.products = JSON.parse(savedProducts);
    }

    if (!savedLogs) {
      this.logs = JSON.parse(JSON.stringify(INITIAL_STOCK_LOGS));
      this.persistLogs();
    } else {
      this.logs = JSON.parse(savedLogs);
    }
  }

  persistProducts() {
    localStorage.setItem(this.STORAGE_KEY_PRODUCTS, JSON.stringify(this.products));
  }

  persistLogs() {
    localStorage.setItem(this.STORAGE_KEY_LOGS, JSON.stringify(this.logs));
  }

  getAllProducts() {
    return this.products.map(p => ({
      ...p,
      availableStock: Math.max(0, p.physicalStock - p.reservedStock)
    }));
  }

  getProductBySku(sku) {
    const p = this.products.find(item => item.sku === sku);
    if (!p) return null;
    return {
      ...p,
      availableStock: Math.max(0, p.physicalStock - p.reservedStock)
    };
  }

  getAllLogs() {
    return [...this.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  /**
   * Kiểm tra khả dụng trước khi duyệt hoặc giữ chỗ
   */
  canReserveOrderItems(items) {
    for (const item of items) {
      const prod = this.getProductBySku(item.sku);
      if (!prod) return { success: false, message: `Không tìm thấy sản phẩm ${item.sku} trong kho` };
      if (prod.availableStock < item.quantity) {
        return {
          success: false,
          message: `Sản phẩm "${prod.name}" không đủ khả dụng (Cần: ${item.quantity}, Khả dụng: ${prod.availableStock})`
        };
      }
    }
    return { success: true };
  }

  /**
   * Kích hoạt GIỮ CHỖ TỒN KHO khi đơn được phê duyệt
   */
  reserveStockForOrder(order, operator = "Hệ thống (Trigger: Phê duyệt)") {
    const check = this.canReserveOrderItems(order.items);
    if (!check.success) return check;

    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });

    order.items.forEach(item => {
      const prod = this.products.find(p => p.sku === item.sku);
      if (prod) {
        prod.reservedStock += item.quantity;
        item.reserved = true;

        this.logs.unshift({
          id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          timestamp: timestamp,
          sku: prod.sku,
          orderCode: order.code,
          type: "RESERVE",
          quantityDelta: item.quantity,
          operator: operator,
          note: `Giữ chỗ ${item.quantity} ${prod.unit} cho đơn ${order.code}. Tồn khả dụng mới: ${prod.physicalStock - prod.reservedStock}`
        });
      }
    });

    this.persistProducts();
    this.persistLogs();
    return { success: true, message: `Đã giữ chỗ thành công cho đơn ${order.code}` };
  }

  /**
   * TỰ ĐỘNG NHẢ TỒN ĐANG GIỮ CHỖ KHI HUỶ ĐƠN
   * (Nghiệp vụ cốt lõi theo đề bài: Huỷ bắt buộc nhập lý do và tự động nhả tồn đang giữ chỗ)
   */
  releaseStockOnCancel(order, reason, operator = "Nhân viên kinh doanh") {
    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });
    const releasedList = [];

    order.items.forEach(item => {
      const prod = this.products.find(p => p.sku === item.sku);
      if (prod) {
        // Chỉ nhả tồn nếu đơn này trước đó đã được giữ chỗ
        // (Trạng thái Approved hoặc Picking)
        const qtyToRelease = item.reserved ? item.quantity : 0;
        if (qtyToRelease > 0) {
          prod.reservedStock = Math.max(0, prod.reservedStock - qtyToRelease);
          item.reserved = false;
          releasedList.push({ sku: prod.sku, name: prod.name, qty: qtyToRelease });

          this.logs.unshift({
            id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
            timestamp: timestamp,
            sku: prod.sku,
            orderCode: order.code,
            type: "RELEASE_CANCEL",
            quantityDelta: -qtyToRelease,
            operator: `${operator} (Huỷ đơn)`,
            note: `TỰ ĐỘNG NHẢ GIỮ CHỖ ${qtyToRelease} ${prod.unit} về kho khả dụng do huỷ đơn ${order.code}. Lý do: ${reason.category} - ${reason.detailedReason.substring(0, 45)}...`
          });
        }
      }
    });

    this.persistProducts();
    this.persistLogs();

    return {
      success: true,
      releasedList: releasedList,
      message: `Đã tự động giải phóng ${releasedList.reduce((sum, i) => sum + i.qty, 0)} sản phẩm đang giữ chỗ về kho thành công.`
    };
  }

  /**
   * KHI THỦ KHO XUẤT HÀNG: Trừ thẳng tồn thực tế, xóa giữ chỗ
   */
  deductPhysicalStockOnDispatch(order, operator = "Thủ kho Lê Văn Hùng") {
    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });

    order.items.forEach(item => {
      const prod = this.products.find(p => p.sku === item.sku);
      if (prod) {
        prod.physicalStock = Math.max(0, prod.physicalStock - item.quantity);
        prod.reservedStock = Math.max(0, prod.reservedStock - item.quantity);
        item.reserved = false;

        this.logs.unshift({
          id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          timestamp: timestamp,
          sku: prod.sku,
          orderCode: order.code,
          type: "DISPATCH_DEDUCT",
          quantityDelta: -item.quantity,
          operator: operator,
          note: `XUẤT KHO THỰC TẾ: Giảm ${item.quantity} ${prod.unit} khỏi kho vật lý theo phiếu xuất ${order.warehouse.dispatchNoteNumber || "XK-MỚI"}.`
        });
      }
    });

    this.persistProducts();
    this.persistLogs();
  }

  /**
   * KHI TRẢ HÀNG (RMA) THÀNH CÔNG: Nhập lại hàng vào tồn kho vật lý
   */
  restockReturnedGoods(order, rmaData, operator = "Thủ kho (Nhận hàng trả)") {
    const timestamp = new Date().toLocaleString("vi-VN", { hour12: false });

    order.items.forEach(item => {
      const prod = this.products.find(p => p.sku === item.sku);
      if (prod) {
        prod.physicalStock += item.quantity;

        this.logs.unshift({
          id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          timestamp: timestamp,
          sku: prod.sku,
          orderCode: order.code,
          type: "RESTOCK_RMA",
          quantityDelta: item.quantity,
          operator: operator,
          note: `NHẬP TRẢ HÀNG VÀO KHO (RMA): Nhập lại ${item.quantity} ${prod.unit} vào tồn vật lý. Lý do trả: ${rmaData.reasonCategory}.`
        });
      }
    });

    this.persistProducts();
    this.persistLogs();
  }

  resetToDefault() {
    localStorage.removeItem(this.STORAGE_KEY_PRODUCTS);
    localStorage.removeItem(this.STORAGE_KEY_LOGS);
    this.init();
  }
}

window.inventoryService = new InventoryService();
