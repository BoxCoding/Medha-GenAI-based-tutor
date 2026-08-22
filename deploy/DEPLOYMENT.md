# Deploying Medhā to Vercel (single project)

One Vercel project serves everything: `/api/*` hits the FastAPI serverless
function ([api/index.py](../api/index.py)), and every other path is the
static frontend served straight from Vercel's CDN ([vercel.json](../vercel.json)
does the routing). Same origin — so the httpOnly session cookie works with
its strict defaults, no CORS, and the frontend needs **zero** configuration
(`config.js` stays at its same-origin default).

## Steps

1. Push the `medha/` folder to a Git repo (`.env` is git-ignored — verify
   with `git status` before pushing).
2. Vercel → **Add New Project** → import the repo.
   - **Root Directory**: `medha` (or repo root if `medha` *is* the repo).
   - Framework preset: **Other**. No build command needed — `vercel.json`
     declares the builds.
3. **Settings → Environment Variables**: add every variable from
   [medha.env.vercel](medha.env.vercel). Mark `GEMINI_API_KEY` as
   **Sensitive**.
4. Deploy, then verify:
   - `https://<project>.vercel.app/api/health` → `{"status": "ok", "llm_enabled": true}`
   - Open the site, register, run one lesson + quiz end-to-end.

## Troubleshooting

**`ImportError: attempted relative import with no known parent package`
(could not import "main.py")** — Vercel found `main.py` as a top-level
entrypoint, which means the project's **Root Directory is set to
`medha/backend`** instead of `medha`. Fix it at Project → Settings →
General → **Root Directory** → `medha` (or the repo root if `medha` *is* the
repo), then redeploy. That makes [vercel.json](../vercel.json) take effect,
deploying the API function **and** the static frontend together.

**`FUNCTION_INVOCATION_FAILED` / every `/api/*` path returns 500** — including
paths that should 404. A 500 on an unknown route means the function died
during import or startup, before routing existed. Checklist:

1. **Is `backend/` in the bundle?** `api/index.py` imports `backend.main`, so
   the build config carries `includeFiles: "backend/**"` and the entrypoint
   puts the project root on `sys.path`. Both must survive edits to
   `vercel.json` / `api/index.py`.
2. **Python version.** The serverless runtime can be older than your laptop's.
   The code therefore avoids 3.11-only syntax (`enum.StrEnum`,
   `datetime.UTC`), and ruff is pinned to `target-version = "py310"` so lint
   never reintroduces it. Check the project's Python version under Settings →
   General if imports still fail.
3. **Writable database path.** Serverless filesystems are read-only except
   `/tmp`. When `MEDHA_DB` is unset, the app now detects Vercel/Lambda and
   defaults to `/tmp/medha.db` on its own.
4. **No `[project]` table in `pyproject.toml`.** Medhā is deployed from
   source, not installed as a package; a `[project]` table can make the
   builder attempt `pip install .` and fail. The file holds tool config only.

**Read the actual error instead of guessing:** `/api/health` reports its own
database status — `{"status": "degraded", "database_error": "…"}` — because
startup failures are recorded rather than raised. For import-level failures
(where even health cannot answer), open Vercel → Deployments → the deployment
→ **Runtime Logs** / Functions tab for the Python traceback.

**Every path redirects (302) to `vercel.com/sso-api`** — Deployment Protection
is enabled, so anonymous visitors (judges!) hit a login wall and the frontend's
API calls fail. Preview URLs (`…-git-<branch>-<team>.vercel.app`) have it on by
default. Share the **production** URL, and if that is protected too, turn it
off at Project → Settings → **Deployment Protection** → Disabled (or use
Protection Bypass for Automation).

## Notes

- **SQLite is ephemeral on Vercel** (`/tmp` resets on cold starts): accounts
  and progress vanish between invocations. Fine for a throwaway demo. For
  judging day, the safest setup is an always-on host (Railway / Render /
  Fly.io / any VPS):

  ```bash
  pip install -r requirements.txt
  uvicorn backend.main:app --host 0.0.0.0 --port 8098
  ```

  Same env variables apply (plus `HOST`/`PORT`), SQLite persists, and the
  single-origin architecture is identical.
- `requirements.txt` at the project root is picked up by Vercel's Python
  runtime automatically.
- Camera coaching and microphone-free TTS both require HTTPS — Vercel
  provides it out of the box.
