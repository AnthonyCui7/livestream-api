import pytest
from fastapi import HTTPException

import app.auth as auth


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, response: _FakeResponse):
        self._response = response
        self.calls: list[tuple[str, dict]] = []

    def get(self, url, headers=None):
        self.calls.append((url, headers or {}))
        return self._response


def test_missing_or_malformed_header_is_401():
    for header in ("", "Bearer ", "Token abc", "bearer"):
        with pytest.raises(HTTPException) as exc:
            auth.get_current_user(authorization=header)
        assert exc.value.status_code == 401


def test_invalid_token_is_401(monkeypatch):
    monkeypatch.setattr(auth, "_http_client", lambda: _FakeClient(_FakeResponse(401)))

    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(authorization="Bearer bad-token")
    assert exc.value.status_code == 401


def test_valid_token_returns_user(monkeypatch):
    fake = _FakeClient(_FakeResponse(200, {"id": "user-123", "email": "u@example.com"}))
    monkeypatch.setattr(auth, "_http_client", lambda: fake)

    user = auth.get_current_user(authorization="Bearer good-token")

    assert user == auth.AuthUser(id="user-123", email="u@example.com")
    # Supabase is asked with the anon key + the caller's token.
    url, headers = fake.calls[0]
    assert url.endswith("/auth/v1/user")
    assert headers["Authorization"] == "Bearer good-token"
    assert "apikey" in headers
