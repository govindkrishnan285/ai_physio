"""Authorization on the clinical endpoints.

The property under test: a patient can reach their own records and nobody
else's, and ownership cannot be forged through the request.
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.auth_models import PatientProfile, Role, TherapistProfile, User
from app.db import engine
from app.main import app

client = TestClient(app)

SESSION_BODY = {
    "exercise": "Knee Flexion",
    "duration_seconds": 120,
    "repetitions": 10,
    "accuracy": 88.0,
    "average_rom": 75.0,
}


def _email() -> str:
    return f"c-{uuid.uuid4().hex[:10]}@example.com"


def _make(role: str = "patient") -> tuple[str, dict]:
    """Register a user and return (email, auth headers)."""
    em = _email()
    r = client.post(
        "/auth/register",
        json={"email": em, "password": "Rehab123!", "full_name": "T", "role": role},
    )
    assert r.status_code == 201, r.text
    tok = client.post(
        "/auth/login", json={"email": em, "password": "Rehab123!"}
    ).json()
    return em, {"Authorization": "Bearer " + tok["access_token"]}


def _profile_id(email: str) -> uuid.UUID:
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == email)).one()
        return db.exec(
            select(PatientProfile).where(PatientProfile.user_id == user.id)
        ).one().id


def _assign(patient_email: str, therapist_email: str) -> None:
    with Session(engine) as db:
        pu = db.exec(select(User).where(User.email == patient_email)).one()
        tu = db.exec(select(User).where(User.email == therapist_email)).one()
        prof = db.exec(
            select(PatientProfile).where(PatientProfile.user_id == pu.id)
        ).one()
        tp = db.exec(
            select(TherapistProfile).where(TherapistProfile.user_id == tu.id)
        ).one()
        prof.therapist_id = tp.id
        db.add(prof)
        db.commit()


# --- Anonymous access is closed ---

@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/sessions"),
        ("post", "/sessions"),
        ("get", "/progress"),
        ("get", "/reports"),
        ("get", "/recommendations"),
        ("get", "/sessions/1"),
        ("delete", "/sessions/1"),
    ],
)
def test_clinical_endpoints_reject_anonymous(method, path):
    r = getattr(client, method)(path, **({"json": SESSION_BODY} if method == "post" else {}))
    assert r.status_code == 401, f"{method} {path} returned {r.status_code}"


# --- Ownership is taken from the token ---

def test_created_session_is_owned_by_the_caller():
    em, h = _make()
    r = client.post("/sessions", json=SESSION_BODY, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["patient_id"] == str(_profile_id(em))


def test_patient_id_in_body_is_ignored():
    """A forged owner in the payload must not take effect."""
    victim_em, _ = _make()
    victim_profile = str(_profile_id(victim_em))

    attacker_em, h = _make()
    body = dict(SESSION_BODY, patient_id=victim_profile)
    r = client.post("/sessions", json=body, headers=h)
    assert r.status_code == 201
    # Written against the attacker, not the named victim.
    assert r.json()["patient_id"] == str(_profile_id(attacker_em))


def test_patient_id_query_param_is_ignored_for_patients():
    victim_em, _ = _make()
    client.post("/sessions", json=SESSION_BODY, headers=_make()[1])

    attacker_em, h = _make()
    client.post("/sessions", json=SESSION_BODY, headers=h)

    r = client.get(
        "/sessions", params={"patient_id": str(_profile_id(victim_em))}, headers=h
    )
    assert r.status_code == 200
    owners = {item["patient_id"] for item in r.json()["items"]}
    assert owners <= {str(_profile_id(attacker_em))}


def test_patient_cannot_read_another_patients_session_by_id():
    _, victim_h = _make()
    created = client.post("/sessions", json=SESSION_BODY, headers=victim_h)
    sid = created.json()["id"]

    _, attacker_h = _make()
    # 404 not 403, so ids cannot be enumerated.
    assert client.get(f"/sessions/{sid}", headers=attacker_h).status_code == 404


def test_patient_cannot_delete_another_patients_session():
    _, victim_h = _make()
    sid = client.post("/sessions", json=SESSION_BODY, headers=victim_h).json()["id"]

    _, attacker_h = _make()
    assert client.delete(f"/sessions/{sid}", headers=attacker_h).status_code == 404
    # Still there for the owner.
    assert client.get(f"/sessions/{sid}", headers=victim_h).status_code == 200


def test_only_patients_can_record_sessions():
    _, therapist_h = _make(role="therapist")
    assert client.post("/sessions", json=SESSION_BODY, headers=therapist_h).status_code == 403


# --- Therapist scoping ---

def test_therapist_must_name_a_patient():
    _, h = _make(role="therapist")
    assert client.get("/sessions", headers=h).status_code == 400


def test_therapist_can_read_assigned_patient_only():
    p_em, p_h = _make()
    client.post("/sessions", json=SESSION_BODY, headers=p_h)
    other_em, _ = _make()

    t_em, t_h = _make(role="therapist")
    _assign(p_em, t_em)

    ok = client.get(
        "/sessions", params={"patient_id": str(_profile_id(p_em))}, headers=t_h
    )
    assert ok.status_code == 200
    assert ok.json()["total"] >= 1

    denied = client.get(
        "/sessions", params={"patient_id": str(_profile_id(other_em))}, headers=t_h
    )
    assert denied.status_code == 403


@pytest.mark.parametrize("path", ["/progress", "/reports", "/recommendations"])
def test_analytics_endpoints_are_scoped_for_therapists(path):
    p_em, _ = _make()
    other_em, _ = _make()
    t_em, t_h = _make(role="therapist")
    _assign(p_em, t_em)

    assert client.get(
        path, params={"patient_id": str(_profile_id(p_em))}, headers=t_h
    ).status_code == 200
    assert client.get(
        path, params={"patient_id": str(_profile_id(other_em))}, headers=t_h
    ).status_code == 403


def test_unknown_patient_id_is_404_for_therapist():
    _, t_h = _make(role="therapist")
    r = client.get("/sessions", params={"patient_id": str(uuid.uuid4())}, headers=t_h)
    assert r.status_code == 404


# --- Analytics isolation ---

def test_progress_only_counts_the_callers_sessions():
    _, a_h = _make()
    for _ in range(3):
        client.post("/sessions", json=SESSION_BODY, headers=a_h)

    _, b_h = _make()
    client.post("/sessions", json=SESSION_BODY, headers=b_h)

    assert client.get("/progress", headers=a_h).json()["session_count"] == 3
    assert client.get("/progress", headers=b_h).json()["session_count"] == 1


# --- Exercise library, analysis, and training gates ---

@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/exercises"),
        ("get", "/exercises/1"),
        ("post", "/analyze/rep"),
        ("get", "/exercises/1/profile"),
        ("get", "/exercises/1/reference-video"),
        ("post", "/exercises/1/train"),
        ("get", "/training-jobs/abc"),
    ],
)
def test_remaining_endpoints_reject_anonymous(method, path):
    r = getattr(client, method)(path, **({"json": {}} if method == "post" else {}))
    assert r.status_code == 401, f"{method} {path} returned {r.status_code}"


def test_patient_can_read_exercise_library_and_reference_media():
    """Patients need these during a live session; they hold no patient data."""
    _, h = _make()
    assert client.get("/exercises", headers=h).status_code == 200
    # 404 is fine (id may not exist); 401/403 would mean the gate is too tight.
    assert client.get("/exercises/1/reference-video", headers=h).status_code in (200, 404)
    assert client.get("/exercises/1/profile", headers=h).status_code in (200, 404)


def test_patient_cannot_trigger_training():
    _, h = _make()
    r = client.post(
        "/exercises/1/train", json={"youtube_urls": ["https://example.com/x"]}, headers=h
    )
    assert r.status_code == 403


def test_therapist_may_trigger_training():
    """Authorization passes; the request then fails on its own merits, not 403."""
    _, h = _make(role="therapist")
    r = client.post("/exercises/1/train", json={"youtube_urls": []}, headers=h)
    assert r.status_code != 403
