/**
 * MODULE QUẢN LÝ ĐƠN HÀNG, TÍNH TOÁN TÀI CHÍNH & STATE MANAGEMENT
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

import { INITIAL_ORDERS, AGENCIES, SALES_REPRESENTATIVES, PRODUCTS, COMPANY_INFO } from './mockData.js';
import { convertNumberToWords, formatCurrency } from './numberToWords.js';

const STORAGE_KEY = 'NEXUS_ORDERS_SCRUM15';

export class OrderManager {
  constructor() {
    this.orders = this._loadOrders();
    this.activeOrderId = this.orders[0]?.orderId || null;
    this.listeners = [];
  }

  _loadOrders() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not read from localStorage:', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_ORDERS));
  }

  _saveOrders() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  _notify() {
    this.listeners.forEach(listener => listener(this.getActiveOrder()));
  }

  getAllOrders() {
    return this.orders;
  }

  getActiveOrderId() {
    return this.activeOrderId;
  }

  setActiveOrderId(orderId) {
    if (this.orders.some(o => o.orderId === orderId)) {
      this.activeOrderId = orderId;
      this._notify();
    }
  }

  getActiveOrder() {
    return this.orders.find(o => o.orderId === this.activeOrderId) || this.orders[0] || null;
  }

  findOrderByBarcode(barcode) {
    const code = barcode.trim().toUpperCase();
    return this.orders.find(o => 
      o.barcodeText.toUpperCase() === code || 
      o.orderId.toUpperCase() === code
    ) || null;
  }

  getAgency(agencyId) {
    return AGENCIES.find(a => a.id === agencyId) || AGENCIES[0];
  }

  getSalesRep(salesRepId) {
    return SALES_REPRESENTATIVES.find(s => s.id === salesRepId) || SALES_REPRESENTATIVES[0];
  }

  /**
   * Tính toán toàn diện bảng kê tài chính, chiết khấu và thuế VAT cho đơn hàng
   * @param {object} order 
   * @returns {object} Financial Breakdown chuẩn xác
   */
  calculateFinancials(order) {
    if (!order) return null;

    const agency = this.getAgency(order.agencyId);
    let subtotalRaw = 0;
    let totalLineDiscount = 0;

    const calculatedLines = (order.items || []).map((item, index) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.unitPrice) || 0;
      const discPct = Number(item.lineDiscountPercent) || 0;

      const lineRaw = qty * price;
      const lineDisc = lineRaw * (discPct / 100);
      const lineNet = lineRaw - lineDisc;

      subtotalRaw += lineRaw;
      totalLineDiscount += lineDisc;

      return {
        stt: index + 1,
        ...item,
        quantity: qty,
        unitPrice: price,
        lineDiscountPercent: discPct,
        lineRaw,
        lineDiscountAmount: lineDisc,
        lineNetAmount: lineNet,
        formattedUnitPrice: formatCurrency(price),
        formattedLineDiscount: formatCurrency(lineDisc),
        formattedLineNet: formatCurrency(lineNet)
      };
    });

    const subtotalAfterLineDiscount = subtotalRaw - totalLineDiscount;

    // Chiết khấu cấp Đại lý (Tier discount)
    const tierPercent = agency?.tierDiscountPercent || 0;
    const tierDiscountAmount = subtotalAfterLineDiscount * (tierPercent / 100);

    const netMerchandise = subtotalAfterLineDiscount - tierDiscountAmount;

    // Thuế GTGT VAT
    const vatRate = order.vatRate || 0.08;
    const vatAmount = netMerchandise * vatRate;

    // Phí vận chuyển
    const rawShipping = Number(order.shippingFee) || 0;
    const shippingDiscount = Number(order.shippingFeeDiscount) || 0;
    const finalShippingFee = Math.max(0, rawShipping - shippingDiscount);

    // Tổng tiền thanh toán
    const totalAmount = Math.round(netMerchandise + vatAmount + finalShippingFee);

    // Tổng chiết khấu toàn đơn (Dòng + Đại lý + Hỗ trợ vận chuyển)
    const grandTotalDiscount = totalLineDiscount + tierDiscountAmount + shippingDiscount;

    return {
      subtotalRaw,
      totalLineDiscount,
      subtotalAfterLineDiscount,
      tierPercent,
      tierDiscountAmount,
      netMerchandise,
      vatRate,
      vatPercent: Math.round(vatRate * 100),
      vatAmount,
      rawShipping,
      shippingDiscount,
      finalShippingFee,
      totalAmount,
      grandTotalDiscount,
      formattedSubtotalRaw: formatCurrency(subtotalRaw),
      formattedTotalLineDiscount: formatCurrency(totalLineDiscount),
      formattedTierDiscount: formatCurrency(tierDiscountAmount),
      formattedNetMerchandise: formatCurrency(netMerchandise),
      formattedVatAmount: formatCurrency(vatAmount),
      formattedFinalShippingFee: formatCurrency(finalShippingFee),
      formattedTotalAmount: formatCurrency(totalAmount),
      formattedGrandTotalDiscount: formatCurrency(grandTotalDiscount),
      totalAmountInWords: convertNumberToWords(totalAmount),
      calculatedLines
    };
  }

  /**
   * Cập nhật chữ ký xác nhận của đại lý tại chỗ
   */
  signActiveOrder(signerName, signatureDataUrl) {
    const order = this.getActiveOrder();
    if (!order) return false;

    order.signedByAgent = {
      isSigned: true,
      signDate: new Date().toISOString(),
      signerName: signerName || 'Đại diện Đại lý',
      signatureDataUrl: signatureDataUrl
    };

    order.status = 'CONFIRMED_ON_SITE';
    order.statusText = 'Đại lý đã duyệt & Ký nhận tại chỗ';

    this._saveOrders();
    this._notify();
    return true;
  }

  /**
   * Hủy chữ ký (Reset lại để ký lại)
   */
  resetActiveOrderSignature() {
    const order = this.getActiveOrder();
    if (!order) return;

    order.signedByAgent = {
      isSigned: false,
      signDate: null,
      signerName: '',
      signatureDataUrl: null
    };
    order.status = 'PENDING_AGENT_SIGN';
    order.statusText = 'Chờ đại lý xem lại & Ký xác nhận';

    this._saveOrders();
    this._notify();
  }

  /**
   * Tạo đơn hàng mới trực tiếp tại hiện trường
   */
  createOrder(orderData) {
    const now = new Date();
    const timestampStr = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      Math.floor(1000 + Math.random() * 9000);

    const orderId = `NX-ORD-${timestampStr}`;

    const newOrder = {
      orderId,
      barcodeText: orderId,
      createdAt: now.toISOString(),
      expectedDeliveryDate: orderData.expectedDeliveryDate || new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      agencyId: orderData.agencyId || 'DL-01',
      salesRepId: orderData.salesRepId || 'user-nam',
      status: 'PENDING_AGENT_SIGN',
      statusText: 'Chờ đại lý xem lại & Ký xác nhận',
      paymentMethod: orderData.paymentMethod || 'Chuyển khoản công nợ (Net 30)',
      vatRate: 0.08,
      shippingFee: 200000,
      shippingFeeDiscount: 200000,
      generalNotes: orderData.generalNotes || 'Đơn hàng mới tạo trực tiếp tại đại lý bởi Nhân viên kinh doanh.',
      signedByAgent: {
        isSigned: false,
        signDate: null,
        signerName: '',
        signatureDataUrl: null
      },
      items: orderData.items || [
        {
          sku: PRODUCTS[0].sku,
          name: PRODUCTS[0].name,
          unit: PRODUCTS[0].unit,
          quantity: 5,
          unitPrice: PRODUCTS[0].basePrice,
          lineDiscountPercent: 5,
          note: 'Hàng mới niêm phong'
        }
      ]
    };

    this.orders.unshift(newOrder);
    this.activeOrderId = newOrder.orderId;
    this._saveOrders();
    this._notify();
    return newOrder;
  }

  /**
   * Khôi phục dữ liệu mẫu ban đầu
   */
  resetToDefault() {
    this.orders = JSON.parse(JSON.stringify(INITIAL_ORDERS));
    this.activeOrderId = this.orders[0]?.orderId || null;
    this._saveOrders();
    this._notify();
  }
}
