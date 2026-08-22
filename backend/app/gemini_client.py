"""Thin async client for the Gemini REST API.

Design goals:
  * The API key lives only in this process (sent via header, never in URLs,
    never logged, never exposed to the frontend).
  * Every caller must handle `LLMUnavailable` — the app degrades to
    deterministic fallback content instead of breaking the learner's flow.
  * JSON responses are requested via `responseMimeType` and validated by the
    caller, so a malformed generation can never corrupt state.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger("medha.gemini")

_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class LLMUnavailable(Exception):
    """Raised when Gemini cannot be reached or returns an unusable response."""


async def generate_text(prompt: str, system: str | None = None) -> str:
    """Generate free-form text (markdown) from Gemini."""
    return await _generate(prompt, system=system, json_mode=False)


async def generate_json(
    prompt: str,
    system: str | None = None,
    image_base64: str | None = None,
    image_mime: str = "image/jpeg",
) -> Any:
    """Generate and parse a JSON payload from Gemini (optionally multimodal)."""
    raw = await _generate(
        prompt, system=system, json_mode=True,
        image_base64=image_base64, image_mime=image_mime,
    )
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Gemini returned non-JSON payload: %s", exc)
        raise LLMUnavailable("model returned malformed JSON") from exc


async def _generate(
    prompt: str,
    system: str | None,
    json_mode: bool,
    image_base64: str | None = None,
    image_mime: str = "image/jpeg",
) -> str:
    if not settings.llm_enabled:
        raise LLMUnavailable("no API key configured or offline mode active")

    parts: list[dict[str, Any]] = [{"text": prompt}]
    if image_base64:
        parts.append({"inline_data": {"mime_type": image_mime, "data": image_base64}})
    body: dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.6, "maxOutputTokens": 4096},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"

    url = f"{_BASE_URL}/{settings.gemini_model}:generateContent"
    headers = {"x-goog-api-key": settings.gemini_api_key}

    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout_seconds) as client:
            response = await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as exc:
        logger.warning("Gemini request failed: %s", type(exc).__name__)
        raise LLMUnavailable("network error talking to Gemini") from exc

    if response.status_code != 200:
        logger.warning("Gemini returned HTTP %s", response.status_code)
        raise LLMUnavailable(f"Gemini HTTP {response.status_code}")

    try:
        payload = response.json()
        parts = payload["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts).strip()
    except (KeyError, IndexError, ValueError) as exc:
        raise LLMUnavailable("unexpected Gemini response shape") from exc

    if not text:
        raise LLMUnavailable("empty Gemini response")
    return text
