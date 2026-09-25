/**
 * User Management Application Frontend
 * Sprint 1: SCRUM-62 (Tài khoản, Phân quyền)
 */

// Application State
const state = {
  currentPage: 1,
  pageSize: 20, // Default 20 items per page (AC1)
  totalPages: 1,
  totalRecords: 0,
  searchTerm: "",
  selectedRole: "",
  selectedStatus: "",
  users: [],
  debounceTimer: null,
};

// DOM Elements
const elements = {
  // Table & Containers
  usersTableBody: document.getElementById("users-table-body"),
  loadingSpinner: document.getElementById("loading-spinner"),
  emptyState: document.getElementById("empty-state"),
  usersTable: document.getElementById("users-table"),
  toastContainer: document.getElementById("toast-container"),

  // Search & Filters
  searchInput: document.getElementById("search-input"),
  btnClearSearch: document.getElementById("btn-clear-search"),
  filterRole: document.getElementById("filter-role"),
  filterStatus: document.getElementById("filter-status"),
  btnResetFilters: document.getElementById("btn-reset-filters"),
  btnEmptyReset: document.getElementById("btn-empty-reset"),

  // Pagination
  paginationInfo: document.getElementById("pagination-info"),
  showingStart: document.getElementById("showing-start"),
  showingEnd: document.getElementById("showing-end"),
  totalRecords: document.getElementById("total-records"),
  btnPrevPage: document.getElementById("btn-prev-page"),
  btnNextPage: document.getElementById("btn-next-page"),
  pageNumbers: document.getElementById("page-numbers"),

  // Modals
  btnOpenCreateModal: document.getElementById("btn-open-create-modal"),
  modalCreate: document.getElementById("modal-create"),
  formCreateUser: document.getElementById("form-create-user"),
  modalEdit: document.getElementById("modal-edit"),
  formEditUser: document.getElementById("form-edit-user"),
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconSvg =
    type === "success"
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : type === "warning"
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;

  toast.innerHTML = `
    ${iconSvg}
    <div style="flex: 1;">${message}</div>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease-out";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ==========================================
// API CALLS
// ==========================================
async function fetchUsers() {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      page: state.currentPage,
      page_size: state.pageSize,
    });

    if (state.searchTerm.trim()) {
      params.append("search", state.searchTerm.trim());
    }
    if (state.selectedRole) {
      params.append("role", state.selectedRole);
    }
    if (state.selectedStatus) {
      params.append("status", state.selectedStatus);
    }

    const response = await fetch(`/api/v1/users?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Không thể tải danh sách tài khoản, vui lòng thử lại sau.");
    }

    const data = await response.json();
    state.users = data.items;
    state.totalRecords = data.total;
    state.totalPages = data.total_pages;

    renderUsersTable();
    renderPagination();
  } catch (err) {
    showToast(err.message || "Lỗi khi tải dữ liệu", "error");
  } finally {
    setLoading(false);
  }
}

async function handleCreateUser(formData) {
  clearFieldErrors("create");
  const submitBtn = document.getElementById("btn-submit-create");
  submitBtn.disabled = true;

  try {
    const response = await fetch("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (response.status === 409 || (result.detail && result.detail.field_errors)) {
      // AC1: Từ chối tài khoản trùng kèm thông báo cụ thể dưới từng field
      const fieldErrors = result.detail.field_errors;
      displayFieldErrors("create", fieldErrors);
      showToast("Thông tin tài khoản bị trùng lặp, vui lòng kiểm tra lại!", "warning");
      return;
    }

    if (!response.ok) {
      const errMsg = typeof result.detail === "string" ? result.detail : "Lỗi khi tạo tài khoản";
      showToast(errMsg, "error");
      return;
    }

    // AC2 & AC3 & AC4: Thông báo thành công
    if (result.email_sent) {
      showToast(result.message, "success");
    } else {
      showToast(result.message, "warning");
    }

    closeModal("modal-create");
    elements.formCreateUser.reset();
    state.currentPage = 1; // Nhảy về trang đầu để thấy user mới
    fetchUsers();
  } catch (err) {
    showToast("Lỗi kết nối máy chủ", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleUpdateUser(userId, formData) {
  clearFieldErrors("edit");
  const submitBtn = document.getElementById("btn-submit-edit");
  submitBtn.disabled = true;

  try {
    const response = await fetch(`/api/v1/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (response.status === 409 || (result.detail && result.detail.field_errors)) {
      const fieldErrors = result.detail.field_errors;
      displayFieldErrors("edit", fieldErrors);
      showToast("Email hoặc Số điện thoại bị trùng với tài khoản khác!", "warning");
      return;
    }

    if (!response.ok) {
      const errMsg = typeof result.detail === "string" ? result.detail : "Lỗi khi cập nhật tài khoản";
      showToast(errMsg, "error");
      return;
    }

    showToast("Cập nhật thông tin tài khoản thành công!", "success");
    closeModal("modal-edit");
    fetchUsers();
  } catch (err) {
    showToast("Lỗi kết nối máy chủ", "error");
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleResendActivation(userId, username) {
  try {
    showToast(`Đang gửi lại email kích hoạt cho ${username}...`, "warning");
    const response = await fetch(`/api/v1/users/${userId}/resend-activation`, {
      method: "POST",
    });

    const result = await response.json();
    if (response.ok && result.email_sent) {
      showToast(result.message, "success");
      fetchUsers();
    } else {
      showToast(result.message || "Gửi email thất bại", "error");
    }
  } catch (err) {
    showToast("Lỗi khi kết nối dịch vụ gửi email", "error");
  }
}

async function openEditUserModal(userId) {
  clearFieldErrors("edit");
  try {
    const response = await fetch(`/api/v1/users/${userId}`);
    if (!response.ok) throw new Error("Không thể tải thông tin tài khoản");

    const user = await response.json();

    // Điền dữ liệu vào form (US-003 AC1)
    document.getElementById("edit-user-id").value = user.id;
    document.getElementById("edit-username").value = user.username; // Read-only (US-003 AC2)
    document.getElementById("edit-fullname").value = user.full_name;
    document.getElementById("edit-email").value = user.email;
    document.getElementById("edit-phone").value = user.phone;
    document.getElementById("edit-role").value = user.role_code;
    document.getElementById("edit-status").value = user.status;

    openModal("modal-edit");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ==========================================
// DOM RENDERING
// ==========================================
function renderUsersTable() {
  elements.usersTableBody.innerHTML = "";

  if (state.totalRecords === 0) {
    // AC5: Empty State
    elements.usersTable.classList.add("hidden");
    elements.emptyState.classList.remove("hidden");
    return;
  }

  elements.usersTable.classList.remove("hidden");
  elements.emptyState.classList.add("hidden");

  const startIdx = (state.currentPage - 1) * state.pageSize;

  state.users.forEach((user, index) => {
    const tr = document.createElement("tr");

    // Status Badge
    let statusClass = "badge-pending";
    if (user.status === "ACTIVE") statusClass = "badge-active";
    if (user.status === "LOCKED") statusClass = "badge-locked";

    // Role Badge
    let roleClass = "badge-role-sales";
    if (user.role_code === "ADMIN") roleClass = "badge-role-admin";
    if (user.role_code === "SALES_MANAGER") roleClass = "badge-role-manager";
    if (user.role_code === "WAREHOUSE") roleClass = "badge-role-warehouse";

    // Email status indicator
    const emailStatusHint = user.email_sent
      ? `<span title="Đã gửi email kích hoạt" style="color: #10b981; margin-left: 4px;">✓</span>`
      : `<span title="Chưa gửi được email kích hoạt" style="color: #ef4444; margin-left: 4px;">⚠</span>`;

    tr.innerHTML = `
      <td>${startIdx + index + 1}</td>
      <td>
        <div class="user-cell">
          <span class="user-fullname">${escapeHtml(user.full_name)}</span>
        </div>
      </td>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.email)} ${emailStatusHint}</td>
      <td>${escapeHtml(user.phone)}</td>
      <td><span class="badge ${roleClass}">${escapeHtml(user.role_name || user.role_code)}</span></td>
      <td><span class="badge ${statusClass}">${escapeHtml(user.status_name || user.status)}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn-action btn-edit" data-id="${user.id}" title="Chỉnh sửa tài khoản">
            Sửa
          </button>
          ${
            !user.email_sent || user.status === "PENDING_ACTIVATION"
              ? `<button class="btn-action btn-action-resend btn-resend" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Gửi lại email kích hoạt">
                  Gửi mail
                </button>`
              : ""
          }
        </div>
      </td>
    `;

    elements.usersTableBody.appendChild(tr);
  });

  // Attach button events
  document.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", () => openEditUserModal(btn.dataset.id));
  });

  document.querySelectorAll(".btn-resend").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleResendActivation(btn.dataset.id, btn.dataset.username)
    );
  });
}

function renderPagination() {
  const start = state.totalRecords === 0 ? 0 : (state.currentPage - 1) * state.pageSize + 1;
  const end = Math.min(state.currentPage * state.pageSize, state.totalRecords);

  elements.showingStart.textContent = start;
  elements.showingEnd.textContent = end;
  elements.totalRecords.textContent = state.totalRecords;

  elements.btnPrevPage.disabled = state.currentPage <= 1;
  elements.btnNextPage.disabled = state.currentPage >= state.totalPages;

  // Render Page Numbers
  elements.pageNumbers.innerHTML = "";
  for (let i = 1; i <= state.totalPages; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.className = `page-num ${i === state.currentPage ? "active" : ""}`;
    pageBtn.textContent = i;
    pageBtn.addEventListener("click", () => {
      if (state.currentPage !== i) {
        state.currentPage = i;
        fetchUsers();
      }
    });
    elements.pageNumbers.appendChild(pageBtn);
  }
}

// ==========================================
// ERROR HANDLING UNDER INPUT FIELDS (AC1)
// ==========================================
function displayFieldErrors(prefix, fieldErrors) {
  for (const [field, message] of Object.entries(fieldErrors)) {
    let inputId = `${prefix}-${field}`;
    if (field === "full_name") inputId = `${prefix}-fullname`;

    const inputEl = document.getElementById(inputId);
    const errorEl = document.getElementById(`error-${prefix}-${field === "full_name" ? "fullname" : field}`);

    if (inputEl) {
      inputEl.classList.add("is-invalid");
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("visible");
    }
  }
}

function clearFieldErrors(prefix) {
  const fields = ["fullname", "username", "email", "phone"];
  fields.forEach((f) => {
    const inputEl = document.getElementById(`${prefix}-${f}`);
    const errorEl = document.getElementById(`error-${prefix}-${f}`);
    if (inputEl) inputEl.classList.remove("is-invalid");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.classList.remove("visible");
    }
  });
}

// ==========================================
// MODAL CONTROLS
// ==========================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("hidden");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("hidden");
}

function setLoading(isLoading) {
  if (isLoading) {
    elements.loadingSpinner.classList.remove("hidden");
  } else {
    elements.loadingSpinner.classList.add("hidden");
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initEvents() {
  // Search Input with Debounce (AC2)
  elements.searchInput.addEventListener("input", (e) => {
    const val = e.target.value;
    state.searchTerm = val;
    elements.btnClearSearch.classList.toggle("hidden", !val);

    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(() => {
      state.currentPage = 1;
      fetchUsers();
    }, 300);
  });

  // Clear Search
  elements.btnClearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.searchTerm = "";
    elements.btnClearSearch.classList.add("hidden");
    state.currentPage = 1;
    fetchUsers();
  });

  // Filter Role (AC3)
  elements.filterRole.addEventListener("change", (e) => {
    state.selectedRole = e.target.value;
    state.currentPage = 1;
    fetchUsers();
  });

  // Filter Status (AC3)
  elements.filterStatus.addEventListener("change", (e) => {
    state.selectedStatus = e.target.value;
    state.currentPage = 1;
    fetchUsers();
  });

  // Reset Filters
  function resetAllFilters() {
    elements.searchInput.value = "";
    elements.btnClearSearch.classList.add("hidden");
    elements.filterRole.value = "";
    elements.filterStatus.value = "";
    state.searchTerm = "";
    state.selectedRole = "";
    state.selectedStatus = "";
    state.currentPage = 1;
    fetchUsers();
  }

  elements.btnResetFilters.addEventListener("click", resetAllFilters);
  elements.btnEmptyReset.addEventListener("click", resetAllFilters);

  // Pagination Prev/Next (AC1)
  elements.btnPrevPage.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      fetchUsers();
    }
  });

  elements.btnNextPage.addEventListener("click", () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      fetchUsers();
    }
  });

  // Modal Open/Close
  elements.btnOpenCreateModal.addEventListener("click", () => {
    clearFieldErrors("create");
    elements.formCreateUser.reset();
    openModal("modal-create");
  });

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeModal(btn.dataset.close);
    });
  });

  // Close modal on backdrop click
  [elements.modalCreate, elements.modalEdit].forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal.id);
    });
  });

  // Form Submit: Create User (US-002)
  elements.formCreateUser.addEventListener("submit", (e) => {
    e.preventDefault();
    const formData = {
      full_name: document.getElementById("create-fullname").value.trim(),
      username: document.getElementById("create-username").value.trim(),
      email: document.getElementById("create-email").value.trim(),
      phone: document.getElementById("create-phone").value.trim(),
      role_code: document.getElementById("create-role").value,
      status: document.getElementById("create-status").value,
    };
    handleCreateUser(formData);
  });

  // Form Submit: Edit User (US-003)
  elements.formEditUser.addEventListener("submit", (e) => {
    e.preventDefault();
    const userId = document.getElementById("edit-user-id").value;
    const formData = {
      full_name: document.getElementById("edit-fullname").value.trim(),
      email: document.getElementById("edit-email").value.trim(),
      phone: document.getElementById("edit-phone").value.trim(),
      role_code: document.getElementById("edit-role").value,
      status: document.getElementById("edit-status").value,
    };
    handleUpdateUser(userId, formData);
  });
}

// Initial Boot
document.addEventListener("DOMContentLoaded", () => {
  initEvents();
  fetchUsers();
});
