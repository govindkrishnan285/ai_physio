from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session, select

from ..config import get_settings
from ..db import get_session
from ..models import Exercise, ReferenceProfile
from ..schemas import ProfileOut, ReferenceVideoOut, TrainRequest, TrainResult
from ..services import training as train_svc
from ..services import youtube as yt_svc

router = APIRouter(prefix="/exercises", tags=["training"])

ALLOWED_VIDEO_SUFFIXES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}


def _get_exercise(session: Session, exercise_id: int) -> Exercise:
    ex = session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


def _to_result(exercise_id: int, outcome: train_svc.TrainingOutcome) -> TrainResult:
    return TrainResult(
        exercise_id=exercise_id,
        n_reps=outcome.n_reps,
        n_videos=outcome.n_videos,
        feature_names=outcome.feature_names,
        seq_len=outcome.seq_len,
        tf_trained=outcome.tf_trained,
        ml_threshold=outcome.ml_threshold,
        message=(
            f"Learned {outcome.n_reps} reps from {outcome.n_videos} video(s)."
            + (" Reference clip saved." if outcome.reference_clip else "")
            + (" TensorFlow autoencoder trained." if outcome.tf_trained else "")
        ),
    )


@router.post("/{exercise_id}/train-upload", response_model=TrainResult)
def train_from_upload(
    exercise_id: int,
    files: list[UploadFile] = File(...),
    train_tf: bool = Form(False),
    session: Session = Depends(get_session),
) -> TrainResult:
    """Learn an exercise from uploaded video files.

    Preferred over the YouTube path: the clips are yours, so the reference video
    can legally ship with the app for the side-by-side player, and there is no
    fragile third-party download step.
    """
    ex = _get_exercise(session, exercise_id)
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    settings = get_settings()
    upload_dir = settings.data_path / "uploads" / str(exercise_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    saved = []
    for f in files:
        suffix = Path(f.filename or "clip.mp4").suffix.lower()
        if suffix not in ALLOWED_VIDEO_SUFFIXES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type '{suffix}'. Allowed: "
                + ", ".join(sorted(ALLOWED_VIDEO_SUFFIXES)),
            )
        dest = upload_dir / f"{uuid4().hex}{suffix}"
        with dest.open("wb") as out:
            shutil.copyfileobj(f.file, out)  # streamed, not loaded into memory
        saved.append(dest)

    try:
        outcome = train_svc.train_exercise_from_paths(
            session,
            ex,
            saved,
            source=", ".join(f.filename or "upload" for f in files),
            train_tf=train_tf,
        )
    except train_svc.NoUsablePoseData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _to_result(exercise_id, outcome)


@router.post("/{exercise_id}/train", response_model=TrainResult)
def train_from_youtube(
    exercise_id: int,
    body: TrainRequest,
    session: Session = Depends(get_session),
) -> TrainResult:
    """Learn a reference template for an exercise from YouTube reference videos.

    Synchronous and potentially slow (download + per-frame pose estimation).
    For production, move this to a background worker / task queue.
    """
    ex = _get_exercise(session, exercise_id)
    if not body.youtube_urls:
        raise HTTPException(status_code=400, detail="No youtube_urls provided")

    settings = get_settings()
    video_dir = settings.data_path / "videos" / str(exercise_id)

    paths = []
    for url in body.youtube_urls:
        try:
            paths.append(yt_svc.download_video(url, video_dir))
        except yt_svc.VideoUnavailableError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - surface a clean API error
            raise HTTPException(
                status_code=502, detail=f"Failed to download {url}: {exc}"
            ) from exc

    try:
        outcome = train_svc.train_exercise_from_paths(
            session,
            ex,
            paths,
            source=", ".join(body.youtube_urls),
            train_tf=body.train_tf,
        )
    except train_svc.NoUsablePoseData as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return _to_result(exercise_id, outcome)


@router.get("/{exercise_id}/profile", response_model=ProfileOut)
def get_profile(
    exercise_id: int, session: Session = Depends(get_session)
) -> ProfileOut:
    profile = session.exec(
        select(ReferenceProfile).where(ReferenceProfile.exercise_id == exercise_id)
    ).first()
    if profile is None:
        raise HTTPException(status_code=404, detail="No reference profile trained yet")
    return ProfileOut(
        exercise_id=exercise_id,
        n_reps=profile.n_reps,
        seq_len=profile.seq_len,
        feature_names=profile.feature_names,
        source=profile.source,
        has_tf=profile.ml_model_path is not None,
    )


@router.get("/{exercise_id}/reference-video", response_model=ReferenceVideoOut)
def get_reference_video(
    exercise_id: int, session: Session = Depends(get_session)
) -> ReferenceVideoOut:
    """URL + active window of the curated reference clip for the side-by-side player."""
    profile = session.exec(
        select(ReferenceProfile).where(ReferenceProfile.exercise_id == exercise_id)
    ).first()
    if profile is None or not profile.reference_video_path:
        raise HTTPException(status_code=404, detail="No reference video for this exercise")
    return ReferenceVideoOut(
        exercise_id=exercise_id,
        url=f"/reference-media/{profile.reference_video_path}",
        start_sec=profile.ref_start_sec,
        end_sec=profile.ref_end_sec,
    )
