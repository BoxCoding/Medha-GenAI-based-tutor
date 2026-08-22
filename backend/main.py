"""Medhā (मेधा) — Adaptive Learning Intelligence System.

FastAPI application entry point. Serves the JSON API under /api and the
static frontend at /. Run with:  uvicorn backend.main:app --port 8098
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .app import auth
from .app.config import settings
from .app.database import init_db
from .app.routers import behavior, learners, lessons, mindmap, quizzes, teachback, tutor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    logging.getLogger("medha").info(
        "Medhā started — LLM %s (model=%s)",
        "ENABLED" if settings.llm_enabled else "OFFLINE FALLBACK",
        settings.gemini_model,
    )
    yield


app = FastAPI(
    title="Medhā — Adaptive Learning Intelligence",
    description="Bayesian knowledge tracing + Gemini-powered personalized learning.",
    version="1.0.0",
    lifespan=lifespan,
)

# Split deployment (frontend hosted on another origin, e.g. Vercel):
# emit CORS headers only for the explicitly allowed origins, with
# credentials so the httpOnly session cookie flows.
if settings.allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

# Simple in-memory sliding-window rate limiter (per client IP).
_RATE_LIMIT = 120         # requests (behavior telemetry adds background chatter)
_RATE_WINDOW = 60.0       # seconds
_request_log: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def guard(request: Request, call_next):
    """Rate limiting + standard security headers on every response."""
    if request.url.path.startswith("/api"):
        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window = _request_log[client_ip]
        while window and now - window[0] > _RATE_WINDOW:
            window.popleft()
        if len(window) >= _RATE_LIMIT:
            return JSONResponse(
                status_code=429,
                content={"detail": "rate limit exceeded — try again shortly"},
            )
        window.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "llm_enabled": settings.llm_enabled,
        "model": settings.gemini_model if settings.llm_enabled else None,
    }


app.include_router(auth.router)
app.include_router(learners.router)
app.include_router(lessons.router)
app.include_router(quizzes.router)
app.include_router(tutor.router)
app.include_router(behavior.router)
app.include_router(mindmap.router)
app.include_router(teachback.router)

# Static frontend last, so /api routes take precedence. On Vercel the CDN
# serves the frontend directly and the serverless bundle may not contain
# this directory — skip the mount rather than crash on import.
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
