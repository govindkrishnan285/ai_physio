from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import init_db
from .routers import (
    analysis,
    auth,
    exercises,
    progress,
    recommendations,
    reports,
    sessions,
    staff,
    videos,
)

DEV_JWT_SECRET = "dev-insecure-change-me"


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Refuse to sign tokens with the shipped default outside dev. Without this
    # a deployment that forgets to set JWT_SECRET would happily issue tokens
    # anyone could forge.
    if settings.jwt_secret == DEV_JWT_SECRET and not settings.dev_mode:
        raise RuntimeError(
            "JWT_SECRET is still the development default. Set a strong secret "
            "(e.g. `python -c \"import secrets;print(secrets.token_urlsafe(48))\"`) "
            "or set DEV_MODE=true for local work."
        )
    init_db()
    yield


app = FastAPI(
    title="AI Physio — Rehabilitation Assistant API",
    version="0.1.0",
    lifespan=lifespan,
)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(videos.router)
app.include_router(videos.jobs_router)
app.include_router(analysis.router)
app.include_router(sessions.router)
app.include_router(progress.router)
app.include_router(reports.router)
app.include_router(recommendations.router)
app.include_router(staff.router)

# Serve curated reference clips for the side-by-side player.
_ref_dir = _settings.data_path / "reference-clips"
_ref_dir.mkdir(parents=True, exist_ok=True)
app.mount("/reference-media", StaticFiles(directory=str(_ref_dir)), name="reference-media")


@app.get("/health", tags=["meta"])
def health() -> dict:
    from .services import mlmodel

    return {
        "status": "ok",
        "tf_enabled": _settings.enable_tf,
        "tf_available": mlmodel.is_available(),
    }
