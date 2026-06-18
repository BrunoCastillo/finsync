"""Dependencias FastAPI para autenticación Bearer."""

from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth_service import get_authenticated_user

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere autenticación.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials


def get_current_user(token: str = Depends(get_current_user_token)) -> dict:
    return get_authenticated_user(token)
