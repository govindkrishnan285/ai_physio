from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import RehabSession
from ..schemas import ProgressResponse

router = APIRouter(prefix="/progress", tags=["analytics"])


def _mean(values: list[float]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


@router.get("", response_model=ProgressResponse)
def get_progress(
    patient_id: str = "default", session: Session = Depends(get_session)
) -> ProgressResponse:
    """Aggregate trends across all of a patient's sessions (chronological)."""
    sessions = session.exec(
        select(RehabSession)
        .where(RehabSession.patient_id == patient_id)
        .order_by(RehabSession.start_time)
    ).all()

    if not sessions:
        return ProgressResponse(
            session_count=0,
            total_repetitions=0,
            total_calories=0.0,
            average_duration_seconds=0.0,
            weekly_accuracy=[],
            monthly_improvement=[],
            rom_trend=[],
            exercise_frequency=[],
            pain_trend=[],
        )

    # Weekly accuracy (ISO year-week).
    weekly: dict[str, list[float]] = defaultdict(list)
    # Monthly average accuracy (improvement over months).
    monthly: dict[str, list[float]] = defaultdict(list)
    # ROM per session date.
    rom_by_date: dict[str, list[float]] = defaultdict(list)
    # Exercise frequency.
    freq: dict[str, int] = defaultdict(int)
    # Pain per session date.
    pain_trend: list[dict] = []

    for s in sessions:
        iso = s.date.isocalendar()
        weekly[f"{iso[0]}-W{iso[1]:02d}"].append(s.accuracy)
        monthly[f"{s.date.year}-{s.date.month:02d}"].append(s.accuracy)
        if s.average_rom is not None:
            rom_by_date[s.date.isoformat()].append(s.average_rom)
        freq[s.exercise] += 1
        if s.pain_score is not None:
            pain_trend.append({"date": s.date.isoformat(), "pain_score": s.pain_score})

    weekly_accuracy = [
        {"week": k, "accuracy": _mean(v)} for k, v in sorted(weekly.items())
    ]
    monthly_improvement = [
        {"month": k, "accuracy": _mean(v)} for k, v in sorted(monthly.items())
    ]
    rom_trend = [
        {"date": k, "average_rom": _mean(v)} for k, v in sorted(rom_by_date.items())
    ]
    exercise_frequency = [
        {"exercise": k, "count": v}
        for k, v in sorted(freq.items(), key=lambda kv: kv[1], reverse=True)
    ]

    durations = [s.duration_seconds for s in sessions]

    return ProgressResponse(
        session_count=len(sessions),
        total_repetitions=sum(s.repetitions for s in sessions),
        total_calories=round(sum(s.calories for s in sessions), 1),
        average_duration_seconds=round(sum(durations) / len(durations), 1),
        weekly_accuracy=weekly_accuracy,
        monthly_improvement=monthly_improvement,
        rom_trend=rom_trend,
        exercise_frequency=exercise_frequency,
        pain_trend=pain_trend,
    )
