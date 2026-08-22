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
`medha/backend`** instead of `medha`. Two ways out:

1. *Recommended:* Project → Settings → General → **Root Directory** →
   change to `medha` (or the repo root if `medha` is the repo). This makes
   [vercel.json](../vercel.json) take effect, deploying the API function
   **and** the static frontend together — the merged single-project setup.
2. `backend/main.py` now also supports being imported top-level (its
   imports fall back from `from .app import …` to `from app import …`),
   and `backend/requirements.txt` exists for this layout — so a
   backend-rooted project will boot after a redeploy. But note it serves
   **only the API**: the frontend won't be deployed, so prefer option 1.

After changing the root directory, trigger a fresh deploy (Deployments →
… → Redeploy) so the build re-runs with the new setting.

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
