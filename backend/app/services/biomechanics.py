"""Biomechanical feature extraction from MediaPipe Pose landmarks.

A "frame" is a numpy array of shape (33, >=3): columns x, y, z, [visibility].
x/y are normalized image coordinates (0..1); we work in 2D (x, y) because a
single webcam gives unreliable depth. All angles are in degrees.

This module is pure numpy and has no MediaPipe / TensorFlow dependency, so it is
cheap to unit-test with synthetic landmark arrays.
"""

from __future__ import annotations

import numpy as np

# MediaPipe Pose landmark indices.
L_SHOULDER, R_SHOULDER = 11, 12
L_ELBOW, R_ELBOW = 13, 14
L_WRIST, R_WRIST = 15, 16
L_HIP, R_HIP = 23, 24
L_KNEE, R_KNEE = 25, 26
L_ANKLE, R_ANKLE = 27, 28
L_FOOT, R_FOOT = 31, 32

# Canonical feature order for the fixed-length feature vector used everywhere
# downstream (templates, DTW, autoencoder). Do not reorder without rebuilding
# stored reference profiles.
JOINT_ANGLE_NAMES = [
    "left_knee",
    "right_knee",
    "left_hip",
    "right_hip",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_ankle",
    "right_ankle",
]
FEATURE_ORDER = JOINT_ANGLE_NAMES + ["trunk_incline"]

# Maps an exercise's primary_joint to the two per-side angle features to average.
PRIMARY_JOINT_FEATURES = {
    "knee": ("left_knee", "right_knee"),
    "hip": ("left_hip", "right_hip"),
    "shoulder": ("left_shoulder", "right_shoulder"),
    "elbow": ("left_elbow", "right_elbow"),
    "ankle": ("left_ankle", "right_ankle"),
}


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """Angle at vertex ``b`` formed by points a-b-c, in degrees (0..180)."""
    ba = a[:2] - b[:2]
    bc = c[:2] - b[:2]
    n1 = np.linalg.norm(ba)
    n2 = np.linalg.norm(bc)
    if n1 < 1e-6 or n2 < 1e-6:
        return 180.0
    cosang = float(np.dot(ba, bc) / (n1 * n2))
    cosang = max(-1.0, min(1.0, cosang))
    return float(np.degrees(np.arccos(cosang)))


def joint_angles(lm: np.ndarray) -> dict[str, float]:
    """Compute all tracked joint angles for one frame of landmarks."""
    return {
        "left_knee": _angle(lm[L_HIP], lm[L_KNEE], lm[L_ANKLE]),
        "right_knee": _angle(lm[R_HIP], lm[R_KNEE], lm[R_ANKLE]),
        "left_hip": _angle(lm[L_SHOULDER], lm[L_HIP], lm[L_KNEE]),
        "right_hip": _angle(lm[R_SHOULDER], lm[R_HIP], lm[R_KNEE]),
        "left_shoulder": _angle(lm[L_ELBOW], lm[L_SHOULDER], lm[L_HIP]),
        "right_shoulder": _angle(lm[R_ELBOW], lm[R_SHOULDER], lm[R_HIP]),
        "left_elbow": _angle(lm[L_SHOULDER], lm[L_ELBOW], lm[L_WRIST]),
        "right_elbow": _angle(lm[R_SHOULDER], lm[R_ELBOW], lm[R_WRIST]),
        "left_ankle": _angle(lm[L_KNEE], lm[L_ANKLE], lm[L_FOOT]),
        "right_ankle": _angle(lm[R_KNEE], lm[R_ANKLE], lm[R_FOOT]),
    }


def trunk_incline(lm: np.ndarray) -> float:
    """Angle of the torso (mid-shoulder to mid-hip) away from vertical, degrees.

    0 = perfectly upright spine; larger = more forward/side lean.
    """
    mid_shoulder = (lm[L_SHOULDER][:2] + lm[R_SHOULDER][:2]) / 2.0
    mid_hip = (lm[L_HIP][:2] + lm[R_HIP][:2]) / 2.0
    v = mid_hip - mid_shoulder
    n = np.linalg.norm(v)
    if n < 1e-6:
        return 0.0
    # Image y grows downward; vertical axis is (0, 1).
    cosang = float(np.dot(v, np.array([0.0, 1.0])) / n)
    cosang = max(-1.0, min(1.0, cosang))
    return float(np.degrees(np.arccos(cosang)))


def frame_features(lm: np.ndarray) -> dict[str, float]:
    """All per-frame features as a flat dict keyed by FEATURE_ORDER names."""
    feats = joint_angles(lm)
    feats["trunk_incline"] = trunk_incline(lm)
    return feats


def symmetry(feats: dict[str, float]) -> dict[str, float]:
    """Absolute left/right angle difference per joint pair (0 = symmetric)."""
    out: dict[str, float] = {}
    for left in JOINT_ANGLE_NAMES:
        if left.startswith("left_"):
            right = "right_" + left[len("left_") :]
            joint = left[len("left_") :]
            out[joint] = abs(feats[left] - feats[right])
    return out


def features_to_vector(feats: dict[str, float]) -> np.ndarray:
    """Flatten a feature dict into the canonical ordered vector."""
    return np.array([feats[name] for name in FEATURE_ORDER], dtype=np.float64)


def sequence_to_matrix(frames: list[np.ndarray]) -> np.ndarray:
    """Stack a list of landmark frames into a (T, n_features) feature matrix."""
    return np.stack([features_to_vector(frame_features(f)) for f in frames], axis=0)


def primary_angle_series(matrix: np.ndarray, primary_joint: str) -> np.ndarray:
    """The averaged left/right angle series for the exercise's primary joint."""
    left, right = PRIMARY_JOINT_FEATURES[primary_joint]
    li = FEATURE_ORDER.index(left)
    ri = FEATURE_ORDER.index(right)
    return (matrix[:, li] + matrix[:, ri]) / 2.0


def range_of_motion(angle_series: np.ndarray) -> float:
    """Peak-to-peak range of an angle series (degrees)."""
    if angle_series.size == 0:
        return 0.0
    return float(np.max(angle_series) - np.min(angle_series))


def velocity(angle_series: np.ndarray, fps: float) -> np.ndarray:
    """Angular velocity (deg/s) via central differences."""
    if angle_series.size < 2 or fps <= 0:
        return np.zeros_like(angle_series)
    return np.gradient(angle_series) * fps


def acceleration(angle_series: np.ndarray, fps: float) -> np.ndarray:
    """Angular acceleration (deg/s^2)."""
    return velocity(velocity(angle_series, fps), fps)


def time_normalize(matrix: np.ndarray, seq_len: int = 100) -> np.ndarray:
    """Resample a (T, F) matrix to (seq_len, F) via linear interpolation.

    Makes reps of different durations directly comparable sample-for-sample.
    """
    t_old = matrix.shape[0]
    if t_old == seq_len:
        return matrix.astype(np.float64)
    if t_old < 2:
        return np.repeat(matrix, seq_len, axis=0)[:seq_len].astype(np.float64)
    x_old = np.linspace(0.0, 1.0, t_old)
    x_new = np.linspace(0.0, 1.0, seq_len)
    out = np.empty((seq_len, matrix.shape[1]), dtype=np.float64)
    for c in range(matrix.shape[1]):
        out[:, c] = np.interp(x_new, x_old, matrix[:, c])
    return out
