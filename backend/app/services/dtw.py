"""Dynamic Time Warping between two multivariate sequences (pure numpy).

Used to align a user's rep to the reference template so that similarity is
measured on *movement shape*, tolerant of the user being slightly faster or
slower than the reference. No external DTW dependency.
"""

from __future__ import annotations

import numpy as np


def dtw_distance(a: np.ndarray, b: np.ndarray, band: int | None = None) -> float:
    """Average per-aligned-step Euclidean distance between (Ta,F) and (Tb,F).

    ``band`` is an optional Sakoe-Chiba window (in samples) that both bounds the
    warp and speeds the DP. Returns distance normalized by the warp-path length,
    so it stays on the scale of the input features (degrees, here).
    """
    ta, tb = a.shape[0], b.shape[0]
    if ta == 0 or tb == 0:
        return float("inf")

    if band is None:
        band = max(ta, tb)

    inf = float("inf")
    cost = np.full((ta + 1, tb + 1), inf, dtype=np.float64)
    cost[0, 0] = 0.0
    # steps[i, j] = length of the warp path reaching (i, j), for normalization.
    steps = np.zeros((ta + 1, tb + 1), dtype=np.int64)

    for i in range(1, ta + 1):
        j_lo = max(1, i - band)
        j_hi = min(tb, i + band)
        ai = a[i - 1]
        for j in range(j_lo, j_hi + 1):
            d = float(np.linalg.norm(ai - b[j - 1]))
            # Pick the cheapest predecessor (match / insertion / deletion).
            best_prev = cost[i - 1, j - 1]
            best_i, best_j = i - 1, j - 1
            if cost[i - 1, j] < best_prev:
                best_prev = cost[i - 1, j]
                best_i, best_j = i - 1, j
            if cost[i, j - 1] < best_prev:
                best_prev = cost[i, j - 1]
                best_i, best_j = i, j - 1
            cost[i, j] = d + best_prev
            steps[i, j] = steps[best_i, best_j] + 1

    total = cost[ta, tb]
    path_len = steps[ta, tb]
    if not np.isfinite(total) or path_len == 0:
        return float("inf")
    return float(total / path_len)
