"""Autenticación JWT, verificación de correo y cuentas para FinSync."""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, status

from services.database import (
    find_auth_account_by_verification_hash,
    insert_auth_account,
    is_postgres_enabled,
    load_auth_accounts_from_db,
    update_auth_account_fields,
    update_password_hash_in_db,
)
from services.email_service import send_verification_email
from services.email_validation import normalize_email, validate_email_address
from services.store import SyncPushRequest, apply_sync_item, load_store

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
AUTH_PATH = DATA_DIR / "auth.json"

JWT_SECRET = os.getenv("JWT_SECRET", "finsync-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))
VERIFICATION_EXPIRE_HOURS = int(os.getenv("VERIFICATION_EXPIRE_HOURS", "24"))


def _ensure_auth_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not AUTH_PATH.exists():
        AUTH_PATH.write_text(json.dumps({"accounts": []}, indent=2), encoding="utf-8")


def _normalize_account(account: dict[str, Any]) -> dict[str, Any]:
    if account.get("email_verified") is None:
        account["email_verified"] = True
    return account


def load_auth_accounts() -> list[dict[str, Any]]:
    if is_postgres_enabled():
        return load_auth_accounts_from_db()
    _ensure_auth_file()
    data = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    return [_normalize_account(dict(account)) for account in data.get("accounts", [])]


def save_auth_accounts(accounts: list[dict[str, Any]]) -> None:
    _ensure_auth_file()
    AUTH_PATH.write_text(json.dumps({"accounts": accounts}, indent=2), encoding="utf-8")


def _update_account_fields(email: str, fields: dict[str, Any]) -> None:
    if is_postgres_enabled():
        update_auth_account_fields(email, fields)
        return

    accounts = load_auth_accounts()
    for account in accounts:
        if account.get("email") != email:
            continue
        account.update(fields)
        break
    save_auth_accounts(accounts)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def find_account_by_email(email: str) -> dict[str, Any] | None:
    normalized_email = normalize_email(email)
    for account in load_auth_accounts():
        if account.get("email") == normalized_email:
            return account
    return None


def find_account_by_user_id(user_id: str) -> dict[str, Any] | None:
    for account in load_auth_accounts():
        if account.get("user_id") == user_id:
            return account
    return None


def get_user_profile(user_id: str) -> dict[str, Any] | None:
    store = load_store()
    return next((user for user in store["users"] if user.get("id") == user_id), None)


def _hash_verification_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _create_verification_token() -> tuple[str, str, str]:
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_verification_token(raw_token)
    expires_at = (datetime.now(UTC) + timedelta(hours=VERIFICATION_EXPIRE_HOURS)).isoformat()
    return raw_token, token_hash, expires_at


def _build_auth_response(user_profile: dict[str, Any], account: dict[str, Any]) -> dict[str, Any]:
    access_token = create_access_token(account["user_id"], account["email"])
    expires_at = datetime.now(UTC) + timedelta(days=JWT_EXPIRE_DAYS)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": int(timedelta(days=JWT_EXPIRE_DAYS).total_seconds()),
        "expires_at": expires_at.isoformat(),
        "email_verified": bool(account.get("email_verified", False)),
        "user": {
            **user_profile,
            "email_verified": bool(account.get("email_verified", False)),
        },
    }


def create_access_token(user_id: str, email: str) -> str:
    expires_at = datetime.now(UTC) + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def validate_password_strength(password: str) -> None:
    if len(password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 6 caracteres.",
        )


def _issue_verification(account_email: str) -> dict[str, str | bool]:
    raw_token, token_hash, expires_at = _create_verification_token()
    _update_account_fields(
        account_email,
        {
            "verification_token_hash": token_hash,
            "verification_expires_at": expires_at,
            "email_verified": False,
        },
    )
    return send_verification_email(account_email, raw_token)


def register_account(name: str, email: str, password: str, avatar: str) -> dict[str, Any]:
    normalized_email = validate_email_address(email)
    trimmed_name = name.strip()

    if len(trimmed_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es demasiado corto.")
    if find_account_by_email(normalized_email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese correo.")

    validate_password_strength(password)

    user_id = str(uuid.uuid4())
    created_at = datetime.now(UTC).isoformat()
    raw_token, token_hash, expires_at = _create_verification_token()
    user_profile = {
        "id": user_id,
        "name": trimmed_name,
        "email": normalized_email,
        "avatar": avatar or "👤",
        "created_at": created_at,
        "email_verified": False,
    }

    apply_sync_item(
        SyncPushRequest(
            entity_type="user",
            entity_id=user_id,
            action="INSERT",
            payload=user_profile,
        )
    )

    account_record = {
        "id": str(uuid.uuid4()),
        "email": normalized_email,
        "password_hash": hash_password(password),
        "user_id": user_id,
        "created_at": created_at,
        "email_verified": False,
        "verification_token_hash": token_hash,
        "verification_expires_at": expires_at,
    }

    if is_postgres_enabled():
        insert_auth_account(account_record)
    else:
        accounts = load_auth_accounts()
        accounts.append(account_record)
        save_auth_accounts(accounts)

    delivery = send_verification_email(normalized_email, raw_token)
    response: dict[str, Any] = {
        "requires_verification": True,
        "email": normalized_email,
        "message": "Te enviamos un enlace de verificación a tu correo. Debes confirmarlo para iniciar sesión.",
        "delivery_mode": delivery.get("delivery_mode", "console"),
    }
    if delivery.get("debug_link"):
        response["debug_link"] = delivery["debug_link"]
    return response


def login_account(email: str, password: str) -> dict[str, Any]:
    normalized_email = validate_email_address(email)
    account = find_account_by_email(normalized_email)
    if account is None or not verify_password(password, account["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    if not account.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes verificar tu correo antes de iniciar sesión.",
        )

    user_profile = get_user_profile(account["user_id"])
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de usuario no encontrado.")

    return _build_auth_response(user_profile, account)


def verify_email_token(token: str) -> dict[str, Any]:
    token_hash = _hash_verification_token(token.strip())
    account = find_account_by_email_token_hash(token_hash)
    if account is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enlace de verificación inválido.")

    expires_at_raw = account.get("verification_expires_at")
    if expires_at_raw:
        expires_at = datetime.fromisoformat(expires_at_raw)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if datetime.now(UTC) > expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El enlace de verificación expiró. Solicita uno nuevo.",
            )

    _update_account_fields(
        account["email"],
        {
            "email_verified": True,
            "verification_token_hash": None,
            "verification_expires_at": None,
        },
    )

    user_profile = get_user_profile(account["user_id"])
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de usuario no encontrado.")

    updated_profile = {**user_profile, "email_verified": True}
    apply_sync_item(
        SyncPushRequest(
            entity_type="user",
            entity_id=account["user_id"],
            action="UPDATE",
            payload=updated_profile,
        )
    )

    verified_account = {**account, "email_verified": True}
    return _build_auth_response(updated_profile, verified_account)


def find_account_by_email_token_hash(token_hash: str) -> dict[str, Any] | None:
    if is_postgres_enabled():
        return find_auth_account_by_verification_hash(token_hash)

    for account in load_auth_accounts():
        if account.get("verification_token_hash") == token_hash:
            return account
    return None


def resend_verification_email(email: str) -> dict[str, Any]:
    normalized_email = validate_email_address(email)
    account = find_account_by_email(normalized_email)
    if account is None:
        return {
            "ok": True,
            "message": "Si el correo existe, enviaremos un nuevo enlace de verificación.",
        }

    if account.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Este correo ya está verificado.")

    delivery = _issue_verification(normalized_email)
    response: dict[str, Any] = {
        "ok": True,
        "message": "Te enviamos un nuevo enlace de verificación.",
        "delivery_mode": delivery.get("delivery_mode", "console"),
    }
    if delivery.get("debug_link"):
        response["debug_link"] = delivery["debug_link"]
    return response


def get_authenticated_user(token: str) -> dict[str, Any]:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    account = find_account_by_user_id(user_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta no encontrada.")
    if not account.get("email_verified", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes verificar tu correo para continuar.",
        )

    user_profile = get_user_profile(user_id)
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    return {**user_profile, "email_verified": True}


def refresh_auth_session(token: str) -> dict[str, Any]:
    user = get_authenticated_user(token)
    account = find_account_by_user_id(user["id"])
    if account is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cuenta no encontrada.")
    return _build_auth_response(user, account)


def update_user_profile(user_id: str, name: str, avatar: str) -> dict[str, Any]:
    trimmed_name = name.strip()
    if len(trimmed_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es demasiado corto.")
    if len(trimmed_name) > 80:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre no puede superar 80 caracteres.")

    user_profile = get_user_profile(user_id)
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    account = find_account_by_user_id(user_id)
    updated_profile = {
        **user_profile,
        "name": trimmed_name,
        "avatar": avatar or user_profile.get("avatar", "👤"),
        "email_verified": bool(account.get("email_verified", False)) if account else False,
    }

    apply_sync_item(
        SyncPushRequest(
            entity_type="user",
            entity_id=user_id,
            action="UPDATE",
            payload=updated_profile,
        )
    )
    return updated_profile


def change_user_password(user_id: str, current_password: str, new_password: str) -> None:
    account = find_account_by_user_id(user_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuenta no encontrada.")

    if not verify_password(current_password, account["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Contraseña actual incorrecta.")

    validate_password_strength(new_password)
    password_hash = hash_password(new_password)

    if is_postgres_enabled():
        update_password_hash_in_db(account["email"], password_hash)
        return

    accounts = load_auth_accounts()
    for auth_account in accounts:
        if auth_account.get("user_id") == user_id:
            auth_account["password_hash"] = password_hash
            break
    save_auth_accounts(accounts)
