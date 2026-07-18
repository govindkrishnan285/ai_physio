"""Repetition segmentation from a primary-joint angle series.

Same state-machine logic as the frontend useRepCounter, used here to (a) cut a
reference video into individual reps for template building, and (b) drive live
rep counting on the analysis endpoint.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class RepSpan:
    start: int
    end: int
    peak_angle: float
    peak_index: int


def segment_reps(
    angle_series: np.ndarray,
    direction: str,
    rest_threshold: float,
    work_threshold: float,
) -> list[RepSpan]:
    """Split an angle series into rep spans (offline, whole-series)."""
    is_flexion = direction == "flexion"
    spans: list[RepSpan] = []

    phase = "rest"
    start = 0
    peak = angle_series[0] if angle_series.size else 0.0
    peak_idx = 0

    for i, angle in enumerate(angle_series):
        entered_work = angle < work_threshold if is_flexion else angle > work_threshold
        back_to_rest = angle > rest_threshold if is_flexion else angle < rest_threshold

        if phase == "rest":
            if entered_work:
                phase = "working"
                start = i
                peak = angle
                peak_idx = i
        else:  # working
            better = angle < peak if is_flexion else angle > peak
            if better:
                peak = angle
                peak_idx = i
            if back_to_rest:
                spans.append(RepSpan(start=start, end=i, peak_angle=float(peak), peak_index=peak_idx))
                phase = "rest"

    return spans


@dataclass
class LiveRepCounter:
    """Incremental rep counter for the live analysis endpoint."""

    direction: str
    rest_threshold: float
    work_threshold: float
    target_min: float
    target_max: float

    reps: int = 0
    good_reps: int = 0
    phase: str = "rest"
    _peak: float | None = None
    best_rom: float | None = None
    _rest_angle: float | None = None
    last_rep_in_range: bool | None = field(default=None)

    def update(self, angle: float) -> dict:
        """Feed one primary-joint angle sample; returns current counter state."""
        is_flexion = self.direction == "flexion"
        entered_work = angle < self.work_threshold if is_flexion else angle > self.work_threshold
        back_to_rest = angle > self.rest_threshold if is_flexion else angle < self.rest_threshold
        completed = False

        if self.phase == "rest":
            self._rest_angle = angle
            if entered_work:
                self.phase = "working"
                self._peak = angle
        else:
            if self._peak is None:
                self._peak = angle
            elif (angle < self._peak) if is_flexion else (angle > self._peak):
                self._peak = angle

            if back_to_rest:
                peak = self._peak if self._peak is not None else angle
                in_range = self.target_min <= peak <= self.target_max
                rom = abs((self._rest_angle if self._rest_angle is not None else angle) - peak)

                self.reps += 1
                if in_range:
                    self.good_reps += 1
                self.last_rep_in_range = in_range
                self.best_rom = rom if self.best_rom is None else max(self.best_rom, rom)
                self.phase = "rest"
                self._peak = None
                completed = True

        return {
            "reps": self.reps,
            "phase": self.phase,
            "accuracy": round(100 * self.good_reps / self.reps) if self.reps else 0,
            "peak_angle": self._peak,
            "best_rom": self.best_rom,
            "last_rep_in_range": self.last_rep_in_range,
            "rep_completed": completed,
        }
