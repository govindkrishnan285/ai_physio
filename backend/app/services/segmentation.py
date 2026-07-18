"""Exercise segmentation: find the active-movement portion of a reference video.

Curated physiotherapy videos often begin with an intro/greeting/explanation and
end with an outro. Training should only see the actual exercise, so we detect
the span where the body is genuinely moving through the exercise and trim the
rest.

Approach (pure numpy, no ML): per-frame motion is the L2 norm of the
frame-to-frame change in the joint-angle feature vector (angular velocity).
Smoothing + an adaptive threshold classify each frame active/idle; small gaps
are bridged and the longest sustained active run is returned.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class ActiveSpan:
    start: int  # inclusive frame index
    end: int  # exclusive frame index
    coverage: float  # fraction of the video that is active exercise


def _moving_average(x: np.ndarray, win: int) -> np.ndarray:
    if win <= 1 or x.size < win:
        return x
    kernel = np.ones(win) / win
    return np.convolve(x, kernel, mode="same")


def frame_motion(matrix: np.ndarray) -> np.ndarray:
    """Per-frame motion magnitude from the joint-angle feature matrix (T, F)."""
    if matrix.shape[0] < 2:
        return np.zeros(matrix.shape[0])
    diff = np.diff(matrix, axis=0)
    motion = np.linalg.norm(diff, axis=1)
    # Prepend a zero so motion aligns with frame indices.
    return np.concatenate([[0.0], motion])


def active_span(
    matrix: np.ndarray,
    fps: float = 30.0,
    *,
    min_active_sec: float = 2.0,
    gap_sec: float = 1.0,
    smooth_win: int = 5,
    threshold_frac: float = 0.35,
) -> ActiveSpan:
    """Return the longest sustained active-exercise span of a pose sequence.

    ``threshold_frac`` scales an adaptive threshold set between the resting and
    peak motion levels. Frames above it are "active"; gaps shorter than
    ``gap_sec`` are bridged so a brief pause mid-rep doesn't split the exercise.
    Falls back to the whole clip if no sufficiently long active run is found.
    """
    t = matrix.shape[0]
    if t < 3:
        return ActiveSpan(0, t, 1.0)

    motion = _moving_average(frame_motion(matrix), smooth_win)

    # Adaptive threshold between the quiet baseline and the active peak.
    baseline = float(np.percentile(motion, 20))
    peak = float(np.percentile(motion, 90))
    threshold = baseline + threshold_frac * max(peak - baseline, 1e-6)

    active = motion > threshold

    # Bridge short idle gaps inside the movement.
    gap_frames = max(1, int(gap_sec * fps))
    bridged = active.copy()
    i = 0
    while i < t:
        if not bridged[i]:
            j = i
            while j < t and not bridged[j]:
                j += 1
            # Gap bounded by active frames on both sides and short enough.
            if 0 < i and j < t and (j - i) <= gap_frames:
                bridged[i:j] = True
            i = j
        else:
            i += 1

    # Longest contiguous active run.
    best_start, best_end, best_len = 0, t, 0
    i = 0
    while i < t:
        if bridged[i]:
            j = i
            while j < t and bridged[j]:
                j += 1
            if (j - i) > best_len:
                best_len = j - i
                best_start, best_end = i, j
            i = j
        else:
            i += 1

    min_frames = int(min_active_sec * fps)
    if best_len < min_frames:
        # Nothing convincingly active — keep the whole clip rather than guess.
        return ActiveSpan(0, t, 1.0)

    return ActiveSpan(best_start, best_end, best_len / t)


def trim(matrix: np.ndarray, span: ActiveSpan) -> np.ndarray:
    """Slice a feature matrix to its active span."""
    return matrix[span.start : span.end]
