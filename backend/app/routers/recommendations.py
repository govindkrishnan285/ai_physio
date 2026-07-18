from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Exercise, RehabSession
from ..schemas import RecommendationOut
from ..services import recommend as rec_svc

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[RecommendationOut])
def get_recommendations(
    patient_id: str = "default", session: Session = Depends(get_session)
) -> list[RecommendationOut]:
    exercises = session.exec(select(Exercise)).all()
    ex_by_name = {e.name: e for e in exercises}

    sessions = session.exec(
        select(RehabSession)
        .where(RehabSession.patient_id == patient_id)
        .order_by(RehabSession.start_time.desc())
    ).all()

    history = []
    for s in sessions:
        matched = ex_by_name.get(s.exercise)
        ex_id = s.exercise_id or (matched.id if matched else None)
        if ex_id is None:
            continue
        history.append(
            {
                "exercise_id": ex_id,
                "exercise_name": s.exercise,
                "category": matched.category if matched else "",
                "avg_accuracy": s.accuracy,
                "total_reps": s.repetitions,
            }
        )
    ex_dicts = [{"id": e.id, "name": e.name, "category": e.category} for e in exercises]

    recs = rec_svc.recommend_next(history, ex_dicts)
    return [RecommendationOut(**r) for r in recs]
