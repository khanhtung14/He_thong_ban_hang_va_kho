import os

filepath = "frontend/src/features/roles/RoleWorkspace.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# I will just restore the file using the original block since it's hard to regex out the comments.
# Actually I can just do string replacement of the broken lines.
broken = """// const demoOrders = [
  { id: "DH-240815", customer: "Tạp hóa Minh Anh", total: 12400000, status: "Chờ duyệt", tone: "amber" },
  { id: "DH-240812", customer: "Đại lý Hoàng Long", total: 8600000, status: "Đang soạn", tone: "blue" },
  { id: "DH-240809", customer: "Cửa hàng Hồng Phúc", total: 15800000, status: "Đang giao", tone: "violet" },
];
// const demoCustomers = [
  { name: "Tạp hóa Minh Anh", code: "DL-HN-0148", area: "Cầu Giấy", debt: 12400000, due: "Hôm nay" },
  { name: "Đại lý Hoàng Long", code: "DL-HN-0120", area: "Đống Đa", debt: 8600000, due: "Còn 3 ngày" },
  { name: "Cửa hàng Hồng Phúc", code: "DL-HN-0091", area: "Ba Đình", debt: 0, due: "Đã đối soát" },
];"""

fixed = """const demoOrders = [
  { id: "DH-240815", customer: "Tạp hóa Minh Anh", total: 12400000, status: "Chờ duyệt", tone: "amber" },
  { id: "DH-240812", customer: "Đại lý Hoàng Long", total: 8600000, status: "Đang soạn", tone: "blue" },
  { id: "DH-240809", customer: "Cửa hàng Hồng Phúc", total: 15800000, status: "Đang giao", tone: "violet" },
];
const demoCustomers = [
  { name: "Tạp hóa Minh Anh", code: "DL-HN-0148", area: "Cầu Giấy", debt: 12400000, due: "Hôm nay" },
  { name: "Đại lý Hoàng Long", code: "DL-HN-0120", area: "Đống Đa", debt: 8600000, due: "Còn 3 ngày" },
  { name: "Cửa hàng Hồng Phúc", code: "DL-HN-0091", area: "Ba Đình", debt: 0, due: "Đã đối soát" },
];"""

content = content.replace(broken, fixed)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
