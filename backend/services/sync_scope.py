"""Filtrado de datos de sync por usuario autenticado."""

from __future__ import annotations

from typing import Any

from services.store import ENTITY_TABLE_MAP, SyncPushRequest, load_store


def build_user_scope(store: dict[str, list[dict[str, Any]]], user_id: str) -> dict[str, set[str]]:
    member_rows = [row for row in store["group_members"] if row.get("user_id") == user_id]
    group_ids = {str(row["group_id"]) for row in member_rows}

    group_member_rows = [
        row for row in store["group_members"] if str(row.get("group_id")) in group_ids
    ]
    peer_user_ids = {user_id, *(str(row["user_id"]) for row in group_member_rows)}

    event_ids = {
        str(row["id"])
        for row in store["events"]
        if str(row.get("group_id")) in group_ids
    }
    expense_ids = {
        str(row["id"])
        for row in store["expenses"]
        if str(row.get("event_id")) in event_ids
    }

    return {
        "group_ids": group_ids,
        "event_ids": event_ids,
        "expense_ids": expense_ids,
        "peer_user_ids": peer_user_ids,
        "user_id": {user_id},
    }


def filter_store_for_user(store: dict[str, list[dict[str, Any]]], user_id: str) -> dict[str, list[dict[str, Any]]]:
    scope = build_user_scope(store, user_id)

    return {
        "users": [row for row in store["users"] if str(row.get("id")) in scope["peer_user_ids"]],
        "groups": [row for row in store["groups"] if str(row.get("id")) in scope["group_ids"]],
        "group_members": [
            row for row in store["group_members"] if str(row.get("group_id")) in scope["group_ids"]
        ],
        "events": [row for row in store["events"] if str(row.get("id")) in scope["event_ids"]],
        "expenses": [row for row in store["expenses"] if str(row.get("id")) in scope["expense_ids"]],
        "expense_shares": [
            row for row in store["expense_shares"] if str(row.get("expense_id")) in scope["expense_ids"]
        ],
        "settlements": [
            row for row in store["settlements"] if str(row.get("event_id")) in scope["event_ids"]
        ],
        "notifications": [
            row for row in store["notifications"] if str(row.get("user_id")) == user_id
        ],
        "personal_expenses": [
            row for row in store["personal_expenses"] if str(row.get("user_id")) == user_id
        ],
    }


def _is_group_admin(store: dict[str, list[dict[str, Any]]], group_id: str, user_id: str) -> bool:
    for row in store["group_members"]:
        if str(row.get("group_id")) != group_id:
            continue
        if str(row.get("user_id")) != user_id:
            continue
        return row.get("role") == "admin"
    return False


def _get_event_group_id(store: dict[str, list[dict[str, Any]]], event_id: str) -> str | None:
    for row in store["events"]:
        if str(row.get("id")) == event_id:
            return str(row.get("group_id"))
    return None


def _user_in_group(store: dict[str, list[dict[str, Any]]], group_id: str, user_id: str) -> bool:
    return any(
        str(row.get("group_id")) == group_id and str(row.get("user_id")) == user_id
        for row in store["group_members"]
    )


def can_apply_sync_item(user_id: str, item: SyncPushRequest) -> bool:
    if item.entity_type not in ENTITY_TABLE_MAP:
        return False

    store = load_store()
    scope = build_user_scope(store, user_id)
    payload = item.payload

    if item.entity_type == "user":
        return str(payload.get("id", item.entity_id)) == user_id

    if item.entity_type == "personal_expense":
        return str(payload.get("user_id")) == user_id

    if item.entity_type == "notification":
        return str(payload.get("user_id")) == user_id

    if item.entity_type == "group":
        if item.action == "INSERT":
            return str(payload.get("created_by")) == user_id
        group_id = item.entity_id
        return str(group_id) in scope["group_ids"] and _is_group_admin(store, group_id, user_id)

    if item.entity_type == "group_member":
        group_id = str(payload.get("group_id"))
        member_user_id = str(payload.get("user_id"))
        if item.action == "INSERT" and member_user_id == user_id:
            return True
        return _is_group_admin(store, group_id, user_id)

    if item.entity_type == "event":
        group_id = str(payload.get("group_id"))
        if item.action == "INSERT":
            return _user_in_group(store, group_id, user_id)
        return str(item.entity_id) in scope["event_ids"]

    if item.entity_type == "expense":
        event_id = str(payload.get("event_id"))
        if item.action == "INSERT":
            group_id = _get_event_group_id(store, event_id)
            return group_id is not None and _user_in_group(store, group_id, user_id)
        return str(item.entity_id) in scope["expense_ids"]

    if item.entity_type == "expense_share":
        expense_id = str(payload.get("expense_id", ""))
        if not expense_id:
            existing = next((row for row in store["expense_shares"] if row.get("id") == item.entity_id), None)
            expense_id = str(existing.get("expense_id")) if existing else ""
        return expense_id in scope["expense_ids"]

    if item.entity_type == "settlement":
        event_id = str(payload.get("event_id", ""))
        if not event_id:
            existing = next((row for row in store["settlements"] if row.get("id") == item.entity_id), None)
            event_id = str(existing.get("event_id")) if existing else ""
        return event_id in scope["event_ids"]

    return False
