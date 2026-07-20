from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Exercise, ReferenceProfile
from ..schemas import ExerciseOut
from ..seed import ensure_seed

from ..deps import get_current_user

# The exercise library is readable by any signed-in user; it holds no
# patient data. Writes live in the training router and are gated harder.
router = APIRouter(
    prefix="/exercises",
    tags=["exercises"],
    dependencies=[Depends(get_current_user)],
)


def _to_out(ex: Exercise, has_profile: bool, has_reference_video: bool) -> ExerciseOut:
    return ExerciseOut(
        id=ex.id,
        name=ex.name,
        category=ex.category,
        primary_joint=ex.primary_joint,
        direction=ex.direction,
        rest_threshold=ex.rest_threshold,
        work_threshold=ex.work_threshold,
        target_rom_min=ex.target_rom_min,
        target_rom_max=ex.target_rom_max,
        instructions=ex.instructions,
        has_profile=has_profile,
        has_reference_video=has_reference_video,
    )


@router.get("", response_model=list[ExerciseOut])
def list_exercises(session: Session = Depends(get_session)) -> list[ExerciseOut]:
    ensure_seed(session)
    exercises = session.exec(select(Exercise)).all()
    profiles = session.exec(select(ReferenceProfile)).all()
    profiled = {p.exercise_id for p in profiles}
    with_video = {p.exercise_id for p in profiles if p.reference_video_path}
    return [
        _to_out(ex, ex.id in profiled, ex.id in with_video) for ex in exercises
    ]


@router.get("/{exercise_id}", response_model=ExerciseOut)
def get_exercise(
    exercise_id: int, session: Session = Depends(get_session)
) -> ExerciseOut:
    ex = session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    profile = session.exec(
        select(ReferenceProfile).where(ReferenceProfile.exercise_id == exercise_id)
    ).first()
    return _to_out(
        ex,
        profile is not None,
        bool(profile and profile.reference_video_path),
    )
