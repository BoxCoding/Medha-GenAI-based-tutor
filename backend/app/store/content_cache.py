"""Cached generated content — lessons and mind maps.

Caching is the efficiency backbone: repeat views of a lesson (per mastery
band + pace) or a mind map (per concept) cost zero LLM calls.
"""
from __future__ import annotations

import json
from typing import Any

from ..database import get_db


def get_cached_lesson(concept_id: int, band: str) -> str | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT content FROM lesson_cache WHERE concept_id = ? AND band = ?",
            (concept_id, band),
        ).fetchone()
        return row["content"] if row else None


def cache_lesson(concept_id: int, band: str, content: str) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO lesson_cache (concept_id, band, content) VALUES (?, ?, ?)
               ON CONFLICT(concept_id, band) DO UPDATE SET content = excluded.content""",
            (concept_id, band, content),
        )


def get_cached_mindmap(concept_id: int) -> dict[str, Any] | None:
    with get_db() as conn:
        row = conn.execute(
            "SELECT content FROM mindmap_cache WHERE concept_id = ?", (concept_id,)
        ).fetchone()
        return json.loads(row["content"]) if row else None


def cache_mindmap(concept_id: int, content: dict[str, Any]) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO mindmap_cache (concept_id, content) VALUES (?, ?)
               ON CONFLICT(concept_id) DO UPDATE SET content = excluded.content""",
            (concept_id, json.dumps(content)),
        )
