# Livestream Clipper

Automated clipping: ingest a live stream or VOD, detect the highlight-worthy moments, and serve the clips back for review.

## Architecture

- **`frontend/`** — React + Tailwind (Vite). Submits jobs, browses generated clips.
- **`router/`** — FastAPI control plane (deployed on AWS ECS). Accepts stream/VOD jobs, spawns clip-worker task containers, serves clip metadata.
- **clip workers** — per-job task containers (see the `livestream-container` repo). Ingest the stream, detect clips, upload results to Supabase.
- **Supabase** — clip storage (bucket) + metadata (Postgres).

```
frontend ──▶ router (ECS) ──spawns──▶ clip worker (EC2 task)
    ▲                                        │
    └──────────── Supabase ◀─────────────────┘
```

## Getting started

Everything is configured through the **single global `.env` at the repo root** — both apps read it. New clone? `cp .env.example .env` and fill in values.

**Router** (http://localhost:8000, interactive docs at `/docs`):

```sh
cd router
uv sync
uv run fastapi dev app/main.py
```

**Frontend** (http://localhost:5173):

```sh
cd frontend
pnpm install
pnpm dev
```

## Conventions

- One `.env`, one `.gitignore`, both at the repo root. No per-app copies.
- Vite only exposes `VITE_`-prefixed vars to the browser, and they get baked into the bundle — never prefix a secret with `VITE_`.
- Router settings are typed in `router/app/config.py` (pydantic-settings). Add new env vars there.
- New API endpoints: add a router module under `router/app/routes/` and include it in `routes/__init__.py`. Everything mounts under `/api`.
