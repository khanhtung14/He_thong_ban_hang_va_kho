import React, { useCallback, useEffect, useState } from "react";
import { Pagination } from "./components/Pagination";
import { Toast } from "./components/Toast";
import { UserFilter } from "./components/UserFilter";
import { UserModal } from "./components/UserModal";
import { UserTable } from "./components/UserTable";
import { fetchUsersApi, toggleUserStatusApi } from "./services/usersApi";
import { FilterParams, ToastMessage, User } from "./types/user";

const userManagementStyles = `
  /* Reset and base */
  * { box-sizing: border-box; }
  body {
    min-width: 320px;
    min-height: 100vh;
    margin: 0;
    background: #f8fafc;
    color: #1f2937;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  /* Layout */
  .app-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .app-header {
    background: #ffffff;
    border-bottom: 1px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 40;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
  }

  .header-inner {
    max-width: 1360px;
    margin: 0 auto;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .header-brand-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-logo {
    width: 38px;
    height: 38px;
    background: #2563eb;
    color: #ffffff;
    border-radius: 10px;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 18px;
    box-shadow: 0 4px 10px rgb(37 99 235 / 25%);
  }

  .header-title-block h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: #111827;
    line-height: 1.25;
  }

  .header-title-block p {
    margin: 2px 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .header-nav {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .admin-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: #eff6ff;
    color: #1d4ed8;
    border: 1px solid #bfdbfe;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
  }

  .admin-badge::before {
    content: "";
    width: 7px;
    height: 7px;
    background: #2563eb;
    border-radius: 50%;
  }

  .header-link {
    color: #4b5563;
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    padding: 6px 10px;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
  }

  .header-link:hover {
    color: #111827;
    background: #f3f4f6;
  }

  /* Main content area */
  .main-content {
    flex: 1;
    max-width: 1360px;
    width: 100%;
    margin: 0 auto;
    padding: 24px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Page title & action bar */
  .page-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .page-title-wrap h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #111827;
    letter-spacing: -0.01em;
  }

  .page-title-wrap p {
    margin: 4px 0 0;
    font-size: 14px;
    color: #4b5563;
  }

  .btn-create-user {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: #2563eb;
    color: #ffffff;
    border: 0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgb(37 99 235 / 20%);
    transition: background 0.15s, transform 0.05s;
  }

  .btn-create-user:hover {
    background: #1d4ed8;
  }

  .btn-create-user:active {
    transform: translateY(1px);
  }

  /* Filter card */
  .filter-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px 20px;
    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04);
  }

  .filter-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .filter-search-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 340px;
  }

  .search-input-wrap {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    width: 18px;
    height: 18px;
    color: #9ca3af;
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 42px;
    padding: 0 34px 0 38px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: #ffffff;
    color: #111827;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .search-input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgb(191 219 254 / 60%);
  }

  .clear-search-btn {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
  }

  .clear-search-btn:hover {
    color: #4b5563;
  }

  .filter-btn {
    height: 42px;
    padding: 0 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s, border-color 0.15s;
  }

  .btn-search {
    background: #1e293b;
    color: #ffffff;
  }

  .btn-search:hover:not(:disabled) {
    background: #0f172a;
  }

  .btn-search:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .filter-selects-group {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .filter-control {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-label {
    font-size: 13px;
    font-weight: 600;
    color: #4b5563;
    white-space: nowrap;
  }

  .filter-select {
    height: 42px;
    padding: 0 32px 0 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 13.5px;
    color: #111827;
    background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 8px center/16px;
    appearance: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .filter-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgb(191 219 254 / 60%);
  }

  .btn-clear {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #f3f4f6;
    color: #4b5563;
    border-color: #e5e7eb;
  }

  .btn-clear:hover:not(:disabled) {
    background: #e5e7eb;
    color: #1f2937;
  }

  /* Table Card */
  .table-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.05);
    overflow: hidden;
  }

  .table-responsive-container {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .user-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
    text-align: left;
    white-space: nowrap;
  }

  .user-table th {
    background: #f8fafc;
    color: #4b5563;
    font-weight: 600;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    text-transform: uppercase;
    font-size: 11.5px;
    letter-spacing: 0.04em;
  }

  .user-table td {
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
    color: #1f2937;
    vertical-align: middle;
  }

  .user-table tr:last-child td {
    border-bottom: 0;
  }

  .user-table tbody tr:hover {
    background: #f8fafc;
  }

  .user-table tbody tr.row-locked {
    background: #fef2f2;
  }

  .col-stt {
    width: 50px;
    text-align: center;
  }

  .col-status {
    width: 130px;
  }

  .col-actions {
    width: 160px;
    text-align: right;
  }

  .text-muted {
    color: #6b7280;
  }

  .font-semibold {
    font-weight: 600;
  }

  .text-primary {
    color: #2563eb;
  }

  .email-link {
    color: inherit;
    text-decoration: none;
  }

  .email-link:hover {
    color: #2563eb;
    text-decoration: underline;
  }

  /* Status Badges */
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
  }

  .status-badge::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .badge-active {
    background: #dcfce7;
    color: #15803d;
  }
  .badge-active::before { background: #22c55e; }

  .badge-locked {
    background: #fee2e2;
    color: #b91c1c;
  }
  .badge-locked::before { background: #ef4444; }

  .badge-pending {
    background: #fef3c7;
    color: #b45309;
  }
  .badge-pending::before { background: #f59e0b; }

  .badge-disabled {
    background: #f3f4f6;
    color: #4b5563;
  }
  .badge-disabled::before { background: #9ca3af; }

  /* Role Badges */
  .role-badges-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .role-badge {
    display: inline-block;
    padding: 2px 8px;
    background: #eff6ff;
    color: #1e40af;
    border: 1px solid #dbeafe;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
  }

  .role-badge-default {
    background: #f3f4f6;
    color: #6b7280;
    border-color: #e5e7eb;
  }

  /* Action buttons */
  .action-buttons-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #374151;
    transition: all 0.15s;
  }

  .btn-action:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-edit:hover:not(:disabled) {
    color: #2563eb;
    border-color: #bfdbfe;
    background: #eff6ff;
  }

  .btn-lock {
    color: #dc2626;
    border-color: #fecaca;
  }

  .btn-lock:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #f87171;
  }

  .btn-unlock {
    color: #15803d;
    border-color: #bbf7d0;
  }

  .btn-unlock:hover:not(:disabled) {
    background: #f0fdf4;
    border-color: #86efac;
  }

  .mini-spinner {
    width: 13px;
    height: 13px;
    border: 2px solid rgb(0 0 0 / 20%);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Pagination Bar */
  .pagination-bar {
    padding: 14px 20px;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .pagination-info {
    font-size: 13.5px;
    color: #4b5563;
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .page-size-selector {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .page-size-label {
    font-size: 13px;
    color: #4b5563;
  }

  .page-size-select {
    height: 34px;
    padding: 0 24px 0 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 6px center/14px;
    appearance: none;
    cursor: pointer;
  }

  .pagination-list {
    display: flex;
    align-items: center;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .page-btn {
    min-width: 34px;
    height: 34px;
    padding: 0 8px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: all 0.15s;
  }

  .page-btn:hover:not(:disabled):not(.page-current) {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .page-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .page-current {
    background: #2563eb;
    color: #ffffff;
    border-color: #2563eb;
    font-weight: 700;
  }

  .page-ellipsis {
    padding: 0 6px;
    color: #9ca3af;
  }

  /* States: Loading, Empty, System Error */
  .state-box {
    padding: 56px 24px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .loading-spinner-lg {
    width: 38px;
    height: 38px;
    border: 3px solid #e5e7eb;
    border-top-color: #2563eb;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin-bottom: 16px;
  }

  .state-title {
    font-size: 17px;
    font-weight: 700;
    color: #111827;
    margin: 0 0 6px;
  }

  .state-desc {
    font-size: 14px;
    color: #6b7280;
    max-width: 420px;
    margin: 0 0 16px;
    line-height: 1.5;
  }

  .empty-icon {
    width: 56px;
    height: 56px;
    color: #9ca3af;
    margin-bottom: 14px;
  }

  .system-error-card {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 8px;
  }

  .system-error-body {
    display: flex;
    align-items: center;
    gap: 14px;
    color: #991b1b;
  }

  .btn-retry {
    background: #dc2626;
    color: #ffffff;
    border: 0;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-retry:hover {
    background: #b91c1c;
  }

  /* Modal Dialog */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(15 23 42 / 60%);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: grid;
    place-items: center;
    padding: 20px 16px;
    overflow-y: auto;
    animation: fadeIn 0.15s ease-out;
  }

  .modal-dialog {
    width: 100%;
    max-width: 580px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.15), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    border: 1px solid #e5e7eb;
    animation: scaleUp 0.18s ease-out;
    overflow: hidden;
  }

  .modal-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .modal-title {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    color: #111827;
  }

  .modal-subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: #6b7280;
    line-height: 1.4;
  }

  .modal-close-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #9ca3af;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .modal-close-btn:hover {
    color: #111827;
    background: #f3f4f6;
  }

  .modal-alert-error {
    margin: 16px 24px 0;
    padding: 12px 14px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #b91c1c;
    font-size: 13.5px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-form {
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-label {
    font-size: 13.5px;
    font-weight: 600;
    color: #374151;
  }

  .text-danger {
    color: #ef4444;
  }

  .form-input, .form-select {
    width: 100%;
    height: 42px;
    padding: 0 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    color: #111827;
    background: #ffffff;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .form-select {
    padding-right: 32px;
    background: #ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 8px center/16px;
    appearance: none;
  }

  .form-input:focus, .form-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgb(191 219 254 / 60%);
  }

  .form-input:disabled {
    background: #f9fafb;
    color: #6b7280;
    cursor: not-allowed;
    border-color: #e5e7eb;
  }

  .input-error {
    border-color: #ef4444 !important;
  }

  .input-error:focus {
    box-shadow: 0 0 0 3px rgb(254 202 202 / 60%) !important;
  }

  .field-error-msg {
    margin: 2px 0 0;
    font-size: 12.5px;
    color: #dc2626;
    font-weight: 500;
  }

  .form-hint {
    margin: 2px 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
  }

  .btn {
    height: 42px;
    padding: 0 18px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s;
  }

  .btn-secondary {
    background: #ffffff;
    border: 1px solid #d1d5db;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f9fafb;
  }

  .btn-primary {
    background: #2563eb;
    border: 0;
    color: #ffffff;
    box-shadow: 0 2px 6px rgb(37 99 235 / 20%);
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-spinner {
    width: 15px;
    height: 15px;
    border: 2px solid rgb(255 255 255 / 35%);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Toast Notification */
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 400px;
    width: calc(100% - 40px);
    pointer-events: none;
  }

  .toast-item {
    pointer-events: auto;
    background: #ffffff;
    border-radius: 10px;
    padding: 14px 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.08);
    border: 1px solid #e5e7eb;
    animation: slideInRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .toast-success {
    border-left: 4px solid #16a34a;
  }
  .toast-success .toast-icon-wrap {
    color: #16a34a;
  }

  .toast-error {
    border-left: 4px solid #dc2626;
  }
  .toast-error .toast-icon-wrap {
    color: #dc2626;
  }

  .toast-info {
    border-left: 4px solid #2563eb;
  }
  .toast-info .toast-icon-wrap {
    color: #2563eb;
  }

  .toast-content {
    flex: 1;
  }

  .toast-title {
    font-size: 13.5px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2px;
  }

  .toast-message {
    font-size: 13px;
    color: #4b5563;
    line-height: 1.4;
  }

  .toast-close {
    background: none;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    font-size: 14px;
    padding: 2px;
  }

  .toast-close:hover {
    color: #111827;
  }

  /* Animations */
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleUp { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

  /* Responsive Design */
  @media (max-width: 900px) {
    .filter-form {
      flex-direction: column;
      align-items: stretch;
    }
    .filter-search-group {
      width: 100%;
    }
    .filter-selects-group {
      justify-content: flex-start;
      width: 100%;
    }
  }

  @media (max-width: 640px) {
    .header-inner {
      padding: 12px 14px;
    }
    .main-content {
      padding: 16px 14px 36px;
      gap: 16px;
    }
    .page-header {
      flex-direction: column;
      align-items: flex-start;
    }
    .btn-create-user {
      width: 100%;
      justify-content: center;
    }
    .form-row-2 {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .pagination-bar {
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
  }
`;

export default function UserManagement() {
  // Main data states
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [systemError, setSystemError] = useState<string>("");

  // Filter & Search states (SCRUM-108, SCRUM-109)
  const [searchInput, setSearchInput] = useState<string>("");
  const [filters, setFilters] = useState<FilterParams>({
    search: "",
    role: "",
    status: "",
    page: 1,
    size: 20, // Default 20 records per page per SCRUM-109
  });

  // Modal states (SCRUM-110, SCRUM-111)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Status toggle state
  const [togglingUserId, setTogglingUserId] = useState<number | null>(null);

  // Toast notifications (SCRUM-112)
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: "success" | "error" | "info", title: string, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = { id, type, title, message };
    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Fetch users from API (integrates with Backend SCRUM-99 to SCRUM-106)
  const loadUsers = useCallback(async (currentFilters: FilterParams) => {
    setIsLoading(true);
    setSystemError("");

    try {
      const response = await fetchUsersApi(currentFilters);
      setUsers(response.items);
      setTotal(response.total);
      setTotalPages(response.total_pages);
    } catch (err: any) {
      const msg = err.generalMessage || "Không thể tải danh sách người dùng. Vui lòng thử lại sau.";
      setSystemError(msg);
      addToast("error", "Lỗi tải dữ liệu", msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and filter change trigger
  useEffect(() => {
    loadUsers(filters);
  }, [filters, loadUsers]);

  // Handlers for Filters (SCRUM-108)
  const handleApplySearch = () => {
    setFilters((prev) => ({
      ...prev,
      search: searchInput,
      page: 1, // Reset to page 1 on new search
    }));
  };

  const handleRoleChange = (newRole: string) => {
    setFilters((prev) => ({
      ...prev,
      role: newRole,
      page: 1, // Reset to page 1 on filter change
    }));
  };

  const handleStatusChange = (newStatus: string) => {
    setFilters((prev) => ({
      ...prev,
      status: newStatus,
      page: 1, // Reset to page 1 on filter change
    }));
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setFilters((prev) => ({
      ...prev,
      search: "",
      role: "",
      status: "",
      page: 1,
    }));
  };

  // Handlers for Pagination (SCRUM-109)
  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({
      ...prev,
      page: newPage, // Preserves search, role, status
    }));
  };

  const handlePageSizeChange = (newSize: number) => {
    setFilters((prev) => ({
      ...prev,
      size: newSize,
      page: 1, // Reset to page 1 when changing size
    }));
  };

  // Handlers for Modals (SCRUM-110, SCRUM-111)
  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleModalSuccess = (successMessage: string) => {
    addToast("success", "Thành công", successMessage);
    // Reload users with current filters to reflect updates
    loadUsers(filters);
  };

  // Handler for Lock / Unlock (SCRUM-107, SCRUM-103)
  const handleToggleStatus = async (user: User) => {
    const isLocking = user.status !== "LOCKED";
    const actionName = isLocking ? "khóa" : "mở khóa";

    setTogglingUserId(user.id);
    try {
      const updated = await toggleUserStatusApi(user.id, user.status);
      addToast(
        "success",
        "Thao tác thành công",
        isLocking
          ? `Đã tạm khóa tài khoản "${user.username}".`
          : `Đã mở khóa tài khoản "${user.username}".`
      );
      // Update local state without full reload
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: updated.status } : u))
      );
    } catch (err: any) {
      addToast(
        "error",
        `Không thể ${actionName} tài khoản`,
        err.generalMessage || "Có lỗi xảy ra khi cập nhật trạng thái."
      );
    } finally {
      setTogglingUserId(null);
    }
  };

  const startIndex = (filters.page - 1) * filters.size + 1;

  return (
    <>
      <style>{userManagementStyles}</style>

      {/* Global Toast Container (SCRUM-112) */}
      <Toast toasts={toasts} onDismiss={removeToast} />

      {/* Create / Edit User Modal (SCRUM-110, SCRUM-111) */}
      <UserModal
        isOpen={isModalOpen}
        user={editingUser}
        onClose={handleCloseModal}
        onSubmitSuccess={handleModalSuccess}
      />

      <div className="app-container">
        {/* Navigation Header */}
        <header className="app-header">
          <div className="header-inner">
            <div className="header-brand-wrap">
              <div className="header-logo" aria-hidden="true">
                OMS
              </div>
              <div className="header-title-block">
                <h1>Hệ Thống Bán Hàng &amp; Kho</h1>
                <p>Phân hệ Quản trị hệ thống · Quản lý tài khoản (SCRUM-62)</p>
              </div>
            </div>

            <nav className="header-nav" aria-label="Menu tài khoản người dùng">
              <span className="admin-badge">Quản trị viên</span>
              <a href="/change-password" className="header-link">
                Đổi mật khẩu
              </a>
              <a href="/login" className="header-link">
                Đăng xuất
              </a>
            </nav>
          </div>
        </header>

        {/* Main Content Body */}
        <main className="main-content">
          {/* Page Title & Add Button */}
          <section className="page-header">
            <div className="page-title-wrap">
              <h2>Quản lý tài khoản người dùng</h2>
              <p>
                Tạo mới, phân quyền và quản lý tài khoản cho nhân viên kinh doanh, quản lý kho và
                đại lý.
              </p>
            </div>
            <button
              type="button"
              className="btn-create-user"
              onClick={handleOpenCreateModal}
              title="Thêm tài khoản người dùng mới"
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              <span>+ Thêm người dùng</span>
            </button>
          </section>

          {/* System Error Alert Banner (SCRUM-112) */}
          {systemError && (
            <div className="system-error-card" role="alert">
              <div className="system-error-body">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  width="22"
                  height="22"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <strong>Không thể kết nối đến máy chủ:</strong> {systemError}
                </div>
              </div>
              <button
                type="button"
                className="btn-retry"
                onClick={() => loadUsers(filters)}
              >
                Thử lại
              </button>
            </div>
          )}

          {/* Search Bar & Filters (SCRUM-108) */}
          <UserFilter
            search={searchInput}
            role={filters.role}
            status={filters.status}
            onSearchChange={setSearchInput}
            onRoleChange={handleRoleChange}
            onStatusChange={handleStatusChange}
            onApplySearch={handleApplySearch}
            onClearFilters={handleClearFilters}
            isLoading={isLoading}
          />

          {/* Main User Table Card (SCRUM-107, SCRUM-109, SCRUM-112) */}
          <section className="table-card">
            {/* Loading state (SCRUM-112) */}
            {isLoading && (
              <div className="state-box" aria-live="polite">
                <div className="loading-spinner-lg" aria-hidden="true" />
                <h3 className="state-title">Đang tải dữ liệu...</h3>
                <p className="state-desc">Đang tải danh sách người dùng từ hệ thống.</p>
              </div>
            )}

            {/* Empty state (SCRUM-112) */}
            {!isLoading && users.length === 0 && !systemError && (
              <div className="state-box">
                <svg
                  className="empty-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                  />
                </svg>
                <h3 className="state-title">Không tìm thấy tài khoản nào</h3>
                <p className="state-desc">
                  {searchInput || filters.role || filters.status
                    ? "Không có tài khoản nào phù hợp với điều kiện tìm kiếm hoặc bộ lọc hiện tại."
                    : "Hệ thống chưa có tài khoản nào. Hãy nhấn nút bên dưới để tạo tài khoản đầu tiên."}
                </p>
                {searchInput || filters.role || filters.status ? (
                  <button
                    type="button"
                    className="filter-btn btn-clear"
                    onClick={handleClearFilters}
                  >
                    Xóa bộ lọc
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-create-user"
                    onClick={handleOpenCreateModal}
                  >
                    + Tạo tài khoản mới
                  </button>
                )}
              </div>
            )}

            {/* Data Table (SCRUM-107) */}
            {!isLoading && users.length > 0 && (
              <>
                <UserTable
                  users={users}
                  startIndex={startIndex}
                  isLoading={isLoading}
                  onEditUser={handleOpenEditModal}
                  onToggleStatus={handleToggleStatus}
                  togglingUserId={togglingUserId}
                />

                {/* Pagination (SCRUM-109) */}
                <Pagination
                  page={filters.page}
                  pageSize={filters.size}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  isLoading={isLoading}
                />
              </>
            )}
          </section>
        </main>
      </div>
    </>
  );
}
