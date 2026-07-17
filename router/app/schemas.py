"""Shared data models for the projects API.

These mirror the Supabase `projects` table and are the vocabulary the API
endpoints and the clip worker agree on. Endpoints return the raw DB row
(snake_case JSON), so there is no response model here — only the request
shapes and the status vocabulary.
"""

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ProjectStatus(str, Enum):
    """Lifecycle of a projects row (mirrors the DB check constraint).

    created -> ingesting -> ready | failed. Cancellation: the router sets
    'stopping' (only from created/ingesting); the worker polls, stops
    gracefully, and sets 'cancelled'. A force-cancel terminates the EC2
    instance and jumps straight to 'cancelled'.
    """

    created = "created"
    ingesting = "ingesting"
    ready = "ready"
    failed = "failed"
    stopping = "stopping"
    cancelled = "cancelled"


# Statuses a project can never leave (as raw strings, for DB-row checks).
TERMINAL_STATUSES = frozenset(
    {ProjectStatus.ready.value, ProjectStatus.failed.value, ProjectStatus.cancelled.value}
)


class ProjectSourceType(str, Enum):
    """What clients may submit ('upload' rows are created elsewhere)."""

    livestream = "livestream"
    video = "video"


class ProjectCreateRequest(BaseModel):
    """What a client submits to start a project."""

    name: str | None = None
    source_url: str
    source_type: ProjectSourceType


class ClipEditsRequest(BaseModel):
    """Reviewer edits for one clip (trim + captions + title), saved from the
    in-app editor. Stored verbatim as the `clips.edits` jsonb — the field names
    mirror the frontend `ClipEdits` (camelCase) so the blob round-trips, and
    `extra='allow'` future-proofs the caption schema (owned by the frontend)
    without the router needing to model every field."""

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    title: str | None = None
    trim_start: float | None = Field(default=None, alias="trimStart")
    trim_end: float | None = Field(default=None, alias="trimEnd")
    captions: list[dict] = Field(default_factory=list)
    updated_at: str | None = Field(default=None, alias="updatedAt")
