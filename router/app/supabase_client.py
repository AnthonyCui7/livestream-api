from functools import lru_cache

from supabase import Client, create_client

from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    """Server-side Supabase client using the service-role key (bypasses RLS).

    Cached so we reuse one client across requests.
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use Supabase."
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
