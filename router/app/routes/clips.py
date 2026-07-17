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
from app.schemas import ClipEditsRequest
from app.supabase_client import get_supabase

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
