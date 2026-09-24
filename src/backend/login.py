import datetime
from flask import request, jsonify
# Giả định bạn đã import db và model User

# LƯU Ý: Trong thực tế, bạn nên dùng Redis để lưu cache số lần sai thay vì Dictionary 
# để tránh mất dữ liệu khi restart server hoặc chạy nhiều worker.
login_attempts = {}
lockout_status = {}

def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    # 1. Kiểm tra trạng thái khóa tài khoản (15 phút)
    if username in lockout_status:
        if datetime.datetime.now() < lockout_status[username]:
            # Vẫn đang trong thời gian khóa. 
            # Vẫn trả về thông báo chung chung, không tiết lộ là tài khoản đang bị khóa
            return jsonify({"error": "Tên đăng nhập hoặc mật khẩu không chính xác."}), 401
        else:
            # Hết 15 phút, gỡ khóa để cho phép thử lại
            del lockout_status[username]
            login_attempts[username] = 0

    # Lấy thông tin user từ Database
    user = db.session.query(User).filter_by(username=username).first()

    # 2. Xử lý sai thông tin (Không tồn tại user HOẶC sai mật khẩu)
    if not user or not check_password_hash(user.password_hash, password):
        # Tăng số lần đếm đăng nhập sai
        attempts = login_attempts.get(username, 0) + 1
        login_attempts[username] = attempts

        if attempts >= 5:
            # Khóa tài khoản 15 phút sau 5 lần sai
            lockout_status[username] = datetime.datetime.now() + datetime.timedelta(minutes=15)

        # Trả về thông báo chung chung, tuyệt đối không tiết lộ user có tồn tại hay không
        return jsonify({"error": "Tên đăng nhập hoặc mật khẩu không chính xác."}), 401

    # 3. Đăng nhập thành công: Reset số lần sai
    login_attempts[username] = 0

    # Điều hướng trang chủ theo vai trò (Role-based)
    role_redirects = {
        "admin": "/admin/dashboard",
        "sales": "/sales/home",
        "warehouse": "/inventory/home"
    }
    
    # Mặc định về trang default nếu role không khớp
    redirect_url = role_redirects.get(user.role, "/default-home")

    return jsonify({
        "message": "Đăng nhập thành công",
        "redirect_url": redirect_url,
        "token": "jwt_token_cua_ban_o_day" 
    }), 200