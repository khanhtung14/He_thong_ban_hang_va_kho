/**
 * NEXUS ENTERPRISE WMS - HIGH-TECH AUDIO ALERT SYNTHESIZER
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Trình tổng hợp âm thanh cảnh báo thông minh bằng Web Audio API thuần (Không cần tải file MP3)
 */

class AudioAlertSynthesizer {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
  }

  _initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = !!muted;
  }

  /**
   * Phát âm thanh cảnh báo nguy cấp khi hàng rơi xuống dưới mức tồn tối thiểu (Dual-tone Sonar Alert)
   */
  playWarningBelowMin() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      // Tần số cảnh báo công nghệ cao: 880Hz -> 660Hz (A5 -> E5)
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.25);

      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(329.63, now + 0.25);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.45);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.warn('Audio synthesis failed or blocked by autoplay policy:', e);
    }
  }

  /**
   * Phát âm thanh khẩn cấp khi hết hàng hoàn toàn (Stockout = 0)
   */
  playStockoutAlarm() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // 2 nhịp beep dồn dập
      [0, 0.15].forEach(delay => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(950, now + delay);
        osc.frequency.linearRampToValueAtTime(480, now + delay + 0.1);

        gain.gain.setValueAtTime(0.12, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      });
    } catch (e) {
      // ignore
    }
  }

  /**
   * Phát âm thanh chúc mừng / xác nhận thành công (Reorder PO created / Restocked)
   */
  playSuccessChime() {
    if (this.isMuted) return;
    try {
      this._initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Hợp âm C-Major Arpeggio (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = now + (idx * 0.08);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.1, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + 0.35);
      });
    } catch (e) {
      // ignore
    }
  }
}

export const audioAlert = new AudioAlertSynthesizer();
