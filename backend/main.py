from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.sync_router import router as sync_router

app = FastAPI(
    title="FinSync API",
    description="Backend de sincronización offline-first para FinSync",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync_router, prefix="/api/sync")


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "finsync-api"}
