"""Almacén JSON persistente para la API de sincronización FinSync."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel

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


def load_store() -> dict[str, list[dict[str, Any]]]:
    _ensure_store_file()
    return json.loads(STORE_PATH.read_text(encoding="utf-8"))


def save_store(store: dict[str, list[dict[str, Any]]]) -> None:
    _ensure_store_file()
    STORE_PATH.write_text(json.dumps(store, indent=2), encoding="utf-8")


def apply_sync_item(item: SyncPushRequest) -> None:
    table_key = ENTITY_TABLE_MAP.get(item.entity_type)
    if table_key is None:
        raise ValueError(f"Tipo de entidad no soportado: {item.entity_type}")

    store = load_store()
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

    save_store(store)
