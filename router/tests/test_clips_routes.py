import uuid

import pytest
from fastapi.testclient import TestClient

import app.routes.clips as clips
from app.auth import AuthUser, get_current_user
from app.main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_USER_ID = "22222222-2222-2222-2222-222222222222"


# ── Fake Supabase supporting the clips + projects tables the route touches ──


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows: dict[str, dict]):
        self._rows = rows
        self._op = None
        self._payload = None
        self._filters = []

    def select(self, *_columns):
        self._op = "select"
        return self

    def update(self, patch):
        self._op, self._payload = "update", dict(patch)
        return self

    def eq(self, column, value):
        self._filters.append(lambda r: str(r.get(column)) == str(value))
        return self

    def execute(self):
        matched = [r for r in self._rows.values() if all(f(r) for f in self._filters)]
        if self._op == "select":
            return _FakeResponse([dict(r) for r in matched])
        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return _FakeResponse([dict(r) for r in matched])
        raise AssertionError(f"unexpected op {self._op!r}")


class FakeSupabase:
    def __init__(self):
        self.clips: dict[str, dict] = {}
        self.projects: dict[str, dict] = {}

    def table(self, name):
        if name == "clips":
            return _FakeTable(self.clips)
        if name == "projects":
            return _FakeTable(self.projects)
        raise AssertionError(f"unexpected table {name!r}")


def _seed(fake: FakeSupabase, *, owner: str = USER_ID) -> dict:
    project_id = str(uuid.uuid4())
    fake.projects[project_id] = {"id": project_id, "user_id": owner}
    clip = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "title": "Original title",
        "edits": {},
    }
    fake.clips[clip["id"]] = clip
    return clip


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def fake_supabase(monkeypatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(clips, "get_supabase", lambda: fake)
    return fake


@pytest.fixture
def client(fake_supabase):
    app.dependency_overrides[get_current_user] = lambda: AuthUser(
        id=USER_ID, email="user@example.com"
    )
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


EDITS_BODY = {
    "title": "Edited title",
    "trimStart": 1.5,
    "trimEnd": 12.0,
    "captions": [
        {"id": "c1", "text": "hi", "startSeconds": 0, "endSeconds": 2, "x": 0.5, "y": 0.8}
    ],
    "updatedAt": "2026-07-17T00:00:00.000Z",
}


# ── PATCH /api/clips/{id} ────────────────────────────────────────────


def test_save_clip_edits_persists_and_keeps_camelcase(client, fake_supabase):
    clip = _seed(fake_supabase)

    resp = client.patch(f"/api/clips/{clip['id']}", json=EDITS_BODY)

    assert resp.status_code == 200
    stored = fake_supabase.clips[clip["id"]]["edits"]
    # Round-trips the frontend shape verbatim (camelCase keys preserved).
    assert stored["title"] == "Edited title"
    assert stored["trimStart"] == 1.5
    assert stored["trimEnd"] == 12.0
    assert stored["captions"][0]["startSeconds"] == 0
    assert stored["updatedAt"] == "2026-07-17T00:00:00.000Z"


def test_save_clip_edits_allows_partial_body(client, fake_supabase):
    clip = _seed(fake_supabase)

    resp = client.patch(f"/api/clips/{clip['id']}", json={"title": "Just a rename"})

    assert resp.status_code == 200
    stored = fake_supabase.clips[clip["id"]]["edits"]
    assert stored["title"] == "Just a rename"
    # Unset optionals are dropped, but captions stays well-formed ([]).
    assert stored["captions"] == []
    assert "trimStart" not in stored


def test_save_clip_edits_other_users_clip_is_404(client, fake_supabase):
    clip = _seed(fake_supabase, owner=OTHER_USER_ID)

    resp = client.patch(f"/api/clips/{clip['id']}", json=EDITS_BODY)

    assert resp.status_code == 404
    # Nothing written to someone else's clip.
    assert fake_supabase.clips[clip["id"]]["edits"] == {}


def test_save_clip_edits_unknown_clip_is_404(client):
    resp = client.patch(f"/api/clips/{uuid.uuid4()}", json=EDITS_BODY)
    assert resp.status_code == 404


def test_save_clip_edits_malformed_id_is_422(client):
    resp = client.patch("/api/clips/not-a-uuid", json=EDITS_BODY)
    assert resp.status_code == 422


def test_save_clip_edits_requires_auth(fake_supabase):
    app.dependency_overrides.clear()  # real get_current_user, no header -> 401
    with TestClient(app) as anon_client:
        resp = anon_client.patch(f"/api/clips/{uuid.uuid4()}", json=EDITS_BODY)
    assert resp.status_code == 401
