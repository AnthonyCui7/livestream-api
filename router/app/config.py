from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The router's own .env (router/.env). The frontend has a separate
# frontend/.env with the VITE_ vars. extra="ignore" tolerates any stray/unknown
# keys, and a missing .env (e.g. in a container, where vars come from the
# environment directly) is simply skipped rather than an error.
ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────
    log_level: str = "INFO"
    # Comma-separated in the env; use frontend_origin_list to read.
    frontend_origin: str = "http://localhost:5173"
    # Optional regex for dynamic origins the static list can't cover (Vercel
    # preview/deployment URLs). Empty = no regex matching.
    frontend_origin_regex: str = ""

    # ── Zernio (social posting API) ──────────────────────────────────
    # Server-side only. Empty key = social endpoints answer 503.
    zernio_api_key: str = ""
    zernio_api_base_url: str = "https://zernio.com/api/v1"

    # ── Supabase (clip storage + metadata) ───────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    # Server-side only — bypasses RLS. Never ship to the browser.
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "clips"

    # ── AWS ──────────────────────────────────────────────────────────
    aws_region: str = "us-east-1"

    # ── Clip-worker EC2 provisioning ─────────────────────────────────
    # AMI the workers boot from (Amazon Linux 2023 recommended — the
    # user-data bootstrap assumes dnf + systemd + a preinstalled AWS CLI).
    worker_ami_id: str = ""
    worker_instance_type: str = "c7i.2xlarge"
    worker_subnet_id: str = ""
    # Comma-separated in the env; use worker_security_group_id_list to read.
    worker_security_group_ids: str = ""
    # Instance profile name or ARN. Needs ECR read to pull the image and
    # secretsmanager:GetSecretValue to read the Supabase key (see below).
    worker_iam_instance_profile: str = ""
    # Secrets Manager ARN holding the Supabase service-role key. The worker
    # fetches it at boot via its instance role — the secret is NEVER inlined
    # into user-data. Leave empty if the worker gets its creds another way.
    worker_secrets_arn: str = ""
    # Optional SSH key name, handy for debugging a stuck worker.
    worker_key_name: str = ""
    # ECR image URI for the clip container (the livestream-container repo).
    worker_image_uri: str = ""
    worker_ebs_volume_size_gb: int = 100
    worker_tag_project: str = "livestream-clipper"
    # S3 bucket the worker writes raw/intermediate media to.
    worker_s3_bucket: str = "livestream-media-519659320853"

    @property
    def frontend_origin_list(self) -> list[str]:
        return [s.strip() for s in self.frontend_origin.split(",") if s.strip()]

    @property
    def worker_security_group_id_list(self) -> list[str]:
        return [s.strip() for s in self.worker_security_group_ids.split(",") if s.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
