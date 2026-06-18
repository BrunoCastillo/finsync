from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field

from dependencies.auth import get_current_user, get_current_user_token
from services.auth_service import (
    change_user_password,
    login_account,
    refresh_auth_session,
    register_account,
    resend_verification_email,
    update_user_profile,
    verify_email_token,
)

router = APIRouter(tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    avatar: str = "👤"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=256)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    avatar: str = Field(min_length=1, max_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=6, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


@router.post("/register")
def register_user(body: RegisterRequest) -> dict:
    return register_account(
        name=body.name,
        email=str(body.email),
        password=body.password,
        avatar=body.avatar,
    )


@router.post("/login")
def login_user(body: LoginRequest) -> dict:
    return login_account(email=str(body.email), password=body.password)


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest) -> dict:
    return verify_email_token(body.token)


@router.post("/resend-verification")
def resend_verification(body: ResendVerificationRequest) -> dict:
    return resend_verification_email(str(body.email))


@router.post("/refresh")
def refresh_session(token: str = Depends(get_current_user_token)) -> dict:
    return refresh_auth_session(token)


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)) -> dict:
    return {"user": current_user}


@router.patch("/profile")
def patch_profile(body: UpdateProfileRequest, current_user: dict = Depends(get_current_user)) -> dict:
    updated_user = update_user_profile(
        user_id=current_user["id"],
        name=body.name,
        avatar=body.avatar,
    )
    return {"user": updated_user}


@router.post("/change-password")
def post_change_password(body: ChangePasswordRequest, current_user: dict = Depends(get_current_user)) -> dict:
    change_user_password(
        user_id=current_user["id"],
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return {"ok": True, "message": "Contraseña actualizada correctamente."}
