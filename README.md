# Livestream Clipper

Automated clipping: ingest a live stream or VOD, detect the highlight-worthy moments, and serve the clips back for review.

## Architecture

- **`frontend/`** — React + Tailwind (Vite). Submits jobs, browses generated clips.
- **`router/`** — FastAPI control plane (a long-running container). Accepts stream/VOD jobs, launches a clip-worker EC2 instance per job, serves clip metadata.
- **clip workers** — per-job EC2 instances that run the clip container (see the `livestream-container` repo). Ingest the source, detect clips, upload results to Supabase, then self-terminate.
- **Supabase** — clip storage (bucket) + metadata (Postgres).

```
frontend ──▶ router (container) ──run_instances──▶ clip worker (EC2)
    ▲                                                    │
    └──────────────────── Supabase ◀─────────────────────┘
```

## Getting started

Everything is configured through the **single global `.env` at the repo root** — both apps read it. It's gitignored, so grab the current values from a teammate on a fresh clone.

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

Run the router tests with `cd router && uv run pytest` (AWS calls are mocked with moto).

## Router internals (`router/app/`)

- `config.py` — typed settings (pydantic-settings) read from the root `.env`. All new env vars go here.
- `logging_config.py` — stdout logging, configured at app startup.
- `aws.py` — one place for the boto3 session/clients (region + credential chain).
- `supabase_client.py` — cached server-side Supabase client (service-role key, bypasses RLS).
- `schemas.py` — `Job` / `Clip` / `ClipJobRequest` models, the vocabulary shared with the worker.
- `workers/` — the core of the router:
  - `provisioner.py` — `launch_worker()` / `terminate_worker()` / `get_worker_state()` over EC2 `run_instances`.
  - `user_data.py` — the cloud-init bootstrap the worker boots into (install Docker → ECR pull → run container → self-terminate).

The worker's instance profile needs ECR read (`AmazonEC2ContainerRegistryReadOnly`) plus `secretsmanager:GetSecretValue` on the Supabase secret; the router's own role needs `ec2:RunInstances`, `ec2:TerminateInstances`, `ec2:CreateTags`, `ec2:DescribeInstances`, and `iam:PassRole` for the worker profile.

## Secrets & trust model

Three tiers, and the Supabase **service-role key** never crosses from one to a less-trusted one:

- **Browser / end users** → `VITE_SUPABASE_ANON_KEY` only, gated by Supabase Auth + Row-Level Security. The service-role key is never shipped to the client.
- **Router (trusted backend)** → holds the service-role key server-side (from the env / task secret). This is its correct home.
- **Clip worker (EC2)** → does *not* get the key baked into user-data. It reads it from Secrets Manager at boot via its instance role (`WORKER_SECRETS_ARN`), with shell tracing disabled so it never lands in logs.

> Stricter option (not yet built): keep the service-role key *only* on the router and have workers report results back through a router endpoint (or upload via short-lived signed URLs), so a compromised worker never has broad DB access. Say the word and I'll wire that instead.

## Deploying the router

The router is containerized (`router/Dockerfile`) so it runs on **ECS Fargate** or **App Runner** — but the ECS task definition / service (or IaC) is **not written yet**; only the image is. For low traffic either is fine; both just need the image plus the env vars from `.env` and an IAM role with the EC2/PassRole permissions above.

## Conventions

- One `.env`, one `.gitignore`, both at the repo root. No per-app copies.
- Vite only exposes `VITE_`-prefixed vars to the browser, and they get baked into the bundle — never prefix a secret with `VITE_`.
- Router settings are typed in `router/app/config.py` (pydantic-settings). Add new env vars there.
- New API endpoints: add a router module under `router/app/routes/` and include it in `routes/__init__.py`. Everything mounts under `/api`.
- AWS credentials come from the standard chain (task role in prod, `aws configure` locally) — never in `.env`.
