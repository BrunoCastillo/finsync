"""Almacén persistente para la API de sincronización FinSync."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from services.database import apply_store_item_to_db, is_postgres_enabled, load_store_from_db

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
STORE_PATH = DATA_DIR / "store.json"

ENTITY_TABLE_MAP: dict[str, str] = {
    "user": "users",
    "group": "groups",
    "group_member": "group_members",
    "event": "events",
    "expense": "expenses",
    "expense_share": "expense_shares",
    "settlement": "settlements",
    "notification": "notifications",
    "personal_expense": "personal_expenses",
    "personal_budget": "personal_budgets",
}

DEFAULT_STORE: dict[str, list[dict[str, Any]]] = {
    "users": [],
    "groups": [],
    "group_members": [],
    "events": [],
    "expenses": [],
    "expense_shares": [],
    "settlements": [],
    "notifications": [],
    "personal_expenses": [],
    "personal_budgets": [],
}


class SyncPushRequest(BaseModel):
    entity_type: str
    entity_id: str
    action: str
    payload: dict[str, Any]


def _ensure_store_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not STORE_PATH.exists():
        STORE_PATH.write_text(json.dumps(DEFAULT_STORE, indent=2), encoding="utf-8")


def _load_store_json() -> dict[str, list[dict[str, Any]]]:
    _ensure_store_file()
    store = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    for key, default_rows in DEFAULT_STORE.items():
        if key not in store:
            store[key] = list(default_rows)
    return store


def _save_store_json(store: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_store_file()
    STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def load_store() -> dict[str, list[dict[str, Any]]]:
    if is_postgres_enabled():
        return load_store_from_db(DEFAULT_STORE)
    return _load_store_json()


def _apply_sync_item_json(item: SyncPushRequest) -> None:
    table_key = ENTITY_TABLE_MAP.get(item.entity_type)
    if table_key is None:
        raise ValueError(f"Tipo de entidad no soportado: {item.entity_type}")

    store = _load_store_json()
    rows = store[table_key]

    if item.action == "INSERT":
        existing_index = next((idx for idx, row in enumerate(rows) if row.get("id") == item.entity_id), None)
        if existing_index is not None:
            rows[existing_index] = item.payload
        else:
            rows.append(item.payload)
    elif item.action == "UPDATE":
        existing_index = next((idx for idx, row in enumerate(rows) if row.get("id") == item.entity_id), None)
        if existing_index is not None:
            rows[existing_index] = {**rows[existing_index], **item.payload}
        else:
            rows.append(item.payload)
    elif item.action == "DELETE":
        store[table_key] = [row for row in rows if row.get("id") != item.entity_id]
    else:
        raise ValueError(f"Acción no soportada: {item.action}")

    _save_store_json(store)


def apply_sync_item(item: SyncPushRequest) -> None:
    table_key = ENTITY_TABLE_MAP.get(item.entity_type)
    if table_key is None:
        raise ValueError(f"Tipo de entidad no soportado: {item.entity_type}")

    if is_postgres_enabled():
        if item.action == "UPDATE":
            store = load_store()
            rows = store[table_key]
            existing = next((row for row in rows if row.get("id") == item.entity_id), None)
            merged_payload = {**(existing or {}), **item.payload}
            apply_store_item_to_db(table_key, item.entity_id, "INSERT", merged_payload)
            return

        apply_store_item_to_db(table_key, item.entity_id, item.action, item.payload)
        return

    _apply_sync_item_json(item)
