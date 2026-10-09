import os
import smtplib
from dotenv import load_dotenv

load_dotenv()

host = os.getenv("SMTP_HOST")
port = int(os.getenv("SMTP_PORT", 587))
user = os.getenv("SMTP_USERNAME")
pwd = os.getenv("SMTP_PASSWORD")
use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes"}

print(f"Testing connection to {host}:{port}, SSL={use_ssl}")

try:
    if use_ssl:
        server = smtplib.SMTP_SSL(host, port, timeout=5)
    else:
        server = smtplib.SMTP(host, port, timeout=5)
        server.starttls()
    
    server.login(user, pwd)
    print("Login SUCCESSFUL!")
    server.quit()
except Exception as e:
    print(f"ERROR: {e}")
