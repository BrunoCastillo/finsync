import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.auth_router import router as auth_router
from routers.sync_router import router as sync_router

allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = (
    ["*"]
    if allowed_origins_raw.strip() == "*"
    else [origin.strip() for origin in allowed_origins_raw.split(",") if origin.strip()]
)

app = FastAPI(
    title="FinSync API",
    description="Backend de sincronización offline-first para FinSync",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allowed_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(sync_router, prefix="/api/sync")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "finsync-api"}
