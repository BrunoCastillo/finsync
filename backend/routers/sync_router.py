from fastapi import APIRouter, HTTPException

from services.store import SyncPushRequest, apply_sync_item, load_store

router = APIRouter(tags=["sync"])


@router.post("/push")
def push_sync_item(item: SyncPushRequest) -> dict[str, bool]:
    try:
        apply_sync_item(item)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.get("/pull")
def pull_sync_store() -> dict[str, list]:
    return load_store()
