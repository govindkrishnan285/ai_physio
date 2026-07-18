from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, delete, select

from ..config import get_settings
from ..db import get_session
from ..models import Exercise, ReferenceProfile
from ..schemas import ProfileOut, ReferenceVideoOut, TrainRequest, TrainResult
from ..services import pose as pose_svc
from ..services import reference as ref_svc
from ..services import youtube as yt_svc
from ..services import biomechanics as bio

router = APIRouter(prefix="/exercises", tags=["training"])


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
    ex = session.get(Exercise, exercise_id)
    if ex is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if not body.youtube_urls:
        raise HTTPException(status_code=400, detail="No youtube_urls provided")

    settings = get_settings()
    video_dir = settings.data_path / "videos" / str(exercise_id)

    matrices = []
    for url in body.youtube_urls:
        try:
            path = yt_svc.download_video(url, video_dir)
        except yt_svc.VideoUnavailableError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - surface a clean API error
            raise HTTPException(
                status_code=502, detail=f"Failed to download {url}: {exc}"
            ) from exc

        frames, _fps = pose_svc.extract_pose_from_video(
            str(path), max_frames=settings.max_frames_per_video
        )
        if len(frames) < ref_svc.MIN_REP_FRAMES:
            continue
        matrices.append(bio.sequence_to_matrix(frames))

    if not matrices:
        raise HTTPException(
            status_code=422,
            detail="No usable pose data extracted from the provided videos.",
        )

    try:
        profile = ref_svc.build_profile(
            matrices,
            primary_joint=ex.primary_joint,
            direction=ex.direction,
            rest_threshold=ex.rest_threshold,
            work_threshold=ex.work_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    ml_threshold = None
    ml_model_path = None
    tf_trained = False
    if body.train_tf and settings.enable_tf:
        from ..services import mlmodel

        if mlmodel.is_available():
            model_dir = settings.data_path / "models"
            model_dir.mkdir(parents=True, exist_ok=True)
            ml_model_path = str(model_dir / f"ex_{exercise_id}.keras")
            ml_threshold = mlmodel.train_autoencoder(
                profile.rep_matrices, ml_model_path
            )
            tf_trained = True

    # Replace any existing profile for this exercise.
    session.exec(
        delete(ReferenceProfile).where(ReferenceProfile.exercise_id == exercise_id)
    )
    session.add(
        ReferenceProfile(
            exercise_id=exercise_id,
            source=",".join(body.youtube_urls),
            n_reps=profile.n_reps,
            seq_len=profile.seq_len,
            feature_names=profile.feature_names,
            mean_trajectory=profile.mean_trajectory,
            std_trajectory=profile.std_trajectory,
            ml_threshold=ml_threshold,
            ml_model_path=ml_model_path,
        )
    )
    session.commit()

    return TrainResult(
        exercise_id=exercise_id,
        n_reps=profile.n_reps,
        n_videos=len(matrices),
        feature_names=profile.feature_names,
        seq_len=profile.seq_len,
        tf_trained=tf_trained,
        ml_threshold=ml_threshold,
        message=(
            f"Learned {profile.n_reps} reps from {len(matrices)} video(s)."
            + (" TensorFlow autoencoder trained." if tf_trained else "")
        ),
    )


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
