from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, func, select

from ..db import get_session
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
        patient_id=s.patient_id,
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
    body: SessionCreate, session: Session = Depends(get_session)
) -> SessionDetail:
    start = _parse_dt(body.start_time) or datetime.now(timezone.utc)
    end = _parse_dt(body.end_time)

    calories = body.calories
    if calories is None:
        calories = round((body.duration_seconds / 60.0) * KCAL_PER_MINUTE, 1)

    rehab = RehabSession(
        patient_id=body.patient_id,
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
    patient_id: str = "default",
    exercise: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> SessionListResponse:
    filters = [RehabSession.patient_id == patient_id]
    if exercise:
        filters.append(RehabSession.exercise == exercise)

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


@router.get("/{session_id}", response_model=SessionDetail)
def get_session_detail(
    session_id: int, session: Session = Depends(get_session)
) -> SessionDetail:
    s = session.get(RehabSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return _detail(s, session)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, session: Session = Depends(get_session)) -> None:
    s = session.get(RehabSession, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Session not found")
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
