from app.config import Settings
from app.workers.user_data import build_worker_user_data


def _settings(**over) -> Settings:
    base = dict(
        aws_region="us-west-2",
        worker_image_uri="123456789012.dkr.ecr.us-west-2.amazonaws.com/clip:latest",
        supabase_url="https://proj.supabase.co",
        supabase_service_role_key="super-secret-value",
        supabase_storage_bucket="clips",
    )
    base.update(over)
    return Settings(**base)


def test_user_data_injects_job_params_but_never_the_secret_key():
    script = build_worker_user_data(  # no worker_secrets_arn configured
        _settings(), job_id="job-abc", source_url="https://example.com/vod.mp4", source_type="vod"
    )

    assert script.startswith("#!/bin/bash")
    # Job + non-secret config are inlined.
    assert 'JOB_ID="job-abc"' in script
    assert 'SOURCE_URL="https://example.com/vod.mp4"' in script
    assert 'SOURCE_TYPE="vod"' in script
    assert 'SUPABASE_URL="https://proj.supabase.co"' in script  # public, not a secret
    assert "docker login" in script
    assert "123456789012.dkr.ecr.us-west-2.amazonaws.com/clip:latest" in script
    assert "shutdown -h now" in script
    # The service-role key must NEVER appear literally in user-data.
    assert "super-secret-value" not in script


def test_user_data_fetches_secret_from_secrets_manager_when_configured():
    arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:supabase-abc"
    script = build_worker_user_data(
        _settings(worker_secrets_arn=arn), job_id="j", source_url="u", source_type="stream"
    )

    # Still no literal secret in the script.
    assert "super-secret-value" not in script
    # Worker fetches it at boot via its instance role.
    assert "aws secretsmanager get-secret-value" in script
    assert arn in script
    # Passed to the container by variable reference, not literal value.
    assert '-e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"' in script
    # Tracing disabled around the secret so it never hits cloud-init logs.
    assert "set +x" in script
