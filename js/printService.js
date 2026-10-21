/**
 * MODULE ĐIỀU PHỐI IN ẤN & XUẤT FILE PDF ĐA ĐỊNH DẠNG (A4 & K80 THERMAL)
 * Tích hợp window.print() chuẩn hoá và thư viện html2pdf.js xuất file trực tiếp
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

import { generateBarcode128SVG, generateQRCodeSVG } from './barcodeEngine.js';
import { COMPANY_INFO } from './mockData.js';

export class PrintService {
  constructor(orderManager) {
    this.orderManager = orderManager;
    this.currentProfile = 'a4'; // 'a4' hoặc 'k80'
    this.options = {
      showLogo: true,
      showBarcode: true,
      showQRCode: true,
      showSignatures: true,
      showWatermark: true,
      showTerms: true
    };
  }

  setProfile(profile) {
    if (profile === 'a4' || profile === 'k80') {
      this.currentProfile = profile;
    }
  }

  getProfile() {
    return this.currentProfile;
  }

  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Tạo toàn bộ cây DOM HTML cho mẫu in dựa trên Order và Profile đang chọn
   */
  renderInvoiceHTML(order) {
    if (!order) {
      return '<div class="empty-state">Không có đơn hàng nào được chọn!</div>';
    }

    const financials = this.orderManager.calculateFinancials(order);
    const agency = this.orderManager.getAgency(order.agencyId);
    const salesRep = this.orderManager.getSalesRep(order.salesRepId);

    if (this.currentProfile === 'k80') {
      return this._renderK80ThermalHTML(order, financials, agency, salesRep);
    }
    return this._renderA4CorporateHTML(order, financials, agency, salesRep);
  }

  /**
   * MẪU IN KHỔ A4 TIÊU CHUẨN DOANH NGHIỆP TRANG TRỌNG
   */
  _renderA4CorporateHTML(order, fin, agency, salesRep) {
    const barcodeSVG = generateBarcode128SVG(order.barcodeText, { height: 50, barWidth: 1.6, showText: true });
    const qrCodeSVG = generateQRCodeSVG(`NEXUS-VERIFY:${order.orderId}|${agency.code}|${fin.totalAmount}`, 88);

    const isSigned = order.signedByAgent?.isSigned;
    const signDateFormatted = isSigned ? new Date(order.signedByAgent.signDate).toLocaleString('vi-VN') : '';

    return `
      <div class="invoice-sheet a4-format" id="printable-invoice">
        ${this.options.showWatermark && isSigned ? '<div class="watermark-stamp">ĐÃ XÁC NHẬN TẠI CHỖ</div>' : ''}

        <!-- 1. HEADER DOANH NGHIỆP & METADATA -->
        <header class="inv-header">
          <div class="inv-header-top">
            <div class="inv-company-identity">
              ${this.options.showLogo ? `
                <div class="inv-logo-box">
                  <svg class="inv-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                  <span class="inv-logo-name">${COMPANY_INFO.brand}</span>
                </div>
              ` : ''}
              <div class="inv-company-text">
                <h1 class="inv-company-title">${COMPANY_INFO.name}</h1>
                <p class="inv-company-meta"><strong>Trụ sở:</strong> ${COMPANY_INFO.headquarters}</p>
                <p class="inv-company-meta"><strong>MST:</strong> ${COMPANY_INFO.taxCode} &nbsp;|&nbsp; <strong>Hotline:</strong> ${COMPANY_INFO.hotline} &nbsp;|&nbsp; <strong>Email:</strong> ${COMPANY_INFO.email}</p>
                <p class="inv-company-meta"><strong>Kho xuất hàng:</strong> ${COMPANY_INFO.warehouseHub}</p>
              </div>
            </div>

            <!-- Mã vạch Code 128 & QR Code ở góc trên để thủ kho và máy quét quét ngay -->
            <div class="inv-header-codes">
              ${this.options.showBarcode ? `
                <div class="barcode-container">
                  <div class="barcode-label">MÃ TRA CỨU KHO (BARCODE 128)</div>
                  ${barcodeSVG}
                </div>
              ` : ''}
              ${this.options.showQRCode ? `
                <div class="qrcode-container">
                  ${qrCodeSVG}
                  <span class="qrcode-label">Quét xác thực</span>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="inv-divider-line"></div>

          <!-- TIÊU ĐỀ PHIẾU IN -->
          <div class="inv-title-band">
            <h2 class="inv-main-title">PHIẾU ĐẶT HÀNG & XÁC NHẬN ĐẠI LÝ TẠI CHỖ</h2>
            <div class="inv-order-badge-row">
              <span class="inv-order-id-chip">MÃ ĐƠN HÀNG: <strong>${order.orderId}</strong></span>
              <span class="inv-meta-chip">Ngày lập: <strong>${new Date(order.createdAt).toLocaleString('vi-VN')}</strong></span>
              <span class="inv-meta-chip">Giao dự kiến: <strong>${new Date(order.expectedDeliveryDate).toLocaleDateString('vi-VN')}</strong></span>
              <span class="inv-meta-chip status-${order.status.toLowerCase()}">${order.statusText}</span>
            </div>
          </div>
        </header>

        <!-- 2. THÔNG TIN ĐẠI LÝ & ĐIỂM GIAO HÀNG (2 CỘT RÕ RÀNG) -->
        <section class="inv-parties-grid">
          <!-- BÊN MUA: THÔNG TIN ĐẠI LÝ -->
          <div class="party-card party-buyer">
            <div class="party-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>THÔNG TIN ĐẠI LÝ (BÊN MUA)</span>
              <span class="agency-tier-pill">${agency.tier}</span>
            </div>
            <div class="party-card-body">
              <p class="party-name">${agency.name}</p>
              <div class="party-field-row">
                <span class="field-label">Mã Đại lý:</span>
                <span class="field-val"><strong>${agency.code}</strong> (${agency.shortName})</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Mã số thuế:</span>
                <span class="field-val"><strong>${agency.taxCode}</strong></span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Người đại diện:</span>
                <span class="field-val"><strong>${agency.representative}</strong> - ${agency.repTitle}</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Điện thoại / Hotline:</span>
                <span class="field-val"><strong>${agency.hotline}</strong> (VP: ${agency.phone})</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Email:</span>
                <span class="field-val">${agency.email}</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Đ/C ĐKKD:</span>
                <span class="field-val">${agency.businessAddress}</span>
              </div>
            </div>
          </div>

          <!-- ĐIỂM GIAO HÀNG & THÔNG TIN VẬN CHUYỂN -->
          <div class="party-card party-delivery">
            <div class="party-card-header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              <span>ĐIỂM GIAO HÀNG & VẬN CHUYỂN (TIẾP NHẬN)</span>
            </div>
            <div class="party-card-body">
              <p class="party-name delivery-hub-title">${agency.deliveryPoint.name}</p>
              <div class="party-field-row">
                <span class="field-label">Địa chỉ giao:</span>
                <span class="field-val highlight-delivery">${agency.deliveryPoint.address}</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Người nhận hàng:</span>
                <span class="field-val"><strong>${agency.deliveryPoint.receiverName}</strong></span>
              </div>
              <div class="party-field-row">
                <span class="field-label">SĐT nhận hàng:</span>
                <span class="field-val"><strong>${agency.deliveryPoint.receiverPhone}</strong></span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Thời gian giao:</span>
                <span class="field-val">${agency.deliveryPoint.deliveryTimeframe}</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">Lưu ý giao nhận:</span>
                <span class="field-val note-text">${agency.deliveryPoint.shippingNotes}</span>
              </div>
              <div class="party-field-row">
                <span class="field-label">NV Kinh doanh:</span>
                <span class="field-val"><strong>${salesRep.name}</strong> (${salesRep.phone} - ${salesRep.email})</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 3. BẢNG CHI TIẾT DÒNG HÀNG (ITEMIZED TABLE) -->
        <section class="inv-items-section">
          <div class="section-title-tag">CHI TIẾT DÒNG HÀNG & MỨC CHIẾT KHẤU</div>
          <table class="inv-table">
            <thead>
              <tr>
                <th class="col-stt">STT</th>
                <th class="col-sku">Mã SKU</th>
                <th class="col-name">Tên sản phẩm & Quy cách kỹ thuật</th>
                <th class="col-unit">ĐVT</th>
                <th class="col-qty">Số lượng</th>
                <th class="col-price">Đơn giá niêm yết</th>
                <th class="col-disc">CK (%)</th>
                <th class="col-amount">Thành tiền sau CK</th>
              </tr>
            </thead>
            <tbody>
              ${fin.calculatedLines.map(line => `
                <tr>
                  <td class="col-stt text-center">${line.stt}</td>
                  <td class="col-sku text-mono font-bold">${line.sku}</td>
                  <td class="col-name">
                    <div class="product-title">${line.name}</div>
                    ${line.note ? `<div class="product-note"><small>Ghi chú: ${line.note}</small></div>` : ''}
                  </td>
                  <td class="col-unit text-center">${line.unit}</td>
                  <td class="col-qty text-center font-bold">${line.quantity}</td>
                  <td class="col-price text-right">${line.formattedUnitPrice}</td>
                  <td class="col-disc text-center">${line.lineDiscountPercent > 0 ? `<span class="disc-pill">-${line.lineDiscountPercent}%</span>` : '0%'}</td>
                  <td class="col-amount text-right font-bold">${line.formattedLineNet}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <!-- 4. TỔNG HỢP TÀI CHÍNH & CHIẾT KHẤU ĐẠI LÝ -->
        <section class="inv-summary-container">
          <div class="inv-summary-left">
            <div class="payment-terms-box">
              <h4 class="terms-title">Phương thức thanh toán & Tài khoản thụ hưởng:</h4>
              <p><strong>Hình thức:</strong> ${order.paymentMethod}</p>
              <p><strong>Ngân hàng:</strong> ${COMPANY_INFO.bankAccount.bankName}</p>
              <p><strong>Số tài khoản:</strong> <span class="text-mono font-bold">${COMPANY_INFO.bankAccount.accountNumber}</span></p>
              <p><strong>Chủ tài khoản:</strong> ${COMPANY_INFO.bankAccount.accountHolder}</p>
              <p><strong>Cú pháp CK:</strong> <span class="text-mono highlight-text">${order.orderId} - ${agency.code}</span></p>
              ${order.generalNotes ? `<div class="order-notes-box"><strong>Ghi chú đơn hàng:</strong> ${order.generalNotes}</div>` : ''}
            </div>
          </div>

          <div class="inv-summary-right">
            <table class="summary-breakdown-table">
              <tr>
                <td class="sum-label">Tổng tiền hàng niêm yết:</td>
                <td class="sum-val">${fin.formattedSubtotalRaw}</td>
              </tr>
              ${fin.totalLineDiscount > 0 ? `
                <tr class="discount-row">
                  <td class="sum-label">Tổng chiết khấu dòng sản phẩm:</td>
                  <td class="sum-val text-danger">- ${fin.formattedTotalLineDiscount}</td>
                </tr>
              ` : ''}
              <tr>
                <td class="sum-label">Chiết khấu Cấp Đại lý (${agency.tier} - ${agency.tierDiscountPercent}%):</td>
                <td class="sum-val text-danger">- ${fin.formattedTierDiscount}</td>
              </tr>
              <tr class="subtotal-row">
                <td class="sum-label">Tiền hàng sau chiết khấu:</td>
                <td class="sum-val font-bold">${fin.formattedNetMerchandise}</td>
              </tr>
              <tr>
                <td class="sum-label">Thuế giá trị gia tăng (VAT ${fin.vatPercent}%):</td>
                <td class="sum-val">+ ${fin.formattedVatAmount}</td>
              </tr>
              <tr>
                <td class="sum-label">Cước vận chuyển & bốc dỡ:</td>
                <td class="sum-val">${fin.finalShippingFee === 0 ? '<span class="text-success font-bold">Miễn phí (Hỗ trợ 100%)</span>' : fin.formattedFinalShippingFee}</td>
              </tr>
              <tr class="grand-total-row">
                <td class="sum-label">TỔNG CỘNG PHẢI THANH TOÁN:</td>
                <td class="sum-val grand-price">${fin.formattedTotalAmount}</td>
              </tr>
            </table>

            <div class="in-words-box">
              <span class="in-words-title">Số tiền viết bằng chữ:</span>
              <p class="in-words-content font-italic">"${fin.totalAmountInWords}"</p>
            </div>
          </div>
        </section>

        <!-- 5. KHU VỰC KÝ TÊN XÁC NHẬN TẠI CHỖ (SIGNATURES) -->
        ${this.options.showSignatures ? `
          <footer class="inv-signatures-section">
            <div class="signature-col">
              <span class="sign-role">ĐẠI DIỆN ĐẠI LÝ (BÊN MUA)</span>
              <span class="sign-hint">(Ký, ghi rõ họ tên và đóng dấu)</span>
              <div class="sign-space">
                ${isSigned && order.signedByAgent.signatureDataUrl ? `
                  <img src="${order.signedByAgent.signatureDataUrl}" class="signed-image" alt="Chữ ký đại lý" />
                ` : isSigned ? `
                  <div class="simulated-sign">
                    <svg viewBox="0 0 200 60" class="sim-svg">
                      <path d="M 20 40 Q 60 10 90 35 T 160 30" fill="none" stroke="#1e3a8a" stroke-width="2.5" />
                      <line x1="15" y1="50" x2="185" y2="48" stroke="#1e3a8a" stroke-width="1.8" />
                    </svg>
                  </div>
                ` : `
                  <div class="unsigned-box">
                    <span>Chưa ký xác nhận</span>
                  </div>
                `}
              </div>
              <div class="signer-name font-bold">${isSigned ? (order.signedByAgent.signerName || agency.representative) : agency.representative}</div>
              ${isSigned ? `<small class="sign-timestamp">Ký lúc: ${signDateFormatted}</small>` : ''}
            </div>

            <div class="signature-col">
              <span class="sign-role">NHÂN VIÊN KINH DOANH LẬP ĐƠN</span>
              <span class="sign-hint">(Ký và xác nhận giá & chiết khấu)</span>
              <div class="sign-space">
                <div class="simulated-sign">
                  <svg viewBox="0 0 200 60" class="sim-svg">
                    <path d="M 25 35 Q 50 15 80 40 T 170 30" fill="none" stroke="#047857" stroke-width="2.5" />
                    <line x1="20" y1="52" x2="180" y2="50" stroke="#047857" stroke-width="1.8" />
                  </svg>
                </div>
              </div>
              <div class="signer-name font-bold">${salesRep.name}</div>
              <small class="sign-timestamp">${salesRep.code} - ${salesRep.phone}</small>
            </div>

            <div class="signature-col">
              <span class="sign-role">BỘ PHẬN KHO VẬN & ĐIỀU PHỐI</span>
              <span class="sign-hint">(Quét mã vạch khi xuất kho)</span>
              <div class="sign-space warehouse-stamp-space">
                <div class="warehouse-box">
                  <span class="wh-tag">WMS READY</span>
                  <small>Cát Lái Hub</small>
                </div>
              </div>
              <div class="signer-name font-bold">Thủ kho Tiếp nhận</div>
              <small class="sign-timestamp">Kiểm tra tem niêm phong</small>
            </div>
          </footer>
        ` : ''}

        <!-- 6. ĐIỀU KHOẢN PHÁP LÝ & CAM KẾT HÀNG HÓA -->
        ${this.options.showTerms ? `
          <div class="inv-terms-footer">
            <p><strong>Lưu ý quan trọng:</strong> Quý đại lý vui lòng kiểm tra đối chiếu kỹ số lượng, mẫu mã và tem niêm phong ngay khi nhận hàng từ nhân viên giao vận. Mọi yêu cầu đổi trả hoặc bảo hành lỗi kỹ thuật được giải quyết trong vòng 07 ngày kể từ thời điểm ký biên bản bàn giao. Đơn hàng này có giá trị xác nhận thỏa thuận cung ứng hàng hóa chính thức.</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * MẪU IN KHỔ NHỎ K80 (80MM PORTABLE THERMAL RECEIPT)
   * Tối ưu cho máy in bill cầm tay Bluetooth khi Sales Rep đi thị trường
   */
  _renderK80ThermalHTML(order, fin, agency, salesRep) {
    const barcodeSVG = generateBarcode128SVG(order.barcodeText, { height: 42, barWidth: 1.3, showText: true, fontSize: 10 });
    const qrCodeSVG = generateQRCodeSVG(`NEXUS:${order.orderId}`, 70);

    return `
      <div class="invoice-sheet k80-format" id="printable-invoice">
        <div class="k80-header text-center">
          <div class="k80-brand">${COMPANY_INFO.brand}</div>
          <div class="k80-title">PHIẾU ĐƠN HÀNG ĐẠI LÝ</div>
          <div class="k80-hotline">Hotline: ${COMPANY_INFO.hotline}</div>
          <div class="k80-divider">================================</div>
          <div class="k80-meta-line"><strong>Mã đơn:</strong> ${order.orderId}</div>
          <div class="k80-meta-line">Ngày: ${new Date(order.createdAt).toLocaleString('vi-VN')}</div>
          <div class="k80-meta-line">NV: ${salesRep.name} (${salesRep.phone})</div>
        </div>

        <div class="k80-divider">--------------------------------</div>

        <div class="k80-section">
          <div class="k80-bold">ĐẠI LÝ: ${agency.shortName}</div>
          <div>MST: ${agency.taxCode} - ĐT: ${agency.hotline}</div>
          <div>Đ/C Giao: ${agency.deliveryPoint.address}</div>
          <div>Người nhận: ${agency.deliveryPoint.receiverName} (${agency.deliveryPoint.receiverPhone})</div>
        </div>

        <div class="k80-divider">--------------------------------</div>

        <div class="k80-items-table">
          <div class="k80-item-head">
            <span>MẶT HÀNG</span>
            <span class="text-right">T.TIỀN</span>
          </div>
          ${fin.calculatedLines.map(line => `
            <div class="k80-item-row">
              <div class="k80-item-name">${line.stt}. ${line.name}</div>
              <div class="k80-item-sub">
                <span>${line.quantity} ${line.unit} x ${line.formattedUnitPrice} ${line.lineDiscountPercent > 0 ? `(-${line.lineDiscountPercent}%)` : ''}</span>
                <span class="k80-item-total font-bold">${line.formattedLineNet}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="k80-divider">--------------------------------</div>

        <div class="k80-totals">
          <div class="k80-total-row">
            <span>Tiền hàng gốc:</span>
            <span>${fin.formattedSubtotalRaw}</span>
          </div>
          ${fin.grandTotalDiscount > 0 ? `
            <div class="k80-total-row">
              <span>Tổng chiết khấu:</span>
              <span class="font-bold">-${fin.formattedGrandTotalDiscount}</span>
            </div>
          ` : ''}
          <div class="k80-total-row">
            <span>VAT (${fin.vatPercent}%):</span>
            <span>+${fin.formattedVatAmount}</span>
          </div>
          <div class="k80-total-row font-bold k80-grand-total">
            <span>TỔNG TIỀN:</span>
            <span>${fin.formattedTotalAmount}</span>
          </div>
          <div class="k80-in-words">
            <em>(${fin.totalAmountInWords})</em>
          </div>
        </div>

        <div class="k80-divider">--------------------------------</div>

        <div class="k80-barcode-box text-center">
          ${barcodeSVG}
          <div class="k80-qr-wrap">
            ${qrCodeSVG}
          </div>
          <small>Mã vạch tra cứu kho vận tức thì</small>
        </div>

        <div class="k80-divider">================================</div>

        <div class="k80-sign-section">
          <div class="k80-sign-box text-center">
            <strong>ĐẠI LÝ XÁC NHẬN</strong>
            <div class="k80-sign-space">
              ${order.signedByAgent?.isSigned ? `
                <span class="k80-signed-badge">[ĐÃ KÝ XÁC NHẬN]</span>
                <div class="font-bold">${order.signedByAgent.signerName || agency.representative}</div>
              ` : `
                <span class="k80-unsigned-text">(Ký tại chỗ)</span>
              `}
            </div>
          </div>
        </div>

        <div class="k80-footer text-center">
          <p>Cảm ơn Quý khách! Hẹn gặp lại!</p>
          <small>NEXUS OMS - B2B Field Sales v2.4</small>
        </div>
      </div>
    `;
  }

  /**
   * Kích hoạt in trình duyệt bằng window.print() với lớp styling tối ưu
   */
  printInvoice() {
    window.print();
  }

  /**
   * Xuất file PDF bằng html2pdf.js hoặc Native Print
   */
  async exportPDF(order) {
    const targetEl = document.getElementById('printable-invoice');
    if (!targetEl) return;

    const fileName = `${order.orderId}_${order.agencyId}_XAC_NHAN_DON.pdf`;

    if (window.html2pdf) {
      const opt = {
        margin: this.currentProfile === 'k80' ? [4, 4, 4, 4] : [8, 8, 8, 8],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: {
          unit: 'mm',
          format: this.currentProfile === 'k80' ? [80, 260] : 'a4',
          orientation: 'portrait'
        }
      };

      try {
        await window.html2pdf().set(opt).from(targetEl).save();
        return { success: true, method: 'html2pdf' };
      } catch (err) {
        console.warn('html2pdf error, fallback to window.print():', err);
        window.print();
        return { success: true, method: 'native-fallback' };
      }
    } else {
      // Fallback native print to PDF
      alert(`Đang mở hộp thoại in. Vui lòng chọn "Save as PDF" (Lưu dưới dạng PDF) trong danh sách máy in để lưu file ${fileName}!`);
      window.print();
      return { success: true, method: 'native' };
    }
  }
}
