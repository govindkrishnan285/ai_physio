"""Build a reference movement template for an exercise from pose sequences.

Input: one feature matrix (T, F) per reference video (from biomechanics.
sequence_to_matrix). Output: a time-normalized mean + std trajectory across all
detected reps — the learned "correct" movement the live engine compares against.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import biomechanics as bio
from .reps import segment_reps

MIN_REP_FRAMES = 5


@dataclass
class BuiltProfile:
    feature_names: list[str]
    seq_len: int
    n_reps: int
    mean_trajectory: list[list[float]]
    std_trajectory: list[list[float]]
    rep_matrices: list[np.ndarray]  # normalized (seq_len, F) per rep, for TF training


def extract_reps(
    matrix: np.ndarray,
    *,
    primary_joint: str,
    direction: str,
    rest_threshold: float,
    work_threshold: float,
    seq_len: int = 100,
) -> list[np.ndarray]:
    """Cut one video's feature matrix into time-normalized per-rep matrices."""
    angle_series = bio.primary_angle_series(matrix, primary_joint)
    spans = segment_reps(angle_series, direction, rest_threshold, work_threshold)

    reps: list[np.ndarray] = []
    for span in spans:
        if span.end - span.start < MIN_REP_FRAMES:
            continue
        rep = matrix[span.start : span.end + 1]
        reps.append(bio.time_normalize(rep, seq_len))
    return reps


def build_profile(
    matrices: list[np.ndarray],
    *,
    primary_joint: str,
    direction: str,
    rest_threshold: float,
    work_threshold: float,
    seq_len: int = 100,
) -> BuiltProfile:
    """Aggregate reps from all reference videos into one mean/std template."""
    all_reps: list[np.ndarray] = []
    for matrix in matrices:
        all_reps.extend(
            extract_reps(
                matrix,
                primary_joint=primary_joint,
                direction=direction,
                rest_threshold=rest_threshold,
                work_threshold=work_threshold,
                seq_len=seq_len,
            )
        )

    if not all_reps:
        raise ValueError(
            "No repetitions detected in the reference videos. Check that the "
            "movement matches the exercise's primary joint and thresholds."
        )

    stack = np.stack(all_reps, axis=0)  # (n_reps, seq_len, F)
    mean = stack.mean(axis=0)
    # ddof=0 so a single rep yields all-zero std (handled as a floor downstream).
    std = stack.std(axis=0)

    return BuiltProfile(
        feature_names=bio.FEATURE_ORDER,
        seq_len=seq_len,
        n_reps=len(all_reps),
        mean_trajectory=mean.tolist(),
        std_trajectory=std.tolist(),
        rep_matrices=all_reps,
    )
