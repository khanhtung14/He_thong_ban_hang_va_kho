/**
 * Interactive Visual Analytics Component
 * Biểu đồ phân tích doanh thu theo Trạng thái & Đại lý/Khu vực
 * Hỗ trợ cả Chart.js (khi có CDN) lẫn Fallback SVG/HTML5 thuần (hoạt động 100% offline không cần mạng)
 */

import { formatCurrencyVND } from './kpi.js';
import { REGIONS, AGENTS } from './mockData.js';

let statusChartInstance = null;
let agentChartInstance = null;

export function renderAnalyticsCharts(state) {
  const { filteredOrders } = state;
  const statusContainer = document.getElementById('chart-status-wrapper');
  const agentContainer = document.getElementById('chart-agents-wrapper');
  const statusCanvas = document.getElementById('chart-status');
  const agentCanvas = document.getElementById('chart-agents');

  // Dữ liệu trạng thái
  const statusKeys = ['pending', 'processing', 'shipping', 'completed', 'cancelled'];
  const statusLabels = ['Chờ duyệt', 'Đang xử lý', 'Đang giao', 'Hoàn thành', 'Đã hủy'];
  const statusColors = ['#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ef4444'];
  
  const statusData = statusKeys.map(key => {
    return filteredOrders
      .filter(o => o.status === key)
      .reduce((sum, o) => sum + o.totalAmount, 0);
  });

  const totalStatusAmount = statusData.reduce((a, b) => a + b, 0) || 1;

  // Dữ liệu top đại lý
  const agentRevenueMap = {};
  filteredOrders.forEach(o => {
    if (o.status !== 'cancelled') {
      agentRevenueMap[o.agentId] = (agentRevenueMap[o.agentId] || 0) + o.totalAmount;
    }
  });

  const sortedAgentEntries = Object.entries(agentRevenueMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const agentLabels = sortedAgentEntries.map(([agentId]) => {
    const ag = AGENTS.find(a => a.id === agentId);
    return ag ? ag.name.replace('Đại lý ', '') : agentId;
  });

  const agentData = sortedAgentEntries.map(([, amount]) => amount);
  const maxAgentRevenue = Math.max(...agentData, 1);

  // NẾU CÓ THƯ VIỆN CHART.JS
  if (typeof Chart !== 'undefined' && statusCanvas && agentCanvas) {
    if (statusChartInstance) {
      statusChartInstance.data.datasets[0].data = statusData;
      statusChartInstance.update('none');
    } else {
      statusChartInstance = new Chart(statusCanvas, {
        type: 'doughnut',
        data: {
          labels: statusLabels,
          datasets: [{
            data: statusData,
            backgroundColor: statusColors,
            borderWidth: 0,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                boxWidth: 12,
                padding: 12,
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans', size: 11 }
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const val = context.raw || 0;
                  return `${label}: ${formatCurrencyVND(val)}`;
                }
              }
            }
          },
          cutout: '68%'
        }
      });
    }

    if (agentChartInstance) {
      agentChartInstance.data.labels = agentLabels;
      agentChartInstance.data.datasets[0].data = agentData;
      agentChartInstance.update('none');
    } else {
      agentChartInstance = new Chart(agentCanvas, {
        type: 'bar',
        data: {
          labels: agentLabels,
          datasets: [{
            label: 'Doanh thu (VNĐ)',
            data: agentData,
            backgroundColor: 'rgba(99, 102, 241, 0.85)',
            hoverBackgroundColor: 'rgba(99, 102, 241, 1)',
            borderRadius: 6,
            borderSkipped: false
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `Doanh thu: ${formatCurrencyVND(context.raw)}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                color: '#94a3b8',
                font: { family: 'Plus Jakarta Sans', size: 10 },
                callback: function(value) {
                  if (value >= 1e9) return (value / 1e9).toFixed(1) + ' tỷ';
                  if (value >= 1e6) return (value / 1e6).toFixed(0) + ' tr';
                  return value;
                }
              }
            },
            y: {
              grid: { display: false },
              ticks: {
                color: '#cbd5e1',
                font: { family: 'Plus Jakarta Sans', size: 11 }
              }
            }
          }
        }
      });
    }
    return;
  }

  // FALLBACK NATIVE SVG RENDERER (Khi offline không có mạng tải Chart.js)
  if (statusContainer) {
    let accumulatedAngle = 0;
    const slicesSvg = statusData.map((val, i) => {
      const percentage = (val / totalStatusAmount) * 100;
      const angle = (val / totalStatusAmount) * 360;
      const startAngle = accumulatedAngle;
      accumulatedAngle += angle;
      return `<div class="chart-fallback-bar-item">
        <span class="dot" style="background: ${statusColors[i]}"></span>
        <span class="label">${statusLabels[i]}:</span>
        <strong class="val">${formatCurrencyVND(val)} (${percentage.toFixed(1)}%)</strong>
      </div>`;
    }).join('');

    statusContainer.innerHTML = `
      <div class="chart-fallback-container">
        <div class="donut-fallback-visual">
          <div class="donut-ring-bar" style="background: conic-gradient(${
            statusData.map((val, i) => {
              const start = (statusData.slice(0, i).reduce((a, b) => a + b, 0) / totalStatusAmount) * 100;
              const end = ((statusData.slice(0, i + 1).reduce((a, b) => a + b, 0)) / totalStatusAmount) * 100;
              return `${statusColors[i]} ${start}% ${end}%`;
            }).join(', ')
          })">
            <div class="donut-center-hole">
              <span class="center-title">Tổng tiền</span>
              <span class="center-sub">${formatCurrencyVND(totalStatusAmount)}</span>
            </div>
          </div>
        </div>
        <div class="donut-legend-list">${slicesSvg}</div>
      </div>
    `;
  }

  if (agentContainer) {
    if (agentLabels.length === 0) {
      agentContainer.innerHTML = `<div class="chart-fallback-empty">Không có dữ liệu đại lý</div>`;
    } else {
      const barsHtml = agentLabels.map((lbl, idx) => {
        const val = agentData[idx];
        const pct = Math.max(5, Math.round((val / maxAgentRevenue) * 100));
        return `
          <div class="agent-bar-row">
            <div class="agent-bar-header">
              <span class="agent-bar-title">${lbl}</span>
              <span class="agent-bar-amount">${formatCurrencyVND(val)}</span>
            </div>
            <div class="agent-bar-track">
              <div class="agent-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
      agentContainer.innerHTML = `<div class="agent-fallback-bars-list">${barsHtml}</div>`;
    }
  }
}
