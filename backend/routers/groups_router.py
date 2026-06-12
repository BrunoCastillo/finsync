from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from dependencies.auth import get_current_user
from services.invite_service import join_group_by_invite_code

router = APIRouter(tags=["groups"])


class JoinGroupRequest(BaseModel):
    invite_code: str = Field(min_length=6, max_length=16)


@router.post("/join")
def join_group(body: JoinGroupRequest, current_user: dict = Depends(get_current_user)) -> dict:
    return join_group_by_invite_code(
        user_id=str(current_user["id"]),
        user_name=str(current_user.get("name", "Usuario")),
        invite_code=body.invite_code,
    )
