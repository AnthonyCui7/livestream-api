"""Social routes: account listing/linking and clip posting via Zernio.

Zernio itself is faked at the app.zernio function boundary — these tests cover
the route-level contract: auth, ownership, linked-account gating, and the
503-when-unconfigured behavior.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

import app.routes.clips as clips
import app.routes.social as social
from app import zernio
from app.auth import AuthUser, get_current_user
from app.main import app

from tests.test_clips_routes import FakeSupabase, _seed

USER_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def fake_supabase(monkeypatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(clips, "get_supabase", lambda: fake)
    monkeypatch.setattr(social, "get_supabase", lambda: fake)
    return fake


@pytest.fixture
def client(fake_supabase):
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=USER_ID, email="user@example.com"
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def fake_zernio(monkeypatch):
    """Happy-path Zernio: a profile, one linked tiktok account, posts succeed."""
    calls = {"posts": []}
    monkeypatch.setattr(
        zernio, "get_or_create_profile", lambda *_a, **_k: "prof-1"
    )
    monkeypatch.setattr(
        zernio,
        "list_accounts",
        lambda _pid: [{"id": "acc-1", "platform": "tiktok", "name": "@demo"}],
    )
    monkeypatch.setattr(
        zernio,
        "connect_url",
        lambda _pid, platform, _redirect: f"https://zernio.test/c/{platform}",
    )

    def _create_post(**kwargs):
        calls["posts"].append(kwargs)
        return {"post_id": "post-1", "status": "publishing"}

    monkeypatch.setattr(zernio, "create_post", _create_post)
    return calls


def test_list_accounts(client, fake_zernio):
    resp = client.get("/api/social/accounts")
    assert resp.status_code == 200
    assert resp.json() == {
        "accounts": [{"id": "acc-1", "platform": "tiktok", "name": "@demo"}]
    }


def test_link_returns_auth_url(client, fake_zernio):
    resp = client.post("/api/social/accounts/link", json={"platform": "youtube"})
    assert resp.status_code == 200
    assert resp.json() == {"auth_url": "https://zernio.test/c/youtube"}


@pytest.fixture
def origins(monkeypatch):
    """Pin the configured origins so redirect assertions don't depend on .env."""
    from types import SimpleNamespace

    monkeypatch.setattr(
        social,
        "get_settings",
        lambda: SimpleNamespace(
            frontend_origin_list=["https://app.example", "http://localhost:5173"],
            frontend_origin_regex=r"https://.*\.preview\.example",
        ),
    )


def test_link_redirect_uses_caller_origin(client, fake_zernio, origins, monkeypatch):
    captured = {}

    def _connect(_pid, _platform, redirect_url):
        captured["redirect"] = redirect_url
        return "https://tiktok.example/oauth"

    monkeypatch.setattr(zernio, "connect_url", _connect)

    resp = client.post(
        "/api/social/accounts/link",
        json={"platform": "tiktok"},
        headers={"origin": "http://localhost:5173"},
    )
    assert resp.status_code == 200
    assert captured["redirect"] == "http://localhost:5173/social/connected"

    # Regex-matched origins (deploy previews) are honored too.
    client.post(
        "/api/social/accounts/link",
        json={"platform": "tiktok"},
        headers={"origin": "https://pr-42.preview.example"},
    )
    assert captured["redirect"] == "https://pr-42.preview.example/social/connected"


def test_link_redirect_rejects_unknown_origin(client, fake_zernio, origins, monkeypatch):
    captured = {}

    def _connect(_pid, _platform, redirect_url):
        captured["redirect"] = redirect_url
        return "https://tiktok.example/oauth"

    monkeypatch.setattr(zernio, "connect_url", _connect)

    resp = client.post(
        "/api/social/accounts/link",
        json={"platform": "tiktok"},
        headers={"origin": "https://evil.example"},
    )
    assert resp.status_code == 200
    # Unrecognized origin -> first configured (production), never reflected.
    assert captured["redirect"] == "https://app.example/social/connected"


def test_unconfigured_is_503(client, monkeypatch):
    def _raise(*_a, **_k):
        raise zernio.ZernioNotConfigured()

    monkeypatch.setattr(zernio, "get_or_create_profile", _raise)
    resp = client.get("/api/social/accounts")
    assert resp.status_code == 503


def test_post_clip_happy_path(client, fake_supabase, fake_zernio):
    clip = _seed(fake_supabase)
    clip["status"] = "rendered"
    clip["video_url"] = "https://cdn.example/clip.mp4"

    resp = client.post(
        f"/api/clips/{clip['id']}/post",
        json={"platform": "tiktok", "caption": "big moment"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"post_id": "post-1", "status": "publishing"}
    assert fake_zernio["posts"] == [
        {
            "caption": "big moment",
            "platform": "tiktok",
            "account_id": "acc-1",
            "media_url": "https://cdn.example/clip.mp4",
        }
    ]


def test_post_clip_unlinked_platform_is_409(client, fake_supabase, fake_zernio):
    clip = _seed(fake_supabase)
    clip["status"] = "rendered"
    clip["video_url"] = "https://cdn.example/clip.mp4"

    resp = client.post(
        f"/api/clips/{clip['id']}/post", json={"platform": "instagram"}
    )
    assert resp.status_code == 409
    assert "instagram" in resp.json()["detail"]


def test_post_unrendered_clip_is_409(client, fake_supabase, fake_zernio):
    clip = _seed(fake_supabase)  # no status/video_url
    resp = client.post(f"/api/clips/{clip['id']}/post", json={"platform": "tiktok"})
    assert resp.status_code == 409


def test_post_other_users_clip_is_404(client, fake_supabase, fake_zernio):
    clip = _seed(fake_supabase, owner=str(uuid.uuid4()))
    clip["status"] = "rendered"
    clip["video_url"] = "https://cdn.example/clip.mp4"
    resp = client.post(f"/api/clips/{clip['id']}/post", json={"platform": "tiktok"})
    assert resp.status_code == 404
