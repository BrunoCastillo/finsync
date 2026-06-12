from fastapi import APIRouter, Depends, HTTPException, status

from dependencies.auth import get_current_user
from services.store import SyncPushRequest, apply_sync_item, load_store
from services.sync_scope import can_apply_sync_item, filter_store_for_user

router = APIRouter(tags=["sync"])


@router.post("/push")
def push_sync_item(
    item: SyncPushRequest,
    current_user: dict = Depends(get_current_user),
) -> dict[str, bool]:
    user_id = str(current_user["id"])
    if not can_apply_sync_item(user_id, item):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para modificar este recurso.",
        )

    try:
        apply_sync_item(item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/pull")
def pull_sync_store(current_user: dict = Depends(get_current_user)) -> dict[str, list]:
    user_id = str(current_user["id"])
    store = load_store()
    return filter_store_for_user(store, user_id)
