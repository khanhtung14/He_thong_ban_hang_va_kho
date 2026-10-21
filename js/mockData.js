/**
 * NEXUS ENTERPRISE WMS (SMART INVENTORY & REPLENISHMENT SYSTEM)
 * Ticket: SCRUM-87 / SCRUM-35
 * Role: Quản lý kho (Warehouse & Inventory Manager)
 * Description: Dữ liệu mẫu danh mục Kho hàng, Nhà cung cấp, SKU và Tồn kho chi tiết theo từng kho
 */

export const SYSTEM_CONFIG = {
  systemCode: 'NEXUS-WMS',
  ticketCode: 'SCRUM-87 / SCRUM-35',
  version: 'v4.5 Enterprise Edition',
  currentDate: '2026-10-21',
  currency: 'VND',
  currentUser: {
    id: 'USR-WM-01',
    name: 'Trần Minh Hoàng',
    role: 'Quản lý kho cấp cao (Chief Inventory Officer)',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    email: 'hoang.tm@nexus-wms.corp',
    phone: '0908.123.889'
  }
};

export const WAREHOUSES = [
  {
    id: 'WH-HN',
    code: 'WH-HN-01',
    name: 'Kho Tổng Miền Bắc (Hà Nội)',
    shortName: 'Kho Miền Bắc',
    region: 'Miền Bắc',
    address: 'Lô CN-08, KCN Nội Bài, Xã Quang Tiến, Huyện Sóc Sơn, TP. Hà Nội',
    manager: 'Nguyễn Văn Hùng (Kho trưởng)',
    phone: '024.3886.5522',
    capacityPallets: 45000,
    areaSquareMeters: 12000,
    color: '#3b82f6',
    badgeClass: 'badge-hn'
  },
  {
    id: 'WH-HCM',
    code: 'WH-HCM-02',
    name: 'Kho Tổng Miền Nam (Bình Dương / TP.HCM)',
    shortName: 'Kho Miền Nam',
    region: 'Miền Nam',
    address: 'Số 18 Đại lộ Độc Lập, KCN Sóng Thần 2, Dĩ An, Tỉnh Bình Dương',
    manager: 'Lê Hoàng Tuấn (Kho trưởng)',
    phone: '0274.379.8866',
    capacityPallets: 60000,
    areaSquareMeters: 15000,
    color: '#10b981',
    badgeClass: 'badge-hcm'
  },
  {
    id: 'WH-DN',
    code: 'WH-DN-03',
    name: 'Kho Trung Chuyển Miền Trung (Đà Nẵng)',
    shortName: 'Kho Miền Trung',
    region: 'Miền Trung',
    address: 'Đường số 4, KCN Hòa Cầm, Phường Hòa Thọ Tây, Quận Cẩm Lệ, TP. Đà Nẵng',
    manager: 'Trần Đình Trọng (Kho trưởng)',
    phone: '0236.376.1144',
    capacityPallets: 20000,
    areaSquareMeters: 6000,
    color: '#f59e0b',
    badgeClass: 'badge-dn'
  },
  {
    id: 'WH-CT',
    code: 'WH-CT-04',
    name: 'Kho Phân Phối Miền Tây (Cần Thơ)',
    shortName: 'Kho Miền Tây',
    region: 'Miền Tây',
    address: 'Lô 28B, KCN Trà Nóc 1, Phường Trà Nóc, Quận Bình Thủy, TP. Cần Thơ',
    manager: 'Đặng Quốc Khánh (Kho trưởng)',
    phone: '0292.384.2299',
    capacityPallets: 15000,
    areaSquareMeters: 5000,
    color: '#8b5cf6',
    badgeClass: 'badge-ct'
  }
];

export const SUPPLIERS = [
  {
    id: 'SUP-01',
    code: 'DELL-VN',
    name: 'Dell Technologies Vietnam Enterprise Co.',
    taxCode: '0305892114',
    contactPerson: 'Phạm Thị Thùy Linh (Giám đốc Kênh Phân phối)',
    phone: '028.3823.8800',
    email: 'distribution.vn@dell.com',
    leadTimeDays: 5,
    minOrderValue: 200000000,
    paymentTerms: 'Công nợ Net 30'
  },
  {
    id: 'SUP-02',
    code: 'APPLE-ENT',
    name: 'Apple Enterprise Logistics Asia Pte.',
    taxCode: '0313412567',
    contactPerson: 'David Chen (Supply Chain Lead)',
    phone: '028.3822.9900',
    email: 'enterprise-orders@apple.vn.corp',
    leadTimeDays: 7,
    minOrderValue: 300000000,
    paymentTerms: 'Thanh toán LC / Net 15'
  },
  {
    id: 'SUP-03',
    code: 'CISCO-VN',
    name: 'Cisco Systems Enterprise Solutions Vietnam',
    taxCode: '0102554789',
    contactPerson: 'Vũ Quốc Bảo (Key Account Manager)',
    phone: '024.3936.4422',
    email: 'cisco-orders@cisco.vn',
    leadTimeDays: 4,
    minOrderValue: 150000000,
    paymentTerms: 'Công nợ Net 45'
  },
  {
    id: 'SUP-04',
    code: 'APC-SE',
    name: 'Schneider Electric / APC Infrastructure Corp',
    taxCode: '0300456123',
    contactPerson: 'Nguyễn Thị Bích Ngọc (Trưởng phòng Cung ứng)',
    phone: '028.3520.3344',
    email: 'orders.apc@se.com',
    leadTimeDays: 6,
    minOrderValue: 100000000,
    paymentTerms: 'Công nợ Net 30'
  },
  {
    id: 'SUP-05',
    code: 'SYNOLOGY-VN',
    name: 'Synology Enterprise Storage Distributor',
    taxCode: '0108923412',
    contactPerson: 'Hoàng Anh Quân (Phó Giám Đốc Kinh Doanh)',
    phone: '024.3787.9911',
    email: 'b2b-vn@synology.corp',
    leadTimeDays: 3,
    minOrderValue: 80000000,
    paymentTerms: 'Công nợ Net 30'
  },
  {
    id: 'SUP-06',
    code: 'FORTINET-VN',
    name: 'Fortinet Security Networks Asia',
    taxCode: '0312984511',
    contactPerson: 'Đỗ Minh Trí (Technical Account Manager)',
    phone: '028.3910.7788',
    email: 'enterprise-sec@fortinet.vn',
    leadTimeDays: 4,
    minOrderValue: 120000000,
    paymentTerms: 'Công nợ Net 30'
  }
];

export const PRODUCT_CATALOG = [
  {
    sku: 'SRV-DELL-R760',
    name: 'Máy Chủ Dell PowerEdge R760 2U (2x Intel Xeon Gold 6430 / 128GB RAM / 4x 1.92TB NVMe)',
    category: 'Máy Chủ & Data Center',
    categoryCode: 'SERVER',
    unit: 'Chiếc',
    unitCost: 98000000, // Giá nhập NCC
    sellingPrice: 115000000,
    supplierId: 'SUP-01',
    defaultLeadTime: 5,
    barcode: '8936001007601'
  },
  {
    sku: 'SRV-DELL-R660',
    name: 'Máy Chủ Dell PowerEdge R660 1U Enterprise (2x Xeon Silver 4410Y / 64GB / 2x 960GB SAS)',
    category: 'Máy Chủ & Data Center',
    categoryCode: 'SERVER',
    unit: 'Chiếc',
    unitCost: 72000000,
    sellingPrice: 85000000,
    supplierId: 'SUP-01',
    defaultLeadTime: 5,
    barcode: '8936001006602'
  },
  {
    sku: 'MBP-M3-MAX-16',
    name: 'Apple MacBook Pro 16" M3 Max (16-core CPU / 40-core GPU / 64GB RAM / 1TB SSD Space Black)',
    category: 'Máy Tính Doanh Nghiệp',
    categoryCode: 'LAPTOP',
    unit: 'Chiếc',
    unitCost: 78000000,
    sellingPrice: 89000000,
    supplierId: 'SUP-02',
    defaultLeadTime: 7,
    barcode: '8936002003163'
  },
  {
    sku: 'MBA-M3-15',
    name: 'Apple MacBook Air 15" M3 (8-core CPU / 10-core GPU / 16GB RAM / 512GB SSD Midnight)',
    category: 'Máy Tính Doanh Nghiệp',
    categoryCode: 'LAPTOP',
    unit: 'Chiếc',
    unitCost: 32000000,
    sellingPrice: 37900000,
    supplierId: 'SUP-02',
    defaultLeadTime: 7,
    barcode: '8936002003154'
  },
  {
    sku: 'NET-CS-C9300',
    name: 'Thiết Bị Chuyển Mạch Cisco Catalyst 9300 48-Port PoE+ Gigabit (C9300-48P-E Layer 3)',
    category: 'Thiết Bị Mạng',
    categoryCode: 'NETWORK',
    unit: 'Thiết bị',
    unitCost: 38000000,
    sellingPrice: 45000000,
    supplierId: 'SUP-03',
    defaultLeadTime: 4,
    barcode: '8936003093005'
  },
  {
    sku: 'NET-CS-C9200L',
    name: 'Bộ Chuyển Mạch Cisco Catalyst 9200L 24-Port Data (C9200L-24T-4G-E Stackable)',
    category: 'Thiết Bị Mạng',
    categoryCode: 'NETWORK',
    unit: 'Thiết bị',
    unitCost: 21000000,
    sellingPrice: 25500000,
    supplierId: 'SUP-03',
    defaultLeadTime: 4,
    barcode: '8936003092006'
  },
  {
    sku: 'UPS-APC-RT10K',
    name: 'Bộ Lưu Điện UPS APC Smart-UPS On-Line RT 10kVA / 10kW 230V Rack/Tower 6U (SRT10KXLI)',
    category: 'Nguồn & Hạ Tầng',
    categoryCode: 'POWER',
    unit: 'Bộ',
    unitCost: 56000000,
    sellingPrice: 68000000,
    supplierId: 'SUP-04',
    defaultLeadTime: 6,
    barcode: '8936004010007'
  },
  {
    sku: 'UPS-APC-SMT3000',
    name: 'Bộ Lưu Điện UPS APC Smart-UPS 3000VA LCD 230V SmartConnect (SMT3000IC)',
    category: 'Nguồn & Hạ Tầng',
    categoryCode: 'POWER',
    unit: 'Bộ',
    unitCost: 26000000,
    sellingPrice: 31500000,
    supplierId: 'SUP-04',
    defaultLeadTime: 6,
    barcode: '8936004030008'
  },
  {
    sku: 'SEC-FORTI-100F',
    name: 'Tường Lửa Fortinet FortiGate 100F Enterprise Firewall kèm 1 Năm Unified Threat Protection',
    category: 'An Ninh Mạng',
    categoryCode: 'SECURITY',
    unit: 'Thiết bị',
    unitCost: 43000000,
    sellingPrice: 52000000,
    supplierId: 'SUP-06',
    defaultLeadTime: 4,
    barcode: '8936006001009'
  },
  {
    sku: 'SEC-FORTI-60F',
    name: 'Thiết Bị Bảo Mật Fortinet FortiGate 60F Desktop Next-Gen Firewall (FG-60F)',
    category: 'An Ninh Mạng',
    categoryCode: 'SECURITY',
    unit: 'Thiết bị',
    unitCost: 14500000,
    sellingPrice: 17800000,
    supplierId: 'SUP-06',
    defaultLeadTime: 4,
    barcode: '8936006000600'
  },
  {
    sku: 'SSD-SYN-3840G',
    name: 'Ổ Cứng SSD Synology Enterprise SAT5210 3.84TB 2.5" SATA 6Gb/s 24/7 Endurance',
    category: 'Lưu Trữ & Backup',
    categoryCode: 'STORAGE',
    unit: 'Chiếc',
    unitCost: 11800000,
    sellingPrice: 14200000,
    supplierId: 'SUP-05',
    defaultLeadTime: 3,
    barcode: '8936005038401'
  },
  {
    sku: 'NAS-SYN-RS3621',
    name: 'Hệ Thống Lưu Trữ NAS Synology RackStation RS3621xs+ 12-Bay 2U High-Performance',
    category: 'Lưu Trữ & Backup',
    categoryCode: 'STORAGE',
    unit: 'Bộ',
    unitCost: 85000000,
    sellingPrice: 102000000,
    supplierId: 'SUP-05',
    defaultLeadTime: 4,
    barcode: '8936005036212'
  }
];

/**
 * Danh sách Tồn kho chi tiết theo từng cặp (Warehouse, SKU).
 * Thiết kế chuẩn nghiệp vụ WMS:
 * - physicalStock: Tồn vật lý trong kho
 * - reservedStock: Số lượng đã giữ chỗ cho đơn bán hàng đang soạn/chờ giao
 * - availableStock = physicalStock - reservedStock (Tồn khả dụng thực tế)
 * - minThreshold: Mức tồn tối thiểu được khai báo riêng cho từng kho
 * - maxCapacity: Mức tồn tối đa được phép lưu trữ ở kho
 * - reorderQuantity: Số lượng đặt hàng kinh tế (Economic Order Quantity / MOQ)
 * - dailyBurnRate: Tốc độ xuất kho trung bình ngày (cái/ngày)
 */
export const INITIAL_INVENTORY_ITEMS = [
  // ===================== KHO TỔNG MIỀN BẮC (WH-HN) =====================
  {
    id: 'INV-HN-001',
    warehouseId: 'WH-HN',
    sku: 'SRV-DELL-R760',
    physicalStock: 4,
    reservedStock: 2,
    minThreshold: 10,     // 🚨 Khai báo Min = 10, Khả dụng = 2 -> DƯỚI NGƯỠNG RẤT NẶNG! (Thiếu 8 cái)
    maxCapacity: 30,
    reorderQuantity: 15,
    dailyBurnRate: 1.2,
    leadTimeDays: 5,
    binLocation: 'Kệ A1-Tầng 02',
    lastRestockedDate: '2026-09-28'
  },
  {
    id: 'INV-HN-002',
    warehouseId: 'WH-HN',
    sku: 'SRV-DELL-R660',
    physicalStock: 12,
    reservedStock: 3,
    minThreshold: 8,      // Khả dụng = 9 >= Min (8) -> An toàn
    maxCapacity: 25,
    reorderQuantity: 10,
    dailyBurnRate: 0.8,
    leadTimeDays: 5,
    binLocation: 'Kệ A1-Tầng 03',
    lastRestockedDate: '2026-10-10'
  },
  {
    id: 'INV-HN-003',
    warehouseId: 'WH-HN',
    sku: 'MBP-M3-MAX-16',
    physicalStock: 2,
    reservedStock: 2,
    minThreshold: 12,     // ⛔ Khả dụng = 0 (2 - 2) -> CHÁY HÀNG HOÀN TOÀN (STOCKOUT)!
    maxCapacity: 40,
    reorderQuantity: 20,
    dailyBurnRate: 2.0,
    leadTimeDays: 7,
    binLocation: 'Kệ B2-Tầng 01 (Kho VIP)',
    lastRestockedDate: '2026-09-15'
  },
  {
    id: 'INV-HN-004',
    warehouseId: 'WH-HN',
    sku: 'MBA-M3-15',
    physicalStock: 8,
    reservedStock: 1,
    minThreshold: 15,     // 🚨 Khả dụng = 7 < Min (15) -> DƯỚI NGƯỠNG (Thiếu 8 cái)
    maxCapacity: 50,
    reorderQuantity: 25,
    dailyBurnRate: 2.5,
    leadTimeDays: 7,
    binLocation: 'Kệ B2-Tầng 02',
    lastRestockedDate: '2026-10-02'
  },
  {
    id: 'INV-HN-005',
    warehouseId: 'WH-HN',
    sku: 'NET-CS-C9300',
    physicalStock: 18,
    reservedStock: 4,
    minThreshold: 12,     // Khả dụng = 14 > Min (12) -> An toàn
    maxCapacity: 45,
    reorderQuantity: 20,
    dailyBurnRate: 1.5,
    leadTimeDays: 4,
    binLocation: 'Kệ C1-Tầng 01',
    lastRestockedDate: '2026-10-12'
  },
  {
    id: 'INV-HN-006',
    warehouseId: 'WH-HN',
    sku: 'NET-CS-C9200L',
    physicalStock: 6,
    reservedStock: 1,
    minThreshold: 10,     // 🚨 Khả dụng = 5 < Min (10) -> DƯỚI NGƯỠNG
    maxCapacity: 35,
    reorderQuantity: 15,
    dailyBurnRate: 1.8,
    leadTimeDays: 4,
    binLocation: 'Kệ C1-Tầng 02',
    lastRestockedDate: '2026-10-05'
  },
  {
    id: 'INV-HN-007',
    warehouseId: 'WH-HN',
    sku: 'UPS-APC-RT10K',
    physicalStock: 5,
    reservedStock: 0,
    minThreshold: 6,      // 🚨 Khả dụng = 5 < Min (6) -> DƯỚI NGƯỠNG
    maxCapacity: 20,
    reorderQuantity: 8,
    dailyBurnRate: 0.6,
    leadTimeDays: 6,
    binLocation: 'Khu Trọng Tải Nặng D1',
    lastRestockedDate: '2026-09-20'
  },
  {
    id: 'INV-HN-008',
    warehouseId: 'WH-HN',
    sku: 'UPS-APC-SMT3000',
    physicalStock: 15,
    reservedStock: 2,
    minThreshold: 10,     // Khả dụng = 13 > Min -> An toàn
    maxCapacity: 30,
    reorderQuantity: 12,
    dailyBurnRate: 1.0,
    leadTimeDays: 6,
    binLocation: 'Khu Trọng Tải Nặng D2',
    lastRestockedDate: '2026-10-14'
  },
  {
    id: 'INV-HN-009',
    warehouseId: 'WH-HN',
    sku: 'SEC-FORTI-100F',
    physicalStock: 14,
    reservedStock: 1,
    minThreshold: 8,      // Khả dụng = 13 > Min -> An toàn
    maxCapacity: 30,
    reorderQuantity: 12,
    dailyBurnRate: 0.9,
    leadTimeDays: 4,
    binLocation: 'Kệ E1-Tầng 01',
    lastRestockedDate: '2026-10-16'
  },
  {
    id: 'INV-HN-010',
    warehouseId: 'WH-HN',
    sku: 'SEC-FORTI-60F',
    physicalStock: 22,
    reservedStock: 3,
    minThreshold: 15,     // Khả dụng = 19 > Min -> An toàn
    maxCapacity: 50,
    reorderQuantity: 20,
    dailyBurnRate: 2.2,
    leadTimeDays: 4,
    binLocation: 'Kệ E1-Tầng 02',
    lastRestockedDate: '2026-10-15'
  },
  {
    id: 'INV-HN-011',
    warehouseId: 'WH-HN',
    sku: 'SSD-SYN-3840G',
    physicalStock: 12,
    reservedStock: 4,
    minThreshold: 20,     // 🚨 Khả dụng = 8 < Min (20) -> DƯỚI NGƯỠNG (Thiếu 12 cái)
    maxCapacity: 80,
    reorderQuantity: 40,
    dailyBurnRate: 3.5,
    leadTimeDays: 3,
    binLocation: 'Tủ Linh Kiện An Toàn F1',
    lastRestockedDate: '2026-10-01'
  },
  {
    id: 'INV-HN-012',
    warehouseId: 'WH-HN',
    sku: 'NAS-SYN-RS3621',
    physicalStock: 4,
    reservedStock: 1,
    minThreshold: 3,      // Khả dụng = 3 = Min (3) -> Cận ngưỡng nguy cơ!
    maxCapacity: 12,
    reorderQuantity: 5,
    dailyBurnRate: 0.4,
    leadTimeDays: 4,
    binLocation: 'Kệ F2-Tầng 01',
    lastRestockedDate: '2026-10-08'
  },

  // ===================== KHO TỔNG MIỀN NAM (WH-HCM) =====================
  {
    id: 'INV-HCM-001',
    warehouseId: 'WH-HCM',
    sku: 'SRV-DELL-R760',
    physicalStock: 15,
    reservedStock: 3,
    minThreshold: 12,     // Khả dụng = 12 = Min -> Cận ngưỡng
    maxCapacity: 40,
    reorderQuantity: 20,
    dailyBurnRate: 1.6,
    leadTimeDays: 5,
    binLocation: 'Kệ S1-A1',
    lastRestockedDate: '2026-10-11'
  },
  {
    id: 'INV-HCM-002',
    warehouseId: 'WH-HCM',
    sku: 'SRV-DELL-R660',
    physicalStock: 3,
    reservedStock: 1,
    minThreshold: 10,     // 🚨 Khả dụng = 2 < Min (10) -> DƯỚI NGƯỠNG
    maxCapacity: 30,
    reorderQuantity: 15,
    dailyBurnRate: 1.1,
    leadTimeDays: 5,
    binLocation: 'Kệ S1-A2',
    lastRestockedDate: '2026-09-25'
  },
  {
    id: 'INV-HCM-003',
    warehouseId: 'WH-HCM',
    sku: 'MBP-M3-MAX-16',
    physicalStock: 25,
    reservedStock: 5,
    minThreshold: 15,     // Khả dụng = 20 > Min -> An toàn
    maxCapacity: 50,
    reorderQuantity: 25,
    dailyBurnRate: 2.8,
    leadTimeDays: 7,
    binLocation: 'Khu Công Nghệ Cao L1',
    lastRestockedDate: '2026-10-18'
  },
  {
    id: 'INV-HCM-004',
    warehouseId: 'WH-HCM',
    sku: 'MBA-M3-15',
    physicalStock: 5,
    reservedStock: 2,
    minThreshold: 18,     // 🚨 Khả dụng = 3 < Min (18) -> DƯỚI NGƯỠNG (Thiếu 15 cái!)
    maxCapacity: 60,
    reorderQuantity: 30,
    dailyBurnRate: 3.2,
    leadTimeDays: 7,
    binLocation: 'Khu Công Nghệ Cao L2',
    lastRestockedDate: '2026-09-30'
  },
  {
    id: 'INV-HCM-005',
    warehouseId: 'WH-HCM',
    sku: 'NET-CS-C9300',
    physicalStock: 26,
    reservedStock: 6,
    minThreshold: 15,     // Khả dụng = 20 > Min -> An toàn
    maxCapacity: 50,
    reorderQuantity: 20,
    dailyBurnRate: 2.0,
    leadTimeDays: 4,
    binLocation: 'Kệ N1-01',
    lastRestockedDate: '2026-10-14'
  },
  {
    id: 'INV-HCM-006',
    warehouseId: 'WH-HCM',
    sku: 'NET-CS-C9200L',
    physicalStock: 30,
    reservedStock: 4,
    minThreshold: 15,     // Khả dụng = 26 > Min -> An toàn
    maxCapacity: 50,
    reorderQuantity: 20,
    dailyBurnRate: 2.4,
    leadTimeDays: 4,
    binLocation: 'Kệ N1-02',
    lastRestockedDate: '2026-10-16'
  },
  {
    id: 'INV-HCM-007',
    warehouseId: 'WH-HCM',
    sku: 'UPS-APC-RT10K',
    physicalStock: 0,
    reservedStock: 0,
    minThreshold: 8,      // ⛔ Khả dụng = 0 -> CHÁY HÀNG (STOCKOUT)!
    maxCapacity: 25,
    reorderQuantity: 10,
    dailyBurnRate: 0.9,
    leadTimeDays: 6,
    binLocation: 'Khu Điện Lực P1',
    lastRestockedDate: '2026-09-10'
  },
  {
    id: 'INV-HCM-008',
    warehouseId: 'WH-HCM',
    sku: 'UPS-APC-SMT3000',
    physicalStock: 18,
    reservedStock: 2,
    minThreshold: 12,     // Khả dụng = 16 > Min -> An toàn
    maxCapacity: 40,
    reorderQuantity: 15,
    dailyBurnRate: 1.4,
    leadTimeDays: 6,
    binLocation: 'Khu Điện Lực P2',
    lastRestockedDate: '2026-10-15'
  },
  {
    id: 'INV-HCM-009',
    warehouseId: 'WH-HCM',
    sku: 'SEC-FORTI-100F',
    physicalStock: 5,
    reservedStock: 1,
    minThreshold: 10,     // 🚨 Khả dụng = 4 < Min (10) -> DƯỚI NGƯỠNG
    maxCapacity: 35,
    reorderQuantity: 15,
    dailyBurnRate: 1.2,
    leadTimeDays: 4,
    binLocation: 'Kệ B1-Sec',
    lastRestockedDate: '2026-10-04'
  },
  {
    id: 'INV-HCM-010',
    warehouseId: 'WH-HCM',
    sku: 'SEC-FORTI-60F',
    physicalStock: 35,
    reservedStock: 5,
    minThreshold: 20,     // Khả dụng = 30 > Min -> An toàn
    maxCapacity: 60,
    reorderQuantity: 25,
    dailyBurnRate: 3.0,
    leadTimeDays: 4,
    binLocation: 'Kệ B2-Sec',
    lastRestockedDate: '2026-10-17'
  },
  {
    id: 'INV-HCM-011',
    warehouseId: 'WH-HCM',
    sku: 'SSD-SYN-3840G',
    physicalStock: 48,
    reservedStock: 8,
    minThreshold: 25,     // Khả dụng = 40 > Min -> An toàn
    maxCapacity: 100,
    reorderQuantity: 50,
    dailyBurnRate: 4.5,
    leadTimeDays: 3,
    binLocation: 'Tủ SSD Chuyên Dụng T1',
    lastRestockedDate: '2026-10-12'
  },
  {
    id: 'INV-HCM-012',
    warehouseId: 'WH-HCM',
    sku: 'NAS-SYN-RS3621',
    physicalStock: 6,
    reservedStock: 1,
    minThreshold: 4,      // Khả dụng = 5 > Min -> An toàn
    maxCapacity: 15,
    reorderQuantity: 6,
    dailyBurnRate: 0.5,
    leadTimeDays: 4,
    binLocation: 'Kệ S2-NAS',
    lastRestockedDate: '2026-10-10'
  },

  // ===================== KHO TRUNG CHUYỂN MIỀN TRUNG (WH-DN) =====================
  {
    id: 'INV-DN-001',
    warehouseId: 'WH-DN',
    sku: 'SRV-DELL-R760',
    physicalStock: 2,
    reservedStock: 0,
    minThreshold: 4,      // 🚨 Khả dụng = 2 < Min (4) -> DƯỚI NGƯỠNG (Kho khu vực duy trì mức Min thấp hơn kho tổng)
    maxCapacity: 10,
    reorderQuantity: 5,
    dailyBurnRate: 0.3,
    leadTimeDays: 5,
    binLocation: 'Khu A-MT',
    lastRestockedDate: '2026-10-02'
  },
  {
    id: 'INV-DN-002',
    warehouseId: 'WH-DN',
    sku: 'MBP-M3-MAX-16',
    physicalStock: 6,
    reservedStock: 1,
    minThreshold: 5,      // Khả dụng = 5 = Min -> Cận ngưỡng
    maxCapacity: 15,
    reorderQuantity: 8,
    dailyBurnRate: 0.7,
    leadTimeDays: 7,
    binLocation: 'Khu B-MT',
    lastRestockedDate: '2026-10-09'
  },
  {
    id: 'INV-DN-003',
    warehouseId: 'WH-DN',
    sku: 'NET-CS-C9300',
    physicalStock: 7,
    reservedStock: 1,
    minThreshold: 5,      // Khả dụng = 6 > Min -> An toàn
    maxCapacity: 15,
    reorderQuantity: 8,
    dailyBurnRate: 0.5,
    leadTimeDays: 4,
    binLocation: 'Khu C-MT',
    lastRestockedDate: '2026-10-13'
  },
  {
    id: 'INV-DN-004',
    warehouseId: 'WH-DN',
    sku: 'UPS-APC-RT10K',
    physicalStock: 1,
    reservedStock: 0,
    minThreshold: 3,      // 🚨 Khả dụng = 1 < Min (3) -> DƯỚI NGƯỠNG
    maxCapacity: 8,
    reorderQuantity: 4,
    dailyBurnRate: 0.2,
    leadTimeDays: 6,
    binLocation: 'Khu D-MT',
    lastRestockedDate: '2026-09-22'
  },
  {
    id: 'INV-DN-005',
    warehouseId: 'WH-DN',
    sku: 'SSD-SYN-3840G',
    physicalStock: 15,
    reservedStock: 2,
    minThreshold: 10,     // Khả dụng = 13 > Min -> An toàn
    maxCapacity: 30,
    reorderQuantity: 15,
    dailyBurnRate: 1.1,
    leadTimeDays: 3,
    binLocation: 'Khu E-MT',
    lastRestockedDate: '2026-10-15'
  },

  // ===================== KHO PHÂN PHỐI MIỀN TÂY (WH-CT) =====================
  {
    id: 'INV-CT-001',
    warehouseId: 'WH-CT',
    sku: 'SRV-DELL-R660',
    physicalStock: 3,
    reservedStock: 0,
    minThreshold: 3,      // Khả dụng = 3 = Min -> Cận ngưỡng
    maxCapacity: 8,
    reorderQuantity: 4,
    dailyBurnRate: 0.3,
    leadTimeDays: 5,
    binLocation: 'Khu MT-01',
    lastRestockedDate: '2026-10-05'
  },
  {
    id: 'INV-CT-002',
    warehouseId: 'WH-CT',
    sku: 'MBA-M3-15',
    physicalStock: 2,
    reservedStock: 1,
    minThreshold: 6,      // 🚨 Khả dụng = 1 < Min (6) -> DƯỚI NGƯỠNG NẶNG
    maxCapacity: 15,
    reorderQuantity: 8,
    dailyBurnRate: 0.8,
    leadTimeDays: 7,
    binLocation: 'Khu MT-02',
    lastRestockedDate: '2026-09-29'
  },
  {
    id: 'INV-CT-003',
    warehouseId: 'WH-CT',
    sku: 'NET-CS-C9200L',
    physicalStock: 8,
    reservedStock: 1,
    minThreshold: 5,      // Khả dụng = 7 > Min -> An toàn
    maxCapacity: 15,
    reorderQuantity: 6,
    dailyBurnRate: 0.6,
    leadTimeDays: 4,
    binLocation: 'Khu MT-03',
    lastRestockedDate: '2026-10-11'
  },
  {
    id: 'INV-CT-004',
    warehouseId: 'WH-CT',
    sku: 'SEC-FORTI-60F',
    physicalStock: 12,
    reservedStock: 2,
    minThreshold: 8,      // Khả dụng = 10 > Min -> An toàn
    maxCapacity: 20,
    reorderQuantity: 10,
    dailyBurnRate: 0.9,
    leadTimeDays: 4,
    binLocation: 'Khu MT-04',
    lastRestockedDate: '2026-10-16'
  }
];

export const DEMO_SCENARIOS = [
  {
    id: 'SCENARIO_DEFAULT',
    title: 'Hiện trạng thực tế vận hành',
    description: 'Kho Tổng Miền Bắc và Miền Nam có 8 SKU rơi vào báo động dưới ngưỡng tối thiểu, 2 SKU cháy hàng (Stockout) cần tạo PO đặt NCC gấp.',
    badge: 'Mặc định (Live)'
  },
  {
    id: 'SCENARIO_NORTH_SURGE',
    title: 'Đột biến xuất kho Miền Bắc (Báo động Đỏ diện rộng)',
    description: 'Nhu cầu dự án tăng vọt làm 10/12 SKU tại Kho Miền Bắc tụt dốc dưới mức Min. Còi cảnh báo hú to, cần kích hoạt kế hoạch điều chuyển nội bộ và mua hàng khẩn cấp.',
    badge: 'Báo động khẩn cấp'
  },
  {
    id: 'SCENARIO_RESTOCKED',
    title: 'Sau khi nhận hàng bù tồn (Kho an toàn)',
    description: 'Hàng từ 3 nhà cung cấp đã về đầy đủ, toàn bộ SKU trở lại trạng thái Xanh an toàn (Healthy Stock Rate = 100%).',
    badge: 'Tồn kho tối ưu'
  }
];

export const INITIAL_AUDIT_LOGS = [
  {
    id: 'AUD-001',
    timestamp: '2026-10-21 08:30:15',
    actor: 'Trần Minh Hoàng',
    action: 'CẬP NHẬT NGƯỠNG MIN',
    warehouseId: 'WH-HN',
    sku: 'SRV-DELL-R760',
    oldMin: 6,
    newMin: 10,
    reason: 'Điều chỉnh tăng ngưỡng tồn an toàn đón dự án đấu thầu khối Ngân hàng quý 4'
  },
  {
    id: 'AUD-002',
    timestamp: '2026-10-21 09:12:40',
    actor: 'Lê Hoàng Tuấn',
    action: 'CẬP NHẬT NGƯỠNG MIN',
    warehouseId: 'WH-HCM',
    sku: 'MBA-M3-15',
    oldMin: 12,
    newMin: 18,
    reason: 'Doanh số MacBook Air tăng 40% tại khu vực phía Nam'
  },
  {
    id: 'AUD-003',
    timestamp: '2026-10-21 10:05:22',
    actor: 'Hệ thống tự động',
    action: 'CẢNH BÁO ĐỨT HÀNG',
    warehouseId: 'WH-HN',
    sku: 'MBP-M3-MAX-16',
    oldMin: 12,
    newMin: 12,
    reason: 'Xuất kho cho đơn ORD-2026-8801 làm Tồn khả dụng về 0 cái (Cháy hàng)'
  }
];
