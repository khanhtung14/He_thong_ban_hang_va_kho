"""Email Service for sending user activation and temporary credentials (SCRUM-62)."""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import logging
import os
import smtplib
from typing import Any, Dict, List, Optional

logger = logging.getLogger("email_service")


class EmailService:
    def __init__(self):
        self.sent_emails: List[Dict[str, Any]] = []
        self._simulate_failure: bool = False
        self.last_retry_count: int = 0

    def set_simulate_failure(self, should_fail: bool):
        """Simulate email dispatch failure for testing edge cases."""
        self._simulate_failure = should_fail

    def clear_sent_emails(self):
        """Clear the in-memory log of sent emails."""
        self.sent_emails.clear()
        self.last_retry_count = 0

    def build_activation_content(
        self,
        full_name: str,
        username: str,
        temp_password: str,
        login_url: str = "/login",
        activation_url: Optional[str] = None,
        expires_hours: int = 24
    ) -> Dict[str, str]:
        """Generate plaintext and HTML content for the account activation email."""
        subject = "[OMS] Kích hoạt tài khoản người dùng - Hệ thống Bán hàng & Kho"

        link_section_txt = (
            f"- Đường dẫn kích hoạt tài khoản: {activation_url} (Có hiệu lực trong vòng {expires_hours} giờ)\n"
            if activation_url
            else f"- Đường dẫn đăng nhập: {login_url}\n"
        )

        text_body = f"""Xin chào {full_name},

Tài khoản của bạn trên Hệ Thống Quản Lý Bán Hàng & Kho (OMS) đã được khởi tạo thành công.

Thông tin đăng nhập ban đầu:
- Tên đăng nhập: {username}
- Mật khẩu tạm thời: {temp_password}
{link_section_txt}
LƯU Ý BẢO MẬT:
Vì lý do an toàn, bạn BẮT BUỘC phải đổi mật khẩu trong lần đăng nhập đầu tiên trước khi thực hiện các tác vụ khác.

Trân trọng,
Bộ phận Quản trị hệ thống OMS
"""

        link_item_html = (
            f'<div class="info-item"><span class="info-label">Link kích hoạt (hạn {expires_hours}h):</span> <a href="{activation_url}">{activation_url}</a></div>'
            if activation_url
            else f'<div class="info-item"><span class="info-label">Trang đăng nhập:</span> <a href="{login_url}">{login_url}</a></div>'
        )

        html_body = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; color: #2d3748; margin: 0; padding: 20px; }}
    .card {{ max-width: 560px; margin: 20px auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }}
    .header {{ font-size: 20px; font-weight: bold; color: #2b6cb0; border-bottom: 2px solid #ebf8ff; padding-bottom: 12px; margin-bottom: 16px; }}
    .info-box {{ background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 16px; margin: 16px 0; }}
    .info-item {{ margin-bottom: 8px; font-size: 14px; }}
    .info-label {{ font-weight: 600; color: #4a5568; }}
    .warning {{ background-color: #fffaf0; border-left: 4px solid #dd6b20; padding: 12px; margin: 16px 0; font-size: 13px; color: #9c4221; }}
    .footer {{ font-size: 12px; color: #a0aec0; margin-top: 24px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">Hệ Thống Quản Lý Bán Hàng & Kho (OMS)</div>
    <p>Xin chào <strong>{full_name}</strong>,</p>
    <p>Tài khoản của bạn đã được khởi tạo thành công trên hệ thống. Dưới đây là thông tin đăng nhập tạm thời:</p>
    <div class="info-box">
      <div class="info-item"><span class="info-label">Tên đăng nhập:</span> <strong>{username}</strong></div>
      <div class="info-item"><span class="info-label">Mật khẩu tạm:</span> <code style="background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:bold;">{temp_password}</code></div>
      {link_item_html}
    </div>
    <div class="warning">
      <strong>Lưu ý bảo mật quan trọng:</strong><br>
      Vui lòng đổi mật khẩu mới ngay lần đăng nhập đầu tiên để đảm bảo an toàn tài khoản.
    </div>
    <div class="footer">
      Email này được gửi tự động từ hệ thống quản trị OMS. Vui lòng không trả lời trực tiếp email này.
    </div>
  </div>
</body>
</html>
"""
        return {"subject": subject, "text": text_body, "html": html_body}

    def send_activation_email(
        self,
        to_email: str,
        full_name: str,
        username: str,
        temp_password: str,
        login_url: str = "/login",
        activation_token: Optional[str] = None,
        activation_url: Optional[str] = None,
        max_retries: int = 3
    ) -> bool:
        """
        Send activation email with credentials, activation link, and retry mechanism.
        Implements SCRUM-101: template email, link kích hoạt có thời hạn, xử lý lỗi và retry khi gửi mail thất bại.
        """
        if not activation_url and activation_token:
            activation_url = f"{login_url}?action=activate&token={activation_token}"

        content = self.build_activation_content(
            full_name=full_name,
            username=username,
            temp_password=temp_password,
            login_url=login_url,
            activation_url=activation_url,
            expires_hours=24
        )

        record = {
            "to": to_email,
            "username": username,
            "full_name": full_name,
            "temp_password": temp_password,
            "activation_url": activation_url,
            "activation_token": activation_token,
            "subject": content["subject"],
            "text": content["text"],
            "html": content["html"]
        }

        # Simulated failure handling with retry tracking
        if self._simulate_failure:
            self.last_retry_count = 0
            for attempt in range(1, max_retries + 1):
                self.last_retry_count = attempt
                logger.warning(f"[EMAIL RETRY {attempt}/{max_retries}] Simulated failure dispatching email to {to_email}")
            logger.error(f"[EMAIL ERROR] All {max_retries} attempts failed for {to_email}")
            return False

        smtp_host = os.getenv("SMTP_HOST")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER")
        smtp_password = os.getenv("SMTP_PASSWORD")
        smtp_from = os.getenv("SMTP_FROM", smtp_user or "oms-noreply@company.com")

        if smtp_host and smtp_user and smtp_password:
            self.last_retry_count = 0
            for attempt in range(1, max_retries + 1):
                self.last_retry_count = attempt
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = content["subject"]
                    msg["From"] = smtp_from
                    msg["To"] = to_email

                    part1 = MIMEText(content["text"], "plain", "utf-8")
                    part2 = MIMEText(content["html"], "html", "utf-8")
                    msg.attach(part1)
                    msg.attach(part2)

                    with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                        server.starttls()
                        server.login(smtp_user, smtp_password)
                        server.sendmail(smtp_from, [to_email], msg.as_string())
                    logger.info(f"[EMAIL] Sent activation email to {to_email} via SMTP on attempt {attempt}")
                    self.sent_emails.append(record)
                    return True
                except Exception as exc:
                    logger.warning(f"[EMAIL RETRY {attempt}/{max_retries}] Failed sending to {to_email}: {exc}")

            logger.error(f"[EMAIL ERROR] All {max_retries} retry attempts failed for {to_email}")
            return False

        self.last_retry_count = 1
        self.sent_emails.append(record)
        logger.info(f"[EMAIL DEV] Recorded activation email to {to_email} for user {username}")
        return True


email_service = EmailService()
