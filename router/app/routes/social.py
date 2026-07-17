"""Social account linking, backed by Zernio (see app/zernio.py).

The frontend asks here (never Zernio directly — the API key is server-side)
for the user's connected accounts and for hosted OAuth connect URLs. Zernio
stores the accounts under a per-user Zernio profile; we cache only the
user -> profile id mapping (public.social_profiles).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, get_current_user
from app.schemas import SocialLinkRequest
from app.supabase_client import get_supabase
from app import zernio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/social", tags=["social"])


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
    body: SocialLinkRequest, user: AuthUser = Depends(get_current_user)
) -> dict:
    """Hosted OAuth URL to connect one platform account; open it in a new tab."""
    profile_id = _profile_id(user)
    try:
        url = zernio.connect_url(profile_id, body.platform.value)
    except zernio.ZernioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"auth_url": url}
