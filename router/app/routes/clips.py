"""Clip endpoints: save reviewer edits (trim + captions + title override).

Clips are service_role-only for writes (RLS), so edits authored in the in-app
editor come through the router. We verify the caller owns the clip's project
(clip -> project.user_id == the JWT user) before writing, and return 404 rather
than 403 for someone else's clip so ids don't leak across users.

The response is the raw updated DB row (snake_case JSON), matching the shape the
frontend already reads directly from Supabase.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, get_current_user
from app.schemas import ClipEditsRequest, ClipPostRequest
from app.supabase_client import get_supabase
from app import zernio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clips", tags=["clips"])


def _get_owned_clip(supabase, clip_id: UUID, user: AuthUser) -> dict:
    """Return the clip row iff the caller owns its parent project, else 404."""
    clip_rows = (
        supabase.table("clips").select("*").eq("id", str(clip_id)).execute().data
    )
    if not clip_rows:
        raise HTTPException(status_code=404, detail="Clip not found.")
    clip = clip_rows[0]

    proj_rows = (
        supabase.table("projects")
        .select("user_id")
        .eq("id", clip["project_id"])
        .execute()
        .data
    )
    if not proj_rows or proj_rows[0].get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="Clip not found.")
    return clip


@router.patch("/{clip_id}")
def save_clip_edits(
    clip_id: UUID,
    body: ClipEditsRequest,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Persist the editor's trim/captions/title for a clip the caller owns."""
    supabase = get_supabase()
    _get_owned_clip(supabase, clip_id, user)

    # by_alias keeps the frontend's camelCase keys; exclude_none drops unset
    # optionals but keeps captions ([] when none) so the blob stays well-formed.
    edits = body.model_dump(by_alias=True, exclude_none=True)
    updated = (
        supabase.table("clips")
        .update({"edits": edits})
        .eq("id", str(clip_id))
        .execute()
        .data
    )
    return updated[0] if updated else _get_owned_clip(supabase, clip_id, user)


@router.post("/{clip_id}/post")
def post_clip(
    clip_id: UUID,
    body: ClipPostRequest,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    """Publish a rendered clip to one linked social account via Zernio.

    409 when the platform isn't linked yet — the frontend then offers the
    connect flow (POST /api/social/accounts/link)."""
    supabase = get_supabase()
    clip = _get_owned_clip(supabase, clip_id, user)

    video_url = clip.get("video_url")
    if clip.get("status") != "rendered" or not video_url:
        raise HTTPException(
            status_code=409, detail="Only rendered clips can be posted."
        )

    try:
        profile_id = zernio.get_or_create_profile(
            supabase, user_id=user.id, email=user.email
        )
        accounts = zernio.list_accounts(profile_id)
        account = next(
            (a for a in accounts if a.get("platform") == body.platform.value), None
        )
        if account is None:
            raise HTTPException(
                status_code=409,
                detail=f"No linked {body.platform.value} account. Connect one first.",
            )
        result = zernio.create_post(
            caption=body.caption or clip.get("title") or "",
            platform=body.platform.value,
            account_id=account["id"],
            media_url=video_url,
        )
    except zernio.ZernioNotConfigured:
        raise HTTPException(
            status_code=503, detail="Social posting is not configured on this server."
        )
    except zernio.ZernioError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    logger.info(
        "clip %s posted to %s by %s (zernio post %s)",
        clip_id, body.platform.value, user.id, result.get("post_id"),
    )
    return result
