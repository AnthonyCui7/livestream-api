"""Project lifecycle endpoints: create (launch a worker), cancel, delete.

The router owns the birth of a projects row (status='created', user_id from
the JWT) and the EC2 worker launch; the worker container attaches to the row
via PROJECT_ID and drives ingesting -> ready/failed. Cancellation is
cooperative — we set 'stopping' and the worker polls for it — unless
force=true, which terminates the instance and sets 'cancelled' directly.
A graceful cancel only trusts a worker that is actually alive: when the row
has no instance or EC2 says the instance is gone, we set 'cancelled' directly
so the row can never get stuck waiting for an acknowledgement that will never
come.

All responses are the raw DB row (snake_case JSON), so the frontend sees the
same shape it reads directly from Supabase.
"""

import logging
from urllib.parse import urlparse
from uuid import UUID

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException

from app.auth import AuthUser, get_current_user
from app.schemas import TERMINAL_STATUSES, ProjectCreateRequest, ProjectStatus
from app.supabase_client import get_supabase
from app.workers import provisioner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

# Hosts we accept stream/video URLs from.
ALLOWED_HOSTS = frozenset(
    {
        "twitch.tv",
        "www.twitch.tv",
        "m.twitch.tv",
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "youtu.be",
    }
)

# Characters that could break out of the double-quoted bash string the URL is
# embedded in (see app/workers/user_data.py) — reject outright. `&` is NOT
# here: it is literal inside double quotes and appears in ordinary YouTube
# URLs (`watch?v=...&pp=...`).
DANGEROUS_URL_CHARS = frozenset("\"'\\$`;|<> ")

# EC2 lifecycle states in which the worker can no longer acknowledge 'stopping'.
DEAD_WORKER_STATES = frozenset({"shutting-down", "terminated", "stopped"})

# Statuses a direct 'cancelled' write may overwrite — never a terminal state.
CANCELLABLE_STATUSES = [
    ProjectStatus.created.value,
    ProjectStatus.ingesting.value,
    ProjectStatus.stopping.value,
]


def validate_source_url(url: str) -> None:
    """Raise ValueError unless `url` is a safe https Twitch/YouTube URL.

    The URL ends up inside a double-quoted bash string in EC2 user-data, so
    beyond the host allowlist we reject any shell-dangerous character.
    """
    bad = DANGEROUS_URL_CHARS.intersection(url)
    if bad:
        raise ValueError(
            f"source_url contains forbidden character(s): {''.join(sorted(bad))}"
        )
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise ValueError("source_url must be an https:// URL.")
    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        raise ValueError("source_url host must be twitch.tv, youtube.com, or youtu.be.")


def derive_project_name(url: str) -> str:
    """Default project name: 'Twitch: <channel>', 'YouTube video', or the host."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host.endswith("twitch.tv"):
        channel = parsed.path.strip("/").split("/")[0]
        return f"Twitch: {channel}" if channel else "Twitch stream"
    if host == "youtu.be" or host.endswith("youtube.com"):
        return "YouTube video"
    return host or url


def _get_owned_project(supabase, project_id: UUID, user: AuthUser) -> dict:
    rows = supabase.table("projects").select("*").eq("id", str(project_id)).execute().data
    # 404 (not 403) for other users' rows so project ids don't leak.
    if not rows or rows[0].get("user_id") != user.id:
        raise HTTPException(status_code=404, detail="Project not found.")
    return rows[0]


def _terminate_quietly(instance_id: str) -> None:
    """Terminate a worker instance, ignoring instances that are already gone.

    Two shapes of "gone": NotFound (the id aged out of EC2 entirely), and
    UnauthorizedOperation — the terminate permission matches on the
    clip-worker resource tag, and a vanished instance has no tags left to
    match, so EC2 reports it as an authorization failure rather than a
    missing resource."""
    try:
        provisioner.terminate_worker(instance_id)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if "NotFound" not in code and code != "UnauthorizedOperation":
            raise
        logger.info("instance %s not terminable (%s) — ignoring", instance_id, code)


def _worker_is_alive(instance_id: str) -> bool:
    """Best-effort liveness check for a worker instance.

    False only when EC2 definitively says the instance is gone (dead state or
    NotFound). On a transient describe error we report True — the graceful
    'stopping' write is the safe fallback, and cancel must never 500.
    """
    try:
        state = provisioner.get_worker_state(instance_id)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if "NotFound" in code:
            return False
        logger.warning(
            "could not determine state of %s (%s) — assuming alive", instance_id, code
        )
        return True
    except Exception:
        logger.exception("could not determine state of %s — assuming alive", instance_id)
        return True
    return state is not None and state not in DEAD_WORKER_STATES


def _set_cancelled_directly(supabase, project_id: UUID, user: AuthUser) -> dict:
    """Jump straight to 'cancelled', guarded so a terminal state is never overwritten.

    When the guard matches nothing the worker won the race (the row reached a
    terminal state first) — re-read and return what it wrote.
    """
    rows = (
        supabase.table("projects")
        .update({"status": ProjectStatus.cancelled.value})
        .eq("id", str(project_id))
        .in_("status", CANCELLABLE_STATUSES)
        .execute()
        .data
    )
    return rows[0] if rows else _get_owned_project(supabase, project_id, user)


@router.post("", status_code=201)
def create_project(
    body: ProjectCreateRequest, user: AuthUser = Depends(get_current_user)
) -> dict:
    try:
        validate_source_url(body.source_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    supabase = get_supabase()
    inserted = (
        supabase.table("projects")
        .insert(
            {
                "user_id": user.id,
                "name": body.name or derive_project_name(body.source_url),
                "source_type": body.source_type.value,
                "source_url": body.source_url,
                "status": ProjectStatus.created.value,
            }
        )
        .execute()
        .data[0]
    )
    project_id = inserted["id"]

    try:
        instance_id = provisioner.launch_worker(
            project_id=project_id,
            source_url=body.source_url,
            source_type=body.source_type.value,
        )
    except Exception:
        # The full exception is logged server-side only — AWS internals must
        # never leak into the DB row or the client response.
        logger.exception("worker launch failed for project %s", project_id)
        supabase.table("projects").update(
            {"status": ProjectStatus.failed.value, "error": "Worker launch failed."}
        ).eq("id", project_id).in_(
            "status", [ProjectStatus.created.value]
        ).execute()
        raise HTTPException(
            status_code=502, detail="Failed to launch the clip worker. Please try again."
        )

    rows = (
        supabase.table("projects")
        .update({"instance_id": instance_id})
        .eq("id", project_id)
        .execute()
        .data
    )
    return rows[0] if rows else {**inserted, "instance_id": instance_id}


@router.post("/{project_id}/cancel")
def cancel_project(
    project_id: UUID, force: bool = False, user: AuthUser = Depends(get_current_user)
) -> dict:
    supabase = get_supabase()
    row = _get_owned_project(supabase, project_id, user)

    if row["status"] in TERMINAL_STATUSES:
        return row  # already done — cancelling is an idempotent no-op

    if force:
        if row.get("instance_id"):
            _terminate_quietly(row["instance_id"])
        return _set_cancelled_directly(supabase, project_id, user)

    # Graceful cancel is only worth asking for when a live worker can hear it.
    # No instance recorded (launch failed mid-request) or a dead instance can
    # never acknowledge 'stopping' — jump straight to 'cancelled'; a
    # late-booting worker exits cleanly when it sees 'cancelled' at attach.
    instance_id = row.get("instance_id")
    if not instance_id or not _worker_is_alive(instance_id):
        return _set_cancelled_directly(supabase, project_id, user)

    if row["status"] == ProjectStatus.stopping.value:
        return row  # already asked; the live worker will acknowledge

    # Live worker: flag the row; the worker polls, stops, and sets 'cancelled'.
    # The status filter guards against racing a worker that just finished.
    rows = (
        supabase.table("projects")
        .update({"status": ProjectStatus.stopping.value})
        .eq("id", str(project_id))
        .in_("status", [ProjectStatus.created.value, ProjectStatus.ingesting.value])
        .execute()
        .data
    )
    return rows[0] if rows else row


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: UUID, user: AuthUser = Depends(get_current_user)
) -> None:
    supabase = get_supabase()
    row = _get_owned_project(supabase, project_id, user)

    if row.get("instance_id"):
        _terminate_quietly(row["instance_id"])

    # DB triggers enqueue media cleanup (S3 + storage) when the row goes away.
    supabase.table("projects").delete().eq("id", str(project_id)).execute()
