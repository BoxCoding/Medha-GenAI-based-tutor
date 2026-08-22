"""Vercel serverless entry point.

Vercel's Python runtime serves the ASGI `app` exported here. All /api/*
requests are routed to this function (see ../vercel.json); static frontend
files are served directly from Vercel's CDN, same-origin — so cookies stay
first-party and no CORS is involved.
"""
from backend.main import app  # noqa: F401  (Vercel looks up "app")
