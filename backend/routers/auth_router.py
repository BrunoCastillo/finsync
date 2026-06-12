from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from dependencies.auth import get_current_user
from services.auth_service import login_account, register_account

router = APIRouter(tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=6, max_length=128)
    avatar: str = "👤"


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)


@router.post("/register")
def register_user(body: RegisterRequest) -> dict:
    return register_account(
        name=body.name,
        email=body.email,
        password=body.password,
        avatar=body.avatar,
    )


@router.post("/login")
def login_user(body: LoginRequest) -> dict:
    return login_account(email=body.email, password=body.password)


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)) -> dict:
    return {"user": current_user}
