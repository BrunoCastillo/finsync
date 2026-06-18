"""Envío de correos de verificación (Resend, SMTP o modo desarrollo)."""

from __future__ import annotations

import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
EMAIL_FROM = os.getenv("EMAIL_FROM", "FinSync <onboarding@resend.dev>").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
EMAIL_VERIFICATION_DEV_MODE = os.getenv("EMAIL_VERIFICATION_DEV_MODE", "false").lower() == "true"


def build_verification_link(token: str) -> str:
    return f"{FRONTEND_URL}/?verify={token}"


def _build_verification_message(to_email: str, verification_link: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = "Verifica tu correo en FinSync"
    message["From"] = EMAIL_FROM
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "Hola,",
                "",
                "Confirma tu correo para activar tu cuenta en FinSync:",
                verification_link,
                "",
                "Si no creaste esta cuenta, ignora este mensaje.",
            ]
        )
    )
    return message


def _send_with_resend(to_email: str, verification_link: str) -> None:
    payload = json.dumps(
        {
            "from": EMAIL_FROM,
            "to": [to_email],
            "subject": "Verifica tu correo en FinSync",
            "html": (
                f"<p>Confirma tu correo para activar tu cuenta en FinSync:</p>"
                f'<p><a href="{verification_link}">{verification_link}</a></p>'
            ),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status >= 400:
            raise RuntimeError(f"Resend respondió con estado {response.status}")


def _send_with_smtp(to_email: str, verification_link: str) -> None:
    message = _build_verification_message(to_email, verification_link)
    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
        server.starttls(context=context)
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(message)


def send_verification_email(to_email: str, token: str) -> dict[str, str | bool]:
    verification_link = build_verification_link(token)
    delivery_mode = "console"

    if RESEND_API_KEY:
        _send_with_resend(to_email, verification_link)
        delivery_mode = "resend"
    elif SMTP_HOST:
        _send_with_smtp(to_email, verification_link)
        delivery_mode = "smtp"
    else:
        print(f"[FinSync] Enlace de verificación para {to_email}: {verification_link}")

    result: dict[str, str | bool] = {
        "delivered": delivery_mode != "console",
        "delivery_mode": delivery_mode,
    }
    if EMAIL_VERIFICATION_DEV_MODE and delivery_mode == "console":
        result["debug_link"] = verification_link
    return result
