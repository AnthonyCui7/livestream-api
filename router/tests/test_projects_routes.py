import uuid

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

import app.routes.projects as projects
from app.auth import AuthUser, get_current_user
from app.main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_USER_ID = "22222222-2222-2222-2222-222222222222"


# ── Fake Supabase (just the postgrest chains the routes use) ────────


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows: dict[str, dict]):
        self._rows = rows
        self._op = None
        self._payload = None
        self._filters = []

    def insert(self, row):
        self._op, self._payload = "insert", dict(row)
        return self

    def select(self, *_columns):
        self._op = "select"
        return self

    def update(self, patch):
        self._op, self._payload = "update", dict(patch)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, column, value):
        self._filters.append(lambda r: str(r.get(column)) == str(value))
        return self

    def in_(self, column, values):
        self._filters.append(lambda r: r.get(column) in values)
        return self

    def execute(self):
        if self._op == "insert":
            row = {
                "id": str(uuid.uuid4()),
                "error": None,
                "metadata": None,
                "instance_id": None,
                **self._payload,
            }
            self._rows[row["id"]] = row
            return _FakeResponse([dict(row)])

        matched = [r for r in self._rows.values() if all(f(r) for f in self._filters)]
        if self._op == "select":
            return _FakeResponse([dict(r) for r in matched])
        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return _FakeResponse([dict(r) for r in matched])
        if self._op == "delete":
            for r in matched:
                del self._rows[r["id"]]
            return _FakeResponse([dict(r) for r in matched])
        raise AssertionError(f"unexpected op {self._op!r}")


class FakeSupabase:
    def __init__(self):
        self.rows: dict[str, dict] = {}

    def table(self, name):
        assert name == "projects"
        return _FakeTable(self.rows)


def _seed(fake: FakeSupabase, **over) -> dict:
    row = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "name": "Twitch: chan",
        "source_type": "livestream",
        "source_url": "https://twitch.tv/chan",
        "status": "ingesting",
        "error": None,
        "metadata": None,
        "virality_threshold": 0,
        "instance_id": None,
    }
    row.update(over)
    fake.rows[row["id"]] = row
    return row


def _not_found_error(operation: str = "TerminateInstances") -> ClientError:
    return ClientError(
        {"Error": {"Code": "InvalidInstanceID.NotFound", "Message": "gone"}},
        operation,
    )


def _throttle_error() -> ClientError:
    return ClientError(
        {"Error": {"Code": "RequestLimitExceeded", "Message": "slow down"}},
        "DescribeInstances",
    )


# ── Fixtures ─────────────────────────────────────────────────────────


@pytest.fixture
def fake_supabase(monkeypatch) -> FakeSupabase:
    fake = FakeSupabase()
    monkeypatch.setattr(projects, "get_supabase", lambda: fake)
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
def launch_calls(monkeypatch) -> list[dict]:
    calls: list[dict] = []

    def fake_launch(**kwargs):
        calls.append(kwargs)
        return "i-0123456789abcdef0"

    monkeypatch.setattr(projects.provisioner, "launch_worker", fake_launch)
    return calls


@pytest.fixture
def terminate_calls(monkeypatch) -> list[str]:
    calls: list[str] = []
    monkeypatch.setattr(projects.provisioner, "terminate_worker", calls.append)
    return calls


@pytest.fixture
def worker_state(monkeypatch) -> dict:
    """Control what provisioner.get_worker_state reports to the liveness check.

    Set holder["value"] to an EC2 state name, None (instance gone), or an
    exception to raise. holder["calls"] records the instance ids looked up.
    """
    holder: dict = {"value": "running", "calls": []}

    def fake_state(instance_id):
        holder["calls"].append(instance_id)
        if isinstance(holder["value"], Exception):
            raise holder["value"]
        return holder["value"]

    monkeypatch.setattr(projects.provisioner, "get_worker_state", fake_state)
    return holder


# ── POST /api/projects ───────────────────────────────────────────────


def test_create_project_happy_path(client, fake_supabase, launch_calls):
    resp = client.post(
        "/api/projects",
        json={
            "source_url": "https://www.twitch.tv/somechannel",
            "source_type": "livestream",
            "virality_threshold": 0.42,
        },
    )

    assert resp.status_code == 201
    row = resp.json()
    assert row["user_id"] == USER_ID
    assert row["name"] == "Twitch: somechannel"
    assert row["source_type"] == "livestream"
    assert row["source_url"] == "https://www.twitch.tv/somechannel"
    assert row["status"] == "created"
    assert row["virality_threshold"] == 0.42
    assert row["instance_id"] == "i-0123456789abcdef0"

    # The worker was launched with exactly the row's parameters.
    assert launch_calls == [
        {
            "project_id": row["id"],
            "source_url": "https://www.twitch.tv/somechannel",
            "source_type": "livestream",
            "virality_threshold": 0.42,
        }
    ]

    # And the DB row was patched with the instance id.
    assert fake_supabase.rows[row["id"]]["instance_id"] == "i-0123456789abcdef0"


def test_create_project_keeps_explicit_name_and_defaults_threshold(client, launch_calls):
    resp = client.post(
        "/api/projects",
        json={
            "name": "My VOD",
            "source_url": "https://youtu.be/dQw4w9WgXcQ",
            "source_type": "video",
        },
    )

    assert resp.status_code == 201
    row = resp.json()
    assert row["name"] == "My VOD"
    assert row["virality_threshold"] == 0
    assert launch_calls[0]["virality_threshold"] == 0


def test_create_project_launch_failure_marks_row_failed_and_502(
    client, fake_supabase, monkeypatch
):
    def boom(**_kwargs):
        raise RuntimeError("no capacity in subnet-0a1b2c3d")

    monkeypatch.setattr(projects.provisioner, "launch_worker", boom)

    resp = client.post(
        "/api/projects",
        json={"source_url": "https://twitch.tv/chan", "source_type": "livestream"},
    )

    assert resp.status_code == 502
    (row,) = fake_supabase.rows.values()
    assert row["status"] == "failed"
    # AWS internals stay in the server log — client and DB get generic text.
    assert row["error"] == "Worker launch failed."
    assert resp.json()["detail"] == "Failed to launch the clip worker. Please try again."
    assert "no capacity" not in row["error"]
    assert "no capacity" not in resp.text


@pytest.mark.parametrize(
    "url",
    [
        "http://twitch.tv/chan",  # not https
        "https://evil.com/chan",  # host not allowlisted
        'https://twitch.tv/a"; rm -rf /',  # shell injection attempt
        "https://twitch.tv/$(reboot)",
    ],
)
def test_create_project_rejects_bad_urls(client, fake_supabase, launch_calls, url):
    resp = client.post(
        "/api/projects", json={"source_url": url, "source_type": "livestream"}
    )

    assert resp.status_code == 422
    assert fake_supabase.rows == {}  # nothing inserted
    assert launch_calls == []  # nothing launched


def test_create_project_rejects_out_of_range_threshold(client):
    resp = client.post(
        "/api/projects",
        json={
            "source_url": "https://twitch.tv/chan",
            "source_type": "livestream",
            "virality_threshold": 1.5,
        },
    )
    assert resp.status_code == 422


def test_create_project_requires_auth(fake_supabase):
    app.dependency_overrides.clear()  # real get_current_user, no header -> 401
    with TestClient(app) as anon_client:
        resp = anon_client.post(
            "/api/projects",
            json={"source_url": "https://twitch.tv/chan", "source_type": "livestream"},
        )
    assert resp.status_code == 401


# ── POST /api/projects/{id}/cancel ───────────────────────────────────


@pytest.mark.parametrize("status", ["created", "ingesting"])
@pytest.mark.parametrize("state", ["pending", "running"])
def test_cancel_graceful_sets_stopping_when_worker_is_alive(
    client, fake_supabase, worker_state, status, state
):
    row = _seed(fake_supabase, status=status, instance_id="i-live")
    worker_state["value"] = state

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "stopping"
    assert fake_supabase.rows[row["id"]]["status"] == "stopping"
    assert worker_state["calls"] == ["i-live"]


def test_cancel_graceful_is_idempotent_while_stopping_with_live_worker(
    client, fake_supabase, worker_state
):
    row = _seed(fake_supabase, status="stopping", instance_id="i-live")

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "stopping"
    assert fake_supabase.rows[row["id"]]["status"] == "stopping"


@pytest.mark.parametrize("status", ["created", "ingesting", "stopping"])
def test_cancel_without_instance_sets_cancelled_directly(
    client, fake_supabase, monkeypatch, status
):
    # No instance was ever recorded — there is no worker to poll for 'stopping',
    # and no reason to ask EC2 anything.
    def no_lookup(_instance_id):
        raise AssertionError("get_worker_state must not be called without an instance")

    monkeypatch.setattr(projects.provisioner, "get_worker_state", no_lookup)
    row = _seed(fake_supabase, status=status, instance_id=None)

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert fake_supabase.rows[row["id"]]["status"] == "cancelled"


@pytest.mark.parametrize("state", ["shutting-down", "terminated", "stopped", None])
def test_cancel_dead_instance_sets_cancelled_directly(
    client, fake_supabase, worker_state, state
):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-dead")
    worker_state["value"] = state

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert fake_supabase.rows[row["id"]]["status"] == "cancelled"


def test_cancel_not_found_instance_sets_cancelled_directly(
    client, fake_supabase, worker_state
):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-vanished")
    worker_state["value"] = _not_found_error("DescribeInstances")

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert fake_supabase.rows[row["id"]]["status"] == "cancelled"


def test_cancel_already_stopping_with_dead_worker_sets_cancelled(
    client, fake_supabase, worker_state
):
    # Re-clicking Stop after the worker died must not leave the row stuck.
    row = _seed(fake_supabase, status="stopping", instance_id="i-dead")
    worker_state["value"] = "terminated"

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert fake_supabase.rows[row["id"]]["status"] == "cancelled"


def test_cancel_transient_describe_error_falls_back_to_stopping(
    client, fake_supabase, worker_state
):
    # EC2 flaking must never 500 a cancel — assume alive, write 'stopping'.
    row = _seed(fake_supabase, status="ingesting", instance_id="i-unknown")
    worker_state["value"] = _throttle_error()

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "stopping"
    assert fake_supabase.rows[row["id"]]["status"] == "stopping"


def test_cancel_transient_describe_error_while_stopping_keeps_row(
    client, fake_supabase, worker_state
):
    row = _seed(fake_supabase, status="stopping", instance_id="i-unknown")
    worker_state["value"] = _throttle_error()

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 200
    assert resp.json()["status"] == "stopping"
    assert fake_supabase.rows[row["id"]]["status"] == "stopping"


@pytest.mark.parametrize("status", ["ready", "failed", "cancelled"])
def test_cancel_terminal_status_is_a_noop(client, fake_supabase, terminate_calls, status):
    row = _seed(fake_supabase, status=status, instance_id="i-done")

    resp = client.post(f"/api/projects/{row['id']}/cancel?force=true")

    assert resp.status_code == 200
    assert resp.json()["status"] == status
    assert fake_supabase.rows[row["id"]]["status"] == status
    assert terminate_calls == []


def test_cancel_force_terminates_and_sets_cancelled(client, fake_supabase, terminate_calls):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-live")

    resp = client.post(f"/api/projects/{row['id']}/cancel?force=true")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    assert fake_supabase.rows[row["id"]]["status"] == "cancelled"
    assert terminate_calls == ["i-live"]


def test_cancel_force_does_not_overwrite_a_worker_that_won_the_race(
    client, fake_supabase, monkeypatch
):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-live")

    def terminate_after_worker_finished(_instance_id):
        # The worker flips the row to 'ready' while the router is terminating.
        fake_supabase.rows[row["id"]]["status"] = "ready"

    monkeypatch.setattr(
        projects.provisioner, "terminate_worker", terminate_after_worker_finished
    )

    resp = client.post(f"/api/projects/{row['id']}/cancel?force=true")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"
    assert fake_supabase.rows[row["id"]]["status"] == "ready"


def test_cancel_force_swallows_already_gone_instance(client, fake_supabase, monkeypatch):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-gone")

    def raise_not_found(_instance_id):
        raise _not_found_error()

    monkeypatch.setattr(projects.provisioner, "terminate_worker", raise_not_found)

    resp = client.post(f"/api/projects/{row['id']}/cancel?force=true")

    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"


def test_cancel_other_users_project_is_404(client, fake_supabase):
    row = _seed(fake_supabase, user_id=OTHER_USER_ID)

    resp = client.post(f"/api/projects/{row['id']}/cancel")

    assert resp.status_code == 404
    assert fake_supabase.rows[row["id"]]["status"] == "ingesting"


def test_cancel_unknown_project_is_404(client):
    resp = client.post(f"/api/projects/{uuid.uuid4()}/cancel")
    assert resp.status_code == 404


def test_cancel_malformed_id_is_422(client):
    resp = client.post("/api/projects/not-a-uuid/cancel")
    assert resp.status_code == 422


# ── DELETE /api/projects/{id} ────────────────────────────────────────


def test_delete_terminates_worker_and_removes_row(client, fake_supabase, terminate_calls):
    row = _seed(fake_supabase, status="ingesting", instance_id="i-live")

    resp = client.delete(f"/api/projects/{row['id']}")

    assert resp.status_code == 204
    assert terminate_calls == ["i-live"]
    assert row["id"] not in fake_supabase.rows


def test_delete_without_instance_skips_terminate(client, fake_supabase, terminate_calls):
    row = _seed(fake_supabase, status="failed", instance_id=None)

    resp = client.delete(f"/api/projects/{row['id']}")

    assert resp.status_code == 204
    assert terminate_calls == []
    assert row["id"] not in fake_supabase.rows


def test_delete_swallows_already_gone_instance(client, fake_supabase, monkeypatch):
    row = _seed(fake_supabase, status="cancelled", instance_id="i-gone")

    def raise_not_found(_instance_id):
        raise _not_found_error()

    monkeypatch.setattr(projects.provisioner, "terminate_worker", raise_not_found)

    resp = client.delete(f"/api/projects/{row['id']}")

    assert resp.status_code == 204
    assert row["id"] not in fake_supabase.rows


def test_delete_swallows_unauthorized_terminate_of_vanished_instance(
    client, fake_supabase, monkeypatch
):
    # The terminate policy matches on the clip-worker resource tag; once the
    # instance id has aged out of EC2 there are no tags to match, so EC2
    # reports UnauthorizedOperation instead of NotFound. Seen in production
    # deleting projects whose workers self-terminated long before.
    row = _seed(fake_supabase, status="cancelled", instance_id="i-long-gone")

    def raise_unauthorized(_instance_id):
        raise ClientError(
            {"Error": {"Code": "UnauthorizedOperation", "Message": "not authorized"}},
            "TerminateInstances",
        )

    monkeypatch.setattr(projects.provisioner, "terminate_worker", raise_unauthorized)

    resp = client.delete(f"/api/projects/{row['id']}")

    assert resp.status_code == 204
    assert row["id"] not in fake_supabase.rows


def test_delete_still_raises_on_other_client_errors(client, fake_supabase, monkeypatch):
    row = _seed(fake_supabase, status="cancelled", instance_id="i-live")

    def raise_throttled(_instance_id):
        raise ClientError(
            {"Error": {"Code": "RequestLimitExceeded", "Message": "slow down"}},
            "TerminateInstances",
        )

    monkeypatch.setattr(projects.provisioner, "terminate_worker", raise_throttled)

    with pytest.raises(ClientError):
        client.delete(f"/api/projects/{row['id']}")

    assert row["id"] in fake_supabase.rows  # the row survives a failed terminate


def test_delete_other_users_project_is_404(client, fake_supabase, terminate_calls):
    row = _seed(fake_supabase, user_id=OTHER_USER_ID, instance_id="i-live")

    resp = client.delete(f"/api/projects/{row['id']}")

    assert resp.status_code == 404
    assert terminate_calls == []
    assert row["id"] in fake_supabase.rows
