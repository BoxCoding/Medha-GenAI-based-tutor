# 🪷 Medhā (मेधा) — Adaptive Learning Intelligence System

> *Medhā* — the Sanskrit word for the intellect's power to grasp, retain, and apply knowledge.

**PromptWars (Google for Developers · Build with AI) — Challenge: Adaptive Learning Intelligence System**

Medhā understands a learner's **evolving knowledge state** and delivers a fully personalized
learning experience. It is not an LLM wrapper: a **Bayesian Knowledge Tracing (BKT)** engine
mathematically tracks the probability that each concept is mastered, and **Gemini** uses that
live knowledge state to personalize every lesson, quiz, feedback message, and tutor answer.

---

## The core idea

```
                        ┌─────────────────────────────┐
   learner answers ───▶ │  BKT engine (backend/app/   │ ───▶ P(mastered) per concept
                        │  bkt.py): Bayes update +    │        │
                        │  learning transition +      │        ▼
                        │  forgetting decay           │   adaptive policy
                        └─────────────────────────────┘   (adaptive.py)
                                                              │
              ┌───────────────────────────────────────────────┤
              ▼                       ▼                       ▼
      lesson depth &          quiz difficulty          what to do next:
      misconception fixes     (easy/medium/hard)       learn / practice / review
              │                       │                       │
              └────────────── Gemini generates ───────────────┘
                     (validated JSON, offline fallback)
```

1. **Onboarding** — Gemini maps any topic into a 6-concept prerequisite graph; BKT states are
   initialized from the learner's self-reported level.
2. **Knowledge tracking** — every answer runs a Bayesian update (slip/guess/transit parameters
   per difficulty). Mastery **decays toward uncertainty over time** (14-day half-life), which is
   what drives spaced-repetition review recommendations.
3. **Adaptive content** — lessons follow a **Concept → Visual → Example → Story → Takeaway**
   progression, generated per *mastery band* (novice / developing / proficient) and
   regenerated to directly address the learner's **recent wrong answers** and **live
   engagement signals**. Every lesson embeds at least one purposeful visual — a labeled
   SVG chart, a step-by-step flow diagram, or a comparison table — with a note explaining
   how to read it, and ends with a **"Learn Through Storytelling"** section: a short
   relatable story (named character, visualizable situation) followed by an explicit
   connection back to the concept and a one-line takeaway. Visuals are structured JSON
   blocks validated and rendered by Medhā's own micro-visualization engine
   ([frontend/viz.js](frontend/viz.js)) — a malformed generation degrades to a code block,
   never a broken page.
4. **Adaptive assessment** — quiz difficulty follows current mastery; graded **server-side**
   (the browser never sees correct answers before submitting).
5. **Feedback** — per-question explanations, mastery before → after, next difficulty.
6. **Tutor** — a genuine multi-turn conversation, not one-shot Q&A. Turns are persisted
   per learner and replayed to Gemini, so follow-ups resolve against what was actually
   said ("use that same example again, but slower" continues the *same* example). The
   persona is tuned to sound human: no re-introductions, reply length matched to the
   question (a yes/no question gets "Yes."), plain-text math instead of LaTeX, and the
   learner's mastery map as background context rather than something recited back.
7. **Prerequisite gating** — concepts stay locked until their prerequisites reach 55% mastery.

## Beyond quizzes: multi-signal adaptation

- **Sign-in & user isolation** — PBKDF2-hashed passwords, httpOnly cookie sessions
  (only the token's SHA-256 is stored), every query scoped to the signed-in user.
- **Learning-behavior engine** (`frontend/behavior.js` + `/api/behavior`) — tab focus,
  idle time, and quiz response speed are batched to the server and aggregated into an
  **engagement score** that changes lesson tone/pacing and recommendation advice.
- **Camera coaching (opt-in)** — every ~45s one downscaled webcam frame is classified by
  **Gemini vision** into focused / confused / bored / tired…; frames are analyzed
  transiently and never stored — only the label is kept. A "confused" read makes the next
  lesson slower and simpler; "bored" raises the challenge.
- **Mind maps** (`frontend/mindmap.js` + `/api/mindmap`) — Gemini builds a radial concept
  map (intuition · practical examples · steps · pitfalls · connections) rendered as pure
  SVG, cached per concept so repeat views cost zero LLM calls.
- **Teach-back mode (Feynman technique)** (`/api/teachback`) — the learner explains the
  concept in their own words; Gemini grades it (score, strengths, gaps, tip) and a pass
  counts as *hard-difficulty* BKT evidence — articulating beats recognizing.
- **Audio narration with read-along highlighting** (`frontend/speech.js`) — lessons and
  tutor answers read aloud via the Web Speech API, preferring **Indian English voices**
  (Lekha / Rishi / Veena…), male/female selectable, medium 0.95× pace. As the voice
  reads, the current block is highlighted and auto-scrolled, and the **current word is
  karaoke-highlighted** via the CSS Custom Highlight API (graceful fallback to
  block-level). On-device; no audio leaves the browser.
- **Learning-pace profile** (`adaptive.pace_profile`) — recent quiz accuracy × answer
  speed × attempt volume classify each learner as *sprinter / steady / deep-diver /
  warming-up*. The profile is shown on the dashboard, reshapes lesson prompts
  (sprinters get compressed lessons with stretch insights; warming-up learners get
  smaller steps and encouragement), and **steps quiz difficulty beyond the BKT band**
  (`adaptive.adjust_difficulty`): ace recent quizzes → one step harder; struggle → one
  step easier. Lessons cache per (band, pace) so personalization stays LLM-efficient.
- **Streaks** — consecutive study days tracked server-side for gentle gamification.

## Quick start

```bash
cd medha
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # paste your GEMINI_API_KEY
uvicorn backend.main:app --port 8098
```

Open **http://127.0.0.1:8098** — API docs at `/docs`.

No key? Medhā runs in **offline fallback mode**: every flow still works with deterministic
content, clearly labeled in the UI. The demo can never be killed by a network hiccup.

```bash
pytest                        # 25+ tests, fully offline & deterministic
```

## How it maps to the judging parameters

| Parameter | How Medhā addresses it |
|---|---|
| **Problem alignment** (high) | Genuine multi-signal learner adaptation: BKT mastery model × behavior/attention signals × camera engagement × teach-back evidence all feed one adaptive loop — explanations, assessment, feedback, knowledge tracking, and adaptive content connected in a single workflow. |
| **Code quality** (high) | Modular layers (config / store / bkt / adaptive / content / auth / routers; frontend split into app / speech / behavior / mindmap modules), type hints, docstrings, parameterized SQL only, single-responsibility files. |
| **Security** (medium) | Real authentication (PBKDF2 210k iterations, hashed session tokens, httpOnly SameSite cookies); per-user data isolation on every query; identical errors for unknown-email vs wrong-password; prompt-injection guard on teach-back grading; API key server-side only; Pydantic validation everywhere; server-side quiz grading; rate limiting; security headers; DOM-escaped rendering of all LLM output; webcam frames never persisted. |
| **Efficiency** (medium) | Lesson cache per (concept, mastery band) and mind-map cache per concept — repeat views cost zero LLM calls; engagement checks reuse stored signals instead of new calls; async LLM I/O; SQLite WAL + indexes; batched behavior telemetry (one request per ~20s); zero-build vanilla frontend. |
| **Testing** (low) | 41 `pytest` tests: BKT math properties, adaptive policy, auth lifecycle, **user-isolation attack tests**, and end-to-end adaptive-flow tests — all offline and deterministic. |
| **Accessibility** (low) | Voice narration (Indian en-IN voices, male/female, medium pace), semantic HTML, skip link, ARIA live regions & progressbars, keyboard-visible focus, `prefers-reduced-motion`, light/dark themes, WCAG-AA contrast. |

## Project structure

```
medha/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, rate limiting, security headers
│   └── app/
│       ├── config.py            # env-driven settings (.env)
│       ├── database.py          # SQLite schema, migrations, connections
│       ├── store/               # data-access layer by domain (all SQL, parameterized)
│       │   ├── users.py         #   accounts + session tokens
│       │   ├── learners.py      #   learner profiles, concepts, knowledge states
│       │   ├── assessments.py   #   questions, attempts, answer history
│       │   ├── behavior.py      #   engagement telemetry, pace signals, streaks
│       │   ├── tutor.py         #   tutor conversation history
│       │   └── content_cache.py #   cached lessons + mind maps
│       ├── bkt.py               # Bayesian Knowledge Tracing + forgetting decay
│       ├── adaptive.py          # policy: recommendations, pace profile, difficulty
│       ├── auth.py              # PBKDF2 + httpOnly cookie sessions
│       ├── gemini_client.py     # async Gemini REST client (text + vision)
│       ├── content_service.py   # prompts + strict validation of LLM output
│       ├── fallback_content.py  # deterministic offline content
│       ├── schemas.py           # Pydantic request models
│       └── routers/             # learners, lessons, quizzes, tutor,
│                                #   behavior, mindmap, teachback
├── frontend/                    # zero-dependency ES-module SPA
│   ├── index.html · styles.css · config.js
│   └── js/                      # api, dom, state, theme, markdown, viz,
│                                #   auth, onboarding, dashboard, lesson,
│                                #   quiz, tutor, speech, behavior, mindmap
├── tests/                       # bkt math, adaptive policy, auth/isolation, e2e flows
├── api/index.py                 # Vercel serverless entry point
├── ruff.toml · pytest.ini       # backend lint + test configuration
├── eslint.config.mjs            # frontend lint configuration
├── .python-version              # pinned runtime for reproducible deploys
├── .github/workflows/ci.yml    # CI: ruff + pytest on every push
├── requirements.txt             # runtime deps (requirements-dev.txt adds test/lint)
└── .env.example
```

Quality gates: `ruff check backend tests api` and `npx eslint frontend` both pass
clean; `pytest` runs 52 deterministic offline tests. CI enforces all three.

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` `/login` `/logout` | Account lifecycle (cookie sessions) |
| `GET` | `/api/auth/me` | Current session user |
| `POST` | `/api/learners` | Onboard: build concept map, init knowledge state |
| `GET` | `/api/learners/{id}/progress` | Mastery map, recommendation, engagement, streak |
| `POST` | `/api/lessons` | Personalized lesson (band + misconception + engagement aware) |
| `POST` | `/api/quizzes/generate` | Adaptive-difficulty quiz |
| `POST` | `/api/quizzes/submit` | Server-side grading + BKT update + feedback |
| `POST` | `/api/mindmap` | Cached Gemini mind map for a concept |
| `POST` | `/api/teachback` | Feynman-mode explanation grading → BKT evidence |
| `POST` | `/api/behavior/events` | Batched focus/idle/response telemetry |
| `POST` | `/api/behavior/expression` | Opt-in webcam frame → Gemini engagement label |
| `GET` | `/api/behavior/{id}/summary` | Aggregated engagement snapshot |
| `POST` | `/api/tutor` | Multi-turn tutor chat, grounded in the mastery map |
| `GET` | `/api/tutor/{id}/history` | Past turns, so the chat survives a reload |
| `GET` | `/api/health` | LLM status (drives the UI mode badge) |

All learner-scoped routes require a signed-in session and return 404 for any
resource the user does not own.
