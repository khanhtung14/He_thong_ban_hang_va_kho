import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger("email_service")


class EmailService:
    def __init__(self):
        self.sent_emails: List[Dict] = []
        self._simulate_failure: bool = False

    def set_simulate_failure(self, should_fail: bool):
        """Dùng cho testing: giả lập lỗi kết nối máy chủ gửi email"""
        self._simulate_failure = should_fail

    def build_activation_email_content(
        self,
        full_name: str,
        username: str,
        temp_password: str,
        login_url: str = "/login"
    ) -> Dict[str, str]:
        """Tạo nội dung email kích hoạt tài khoản chuẩn theo AC3"""
        subject = "[Hệ Thống] Thông báo kích hoạt tài khoản nhân viên mới"

        text_content = f"""Xin chào {full_name},

Tài khoản của bạn trên Hệ Thống Quản Lý Bán Hàng & Kho đã được khởi tạo thành công.

Thông tin đăng nhập ban đầu:
- Tên tài khoản: {username}
- Mật khẩu tạm thời: {temp_password}
- Đường dẫn đăng nhập: {login_url}

LƯU Ý QUAN TRỌNG:
Vì lý do bảo mật, bạn BẮT BUỘC phải đổi mật khẩu mới trong lần đăng nhập đầu tiên trước khi có thể truy cập các tính năng của hệ thống.

Trân trọng,
Bộ phận Quản trị hệ thống.
"""

        html_content = f"""
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: Arial, sans-serif; background-color: #f4f6f9; color: #333; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
    .header {{ background: #2563eb; color: #ffffff; padding: 24px; text-align: center; }}
    .header h2 {{ margin: 0; font-size: 20px; }}
    .content {{ padding: 24px; line-height: 1.6; }}
    .cred-box {{ background: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0; border-radius: 4px; }}
    .cred-item {{ margin: 8px 0; font-size: 15px; }}
    .cred-val {{ font-family: monospace; font-weight: bold; color: #1e293b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; }}
    .btn {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; margin-top: 10px; }}
    .warning {{ background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px; border-radius: 6px; margin: 20px 0; font-size: 14px; }}
    .footer {{ background: #f8fafc; text-align: center; padding: 16px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Hệ Thống Quản Lý Bán Hàng & Kho</h2>
    </div>
    <div class="content">
      <p>Xin chào <strong>{full_name}</strong>,</p>
      <p>Tài khoản của bạn trên hệ thống đã được khởi tạo thành công để bạn có thể nhận địa bàn làm việc.</p>

      <div class="cred-box">
        <div class="cred-item">Tên tài khoản: <span class="cred-val">{username}</span></div>
        <div class="cred-item">Mật khẩu tạm thời: <span class="cred-val">{temp_password}</span></div>
      </div>

      <div class="warning">
        <strong>Lưu ý bảo mật:</strong> Mật khẩu tạm thời này có hiệu lực ban đầu. Bạn bắt buộc phải đổi mật khẩu mới trong lần đăng nhập đầu tiên.
      </div>

      <p style="text-align: center;">
        <a href="{login_url}" class="btn">Đăng nhập hệ thống</a>
      </p>
    </div>
    <div class="footer">
      Email này được gửi tự động từ Hệ thống Quản trị. Vui lòng không trả lời trực tiếp email này.
    </div>
  </div>
</body>
</html>
"""
        return {
            "subject": subject,
            "text": text_content,
            "html": html_content
        }

    def send_activation_email(
        self,
        to_email: str,
        full_name: str,
        username: str,
        temp_password: str,
        login_url: str = "/login"
    ) -> bool:
        """
        Gửi email kích hoạt tài khoản kèm mật khẩu tạm.
        Trả về True nếu thành công, False nếu thất bại.
        """
        if self._simulate_failure:
            logger.error(f"Lỗi gửi email kích hoạt tới {to_email}: Giả lập mất kết nối SMTP/Mail server")
            return False

        try:
            content = self.build_activation_email_content(
                full_name=full_name,
                username=username,
                temp_password=temp_password,
                login_url=login_url
            )

            record = {
                "to_email": to_email,
                "full_name": full_name,
                "username": username,
                "temp_password": temp_password,
                "subject": content["subject"],
                "text": content["text"],
                "html": content["html"],
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "status": "SENT"
            }
            self.sent_emails.append(record)
            logger.info(f"Đã gửi email kích hoạt tài khoản '{username}' tới '{to_email}' thành công.")
            return True
        except Exception as e:
            logger.error(f"Lỗi ngoại lệ khi gửi email tới {to_email}: {str(e)}")
            return False

    def get_sent_emails(self, email: Optional[str] = None) -> List[Dict]:
        """Truy xuất lịch sử email đã gửi"""
        if email:
            return [e for e in self.sent_emails if e["to_email"] == email]
        return list(self.sent_emails)

    def clear(self):
        """Xóa lịch sử gửi email (dùng cho tests)"""
        self.sent_emails.clear()
        self._simulate_failure = False


# Singleton instance
email_service = EmailService()
