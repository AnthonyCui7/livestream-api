from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# The single global .env at the repo root, shared with the frontend.
# extra="ignore" lets frontend-only VITE_* vars live in the same file.
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    frontend_origin: str = "http://localhost:5173"

    # Supabase (clip storage + metadata)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "clips"

    # AWS — spawning clip-worker task containers
    aws_region: str = "us-east-1"
    ecs_cluster: str = ""
    ecs_task_definition: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
