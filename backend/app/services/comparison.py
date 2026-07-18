"""Score a user's rep against a learned reference template and detect errors."""

from __future__ import annotations

import numpy as np

from . import biomechanics as bio
from .dtw import dtw_distance

# Flag a joint only when its mean deviation exceeds BOTH an absolute floor and a
# multiple of the reference's own natural variability at that joint.
MIN_DEVIATION_DEG = 8.0
STD_MULTIPLE = 1.5
STD_FLOOR_DEG = 4.0
SYMMETRY_DEG = 15.0
FAST_VELOCITY_DEG_S = 260.0
ACCURACY_K = 2.0  # accuracy = 100 - K * avg_per_feature_deviation_deg


def score_rep(
    user_matrix: np.ndarray,
    *,
    mean_trajectory: list[list[float]],
    std_trajectory: list[list[float]],
    primary_joint: str,
    target_min: float,
    target_max: float,
    fps: float = 30.0,
) -> dict:
    """Compare one user rep (T, F feature matrix) to the reference template."""
    mean = np.asarray(mean_trajectory, dtype=np.float64)
    std = np.asarray(std_trajectory, dtype=np.float64)
    seq_len, n_features = mean.shape

    user_norm = bio.time_normalize(user_matrix, seq_len)

    # Overall similarity via DTW on full feature vectors, converted to an
    # average per-feature deviation in degrees.
    band = max(5, seq_len // 10)
    dist = dtw_distance(user_norm, mean, band=band)
    avg_dev = dist / np.sqrt(n_features)
    accuracy = float(np.clip(100.0 - ACCURACY_K * avg_dev, 0.0, 100.0))

    # Per-feature signed deviation (user minus reference) across the rep.
    signed = (user_norm - mean).mean(axis=0)
    std_eff = np.maximum(std.mean(axis=0), STD_FLOOR_DEG)

    errors: list[dict] = []
    per_joint_dev: dict[str, dict[str, float]] = {}
    for f, name in enumerate(bio.FEATURE_ORDER):
        dev = float(signed[f])
        if abs(dev) < MIN_DEVIATION_DEG or abs(dev) < STD_MULTIPLE * std_eff[f]:
            continue
        side = ""
        joint = name
        if name.startswith(("left_", "right_")):
            side, joint = name.split("_", 1)
        severity = "major" if abs(dev) >= 2 * MIN_DEVIATION_DEG else "minor"
        errors.append(
            {
                "feature": name,
                "joint": joint,
                "side": side,
                "deviation": round(dev, 1),
                "direction": "higher" if dev > 0 else "lower",
                "severity": severity,
            }
        )
        per_joint_dev.setdefault(joint, {})[side or "_"] = dev

    # Asymmetry: same joint, the two sides deviating very differently.
    symmetry_notes: list[str] = []
    for joint, sides in per_joint_dev.items():
        if "left" in sides and "right" in sides:
            gap = abs(sides["left"] - sides["right"])
            if gap >= SYMMETRY_DEG:
                lagging = "left" if sides["left"] > sides["right"] else "right"
                symmetry_notes.append(
                    f"Movement is asymmetrical — your {lagging} {joint} is lagging (~{gap:.0f}° gap)."
                )

    # Primary-joint ROM, peak, and tempo from the raw (un-normalized) rep.
    primary = bio.primary_angle_series(user_matrix, primary_joint)
    rom = bio.range_of_motion(primary)
    # Worked position is the extreme the joint reaches during the rep.
    peak_angle = float(np.min(primary)) if primary.size else 0.0
    in_range = bool(target_min <= peak_angle <= target_max) or bool(
        target_min <= rom <= target_max
    )

    vel = bio.velocity(primary, fps)
    peak_velocity = float(np.max(np.abs(vel))) if vel.size else 0.0
    tempo = "fast" if peak_velocity > FAST_VELOCITY_DEG_S else "ok"

    return {
        "accuracy": round(accuracy, 1),
        "avg_deviation": round(float(avg_dev), 1),
        "rom": round(rom, 1),
        "peak_angle": round(peak_angle, 1),
        "in_range": in_range,
        "errors": errors,
        "symmetry_notes": symmetry_notes,
        "peak_velocity": round(peak_velocity, 1),
        "tempo": tempo,
    }
