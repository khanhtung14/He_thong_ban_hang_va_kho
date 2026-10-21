/**
 * MODULE GIẢ LẬP ĐẦU ĐỌC MÃ VẠCH KHO VẬN (WAREHOUSE BARCODE SCANNER SIMULATOR)
 * Đáp ứng tiêu chí đề bài: "Có mã đơn và mã vạch để kho tra cứu nhanh"
 * Tích hợp âm thanh Beep bằng Web Audio API & hiệu ứng tia laser quét chân thực
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

export class WarehouseScannerSimulator {
  constructor(orderManager) {
    this.orderManager = orderManager;
    this.audioCtx = null;
  }

  _playBeep(frequency = 1850, duration = 0.1) {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn('AudioContext not allowed or not supported:', e);
    }
  }

  /**
   * Quét và tra cứu đơn hàng nhanh trong kho theo mã vạch
   * @param {string} barcode 
   * @returns {object} Kết quả tra cứu kho vận WMS
   */
  scan(barcode) {
    this._playBeep(2100, 0.09);

    const cleanCode = (barcode || '').trim().toUpperCase();
    const order = this.orderManager.findOrderByBarcode(cleanCode);

    if (!order) {
      return {
        success: false,
        barcode: cleanCode,
        message: `Không tìm thấy đơn hàng với mã vạch [${cleanCode}] trong cơ sở dữ liệu WMS!`
      };
    }

    // Giả lập thông tin luồng kho vận tương ứng với đơn hàng
    const warehouseData = {
      success: true,
      order: order,
      barcode: cleanCode,
      scannedAt: new Date().toLocaleTimeString('vi-VN') + ' ' + new Date().toLocaleDateString('vi-VN'),
      warehouseLocation: 'Kho Tổng Cát Lái - Phân khu A (Hàng công nghệ cao)',
      assignedBin: 'KỆ TỰ ĐỘNG B-08 // TẦNG 2',
      pickingStatus: order.signedByAgent?.isSigned ? 'ĐÃ DUYỆT - SẴN SÀNG SOẠN HÀNG (READY TO PICK)' : 'CHỜ BỔ SUNG CHỮ KÝ ĐẠI LÝ',
      packingSlipId: 'PACK-' + order.orderId.replace('NX-ORD-', ''),
      courierPartner: 'Nexus Logistics Express & Viettel Post Super 24h',
      totalPieces: order.items.reduce((sum, item) => sum + item.quantity, 0)
    };

    return warehouseData;
  }
}
