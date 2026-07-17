"""Thin Zernio client (zernio.com — unified social posting API).

Zernio owns the OAuth dance and the connected-account storage: we create one
Zernio *profile* per user (cached in public.social_profiles), send the user to
Zernio's hosted connect URL to link a platform account, and post rendered
clips by URL. The API key is server-side only (settings.zernio_api_key); when
it is unset every entry point raises ZernioNotConfigured, which the routes
translate to a 503 so the frontend can show a friendly "not configured" state.

API shape (docs.zernio.com): Bearer sk_… auth, POST /profiles, GET
/connect/{platform}?profileId=…, GET /accounts, POST /posts.
"""

import logging
from functools import lru_cache
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class ZernioNotConfigured(Exception):
    """Raised when ZERNIO_API_KEY is not set."""


class ZernioError(Exception):
    """A Zernio API call failed; message is safe to show the client."""


@lru_cache
def _client() -> httpx.Client:
    settings = get_settings()
    if not settings.zernio_api_key:
        raise ZernioNotConfigured()
    return httpx.Client(
        base_url=settings.zernio_api_base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.zernio_api_key}"},
        timeout=20.0,
    )


def _call(method: str, path: str, **kwargs: Any) -> Any:
    try:
        response = _client().request(method, path, **kwargs)
    except httpx.HTTPError as exc:
        logger.warning("zernio %s %s transport error: %s", method, path, exc)
        raise ZernioError("Could not reach the social posting service.") from exc
    if response.status_code >= 400:
        # Log the body server-side; never forward Zernio internals verbatim.
        logger.warning(
            "zernio %s %s -> %s: %s", method, path, response.status_code, response.text[:500]
        )
        raise ZernioError(f"Social posting service error ({response.status_code}).")
    return response.json()


def get_or_create_profile(supabase, *, user_id: str, email: str | None) -> str:
    """Return the user's Zernio profile id, creating and caching it on first use.

    Zernio profile names are unique per API key, and a profile may already
    exist under this name without a social_profiles row (created via the
    Zernio dashboard, or the cache row was lost) — so adopt an existing
    same-named profile before creating a new one."""
    rows = (
        supabase.table("social_profiles")
        .select("zernio_profile_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    if rows:
        return rows[0]["zernio_profile_id"]

    name = email or user_id
    profile_id = _find_profile_id_by_name(name)
    if profile_id is None:
        created = _call(
            "POST",
            "/profiles",
            json={"name": name, "description": "clipfarm user profile"},
        )
        profile_id = str(created.get("_id") or created.get("id") or "")
    if not profile_id:
        raise ZernioError("Social posting service returned no profile id.")
    supabase.table("social_profiles").insert(
        {"user_id": user_id, "zernio_profile_id": profile_id}
    ).execute()
    return profile_id


def _find_profile_id_by_name(name: str) -> str | None:
    data = _call("GET", "/profiles")
    raw = data if isinstance(data, list) else data.get("profiles", [])
    for profile in raw:
        if isinstance(profile, dict) and profile.get("name") == name:
            return str(profile.get("_id") or profile.get("id") or "") or None
    return None


def connect_url(profile_id: str, platform: str) -> str:
    data = _call("GET", f"/connect/{platform}", params={"profileId": profile_id})
    url = data.get("authUrl") or data.get("url")
    if not url:
        raise ZernioError("Social posting service returned no connect URL.")
    return str(url)


def list_accounts(profile_id: str) -> list[dict[str, Any]]:
    data = _call("GET", "/accounts", params={"profileId": profile_id})
    raw = data if isinstance(data, list) else data.get("accounts", [])
    return [
        {
            "id": str(a.get("_id") or a.get("id") or ""),
            "platform": a.get("platform"),
            "name": a.get("name") or a.get("username") or a.get("displayName"),
        }
        for a in raw
        if isinstance(a, dict)
    ]


def create_post(
    *, caption: str, platform: str, account_id: str, media_url: str
) -> dict[str, Any]:
    data = _call(
        "POST",
        "/posts",
        json={
            "content": caption,
            "publishNow": True,
            "mediaUrls": [media_url],
            "platforms": [{"platform": platform, "accountId": account_id}],
        },
    )
    return {
        "post_id": str(data.get("_id") or data.get("id") or ""),
        "status": data.get("status", "publishing"),
    }
