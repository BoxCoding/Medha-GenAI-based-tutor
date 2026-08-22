/* Medhā — frontend runtime configuration.
 *
 * MEDHA_API_BASE: origin of the backend API.
 *   ""  (empty)                → same-origin (local dev: FastAPI serves this
 *                                frontend itself, no CORS involved)
 *   "https://<backend>.vercel.app" → split deployment: static frontend on one
 *                                origin, FastAPI backend on another.
 *
 * On Vercel, set the MEDHA_API_BASE environment variable on the frontend
 * project and generate this file at build time (see vercel-build in
 * DEPLOYMENT.md); locally the empty default just works.
 */
"use strict";
window.MEDHA_API_BASE = window.MEDHA_API_BASE ?? "";
