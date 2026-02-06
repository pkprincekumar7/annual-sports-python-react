import logging
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Dict

import aiosmtplib

from .config import get_settings


logger = logging.getLogger("identity-service.email")
settings = get_settings()


def _smtp_config() -> Dict[str, str]:
    provider = settings.email_provider
    if provider == "gmail":
        if not settings.gmail_user or not settings.gmail_app_password:
            return {}
        return {
            "host": "smtp.gmail.com",
            "port": 587,
            "user": settings.gmail_user,
            "password": settings.gmail_app_password,
        }
    if provider == "sendgrid":
        if not settings.sendgrid_api_key:
            return {}
        return {
            "host": "smtp.sendgrid.net",
            "port": 587,
            "user": settings.sendgrid_user or "apikey",
            "password": settings.sendgrid_api_key,
        }
    if provider == "resend":
        if not settings.resend_api_key:
            return {}
        return {
            "host": "smtp.resend.com",
            "port": 587,
            "user": "resend",
            "password": settings.resend_api_key,
        }
    if provider == "smtp":
        if not settings.smtp_host or not settings.smtp_user or not settings.smtp_password:
            return {}
        return {
            "host": settings.smtp_host,
            "port": settings.smtp_port,
            "user": settings.smtp_user,
            "password": settings.smtp_password,
            "secure": settings.smtp_secure,
        }
    return {}


async def send_password_reset_email(
    to_email: str, new_password: str, recipient_name: str = "User"
) -> Dict[str, str]:
    config = _smtp_config()
    if not config:
        logger.error("Email transporter not configured. Cannot send email.")
        return {"success": False, "error": "Email service not configured. Please contact administrator."}

    from_email = settings.email_from or settings.gmail_user or "noreply@sportsevent.com"
    from_name = settings.email_from_name
    app_name = settings.app_name

    current_year = str(datetime.now(timezone.utc).year)
    safe_name = recipient_name or "User"
    html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }}
    .container {{
      background-color: #f9f9f9;
      border-radius: 10px;
      padding: 30px;
      border: 1px solid #ddd;
    }}
    .header {{
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 10px 10px 0 0;
      text-align: center;
      margin: -30px -30px 20px -30px;
    }}
    .password-box {{
      background-color: #fff;
      border: 2px solid #667eea;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
      font-size: 24px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 2px;
    }}
    .warning {{
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }}
    .footer {{
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{app_name}</h1>
      <h2>Password Reset Request</h2>
    </div>

    <p>Hello {safe_name},</p>

    <p>You have requested to reset your password for your account. Your new temporary password is:</p>

    <div class="password-box">
      {new_password}
    </div>

    <div class="warning">
      <strong>⚠️ Important:</strong> For security reasons, you will be required to change this password immediately after logging in.
    </div>

    <p>Please use this password to log in, and then change it to a password of your choice.</p>

    <p>If you did not request this password reset, please contact the administrator immediately.</p>

    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
      <p>&copy; {current_year} {app_name}. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
""".strip()

    text_body = f"""
Password Reset - {app_name}

Hello {safe_name},

You have requested to reset your password for your account. Your new temporary password is:

{new_password}

IMPORTANT: For security reasons, you will be required to change this password immediately after logging in.

Please use this password to log in, and then change it to a password of your choice.

If you did not request this password reset, please contact the administrator immediately.

This is an automated email. Please do not reply to this message.

© {current_year} {app_name}. All rights reserved.
""".strip()

    message = EmailMessage()
    message["Subject"] = "Password Reset - Sports Event Management"
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=config["host"],
            port=config["port"],
            username=config["user"],
            password=config["password"],
            start_tls=not config.get("secure", False),
            use_tls=config.get("secure", False),
        )
        return {"success": True}
    except Exception as exc:
        logger.error("Error sending password reset email: %s", exc)
        return {"success": False, "error": str(exc)}
