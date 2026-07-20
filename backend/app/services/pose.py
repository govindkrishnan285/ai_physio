"""Server-side pose extraction: video file -> sequence of 33-landmark frames.

Uses OpenCV to decode frames and the MediaPipe **Tasks** PoseLandmarker (the
legacy `mediapipe.solutions` API was removed in MediaPipe 0.10.x). The model
asset is downloaded once and cached under the data directory.

Heavy deps are imported lazily so this module can be imported (and other
services unit-tested) without MediaPipe/OpenCV present.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path

import numpy as np

# Same family of models the browser uses. "full" balances speed and accuracy.
MODEL_URLS = {
    "lite": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
    "full": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
    "heavy": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task",
}
DEFAULT_MODEL = "full"


def ensure_model(variant: str = DEFAULT_MODEL) -> Path:
    """Return a local path to the .task model, downloading it once if needed."""
    from ..config import get_settings

    model_dir = get_settings().data_path / "pose-models"
    model_dir.mkdir(parents=True, exist_ok=True)
    dest = model_dir / f"pose_landmarker_{variant}.task"

    if not dest.exists() or dest.stat().st_size == 0:
        urllib.request.urlretrieve(MODEL_URLS[variant], dest)
    return dest


def extract_pose_from_video(
    video_path: str,
    *,
    max_frames: int = 900,
    min_detection_confidence: float = 0.5,
    model: str = DEFAULT_MODEL,
) -> tuple[list[np.ndarray], float]:
    """Return (frames, fps).

    ``frames`` is a list of (33, 4) arrays [x, y, z, visibility] in normalized
    image coordinates. Frames with no detected pose are skipped. If the video
    has more frames than ``max_frames`` (and max_frames > 0), frames are
    uniformly subsampled so timing/velocity stay proportionally correct.
    """
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    stride = 1
    if max_frames > 0 and total > max_frames:
        stride = max(1, total // max_frames)
        fps = fps / stride  # subsampling lowers the effective frame rate

    options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(ensure_model(model))),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=min_detection_confidence,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_segmentation_masks=False,
    )

    frames: list[np.ndarray] = []
    try:
        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            idx = 0
            while True:
                ok, frame = cap.read()
                if not ok:
                    break
                if idx % stride == 0:
                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    # Timestamps must strictly increase in VIDEO mode.
                    timestamp_ms = int((idx / (fps * stride or 30.0)) * 1000)
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)

                    if result.pose_landmarks:
                        lm = np.array(
                            [
                                [p.x, p.y, p.z, getattr(p, "visibility", 1.0)]
                                for p in result.pose_landmarks[0]
                            ],
                            dtype=np.float64,
                        )
                        frames.append(lm)
                idx += 1
    finally:
        cap.release()

    return frames, float(fps)
