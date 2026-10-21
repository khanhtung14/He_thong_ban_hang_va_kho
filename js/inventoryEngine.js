/**
 * NEXUS ENTERPRISE WMS - INVENTORY COMPUTATION ENGINE
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Quản lý tính toán Tồn kho khả dụng, Ngưỡng tối thiểu, Chênh lệch thiếu hụt & Đề xuất đặt hàng NCC
 */

export class InventoryEngine {
  /**
   * Tính toán toàn bộ chỉ số nghiệp vụ cho 1 bản ghi tồn kho SKU-Kho
   * @param {Object} item - Bản ghi tồn kho (physicalStock, reservedStock, minThreshold, maxCapacity...)
   * @param {Object} product - Thông tin sản phẩm (name, category, unit, unitCost, supplierId...)
   * @returns {Object} Bản ghi được làm giàu đầy đủ chỉ số
   */
  static enrichItem(item, product = {}) {
    const physical = Number(item.physicalStock) || 0;
    const reserved = Number(item.reservedStock) || 0;
    const minThreshold = Number(item.minThreshold) || 0;
    const maxCapacity = Math.max(minThreshold, Number(item.maxCapacity) || minThreshold * 2);
    const reorderQuantity = Math.max(1, Number(item.reorderQuantity) || 10);
    const dailyBurnRate = Number(item.dailyBurnRate) || 1.0;
    const leadTime = Number(item.leadTimeDays) || product.defaultLeadTime || 5;

    // Tồn khả dụng thực tế = Tồn vật lý - Số lượng đã giữ chỗ cho đơn hàng
    const availableStock = Math.max(0, physical - reserved);

    // Xác định trạng thái nghiệp vụ
    const isStockout = availableStock === 0;
    const isBelowMin = availableStock < minThreshold;
    const isNearMin = !isBelowMin && availableStock <= Math.ceil(minThreshold * 1.25);
    const isOverstock = availableStock > maxCapacity;
    const isHealthy = !isStockout && !isBelowMin && !isNearMin && !isOverstock;

    // Chênh lệch thiếu hụt so với mức tồn tối thiểu
    const deficitQty = isBelowMin ? (minThreshold - availableStock) : 0;

    // Số ngày tồn còn lại (Inventory Runway / Days of Supply)
    let runwayDays = 0;
    if (availableStock === 0) {
      runwayDays = 0;
    } else if (dailyBurnRate > 0) {
      runwayDays = Number((availableStock / dailyBurnRate).toFixed(1));
    } else {
      runwayDays = 999;
    }

    // Số lượng đề xuất đặt hàng nhà cung cấp (Suggested Reorder Quantity)
    // Nguyên tắc: Bù đủ đến mức tối đa hoặc tối thiểu 2 chu kỳ tiêu thụ, làm tròn theo MOQ (Reorder Qty)
    let suggestedReorderQty = 0;
    if (isBelowMin) {
      const targetFill = maxCapacity - availableStock;
      suggestedReorderQty = Math.max(reorderQuantity, Math.ceil(targetFill / reorderQuantity) * reorderQuantity);
    }

    // Giá trị thành tiền
    const unitCost = product.unitCost || 0;
    const totalInventoryValue = physical * unitCost;
    const deficitCost = deficitQty * unitCost;
    const suggestedReorderCost = suggestedReorderQty * unitCost;

    // Tỉ lệ % so với Tồn tối thiểu và Sức chứa tối đa (dùng cho thanh đo trực quan Stock Gauge)
    const fillPercent = maxCapacity > 0 ? Math.min(100, Math.round((availableStock / maxCapacity) * 100)) : 0;
    const minMarkerPercent = maxCapacity > 0 ? Math.min(95, Math.max(5, Math.round((minThreshold / maxCapacity) * 100))) : 25;
    const minRatioPercent = minThreshold > 0 ? Math.round((availableStock / minThreshold) * 100) : 100;

    // Xác định mã phân loại & Badge hiển thị nổi bật
    let status = 'HEALTHY';
    let statusLabel = 'An toàn';
    let badgeClass = 'badge-healthy';
    let rowHighlightClass = 'row-healthy';
    let urgencyLevel = 1; // 1: Thấp -> 5: Khẩn cấp

    if (isStockout) {
      status = 'STOCKOUT';
      statusLabel = '⛔ Cháy hàng (0 cái)';
      badgeClass = 'badge-stockout';
      rowHighlightClass = 'row-stockout-pulse';
      urgencyLevel = 5;
    } else if (isBelowMin) {
      status = 'BELOW_MIN';
      statusLabel = `🚨 Dưới tồn tối thiểu (-${deficitQty})`;
      badgeClass = 'badge-below-min';
      rowHighlightClass = 'row-below-min-alert';
      urgencyLevel = 4;
    } else if (isNearMin) {
      status = 'NEAR_MIN';
      statusLabel = '⚠️ Cận ngưỡng tối thiểu';
      badgeClass = 'badge-near-min';
      rowHighlightClass = 'row-near-min';
      urgencyLevel = 3;
    } else if (isOverstock) {
      status = 'OVERSTOCK';
      statusLabel = '📦 Dư thừa tồn kho';
      badgeClass = 'badge-overstock';
      rowHighlightClass = 'row-overstock';
      urgencyLevel = 2;
    }

    return {
      ...item,
      productName: product.name || item.sku,
      category: product.category || 'Khác',
      categoryCode: product.categoryCode || 'MISC',
      unit: product.unit || 'Chiếc',
      barcode: product.barcode || '8936000000000',
      unitCost,
      sellingPrice: product.sellingPrice || 0,
      supplierId: product.supplierId || 'SUP-01',
      availableStock,
      isStockout,
      isBelowMin,
      isNearMin,
      isOverstock,
      isHealthy,
      deficitQty,
      runwayDays,
      suggestedReorderQty,
      totalInventoryValue,
      deficitCost,
      suggestedReorderCost,
      fillPercent,
      minMarkerPercent,
      minRatioPercent,
      status,
      statusLabel,
      badgeClass,
      rowHighlightClass,
      urgencyLevel,
      leadTimeDays: leadTime
    };
  }

  /**
   * Tính toán toàn bộ bộ chỉ số KPI tổng hợp cho Dashboard và Báo cáo
   * @param {Array} enrichedItems - Danh sách bản ghi tồn kho đã được làm giàu
   * @param {String} warehouseFilter - Bộ lọc kho ('ALL' hoặc 'WH-HN', 'WH-HCM'...)
   * @returns {Object} Tổng hợp KPI tài chính và mức độ báo động
   */
  static computeDashboardKPIs(enrichedItems, warehouseFilter = 'ALL') {
    const filtered = warehouseFilter === 'ALL'
      ? enrichedItems
      : enrichedItems.filter(item => item.warehouseId === warehouseFilter);

    const totalRecords = filtered.length;
    let totalPhysicalUnits = 0;
    let totalAvailableUnits = 0;
    let totalReservedUnits = 0;
    let totalInventoryValue = 0;

    let countStockout = 0;
    let countBelowMin = 0;
    let countNearMin = 0;
    let countHealthy = 0;
    let countOverstock = 0;

    let totalDeficitUnits = 0;
    let totalDeficitCost = 0;
    let totalSuggestedReorderCost = 0;
    let totalSuggestedReorderUnits = 0;

    filtered.forEach(item => {
      totalPhysicalUnits += item.physicalStock;
      totalAvailableUnits += item.availableStock;
      totalReservedUnits += item.reservedStock;
      totalInventoryValue += item.totalInventoryValue;

      if (item.isStockout) {
        countStockout++;
        countBelowMin++; // Hết hàng cũng là trường hợp nghiêm trọng nhất của dưới Min
        totalDeficitUnits += item.deficitQty;
        totalDeficitCost += item.deficitCost;
        totalSuggestedReorderCost += item.suggestedReorderCost;
        totalSuggestedReorderUnits += item.suggestedReorderQty;
      } else if (item.isBelowMin) {
        countBelowMin++;
        totalDeficitUnits += item.deficitQty;
        totalDeficitCost += item.deficitCost;
        totalSuggestedReorderCost += item.suggestedReorderCost;
        totalSuggestedReorderUnits += item.suggestedReorderQty;
      } else if (item.isNearMin) {
        countNearMin++;
      } else if (item.isOverstock) {
        countOverstock++;
      } else {
        countHealthy++;
      }
    });

    const healthRate = totalRecords > 0
      ? Number((((totalRecords - countBelowMin) / totalRecords) * 100).toFixed(1))
      : 100;

    return {
      warehouseFilter,
      totalRecords,
      totalPhysicalUnits,
      totalAvailableUnits,
      totalReservedUnits,
      totalInventoryValue,
      countStockout,
      countBelowMin, // 🚨 CHỈ SỐ QUAN TRỌNG NHẤT CỦA ĐỀ BÀI SCRUM-35
      countNearMin,
      countHealthy,
      countOverstock,
      healthRate,
      totalDeficitUnits,
      totalDeficitCost,
      totalSuggestedReorderCost,
      totalSuggestedReorderUnits,
      criticalItemsCount: countBelowMin
    };
  }

  /**
   * Tính toán nhóm đề xuất Đặt hàng Nhà Cung Cấp (PO Generator)
   * Tự động lọc tất cả SKU đang dưới mức tối thiểu và gom theo từng Nhà Cung Cấp
   * @param {Array} enrichedItems
   * @param {Array} suppliers
   * @param {String} warehouseFilter
   * @returns {Array} Danh sách đề xuất Purchase Order gom theo NCC
   */
  static generatePORecommendations(enrichedItems, suppliers = [], warehouseFilter = 'ALL') {
    const lowStockItems = enrichedItems.filter(item => {
      const matchWh = (warehouseFilter === 'ALL' || item.warehouseId === warehouseFilter);
      return matchWh && item.isBelowMin;
    });

    // Gom nhóm theo SupplierId
    const supplierMap = new Map();
    suppliers.forEach(s => supplierMap.set(s.id, s));

    const poGroups = new Map();

    lowStockItems.forEach(item => {
      const supId = item.supplierId;
      if (!poGroups.has(supId)) {
        const supInfo = supplierMap.get(supId) || {
          id: supId,
          name: 'Nhà cung cấp đối tác',
          leadTimeDays: 5,
          phone: 'N/A'
        };

        poGroups.set(supId, {
          supplier: supInfo,
          items: [],
          totalEstimatedUnits: 0,
          totalEstimatedCost: 0,
          maxUrgency: 1,
          earliestRunway: 999
        });
      }

      const group = poGroups.get(supId);
      group.items.push(item);
      group.totalEstimatedUnits += item.suggestedReorderQty;
      group.totalEstimatedCost += item.suggestedReorderCost;
      group.maxUrgency = Math.max(group.maxUrgency, item.urgencyLevel);
      group.earliestRunway = Math.min(group.earliestRunway, item.runwayDays);
    });

    return Array.from(poGroups.values()).sort((a, b) => b.maxUrgency - a.maxUrgency || a.earliestRunway - b.earliestRunway);
  }

  /**
   * Thuật toán tính toán Tồn kho tối thiểu thông minh (Safety Stock Formula)
   * Phù hợp chuẩn Supply Chain Management (SCM) & Lean Warehousing:
   * Min Threshold = (Tốc độ tiêu thụ ngày * Thời gian giao hàng NCC * Hệ số an toàn)
   * @param {Number} dailyBurnRate - Tốc độ xuất kho hàng ngày
   * @param {Number} leadTimeDays - Số ngày giao hàng của NCC
   * @param {Number} serviceLevelFactor - Hệ số mức độ phục vụ (mặc định 1.35 tương đương 95% service level)
   * @returns {Object} { recommendedMin, recommendedMax, recommendedReorderQty }
   */
  static calculateSmartSafetyThreshold(dailyBurnRate, leadTimeDays, serviceLevelFactor = 1.35) {
    const burn = Math.max(0.1, Number(dailyBurnRate) || 1.0);
    const lead = Math.max(1, Number(leadTimeDays) || 5);
    
    // Nhu cầu trong thời gian chờ hàng (Demand During Lead Time - DDLT)
    const ddlt = burn * lead;
    
    // Tồn an toàn đề xuất
    const recommendedMin = Math.ceil(ddlt * serviceLevelFactor);
    
    // Sức chứa tối đa đề xuất (chu kỳ 3-4 tuần)
    const recommendedMax = Math.max(recommendedMin * 2, Math.ceil(burn * 25));
    
    // Số lượng đặt hàng kinh tế (EOQ / Batch size)
    const recommendedReorderQty = Math.max(5, Math.ceil(burn * 10));

    return {
      ddlt: Number(ddlt.toFixed(1)),
      recommendedMin,
      recommendedMax,
      recommendedReorderQty
    };
  }
}
