/**
 * Dữ liệu giả lập hệ thống Quản lý Bán hàng & Phân phối Doanh nghiệp
 * Enterprise Sales & Distribution Management System (SCRUM-86 / SCRUM-14)
 */

export const USERS = [
  {
    id: 'user-admin',
    name: 'Nguyễn Hữu Trí',
    role: 'manager',
    roleTitle: 'Quản lý kinh doanh (Toàn quyền)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80',
    assignedAgents: ['all'],
    email: 'tri.nh@enterprisesales.vn'
  },
  {
    id: 'user-nam',
    name: 'Nguyễn Văn Nam',
    role: 'sales',
    roleTitle: 'Nhân viên kinh doanh (Miền Bắc)',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    assignedAgents: ['DL-01', 'DL-02'],
    email: 'nam.nv@enterprisesales.vn'
  },
  {
    id: 'user-mai',
    name: 'Trần Thị Mai',
    role: 'sales',
    roleTitle: 'Nhân viên kinh doanh (Miền Nam)',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80',
    assignedAgents: ['DL-05', 'DL-06'],
    email: 'mai.tt@enterprisesales.vn'
  },
  {
    id: 'user-long',
    name: 'Lê Hoàng Long',
    role: 'sales',
    roleTitle: 'Nhân viên kinh doanh (Miền Trung)',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    assignedAgents: ['DL-03', 'DL-04'],
    email: 'long.lh@enterprisesales.vn'
  },
  {
    id: 'user-ha',
    name: 'Đặng Thu Hà',
    role: 'sales',
    roleTitle: 'Nhân viên kinh doanh (Miền Tây)',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80',
    assignedAgents: ['DL-07', 'DL-08'],
    email: 'ha.dt@enterprisesales.vn'
  }
];

export const REGIONS = [
  { id: 'MB', name: 'Miền Bắc', code: 'MB' },
  { id: 'MT', name: 'Miền Trung', code: 'MT' },
  { id: 'MN', name: 'Miền Nam', code: 'MN' },
  { id: 'MTay', name: 'Miền Tây', code: 'MTay' }
];

export const AGENTS = [
  { id: 'DL-01', name: 'Đại lý Ánh Dương Hà Nội', regionId: 'MB', salesRepId: 'user-nam', phone: '024.3829.1122', address: 'Hoàn Kiếm, Hà Nội' },
  { id: 'DL-02', name: 'Đại lý Thăng Long Hải Phòng', regionId: 'MB', salesRepId: 'user-nam', phone: '0225.378.4455', address: 'Hồng Bàng, Hải Phòng' },
  { id: 'DL-03', name: 'Đại lý Sao Mai Đà Nẵng', regionId: 'MT', salesRepId: 'user-long', phone: '0236.388.9911', address: 'Hải Châu, Đà Nẵng' },
  { id: 'DL-04', name: 'Đại lý Miền Trung Xanh Nghệ An', regionId: 'MT', salesRepId: 'user-long', phone: '0238.355.2233', address: 'TP. Vinh, Nghệ An' },
  { id: 'DL-05', name: 'Đại lý Sài Gòn Star Q.1', regionId: 'MN', salesRepId: 'user-mai', phone: '028.3822.8899', address: 'Quận 1, TP. Hồ Chí Minh' },
  { id: 'DL-06', name: 'Đại lý Gia Định Tech Bình Dương', regionId: 'MN', salesRepId: 'user-mai', phone: '0274.379.6677', address: 'Thủ Dầu Một, Bình Dương' },
  { id: 'DL-07', name: 'Đại lý Mekong Delta Cần Thơ', regionId: 'MTay', salesRepId: 'user-ha', phone: '0292.381.1234', address: 'Ninh Kiều, TP. Cần Thơ' },
  { id: 'DL-08', name: 'Đại lý Tây Đô An Giang', regionId: 'MTay', salesRepId: 'user-ha', phone: '0296.385.5566', address: 'Long Xuyên, An Giang' }
];

export const ORDER_STATUSES = [
  { id: 'pending', label: 'Chờ duyệt', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', icon: 'clock' },
  { id: 'processing', label: 'Đang xử lý', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)', icon: 'cog' },
  { id: 'shipping', label: 'Đang giao hàng', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)', icon: 'truck' },
  { id: 'completed', label: 'Hoàn thành', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', icon: 'check-circle' },
  { id: 'cancelled', label: 'Đã hủy', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', icon: 'x-circle' }
];

export const PRODUCTS = [
  { id: 'P01', name: 'Khóa cửa vân tay thông minh SmartLock G2', price: 4200000, category: 'SmartHome' },
  { id: 'P02', name: 'Robot hút bụi lau nhà Omni Clean X1', price: 8900000, category: 'Gia dụng' },
  { id: 'P03', name: 'Máy lọc không khí AirPure Max Pro', price: 4650000, category: 'Gia dụng' },
  { id: 'P04', name: 'Hệ thống Camera an ninh AI 4K Ultra', price: 2890000, category: 'An ninh' },
  { id: 'P05', name: 'Bộ điều khiển trung tâm Zigbee Gateway Hub', price: 1350000, category: 'SmartHome' },
  { id: 'P06', name: 'Cảm biến chuyển động và nhiệt độ IoT', price: 650000, category: 'SmartHome' },
  { id: 'P07', name: 'Công tắc cảm ứng thông minh 3 nút Wifi', price: 580000, category: 'SmartHome' }
];

// Sinh danh sách 60 đơn hàng mẫu cực kỳ chân thực, bao quát các ngày trong tháng 10/2026 và tháng trước
export const ORDERS = [
  {
    id: 'ORD-2026-1001',
    createdAt: '2026-10-17T09:15:00',
    customer: { name: 'Công ty CP Công Nghệ Bách Khoa', phone: '0912.345.678', address: 'Tòa nhà Landmark 72, Cầu Giấy, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[0], quantity: 5, unitPrice: 4200000, discount: 5 },
      { product: PRODUCTS[4], quantity: 5, unitPrice: 1350000, discount: 0 }
    ],
    totalAmount: 26700000,
    status: 'pending',
    paymentMethod: 'Chuyển khoản doanh nghiệp (Net 15)',
    paymentStatus: 'Chờ thanh toán',
    notes: 'Khách yêu cầu giao trước thứ 2 tuần sau để nghiệm thu công trình.'
  },
  {
    id: 'ORD-2026-1002',
    createdAt: '2026-10-17T08:30:00',
    customer: { name: 'Khách sạn Novotel Danang', phone: '0905.888.999', address: '36 Bạch Đằng, Hải Châu, Đà Nẵng' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[0], quantity: 12, unitPrice: 4200000, discount: 10 },
      { product: PRODUCTS[3], quantity: 8, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 67324000,
    status: 'processing',
    paymentMethod: 'Chuyển khoản (Đã thanh toán 50%)',
    paymentStatus: 'Đã tạm ứng 50%',
    notes: 'Dự án tân trang 12 phòng Suite VIP.'
  },
  {
    id: 'ORD-2026-1003',
    createdAt: '2026-10-16T16:45:00',
    customer: { name: 'Tập đoàn Bất Động Sản Vạn Khang', phone: '0983.123.456', address: 'Nguyễn Thị Minh Khai, Quận 1, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[1], quantity: 10, unitPrice: 8900000, discount: 8 },
      { product: PRODUCTS[2], quantity: 15, unitPrice: 4650000, discount: 5 }
    ],
    totalAmount: 148142500,
    status: 'shipping',
    paymentMethod: 'Hợp đồng bảo lãnh ngân hàng',
    paymentStatus: 'Đã bảo lãnh',
    notes: 'Đang vận chuyển từ kho tổng Bình Dương đến công trình.'
  },
  {
    id: 'ORD-2026-1004',
    createdAt: '2026-10-16T14:20:00',
    customer: { name: 'Showroom Nội thất Cao cấp Cần Thơ', phone: '0939.777.666', address: '30 Tháng 4, Hưng Lợi, Ninh Kiều, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 4, unitPrice: 4200000, discount: 0 },
      { product: PRODUCTS[5], quantity: 20, unitPrice: 650000, discount: 10 }
    ],
    totalAmount: 28500000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản 100%',
    paymentStatus: 'Đã thanh toán',
    notes: 'Đã bàn giao và ký biên bản kiểm định chất lượng.'
  },
  {
    id: 'ORD-2026-1005',
    createdAt: '2026-10-16T11:10:00',
    customer: { name: 'Resort Biển Cửa Lò Nghệ An', phone: '0977.222.111', address: 'Bình Minh, TX Cửa Lò, Nghệ An' },
    agentId: 'DL-04',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[3], quantity: 15, unitPrice: 2890000, discount: 7 }
    ],
    totalAmount: 40315500,
    status: 'completed',
    paymentMethod: 'Chuyển khoản',
    paymentStatus: 'Đã thanh toán',
    notes: 'Hoàn tất nghiệm thu lắp đặt camera ven biển.'
  },
  {
    id: 'ORD-2026-1006',
    createdAt: '2026-10-15T15:30:00',
    customer: { name: 'Khu Đô Thị Ecopark Hưng Yên (Cung cấp qua Thăng Long)', phone: '0904.555.444', address: 'Khu Rừng Cọ, Ecopark, Hưng Yên' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[1], quantity: 6, unitPrice: 8900000, discount: 5 },
      { product: PRODUCTS[2], quantity: 8, unitPrice: 4650000, discount: 5 }
    ],
    totalAmount: 86070000,
    status: 'completed',
    paymentMethod: 'Ủy nhiệm chi',
    paymentStatus: 'Đã thanh toán',
    notes: 'Giao đợt 1 cho các căn biệt thự mẫu.'
  },
  {
    id: 'ORD-2026-1007',
    createdAt: '2026-10-15T10:00:00',
    customer: { name: 'Công ty TNHH Đầu tư Việt Nhật KCN VSIP', phone: '0988.666.333', address: 'Đại lộ Hữu Nghị, VSIP 1, Thuận An, Bình Dương' },
    agentId: 'DL-06',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[3], quantity: 10, unitPrice: 2890000, discount: 5 },
      { product: PRODUCTS[4], quantity: 4, unitPrice: 1350000, discount: 0 },
      { product: PRODUCTS[6], quantity: 30, unitPrice: 580000, discount: 10 }
    ],
    totalAmount: 48515000,
    status: 'shipping',
    paymentMethod: 'Chuyển khoản (Net 30)',
    paymentStatus: 'Chờ thanh toán theo kỳ',
    notes: 'Hàng đã xuất kho Thuận An, đang điều phối xe giao.'
  },
  {
    id: 'ORD-2026-1008',
    createdAt: '2026-10-14T17:25:00',
    customer: { name: 'Văn phòng Công chứng Long Xuyên', phone: '0918.444.888', address: 'Trần Hưng Đạo, P. Mỹ Bình, TP Long Xuyên' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 2, unitPrice: 4200000, discount: 0 },
      { product: PRODUCTS[2], quantity: 2, unitPrice: 4650000, discount: 0 }
    ],
    totalAmount: 17700000,
    status: 'completed',
    paymentMethod: 'Tiền mặt khi giao hàng',
    paymentStatus: 'Đã thu tiền',
    notes: 'Khách hàng rất hài lòng với chất lượng khóa cửa.'
  },
  {
    id: 'ORD-2026-1009',
    createdAt: '2026-10-14T13:40:00',
    customer: { name: 'Trung tâm Tiệc cưới Trống Đồng Hà Nội', phone: '0903.111.222', address: 'Hoàng Quốc Việt, Cầu Giấy, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[2], quantity: 12, unitPrice: 4650000, discount: 8 },
      { product: PRODUCTS[3], quantity: 6, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 67827000,
    status: 'processing',
    paymentMethod: 'Chuyển khoản ngân hàng',
    paymentStatus: 'Đã tạm ứng 30%',
    notes: 'Yêu cầu kiểm tra bộ màng lọc HEPA kỹ lưỡng trước khi đóng gói.'
  },
  {
    id: 'ORD-2026-1010',
    createdAt: '2026-10-14T09:00:00',
    customer: { name: 'Chuỗi Cà Phê The Highland Sun', phone: '0979.333.444', address: 'Quang Trung, TP Vinh, Nghệ An' },
    agentId: 'DL-04',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[3], quantity: 4, unitPrice: 2890000, discount: 0 },
      { product: PRODUCTS[6], quantity: 12, unitPrice: 580000, discount: 5 }
    ],
    totalAmount: 18172000,
    status: 'cancelled',
    paymentMethod: 'Chuyển khoản',
    paymentStatus: 'Đã hủy đơn',
    notes: 'Khách hàng thay đổi kế hoạch thiết kế chuỗi, xin hủy đơn hẹn tháng 11.'
  },
  {
    id: 'ORD-2026-1011',
    createdAt: '2026-10-13T16:00:00',
    customer: { name: 'Bệnh viện Quốc tế Phụ Sản Sài Gòn', phone: '0908.777.222', address: 'Bùi Thị Xuân, Quận 1, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[2], quantity: 20, unitPrice: 4650000, discount: 10 }
    ],
    totalAmount: 83700000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản qua kho bạc y tế',
    paymentStatus: 'Đã thanh toán',
    notes: 'Trang bị phòng sinh cao cấp vô trùng.'
  },
  {
    id: 'ORD-2026-1012',
    createdAt: '2026-10-13T10:15:00',
    customer: { name: 'Khu biệt thự Nam Long Riverside Cần Thơ', phone: '0945.888.333', address: 'Hưng Thạnh, Cái Răng, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 8, unitPrice: 4200000, discount: 5 },
      { product: PRODUCTS[1], quantity: 3, unitPrice: 8900000, discount: 5 }
    ],
    totalAmount: 57305000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Vietcombank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Đã lắp đặt hoàn tất cho ban quản lý dự án.'
  },
  {
    id: 'ORD-2026-1013',
    createdAt: '2026-10-12T14:45:00',
    customer: { name: 'Trường Quốc tế Song Ngữ UK Academy Hải Phòng', phone: '0936.123.789', address: 'Lê Hồng Phong, Ngô Quyền, Hải Phòng' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[2], quantity: 15, unitPrice: 4650000, discount: 8 },
      { product: PRODUCTS[3], quantity: 12, unitPrice: 2890000, discount: 6 }
    ],
    totalAmount: 96733200,
    status: 'completed',
    paymentMethod: 'Chuyển khoản (Net 15)',
    paymentStatus: 'Đã thanh toán',
    notes: 'Lắp đặt phòng học thông minh năm học mới.'
  },
  {
    id: 'ORD-2026-1014',
    createdAt: '2026-10-12T09:30:00',
    customer: { name: 'Công ty Cổ phần Thủy Sản Sao Biển', phone: '0913.666.888', address: 'Khu công nghiệp Hòa Khánh, Liên Chiểu, Đà Nẵng' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[3], quantity: 16, unitPrice: 2890000, discount: 8 },
      { product: PRODUCTS[5], quantity: 30, unitPrice: 650000, discount: 10 }
    ],
    totalAmount: 60067200,
    status: 'completed',
    paymentMethod: 'Ủy nhiệm chi BIDV',
    paymentStatus: 'Đã thanh toán',
    notes: 'Giám sát khu chế biến thủy sản đạt chuẩn HACCP.'
  },
  {
    id: 'ORD-2026-1015',
    createdAt: '2026-10-11T16:15:00',
    customer: { name: 'Trung tâm Tiệc cưới & Sự kiện Capella Park View', phone: '0909.123.321', address: 'Đặng Văn Sâm, Phường 9, Phú Nhuận, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[1], quantity: 5, unitPrice: 8900000, discount: 5 },
      { product: PRODUCTS[2], quantity: 6, unitPrice: 4650000, discount: 5 }
    ],
    totalAmount: 68780000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản',
    paymentStatus: 'Đã thanh toán',
    notes: 'Bổ sung thiết bị làm sạch hội trường tiệc.'
  },
  {
    id: 'ORD-2026-1016',
    createdAt: '2026-10-11T11:00:00',
    customer: { name: 'Tập đoàn Dệt may Thái Tuấn Bình Dương', phone: '0982.555.777', address: 'KCN Sóng Thần 2, Dĩ An, Bình Dương' },
    agentId: 'DL-06',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[3], quantity: 20, unitPrice: 2890000, discount: 10 },
      { product: PRODUCTS[5], quantity: 40, unitPrice: 650000, discount: 12 }
    ],
    totalAmount: 74900000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Techcombank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Camera hành lang kho bãi dệt may.'
  },
  {
    id: 'ORD-2026-1017',
    createdAt: '2026-10-10T15:20:00',
    customer: { name: 'Nhà Hàng Ẩm Thực Châu Đốc An Giang', phone: '0947.666.111', address: 'Thủ Khoa Nghĩa, TP Châu Đốc, An Giang' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 3, unitPrice: 4200000, discount: 0 },
      { product: PRODUCTS[3], quantity: 4, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 23582000,
    status: 'completed',
    paymentMethod: 'Tiền mặt',
    paymentStatus: 'Đã thu tiền',
    notes: 'Lắp kho rượu và phòng VIP ẩm thực.'
  },
  {
    id: 'ORD-2026-1018',
    createdAt: '2026-10-10T08:50:00',
    customer: { name: 'Ngân hàng TMCP Quân Đội MBBank - CN Ba Đình', phone: '0915.222.999', address: 'Kim Mã, Ba Đình, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[0], quantity: 6, unitPrice: 4200000, discount: 5 },
      { product: PRODUCTS[3], quantity: 8, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 45904000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản liên ngân hàng',
    paymentStatus: 'Đã thanh toán',
    notes: 'Khóa cửa kho hồ sơ tín dụng.'
  },
  {
    id: 'ORD-2026-1019',
    createdAt: '2026-10-09T14:30:00',
    customer: { name: 'Khu Nghỉ Dưỡng Sun World Bà Nà Hills', phone: '0905.123.456', address: 'Thôn An Sơn, Hòa Ninh, Hòa Vang, Đà Nẵng' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[1], quantity: 8, unitPrice: 8900000, discount: 10 },
      { product: PRODUCTS[2], quantity: 10, unitPrice: 4650000, discount: 8 }
    ],
    totalAmount: 106860000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản (Hợp đồng năm)',
    paymentStatus: 'Đã thanh toán',
    notes: 'Trang bị cụm khách sạn Làng Pháp.'
  },
  {
    id: 'ORD-2026-1020',
    createdAt: '2026-10-09T10:00:00',
    customer: { name: 'Công ty Cổ phần Thép Pomina Hải Phòng', phone: '0936.999.888', address: 'KCN Đình Vũ, Hải An, Hải Phòng' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[3], quantity: 18, unitPrice: 2890000, discount: 8 }
    ],
    totalAmount: 47858400,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Vietinbank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Giám sát an toàn lao động phân xưởng cán thép.'
  },
  {
    id: 'ORD-2026-1021',
    createdAt: '2026-10-08T16:10:00',
    customer: { name: 'Thẩm Mỹ Viện Quốc Tế Mailisa Chi Nhánh Huỳnh Văn Bánh', phone: '0908.333.666', address: 'Huỳnh Văn Bánh, Phú Nhuận, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[2], quantity: 8, unitPrice: 4650000, discount: 5 },
      { product: PRODUCTS[1], quantity: 3, unitPrice: 8900000, discount: 5 }
    ],
    totalAmount: 60705000,
    status: 'completed',
    paymentMethod: 'Thẻ tín dụng doanh nghiệp',
    paymentStatus: 'Đã thanh toán',
    notes: 'Không gian chăm sóc khách hàng VIP.'
  },
  {
    id: 'ORD-2026-1022',
    createdAt: '2026-10-08T11:45:00',
    customer: { name: 'Trường Đại Học Cần Thơ - Khoa CNTT', phone: '0949.123.987', address: 'Khu II, Đường 3/2, P. Xuân Khánh, Q. Ninh Kiều, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[4], quantity: 10, unitPrice: 1350000, discount: 5 },
      { product: PRODUCTS[5], quantity: 50, unitPrice: 650000, discount: 15 },
      { product: PRODUCTS[6], quantity: 30, unitPrice: 580000, discount: 10 }
    ],
    totalAmount: 56110000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản kho bạc',
    paymentStatus: 'Đã thanh toán',
    notes: 'Thiết bị thực hành Lab IoT & Smart Home sinh viên.'
  },
  {
    id: 'ORD-2026-1023',
    createdAt: '2026-10-07T15:00:00',
    customer: { name: 'Cửa Hàng Điện Máy Thông Minh Ánh Dương (Bán lẻ nội bộ)', phone: '0912.888.777', address: 'Hai Bà Trưng, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[0], quantity: 3, unitPrice: 4200000, discount: 0 },
      { product: PRODUCTS[1], quantity: 2, unitPrice: 8900000, discount: 0 }
    ],
    totalAmount: 30400000,
    status: 'completed',
    paymentMethod: 'Tiền mặt',
    paymentStatus: 'Đã thanh toán',
    notes: 'Khách hàng cá nhân lắp biệt thự Ciputra.'
  },
  {
    id: 'ORD-2026-1024',
    createdAt: '2026-10-07T09:20:00',
    customer: { name: 'Khu Du Lịch Sinh Thái Cửa Hội', phone: '0978.444.111', address: 'Nghi Hải, TX Cửa Lò, Nghệ An' },
    agentId: 'DL-04',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[3], quantity: 10, unitPrice: 2890000, discount: 5 },
      { product: PRODUCTS[4], quantity: 2, unitPrice: 1350000, discount: 0 }
    ],
    totalAmount: 30155000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Agribank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Giám sát cổng vào khu vui chơi bến thuyền.'
  },
  {
    id: 'ORD-2026-1025',
    createdAt: '2026-10-06T14:10:00',
    customer: { name: 'Công ty Cổ Phần Gỗ An Cường Bình Dương', phone: '0985.333.222', address: 'ĐT 747B, Thái Hòa, Tân Uyên, Bình Dương' },
    agentId: 'DL-06',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[0], quantity: 15, unitPrice: 4200000, discount: 10 },
      { product: PRODUCTS[4], quantity: 5, unitPrice: 1350000, discount: 5 }
    ],
    totalAmount: 63112500,
    status: 'completed',
    paymentMethod: 'Chuyển khoản (Net 30)',
    paymentStatus: 'Đã thanh toán',
    notes: 'Lắp văn phòng điều hành và phòng họp quốc tế.'
  },
  {
    id: 'ORD-2026-1026',
    createdAt: '2026-10-06T10:30:00',
    customer: { name: 'Tổ Hợp Chung Cư Golden Silk An Giang', phone: '0919.222.444', address: 'Hà Hoàng Hổ, Mỹ Xuyên, Long Xuyên, An Giang' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 10, unitPrice: 4200000, discount: 8 },
      { product: PRODUCTS[6], quantity: 40, unitPrice: 580000, discount: 10 }
    ],
    totalAmount: 59520000,
    status: 'completed',
    paymentMethod: 'Ủy nhiệm chi',
    paymentStatus: 'Đã thanh toán',
    notes: 'Cung cấp block A tầng penthouse.'
  },
  {
    id: 'ORD-2026-1027',
    createdAt: '2026-10-05T16:40:00',
    customer: { name: 'Trung Tâm Thể Thao California Fitness Đà Nẵng', phone: '0905.999.333', address: 'Nguyễn Văn Linh, Nam Dương, Hải Châu, Đà Nẵng' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[2], quantity: 10, unitPrice: 4650000, discount: 8 },
      { product: PRODUCTS[1], quantity: 4, unitPrice: 8900000, discount: 6 }
    ],
    totalAmount: 76244000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Techcombank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Hệ thống khử mùi và lọc khuẩn phòng tập Yoga.'
  },
  {
    id: 'ORD-2026-1028',
    createdAt: '2026-10-05T11:20:00',
    customer: { name: 'Showroom Ô Tô VinFast Hải Phòng', phone: '0936.444.555', address: 'Lê Thánh Tông, Máy Tơ, Ngô Quyền, Hải Phòng' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[3], quantity: 14, unitPrice: 2890000, discount: 7 },
      { product: PRODUCTS[2], quantity: 6, unitPrice: 4650000, discount: 5 }
    ],
    totalAmount: 64152200,
    status: 'completed',
    paymentMethod: 'Chuyển khoản BIDV',
    paymentStatus: 'Đã thanh toán',
    notes: 'An ninh showroom trưng bày xe điện VF8 và VF9.'
  },
  {
    id: 'ORD-2026-1029',
    createdAt: '2026-10-04T15:15:00',
    customer: { name: 'Công ty Cổ phần Sữa Vinamilk - Chi Nhánh Cần Thơ', phone: '0945.777.999', address: 'KCN Trà Nóc 1, Bình Thủy, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[2], quantity: 12, unitPrice: 4650000, discount: 10 },
      { product: PRODUCTS[5], quantity: 25, unitPrice: 650000, discount: 8 }
    ],
    totalAmount: 65165000,
    status: 'completed',
    paymentMethod: 'Ủy nhiệm chi Vietinbank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Trang bị văn phòng viện nghiên cứu sữa chua.'
  },
  {
    id: 'ORD-2026-1030',
    createdAt: '2026-10-04T09:30:00',
    customer: { name: 'Tòa Nhà Văn Phòng Deutsches Haus TP. HCM', phone: '0908.888.111', address: '33 Lê Duẩn, Bến Nghé, Quận 1, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[0], quantity: 20, unitPrice: 4200000, discount: 12 },
      { product: PRODUCTS[4], quantity: 6, unitPrice: 1350000, discount: 5 }
    ],
    totalAmount: 81615000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản HSBC',
    paymentStatus: 'Đã thanh toán',
    notes: 'Dự án khách hàng doanh nghiệp châu Âu.'
  },
  {
    id: 'ORD-2026-1031',
    createdAt: '2026-10-03T16:50:00',
    customer: { name: 'Trung tâm Tiếng Anh Apollo English Hà Nội', phone: '0912.111.444', address: 'Phố Huế, Hàng Bài, Hoàn Kiếm, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[2], quantity: 14, unitPrice: 4650000, discount: 8 },
      { product: PRODUCTS[3], quantity: 8, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 81920000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản ngân hàng',
    paymentStatus: 'Đã thanh toán',
    notes: 'Lọc không khí cho các lớp mẫu giáo mầm non.'
  },
  {
    id: 'ORD-2026-1032',
    createdAt: '2026-10-03T11:00:00',
    customer: { name: 'Khách Sạn Mường Thanh Grand Cửa Lò', phone: '0977.888.333', address: 'Đường Bình Minh, Nghi Thu, Cửa Lò, Nghệ An' },
    agentId: 'DL-04',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[0], quantity: 18, unitPrice: 4200000, discount: 12 },
      { product: PRODUCTS[1], quantity: 4, unitPrice: 8900000, discount: 5 }
    ],
    totalAmount: 100344000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Vietcombank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Khóa thẻ từ và vân tay cửa phòng khách VIP.'
  },
  {
    id: 'ORD-2026-1033',
    createdAt: '2026-10-02T14:20:00',
    customer: { name: 'Khu Đô Thị Vạn Phúc City Thủ Đức', phone: '0903.666.222', address: 'Quốc Lộ 13, Hiệp Bình Phước, TP Thủ Đức' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[0], quantity: 6, unitPrice: 4200000, discount: 5 },
      { product: PRODUCTS[1], quantity: 4, unitPrice: 8900000, discount: 5 },
      { product: PRODUCTS[4], quantity: 3, unitPrice: 1350000, discount: 0 }
    ],
    totalAmount: 61810000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản',
    paymentStatus: 'Đã thanh toán',
    notes: 'Căn nhà phố thương mại shophouse.'
  },
  {
    id: 'ORD-2026-1034',
    createdAt: '2026-10-02T09:10:00',
    customer: { name: 'Viện Kiểm Sát Nhân Dân Tỉnh An Giang', phone: '0918.777.444', address: 'Tôn Đức Thắng, Mỹ Bình, TP Long Xuyên, An Giang' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[3], quantity: 12, unitPrice: 2890000, discount: 6 },
      { product: PRODUCTS[0], quantity: 4, unitPrice: 4200000, discount: 5 }
    ],
    totalAmount: 48512400,
    status: 'completed',
    paymentMethod: 'Chuyển khoản kho bạc nhà nước',
    paymentStatus: 'Đã thanh toán',
    notes: 'An ninh kiểm soát hồ sơ lưu trữ.'
  },
  {
    id: 'ORD-2026-1035',
    createdAt: '2026-10-01T15:40:00',
    customer: { name: 'Công ty Cổ phần Xây dựng Coteccons Hải Phòng', phone: '0936.888.111', address: 'Bạch Đằng, Thượng Lý, Hồng Bàng, Hải Phòng' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[1], quantity: 5, unitPrice: 8900000, discount: 6 },
      { product: PRODUCTS[2], quantity: 6, unitPrice: 4650000, discount: 5 }
    ],
    totalAmount: 68335000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản (Net 30)',
    paymentStatus: 'Đã thanh toán',
    notes: 'Trang bị văn phòng chỉ huy công trường dự án cảng.'
  },
  {
    id: 'ORD-2026-1036',
    createdAt: '2026-10-01T10:00:00',
    customer: { name: 'Khu Công Nghệ Cao Đà Nẵng - Trung Tâm Ươm Tạo', phone: '0905.444.666', address: 'Hòa Liên, Hòa Vang, TP Đà Nẵng' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[4], quantity: 8, unitPrice: 1350000, discount: 5 },
      { product: PRODUCTS[5], quantity: 40, unitPrice: 650000, discount: 10 },
      { product: PRODUCTS[6], quantity: 25, unitPrice: 580000, discount: 5 }
    ],
    totalAmount: 47435000,
    status: 'completed',
    paymentMethod: 'Ủy nhiệm chi ngân hàng ACB',
    paymentStatus: 'Đã thanh toán',
    notes: 'Khu vực thử nghiệm giải pháp nhà thông minh thế hệ mới.'
  },
  // Các đơn hàng mới phát sinh gần đây với nhiều trạng thái đa dạng
  {
    id: 'ORD-2026-1037',
    createdAt: '2026-10-17T10:05:00',
    customer: { name: 'Ngân hàng TMCP Quân Đội MB Cần Thơ', phone: '0945.333.111', address: 'Đại lộ Hòa Bình, Ninh Kiều, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[0], quantity: 6, unitPrice: 4200000, discount: 5 },
      { product: PRODUCTS[3], quantity: 6, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 40413000,
    status: 'pending',
    paymentMethod: 'Chuyển khoản nội bộ MB',
    paymentStatus: 'Chờ duyệt kế toán',
    notes: 'Đơn mới tạo sáng nay, cần trưởng phòng duyệt giá chiết khấu.'
  },
  {
    id: 'ORD-2026-1038',
    createdAt: '2026-10-17T09:40:00',
    customer: { name: 'Công ty TNHH FrieslandCampina Bình Dương', phone: '0985.111.444', address: 'KCN Thuận Giao, Thuận An, Bình Dương' },
    agentId: 'DL-06',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[2], quantity: 10, unitPrice: 4650000, discount: 5 },
      { product: PRODUCTS[1], quantity: 4, unitPrice: 8900000, discount: 5 }
    ],
    totalAmount: 77995000,
    status: 'processing',
    paymentMethod: 'Chuyển khoản doanh nghiệp',
    paymentStatus: 'Đã nhận ủy nhiệm chi',
    notes: 'Đang kiểm kho đóng gói giao trong ngày.'
  },
  {
    id: 'ORD-2026-1039',
    createdAt: '2026-10-16T17:10:00',
    customer: { name: 'Trường Đại học Kinh Tế Quốc Dân (NEU Hà Nội)', phone: '0912.777.999', address: '207 Giải Phóng, Đồng Tâm, Hai Bà Trưng, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[2], quantity: 18, unitPrice: 4650000, discount: 10 }
    ],
    totalAmount: 75330000,
    status: 'shipping',
    paymentMethod: 'Chuyển khoản kho bạc',
    paymentStatus: 'Đã tạm ứng',
    notes: 'Xe tải trung chuyển đang chạy tới cổng số 1 đường Trần Đại Nghĩa.'
  },
  {
    id: 'ORD-2026-1040',
    createdAt: '2026-10-15T08:15:00',
    customer: { name: 'Viện Hải Dương Học Nha Trang (Qua Sao Mai)', phone: '0905.777.333', address: 'Số 1 Cầu Đá, TP Nha Trang, Khánh Hòa' },
    agentId: 'DL-03',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[3], quantity: 10, unitPrice: 2890000, discount: 5 },
      { product: PRODUCTS[5], quantity: 20, unitPrice: 650000, discount: 8 }
    ],
    totalAmount: 39415000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản ngân hàng',
    paymentStatus: 'Đã thanh toán',
    notes: 'Lắp hệ thống quan sát hồ nuôi sinh vật biển.'
  },
  {
    id: 'ORD-2026-1041',
    createdAt: '2026-10-14T11:30:00',
    customer: { name: 'Khách Sạn Vinpearl Cửa Hội Nghệ An', phone: '0979.666.555', address: 'Bình Minh, TX Cửa Lò, Nghệ An' },
    agentId: 'DL-04',
    regionId: 'MT',
    salesRepId: 'user-long',
    items: [
      { product: PRODUCTS[0], quantity: 25, unitPrice: 4200000, discount: 12 },
      { product: PRODUCTS[1], quantity: 5, unitPrice: 8900000, discount: 8 }
    ],
    totalAmount: 133340000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Vingroup Finance',
    paymentStatus: 'Đã thanh toán',
    notes: 'Cung cấp đợt 2 cho các căn villa ven hồ.'
  },
  {
    id: 'ORD-2026-1042',
    createdAt: '2026-10-13T15:20:00',
    customer: { name: 'Công ty May Nhà Bè - Chi Nhánh Long Xuyên', phone: '0919.555.333', address: 'KCN Bình Hòa, Châu Thành, An Giang' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[3], quantity: 15, unitPrice: 2890000, discount: 7 },
      { product: PRODUCTS[5], quantity: 30, unitPrice: 650000, discount: 10 }
    ],
    totalAmount: 57865500,
    status: 'completed',
    paymentMethod: 'Chuyển khoản Vietcombank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Giám sát xưởng may xuất khẩu.'
  },
  {
    id: 'ORD-2026-1043',
    createdAt: '2026-10-12T11:00:00',
    customer: { name: 'Tòa nhà Bitexco Financial Tower (Văn phòng tầng 32)', phone: '0908.444.999', address: 'Số 2 Hải Triều, Bến Nghé, Quận 1, TP. HCM' },
    agentId: 'DL-05',
    regionId: 'MN',
    salesRepId: 'user-mai',
    items: [
      { product: PRODUCTS[2], quantity: 15, unitPrice: 4650000, discount: 10 },
      { product: PRODUCTS[0], quantity: 4, unitPrice: 4200000, discount: 5 }
    ],
    totalAmount: 78735000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản quốc tế Citibank',
    paymentStatus: 'Đã thanh toán',
    notes: 'Lắp phòng giao dịch tài chính chứng khoán.'
  },
  {
    id: 'ORD-2026-1044',
    createdAt: '2026-10-11T09:40:00',
    customer: { name: 'Cảng Quốc Tế Lạch Huyện Hải Phòng', phone: '0936.555.222', address: 'Thị trấn Cát Hải, Cát Hải, Hải Phòng' },
    agentId: 'DL-02',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[3], quantity: 22, unitPrice: 2890000, discount: 10 }
    ],
    totalAmount: 57222000,
    status: 'completed',
    paymentMethod: 'Chuyển khoản kho bạc Hàng hải',
    paymentStatus: 'Đã thanh toán',
    notes: 'Camera hồng ngoại soi ban đêm cảng biển nước sâu.'
  },
  {
    id: 'ORD-2026-1045',
    createdAt: '2026-10-17T11:00:00',
    customer: { name: 'Trung tâm Hội nghị Quốc gia Mỹ Đình (Sự kiện APEC)', phone: '0912.444.333', address: 'Đại lộ Thăng Long, Mễ Trì, Nam Từ Liêm, Hà Nội' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[2], quantity: 25, unitPrice: 4650000, discount: 12 },
      { product: PRODUCTS[1], quantity: 6, unitPrice: 8900000, discount: 8 }
    ],
    totalAmount: 151480000,
    status: 'pending',
    paymentMethod: 'Ủy nhiệm chi Bộ Ngoại Giao',
    paymentStatus: 'Chờ duyệt dự toán',
    notes: 'Đơn hàng giá trị cao đặc biệt phục vụ hội nghị quốc tế.'
  },
  {
    id: 'ORD-2026-1046',
    createdAt: '2026-10-17T07:50:00',
    customer: { name: 'Bệnh viện Đa khoa Trung ương Cần Thơ', phone: '0945.123.555', address: '315 Nguyễn Văn Linh, An Khánh, Ninh Kiều, Cần Thơ' },
    agentId: 'DL-07',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[2], quantity: 15, unitPrice: 4650000, discount: 10 },
      { product: PRODUCTS[3], quantity: 8, unitPrice: 2890000, discount: 5 }
    ],
    totalAmount: 84739000,
    status: 'processing',
    paymentMethod: 'Chuyển khoản ngân hàng',
    paymentStatus: 'Đã duyệt thanh toán',
    notes: 'Khử khuẩn khoa hồi sức cấp cứu ICU.'
  },
  {
    id: 'ORD-2026-1047',
    createdAt: '2026-10-16T13:20:00',
    customer: { name: 'Công ty Cổ phần Diana Unicharm Bắc Ninh (qua Ánh Dương)', phone: '0912.666.444', address: 'KCN Tiên Sơn, Tiên Du, Bắc Ninh' },
    agentId: 'DL-01',
    regionId: 'MB',
    salesRepId: 'user-nam',
    items: [
      { product: PRODUCTS[3], quantity: 12, unitPrice: 2890000, discount: 6 },
      { product: PRODUCTS[5], quantity: 25, unitPrice: 650000, discount: 8 }
    ],
    totalAmount: 47582400,
    status: 'shipping',
    paymentMethod: 'Chuyển khoản (Net 15)',
    paymentStatus: 'Chờ thanh toán',
    notes: 'Hàng trên xe trung chuyển Bắc Ninh.'
  },
  {
    id: 'ORD-2026-1048',
    createdAt: '2026-10-15T14:10:00',
    customer: { name: 'Tập đoàn Dược phẩm Bến Tre (Chi nhánh Thoại Sơn)', phone: '0918.999.222', address: 'Thị trấn Núi Sập, Thoại Sơn, An Giang' },
    agentId: 'DL-08',
    regionId: 'MTay',
    salesRepId: 'user-ha',
    items: [
      { product: PRODUCTS[2], quantity: 8, unitPrice: 4650000, discount: 5 },
      { product: PRODUCTS[0], quantity: 2, unitPrice: 4200000, discount: 0 }
    ],
    totalAmount: 43740000,
    status: 'completed',
    paymentMethod: 'Tiền mặt chuyển khoản',
    paymentStatus: 'Đã thanh toán',
    notes: 'Đã hoàn tất lắp kho đạt chuẩn GSP.'
  }
];
