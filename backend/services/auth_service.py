"""Autenticación JWT y cuentas con contraseña para FinSync."""

from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt
import jwt
from fastapi import HTTPException, status

from services.database import insert_auth_account, is_postgres_enabled, load_auth_accounts_from_db, update_password_hash_in_db
from services.store import apply_sync_item, load_store
from services.store import SyncPushRequest

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
AUTH_PATH = DATA_DIR / "auth.json"

JWT_SECRET = os.getenv("JWT_SECRET", "finsync-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "7"))


def _ensure_auth_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not AUTH_PATH.exists():
        AUTH_PATH.write_text(json.dumps({"accounts": []}, indent=2), encoding="utf-8")


def load_auth_accounts() -> list[dict[str, Any]]:
    if is_postgres_enabled():
        return load_auth_accounts_from_db()
    _ensure_auth_file()
    data = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
    return list(data.get("accounts", []))


def save_auth_accounts(accounts: list[dict[str, Any]]) -> None:
    _ensure_auth_file()
    AUTH_PATH.write_text(json.dumps({"accounts": accounts}, indent=2), encoding="utf-8")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def normalize_email(email: str) -> str:
    return email.strip().lower()


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


def register_account(name: str, email: str, password: str, avatar: str) -> dict[str, Any]:
    normalized_email = normalize_email(email)
    trimmed_name = name.strip()

    if len(trimmed_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es demasiado corto.")
    if find_account_by_email(normalized_email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe una cuenta con ese correo.")

    validate_password_strength(password)

    user_id = str(uuid.uuid4())
    created_at = datetime.now(UTC).isoformat()
    user_profile = {
        "id": user_id,
        "name": trimmed_name,
        "email": normalized_email,
        "avatar": avatar or "👤",
        "created_at": created_at,
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
    }

    if is_postgres_enabled():
        insert_auth_account(account_record)
    else:
        accounts = load_auth_accounts()
        accounts.append(account_record)
        save_auth_accounts(accounts)

    access_token = create_access_token(user_id, normalized_email)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_profile,
    }


def login_account(email: str, password: str) -> dict[str, Any]:
    account = find_account_by_email(email)
    if account is None or not verify_password(password, account["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Correo o contraseña incorrectos.",
        )

    user_profile = get_user_profile(account["user_id"])
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de usuario no encontrado.")

    access_token = create_access_token(account["user_id"], account["email"])
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_profile,
    }


def get_authenticated_user(token: str) -> dict[str, Any]:
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    user_profile = get_user_profile(user_id)
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    return user_profile


def update_user_profile(user_id: str, name: str, avatar: str) -> dict[str, Any]:
    trimmed_name = name.strip()
    if len(trimmed_name) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre es demasiado corto.")
    if len(trimmed_name) > 80:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El nombre no puede superar 80 caracteres.")

    user_profile = get_user_profile(user_id)
    if user_profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

    updated_profile = {
        **user_profile,
        "name": trimmed_name,
        "avatar": avatar or user_profile.get("avatar", "👤"),
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

