from app.config import Settings
from app.workers.user_data import build_worker_user_data


def _settings(**over) -> Settings:
    base = dict(
        aws_region="us-west-2",
        worker_image_uri="123456789012.dkr.ecr.us-west-2.amazonaws.com/clip:latest",
        worker_s3_bucket="livestream-media-519659320853",
        supabase_url="https://proj.supabase.co",
        supabase_service_role_key="super-secret-value",
        supabase_storage_bucket="clips",
    )
    base.update(over)
    # _env_file=None: don't let values from router/.env leak into the test.
    return Settings(_env_file=None, **base)


def _build(**over) -> str:
    params = dict(
        project_id="proj-abc",
        source_url="https://www.twitch.tv/somechannel",
        source_type="livestream",
    )
    settings_over = over.pop("settings_over", {})
    params.update(over)
    return build_worker_user_data(_settings(**settings_over), **params)


def test_user_data_injects_project_params_but_never_the_secret_key():
    script = _build()  # no worker_secrets_arn configured

    assert script.startswith("#!/bin/bash")
    # Project params + non-secret config are inlined under the container names.
    assert 'PROJECT_ID="proj-abc"' in script
    assert 'STREAM_URL="https://www.twitch.tv/somechannel"' in script
    assert 'SOURCE_TYPE="livestream"' in script
    assert 'AWS_REGION="us-west-2"' in script
    assert 'S3_BUCKET="livestream-media-519659320853"' in script
    assert 'SUPABASE_URL="https://proj.supabase.co"' in script  # public, not a secret
    assert 'SUPABASE_CLIPS_BUCKET="clips"' in script
    assert "docker login" in script
    assert "123456789012.dkr.ecr.us-west-2.amazonaws.com/clip:latest" in script
    # The service-role key must NEVER appear literally in user-data.
    assert "super-secret-value" not in script


def test_user_data_never_uses_the_old_env_names():
    script = _build()

    assert "JOB_ID" not in script
    assert "SOURCE_URL" not in script  # container expects STREAM_URL
    assert "SUPABASE_STORAGE_BUCKET" not in script  # container expects SUPABASE_CLIPS_BUCKET


def test_user_data_traps_exit_to_guarantee_self_termination():
    script = _build()

    # The trap comes right after `set -euxo pipefail`, before anything that can
    # fail (dnf/pull/docker run), so a failed bootstrap still terminates.
    assert "trap 'shutdown -h now' EXIT" in script
    assert script.index("set -euxo pipefail") < script.index("trap 'shutdown -h now' EXIT")
    assert script.index("trap 'shutdown -h now' EXIT") < script.index("dnf install")
    # jq is needed to parse the secret bundle.
    assert "dnf install -y docker jq" in script


def test_user_data_fetches_secret_bundle_from_secrets_manager_when_configured():
    arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:worker-abc"
    script = _build(settings_over=dict(worker_secrets_arn=arn))

    # Still no literal secret in the script.
    assert "super-secret-value" not in script
    # Worker fetches the JSON bundle ONCE at boot via its instance role...
    assert script.count("aws secretsmanager get-secret-value") == 1
    assert arn in script
    # ...parses it with jq (never echoes it), and exports each key.
    for key in ("SUPABASE_SERVICE_ROLE_KEY", "DEEPGRAM_API_KEY", "OPENROUTER_API_KEY"):
        assert f'export {key}="$(jq -r .{key} <<<"$SECRET_JSON")"' in script
        # Passed to the container by variable reference, not literal value.
        assert f'-e {key}="${key}"' in script
    assert 'echo "$SECRET_JSON"' not in script
    assert "unset SECRET_JSON" in script
    # Tracing is disabled around the whole secret block so nothing hits the logs.
    assert script.index("set +x") < script.index("SECRET_JSON")
    assert script.index("SECRET_JSON") < script.index("docker run --rm")
    assert script.index("docker run --rm") < script.index("set -x")


def test_user_data_omits_secret_fetch_when_no_arn_configured():
    script = _build()

    assert "secretsmanager" not in script
    assert "SECRET_JSON" not in script
    assert "SUPABASE_SERVICE_ROLE_KEY" not in script


def test_user_data_exports_optional_youtube_cookies_from_the_bundle():
    arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:worker-abc"
    script = _build(settings_over=dict(worker_secrets_arn=arn))

    # Optional key: `// empty` keeps the export empty (container treats as
    # unset) instead of the literal string "null" when the bundle lacks it.
    assert (
        "export YTDLP_COOKIES_B64=\"$(jq -r '.YTDLP_COOKIES_B64 // empty' <<<\"$SECRET_JSON\")\""
        in script
    )
    # Passed by variable reference, and only when the bundle exists at all.
    assert '-e YTDLP_COOKIES_B64="$YTDLP_COOKIES_B64"' in script
    assert "YTDLP_COOKIES_B64" not in _build()


def test_user_data_drains_cleanup_outbox_after_the_main_run():
    arn = "arn:aws:secretsmanager:us-west-2:123456789012:secret:worker-abc"
    script = _build(settings_over=dict(worker_secrets_arn=arn))

    # A second docker run overrides the entrypoint to run the cleanup module,
    # best-effort — `|| true` so a failed drain never blocks shutdown.
    assert "--entrypoint python" in script
    assert '"$IMAGE_URI" -m livestream_container.cleanup || true' in script
    # It runs after the main job but before tracing is re-enabled: it needs
    # SUPABASE_SERVICE_ROLE_KEY, which only exists inside the set +x block.
    main_run_end = script.index('  "$IMAGE_URI"\n')
    cleanup_run = script.index("livestream_container.cleanup")
    assert main_run_end < cleanup_run < script.index("set -x")
    # The cleanup container gets exactly the env the module needs; the key is
    # passed by variable reference, never a literal value.
    assert '  -e SUPABASE_URL="https://proj.supabase.co"' in script
    assert '  -e SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"' in script
    assert '  -e AWS_REGION="us-west-2"' in script
    assert "super-secret-value" not in script


def test_user_data_omits_cleanup_run_without_secret_bundle():
    # No secrets ARN means no service-role key to drain the outbox with.
    script = _build()

    assert "livestream_container.cleanup" not in script
    assert "--entrypoint" not in script
