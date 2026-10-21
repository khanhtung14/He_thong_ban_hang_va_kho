/**
 * NEXUS ENTERPRISE WMS - CENTRAL REACTIVE STORE
 * Ticket: SCRUM-87 / SCRUM-35
 * Module: Quản lý trạng thái ứng dụng, LocalStorage Cache, Sự kiện phát tín hiệu thời gian thực
 */

import {
  SYSTEM_CONFIG,
  WAREHOUSES,
  SUPPLIERS,
  PRODUCT_CATALOG,
  INITIAL_INVENTORY_ITEMS,
  INITIAL_AUDIT_LOGS,
  DEMO_SCENARIOS
} from './mockData.js';

import { InventoryEngine } from './inventoryEngine.js';

const STORAGE_KEY = 'NEXUS_WMS_SCRUM35_STATE_V1';

class InventoryStore {
  constructor() {
    this.subscribers = new Set();
    this.productMap = new Map();
    this.warehouseMap = new Map();
    this.supplierMap = new Map();

    this.state = this._loadInitialState();
    this._buildLookupMaps();
  }

  _buildLookupMaps() {
    this.productMap.clear();
    this.warehouseMap.clear();
    this.supplierMap.clear();

    this.state.productCatalog.forEach(p => this.productMap.set(p.sku, p));
    this.state.warehouses.forEach(w => this.warehouseMap.set(w.id, w));
    this.state.suppliers.forEach(s => this.supplierMap.set(s.id, s));
  }

  _loadInitialState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.inventoryItems) && parsed.inventoryItems.length > 0) {
          return {
            ...parsed,
            activeWarehouseFilter: 'ALL',
            activeCategoryFilter: 'ALL',
            activeStatusFilter: 'ALL',
            searchQuery: '',
            activeTab: 'dashboard',
            soundEnabled: true
          };
        }
      }
    } catch (e) {
      console.warn('Không thể đọc dữ liệu từ LocalStorage, khởi tạo dữ liệu mặc định.', e);
    }

    return {
      systemConfig: { ...SYSTEM_CONFIG },
      warehouses: [...WAREHOUSES],
      suppliers: [...SUPPLIERS],
      productCatalog: [...PRODUCT_CATALOG],
      inventoryItems: JSON.parse(JSON.stringify(INITIAL_INVENTORY_ITEMS)),
      auditLogs: [...INITIAL_AUDIT_LOGS],
      activeWarehouseFilter: 'ALL',
      activeCategoryFilter: 'ALL',
      activeStatusFilter: 'ALL',
      searchQuery: '',
      activeTab: 'dashboard',
      soundEnabled: true,
      currentScenario: 'SCENARIO_DEFAULT'
    };
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        systemConfig: this.state.systemConfig,
        warehouses: this.state.warehouses,
        suppliers: this.state.suppliers,
        productCatalog: this.state.productCatalog,
        inventoryItems: this.state.inventoryItems,
        auditLogs: this.state.auditLogs,
        currentScenario: this.state.currentScenario
      }));
    } catch (e) {
      console.error('Lỗi khi ghi dữ liệu vào LocalStorage:', e);
    }
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  notify(eventType = 'STATE_CHANGED', payload = null) {
    this.save();
    for (const listener of this.subscribers) {
      try {
        listener(this.state, eventType, payload);
      } catch (err) {
        console.error('Lỗi trong subscriber listener:', err);
      }
    }
  }

  // ==================== GETTERS ====================
  getState() {
    return this.state;
  }

  getProduct(sku) {
    return this.productMap.get(sku) || null;
  }

  getWarehouse(warehouseId) {
    return this.warehouseMap.get(warehouseId) || null;
  }

  getSupplier(supplierId) {
    return this.supplierMap.get(supplierId) || null;
  }

  /**
   * Lấy toàn bộ danh sách tồn kho đã qua tính toán làm giàu chỉ số
   */
  getEnrichedInventoryItems() {
    return this.state.inventoryItems.map(item => {
      const product = this.getProduct(item.sku) || {};
      const enriched = InventoryEngine.enrichItem(item, product);
      const wh = this.getWarehouse(item.warehouseId);
      return {
        ...enriched,
        warehouseName: wh ? wh.name : item.warehouseId,
        warehouseShortName: wh ? wh.shortName : item.warehouseId,
        warehouseRegion: wh ? wh.region : '',
        warehouseColor: wh ? wh.color : '#6366f1'
      };
    });
  }

  /**
   * Lấy danh sách tồn kho đã qua các bộ lọc giao diện
   */
  getFilteredItems() {
    const enriched = this.getEnrichedInventoryItems();
    const { activeWarehouseFilter, activeCategoryFilter, activeStatusFilter, searchQuery } = this.state;

    return enriched.filter(item => {
      // 1. Lọc theo kho
      if (activeWarehouseFilter !== 'ALL' && item.warehouseId !== activeWarehouseFilter) {
        return false;
      }

      // 2. Lọc theo danh mục
      if (activeCategoryFilter !== 'ALL' && item.categoryCode !== activeCategoryFilter) {
        return false;
      }

      // 3. Lọc theo trạng thái cảnh báo
      if (activeStatusFilter !== 'ALL') {
        if (activeStatusFilter === 'BELOW_MIN') {
          // Bao gồm cả hàng hết (Stockout) và hàng dưới Min
          if (!item.isBelowMin && !item.isStockout) return false;
        } else if (activeStatusFilter === 'CRITICAL_ONLY') {
          // Chỉ lấy hàng hết (Stockout)
          if (!item.isStockout) return false;
        } else if (activeStatusFilter === 'NEAR_MIN') {
          if (!item.isNearMin) return false;
        } else if (activeStatusFilter === 'HEALTHY') {
          if (!item.isHealthy) return false;
        } else if (activeStatusFilter === 'OVERSTOCK') {
          if (!item.isOverstock) return false;
        }
      }

      // 4. Lọc tìm kiếm từ khóa thông minh
      if (searchQuery && searchQuery.trim() !== '') {
        const query = searchQuery.trim().toLowerCase();
        const matchSku = item.sku.toLowerCase().includes(query);
        const matchName = item.productName.toLowerCase().includes(query);
        const matchBarcode = item.barcode.toLowerCase().includes(query);
        const matchWh = item.warehouseName.toLowerCase().includes(query);
        const matchBin = (item.binLocation || '').toLowerCase().includes(query);
        if (!matchSku && !matchName && !matchBarcode && !matchWh && !matchBin) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Tính toán bộ chỉ số KPI tổng hợp cho Dashboard
   */
  getDashboardKPIs() {
    const enriched = this.getEnrichedInventoryItems();
    return InventoryEngine.computeDashboardKPIs(enriched, this.state.activeWarehouseFilter);
  }

  /**
   * Lấy danh sách đề xuất PO theo NCC
   */
  getPORecommendations() {
    const enriched = this.getEnrichedInventoryItems();
    return InventoryEngine.generatePORecommendations(enriched, this.state.suppliers, this.state.activeWarehouseFilter);
  }

  // ==================== ACTIONS / MUTATIONS ====================

  setWarehouseFilter(warehouseId) {
    this.state.activeWarehouseFilter = warehouseId;
    this.notify('FILTER_CHANGED', { type: 'warehouse', value: warehouseId });
  }

  setCategoryFilter(categoryCode) {
    this.state.activeCategoryFilter = categoryCode;
    this.notify('FILTER_CHANGED', { type: 'category', value: categoryCode });
  }

  setStatusFilter(status) {
    this.state.activeStatusFilter = status;
    this.notify('FILTER_CHANGED', { type: 'status', value: status });
  }

  setSearchQuery(query) {
    this.state.searchQuery = query;
    this.notify('FILTER_CHANGED', { type: 'search', value: query });
  }

  setActiveTab(tabName) {
    this.state.activeTab = tabName;
    this.notify('TAB_CHANGED', { tab: tabName });
  }

  toggleSound(enabled) {
    this.state.soundEnabled = (enabled !== undefined) ? enabled : !this.state.soundEnabled;
    this.notify('SOUND_TOGGLED', { soundEnabled: this.state.soundEnabled });
  }

  /**
   * Cập nhật khai báo tồn tối thiểu cho 1 cặp (Kho, SKU)
   * Đáp ứng trực tiếp yêu cầu 1: "Khai báo tồn tối thiểu theo SKU và theo kho"
   */
  updateThreshold({ itemId, minThreshold, maxCapacity, reorderQuantity, leadTimeDays, reason = '' }) {
    const itemIndex = this.state.inventoryItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) {
      throw new Error(`Không tìm thấy bản ghi tồn kho có mã ID: ${itemId}`);
    }

    const item = this.state.inventoryItems[itemIndex];
    const oldMin = item.minThreshold;
    const oldMax = item.maxCapacity;

    const parsedMin = Math.max(0, parseInt(minThreshold, 10) || 0);
    const parsedMax = Math.max(parsedMin, parseInt(maxCapacity, 10) || (parsedMin * 2));
    const parsedReorder = Math.max(1, parseInt(reorderQuantity, 10) || 10);
    const parsedLead = leadTimeDays ? Math.max(1, parseInt(leadTimeDays, 10)) : item.leadTimeDays;

    item.minThreshold = parsedMin;
    item.maxCapacity = parsedMax;
    item.reorderQuantity = parsedReorder;
    if (parsedLead) item.leadTimeDays = parsedLead;

    // Ghi nhận Audit Log
    const logEntry = {
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      actor: this.state.systemConfig.currentUser.name,
      action: 'CẬP NHẬT NGƯỠNG TỒN MIN/MAX',
      warehouseId: item.warehouseId,
      sku: item.sku,
      oldMin,
      newMin: parsedMin,
      reason: reason || `Điều chỉnh mức tồn tối thiểu từ ${oldMin} -> ${parsedMin} chiếc theo yêu cầu vận hành`
    };

    this.state.auditLogs.unshift(logEntry);
    if (this.state.auditLogs.length > 50) this.state.auditLogs.pop();

    const product = this.getProduct(item.sku);
    const enriched = InventoryEngine.enrichItem(item, product);

    this.notify('THRESHOLD_UPDATED', {
      item: enriched,
      log: logEntry,
      wasBelowMinBefore: item.physicalStock - item.reservedStock < oldMin,
      isBelowMinNow: enriched.isBelowMin
    });

    return enriched;
  }

  /**
   * Cập nhật hàng loạt (Batch apply) mức tồn tối thiểu theo kho hoặc theo nhóm hàng
   */
  batchUpdateThreshold({ warehouseId, categoryCode, percentMultiplier, reason = '' }) {
    let affectedCount = 0;
    const factor = (100 + Number(percentMultiplier || 0)) / 100;

    this.state.inventoryItems.forEach(item => {
      const matchWh = (warehouseId === 'ALL' || item.warehouseId === warehouseId);
      const product = this.getProduct(item.sku);
      const matchCat = (categoryCode === 'ALL' || (product && product.categoryCode === categoryCode));

      if (matchWh && matchCat) {
        const oldMin = item.minThreshold;
        const newMin = Math.max(1, Math.round(item.minThreshold * factor));
        item.minThreshold = newMin;
        item.maxCapacity = Math.max(newMin * 2, Math.round(item.maxCapacity * factor));
        affectedCount++;
      }
    });

    const logEntry = {
      id: `AUD-BATCH-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      actor: this.state.systemConfig.currentUser.name,
      action: 'CẬP NHẬT HÀNG LOẠT (BATCH)',
      warehouseId,
      sku: `Category: ${categoryCode}`,
      oldMin: 'Multiple',
      newMin: `Điều chỉnh ${percentMultiplier}% (${affectedCount} SKU)`,
      reason: reason || `Cập nhật tồn tối thiểu hàng loạt theo tỷ lệ ${percentMultiplier}% cho ${affectedCount} bản ghi`
    };

    this.state.auditLogs.unshift(logEntry);
    this.notify('BATCH_THRESHOLD_UPDATED', { affectedCount, log: logEntry });
    return affectedCount;
  }

  /**
   * Mô phỏng giao dịch xuất / nhập kho trực tiếp (Live Transaction Simulator)
   * Giúp giáo viên kiểm chứng hành vi: Tồn giảm qua ngưỡng Min -> Lập tức cảnh báo Đỏ, còi bíp kêu!
   */
  adjustPhysicalStock(itemId, deltaQty, reason = '') {
    const itemIndex = this.state.inventoryItems.findIndex(i => i.id === itemId);
    if (itemIndex === -1) return null;

    const item = this.state.inventoryItems[itemIndex];
    const oldPhysical = item.physicalStock;
    const oldAvailable = Math.max(0, oldPhysical - item.reservedStock);
    const wasBelowMin = oldAvailable < item.minThreshold;

    const newPhysical = Math.max(0, oldPhysical + deltaQty);
    item.physicalStock = newPhysical;
    if (deltaQty > 0) {
      item.lastRestockedDate = new Date().toISOString().substring(0, 10);
    }

    const product = this.getProduct(item.sku);
    const enriched = InventoryEngine.enrichItem(item, product);
    const isBelowMinNow = enriched.isBelowMin;
    const isDropBelowMin = !wasBelowMin && isBelowMinNow; // Vừa mới rơi xuống dưới ngưỡng!

    const actionText = deltaQty < 0 ? `XUẤT KHO (${Math.abs(deltaQty)} cái)` : `NHẬP KHO (+${deltaQty} cái)`;
    const logEntry = {
      id: `TRX-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      actor: this.state.systemConfig.currentUser.name,
      action: actionText,
      warehouseId: item.warehouseId,
      sku: item.sku,
      oldMin: item.minThreshold,
      newMin: `Tồn mới: ${enriched.availableStock}`,
      reason: reason || (isDropBelowMin
        ? `⚠️ CẢNH BÁO: Xuất hàng khiến tồn khả dụng (${enriched.availableStock}) rơi xuống dưới mức tối thiểu (${item.minThreshold})!`
        : `Giao dịch điều chỉnh tồn kho vật lý từ ${oldPhysical} -> ${newPhysical} cái`)
    };

    this.state.auditLogs.unshift(logEntry);
    if (this.state.auditLogs.length > 50) this.state.auditLogs.pop();

    this.notify('STOCK_ADJUSTED', {
      item: enriched,
      deltaQty,
      isDropBelowMin,
      isBelowMinNow,
      log: logEntry
    });

    return { enriched, isDropBelowMin };
  }

  /**
   * Kích hoạt Kịch bản Demo cho giáo viên
   */
  loadDemoScenario(scenarioId) {
    this.state.currentScenario = scenarioId;

    if (scenarioId === 'SCENARIO_DEFAULT') {
      this.state.inventoryItems = JSON.parse(JSON.stringify(INITIAL_INVENTORY_ITEMS));
    } else if (scenarioId === 'SCENARIO_NORTH_SURGE') {
      // Làm cho Kho Miền Bắc tụt dốc dưới Min hầu hết các SKU
      this.state.inventoryItems = JSON.parse(JSON.stringify(INITIAL_INVENTORY_ITEMS));
      this.state.inventoryItems.forEach(item => {
        if (item.warehouseId === 'WH-HN') {
          item.physicalStock = Math.max(0, Math.floor(item.minThreshold * 0.4)); // Chỉ còn 40% Min
          item.reservedStock = Math.min(item.physicalStock, 1);
        }
      });
    } else if (scenarioId === 'SCENARIO_RESTOCKED') {
      // Đầy kho an toàn
      this.state.inventoryItems = JSON.parse(JSON.stringify(INITIAL_INVENTORY_ITEMS));
      this.state.inventoryItems.forEach(item => {
        item.physicalStock = Math.round(item.minThreshold * 1.8);
        item.reservedStock = 1;
      });
    }

    const logEntry = {
      id: `AUD-SCENARIO-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
      actor: 'Giáo viên / Quản trị viên',
      action: 'CHUYỂN KỊCH BẢN DEMO',
      warehouseId: 'ALL',
      sku: 'ALL',
      oldMin: '-',
      newMin: scenarioId,
      reason: `Kích hoạt kịch bản kiểm thử: ${scenarioId}`
    };

    this.state.auditLogs.unshift(logEntry);
    this.notify('SCENARIO_LOADED', { scenarioId, log: logEntry });
  }

  resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    this.state = this._loadInitialState();
    this._buildLookupMaps();
    this.notify('STATE_RESET', null);
  }
}

export const store = new InventoryStore();
