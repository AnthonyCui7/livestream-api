"""Builds the EC2 user-data (cloud-init) script that turns a fresh Amazon
Linux 2023 instance into a one-shot clip worker: install Docker, pull the
clip container from ECR, run it with the job's parameters, then self-terminate.

Secrets: the Supabase service-role key is NEVER written into user-data (it
would be readable via IMDS, snapshots, and cloud-init logs). When
`worker_secrets_arn` is set, the worker fetches the key from Secrets Manager
at boot using its instance role, and command tracing is disabled around that
step so the value never lands in the logs. Only non-secret values
(job params, the public Supabase URL, the bucket name) are inlined.

Injection note: source_url ultimately comes from a client request. Validate it
upstream — a value containing a double-quote or `$(...)` would break out of the
shell string below. (The API layer should enforce a URL shape before we get here.)
"""

from app.config import Settings


def build_worker_user_data(
    settings: Settings,
    *,
    job_id: str,
    source_url: str,
    source_type: str,
) -> str:
    # Non-secret values are safe to inline into the container env.
    env_lines = [
        f'JOB_ID="{job_id}"',
        f'SOURCE_URL="{source_url}"',
        f'SOURCE_TYPE="{source_type}"',
        f'AWS_REGION="{settings.aws_region}"',
        f'SUPABASE_URL="{settings.supabase_url}"',
        f'SUPABASE_STORAGE_BUCKET="{settings.supabase_storage_bucket}"',
    ]

    secret_fetch = ""
    if settings.worker_secrets_arn:
        secret_fetch = (
            "# Fetch the Supabase service-role key from Secrets Manager via the\n"
            "# instance role. It is never written into user-data or IMDS.\n"
            'SUPABASE_SERVICE_ROLE_KEY="$(aws secretsmanager get-secret-value '
            f'--region "{settings.aws_region}" '
            f'--secret-id "{settings.worker_secrets_arn}" '
            '--query SecretString --output text)"\n'
        )
        # Pass by variable reference, not literal value.
        env_lines.append('SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"')

    docker_env = " \\\n".join(f"  -e {line}" for line in env_lines)

    return f"""#!/bin/bash
set -euxo pipefail

# --- Install & start Docker (Amazon Linux 2023) ---
dnf install -y docker
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
set -x

# --- Self-terminate (launched with InstanceInitiatedShutdownBehavior=terminate) ---
shutdown -h now
"""
