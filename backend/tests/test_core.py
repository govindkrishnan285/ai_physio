"""Runs the deterministic core (no MediaPipe/TF) on synthetic landmark data.

Run:  python -m tests.test_core   (from the backend/ directory)

Fabricates a "leg" whose knee flexes and extends over several reps, builds a
reference template, then scores (a) a faithful copy and (b) a shallow-range
attempt, asserting the engine rewards the good rep and flags the bad one.
"""

from __future__ import annotations

import numpy as np

from app.services import biomechanics as bio
from app.services import comparison as cmp_svc
from app.services import feedback as fb_svc
from app.services import reference as ref_svc
from app.services.reps import segment_reps


def make_leg_frame(knee_angle_deg: float) -> np.ndarray:
    """A minimal 33-landmark frame where the L/R knee bends to a given angle.

    Hip above knee above ankle; the ankle swings forward to set the knee angle.
    """
    lm = np.zeros((33, 4), dtype=np.float64)
    lm[:, 3] = 1.0  # full visibility

    # Vertical stack: shoulder, hip, knee (x=0.5). Ankle offset sets knee angle.
    for sh, hp, kn, an, ft in [
        (bio.L_SHOULDER, bio.L_HIP, bio.L_KNEE, bio.L_ANKLE, bio.L_FOOT),
        (bio.R_SHOULDER, bio.R_HIP, bio.R_KNEE, bio.R_ANKLE, bio.R_FOOT),
    ]:
        lm[sh] = [0.5, 0.20, 0.0, 1.0]
        lm[hp] = [0.5, 0.50, 0.0, 1.0]
        lm[kn] = [0.5, 0.70, 0.0, 1.0]
        # Knee angle = angle hip-knee-ankle. Thigh points up (knee->hip = +y up).
        theta = np.radians(180.0 - knee_angle_deg)
        ax = 0.5 + 0.20 * np.sin(theta)
        ay = 0.70 + 0.20 * np.cos(theta)
        lm[an] = [ax, ay, 0.0, 1.0]
        lm[ft] = [ax + 0.05, ay + 0.02, 0.0, 1.0]
    return lm


def make_rep_sequence(min_angle: float, reps: int = 4, frames_per_rep: int = 30):
    """Angle goes rest(170) -> min -> rest, repeated."""
    frames = []
    for _ in range(reps):
        half = frames_per_rep // 2
        down = np.linspace(170, min_angle, half)
        up = np.linspace(min_angle, 170, frames_per_rep - half)
        for a in np.concatenate([down, up]):
            frames.append(make_leg_frame(float(a)))
    return frames


def main() -> None:
    # --- Build reference from "correct" reps reaching ~90 deg knee flexion ---
    ref_frames = make_rep_sequence(min_angle=90, reps=4)
    ref_matrix = bio.sequence_to_matrix(ref_frames)

    primary = bio.primary_angle_series(ref_matrix, "knee")
    spans = segment_reps(primary, "flexion", rest_threshold=160, work_threshold=130)
    print(f"segmented reps in reference: {len(spans)}")
    assert len(spans) >= 3, "rep segmentation failed"

    profile = ref_svc.build_profile(
        [ref_matrix],
        primary_joint="knee",
        direction="flexion",
        rest_threshold=160,
        work_threshold=130,
    )
    print(f"template reps={profile.n_reps} seq_len={profile.seq_len} "
          f"features={len(profile.feature_names)}")

    # --- Score a faithful good rep ---
    good = bio.sequence_to_matrix(make_rep_sequence(min_angle=90, reps=1))
    good_res = cmp_svc.score_rep(
        good,
        mean_trajectory=profile.mean_trajectory,
        std_trajectory=profile.std_trajectory,
        primary_joint="knee",
        target_min=80,
        target_max=110,
        fps=30,
    )
    print(f"GOOD  accuracy={good_res['accuracy']} rom={good_res['rom']} "
          f"errors={len(good_res['errors'])}")

    # --- Score a shallow rep (only bends to 140 -> not enough flexion) ---
    bad = bio.sequence_to_matrix(make_rep_sequence(min_angle=140, reps=1))
    bad_res = cmp_svc.score_rep(
        bad,
        mean_trajectory=profile.mean_trajectory,
        std_trajectory=profile.std_trajectory,
        primary_joint="knee",
        target_min=80,
        target_max=110,
        fps=30,
    )
    print(f"BAD   accuracy={bad_res['accuracy']} rom={bad_res['rom']} "
          f"errors={len(bad_res['errors'])}")
    for cue in fb_svc.build_feedback(bad_res):
        print(f"   - [{cue['severity']}] {cue['text']}")

    assert good_res["accuracy"] > bad_res["accuracy"], "good should beat bad"
    assert good_res["accuracy"] >= 85, "faithful rep should score high"
    assert len(bad_res["errors"]) >= 1, "shallow rep should be flagged"
    print("\nALL CORE ASSERTIONS PASSED")


if __name__ == "__main__":
    main()
