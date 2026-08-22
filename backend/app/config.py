"""Application configuration.

All secrets come from environment variables (loaded from a local `.env`).
The Gemini API key never leaves the server process — the frontend only
talks to our own API.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Runtime settings resolved once at import time."""

    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    )
    database_path: Path = field(
        default_factory=lambda: Path(os.getenv("MEDHA_DB", str(PROJECT_ROOT / "medha.db")))
    )
    host: str = field(default_factory=lambda: os.getenv("HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.getenv("PORT", "8098")))
    # Force-disable LLM calls (used by the test suite and offline demos).
    offline_mode: bool = field(default_factory=lambda: _env_flag("MEDHA_OFFLINE"))
    llm_timeout_seconds: float = field(
        default_factory=lambda: float(os.getenv("LLM_TIMEOUT", "40"))
    )
    # Split deployment (frontend on a different origin, e.g. Vercel):
    # comma-separated list of origins allowed to call the API with credentials.
    # Empty = same-origin deployment, no CORS headers emitted.
    allowed_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            origin.strip().rstrip("/")
            for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
            if origin.strip()
        )
    )
    # Cross-site cookies require Secure + SameSite=None; local dev keeps
    # the stricter Lax default over plain http.
    cookie_secure: bool = field(default_factory=lambda: _env_flag("COOKIE_SECURE"))
    cookie_samesite: str = field(
        default_factory=lambda: os.getenv("COOKIE_SAMESITE", "lax").lower()
    )

    @property
    def llm_enabled(self) -> bool:
        return bool(self.gemini_api_key) and not self.offline_mode


settings = Settings()
