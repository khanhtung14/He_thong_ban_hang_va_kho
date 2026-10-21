/**
 * DỮ LIỆU MẪU CHUẨN DOANH NGHIỆP PHÂN PHỐI B2B & QUẢN LÝ ĐƠN HÀNG
 * Hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp NEXUS OMS (SCRUM-86 / SCRUM-15)
 */

export const COMPANY_INFO = {
  name: 'TẬP ĐOÀN CÔNG NGHỆ & PHÂN PHỐI THIẾT BỊ THÔNG MINH NEXUS',
  shortName: 'NEXUS DISTRIBUTION CORP',
  brand: 'NEXUS OMS',
  taxCode: '0314896752',
  headquarters: 'Tòa nhà Nexus Tower, 180 Nguyễn Thị Minh Khai, Phường Võ Thị Sáu, Quận 3, TP. Hồ Chí Minh',
  hotline: '1900 8866 - (028) 3822 9988',
  email: 'orders@nexuscorp.vn',
  website: 'https://nexuscorp.vn',
  warehouseHub: 'Kho Vận Trung Tâm Cát Lái - Đường K1, Cụm Công nghiệp Cát Lái, TP. Thủ Đức, TP.HCM',
  bankAccount: {
    bankName: 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank) - CN TP.HCM',
    accountNumber: '0071009988223',
    accountHolder: 'CONG TY CP TAP DOAN CONG NGHE PHAN PHOI NEXUS'
  }
};

export const SALES_REPRESENTATIVES = [
  {
    id: 'user-nam',
    name: 'Nguyễn Văn Nam',
    code: 'SALES-MB-01',
    role: 'Nhân viên kinh doanh (Miền Bắc)',
    phone: '0908.123.888',
    email: 'nam.nv@nexuscorp.vn',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    assignedAgencies: ['DL-01', 'DL-02']
  },
  {
    id: 'user-mai',
    name: 'Trần Thị Mai',
    code: 'SALES-MN-02',
    role: 'Nhân viên kinh doanh (Miền Nam)',
    phone: '0918.456.999',
    email: 'mai.tt@nexuscorp.vn',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
    assignedAgencies: ['DL-05', 'DL-06']
  },
  {
    id: 'user-long',
    name: 'Lê Hoàng Long',
    code: 'SALES-MT-03',
    role: 'Nhân viên kinh doanh (Miền Trung)',
    phone: '0935.223.445',
    email: 'long.lh@nexuscorp.vn',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    assignedAgencies: ['DL-03', 'DL-04']
  },
  {
    id: 'user-ha',
    name: 'Đặng Thu Hà',
    code: 'SALES-MTAY-04',
    role: 'Nhân viên kinh doanh (Miền Tây)',
    phone: '0979.667.889',
    email: 'ha.dt@nexuscorp.vn',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80',
    assignedAgencies: ['DL-07', 'DL-08']
  }
];

export const AGENCIES = [
  {
    id: 'DL-01',
    code: 'AG-HN-001',
    name: 'Công ty TNHH Đầu tư & Phân phối Ánh Dương',
    shortName: 'Đại lý Ánh Dương Hà Nội',
    taxCode: '0108923411',
    representative: 'Ông Vũ Mạnh Cường',
    repTitle: 'Giám đốc Điều hành',
    phone: '024.3829.1122',
    hotline: '0912.334.556',
    email: 'kinhdoanh@anhduongtech.vn',
    businessAddress: 'Số 42 Phố Lý Thường Kiệt, Phường Hàng Bài, Quận Hoàn Kiếm, TP. Hà Nội',
    tier: 'Kim Cương (Tier 1)',
    tierDiscountPercent: 12,
    defaultSalesRepId: 'user-nam',
    deliveryPoint: {
      name: 'Tổng kho Trung chuyển Ánh Dương Long Biên',
      address: 'Lô 18 Kho bãi Tổng hợp, Cụm Công nghiệp Long Biên, Phường Sài Đồng, Quận Long Biên, Hà Nội',
      receiverName: 'Anh Trần Minh Tuấn (Trưởng ban Kho vận)',
      receiverPhone: '0988.112.233',
      deliveryTimeframe: 'Giờ hành chính (8h30 - 17h00) từ Thứ 2 đến Thứ 7',
      shippingNotes: 'Đường rộng xe tải 10 tấn vào được, yêu cầu liên hệ trước 45 phút để sắp xếp cửa bốc dỡ.'
    }
  },
  {
    id: 'DL-02',
    code: 'AG-HP-002',
    name: 'Công ty Cổ phần Thương mại Thiết bị Thăng Long',
    shortName: 'Đại lý Thăng Long Hải Phòng',
    taxCode: '0201889922',
    representative: 'Bà Hoàng Thị Lan',
    repTitle: 'Chủ tịch HĐQT',
    phone: '0225.378.4455',
    hotline: '0904.556.789',
    email: 'contact@thanglonghp.com.vn',
    businessAddress: '145 Đại lộ Lê Hồng Phong, Phường Đông Khê, Quận Ngô Quyền, TP. Hải Phòng',
    tier: 'Vàng (Tier 2)',
    tierDiscountPercent: 10,
    defaultSalesRepId: 'user-nam',
    deliveryPoint: {
      name: 'Showroom & Kho Thiết bị Thăng Long',
      address: '145 Đại lộ Lê Hồng Phong, Quận Ngô Quyền, TP. Hải Phòng',
      receiverName: 'Chị Đào Tuyết Mai (Phụ trách giao nhận)',
      receiverPhone: '0936.778.899',
      deliveryTimeframe: 'Buổi sáng: 9h00 - 11h30, Buổi chiều: 14h00 - 17h00',
      shippingNotes: 'Mặt tiền trung tâm, xe tải 2.5 tấn ra vào giờ thấp điểm.'
    }
  },
  {
    id: 'DL-03',
    code: 'AG-DN-003',
    name: 'Công ty TNHH Giải pháp Nhà Thông minh Sao Mai',
    shortName: 'Đại lý Sao Mai Đà Nẵng',
    taxCode: '0401992233',
    representative: 'Ông Nguyễn Văn Thanh',
    repTitle: 'Tổng Giám đốc',
    phone: '0236.388.9911',
    hotline: '0905.123.456',
    email: 'sales@saomaismarthome.vn',
    businessAddress: '230 Đường Điện Biên Phủ, Phường Chính Gián, Quận Thanh Khê, TP. Đà Nẵng',
    tier: 'Vàng (Tier 2)',
    tierDiscountPercent: 10,
    defaultSalesRepId: 'user-long',
    deliveryPoint: {
      name: 'Kho Phân phối Sao Mai Miền Trung',
      address: 'Khu công nghiệp Hòa Khánh mở rộng, Quận Liên Chiểu, TP. Đà Nẵng',
      receiverName: 'Anh Huỳnh Quốc Bảo (Kho vận)',
      receiverPhone: '0914.889.911',
      deliveryTimeframe: 'Tất cả các ngày trong tuần (trừ Chủ Nhật)',
      shippingNotes: 'Có cầu nâng bốc dỡ pallet chuyên dụng.'
    }
  },
  {
    id: 'DL-05',
    code: 'AG-HCM-005',
    name: 'Công ty Cổ phần Thương mại & Công nghệ Sài Gòn Star',
    shortName: 'Đại lý Sài Gòn Star TP.HCM',
    taxCode: '0309988776',
    representative: 'Bà Trần Thu Nguyệt',
    repTitle: 'Phó Giám đốc Thương mại',
    phone: '028.3822.8899',
    hotline: '0918.456.789',
    email: 'info@saigonstartech.vn',
    businessAddress: 'Tòa nhà Star Center, 72 Lê Thánh Tôn, Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    tier: 'Kim Cương (Tier 1)',
    tierDiscountPercent: 15,
    defaultSalesRepId: 'user-mai',
    deliveryPoint: {
      name: 'Tổng kho Phân phối Phía Nam Sài Gòn Star',
      address: '512 An Dương Vương, Phường 4, Quận 5, TP. Hồ Chí Minh',
      receiverName: 'Anh Lê Bá Khoa (Quản lý kho)',
      receiverPhone: '0909.445.678',
      deliveryTimeframe: '7h30 - 18h00 hàng ngày',
      shippingNotes: 'Đường cấm tải theo khung giờ 6h-9h và 16h-20h. Vui lòng cho xe vào ngoài giờ cấm.'
    }
  },
  {
    id: 'DL-06',
    code: 'AG-BD-006',
    name: 'Công ty TNHH Kỹ thuật Gia Định Tech',
    shortName: 'Đại lý Gia Định Tech Bình Dương',
    taxCode: '0274379667',
    representative: 'Ông Đỗ Quốc Huy',
    repTitle: 'Giám đốc',
    phone: '0274.379.6677',
    hotline: '0919.223.344',
    email: 'support@giadinh-tech.vn',
    businessAddress: 'Đại lộ Bình Dương, Phường Phú Hòa, TP. Thủ Dầu Một, Tỉnh Bình Dương',
    tier: 'Bạc (Tier 3)',
    tierDiscountPercent: 8,
    defaultSalesRepId: 'user-mai',
    deliveryPoint: {
      name: 'Kho Thiết bị Gia Định VSIP 1',
      address: 'Đường số 6, Khu công nghiệp VSIP 1, TP. Thuận An, Tỉnh Bình Dương',
      receiverName: 'Anh Nguyễn Minh Đức',
      receiverPhone: '0938.665.544',
      deliveryTimeframe: '8h00 - 16h30',
      shippingNotes: 'Yêu cầu nhân viên giao hàng mặc đồ bảo hộ (giày mũi sắt, áo phản quang).'
    }
  },
  {
    id: 'DL-07',
    code: 'AG-CT-007',
    name: 'Doanh nghiệp Tư nhân Thiết bị Điện Mekong Delta',
    shortName: 'Đại lý Mekong Delta Cần Thơ',
    taxCode: '1801772211',
    representative: 'Ông Lê Văn Hậu',
    repTitle: 'Chủ Doanh nghiệp',
    phone: '0292.381.1234',
    hotline: '0939.888.999',
    email: 'mekongdelta.ct@gmail.com',
    businessAddress: '78 Đường 3 Tháng 2, Phường Xuân Khánh, Quận Ninh Kiều, TP. Cần Thơ',
    tier: 'Tiêu chuẩn (Tier 3)',
    tierDiscountPercent: 8,
    defaultSalesRepId: 'user-ha',
    deliveryPoint: {
      name: 'Cửa hàng & Kho Mekong Delta Ninh Kiều',
      address: '78 Đường 3 Tháng 2, Phường Xuân Khánh, Quận Ninh Kiều, TP. Cần Thơ',
      receiverName: 'Anh Hậu (Chủ đại lý trực tiếp nhận)',
      receiverPhone: '0939.888.999',
      deliveryTimeframe: '7h30 - 20h00',
      shippingNotes: 'Giao hàng tận nơi, hỗ trợ xếp gọn vào kệ trưng bày.'
    }
  }
];

export const PRODUCTS = [
  {
    sku: 'SKU-SM-001',
    name: 'Khóa cửa vân tay thông minh SmartLock G2 Pro (Kết nối Wifi & App)',
    unit: 'Bộ',
    category: 'SmartHome',
    basePrice: 4200000,
    specs: 'Hợp kim nhôm nguyên khối, mở bằng Vân tay FPC Thụy Điển, Mã số ảo, Thẻ từ RFID, Chìa cơ'
  },
  {
    sku: 'SKU-GD-002',
    name: 'Robot hút bụi lau nhà tự giặt giẻ sấy nhiệt Omni Clean X1 Max',
    unit: 'Chiếc',
    category: 'Gia dụng thông minh',
    basePrice: 8900000,
    specs: 'Lực hút 6000Pa, Dock sạc tự đổ rác và cấp thoát nước tự động, Định vị Laser LDS 3D'
  },
  {
    sku: 'SKU-GD-003',
    name: 'Máy lọc không khí & tạo ẩm phòng lớn AirPure Max Pro Plasma',
    unit: 'Chiếc',
    category: 'Gia dụng thông minh',
    basePrice: 4650000,
    specs: 'Màng lọc True HEPA H13 khử khuẩn 99.97%, cảm biến bụi mịn PM2.5, diện tích 65m²'
  },
  {
    sku: 'SKU-SEC-004',
    name: 'Camera an ninh AI ngoài trời 4K Ultra Vision Xoay 360 độ ban đêm có màu',
    unit: 'Chiếc',
    category: 'Thiết bị An ninh',
    basePrice: 2890000,
    specs: 'Cảm biến Sony Starvis 8MP, chuẩn chống nước IP67, đàm thoại 2 chiều, còi hú báo động'
  },
  {
    sku: 'SKU-SM-005',
    name: 'Bộ điều khiển trung tâm Zigbee 3.0 & Matter Gateway Multi-Hub',
    unit: 'Cái',
    category: 'SmartHome',
    basePrice: 1350000,
    specs: 'Hỗ trợ đồng thời 128 thiết bị con, kết nối LAN Gigabit + Wifi kép, tương thích Apple HomeKit'
  },
  {
    sku: 'SKU-SM-006',
    name: 'Cảm biến hiện diện người chuyển động vi sóng Radar mmWave 24GHz',
    unit: 'Cái',
    category: 'SmartHome',
    basePrice: 650000,
    specs: 'Phát hiện hơi thở và người ngồi tĩnh, góc quét 120 độ, gắn trần thạch cao'
  },
  {
    sku: 'SKU-SM-007',
    name: 'Công tắc cảm ứng thông minh mặt kính cường lực viền nhôm 3 nút',
    unit: 'Cái',
    category: 'SmartHome',
    basePrice: 580000,
    specs: 'Đèn nền LED ban đêm, công suất 800W/nút, không cần dây nguội (No Neutral optional)'
  },
  {
    sku: 'SKU-SEC-008',
    name: 'Khóa cổng vân tay thẻ từ thẻ căn cước ngoài trời Chống nước tuyệt đối IP68',
    unit: 'Bộ',
    category: 'Thiết bị An ninh',
    basePrice: 3450000,
    specs: 'Thép không gỉ SUS 304, 2 mặt vân tay trong/ngoài, quản lý từ xa qua App Bluetooth/Wifi'
  }
];

export const INITIAL_ORDERS = [
  {
    orderId: 'NX-ORD-202610-8801',
    barcodeText: 'NX-ORD-202610-8801',
    createdAt: '2026-10-20T10:30:00',
    expectedDeliveryDate: '2026-10-22',
    agencyId: 'DL-01',
    salesRepId: 'user-nam',
    status: 'CONFIRMED_ON_SITE', // Đại lý xác nhận tại chỗ
    statusText: 'Đại lý đã duyệt & Ký nhận tại chỗ',
    paymentMethod: 'Chuyển khoản công nợ (Hạn mức B2B Net 30)',
    vatRate: 0.08, // 8% VAT
    shippingFee: 250000,
    shippingFeeDiscount: 250000, // Miễn phí vận chuyển cho đơn trên 30 triệu
    generalNotes: 'Nhân viên kinh doanh Nguyễn Văn Nam trực tiếp lên đơn và chốt hợp đồng bổ sung hàng quý 4/2026 tại văn phòng đại lý. Đại lý yêu cầu giao đúng giờ để kịp thi công dự án Vinhomes Ocean Park.',
    signedByAgent: {
      isSigned: true,
      signDate: '2026-10-20T11:15:20',
      signerName: 'Vũ Mạnh Cường',
      signatureDataUrl: null // Sẽ render chữ ký mẫu đẹp
    },
    items: [
      {
        sku: 'SKU-SM-001',
        name: 'Khóa cửa vân tay thông minh SmartLock G2 Pro (Kết nối Wifi & App)',
        unit: 'Bộ',
        quantity: 8,
        unitPrice: 4200000,
        lineDiscountPercent: 5,
        note: 'Giao kèm 16 thẻ từ RFID phụ'
      },
      {
        sku: 'SKU-GD-002',
        name: 'Robot hút bụi lau nhà tự giặt giẻ sấy nhiệt Omni Clean X1 Max',
        unit: 'Chiếc',
        quantity: 2,
        unitPrice: 8900000,
        lineDiscountPercent: 0,
        note: 'Hàng nguyên seal nguyên kiện pallet'
      },
      {
        sku: 'SKU-SM-005',
        name: 'Bộ điều khiển trung tâm Zigbee 3.0 & Matter Gateway Multi-Hub',
        unit: 'Cái',
        quantity: 10,
        unitPrice: 1350000,
        lineDiscountPercent: 8,
        note: 'Phiên bản firmware mới nhất v2.4.1'
      },
      {
        sku: 'SKU-SM-007',
        name: 'Công tắc cảm ứng thông minh mặt kính cường lực viền nhôm 3 nút',
        unit: 'Cái',
        quantity: 30,
        unitPrice: 580000,
        lineDiscountPercent: 10,
        note: 'Màu xám kim loại sang trọng'
      }
    ]
  },
  {
    orderId: 'NX-ORD-202610-8802',
    barcodeText: 'NX-ORD-202610-8802',
    createdAt: '2026-10-20T14:15:00',
    expectedDeliveryDate: '2026-10-23',
    agencyId: 'DL-05',
    salesRepId: 'user-mai',
    status: 'PENDING_AGENT_SIGN',
    statusText: 'Chờ đại lý xem lại & Ký xác nhận',
    paymentMethod: 'Chuyển khoản đặt cọc 30% (Số dư thanh toán sau khi nhận hàng)',
    vatRate: 0.08,
    shippingFee: 0, // Tổng kho nội thành miễn phí
    shippingFeeDiscount: 0,
    generalNotes: 'Đơn hàng cung cấp dự án Căn hộ cao cấp Grand Marina Saigon Q.1. Đại lý yêu cầu đầy đủ chứng nhận xuất xưởng (CO/CQ) và tem bảo hành điện tử chính hãng.',
    signedByAgent: {
      isSigned: false,
      signDate: null,
      signerName: '',
      signatureDataUrl: null
    },
    items: [
      {
        sku: 'SKU-SM-001',
        name: 'Khóa cửa vân tay thông minh SmartLock G2 Pro (Kết nối Wifi & App)',
        unit: 'Bộ',
        quantity: 25,
        unitPrice: 4200000,
        lineDiscountPercent: 12,
        note: 'Màu Đen mờ Titan dự án'
      },
      {
        sku: 'SKU-SEC-004',
        name: 'Camera an ninh AI ngoài trời 4K Ultra Vision Xoay 360 độ ban đêm có màu',
        unit: 'Chiếc',
        quantity: 15,
        unitPrice: 2890000,
        lineDiscountPercent: 10,
        note: 'Tặng kèm chân đế gắn tường kim loại'
      },
      {
        sku: 'SKU-SM-006',
        name: 'Cảm biến hiện diện người chuyển động vi sóng Radar mmWave 24GHz',
        unit: 'Cái',
        quantity: 40,
        unitPrice: 650000,
        lineDiscountPercent: 15,
        note: 'Đóng gói hộp 10 chiếc/kiện'
      }
    ]
  },
  {
    orderId: 'NX-ORD-202610-8803',
    barcodeText: 'NX-ORD-202610-8803',
    createdAt: '2026-10-19T16:00:00',
    expectedDeliveryDate: '2026-10-21',
    agencyId: 'DL-02',
    salesRepId: 'user-nam',
    status: 'CONFIRMED_ON_SITE',
    statusText: 'Đã xác nhận & Đang soạn kho',
    paymentMethod: 'Chuyển khoản trực tiếp (Thanh toán 100%)',
    vatRate: 0.08,
    shippingFee: 150000,
    shippingFeeDiscount: 150000,
    generalNotes: 'Đại lý Thăng Long nhập bổ sung sản phẩm máy lọc không khí và robot hút bụi đón mùa đông Hải Phòng.',
    signedByAgent: {
      isSigned: true,
      signDate: '2026-10-19T16:45:00',
      signerName: 'Hoàng Thị Lan',
      signatureDataUrl: null
    },
    items: [
      {
        sku: 'SKU-GD-003',
        name: 'Máy lọc không khí & tạo ẩm phòng lớn AirPure Max Pro Plasma',
        unit: 'Chiếc',
        quantity: 6,
        unitPrice: 4650000,
        lineDiscountPercent: 8,
        note: 'Tặng kèm 1 lõi lọc phụ dự phòng'
      },
      {
        sku: 'SKU-GD-002',
        name: 'Robot hút bụi lau nhà tự giặt giẻ sấy nhiệt Omni Clean X1 Max',
        unit: 'Chiếc',
        quantity: 3,
        unitPrice: 8900000,
        lineDiscountPercent: 10,
        note: 'Kiểm tra kỹ nẹp chống sốc'
      }
    ]
  },
  {
    orderId: 'NX-ORD-202610-8804',
    barcodeText: 'NX-ORD-202610-8804',
    createdAt: '2026-10-19T09:40:00',
    expectedDeliveryDate: '2026-10-22',
    agencyId: 'DL-03',
    salesRepId: 'user-long',
    status: 'CONFIRMED_ON_SITE',
    statusText: 'Đã xác nhận - Chờ điều phối xe',
    paymentMethod: 'Chuyển khoản công nợ (Net 15)',
    vatRate: 0.08,
    shippingFee: 300000,
    shippingFeeDiscount: 300000,
    generalNotes: 'Giao hàng đến kho KCN Hòa Khánh Đà Nẵng, bốc hàng bằng pallet tiêu chuẩn.',
    signedByAgent: {
      isSigned: true,
      signDate: '2026-10-19T10:20:00',
      signerName: 'Nguyễn Văn Thanh',
      signatureDataUrl: null
    },
    items: [
      {
        sku: 'SKU-SEC-008',
        name: 'Khóa cổng vân tay thẻ từ thẻ căn cước ngoài trời Chống nước tuyệt đối IP68',
        unit: 'Bộ',
        quantity: 12,
        unitPrice: 3450000,
        lineDiscountPercent: 12,
        note: 'Phiên bản khóa cơ chống cắt cấp độ 5'
      },
      {
        sku: 'SKU-SEC-004',
        name: 'Camera an ninh AI ngoài trời 4K Ultra Vision Xoay 360 độ ban đêm có màu',
        unit: 'Chiếc',
        quantity: 10,
        unitPrice: 2890000,
        lineDiscountPercent: 10,
        note: 'Tặng kèm thẻ nhớ chuyên dụng 128GB'
      }
    ]
  },
  {
    orderId: 'NX-ORD-202610-8805',
    barcodeText: 'NX-ORD-202610-8805',
    createdAt: '2026-10-18T15:20:00',
    expectedDeliveryDate: '2026-10-21',
    agencyId: 'DL-07',
    salesRepId: 'user-ha',
    status: 'CONFIRMED_ON_SITE',
    statusText: 'Đã xác nhận tại cửa hàng',
    paymentMethod: 'Tiền mặt khi giao hàng (COD)',
    vatRate: 0.08,
    shippingFee: 180000,
    shippingFeeDiscount: 180000,
    generalNotes: 'Nhân viên kinh doanh Đặng Thu Hà đến trực tiếp cửa hàng tại Ninh Kiều - Cần Thơ tư vấn và lên đơn.',
    signedByAgent: {
      isSigned: true,
      signDate: '2026-10-18T16:00:00',
      signerName: 'Lê Văn Hậu',
      signatureDataUrl: null
    },
    items: [
      {
        sku: 'SKU-SM-001',
        name: 'Khóa cửa vân tay thông minh SmartLock G2 Pro (Kết nối Wifi & App)',
        unit: 'Bộ',
        quantity: 4,
        unitPrice: 4200000,
        lineDiscountPercent: 8,
        note: 'Hướng dẫn đại lý cài đặt demo mẫu trưng bày'
      },
      {
        sku: 'SKU-SM-007',
        name: 'Công tắc cảm ứng thông minh mặt kính cường lực viền nhôm 3 nút',
        unit: 'Cái',
        quantity: 20,
        unitPrice: 580000,
        lineDiscountPercent: 8,
        note: 'Màu trắng ngọc trai'
      },
      {
        sku: 'SKU-SM-005',
        name: 'Bộ điều khiển trung tâm Zigbee 3.0 & Matter Gateway Multi-Hub',
        unit: 'Cái',
        quantity: 5,
        unitPrice: 1350000,
        lineDiscountPercent: 5,
        note: 'Kèm nguồn cắm Type-C'
      }
    ]
  }
];
