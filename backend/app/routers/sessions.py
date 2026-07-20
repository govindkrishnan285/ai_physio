from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, col, func, select

from ..auth_models import PatientProfile, Role, User
from ..db import get_session
from ..deps import CurrentUser, TargetPatient, assert_can_view_patient, get_current_patient_profile
from ..models import ExerciseFeedback, JointMeasurement, RehabSession
from ..schemas import (
    FeedbackOut,
    JointSampleOut,
    SessionCreate,
    SessionDetail,
    SessionListResponse,
    SessionSummary,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

# Rough kcal estimate when the client doesn't supply one (light rehab activity).
KCAL_PER_MINUTE = 4.0


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _summary(s: RehabSession) -> SessionSummary:
    return SessionSummary(
        id=s.id,
        patient_id=str(s.patient_profile_id) if s.patient_profile_id else None,
        exercise=s.exercise,
        date=s.date.isoformat(),
        start_time=s.start_time.isoformat(),
        duration_seconds=s.duration_seconds,
        repetitions=s.repetitions,
        accuracy=s.accuracy,
        average_rom=s.average_rom,
        maximum_rom=s.maximum_rom,
        calories=s.calories,
        pain_score=s.pain_score,
        quality_score=s.quality_score,
        status=s.status,
    )


@router.post("", response_model=SessionDetail, status_code=201)
def create_session(
    body: SessionCreate,
    user: CurrentUser,
    session: Session = Depends(get_session),
) -> SessionDetail:
    # Only patients record sessions, and always against their own profile.
    # Ownership comes from the token, never the body.
    if user.role != Role.patient:
        raise HTTPException(
            status_code=403,
            detail="Only patient accounts can record rehabilitation sessions.",
        )
    profile = get_current_patient_profile(user, session)

    start = _parse_dt(body.start_time) or datetime.now(timezone.utc)
    end = _parse_dt(body.end_time)

    calories = body.calories
    if calories is None:
        calories = round((body.duration_seconds / 60.0) * KCAL_PER_MINUTE, 1)

    rehab = RehabSession(
        patient_profile_id=profile.id,
        exercise=body.exercise,
        exercise_id=body.exercise_id,
        date=start.date(),
        start_time=start,
        end_time=end,
        duration_seconds=body.duration_seconds,
        repetitions=body.repetitions,
        accuracy=body.accuracy,
        average_rom=body.average_rom,
        maximum_rom=body.maximum_rom,
        minimum_rom=body.minimum_rom,
        calories=calories,
        pain_score=body.pain_score,
        status=body.status,
        average_knee_angle=body.average_knee_angle,
        average_hip_angle=body.average_hip_angle,
        average_shoulder_angle=body.average_shoulder_angle,
        average_elbow_angle=body.average_elbow_angle,
        average_ankle_angle=body.average_ankle_angle,
        quality_score=body.quality_score,
        posture_mistakes=body.posture_mistakes,
        fps=body.fps,
        model_confidence=body.model_confidence,
    )
    session.add(rehab)
    session.commit()
    session.refresh(rehab)

    for j in body.joints:
        session.add(
            JointMeasurement(
                session_id=rehab.id,
                timestamp=j.timestamp,
                knee_angle=j.knee_angle,
                hip_angle=j.hip_angle,
                shoulder_angle=j.shoulder_angle,
                elbow_angle=j.elbow_angle,
                ankle_angle=j.ankle_angle,
            )
        )
    for f in body.feedback:
        session.add(
            ExerciseFeedback(
                session_id=rehab.id,
                timestamp=f.timestamp,
                feedback=f.feedback,
                severity=f.severity,
            )
        )
    session.commit()

    return _detail(rehab, session)


@router.get("", response_model=SessionListResponse)
def list_sessions(
    patient: TargetPatient,
    exercise: str | None = None,
    search: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> SessionListResponse:
    filters = [RehabSession.patient_profile_id == patient.id]
    if exercise:
        filters.append(RehabSession.exercise == exercise)
    if search and search.strip():
        # Case-insensitive partial match for the global search box.
        filters.append(col(RehabSession.exercise).ilike(f"%{search.strip()}%"))

    total = session.exec(
        select(func.count()).select_from(RehabSession).where(*filters)
    ).one()

    rows = session.exec(
        select(RehabSession)
        .where(*filters)
        .order_by(RehabSession.start_time.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    return SessionListResponse(
        items=[_summary(s) for s in rows],
        total=int(total),
        limit=limit,
        offset=offset,
    )


def _load_authorized_session(
    session_id: int, user: User, db: Session
) -> RehabSession:
    """Fetch a session the caller is allowed to see, or raise.

    Returns 404 rather than 403 for sessions belonging to someone else: a 403
    would confirm that the id exists, letting a caller enumerate the table.
    """
    s = db.get(RehabSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.patient_profile_id is None:
        # Legacy pre-auth row with no owner. Admins only.
        if user.role != Role.admin:
            raise HTTPException(status_code=404, detail="Session not found")
        return s

    owner = db.get(PatientProfile, s.patient_profile_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        assert_can_view_patient(user, owner, db)
    except HTTPException:
        raise HTTPException(status_code=404, detail="Session not found")
    return s


@router.get("/{session_id}", response_model=SessionDetail)
def get_session_detail(
    session_id: int,
    user: CurrentUser,
    session: Session = Depends(get_session),
) -> SessionDetail:
    return _detail(_load_authorized_session(session_id, user, session), session)


@router.delete("/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    user: CurrentUser,
    session: Session = Depends(get_session),
) -> None:
    s = _load_authorized_session(session_id, user, session)
    # Children cascade via the relationship config.
    session.delete(s)
    session.commit()


def _detail(s: RehabSession, session: Session) -> SessionDetail:
    joints = session.exec(
        select(JointMeasurement)
        .where(JointMeasurement.session_id == s.id)
        .order_by(JointMeasurement.timestamp)
    ).all()
    feedback = session.exec(
        select(ExerciseFeedback)
        .where(ExerciseFeedback.session_id == s.id)
        .order_by(ExerciseFeedback.timestamp)
    ).all()

    base = _summary(s).model_dump()
    return SessionDetail(
        **base,
        exercise_id=s.exercise_id,
        end_time=s.end_time.isoformat() if s.end_time else None,
        minimum_rom=s.minimum_rom,
        average_knee_angle=s.average_knee_angle,
        average_hip_angle=s.average_hip_angle,
        average_shoulder_angle=s.average_shoulder_angle,
        average_elbow_angle=s.average_elbow_angle,
        average_ankle_angle=s.average_ankle_angle,
        model_confidence=s.model_confidence,
        fps=s.fps,
        posture_mistakes=s.posture_mistakes or [],
        joints=[
            JointSampleOut(
                timestamp=j.timestamp,
                knee_angle=j.knee_angle,
                hip_angle=j.hip_angle,
                shoulder_angle=j.shoulder_angle,
                elbow_angle=j.elbow_angle,
                ankle_angle=j.ankle_angle,
            )
            for j in joints
        ],
        feedback=[
            FeedbackOut(timestamp=f.timestamp, feedback=f.feedback, severity=f.severity)
            for f in feedback
        ],
    )
