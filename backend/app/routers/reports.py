from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, func, select

from ..db import get_session
from ..deps import TargetPatient
from ..models import ExerciseFeedback, RehabSession
from ..schemas import ReportItem, ReportsResponse

router = APIRouter(prefix="/reports", tags=["analytics"])


@router.get("", response_model=ReportsResponse)
def get_reports(
    patient: TargetPatient,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> ReportsResponse:
    """Per-session clinical summaries, newest first, each with its AI feedback."""
    total = session.exec(
        select(func.count())
        .select_from(RehabSession)
        .where(RehabSession.patient_profile_id == patient.id)
    ).one()

    rows = session.exec(
        select(RehabSession)
        .where(RehabSession.patient_profile_id == patient.id)
        .order_by(RehabSession.start_time.desc())
        .offset(offset)
        .limit(limit)
    ).all()

    items: list[ReportItem] = []
    for s in rows:
        # Distinct feedback texts for this session, preserving first-seen order.
        fb_rows = session.exec(
            select(ExerciseFeedback.feedback)
            .where(ExerciseFeedback.session_id == s.id)
            .order_by(ExerciseFeedback.timestamp)
        ).all()
        seen: list[str] = []
        for text in fb_rows:
            if text and text not in seen:
                seen.append(text)

        items.append(
            ReportItem(
                id=s.id,
                exercise=s.exercise,
                date=s.date.isoformat(),
                duration_minutes=round(s.duration_seconds / 60),
                repetitions=s.repetitions,
                average_rom=s.average_rom,
                accuracy=s.accuracy,
                quality_score=s.quality_score,
                feedback=seen[:8],
            )
        )

    return ReportsResponse(items=items, total=int(total))
