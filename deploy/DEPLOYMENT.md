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
