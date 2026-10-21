/**
 * NEXUS ENTERPRISE ORDER MANAGEMENT SYSTEM (NEXUS OMS)
 * Module: Mock Data & Domain Seeds
 * Ticket: SCRUM-86 / SCRUM-9
 * Description: Dữ liệu mẫu danh mục Đại lý, Hạn mức tín dụng, Hóa đơn nợ & Kho hàng
 */

export const SYSTEM_CONFIG = {
  currentDate: '2026-10-20',
  defaultMaxOverdueDays: 30, // Quy định công ty: nợ quá hạn tối đa 30 ngày là ngưỡng bị khóa cứng
  currency: 'VND',
  vatRate: 0.10, // 10% VAT
  companyName: 'NEXUS DISTRIBUTION GLOBAL CORP',
  creditPolicyVersion: 'v4.2 - Basel III Compliant'
};

export const INITIAL_DEALERS = [
  {
    id: 'DL-001',
    code: 'ANHDUONG',
    name: 'Công ty CP Công Nghệ Ánh Dương',
    taxCode: '0106894321',
    address: 'Tầng 8, Tòa nhà Keangnam Landmark 72, Cầu Giấy, Hà Nội',
    tier: 'Đại lý Kim Cương (VIP Tier 1)',
    tierBadge: 'tier-vip',
    region: 'Miền Bắc',
    salesRep: 'Nguyễn Văn Nam (Sales Executive HN)',
    creditLimit: 600000000, // 600 Triệu
    currentDebt: 140000000, // 140 Triệu
    maxOverdueDaysAllowed: 30,
    paymentTermDays: 30, // Hạn thanh toán Net 30
    contactPerson: 'Ông Trần Quốc Tuấn - GĐ Mua hàng (0912.345.678)',
    status: 'ACTIVE',
    riskLevel: 'LOW',
    notes: 'Đại lý uy tín 5 năm, doanh số top 1 miền Bắc, thanh toán đúng hạn.',
    // Hóa đơn nợ chi tiết
    unpaidInvoices: [
      {
        invoiceNo: 'INV-2026-0891',
        orderNo: 'ORD-2026-8801',
        issueDate: '2026-09-15',
        dueDate: '2026-10-15',
        amount: 140000000,
        paidAmount: 0,
        remainingAmount: 140000000,
        overdueDays: 5, // Quá hạn 5 ngày (Nhỏ hơn ngưỡng 30 ngày cho phép -> Không bị chặn)
        status: 'OVERDUE_GRACE' // Quá hạn trong ân hạn
      }
    ],
    presetScenario: 'NORMAL_SAFE',
    presetLabel: '🟢 Kịch bản 1: An Toàn (Còn dư 460M, quá hạn 5d < 30d -> Tạo đơn thoải mái)'
  },
  {
    id: 'DL-002',
    code: 'SAOMAI',
    name: 'Công ty TNHH Phân Phối Tin Học Sao Mai',
    taxCode: '0304912389',
    address: 'Số 142 Nguyễn Thị Minh Khai, Phường 6, Quận 3, TP. Hồ Chí Minh',
    tier: 'Đại lý Vàng (Tier 2)',
    tierBadge: 'tier-gold',
    region: 'Miền Nam',
    salesRep: 'Trần Thị Mai (Sales Executive HCM)',
    creditLimit: 400000000, // 400 Triệu
    currentDebt: 350000000, // 350 Triệu (Còn dư 50M)
    maxOverdueDaysAllowed: 30,
    paymentTermDays: 30,
    contactPerson: 'Bà Lê Thị Hương - Kế toán trưởng (0908.123.456)',
    status: 'ACTIVE',
    riskLevel: 'MEDIUM',
    notes: 'Doanh số ổn định, lịch sử thanh toán tốt nhưng hạn mức đang tiệm cận trần.',
    unpaidInvoices: [
      {
        invoiceNo: 'INV-2026-0850',
        orderNo: 'ORD-2026-8710',
        issueDate: '2026-09-08',
        dueDate: '2026-10-08',
        amount: 200000000,
        paidAmount: 0,
        remainingAmount: 200000000,
        overdueDays: 12, // Quá hạn 12 ngày (< 30 ngày -> Được tạo đơn nhưng nợ đã 350M/400M)
        status: 'OVERDUE_GRACE'
      },
      {
        invoiceNo: 'INV-2026-0912',
        orderNo: 'ORD-2026-8799',
        issueDate: '2026-09-28',
        dueDate: '2026-10-28',
        amount: 150000000,
        paidAmount: 0,
        remainingAmount: 150000000,
        overdueDays: 0, // Chưa đến hạn (Còn 8 ngày)
        status: 'WITHIN_TERM'
      }
    ],
    presetScenario: 'OVER_LIMIT',
    presetLabel: '🟡 Kịch bản 2: Vượt Hạn Mức (Nợ 350M/400M, đơn > 50M -> Đánh dấu CẦN DUYỆT)'
  },
  {
    id: 'DL-003',
    code: 'THANGLONG',
    name: 'Tập Đoàn Công Nghệ & Thương Mại Thăng Long',
    taxCode: '0101239874',
    address: 'Tòa nhà Thăng Long Tower, 98 Ngụy Như Kon Tum, Thanh Xuân, Hà Nội',
    tier: 'Đại lý Bạc (Tier 3)',
    tierBadge: 'tier-silver',
    region: 'Miền Bắc',
    salesRep: 'Lê Hoàng Long (Sales Executive HN)',
    creditLimit: 500000000, // 500 Triệu
    currentDebt: 220000000, // 220 Triệu (Còn dư 280M hạn mức)
    maxOverdueDaysAllowed: 30, // Quy định tối đa 30 ngày
    paymentTermDays: 30,
    contactPerson: 'Ông Hoàng Đình Phúc - Phó GĐ Kinh doanh (0983.555.999)',
    status: 'BLOCKED_OVERDUE',
    riskLevel: 'CRITICAL',
    notes: 'CẢNH BÁO: Đại lý có nợ tồn đọng quá hạn 56 ngày chưa xử lý. Khóa giao dịch toàn bộ.',
    unpaidInvoices: [
      {
        invoiceNo: 'INV-2026-0741',
        orderNo: 'ORD-2026-8512',
        issueDate: '2026-07-25',
        dueDate: '2026-08-25', // Hạn 25/08/2026
        amount: 120000000,
        paidAmount: 0,
        remainingAmount: 120000000,
        overdueDays: 56, // QUÁ HẠN 56 NGÀY (Vi phạm > 30 ngày -> KHÓA CỨNG HOÀN TOÀN)
        status: 'CRITICAL_OVERDUE'
      },
      {
        invoiceNo: 'INV-2026-0789',
        orderNo: 'ORD-2026-8588',
        issueDate: '2026-08-05',
        dueDate: '2026-09-05',
        amount: 100000000,
        paidAmount: 0,
        remainingAmount: 100000000,
        overdueDays: 45, // QUÁ HẠN 45 NGÀY (Vi phạm > 30 ngày)
        status: 'CRITICAL_OVERDUE'
      }
    ],
    presetScenario: 'OVERDUE_BLOCKED',
    presetLabel: '🔴 Kịch bản 3: Nợ Quá Hạn Vi Phạm (Quá hạn 56d > 30d -> CHẶN TẠO ĐƠN HOÀN TOÀN)'
  },
  {
    id: 'DL-004',
    code: 'SAIGONSTAR',
    name: 'Hệ Thống Bán Lẻ Công Nghệ Sài Gòn Star',
    taxCode: '0312384756',
    address: 'Số 457 Điện Biên Phủ, Phường 25, Bình Thạnh, TP. Hồ Chí Minh',
    tier: 'Đại lý Kim Cương (VIP Tier 1)',
    tierBadge: 'tier-vip',
    region: 'Miền Nam',
    salesRep: 'Đặng Thu Hà (Sales Executive HCM)',
    creditLimit: 500000000, // 500 Triệu
    currentDebt: 494000000, // 494 Triệu (Chỉ còn đúng 6 Triệu khả dụng - 98.8%)
    maxOverdueDaysAllowed: 30,
    paymentTermDays: 30,
    contactPerson: 'Ông Võ Hoài An - Trưởng phòng Thu mua (0933.888.111)',
    status: 'ACTIVE',
    riskLevel: 'HIGH',
    notes: 'Đại lý bán lẻ quy mô lớn, công nợ luôn ở mức 98-99% hạn mức cho phép.',
    unpaidInvoices: [
      {
        invoiceNo: 'INV-2026-0902',
        orderNo: 'ORD-2026-8740',
        issueDate: '2026-09-22',
        dueDate: '2026-10-22',
        amount: 494000000,
        paidAmount: 0,
        remainingAmount: 494000000,
        overdueDays: 0, // Chưa quá hạn (Còn 2 ngày)
        status: 'WITHIN_TERM'
      }
    ],
    presetScenario: 'BORDERLINE',
    presetLabel: '🟣 Kịch bản 4: Cận Hạn Mức Biên 98.8% (Chỉ còn 6M, thêm bất kỳ món nào cũng cần duyệt)'
  },
  {
    id: 'DL-005',
    code: 'MEKONG',
    name: 'Công ty Giải Pháp Tin Học Mekong Delta',
    taxCode: '1801298453',
    address: 'Đường 30/4, Phường Hưng Lợi, Quận Ninh Kiều, TP. Cần Thơ',
    tier: 'Đại lý Mới (Tier 4)',
    tierBadge: 'tier-new',
    region: 'Miền Tây',
    salesRep: 'Đặng Thu Hà (Sales Executive HCM)',
    creditLimit: 300000000, // 300 Triệu
    currentDebt: 0, // 0 Đồng nợ
    maxOverdueDaysAllowed: 30,
    paymentTermDays: 30,
    contactPerson: 'Bà Nguyễn Mai Phương - Giám đốc (0971.222.333)',
    status: 'ACTIVE',
    riskLevel: 'LOW',
    notes: 'Đại lý mới kích hoạt, hồ sơ tín dụng trong sạch 100%, chưa phát sinh công nợ.',
    unpaidInvoices: [],
    presetScenario: 'CLEAN_NEW',
    presetLabel: '⚪ Kịch bản 5: Không Công Nợ (Nợ 0đ, hạn mức khả dụng 100% 300M)'
  }
];

export const INITIAL_PRODUCTS = [
  {
    id: 'PRD-001',
    sku: 'SRV-DELL-R760',
    name: 'Máy Chủ Dell PowerEdge R760 Enterprise (2x Intel Xeon Gold 6430 / 128GB RAM / 4x 1.92TB NVMe)',
    category: 'Máy Chủ & Data Center',
    categoryIcon: 'server',
    price: 115000000, // 115 Triệu
    stock: 14,
    unit: 'Chiếc',
    image: '🖥️'
  },
  {
    id: 'PRD-002',
    sku: 'MBP-M3-MAX-16',
    name: 'Apple MacBook Pro 16" M3 Max (16-core CPU / 40-core GPU / 64GB Unified RAM / 1TB SSD Space Black)',
    category: 'Máy Tính Doanh Nghiệp',
    categoryIcon: 'laptop',
    price: 89000000, // 89 Triệu
    stock: 28,
    unit: 'Chiếc',
    image: '💻'
  },
  {
    id: 'PRD-003',
    sku: 'NET-CS-C9300',
    name: 'Thiết Bị Chuyển Mạch Cisco Catalyst 9300 48-Port Gigabit Ethernet PoE+ (Network Essentials)',
    category: 'Thiết Bị Mạng',
    categoryIcon: 'network',
    price: 45000000, // 45 Triệu
    stock: 22,
    unit: 'Thiết bị',
    image: '🖧'
  },
  {
    id: 'PRD-004',
    sku: 'UPS-APC-RT10K',
    name: 'Bộ Lưu Điện UPS APC Smart-UPS On-Line RT 10kVA / 10kW 230V Rack/Tower 6U',
    category: 'Nguồn & Hạ Tầng',
    categoryIcon: 'zap',
    price: 68000000, // 68 Triệu
    stock: 8,
    unit: 'Bộ',
    image: '⚡'
  },
  {
    id: 'PRD-005',
    sku: 'MON-DELL-U3224KB',
    name: 'Màn Hình Chuyên Nghiệp Dell UltraSharp 32" 6K UHD IPS Black (Tích hợp 4K HDR Webcam & Thunderbolt 4)',
    category: 'Thiết Bị Ngoại Vi',
    categoryIcon: 'monitor',
    price: 26500000, // 26.5 Triệu
    stock: 35,
    unit: 'Chiếc',
    image: '🖥️'
  },
  {
    id: 'PRD-006',
    sku: 'SEC-FORTI-100F',
    name: 'Tường Lửa Doanh Nghiệp Fortinet FortiGate 100F Network Security Appliance kèm 1 Năm Unified Threat Bundle',
    category: 'An Ninh & Bảo Mật',
    categoryIcon: 'shield',
    price: 52000000, // 52 Triệu
    stock: 19,
    unit: 'Thiết bị',
    image: '🛡️'
  },
  {
    id: 'PRD-007',
    sku: 'SSD-SYN-3840G',
    name: 'Ổ Cứng Enterprise SSD Synology SAT5210 3.84TB 2.5" SATA 6Gb/s Chuyên Dụng Lưu Trữ 24/7',
    category: 'Lưu Trữ & Backup',
    categoryIcon: 'database',
    price: 14200000, // 14.2 Triệu
    stock: 60,
    unit: 'Chiếc',
    image: '💾'
  },
  {
    id: 'PRD-008',
    sku: 'WIFI-ARUBA-AP635',
    name: 'Bộ Phát Sóng WiFi Doanh Nghiệp Aruba AP-635 Campus AP Wi-Fi 6E (Tri-band 2.4/5/6 GHz)',
    category: 'Thiết Bị Mạng',
    categoryIcon: 'wifi',
    price: 12500000, // 12.5 Triệu
    stock: 45,
    unit: 'Chiếc',
    image: '📡'
  }
];

export const INITIAL_ORDERS = [
  {
    id: 'ORD-2026-9001',
    orderNo: 'NEX-ORD-9001',
    dealerId: 'DL-001',
    dealerName: 'Công ty CP Công Nghệ Ánh Dương',
    salesRep: 'Nguyễn Văn Nam',
    createdAt: '2026-10-18 09:30',
    totalBeforeVat: 115000000,
    vatAmount: 11500000,
    totalAmount: 126500000,
    status: 'APPROVED',
    statusLabel: 'Đã xác nhận (Approved)',
    creditCheckStatus: 'PASSED',
    creditCheckSummary: 'Trong hạn mức (Sau đơn nợ đạt 266.5M/600M - 44.4%)',
    approvalReason: 'Đơn hàng trong hạn mức tín dụng tự động phê duyệt.',
    items: [
      { productId: 'PRD-001', name: 'Máy Chủ Dell PowerEdge R760 Enterprise', quantity: 1, price: 115000000, subtotal: 115000000 }
    ]
  },
  {
    id: 'ORD-2026-9002',
    orderNo: 'NEX-ORD-9002',
    dealerId: 'DL-002',
    dealerName: 'Công ty TNHH Phân Phối Tin Học Sao Mai',
    salesRep: 'Trần Thị Mai',
    createdAt: '2026-10-19 14:15',
    totalBeforeVat: 102200000,
    vatAmount: 10220000,
    totalAmount: 112420000,
    status: 'PENDING_APPROVAL',
    statusLabel: 'Chờ duyệt công nợ (Pending Approval)',
    creditCheckStatus: 'EXCEEDED_LIMIT',
    creditCheckSummary: 'Vượt hạn mức tín dụng +62,420,000 ₫ (Tổng nợ dự kiến 462.4M / 400M)',
    approvalReason: 'Đại lý cam kết thanh toán 150 triệu vào thứ 6 tuần này từ dự án Bệnh viện Từ Dũ. Đề nghị Kế toán trưởng duyệt ngoại lệ.',
    approvalRequestedAt: '2026-10-19 14:20',
    requestedBy: 'Trần Thị Mai',
    approver: 'Kế toán trưởng & GĐ Tài chính',
    items: [
      { productId: 'PRD-002', name: 'Apple MacBook Pro 16" M3 Max', quantity: 1, price: 89000000, subtotal: 89000000 },
      { productId: 'PRD-008', name: 'Bộ Phát Sóng WiFi Doanh Nghiệp Aruba AP-635', quantity: 1, price: 12500000, subtotal: 12500000 }
    ]
  }
];
