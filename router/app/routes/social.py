"""Social account linking, backed by Zernio (see app/zernio.py).

The frontend asks here (never Zernio directly — the API key is server-side)
for the user's connected accounts and for hosted OAuth connect URLs. Zernio
stores the accounts under a per-user Zernio profile; we cache only the
user -> profile id mapping (public.social_profiles).
"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import AuthUser, get_current_user
from app.config import get_settings
from app.schemas import SocialLinkRequest
from app.supabase_client import get_supabase
from app import zernio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/social", tags=["social"])


def _connect_redirect(request: Request) -> str:
    """Where Zernio sends the user after the platform's OAuth consent screen:
    the frontend's /social/connected page, on whichever origin initiated the
    link. The Origin header is validated against the configured CORS origins
    (list + regex) so an arbitrary caller can't turn this into an open
    redirect; anything unrecognized falls back to the first configured
    origin (production)."""
    settings = get_settings()
    allowed = settings.frontend_origin_list
    origin = (request.headers.get("origin") or "").rstrip("/")
    ok = origin in {o.rstrip("/") for o in allowed}
    if not ok and origin and settings.frontend_origin_regex:
        ok = re.fullmatch(settings.frontend_origin_regex, origin) is not None
    if not ok:
        origin = allowed[0].rstrip("/") if allowed else "http://localhost:5173"
    return f"{origin}/social/connected"


def _profile_id(user: AuthUser) -> str:
    try:
        return zernio.get_or_create_profile(
            get_supabase(), user_id=user.id, email=user.email
        )
    except zernio.ZernioNotConfigured:
        raise HTTPException(
            status_code=503, detail="Social posting is not configured on this server."
        )
    except zernio.ZernioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/accounts")
def list_accounts(user: AuthUser = Depends(get_current_user)) -> dict:
    """The caller's connected social accounts (empty list = none linked)."""
    profile_id = _profile_id(user)
    try:
        accounts = zernio.list_accounts(profile_id)
    except zernio.ZernioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"accounts": accounts}


@router.post("/accounts/link")
def link_account(
    body: SocialLinkRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Platform OAuth URL to connect one account; open it in a new tab. After
    the user grants access, Zernio associates the account with their profile
    and lands them back on the frontend's /social/connected page."""
    profile_id = _profile_id(user)
    try:
        url = zernio.connect_url(
            profile_id, body.platform.value, _connect_redirect(request)
        )
    except zernio.ZernioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"auth_url": url}
