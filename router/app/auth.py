"""Supabase JWT auth for the API.

Every endpoint requires `Authorization: Bearer <supabase access token>`. We
validate by asking Supabase itself (GET /auth/v1/user with the anon key as
apikey) rather than verifying the JWT locally — no shared JWT secret to
manage, and revoked sessions fail closed.
"""

from functools import lru_cache

import httpx
from fastapi import Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings


class AuthUser(BaseModel):
    id: str
    email: str | None = None


@lru_cache
def _http_client() -> httpx.Client:
    # One shared client so connections are reused across requests.
    return httpx.Client(timeout=10.0)


def get_current_user(authorization: str = Header(default="")) -> AuthUser:
    """FastAPI dependency: resolve the Supabase user behind the bearer token."""
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=401,
            detail="Missing 'Authorization: Bearer <supabase access token>' header.",
        )

    settings = get_settings()
    try:
        resp = _http_client().get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {token}",
            },
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Could not reach Supabase auth.")

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Supabase token.")

    data = resp.json()
    return AuthUser(id=data["id"], email=data.get("email"))
