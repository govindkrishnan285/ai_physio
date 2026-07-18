from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..config import get_settings
from ..db import get_session
from ..models import Exercise, ReferenceProfile
from ..schemas import AnalyzeRepRequest, AnalyzeRepResponse, FeedbackCue
from ..services import biomechanics as bio
from ..services import comparison as cmp_svc
from ..services import feedback as fb_svc

router = APIRouter(prefix="/analyze", tags=["analysis"])


@router.post("/rep", response_model=AnalyzeRepResponse)
def analyze_rep(
    body: AnalyzeRepRequest, session: Session = Depends(get_session)
) -> AnalyzeRepResponse:
    """Score one completed rep (its landmark frames) against the learned template."""
    ex = session.get(Exercise, body.exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail="Exercise not found")

    profile = session.exec(
        select(ReferenceProfile).where(
            ReferenceProfile.exercise_id == body.exercise_id
        )
    ).first()
    if profile is None:
        raise HTTPException(
            status_code=409,
            detail="This exercise has no trained reference profile yet.",
        )

    if len(body.frames) < ref_min_frames():
        raise HTTPException(status_code=400, detail="Too few frames for a rep.")

    try:
        landmark_frames = [np.asarray(f, dtype=np.float64) for f in body.frames]
        matrix = bio.sequence_to_matrix(landmark_frames)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Malformed frames: {exc}") from exc

    result = cmp_svc.score_rep(
        matrix,
        mean_trajectory=profile.mean_trajectory,
        std_trajectory=profile.std_trajectory,
        primary_joint=ex.primary_joint,
        target_min=ex.target_rom_min,
        target_max=ex.target_rom_max,
        fps=body.fps,
    )
    cues = fb_svc.build_feedback(result)

    ml_anomaly = None
    ml_flagged = None
    settings = get_settings()
    if settings.enable_tf and profile.ml_model_path and profile.ml_threshold is not None:
        from ..services import mlmodel

        if mlmodel.is_available():
            user_norm = bio.time_normalize(matrix, profile.seq_len)
            ml_anomaly = mlmodel.anomaly_score(profile.ml_model_path, user_norm)
            ml_flagged = ml_anomaly > profile.ml_threshold

    return AnalyzeRepResponse(
        exercise_name=ex.name,
        accuracy=result["accuracy"],
        avg_deviation=result["avg_deviation"],
        rom=result["rom"],
        peak_angle=result["peak_angle"],
        in_range=result["in_range"],
        errors=result["errors"],
        feedback=[FeedbackCue(**c) for c in cues],
        tempo=result["tempo"],
        peak_velocity=result["peak_velocity"],
        ml_anomaly=ml_anomaly,
        ml_flagged=ml_flagged,
    )


def ref_min_frames() -> int:
    from ..services.reference import MIN_REP_FRAMES

    return MIN_REP_FRAMES
