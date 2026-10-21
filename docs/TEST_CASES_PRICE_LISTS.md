# Test cases: bảng giá theo nhóm khách hàng

## Chuẩn bị

- Chạy API và frontend; seed dữ liệu demo bằng `scripts/seed_demo_data.py`.
- Đăng nhập `demo_sales_mgr` để khai báo/phát hành bảng giá và duyệt đơn.
- Dùng `demo_sales` để tạo đơn bán cần quản lý duyệt.
- Dữ liệu mẫu có đại lý `DEMO-CUST-L1` (cấp 1), `DEMO-CUST-L2` (cấp 2), `DEMO-CUST-RT` (khách lẻ); SKU `SKU-001` có giá cấp 1 là 470.000 ₫, sàn 450.000 ₫.

| Mã | Yêu cầu | Các bước | Kết quả mong đợi |
|---|---|---|---|
| PL-01 | Nhiều bảng giá theo nhóm | Vào **Bảng giá**, tạo và phát hành bảng giá cho cấp 1, cấp 2 và khách lẻ với cùng SKU nhưng các giá khác nhau. | Lưu được các bảng giá; khi tạo đơn, mỗi nhóm nhận đúng giá của nhóm đó. |
| PL-02 | Thời hạn hiệu lực | Tạo bảng có ngày bắt đầu/kết thúc. Tra giá tại ngày bắt đầu, ngày kết thúc, trước ngày bắt đầu và sau ngày kết thúc. | Hai ngày biên được tính hiệu lực; ngoài khoảng ngày trả về không có giá áp dụng. Bản nháp chưa phát hành không được áp dụng. |
| PL-03 | Giá sàn và duyệt ngoại lệ | Tạo đơn với giá bằng sàn, trên sàn, rồi thấp hơn sàn. Mở **Duyệt đơn** bằng `demo_sales_mgr`. | Giá bằng/trên sàn không vào hàng chờ duyệt. Giá thấp hơn sàn có trạng thái chờ duyệt và hiển thị lý do; quản lý có thể duyệt hoặc từ chối. |
| PL-04 | Không sửa bảng giá đã phát hành | Phát hành bảng giá, sau đó thử sửa qua `PUT /api/v1/price-lists/{id}`. Dùng nút **Tạo phiên bản mới** trên bảng đã phát hành. | API từ chối sửa bảng đã phát hành (409); phiên bản mới tăng số phiên bản và mang theo nhóm, giá SKU cũ để chỉnh tiếp. |
| PL-05 | Xử lý xung đột | Tạo bảng khác mã, cùng nhóm, có SKU và khoảng ngày chồng lấn với bảng đã phát hành; sau đó thử tạo phiên bản cùng mã. | Bảng khác mã bị từ chối phát hành (409). Phiên bản tiếp theo cùng mã được phát hành và là giá được ưu tiên trong thời gian chồng lấn. |
| PL-06 | Dữ liệu giá không hợp lệ | Gửi bảng có ngày kết thúc trước ngày bắt đầu, SKU trùng, giá âm hoặc giá sàn cao hơn giá bán. | API trả 422 và không lưu bảng giá không hợp lệ. |
| PL-07 | Phân quyền | Thử tạo/phát hành bảng giá và duyệt đơn bằng `demo_sales`; thử gọi không có token. | Nhân viên bán hàng bị từ chối (403), chưa đăng nhập bị từ chối (401). Chỉ Quản lý kinh doanh/Admin thao tác được. |
| PL-08 | Điều hướng giao diện | Trong workspace Quản lý kinh doanh, mở lần lượt Đơn hàng, Khách hàng/Đại lý, Duyệt đơn, Bảng giá, Báo cáo doanh số và dùng Back/Forward. | Mỗi mục mở đúng trang riêng, URL và mục sidebar đang chọn đồng bộ; tải lại trang vẫn mở đúng chức năng. |

Các kiểm tra API/backend tự động tương ứng nằm trong `tests/test_price_lists.py`.
