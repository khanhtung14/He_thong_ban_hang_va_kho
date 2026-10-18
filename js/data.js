/**
 * INITIAL MOCK DATA - DOANH NGHIỆP THƯƠNG MẠI & BÁN LẺ TOÀN QUỐC
 * Hệ thống Quản lý Đơn hàng (OMS) & Tồn kho Kho bãi (WMS)
 */

const INITIAL_PRODUCTS = [
  {
    id: "PROD-001",
    sku: "LAP-DELL-XPS15",
    name: "Dell XPS 15 9530 (i7-13700H, 32GB, 1TB RTX 4060)",
    category: "Laptop Cao Cấp",
    price: 48500000,
    physicalStock: 25, // Tồn thực tế trong kho
    reservedStock: 7,  // Đang giữ chỗ cho các đơn chưa xuất
    unit: "Máy",
    binLocation: "Kệ A1-Tầng 2 (Kho Thủ Đức)",
    image: "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=200&auto=format&fit=crop&q=80"
  },
  {
    id: "PROD-002",
    sku: "DISP-LG-34WN80C",
    name: "Màn hình cong LG UltraWide 34WN80C-B 34 inch IPS HDR10",
    category: "Màn hình",
    price: 13900000,
    physicalStock: 18,
    reservedStock: 4,
    unit: "Cái",
    binLocation: "Kệ B3-Tầng 1 (Kho Thủ Đức)",
    image: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=200&auto=format&fit=crop&q=80"
  },
  {
    id: "PROD-003",
    sku: "MOU-LOGI-MXM3S",
    name: "Chuột không dây Logitech MX Master 3S Quiet (Graphite)",
    category: "Phụ kiện",
    price: 2450000,
    physicalStock: 60,
    reservedStock: 12,
    unit: "Chiếc",
    binLocation: "Kệ C2-Tầng 3 (Kho Thủ Đức)",
    image: "https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=200&auto=format&fit=crop&q=80"
  },
  {
    id: "PROD-004",
    sku: "KB-KEYCH-K8PRO",
    name: "Bàn phím cơ không dây Keychron K8 Pro RGB Hotswap",
    category: "Phụ kiện",
    price: 2890000,
    physicalStock: 35,
    reservedStock: 5,
    unit: "Chiếc",
    binLocation: "Kệ C2-Tầng 1 (Kho Thủ Đức)",
    image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=200&auto=format&fit=crop&q=80"
  },
  {
    id: "PROD-005",
    sku: "CHAIR-HERMAN-AERON",
    name: "Ghế công thái học Herman Miller Aeron Remastered (Size B)",
    category: "Nội thất",
    price: 36500000,
    physicalStock: 10,
    reservedStock: 2,
    unit: "Chiếc",
    binLocation: "Khu Vực Hàng Cồng Kềnh (Zone D)",
    image: "https://images.unsplash.com/photo-1580481077195-c324a3aef39c?w=200&auto=format&fit=crop&q=80"
  }
];

// Danh sách trạng thái chuẩn theo đề bài:
// Nháp -> Chờ duyệt -> Đã duyệt -> Đang soạn hàng -> Đã xuất -> Đã giao -> Đóng, và nhánh Huỷ
const ORDER_STATUSES = {
  DRAFT: {
    key: "DRAFT",
    label: "Nháp",
    badgeClass: "badge-draft",
    stepIndex: 0,
    color: "#64748b",
    description: "Đơn mới tạo bởi Sales, đang lưu nháp, chưa tác động tồn kho."
  },
  PENDING_APPROVAL: {
    key: "PENDING_APPROVAL",
    label: "Chờ duyệt",
    badgeClass: "badge-pending",
    stepIndex: 1,
    color: "#f59e0b",
    description: "Chờ Quản lý kinh doanh duyệt chiết khấu và điều khoản công nợ."
  },
  APPROVED: {
    key: "APPROVED",
    label: "Đã duyệt",
    badgeClass: "badge-approved",
    stepIndex: 2,
    color: "#3b82f6",
    description: "Quản lý đã duyệt. Đơn lập tức GIỮ CHỖ TỒN KHO tại kho Thủ Đức."
  },
  PICKING: {
    key: "PICKING",
    label: "Đang soạn hàng",
    badgeClass: "badge-picking",
    stepIndex: 3,
    color: "#8b5cf6",
    description: "Thủ kho đang lấy hàng từ vị trí kệ, đóng gói và in phiếu xuất kho."
  },
  DISPATCHED: {
    key: "DISPATCHED",
    label: "Đã xuất",
    badgeClass: "badge-dispatched",
    stepIndex: 4,
    color: "#06b6d4",
    description: "Đã xuất kho, bàn giao đơn vị vận chuyển. KHÔNG THỂ HUỶ TRỰC TIẾP (Phải trả hàng)."
  },
  DELIVERED: {
    key: "DELIVERED",
    label: "Đã giao",
    badgeClass: "badge-delivered",
    stepIndex: 5,
    color: "#10b981",
    description: "Khách hàng đã ký nhận thành công và kiểm tra biên bản bàn giao."
  },
  CLOSED: {
    key: "CLOSED",
    label: "Đóng",
    badgeClass: "badge-closed",
    stepIndex: 6,
    color: "#059669",
    description: "Đơn hàng hoàn tất đối soát tài chính, kế toán hạch toán xong."
  },
  CANCELLED: {
    key: "CANCELLED",
    label: "Đã huỷ",
    badgeClass: "badge-cancelled",
    stepIndex: -1,
    color: "#ef4444",
    description: "Đã huỷ đơn. Bắt buộc nhập lý do và hệ thống tự động giải phóng tồn giữ chỗ."
  },
  RETURN_PROCESSING: {
    key: "RETURN_PROCESSING",
    label: "Đang trả hàng (RMA)",
    badgeClass: "badge-returned",
    stepIndex: -2,
    color: "#d97706",
    description: "Đơn đã xuất bị phát sinh sự cố, chuyển sang đường xử lý trả hàng hoàn kho."
  }
};

const INITIAL_ORDERS = [
  {
    id: "ORD-2026-0891",
    code: "SO-891",
    createdAt: "2026-10-16 09:15",
    updatedAt: "2026-10-16 11:30",
    salesRep: {
      id: "SALES-01",
      name: "Trần Minh Quân",
      email: "quan.tm@techcorp.vn",
      phone: "0912.888.777"
    },
    customer: {
      name: "Công ty Cổ phần Công nghệ DigiViet",
      contact: "Anh Phạm Hoàng Long (Giám đốc CNTT)",
      phone: "0908.123.456",
      email: "long.ph@digiviet.com.vn",
      address: "Tầng 8, Tòa nhà Bitexco, Q.1, TP. Hồ Chí Minh"
    },
    items: [
      {
        productId: "PROD-001",
        sku: "LAP-DELL-XPS15",
        name: "Dell XPS 15 9530 (i7-13700H, 32GB, 1TB RTX 4060)",
        unitPrice: 48500000,
        quantity: 2,
        reserved: true,
        binLocation: "Kệ A1-Tầng 2 (Kho Thủ Đức)"
      },
      {
        productId: "PROD-003",
        sku: "MOU-LOGI-MXM3S",
        name: "Chuột không dây Logitech MX Master 3S Quiet (Graphite)",
        unitPrice: 2450000,
        quantity: 2,
        reserved: true,
        binLocation: "Kệ C2-Tầng 3 (Kho Thủ Đức)"
      }
    ],
    status: "PICKING", // Đang soạn hàng - Rất phù hợp để test xem kho & huỷ nhả tồn
    warehouse: {
      name: "Kho Tổng Thủ Đức (Khu Công nghệ Cao)",
      operatorName: "Lê Văn Hùng (Mã kho NV-302)",
      binSummary: "Kệ A1-T2 & C2-T3",
      pickProgress: "2 / 2 sản phẩm đang đóng gói carton",
      dispatchNoteNumber: "PK-2026-0891"
    },
    paymentMethod: "Chuyển khoản công nợ 30 ngày",
    notes: "Giao giờ hành chính, gọi trước 30 phút để anh Long xếp chỗ nhận hàng",
    cancellation: null,
    returnOrder: null,
    history: [
      {
        time: "2026-10-16 09:15",
        actor: "Trần Minh Quân (Sales)",
        action: "Tạo đơn hàng nháp",
        detail: "Khởi tạo đơn hàng từ báo giá BG-2026-442"
      },
      {
        time: "2026-10-16 09:40",
        actor: "Trần Minh Quân (Sales)",
        action: "Gửi phê duyệt chiết khấu",
        detail: "Áp dụng chiết khấu 3% theo chính sách khách hàng thân thiết B2B"
      },
      {
        time: "2026-10-16 10:15",
        actor: "Nguyễn Tuấn Kiệt (Sales Manager)",
        action: "Phê duyệt đơn hàng",
        detail: "Duyệt chiết khấu. Hệ thống tự động kích hoạt GIỮ CHỖ TỒN KHO cho 2 Laptop & 2 Chuột."
      },
      {
        time: "2026-10-16 11:30",
        actor: "Lê Văn Hùng (Thủ kho)",
        action: "Tiếp nhận soạn hàng",
        detail: "Đã in phiếu nhặt hàng (Pick List) và bắt đầu kiểm tra ngoại quan sản phẩm tại Kệ A1-T2."
      }
    ]
  },
  {
    id: "ORD-2026-0888",
    code: "SO-888",
    createdAt: "2026-10-15 14:00",
    updatedAt: "2026-10-16 08:30",
    salesRep: {
      id: "SALES-01",
      name: "Trần Minh Quân",
      email: "quan.tm@techcorp.vn",
      phone: "0912.888.777"
    },
    customer: {
      name: "Viện Thiết Kế & Truyền Thông Sáng Tạo F-Studio",
      contact: "Chị Mai Phương Thảo",
      phone: "0934.567.890",
      email: "thao.mp@fstudio.design",
      address: "128 Nguyễn Đình Chiểu, P. Đa Kao, Quận 1, TP. HCM"
    },
    items: [
      {
        productId: "PROD-002",
        sku: "DISP-LG-34WN80C",
        name: "Màn hình cong LG UltraWide 34WN80C-B 34 inch IPS HDR10",
        unitPrice: 13900000,
        quantity: 3,
        reserved: false, // đã xuất nên trừ thẳng vào tồn, không còn giữ chỗ
        binLocation: "Kệ B3-Tầng 1 (Kho Thủ Đức)"
      }
    ],
    status: "DISPATCHED", // Đã xuất - ĐỂ TEST LUẬT "ĐÃ XUẤT KHO THÌ KHÔNG ĐƯỢC HUỶ, PHẢI TRẢ HÀNG"
    warehouse: {
      name: "Kho Tổng Thủ Đức (Khu Công nghệ Cao)",
      operatorName: "Lê Văn Hùng (Mã kho NV-302)",
      binSummary: "Kệ B3-T1",
      pickProgress: "Đã đóng pallet bọc xốp cẩn thận",
      dispatchNoteNumber: "XK-2026-0045"
    },
    carrier: {
      name: "Giao Hàng Tiết Kiệm B2B",
      trackingCode: "GHTK-B2B-998877",
      driverPhone: "0987.333.222 (Tài xế Nguyễn Văn Ba)"
    },
    paymentMethod: "Thanh toán ngay qua Thẻ tín dụng Doanh nghiệp",
    notes: "Hàng giá trị cao và dễ vỡ, yêu cầu xe tải chuyên dụng có bửng nâng hạ",
    cancellation: null,
    returnOrder: null,
    history: [
      {
        time: "2026-10-15 14:00",
        actor: "Trần Minh Quân (Sales)",
        action: "Tạo đơn hàng",
        detail: "Tạo đơn hàng màn hình chuyên đồ hoạ"
      },
      {
        time: "2026-10-15 14:30",
        actor: "Nguyễn Tuấn Kiệt (Sales Manager)",
        action: "Phê duyệt đơn hàng",
        detail: "Duyệt nhanh. Giữ chỗ 3 Màn hình LG 34 inch."
      },
      {
        time: "2026-10-15 16:00",
        actor: "Lê Văn Hùng (Thủ kho)",
        action: "Hoàn tất soạn hàng",
        detail: "Kiểm tra tem bảo hành chính hãng và niêm phong thùng."
      },
      {
        time: "2026-10-16 08:30",
        actor: "Lê Văn Hùng (Thủ kho)",
        action: "Xác nhận xuất kho",
        detail: "Xuất kho thành công theo Phiếu XK-2026-0045. Trừ 3 cái vào tồn vật lý. Bàn giao xe GHTK."
      }
    ]
  },
  {
    id: "ORD-2026-0895",
    code: "SO-895",
    createdAt: "2026-10-16 10:45",
    updatedAt: "2026-10-16 10:45",
    salesRep: {
      id: "SALES-01",
      name: "Trần Minh Quân",
      email: "quan.tm@techcorp.vn",
      phone: "0912.888.777"
    },
    customer: {
      name: "Tập đoàn Đầu tư An Phú Gia",
      contact: "Trần Minh Tuấn (Phòng Mua hàng)",
      phone: "0919.888.999",
      email: "tuan.tm@anphugia.vn",
      address: "Tòa nhà IPC, 1489 Nguyễn Văn Linh, Quận 7, TP. HCM"
    },
    items: [
      {
        productId: "PROD-005",
        sku: "CHAIR-HERMAN-AERON",
        name: "Ghế công thái học Herman Miller Aeron Remastered (Size B)",
        unitPrice: 36500000,
        quantity: 2,
        reserved: false,
        binLocation: "Khu Vực Hàng Cồng Kềnh (Zone D)"
      }
    ],
    status: "DRAFT", // Nháp
    warehouse: {
      name: "Kho Tổng Thủ Đức",
      operatorName: "Chờ điều phối",
      binSummary: "Zone D",
      pickProgress: "Chưa phân công",
      dispatchNoteNumber: null
    },
    paymentMethod: "Chuyển khoản 100% trước khi giao",
    notes: "Khách đang cân nhắc thêm phiên bản màu xám Mineral",
    cancellation: null,
    returnOrder: null,
    history: [
      {
        time: "2026-10-16 10:45",
        actor: "Trần Minh Quân (Sales)",
        action: "Tạo đơn nháp",
        detail: "Khởi tạo đơn hàng sơ bộ chờ xác nhận màu sắc"
      }
    ]
  },
  {
    id: "ORD-2026-0870",
    code: "SO-870",
    createdAt: "2026-10-14 11:20",
    updatedAt: "2026-10-14 15:45",
    salesRep: {
      id: "SALES-01",
      name: "Trần Minh Quân",
      email: "quan.tm@techcorp.vn",
      phone: "0912.888.777"
    },
    customer: {
      name: "Startup Fintech AlphaPay",
      contact: "Vũ Hải Đăng (Tech Lead)",
      phone: "0977.112.233",
      email: "dang.vu@alphapay.io",
      address: "Saigon Hi-Tech Park, TP. Thủ Đức, TP. HCM"
    },
    items: [
      {
        productId: "PROD-004",
        sku: "KB-KEYCH-K8PRO",
        name: "Bàn phím cơ không dây Keychron K8 Pro RGB Hotswap",
        unitPrice: 2890000,
        quantity: 5,
        reserved: false,
        binLocation: "Kệ C2-Tầng 1 (Kho Thủ Đức)"
      }
    ],
    status: "CANCELLED", // Đã huỷ mẫu - Để giảng viên xem lại vết huỷ và nhả tồn
    warehouse: {
      name: "Kho Tổng Thủ Đức",
      operatorName: "Hệ thống tự động",
      binSummary: "Kệ C2-T1",
      pickProgress: "Đã giải phóng 5 chiếc giữ chỗ",
      dispatchNoteNumber: null
    },
    paymentMethod: "Chuyển khoản",
    notes: "Đơn mua trang bị cho nhân sự mới quý 4",
    cancellation: {
      cancelledAt: "2026-10-14 15:45",
      cancelledBy: "Trần Minh Quân (Sales)",
      reasonCategory: "Khách hàng thay đổi kế hoạch / ngân sách",
      detailedReason: "Khách hoãn tuyển dụng quý 4 nên yêu cầu huỷ đơn để chờ ngân sách năm sau. Đã thông báo khách và hoàn trả tồn kho.",
      inventoryReleased: true,
      releasedQuantities: [
        { sku: "KB-KEYCH-K8PRO", qty: 5 }
      ]
    },
    returnOrder: null,
    history: [
      {
        time: "2026-10-14 11:20",
        actor: "Trần Minh Quân (Sales)",
        action: "Tạo đơn hàng",
        detail: "Tạo đơn 5 phím cơ Keychron"
      },
      {
        time: "2026-10-14 13:10",
        actor: "Nguyễn Tuấn Kiệt (Sales Manager)",
        action: "Phê duyệt đơn hàng",
        detail: "Đã duyệt và giữ chỗ 5 phím cơ tại Kệ C2-T1."
      },
      {
        time: "2026-10-14 15:45",
        actor: "Trần Minh Quân (Sales)",
        action: "Huỷ đơn hàng & Giải phóng tồn kho",
        detail: "Lý do: Khách hàng hoãn kế hoạch mua sắm. Hệ thống tự động nhả 5 chiếc đang giữ chỗ về tồn khả dụng."
      }
    ]
  },
  {
    id: "ORD-2026-0865",
    code: "SO-865",
    createdAt: "2026-10-13 08:30",
    updatedAt: "2026-10-15 16:30",
    salesRep: {
      id: "SALES-01",
      name: "Trần Minh Quân",
      email: "quan.tm@techcorp.vn",
      phone: "0912.888.777"
    },
    customer: {
      name: "Trường Quốc Tế Gateway Academy",
      contact: "Cô Nguyễn Hồng Hạnh",
      phone: "0903.445.667",
      email: "hanh.nh@gateway.edu.vn",
      address: "Khu Đô Thị Sala, TP. Thủ Đức, TP. HCM"
    },
    items: [
      {
        productId: "PROD-001",
        sku: "LAP-DELL-XPS15",
        name: "Dell XPS 15 9530 (i7-13700H, 32GB, 1TB RTX 4060)",
        unitPrice: 48500000,
        quantity: 1,
        reserved: false,
        binLocation: "Kệ A1-Tầng 2 (Kho Thủ Đức)"
      }
    ],
    status: "DELIVERED", // Đã giao thành công
    warehouse: {
      name: "Kho Tổng Thủ Đức",
      operatorName: "Lê Văn Hùng (Thủ kho)",
      binSummary: "Kệ A1-T2",
      pickProgress: "Hoàn tất bàn giao",
      dispatchNoteNumber: "XK-2026-0038"
    },
    carrier: {
      name: "Ahamove Tải 1 Tấn",
      trackingCode: "AHA-554412",
      driverPhone: "0918.222.111"
    },
    paymentMethod: "Chuyển khoản",
    notes: "Phòng tin học - Lầu 3",
    cancellation: null,
    returnOrder: null,
    history: [
      {
        time: "2026-10-13 08:30",
        actor: "Trần Minh Quân (Sales)",
        action: "Tạo đơn",
        detail: "Đơn mua bổ sung cho giáo viên đồ hoạ"
      },
      {
        time: "2026-10-13 10:00",
        actor: "Nguyễn Tuấn Kiệt (Manager)",
        action: "Duyệt đơn",
        detail: "Duyệt đơn hàng và giữ chỗ tồn"
      },
      {
        time: "2026-10-14 09:00",
        actor: "Lê Văn Hùng (Thủ kho)",
        action: "Xuất kho",
        detail: "Xuất kho phiếu XK-2026-0038"
      },
      {
        time: "2026-10-15 16:30",
        actor: "Ahamove (Đơn vị vận chuyển)",
        action: "Giao hàng thành công",
        detail: "Cô Hạnh đã ký biên bản bàn giao đầy đủ phụ kiện"
      }
    ]
  }
];

// Lịch sử biến động tồn kho (Stock Movement Audit Logs)
const INITIAL_STOCK_LOGS = [
  {
    id: "LOG-1001",
    timestamp: "2026-10-16 10:15",
    sku: "LAP-DELL-XPS15",
    orderCode: "SO-891",
    type: "RESERVE", // Giữ chỗ
    quantityDelta: 2,
    operator: "Hệ thống (Trigger: Duyệt đơn SO-891)",
    note: "Tăng giữ chỗ từ 5 -> 7. Tồn khả dụng giảm tương ứng."
  },
  {
    id: "LOG-1002",
    timestamp: "2026-10-16 10:15",
    sku: "MOU-LOGI-MXM3S",
    orderCode: "SO-891",
    type: "RESERVE",
    quantityDelta: 2,
    operator: "Hệ thống (Trigger: Duyệt đơn SO-891)",
    note: "Tăng giữ chỗ từ 10 -> 12. Tồn khả dụng giảm tương ứng."
  },
  {
    id: "LOG-1003",
    timestamp: "2026-10-16 08:30",
    sku: "DISP-LG-34WN80C",
    orderCode: "SO-888",
    type: "DISPATCH_DEDUCT", // Xuất kho trừ tồn thực
    quantityDelta: -3,
    operator: "Lê Văn Hùng (Thủ kho - Phiếu XK-2026-0045)",
    note: "Xuất kho giao khách. Trừ trực tiếp vào tồn thực tế: 21 -> 18. Giải phóng giữ chỗ 3."
  },
  {
    id: "LOG-1004",
    timestamp: "2026-10-14 15:45",
    sku: "KB-KEYCH-K8PRO",
    orderCode: "SO-870",
    type: "RELEASE_CANCEL", // Huỷ đơn nhả tồn
    quantityDelta: -5,
    operator: "Hệ thống (Trigger: Huỷ đơn SO-870 bởi Sales)",
    note: "Huỷ đơn SO-870. Giải phóng 5 tồn giữ chỗ về tồn khả dụng ngay lập tức."
  }
];
