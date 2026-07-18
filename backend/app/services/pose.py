"""Server-side pose extraction: video file -> sequence of 33-landmark frames.

Uses OpenCV to decode frames and MediaPipe Pose to estimate landmarks. Both are
imported lazily so importing this module (e.g. for py_compile / unit tests of
other services) does not require the heavy native deps.
"""

from __future__ import annotations

import numpy as np


def extract_pose_from_video(
    video_path: str,
    *,
    max_frames: int = 900,
    min_detection_confidence: float = 0.5,
) -> tuple[list[np.ndarray], float]:
    """Return (frames, fps).

    ``frames`` is a list of (33, 4) arrays [x, y, z, visibility] in normalized
    image coordinates. Frames with no detected pose are skipped. If the video has
    more frames than ``max_frames`` (and max_frames > 0), frames are uniformly
    subsampled so timing/velocity stay proportionally correct.
    """
    import cv2
    import mediapipe as mp

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    stride = 1
    if max_frames > 0 and total > max_frames:
        stride = max(1, total // max_frames)
        fps = fps / stride  # subsampling lowers the effective frame rate

    frames: list[np.ndarray] = []
    mp_pose = mp.solutions.pose

    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        min_detection_confidence=min_detection_confidence,
        min_tracking_confidence=0.5,
    ) as pose:
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % stride == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = pose.process(rgb)
                if result.pose_landmarks:
                    lm = np.array(
                        [
                            [p.x, p.y, p.z, p.visibility]
                            for p in result.pose_landmarks.landmark
                        ],
                        dtype=np.float64,
                    )
                    frames.append(lm)
            idx += 1

    cap.release()
    return frames, float(fps)
