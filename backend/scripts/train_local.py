"""Offline local training pipeline for the curated exercise library.

The developer curates therapist-approved clips into a folder tree:

    datasets/
        ACL/            video1.mp4  video2.mp4
        Shoulder/       demo.mp4
        RotatorCuff/    ...
        Squat/          ...

For each exercise folder this script:
  1. reads every video,
  2. runs MediaPipe Pose and extracts biomechanical features,
  3. auto-detects and trims the active-exercise segment (ignores intro/talking/
     outro) with the segmentation module,
  4. builds the DTW reference template (and optionally the TF autoencoder),
  5. copies one clip as the side-by-side reference video (storing the active
     window in seconds so the player loops only the movement),
  6. saves everything to PostgreSQL and prints validation metrics.

No online training or downloading — purely local files.

Usage (from backend/):
    python scripts/train_local.py --datasets ./datasets
    python scripts/train_local.py --exercise ACL --train-tf
"""

from __future__ import annotations

import argparse
import shutil
import sys
import uuid
from pathlib import Path

# Make the `app` package importable when run as a plain script.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, delete, select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import engine, init_db  # noqa: E402
from app.models import Exercise, ReferenceProfile  # noqa: E402
from app.seed import ensure_seed  # noqa: E402
from app.services import biomechanics as bio  # noqa: E402
from app.services import pose as pose_svc  # noqa: E402
from app.services import reference as ref_svc  # noqa: E402
from app.services import segmentation as seg  # noqa: E402

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# Folder name -> exercise name, for folders that don't match a name directly.
FOLDER_ALIASES = {
    "acl": "ACL Rehabilitation",
    "meniscus": "Meniscus Rehabilitation",
    "shoulder": "Shoulder Abduction",
    "rotatorcuff": "Rotator Cuff Rehab",
    "rotator": "Rotator Cuff Rehab",
    "stroke": "Stroke Rehabilitation",
    "balance": "Balance Training",
    "lowback": "Low Back Pain",
    "back": "Low Back Pain",
    "squat": "Squat Assessment",
    "lunge": "Lunge Assessment",
}


def resolve_exercise(folder: str, exercises: list[Exercise]) -> Exercise | None:
    key = folder.strip().lower().replace(" ", "").replace("_", "")
    by_name = {e.name.lower().replace(" ", ""): e for e in exercises}
    if key in by_name:
        return by_name[key]
    if key in FOLDER_ALIASES:
        target = FOLDER_ALIASES[key].lower().replace(" ", "")
        return by_name.get(target)
    # Substring match against exercise names.
    for e in exercises:
        if key in e.name.lower().replace(" ", ""):
            return e
    return None


def process_video(path: Path, ex: Exercise, max_frames: int):
    """Return (trimmed_matrix, fps, active_start_sec, active_end_sec) or None."""
    frames, fps = pose_svc.extract_pose_from_video(str(path), max_frames=max_frames)
    if len(frames) < ref_svc.MIN_REP_FRAMES:
        print(f"    ! {path.name}: too few pose frames ({len(frames)}) — skipped")
        return None

    matrix = bio.sequence_to_matrix(frames)
    span = seg.active_span(matrix, fps=fps)
    trimmed = seg.trim(matrix, span)
    print(
        f"    · {path.name}: {len(frames)} frames @ {fps:.0f}fps, "
        f"active {span.start / fps:.1f}s–{span.end / fps:.1f}s "
        f"(coverage {span.coverage:.0%})"
    )
    return trimmed, fps, span.start / fps, span.end / fps


def train_exercise(
    ex: Exercise,
    videos: list[Path],
    session: Session,
    *,
    ref_dir: Path,
    max_frames: int,
    train_tf: bool,
) -> None:
    matrices = []
    reference_clip: tuple[Path, float, float] | None = None

    for v in videos:
        result = process_video(v, ex, max_frames)
        if result is None:
            continue
        trimmed, _fps, start_sec, end_sec = result
        matrices.append(trimmed)
        if reference_clip is None:
            reference_clip = (v, start_sec, end_sec)

    if not matrices:
        print(f"  ✗ {ex.name}: no usable pose data — skipped")
        return

    try:
        profile = ref_svc.build_profile(
            matrices,
            primary_joint=ex.primary_joint,
            direction=ex.direction,
            rest_threshold=ex.rest_threshold,
            work_threshold=ex.work_threshold,
        )
    except ValueError as exc:
        print(f"  ✗ {ex.name}: {exc}")
        return

    # Copy the reference clip for the side-by-side player.
    ref_name = None
    ref_start = ref_end = None
    if reference_clip is not None:
        src, ref_start, ref_end = reference_clip
        ref_name = f"ex_{ex.id}_{uuid.uuid4().hex[:8]}{src.suffix.lower()}"
        shutil.copy2(src, ref_dir / ref_name)

    # Optional TensorFlow autoencoder.
    ml_threshold = ml_model_path = None
    if train_tf:
        from app.services import mlmodel

        if mlmodel.is_available():
            model_dir = get_settings().data_path / "models"
            model_dir.mkdir(parents=True, exist_ok=True)
            ml_model_path = str(model_dir / f"ex_{ex.id}.keras")
            ml_threshold = mlmodel.train_autoencoder(profile.rep_matrices, ml_model_path)
            print(f"    · TF autoencoder trained (threshold {ml_threshold:.4f})")
        else:
            print("    ! --train-tf set but TensorFlow isn't installed — skipped")

    session.exec(delete(ReferenceProfile).where(ReferenceProfile.exercise_id == ex.id))
    session.add(
        ReferenceProfile(
            exercise_id=ex.id,
            source=", ".join(v.name for v in videos),
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

    print(
        f"  ✓ {ex.name}: learned {profile.n_reps} reps from {len(matrices)} clip(s), "
        f"{len(profile.feature_names)} features"
        + (f", reference clip {ref_name}" if ref_name else "")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Local exercise training pipeline.")
    parser.add_argument("--datasets", default="./datasets", help="dataset root folder")
    parser.add_argument("--exercise", default=None, help="only train this folder/name")
    parser.add_argument("--train-tf", action="store_true", help="also train the TF autoencoder")
    args = parser.parse_args()

    root = Path(args.datasets)
    if not root.is_dir():
        print(f"Dataset folder not found: {root.resolve()}")
        print("Create it with per-exercise subfolders, e.g. datasets/ACL/clip1.mp4")
        sys.exit(1)

    settings = get_settings()
    ref_dir = settings.data_path / "reference-clips"
    ref_dir.mkdir(parents=True, exist_ok=True)

    init_db()

    with Session(engine) as session:
        ensure_seed(session)
        exercises = session.exec(select(Exercise)).all()

        folders = sorted(p for p in root.iterdir() if p.is_dir())
        if args.exercise:
            folders = [f for f in folders if f.name.lower() == args.exercise.lower()]

        if not folders:
            print(f"No exercise subfolders found under {root.resolve()}")
            sys.exit(1)

        print(f"Training from {root.resolve()}\n")
        for folder in folders:
            videos = sorted(p for p in folder.iterdir() if p.suffix.lower() in VIDEO_EXTS)
            if not videos:
                continue
            ex = resolve_exercise(folder.name, exercises)
            if ex is None:
                print(f"  ? {folder.name}: no matching exercise — skipped "
                      f"(add it to FOLDER_ALIASES or the exercise seed)")
                continue
            print(f"[{folder.name}] -> {ex.name}  ({len(videos)} video(s))")
            train_exercise(
                ex,
                videos,
                session,
                ref_dir=ref_dir,
                max_frames=settings.max_frames_per_video,
                train_tf=args.train_tf,
            )
            print()

    print("Done. Trained profiles are saved in PostgreSQL and ready for live sessions.")


if __name__ == "__main__":
    main()
