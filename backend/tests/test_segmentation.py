"""Verifies the exercise-segmentation trims intro/idle/outro correctly.

Run:  python -m tests.test_segmentation   (from the backend/ directory)
"""

from __future__ import annotations

import numpy as np

from app.services.biomechanics import FEATURE_ORDER
from app.services.segmentation import active_span, trim


def build_sequence() -> np.ndarray:
    """idle(intro) -> active knee flexion reps -> idle(outro)."""
    f = len(FEATURE_ORDER)
    rng = np.random.default_rng(0)

    def idle(n: int) -> np.ndarray:
        m = np.full((n, f), 150.0)
        m[:, 0] = 170 + rng.normal(0, 0.4, n)  # left knee, nearly still
        m[:, 1] = 170 + rng.normal(0, 0.4, n)  # right knee
        return m

    def active(n: int) -> np.ndarray:
        m = np.full((n, f), 150.0)
        # 4 flexion cycles between ~170 and ~90 degrees.
        phase = np.linspace(0, 4 * 2 * np.pi, n)
        knee = 130 - 40 * np.cos(phase)
        m[:, 0] = knee
        m[:, 1] = knee
        return m

    return np.vstack([idle(30), active(90), idle(30)])  # 150 frames @ 30 fps


def main() -> None:
    seq = build_sequence()
    span = active_span(seq, fps=30.0)
    print(f"detected active span: [{span.start}, {span.end}) "
          f"coverage={span.coverage:.2f} (total {seq.shape[0]} frames)")

    trimmed = trim(seq, span)
    print(f"trimmed length: {trimmed.shape[0]} frames "
          f"({span.start / 30:.1f}s .. {span.end / 30:.1f}s)")

    # The active portion is frames [30, 120). Allow a margin for smoothing edges.
    assert 15 <= span.start <= 45, f"start {span.start} not near intro end"
    assert 105 <= span.end <= 140, f"end {span.end} not near outro start"
    assert 0.45 <= span.coverage <= 0.8, f"coverage {span.coverage} off"
    print("\nSEGMENTATION ASSERTIONS PASSED")


if __name__ == "__main__":
    main()
