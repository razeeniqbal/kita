"""kita. API entry point. Run locally from backend/:  uvicorn app.main:app --reload"""
from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import DBAPIError

from app.config import get_settings
from app.db import get_db
from app.errors import database_error_handler
from app.routers import budget, calendar, events, guests, hantaran, notes, tasks, vendors, workspace

app = FastAPI(
    title="kita. API",
    version="0.1.0",
    description="Private planner for Razeen & Sabrina: separate Tunang and Perkahwinan modes.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.add_exception_handler(DBAPIError, database_error_handler)

settings = get_settings()
if settings.cors_origins:
    # Only needed when the frontend is served from a different origin (e.g. Angular dev server).
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])

api = APIRouter(prefix="/api/v1")


@api.get("/health", tags=["health"])
def health(db: Connection = Depends(get_db)):
    db.execute(text("select 1"))
    return {"status": "ok"}


@api.get("/public-config", tags=["health"])
def public_config():
    """What the browser needs to start Supabase sign-in. Both values are public by design."""
    return {
        "supabase_url": settings.supabase_url,
        "supabase_anon_key": settings.supabase_anon_key,
        "auth_configured": bool(settings.supabase_url and settings.supabase_anon_key),
    }


for module in (workspace, events, tasks, budget, hantaran, vendors, calendar, guests, notes):
    api.include_router(module.router)

app.include_router(api)
