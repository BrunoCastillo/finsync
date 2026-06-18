"""Capa PostgreSQL para persistir auth y sync en producción (Render)."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Iterator

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL")


def is_postgres_enabled() -> bool:
    return bool(DATABASE_URL)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


@contextmanager
def get_cursor() -> Iterator[Any]:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL no configurada.")

    connection = psycopg.connect(normalize_database_url(DATABASE_URL), row_factory=dict_row)
    try:
        with connection.cursor() as cursor:
            yield cursor
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_database() -> None:
    if not is_postgres_enabled():
        return

    with get_cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_accounts (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                email_verified BOOLEAN NOT NULL DEFAULT TRUE,
                verification_token_hash TEXT,
                verification_expires_at TEXT
            )
            """
        )
        cursor.execute(
            "ALTER TABLE auth_accounts ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE"
        )
        cursor.execute(
            "ALTER TABLE auth_accounts ADD COLUMN IF NOT EXISTS verification_token_hash TEXT"
        )
        cursor.execute(
            "ALTER TABLE auth_accounts ADD COLUMN IF NOT EXISTS verification_expires_at TEXT"
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS store_rows (
                table_key TEXT NOT NULL,
                row_id TEXT NOT NULL,
                payload JSONB NOT NULL,
                PRIMARY KEY (table_key, row_id)
            )
            """
        )


def load_auth_accounts_from_db() -> list[dict[str, Any]]:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                email,
                password_hash,
                user_id,
                created_at,
                email_verified,
                verification_token_hash,
                verification_expires_at
            FROM auth_accounts
            ORDER BY created_at
            """
        )
        rows = []
        for row in cursor.fetchall():
            account = dict(row)
            if account.get("email_verified") is None:
                account["email_verified"] = True
            rows.append(account)
        return rows


def insert_auth_account(account: dict[str, Any]) -> None:
    with get_cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO auth_accounts (
                id,
                email,
                password_hash,
                user_id,
                created_at,
                email_verified,
                verification_token_hash,
                verification_expires_at
            )
            VALUES (
                %(id)s,
                %(email)s,
                %(password_hash)s,
                %(user_id)s,
                %(created_at)s,
                %(email_verified)s,
                %(verification_token_hash)s,
                %(verification_expires_at)s
            )
            """,
            account,
        )


def update_auth_account_fields(email: str, fields: dict[str, Any]) -> None:
    assignments = ", ".join(f"{key} = %({key})s" for key in fields)
    payload = {"email": email, **fields}
    with get_cursor() as cursor:
        cursor.execute(
            f"UPDATE auth_accounts SET {assignments} WHERE email = %(email)s",
            payload,
        )


def find_auth_account_by_verification_hash(token_hash: str) -> dict[str, Any] | None:
    with get_cursor() as cursor:
        cursor.execute(
            """
            SELECT
                id,
                email,
                password_hash,
                user_id,
                created_at,
                email_verified,
                verification_token_hash,
                verification_expires_at
            FROM auth_accounts
            WHERE verification_token_hash = %s
            LIMIT 1
            """,
            (token_hash,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None


def update_password_hash_in_db(email: str, password_hash: str) -> None:
    with get_cursor() as cursor:
        cursor.execute(
            "UPDATE auth_accounts SET password_hash = %s WHERE email = %s",
            (password_hash, email),
        )


def load_store_from_db(default_store: dict[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    store = {key: list(rows) for key, rows in default_store.items()}

    with get_cursor() as cursor:
        cursor.execute("SELECT table_key, payload FROM store_rows")
        for row in cursor.fetchall():
            table_key = row["table_key"]
            if table_key not in store:
                store[table_key] = []
            store[table_key].append(row["payload"])

    return store


def apply_store_item_to_db(table_key: str, entity_id: str, action: str, payload: dict[str, Any]) -> None:
    with get_cursor() as cursor:
        if action == "DELETE":
            cursor.execute(
                "DELETE FROM store_rows WHERE table_key = %s AND row_id = %s",
                (table_key, entity_id),
            )
            return

        cursor.execute(
            """
            INSERT INTO store_rows (table_key, row_id, payload)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (table_key, row_id)
            DO UPDATE SET payload = EXCLUDED.payload
            """,
            (table_key, entity_id, json.dumps(payload)),
        )
