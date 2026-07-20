"""Shared training pipeline: local video files -> learned reference profile.

Both the file-upload endpoint and the (legacy) YouTube endpoint funnel through
here, so they behave identically: pose estimation, biomechanical features,
active-exercise segmentation, DTW template, reference clip, optional TF layer.

This is the same pipeline `scripts/train_local.py` runs offline.
"""

from __future__ import annotations

import shutil
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from sqlmodel import Session, delete

from ..config import get_settings
from ..models import Exercise, ReferenceProfile
from . import biomechanics as bio
from . import pose as pose_svc
from . import reference as ref_svc
from . import segmentation as seg


class NoUsablePoseData(Exception):
    """No clip yielded enough pose frames / detectable repetitions."""


@dataclass
class TrainingOutcome:
    n_reps: int
    n_videos: int
    feature_names: list[str]
    seq_len: int
    tf_trained: bool
    ml_threshold: float | None
    reference_clip: str | None


def train_exercise_from_paths(
    session: Session,
    exercise: Exercise,
    paths: list[Path],
    *,
    source: str,
    train_tf: bool = False,
    progress: Callable[[int, str], None] | None = None,
) -> TrainingOutcome:
    """``progress`` receives (percent 0-100, human-readable stage)."""
    settings = get_settings()

    def report(pct: int, msg: str) -> None:
        if progress:
            progress(pct, msg)

    matrices = []
    reference_clip: tuple[Path, float, float] | None = None
    n = max(1, len(paths))

    # Pose estimation dominates the runtime, so it owns most of the bar (5-75%).
    for i, path in enumerate(paths):
        report(5 + int(70 * i / n), f"Analyzing video {i + 1} of {n}…")

        frames, fps = pose_svc.extract_pose_from_video(
            str(path),
            max_frames=settings.max_frames_per_video,
            progress=lambda frac, i=i: report(
                5 + int(70 * (i + frac) / n),
                f"Analyzing video {i + 1} of {n}… {int(frac * 100)}%",
            ),
        )
        if len(frames) < ref_svc.MIN_REP_FRAMES:
            continue

        matrix = bio.sequence_to_matrix(frames)
        # Trim intro / talking / outro so only the exercise trains the model.
        span = seg.active_span(matrix, fps=fps)
        matrices.append(seg.trim(matrix, span))

        if reference_clip is None:
            reference_clip = (path, span.start / fps, span.end / fps)

    if not matrices:
        raise NoUsablePoseData(
            "No usable pose data was extracted. Make sure the person is fully "
            "visible and well lit throughout the clip."
        )

    report(78, "Building movement template…")
    profile = ref_svc.build_profile(
        matrices,
        primary_joint=exercise.primary_joint,
        direction=exercise.direction,
        rest_threshold=exercise.rest_threshold,
        work_threshold=exercise.work_threshold,
    )

    # Keep one clip as the side-by-side reference, with its active window.
    ref_name = None
    ref_start = ref_end = None
    if reference_clip is not None:
        src, ref_start, ref_end = reference_clip
        ref_dir = settings.data_path / "reference-clips"
        ref_dir.mkdir(parents=True, exist_ok=True)
        ref_name = f"ex_{exercise.id}_{uuid.uuid4().hex[:8]}{src.suffix.lower() or '.mp4'}"
        shutil.copy2(src, ref_dir / ref_name)

    ml_threshold = None
    ml_model_path = None
    tf_trained = False
    if train_tf and settings.enable_tf:
        from . import mlmodel

        if mlmodel.is_available():
            report(88, "Training TensorFlow autoencoder…")
            model_dir = settings.data_path / "models"
            model_dir.mkdir(parents=True, exist_ok=True)
            ml_model_path = str(model_dir / f"ex_{exercise.id}.keras")
            ml_threshold = mlmodel.train_autoencoder(
                profile.rep_matrices, ml_model_path
            )
            tf_trained = True

    report(95, "Saving profile…")
    session.exec(
        delete(ReferenceProfile).where(ReferenceProfile.exercise_id == exercise.id)
    )
    session.add(
        ReferenceProfile(
            exercise_id=exercise.id,
            source=source,
            n_reps=profile.n_reps,
            seq_len=profile.seq_len,
            feature_names=profile.feature_names,
            mean_trajectory=profile.mean_trajectory,
            std_trajectory=profile.std_trajectory,
            ml_threshold=ml_threshold,
            ml_model_path=ml_model_path,
            reference_video_path=ref_name,
            ref_start_sec=ref_start,
            ref_end_sec=ref_end,
        )
    )
    session.commit()

    return TrainingOutcome(
        n_reps=profile.n_reps,
        n_videos=len(matrices),
        feature_names=profile.feature_names,
        seq_len=profile.seq_len,
        tf_trained=tf_trained,
        ml_threshold=ml_threshold,
        reference_clip=ref_name,
    )
