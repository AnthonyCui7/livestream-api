"""Centralized boto3 access so region/credentials are configured in one place.

Credentials come from the standard AWS chain (env vars, shared config, or —
in production — the task/instance IAM role). We never put AWS keys in .env.
"""

from functools import lru_cache

import boto3


@lru_cache
def get_boto_session() -> boto3.session.Session:
    # Imported lazily to avoid a circular import at module load.
    from app.config import get_settings

    return boto3.session.Session(region_name=get_settings().aws_region)


def get_ec2_client():
    # Not cached: boto3 clients are thread-safe to *use* but we keep creation
    # cheap and per-call so tests can freely mock AWS without stale clients.
    return get_boto_session().client("ec2")
