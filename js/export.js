/**
 * Data Export Service
 * Xuất dữ liệu đơn hàng ra file CSV chuẩn UTF-8 (BOM) tương thích hoàn hảo với Excel tiếng Việt
 */

import { AGENTS, REGIONS, USERS, ORDER_STATUSES } from './mockData.js';

export function exportOrdersToCsv(orders, filename = 'danh-sach-don-hang.csv') {
  if (!orders || orders.length === 0) {
    if (window.showToast) {
      window.showToast('Không có dữ liệu đơn hàng để xuất!', 'warning');
    }
    return;
  }

  const headers = [
    'Mã đơn hàng',
    'Ngày đặt hàng',
    'Tên khách hàng',
    'Số điện thoại',
    'Địa chỉ giao hàng',
    'Đại lý phân phối',
    'Khu vực',
    'Nhân viên phụ trách',
    'Tổng tiền (VNĐ)',
    'Trạng thái đơn hàng',
    'Phương thức thanh toán',
    'Tình trạng thanh toán',
    'Ghi chú đơn hàng'
  ];

  const rows = orders.map(order => {
    const agent = AGENTS.find(a => a.id === order.agentId)?.name || order.agentId;
    const region = REGIONS.find(r => r.id === order.regionId)?.name || order.regionId;
    const salesRep = USERS.find(u => u.id === order.salesRepId)?.name || 'Chưa phân công';
    const statusLabel = ORDER_STATUSES.find(s => s.id === order.status)?.label || order.status;

    return [
      `"${order.id}"`,
      `"${new Date(order.createdAt).toLocaleString('vi-VN')}"`,
      `"${(order.customer.name || '').replace(/"/g, '""')}"`,
      `"${order.customer.phone}"`,
      `"${(order.customer.address || '').replace(/"/g, '""')}"`,
      `"${agent.replace(/"/g, '""')}"`,
      `"${region}"`,
      `"${salesRep.replace(/"/g, '""')}"`,
      order.totalAmount,
      `"${statusLabel}"`,
      `"${(order.paymentMethod || '').replace(/"/g, '""')}"`,
      `"${order.paymentStatus}"`,
      `"${(order.notes || '').replace(/"/g, '""')}"`
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (window.showToast) {
    window.showToast(`Đã xuất thành công ${orders.length} đơn hàng ra file Excel (${filename})`, 'success');
  }
}

window.exportOrdersToCsv = exportOrdersToCsv;
