"""Auth flow: registration, login, tokens, verification, reset, and RBAC."""

import uuid

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth_models import Role
from app.deps import require_admin, require_roles
from app.main import app
from app.routers import auth as auth_router

client = TestClient(app)


def _email() -> str:
    return f"t-{uuid.uuid4().hex[:10]}@example.com"


def _register(email: str, password: str = "Rehab123!", role: str = "patient"):
    return client.post(
        "/auth/register",
        json={"email": email, "password": password, "full_name": "T", "role": role},
    )


def _login(email: str, password: str = "Rehab123!") -> dict:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


# --- Registration ---

def test_register_creates_unverified_patient_with_profile():
    em = _email()
    r = _register(em)
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "patient"
    assert body["is_verified"] is False

    me = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer " + _login(em)["access_token"]},
    ).json()
    assert me["patient_profile"] is not None
    assert me["therapist_profile"] is None


def test_register_therapist_gets_therapist_profile():
    em = _email()
    assert _register(em, role="therapist").status_code == 201
    me = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer " + _login(em)["access_token"]},
    ).json()
    assert me["therapist_profile"] is not None
    assert me["patient_profile"] is None


def test_duplicate_email_rejected():
    em = _email()
    assert _register(em).status_code == 201
    assert _register(em).status_code == 409


def test_admin_cannot_self_register():
    assert _register(_email(), role="admin").status_code == 422


@pytest.mark.parametrize("pw", ["short1!", "alllettersonly", "12345678901"])
def test_weak_passwords_rejected(pw):
    assert _register(_email(), password=pw).status_code == 422


def test_email_is_normalised_to_lowercase():
    em = _email()
    assert _register(em.upper()).status_code == 201
    # Registering the lowercase form must collide, not create a second account.
    assert _register(em.lower()).status_code == 409


# --- Login / tokens ---

def test_login_wrong_password_is_401():
    em = _email()
    _register(em)
    r = client.post("/auth/login", json={"email": em, "password": "Nope123!"})
    assert r.status_code == 401


def test_unknown_email_and_wrong_password_are_indistinguishable():
    em = _email()
    _register(em)
    wrong_pw = client.post("/auth/login", json={"email": em, "password": "Nope123!"})
    unknown = client.post(
        "/auth/login", json={"email": _email(), "password": "Nope123!"}
    )
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


def test_me_requires_token():
    assert client.get("/auth/me").status_code == 401


def test_refresh_token_rejected_as_access_token():
    em = _email()
    _register(em)
    tok = _login(em)
    r = client.get(
        "/auth/me", headers={"Authorization": "Bearer " + tok["refresh_token"]}
    )
    assert r.status_code == 401


def test_refresh_issues_new_pair():
    em = _email()
    _register(em)
    tok = _login(em)
    r = client.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_garbage_token_rejected():
    r = client.get("/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


# --- Email verification ---

def test_verify_email_marks_user_verified_and_token_is_single_use(monkeypatch):
    # Only the hash is persisted, so the raw token has to be captured from the
    # delivery seam the same way a real mailbox would receive it.
    sent: list[str] = []
    monkeypatch.setattr(
        auth_router.mailer, "send_verification", lambda to, raw: sent.append(raw)
    )

    em = _email()
    _register(em)
    assert len(sent) == 1

    r = client.post("/auth/verify-email", json={"token": sent[0]})
    assert r.status_code == 200
    assert r.json()["is_verified"] is True

    # Replaying the same link must fail.
    assert client.post("/auth/verify-email", json={"token": sent[0]}).status_code == 400


def test_password_reset_end_to_end(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        auth_router.mailer, "send_password_reset", lambda to, raw: sent.append(raw)
    )

    em = _email()
    _register(em)
    assert client.post("/auth/forgot-password", json={"email": em}).status_code == 202
    assert len(sent) == 1

    new_pw = "Brandnew456!"
    r = client.post("/auth/reset-password", json={"token": sent[0], "password": new_pw})
    assert r.status_code == 200

    # Old password no longer works; new one does.
    assert client.post(
        "/auth/login", json={"email": em, "password": "Rehab123!"}
    ).status_code == 401
    assert client.post(
        "/auth/login", json={"email": em, "password": new_pw}
    ).status_code == 200

    # Reset links are single-use.
    assert client.post(
        "/auth/reset-password", json={"token": sent[0], "password": "Another789!"}
    ).status_code == 400


def test_requesting_a_second_reset_invalidates_the_first(monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        auth_router.mailer, "send_password_reset", lambda to, raw: sent.append(raw)
    )

    em = _email()
    _register(em)
    client.post("/auth/forgot-password", json={"email": em})
    client.post("/auth/forgot-password", json={"email": em})
    assert len(sent) == 2

    # The superseded link must be dead.
    assert client.post(
        "/auth/reset-password", json={"token": sent[0], "password": "Another789!"}
    ).status_code == 400
    assert client.post(
        "/auth/reset-password", json={"token": sent[1], "password": "Another789!"}
    ).status_code == 200


def test_reset_with_bogus_token_rejected():
    r = client.post(
        "/auth/reset-password", json={"token": "bogus", "password": "Rehab123!"}
    )
    assert r.status_code == 400


def test_forgot_password_does_not_leak_registration_status():
    em = _email()
    _register(em)
    known = client.post("/auth/forgot-password", json={"email": em})
    unknown = client.post("/auth/forgot-password", json={"email": _email()})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()


# --- RBAC ---

_rbac = FastAPI()


@_rbac.get("/admin-only", dependencies=[Depends(require_admin)])
def _admin_only():
    return {"ok": True}


@_rbac.get(
    "/therapist-only",
    dependencies=[Depends(require_roles(Role.therapist, Role.admin))],
)
def _therapist_only():
    return {"ok": True}


def test_patient_blocked_from_admin_and_therapist_routes():
    em = _email()
    _register(em)
    tok = _login(em)
    rbac = TestClient(_rbac)
    h = {"Authorization": "Bearer " + tok["access_token"]}
    assert rbac.get("/admin-only", headers=h).status_code == 403
    assert rbac.get("/therapist-only", headers=h).status_code == 403


def test_therapist_allowed_on_therapist_route_but_not_admin():
    em = _email()
    _register(em, role="therapist")
    tok = _login(em)
    rbac = TestClient(_rbac)
    h = {"Authorization": "Bearer " + tok["access_token"]}
    assert rbac.get("/therapist-only", headers=h).status_code == 200
    assert rbac.get("/admin-only", headers=h).status_code == 403


def test_rbac_routes_reject_anonymous():
    rbac = TestClient(_rbac)
    assert rbac.get("/admin-only").status_code == 401
