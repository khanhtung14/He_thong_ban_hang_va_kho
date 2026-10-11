/**
 * DISTRICARE CRM - Mô-đun Chuyển Giao Địa Bàn Hàng Loạt (Bulk Handover Wizard & Document)
 * Xử lý toàn diện Tiêu chí 3: Chuyển giao địa bàn hàng loạt khi nhân viên nghỉ việc, có ghi lịch sử
 */

import { store } from './store.js';
import { formatCurrencyVND } from './data.js';

export class HandoverManager {
  constructor(uiController) {
    this.ui = uiController;
    this.currentStep = 1;
    this.wizardState = {
      fromEmployeeId: '',
      selectedAgencyIds: new Set(),
      toEmployeeId: '',
      reason: 'RESIGNATION',
      reasonText: 'Nhân viên thôi việc nghỉ việc',
      effectiveDate: new Date().toISOString().split('T')[0],
      notes: 'Đã hoàn tất bàn giao danh mục hồ sơ khách hàng, hạn mức tín dụng và công nợ tồn đọng.'
    };
  }

  openWizard(preselectedFromEmployeeId = null) {
    if (!store.isManager()) {
      this.ui.showToast('Chỉ Quản lý kinh doanh mới có quyền thực hiện chuyển giao địa bàn!', 'warning');
      return;
    }

    this.currentStep = 1;
    this.wizardState = {
      fromEmployeeId: preselectedFromEmployeeId || '',
      selectedAgencyIds: new Set(),
      toEmployeeId: '',
      reason: 'RESIGNATION',
      reasonText: 'Nhân viên thôi việc nghỉ việc',
      effectiveDate: new Date().toISOString().split('T')[0],
      notes: 'Đã hoàn tất bàn giao danh mục hồ sơ khách hàng, hạn mức tín dụng và công nợ tồn đọng.'
    };

    if (preselectedFromEmployeeId) {
      this.selectFromEmployee(preselectedFromEmployeeId);
    }

    this.renderWizardModal();
  }

  selectFromEmployee(empId) {
    this.wizardState.fromEmployeeId = empId;
    const agencies = store.getAgencies().filter(a => a.assignedSalesId === empId);
    this.wizardState.selectedAgencyIds = new Set(agencies.map(a => a.id));
  }

  goToStep(step) {
    if (step === 2) {
      if (!this.wizardState.fromEmployeeId) {
        this.ui.showToast('Vui lòng chọn nhân viên cần chuyển giao địa bàn!', 'error');
        return;
      }
      const agencies = store.getAgencies().filter(a => a.assignedSalesId === this.wizardState.fromEmployeeId);
      if (agencies.length === 0) {
        this.ui.showToast('Nhân viên này hiện không có đại lý nào để chuyển giao!', 'warning');
        return;
      }
    }

    if (step === 3) {
      if (this.wizardState.selectedAgencyIds.size === 0) {
        this.ui.showToast('Vui lòng chọn ít nhất một đại lý để chuyển giao!', 'error');
        return;
      }
    }

    if (step === 4) {
      if (!this.wizardState.toEmployeeId) {
        this.ui.showToast('Vui lòng chọn nhân viên tiếp nhận địa bàn!', 'error');
        return;
      }
      if (this.wizardState.toEmployeeId === this.wizardState.fromEmployeeId) {
        this.ui.showToast('Nhân viên tiếp nhận không thể là người chuyển giao!', 'error');
        return;
      }
    }

    this.currentStep = step;
    this.renderWizardModal();
  }

  toggleSelectAgency(agencyId) {
    if (this.wizardState.selectedAgencyIds.has(agencyId)) {
      this.wizardState.selectedAgencyIds.delete(agencyId);
    } else {
      this.wizardState.selectedAgencyIds.add(agencyId);
    }
    this.renderStep2Content();
  }

  toggleSelectAllAgencies(selectAll) {
    const fromId = this.wizardState.fromEmployeeId;
    const agencies = store.getAgencies().filter(a => a.assignedSalesId === fromId);
    if (selectAll) {
      this.wizardState.selectedAgencyIds = new Set(agencies.map(a => a.id));
    } else {
      this.wizardState.selectedAgencyIds.clear();
    }
    this.renderStep2Content();
  }

  submitHandover() {
    try {
      const {
        fromEmployeeId,
        toEmployeeId,
        selectedAgencyIds,
        reason,
        reasonText,
        effectiveDate,
        notes
      } = this.wizardState;

      const newHandover = store.executeBulkHandover({
        fromEmployeeId,
        toEmployeeId,
        agencyIds: Array.from(selectedAgencyIds),
        reason,
        reasonText,
        effectiveDate,
        notes
      });

      this.closeModal();
      this.ui.showToast(
        `Thành công! Đã chuyển giao ${selectedAgencyIds.size} đại lý sang ${newHandover.toEmployeeName}. Mã phiếu: ${newHandover.code}`,
        'success'
      );

      // Tự động mở xem biên bản bàn giao
      this.openHandoverDocumentModal(newHandover.id);
    } catch (err) {
      this.ui.showToast(err.message || 'Có lỗi xảy ra khi thực hiện chuyển giao!', 'error');
    }
  }

  closeModal() {
    const modalEl = document.getElementById('handoverWizardModal');
    if (modalEl) modalEl.classList.remove('active');
  }

  // --- RENDER MODAL ---
  renderWizardModal() {
    let modalEl = document.getElementById('handoverWizardModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'handoverWizardModal';
      modalEl.className = 'modal-backdrop';
      document.body.appendChild(modalEl);
    }

    modalEl.classList.add('active');

    const steps = [
      { num: 1, title: 'Nhân viên chuyển đi' },
      { num: 2, title: 'Chọn đại lý bàn giao' },
      { num: 3, title: 'Nhân viên tiếp nhận' },
      { num: 4, title: 'Xác nhận & Biên bản' }
    ];

    modalEl.innerHTML = `
      <div class="modal-dialog modal-xl animate-scale-in">
        <div class="modal-header">
          <div class="flex items-center gap-3">
            <div class="icon-bubble icon-bubble-primary">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <polyline points="16 11 18 13 22 9"/>
              </svg>
            </div>
            <div>
              <h3 class="modal-title">Quy Trình Chuyển Giao Địa Bàn Hàng Loạt</h3>
              <p class="modal-subtitle">Xử lý bàn giao danh mục đại lý khi nhân viên nghỉ việc hoặc tái cơ cấu vùng</p>
            </div>
          </div>
          <button class="btn-icon-close" id="btnCloseWizard">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Stepper Navigation -->
        <div class="stepper-bar">
          ${steps.map(s => `
            <div class="stepper-item ${this.currentStep === s.num ? 'active' : ''} ${this.currentStep > s.num ? 'completed' : ''}">
              <div class="stepper-circle">
                ${this.currentStep > s.num ? `
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ` : s.num}
              </div>
              <span class="stepper-title">${s.title}</span>
            </div>
          `).join('')}
        </div>

        <div class="modal-body wizard-body" id="wizardBodyContainer">
          <!-- Dynamic Step Content -->
        </div>

        <div class="modal-footer flex justify-between items-center">
          <div>
            ${this.currentStep > 1 ? `
              <button class="btn btn-secondary" id="btnPrevStep">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Quay lại
              </button>
            ` : '<span></span>'}
          </div>

          <div class="flex gap-2">
            <button class="btn btn-secondary" id="btnCancelWizard">Hủy bỏ</button>
            ${this.currentStep < 4 ? `
              <button class="btn btn-primary" id="btnNextStep">
                Tiếp tục
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            ` : `
              <button class="btn btn-success btn-pulse" id="btnSubmitHandover">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                Xác Nhận & Thực Hiện Chuyển Giao
              </button>
            `}
          </div>
        </div>
      </div>
    `;

    // Event listeners
    document.getElementById('btnCloseWizard')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnCancelWizard')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btnPrevStep')?.addEventListener('click', () => this.goToStep(this.currentStep - 1));
    document.getElementById('btnNextStep')?.addEventListener('click', () => this.goToStep(this.currentStep + 1));
    document.getElementById('btnSubmitHandover')?.addEventListener('click', () => this.submitHandover());

    this.renderCurrentStepContent();
  }

  renderCurrentStepContent() {
    const container = document.getElementById('wizardBodyContainer');
    if (!container) return;

    if (this.currentStep === 1) {
      this.renderStep1(container);
    } else if (this.currentStep === 2) {
      this.renderStep2Content();
    } else if (this.currentStep === 3) {
      this.renderStep3(container);
    } else if (this.currentStep === 4) {
      this.renderStep4(container);
    }
  }

  // --- STEP 1: CHỌN NHÂN VIÊN CHUYỂN ĐI ---
  renderStep1(container) {
    const employees = store.getEmployees().filter(e => e.role === 'SALES_REP');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="alert alert-info flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <div>
            <strong>Bước 1: Chọn nhân sự cần bàn giao địa bàn</strong>
            <p class="text-xs text-slate-500">Hệ thống đánh dấu nổi bật các nhân sự có trạng thái "Sắp nghỉ việc" cần chuyển giao gấp.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${employees.map(emp => {
            const agencies = store.getAgencies().filter(a => a.assignedSalesId === emp.id);
            const totalRev = agencies.reduce((s, a) => s + (a.monthlyRevenue || 0), 0);
            const isSelected = this.wizardState.fromEmployeeId === emp.id;
            const isResigning = emp.status === 'RESIGNING';

            return `
              <div class="card-select-emp ${isSelected ? 'selected' : ''} ${isResigning ? 'border-amber-400 bg-amber-50/30' : ''}" data-emp-id="${emp.id}">
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <img src="${emp.avatar}" alt="${emp.name}" class="avatar-md">
                    <div>
                      <div class="flex items-center gap-2">
                        <h4 class="font-bold text-slate-800">${emp.name}</h4>
                        ${isResigning ? '<span class="badge badge-warning text-2xs animate-pulse">⚠️ Sắp nghỉ việc</span>' : ''}
                      </div>
                      <p class="text-xs text-slate-500">${emp.code} • ${emp.roleTitle}</p>
                      <p class="text-xs text-slate-600 font-medium mt-1">Khu vực: ${emp.region}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="badge badge-primary font-bold">${agencies.length} đại lý</span>
                  </div>
                </div>

                <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>Doanh số đang quản lý:</span>
                  <span class="font-bold text-indigo-600">${(totalRev / 1000000000).toFixed(2)} tỷ/tháng</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Handle clicks
    container.querySelectorAll('.card-select-emp').forEach(card => {
      card.addEventListener('click', () => {
        const empId = card.getAttribute('data-emp-id');
        this.selectFromEmployee(empId);
        this.renderStep1(container);
      });
    });
  }

  // --- STEP 2: CHỌN ĐẠI LÝ BÀN GIAO ---
  renderStep2Content() {
    const container = document.getElementById('wizardBodyContainer');
    if (!container) return;

    const fromId = this.wizardState.fromEmployeeId;
    const fromEmp = store.getEmployeeById(fromId);
    const agencies = store.getAgencies().filter(a => a.assignedSalesId === fromId);
    const selectedCount = this.wizardState.selectedAgencyIds.size;
    const allSelected = agencies.length > 0 && selectedCount === agencies.length;

    const selectedRevenue = agencies
      .filter(a => this.wizardState.selectedAgencyIds.has(a.id))
      .reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0);

    const selectedDebt = agencies
      .filter(a => this.wizardState.selectedAgencyIds.has(a.id))
      .reduce((sum, a) => sum + (a.debtBalance || 0), 0);

    container.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div class="flex items-center gap-3">
            <img src="${fromEmp?.avatar}" class="avatar-sm">
            <div>
              <span class="text-xs text-slate-500">Đang bàn giao từ nhân sự:</span>
              <h4 class="font-bold text-slate-800 text-sm">${fromEmp?.name} (${fromEmp?.code})</h4>
            </div>
          </div>
          <div class="flex gap-4 text-xs">
            <div>
              <span class="text-slate-500">Đã chọn:</span>
              <strong class="text-indigo-600 ml-1">${selectedCount} / ${agencies.length} đại lý</strong>
            </div>
            <div>
              <span class="text-slate-500">Tổng doanh số chuyển:</span>
              <strong class="text-emerald-600 ml-1">${formatCurrencyVND(selectedRevenue)}/tháng</strong>
            </div>
            <div>
              <span class="text-slate-500">Dư nợ bàn giao:</span>
              <strong class="text-amber-600 ml-1">${formatCurrencyVND(selectedDebt)}</strong>
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 cursor-pointer font-medium text-sm text-slate-700">
            <input type="checkbox" id="chkSelectAllWizard" class="custom-checkbox" ${allSelected ? 'checked' : ''}>
            <span>Chọn tất cả ${agencies.length} đại lý của nhân viên này</span>
          </label>
          <span class="text-xs text-slate-500">Có thể bỏ tích chọn nếu chỉ muốn chuyển giao từng phần</span>
        </div>

        <div class="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          ${agencies.map(a => {
            const isChecked = this.wizardState.selectedAgencyIds.has(a.id);
            return `
              <div class="flex items-center justify-between p-3 rounded-lg border ${isChecked ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 bg-white'} hover:border-indigo-300 transition-all cursor-pointer card-select-agency" data-agency-id="${a.id}">
                <div class="flex items-center gap-3">
                  <input type="checkbox" class="custom-checkbox" ${isChecked ? 'checked' : ''} data-agency-id="${a.id}">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs font-bold text-indigo-600">${a.code}</span>
                      <strong class="text-sm text-slate-800">${a.name}</strong>
                      <span class="badge ${this.ui.getTierBadgeClass(a.tier)}">${a.tier}</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-0.5">${a.address} • ${a.province} (${a.region})</p>
                  </div>
                </div>

                <div class="text-right text-xs">
                  <div class="font-bold text-slate-800">${formatCurrencyVND(a.monthlyRevenue)}/tháng</div>
                  <div class="text-slate-500">Dư nợ: ${formatCurrencyVND(a.debtBalance)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Event listeners
    document.getElementById('chkSelectAllWizard')?.addEventListener('change', (e) => {
      this.toggleSelectAllAgencies(e.target.checked);
    });

    container.querySelectorAll('.card-select-agency').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.tagName !== 'INPUT') {
          const aId = item.getAttribute('data-agency-id');
          this.toggleSelectAgency(aId);
        }
      });
    });

    container.querySelectorAll('input[type="checkbox"][data-agency-id]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const aId = e.target.getAttribute('data-agency-id');
        this.toggleSelectAgency(aId);
      });
    });
  }

  // --- STEP 3: CHỌN NHÂN VIÊN TIẾP NHẬN ---
  renderStep3(container) {
    const fromId = this.wizardState.fromEmployeeId;
    const candidates = store.getEmployees().filter(e => e.role === 'SALES_REP' && e.id !== fromId && e.status !== 'RESIGNED');

    container.innerHTML = `
      <div class="space-y-4">
        <div class="alert alert-info flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 3 21 3 21 8"></polyline>
            <line x1="4" y1="20" x2="21" y2="3"></line>
            <polyline points="21 16 21 21 16 21"></polyline>
            <line x1="15" y1="15" x2="21" y2="21"></line>
            <line x1="4" y1="4" x2="9" y2="9"></line>
          </svg>
          <div>
            <strong>Bước 3: Chọn nhân viên kinh doanh tiếp nhận địa bàn</strong>
            <p class="text-xs text-slate-500">Hệ thống phân tích tải công việc hiện tại giúp Quản lý chọn nhân sự phù hợp nhất.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${candidates.map(emp => {
            const currentAgencies = store.getAgencies().filter(a => a.assignedSalesId === emp.id);
            const isSelected = this.wizardState.toEmployeeId === emp.id;
            const newTotalCount = currentAgencies.length + this.wizardState.selectedAgencyIds.size;

            return `
              <div class="card-select-emp ${isSelected ? 'selected' : ''}" data-to-emp-id="${emp.id}">
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-3">
                    <img src="${emp.avatar}" alt="${emp.name}" class="avatar-md">
                    <div>
                      <h4 class="font-bold text-slate-800">${emp.name}</h4>
                      <p class="text-xs text-slate-500">${emp.code} • ${emp.roleTitle}</p>
                      <p class="text-xs text-slate-600 font-medium mt-1">Khu vực chính: ${emp.region}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <span class="badge ${currentAgencies.length >= 7 ? 'badge-warning' : 'badge-success'}">
                      Hiện tại: ${currentAgencies.length} ĐL
                    </span>
                  </div>
                </div>

                <div class="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span class="text-slate-500">Tải công việc sau khi nhận:</span>
                  <strong class="text-indigo-600 font-bold">${newTotalCount} đại lý</strong>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // Handle clicks
    container.querySelectorAll('.card-select-emp').forEach(card => {
      card.addEventListener('click', () => {
        const empId = card.getAttribute('data-to-emp-id');
        this.wizardState.toEmployeeId = empId;
        this.renderStep3(container);
      });
    });
  }

  // --- STEP 4: XÁC NHẬN & BIÊN BẢN ---
  renderStep4(container) {
    const fromEmp = store.getEmployeeById(this.wizardState.fromEmployeeId);
    const toEmp = store.getEmployeeById(this.wizardState.toEmployeeId);
    const selectedAgencies = store.getAgencies().filter(a => this.wizardState.selectedAgencyIds.has(a.id));
    const totalRevenue = selectedAgencies.reduce((s, a) => s + (a.monthlyRevenue || 0), 0);
    const totalDebt = selectedAgencies.reduce((s, a) => s + (a.debtBalance || 0), 0);

    container.innerHTML = `
      <div class="space-y-4">
        <!-- Tóm tắt luồng chuyển giao -->
        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${fromEmp?.avatar}" class="avatar-md ring-2 ring-rose-400">
            <div>
              <span class="text-2xs uppercase tracking-wider text-rose-500 font-bold">Người bàn giao (Bên A)</span>
              <h4 class="font-bold text-slate-800 text-sm">${fromEmp?.name}</h4>
              <p class="text-xs text-slate-500">${fromEmp?.roleTitle}</p>
            </div>
          </div>

          <div class="text-center px-4">
            <div class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm border border-indigo-200 text-indigo-600 font-bold text-lg animate-pulse">
              ➔
            </div>
            <p class="text-xs font-bold text-indigo-600 mt-1">${selectedAgencies.length} Đại lý</p>
          </div>

          <div class="flex items-center gap-3 text-right">
            <div>
              <span class="text-2xs uppercase tracking-wider text-emerald-500 font-bold">Người tiếp nhận (Bên B)</span>
              <h4 class="font-bold text-slate-800 text-sm">${toEmp?.name}</h4>
              <p class="text-xs text-slate-500">${toEmp?.roleTitle}</p>
            </div>
            <img src="${toEmp?.avatar}" class="avatar-md ring-2 ring-emerald-400">
          </div>
        </div>

        <!-- Form nhập thông tin biên bản -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="form-group">
            <label class="form-label font-bold text-slate-700">Lý do bàn giao / Điều chuyển <span class="text-rose-500">*</span></label>
            <select class="form-select" id="inpHandoverReason">
              <option value="RESIGNATION" selected>Nhân viên thôi việc / Nghỉ việc</option>
              <option value="RESTRUCTURING">Tái cấu trúc & Phân bổ lại địa bàn</option>
              <option value="INTERNAL_TRANSFER">Điều chuyển vị trí / Chi nhánh nội bộ</option>
              <option value="TEMPORARY_LEAVE">Nghỉ chế độ / Thai sản / Tạm nghỉ</option>
              <option value="OTHER">Lý do khác theo quyết định Ban Giám Đốc</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-slate-700">Ngày có hiệu lực chuyển giao <span class="text-rose-500">*</span></label>
            <input type="date" class="form-input" id="inpHandoverDate" value="${this.wizardState.effectiveDate}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-slate-700">Ghi chú bàn giao & Cam kết trách nhiệm</label>
          <textarea class="form-textarea" id="inpHandoverNotes" rows="2" placeholder="Ghi chú về công nợ, hồ sơ hợp đồng, tồn kho ký gửi...">${this.wizardState.notes}</textarea>
        </div>

        <!-- Tóm tắt số liệu -->
        <div class="grid grid-cols-3 gap-3 text-center bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <div>
            <span class="text-slate-500">Số đại lý chuyển giao:</span>
            <div class="text-base font-bold text-slate-800">${selectedAgencies.length} đại lý</div>
          </div>
          <div>
            <span class="text-slate-500">Tổng doanh số bình quân:</span>
            <div class="text-base font-bold text-emerald-600">${formatCurrencyVND(totalRevenue)}/tháng</div>
          </div>
          <div>
            <span class="text-slate-500">Dư nợ tín dụng bàn giao:</span>
            <div class="text-base font-bold text-amber-600">${formatCurrencyVND(totalDebt)}</div>
          </div>
        </div>
      </div>
    `;

    // Bind inputs
    document.getElementById('inpHandoverReason')?.addEventListener('change', (e) => {
      this.wizardState.reason = e.target.value;
      this.wizardState.reasonText = e.target.options[e.target.selectedIndex].text;
    });

    document.getElementById('inpHandoverDate')?.addEventListener('change', (e) => {
      this.wizardState.effectiveDate = e.target.value;
    });

    document.getElementById('inpHandoverNotes')?.addEventListener('input', (e) => {
      this.wizardState.notes = e.target.value;
    });
  }

  // --- MODAL XEM & IN BIÊN BẢN BÀN GIAO CHUẨN DOANH NGHIỆP ---
  openHandoverDocumentModal(handoverId) {
    const ho = store.getHandovers().find(h => h.id === handoverId);
    if (!ho) return;

    let docModal = document.getElementById('handoverDocumentModal');
    if (!docModal) {
      docModal = document.createElement('div');
      docModal.id = 'handoverDocumentModal';
      docModal.className = 'modal-backdrop';
      document.body.appendChild(docModal);
    }

    docModal.classList.add('active');

    docModal.innerHTML = `
      <div class="modal-dialog modal-xl animate-scale-in">
        <div class="modal-header no-print">
          <div class="flex items-center gap-3">
            <div class="icon-bubble icon-bubble-success">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <h3 class="modal-title">Biên Bản Bàn Giao Địa Bàn Kinh Doanh</h3>
              <p class="modal-subtitle">Mã chứng từ: <span class="font-mono font-bold text-indigo-600">${ho.code}</span> (Có giá trị pháp lý nội bộ)</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button class="btn btn-primary" id="btnPrintHandoverDoc">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              In / Xuất PDF Biên Bản
            </button>
            <button class="btn-icon-close" id="btnCloseHandoverDoc">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="modal-body p-8 print-document-container">
          <!-- Văn bản mẫu hành chính doanh nghiệp -->
          <div class="print-sheet bg-white p-8 rounded-lg shadow-sm border border-slate-200">
            <div class="text-center border-b pb-4 mb-6">
              <p class="text-xs uppercase tracking-widest text-slate-500 font-semibold">TẬP ĐOÀN THƯƠNG MẠI & PHÂN PHỐI DISTRICARE VIỆT NAM</p>
              <h2 class="text-xl font-bold uppercase text-slate-900 mt-2">BIÊN BẢN BÀN GIAO ĐỊA BÀN & QUẢN LÝ ĐẠI LÝ</h2>
              <p class="text-xs italic text-slate-600 mt-1">Số: ${ho.code} / BB-BGDB / 2026</p>
              <p class="text-xs text-slate-500 mt-1">Hôm nay, ngày ${new Date(ho.timestamp).toLocaleDateString('vi-VN')}, tại Văn phòng Khối Kinh Doanh, chúng tôi gồm có:</p>
            </div>

            <!-- Thành phần tham gia -->
            <div class="grid grid-cols-2 gap-6 mb-6 text-sm">
              <div class="p-3 bg-slate-50 rounded border border-slate-200">
                <strong class="text-indigo-900 block mb-1">1. BÊN GIAO (BÊN A):</strong>
                <p>• Ông/Bà: <strong>${ho.fromEmployeeName}</strong></p>
                <p>• Chức vụ: ${ho.fromEmployeeRole || 'Chuyên viên kinh doanh'}</p>
                <p>• Lý do bàn giao: <span class="text-rose-600 font-medium">${ho.reasonText || 'Thôi việc / Nghỉ việc'}</span></p>
              </div>

              <div class="p-3 bg-slate-50 rounded border border-slate-200">
                <strong class="text-emerald-900 block mb-1">2. BÊN NHẬN (BÊN B):</strong>
                <p>• Ông/Bà: <strong>${ho.toEmployeeName}</strong></p>
                <p>• Chức vụ: ${ho.toEmployeeRole || 'Chuyên viên kinh doanh'}</p>
                <p>• Ngày bắt đầu tiếp nhận: <strong>${new Date(ho.effectiveDate).toLocaleDateString('vi-VN')}</strong></p>
              </div>
            </div>

            <div class="mb-4 text-sm">
              <strong class="text-slate-800">3. ĐẠI DIỆN PHÊ DUYỆT (BÊN C - QUẢN LÝ):</strong>
              <p class="mt-1">• Ông/Bà: <strong>${ho.transferredByName}</strong> - Giám Đốc / Quản Lý Kinh Doanh Khối</p>
            </div>

            <!-- Bảng danh mục đại lý -->
            <div class="mb-6">
              <strong class="text-slate-800 text-sm block mb-2">4. DANH MỤC ĐẠI LÝ & TÌNH HÌNH DOANH SỐ / CÔNG NỢ BÀN GIAO (${ho.agenciesSummary?.length || 0} đại lý):</strong>
              <table class="w-full text-xs border-collapse border border-slate-300">
                <thead>
                  <tr class="bg-slate-100 text-slate-700">
                    <th class="border border-slate-300 p-2 text-center w-10">STT</th>
                    <th class="border border-slate-300 p-2 text-left">Mã ĐL</th>
                    <th class="border border-slate-300 p-2 text-left">Tên Đại Lý</th>
                    <th class="border border-slate-300 p-2 text-left">Địa Bàn / Tỉnh</th>
                    <th class="border border-slate-300 p-2 text-center">Hạng</th>
                    <th class="border border-slate-300 p-2 text-right">Doanh Số TB/Tháng</th>
                    <th class="border border-slate-300 p-2 text-right">Dư Nợ Công Nợ</th>
                  </tr>
                </thead>
                <tbody>
                  ${(ho.agenciesSummary || []).map((a, idx) => `
                    <tr>
                      <td class="border border-slate-300 p-2 text-center">${idx + 1}</td>
                      <td class="border border-slate-300 p-2 font-mono font-bold">${a.code}</td>
                      <td class="border border-slate-300 p-2 font-medium">${a.name}</td>
                      <td class="border border-slate-300 p-2">${a.province || a.region}</td>
                      <td class="border border-slate-300 p-2 text-center">${a.tier || '-'}</td>
                      <td class="border border-slate-300 p-2 text-right font-semibold">${formatCurrencyVND(a.monthlyRevenue)}</td>
                      <td class="border border-slate-300 p-2 text-right">${formatCurrencyVND(a.debtBalance)}</td>
                    </tr>
                  `).join('')}
                </tbody>
                <tfoot>
                  <tr class="bg-slate-50 font-bold">
                    <td colspan="5" class="border border-slate-300 p-2 text-right">TỔNG CỘNG:</td>
                    <td class="border border-slate-300 p-2 text-right text-emerald-700">${formatCurrencyVND(ho.totalRevenue)}</td>
                    <td class="border border-slate-300 p-2 text-right text-amber-700">${formatCurrencyVND(ho.totalDebt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <!-- Cam kết -->
            <div class="text-xs text-slate-700 mb-8 space-y-1">
              <strong class="text-sm text-slate-800 block mb-1">5. NỘI DUNG CAM KẾT & GHI CHÚ BÀN GIAO:</strong>
              <p>• Bên A đã chuyển giao đầy đủ: Hồ sơ đại lý, hợp đồng nguyên tắc, lịch sử giao dịch và danh bạ liên hệ.</p>
              <p>• Bên B cam kết tiếp nhận chăm sóc định kỳ, chịu trách nhiệm theo dõi đôn đốc công nợ kể từ ngày hiệu lực.</p>
              <p>• Ghi chú bổ sung: <em>${ho.notes || 'Không có'}</em></p>
            </div>

            <!-- Chữ ký 3 bên -->
            <div class="grid grid-cols-3 text-center text-xs mt-12 pt-4">
              <div>
                <strong>BÊN GIAO (BÊN A)</strong>
                <p class="text-slate-400 italic text-2xs mt-1">(Ký, ghi rõ họ tên)</p>
                <div class="h-16 flex items-center justify-center font-cursive text-indigo-800 text-lg">
                  ${ho.fromEmployeeName}
                </div>
                <strong>${ho.fromEmployeeName}</strong>
              </div>

              <div>
                <strong>BÊN NHẬN (BÊN B)</strong>
                <p class="text-slate-400 italic text-2xs mt-1">(Ký, ghi rõ họ tên)</p>
                <div class="h-16 flex items-center justify-center font-cursive text-emerald-800 text-lg">
                  ${ho.toEmployeeName}
                </div>
                <strong>${ho.toEmployeeName}</strong>
              </div>

              <div>
                <strong>ĐẠI DIỆN PHÊ DUYỆT (BÊN C)</strong>
                <p class="text-slate-400 italic text-2xs mt-1">(Ký duyệt, đóng dấu)</p>
                <div class="h-16 flex items-center justify-center font-cursive text-slate-800 text-lg">
                  ${ho.transferredByName}
                </div>
                <strong>${ho.transferredByName}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btnCloseHandoverDoc')?.addEventListener('click', () => {
      docModal.classList.remove('active');
    });

    document.getElementById('btnPrintHandoverDoc')?.addEventListener('click', () => {
      window.print();
    });
  }
}
