"""Códigos de invitación y unión a grupos."""

from __future__ import annotations

import secrets
import string
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status

from services.store import apply_sync_item, load_store, save_store
from services.store import SyncPushRequest

INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_invite_code(length: int = 8) -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(length))


def normalize_invite_code(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")


def ensure_group_invite_codes() -> None:
    store = load_store()
    has_changes = False

    for index, group in enumerate(store["groups"]):
        if group.get("invite_code"):
            continue
        store["groups"][index] = {**group, "invite_code": generate_invite_code()}
        has_changes = True

    if has_changes:
        save_store(store)


def find_group_by_invite_code(invite_code: str) -> dict[str, Any] | None:
    ensure_group_invite_codes()
    store = load_store()
    normalized = normalize_invite_code(invite_code)

    for group in store["groups"]:
        code = str(group.get("invite_code", ""))
        if code and normalize_invite_code(code) == normalized:
            return group
    return None


def join_group_by_invite_code(user_id: str, user_name: str, invite_code: str) -> dict[str, Any]:
    normalized = normalize_invite_code(invite_code)
    if len(normalized) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ingresa un código de invitación válido.",
        )

    group = find_group_by_invite_code(normalized)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código inválido. Verifica el código o pide uno nuevo al administrador.",
        )

    store = load_store()
    group_id = str(group["id"])
    existing = next(
        (
            member
            for member in store["group_members"]
            if str(member.get("group_id")) == group_id and str(member.get("user_id")) == user_id
        ),
        None,
    )
    if existing:
        return {
            "group": group,
            "membership": existing,
            "notification": None,
            "already_member": True,
        }

    membership = {
        "id": str(uuid.uuid4()),
        "group_id": group_id,
        "user_id": user_id,
        "role": "member",
    }
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "message": f'Te uniste al grupo "{group.get("name")}" con código de invitación.',
        "read": 0,
        "created_at": datetime.now(UTC).isoformat(),
    }

    apply_sync_item(
        SyncPushRequest(
            entity_type="group_member",
            entity_id=str(membership["id"]),
            action="INSERT",
            payload=membership,
        )
    )
    apply_sync_item(
        SyncPushRequest(
            entity_type="notification",
            entity_id=str(notification["id"]),
            action="INSERT",
            payload=notification,
        )
    )

    return {
        "group": group,
        "membership": membership,
        "notification": notification,
        "already_member": False,
    }
