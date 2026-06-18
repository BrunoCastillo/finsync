"""Validación estricta de correos electrónicos."""

from __future__ import annotations

import re

from fastapi import HTTPException, status
from pydantic import EmailStr, TypeAdapter, ValidationError

_EMAIL_ADAPTER = TypeAdapter(EmailStr)
_DISPOSABLE_DOMAINS = {
    "mailinator.com",
    "tempmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "yopmail.com",
}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email_address(email: str) -> str:
    normalized_email = normalize_email(email)

    try:
        validated_email = _EMAIL_ADAPTER.validate_python(normalized_email)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresa un correo electrónico válido.",
        ) from exc

    domain = str(validated_email).split("@")[-1]
    if domain in _DISPOSABLE_DOMAINS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se permiten correos temporales o desechables.",
        )

    if not re.fullmatch(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$", str(validated_email)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresa un correo electrónico válido.",
        )

    return str(validated_email)
