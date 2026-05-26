"""Password emails via EmailJS or SMTP (matches apis/netlify/functions/_email.js)."""

from __future__ import annotations

import html
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests


def _emailjs_config():
    return {
        "service_id": os.environ.get("EMAILJS_SERVICE_ID") or os.environ.get("VITE_EMAILJS_SERVICE_ID"),
        "template_id": os.environ.get("EMAILJS_TEMPLATE_ID") or os.environ.get("VITE_EMAILJS_TEMPLATE_ID"),
        "user_id": os.environ.get("EMAILJS_PUBLIC_KEY") or os.environ.get("VITE_EMAILJS_PUBLIC_KEY"),
        "private_key": os.environ.get("EMAILJS_PRIVATE_KEY", ""),
    }


def has_emailjs() -> bool:
    cfg = _emailjs_config()
    return bool(cfg["service_id"] and cfg["template_id"] and cfg["user_id"])


def has_smtp() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASS"))


def is_email_configured() -> bool:
    return has_emailjs() or has_smtp()


def mail_from() -> str:
    return os.environ.get("MAIL_FROM", "noreply@resgro.ai")


def _send_emailjs(template_params: dict) -> None:
    cfg = _emailjs_config()
    payload = {
        "service_id": cfg["service_id"],
        "template_id": cfg["template_id"],
        "user_id": cfg["user_id"],
        "template_params": template_params,
    }
    if cfg["private_key"]:
        payload["accessToken"] = cfg["private_key"]
    resp = requests.post(
        "https://api.emailjs.com/api/v1.0/email/send",
        json=payload,
        timeout=30,
    )
    if not resp.ok:
        raise RuntimeError(f"EmailJS failed ({resp.status_code}): {resp.text}")


def _emailjs_common_params(*, to: str, subject: str, text: str, html_body: str) -> dict:
    # The shared EmailJS template in this repo was authored for the contact form,
    # so we keep the same variable set populated for password-reset emails too.
    return {
        "to_email": to,
        "to_name": to,
        "from_name": "ResGro",
        "from_email": mail_from(),
        "reply_to": mail_from(),
        "subject": subject,
        "message": text,
        "html_message": html_body,
        "mobile": "Not provided",
        "restaurant": "Not provided",
    }


def _send_smtp(*, to: str, subject: str, text: str, html_body: str) -> None:
    port = int(os.environ.get("SMTP_PORT", "587"))
    secure = os.environ.get("SMTP_SECURE", "").lower() == "true" or port == 465
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = mail_from()
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html_body, "html"))
    if secure:
        server = smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port)
    else:
        server = smtplib.SMTP(os.environ["SMTP_HOST"], port)
        server.starttls()
    server.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
    server.sendmail(mail_from(), [to], msg.as_string())
    server.quit()


def _dispatch(*, to: str, subject: str, text: str, html_body: str, template_params: dict) -> None:
    if has_emailjs():
        _send_emailjs(template_params)
        return
    if has_smtp():
        _send_smtp(to=to, subject=subject, text=text, html_body=html_body)
        return
    raise RuntimeError("Email is not configured (set EmailJS or SMTP_* env vars).")


def send_password_reset_email(*, to: str, name: str, short_code: str, app_origin: str = "") -> None:
    subject = "Reset your ResGro password"
    origin = app_origin.rstrip("/")
    lines = [
        f"Hi {name or 'there'},",
        "",
        f"Your password reset code is: {short_code}",
        "",
        "This code expires in 30 minutes. If you did not request this, you can ignore this email.",
        "",
    ]
    if origin:
        lines.append(f"Sign in: {origin}/#/get-started")
    lines.extend(["", "— ResGro"])
    text = "\n".join(lines)
    link = f'{origin}/#/get-started' if origin else ""
    html_body = f"""
    <p>Hi {html.escape(name or 'there')},</p>
    <p>Your password reset code is:</p>
    <p style="font-size:22px;font-weight:700;letter-spacing:0.12em;">{html.escape(short_code)}</p>
    <p style="color:#555;font-size:14px;">This code expires in 30 minutes.</p>
    {f'<p><a href="{html.escape(link)}">Open ResGro</a></p>' if link else ''}
    <p>— ResGro</p>
    """
    _dispatch(
        to=to,
        subject=subject,
        text=text,
        html_body=html_body,
        template_params={
            **_emailjs_common_params(to=to, subject=subject, text=text, html_body=html_body),
            "to_name": name or "User",
            "reset_code": short_code,
            "app_origin": app_origin,
        },
    )


def send_password_changed_email(*, to: str, name: str = "", app_origin: str = "") -> None:
    subject = "Your ResGro password was changed"
    origin = app_origin.rstrip("/")
    text = "\n".join(
        [
            f"Hi {name or 'there'},",
            "",
            "Your ResGro password was successfully updated.",
            "If you did not make this change, contact support immediately.",
            "",
            f"Sign in: {origin}/#/get-started" if origin else "",
            "",
            "— ResGro",
        ]
    ).strip()
    link = f"{origin}/#/get-started" if origin else ""
    html_body = f"""
    <p>Hi {html.escape(name or 'there')},</p>
    <p>Your ResGro password was successfully updated.</p>
    {f'<p><a href="{html.escape(link)}">Open ResGro</a></p>' if link else ''}
    <p>— ResGro</p>
    """
    _dispatch(
        to=to,
        subject=subject,
        text=text,
        html_body=html_body,
        template_params={
            **_emailjs_common_params(to=to, subject=subject, text=text, html_body=html_body),
            "to_name": name or "User",
        },
    )
