"""Shared data models for jobs and clips.

These mirror the Supabase tables and are the vocabulary the (future) API
endpoints and the clip worker agree on.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class SourceType(str, Enum):
    stream = "stream"  # live ingest (HLS/RTMP)
    vod = "vod"  # a downloadable recording


class JobStatus(str, Enum):
    pending = "pending"  # accepted, not yet provisioned
    provisioning = "provisioning"  # EC2 worker launching
    running = "running"  # worker is processing
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ClipJobRequest(BaseModel):
    """What a client submits to start a job."""

    source_url: str
    source_type: SourceType = SourceType.vod
    title: str | None = None


class Job(BaseModel):
    id: str
    status: JobStatus
    source_url: str
    source_type: SourceType
    instance_id: str | None = None  # the EC2 worker handling this job
    error: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Clip(BaseModel):
    id: str
    job_id: str
    storage_path: str  # path within the Supabase storage bucket
    start_seconds: float
    end_seconds: float
    title: str | None = None
    score: float | None = None  # how highlight-worthy the pipeline rated it
    created_at: datetime | None = None
