"""Builds the EC2 user-data (cloud-init) script that turns a fresh Amazon
Linux 2023 instance into a one-shot clip worker: install Docker, pull the
clip container from ECR, run it with the project's parameters, then
self-terminate.

Secrets: the API keys (Supabase service-role, Deepgram, OpenRouter) are NEVER
written into user-data (it would be readable via IMDS, snapshots, and
cloud-init logs). When `worker_secrets_arn` is set, the worker fetches ONE
Secrets Manager secret at boot via its instance role — a JSON bundle
{"SUPABASE_SERVICE_ROLE_KEY": ..., "SUPABASE_ANON_KEY": ...,
"DEEPGRAM_API_KEY": ..., "OPENROUTER_API_KEY": ...} — parses it with jq, and
exports the keys while command tracing is disabled so no value ever lands in
the logs; the bundle is never echoed. Only non-secret values (project params,
the public Supabase URL, bucket names) are inlined.

Termination: a `trap 'shutdown -h now' EXIT` right after `set -euxo pipefail`
guarantees the instance shuts down even if dnf/pull/docker-run fails, and the
provisioner launches with InstanceInitiatedShutdownBehavior=terminate so the
shutdown terminates (not just stops) the instance.

Injection note: source_url ultimately comes from a client request. Validate it
upstream — a value containing a double-quote or `$(...)` would break out of
the shell string below. (app.routes.projects.validate_source_url enforces the
https/host allowlist and rejects shell-dangerous characters before we get here.)
"""

from app.config import Settings


def build_worker_user_data(
    settings: Settings,
    *,
    project_id: str,
    source_url: str,
    source_type: str,
    virality_threshold: float,
) -> str:
    # Non-secret values are safe to inline into the container env.
    env_lines = [
        f'PROJECT_ID="{project_id}"',
        f'STREAM_URL="{source_url}"',
        f'SOURCE_TYPE="{source_type}"',
        f'VIRALITY_THRESHOLD="{virality_threshold}"',
        f'AWS_REGION="{settings.aws_region}"',
        f'S3_BUCKET="{settings.worker_s3_bucket}"',
        f'SUPABASE_URL="{settings.supabase_url}"',
        f'SUPABASE_CLIPS_BUCKET="{settings.supabase_storage_bucket}"',
    ]

    secret_fetch = ""
    if settings.worker_secrets_arn:
        secret_fetch = (
            "# Fetch the secret bundle (one JSON object of API keys) from Secrets\n"
            "# Manager via the instance role. It is never written into user-data or\n"
            "# the logs — tracing is off in this block, and it is parsed with jq,\n"
            "# never echoed.\n"
            'SECRET_JSON="$(aws secretsmanager get-secret-value '
            f'--region "{settings.aws_region}" '
            f'--secret-id "{settings.worker_secrets_arn}" '
            '--query SecretString --output text)"\n'
            'export SUPABASE_SERVICE_ROLE_KEY="$(jq -r .SUPABASE_SERVICE_ROLE_KEY <<<"$SECRET_JSON")"\n'
            'export DEEPGRAM_API_KEY="$(jq -r .DEEPGRAM_API_KEY <<<"$SECRET_JSON")"\n'
            'export OPENROUTER_API_KEY="$(jq -r .OPENROUTER_API_KEY <<<"$SECRET_JSON")"\n'
            "# Optional YouTube cookies (base64 Netscape jar) for yt-dlp — empty\n"
            "# string when the bundle has no such key, which the container treats\n"
            "# as unset.\n"
            'export YTDLP_COOKIES_B64="$(jq -r \'.YTDLP_COOKIES_B64 // empty\' <<<"$SECRET_JSON")"\n'
            "unset SECRET_JSON\n"
        )
        # Passed by variable reference, not literal value.
        env_lines.append('SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"')
        env_lines.append('DEEPGRAM_API_KEY="$DEEPGRAM_API_KEY"')
        env_lines.append('OPENROUTER_API_KEY="$OPENROUTER_API_KEY"')
        env_lines.append('YTDLP_COOKIES_B64="$YTDLP_COOKIES_B64"')

    docker_env = " \\\n".join(f"  -e {line}" for line in env_lines)

    # Best-effort drain of the media_cleanup_jobs outbox after the main run.
    # Needs SUPABASE_SERVICE_ROLE_KEY, so it only exists when the secret bundle
    # does, and stays inside the `set +x` block. `|| true`: a failed drain must
    # never block shutdown — the next worker picks the jobs up.
    cleanup_run = ""
    if settings.worker_secrets_arn:
        cleanup_run = (
            "\n"
            "# --- Drain the media-cleanup outbox (best-effort; never blocks shutdown) ---\n"
            "docker run --rm \\\n"
            "  --entrypoint python \\\n"
            f'  -e SUPABASE_URL="{settings.supabase_url}" \\\n'
            '  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \\\n'
            f'  -e AWS_REGION="{settings.aws_region}" \\\n'
            '  "$IMAGE_URI" -m livestream_container.cleanup || true\n'
        )

    return f"""#!/bin/bash
set -euxo pipefail

# Guarantee self-termination on ANY exit (success or failure — a failed dnf,
# pull, or docker run must not leave the instance running and billing). The
# provisioner sets InstanceInitiatedShutdownBehavior=terminate, so this
# shutdown terminates the instance.
trap 'shutdown -h now' EXIT

# --- Install & start Docker + jq (Amazon Linux 2023) ---
dnf install -y docker jq
systemctl enable --now docker

REGION="{settings.aws_region}"
IMAGE_URI="{settings.worker_image_uri}"

# --- Authenticate to ECR and pull the clip container ---
# AL2023 ships the AWS CLI v2; the instance profile provides ECR read perms.
REGISTRY="$(echo "$IMAGE_URI" | cut -d'/' -f1)"
aws ecr get-login-password --region "$REGION" \\
  | docker login --username AWS --password-stdin "$REGISTRY"

# --- Run the job. Disable tracing so no secret reaches the cloud-init log. ---
set +x
{secret_fetch}docker run --rm \\
{docker_env} \\
  "$IMAGE_URI"
{cleanup_run}set -x

# --- The EXIT trap above runs `shutdown -h now`, terminating the instance. ---
"""
