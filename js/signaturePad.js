/**
 * MODULE CHỮ KÝ ĐIỆN TỬ CẢM ỨNG TẠI CHỖ (DIGITAL SIGNATURE PAD)
 * Cho phép đại lý vẽ chữ ký xác nhận trực tiếp trên màn hình tablet/laptop/điện thoại
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

export class SignaturePad {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.options = Object.assign({
      strokeColor: '#1e3a8a', // Xanh mực bút ký cao cấp
      lineWidth: 2.6,
      backgroundColor: '#ffffff'
    }, options);

    this.isDrawing = false;
    this.hasDrawn = false;
    this.points = [];

    this._initCanvas();
    this._bindEvents();
  }

  _initCanvas() {
    // Tự động điều chỉnh theo Device Pixel Ratio để chữ ký cực kỳ sắc nét trên màn hình Retina / 4K
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    // Nếu canvas chưa có style width/height
    const width = rect.width || 480;
    const height = rect.height || 180;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);

    this.clear();
  }

  _bindEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this._startDrawing(e));
    window.addEventListener('mousemove', (e) => this._draw(e));
    window.addEventListener('mouseup', () => this._stopDrawing());

    // Touch events cho điện thoại & máy tính bảng
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._startDrawing(e.touches[0]);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDrawing && e.touches.length > 0) {
        e.preventDefault();
        this._draw(e.touches[0]);
      }
    }, { passive: false });

    window.addEventListener('touchend', () => this._stopDrawing());
    window.addEventListener('touchcancel', () => this._stopDrawing());
  }

  _getCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  _startDrawing(event) {
    this.isDrawing = true;
    const pos = this._getCoordinates(event);
    this.points = [pos];

    this.ctx.beginPath();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = this.options.strokeColor;
    this.ctx.lineWidth = this.options.lineWidth;
    this.ctx.moveTo(pos.x, pos.y);
  }

  _draw(event) {
    if (!this.isDrawing) return;
    const pos = this._getCoordinates(event);
    this.points.push(pos);

    if (this.points.length > 2) {
      const lastPoint = this.points[this.points.length - 2];
      const midPoint = {
        x: (lastPoint.x + pos.x) / 2,
        y: (lastPoint.y + pos.y) / 2
      };

      this.ctx.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
      this.ctx.stroke();
    } else {
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    }

    this.hasDrawn = true;
  }

  _stopDrawing() {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.points = [];
    }
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();

    this.hasDrawn = false;
  }

  isEmpty() {
    return !this.hasDrawn;
  }

  toDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type);
  }

  /**
   * Tạo chữ ký ký tay mẫu mô phỏng chữ ký doanh nhân trang trọng
   */
  generateSampleSignature(name = 'Vũ Mạnh Cường') {
    this.clear();
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || 480;
    const h = rect.height || 180;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Vẽ nét ký bay bổng nghệ thuật
    ctx.beginPath();
    ctx.moveTo(w * 0.18, h * 0.65);
    ctx.bezierCurveTo(w * 0.25, h * 0.15, w * 0.35, h * 0.2, w * 0.38, h * 0.7);
    ctx.bezierCurveTo(w * 0.40, h * 0.3, w * 0.48, h * 0.35, w * 0.52, h * 0.68);
    ctx.bezierCurveTo(w * 0.55, h * 0.45, w * 0.60, h * 0.45, w * 0.65, h * 0.65);
    // Vòng lượn gạch chân dứt khoát
    ctx.bezierCurveTo(w * 0.72, h * 0.5, w * 0.82, h * 0.4, w * 0.88, h * 0.55);
    ctx.stroke();

    // Gạch dưới uốn lượn sắc sảo
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.78);
    ctx.quadraticCurveTo(w * 0.50, h * 0.86, w * 0.85, h * 0.74);
    ctx.stroke();

    ctx.restore();
    this.hasDrawn = true;
  }
}
