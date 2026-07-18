from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Exercises
# ---------------------------------------------------------------------------
class ExerciseOut(BaseModel):
    id: int
    name: str
    category: str
    primary_joint: str
    direction: str
    rest_threshold: float
    work_threshold: float
    target_rom_min: float
    target_rom_max: float
    instructions: str
    has_profile: bool = False
    has_reference_video: bool = False


# ---------------------------------------------------------------------------
# Reference-video training
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    youtube_urls: list[str] = Field(default_factory=list)
    train_tf: bool = False


class TrainResult(BaseModel):
    exercise_id: int
    n_reps: int
    n_videos: int
    feature_names: list[str]
    seq_len: int
    tf_trained: bool
    ml_threshold: Optional[float] = None
    message: str


class ProfileOut(BaseModel):
    exercise_id: int
    n_reps: int
    seq_len: int
    feature_names: list[str]
    source: str
    has_tf: bool


class ReferenceVideoOut(BaseModel):
    exercise_id: int
    url: str
    start_sec: Optional[float] = None
    end_sec: Optional[float] = None


# ---------------------------------------------------------------------------
# Live rep analysis
# ---------------------------------------------------------------------------
# One frame = 33 landmarks, each [x, y, z, visibility].
Frame = list[list[float]]


class AnalyzeRepRequest(BaseModel):
    exercise_id: int
    fps: float = 30.0
    frames: list[Frame]


class FeedbackCue(BaseModel):
    text: str
    severity: str


class AnalyzeRepResponse(BaseModel):
    exercise_name: str
    phase: str = "rep"
    accuracy: float
    avg_deviation: float
    rom: float
    peak_angle: float
    in_range: bool
    errors: list[dict]
    feedback: list[FeedbackCue]
    tempo: str
    peak_velocity: float
    ml_anomaly: Optional[float] = None
    ml_flagged: Optional[bool] = None


# ---------------------------------------------------------------------------
# Sessions (authoritative rehabilitation records)
# ---------------------------------------------------------------------------
class JointSampleIn(BaseModel):
    timestamp: float = 0.0
    knee_angle: Optional[float] = None
    hip_angle: Optional[float] = None
    shoulder_angle: Optional[float] = None
    elbow_angle: Optional[float] = None
    ankle_angle: Optional[float] = None


class FeedbackIn(BaseModel):
    timestamp: float = 0.0
    feedback: str
    severity: str = "info"


class SessionCreate(BaseModel):
    patient_id: str = "default"
    exercise: str
    exercise_id: Optional[int] = None
    duration_seconds: int = 0
    repetitions: int = 0
    accuracy: float = 0.0
    average_rom: Optional[float] = None
    maximum_rom: Optional[float] = None
    minimum_rom: Optional[float] = None
    calories: Optional[float] = None
    pain_score: Optional[int] = None
    status: str = "completed"

    average_knee_angle: Optional[float] = None
    average_hip_angle: Optional[float] = None
    average_shoulder_angle: Optional[float] = None
    average_elbow_angle: Optional[float] = None
    average_ankle_angle: Optional[float] = None
    quality_score: Optional[float] = None
    posture_mistakes: list[str] = Field(default_factory=list)
    fps: Optional[float] = None
    model_confidence: Optional[float] = None

    start_time: Optional[str] = None  # ISO 8601; server defaults to now
    end_time: Optional[str] = None

    joints: list[JointSampleIn] = Field(default_factory=list)
    feedback: list[FeedbackIn] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: int
    patient_id: str
    exercise: str
    date: str
    start_time: str
    duration_seconds: int
    repetitions: int
    accuracy: float
    average_rom: Optional[float] = None
    maximum_rom: Optional[float] = None
    calories: float
    pain_score: Optional[int] = None
    quality_score: Optional[float] = None
    status: str


class SessionListResponse(BaseModel):
    items: list[SessionSummary]
    total: int
    limit: int
    offset: int


class JointSampleOut(JointSampleIn):
    pass


class FeedbackOut(BaseModel):
    timestamp: float
    feedback: str
    severity: str


class SessionDetail(SessionSummary):
    exercise_id: Optional[int] = None
    end_time: Optional[str] = None
    minimum_rom: Optional[float] = None
    average_knee_angle: Optional[float] = None
    average_hip_angle: Optional[float] = None
    average_shoulder_angle: Optional[float] = None
    average_elbow_angle: Optional[float] = None
    average_ankle_angle: Optional[float] = None
    model_confidence: Optional[float] = None
    fps: Optional[float] = None
    posture_mistakes: list[str] = Field(default_factory=list)
    joints: list[JointSampleOut] = Field(default_factory=list)
    feedback: list[FeedbackOut] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
class ProgressResponse(BaseModel):
    session_count: int
    total_repetitions: int
    total_calories: float
    average_duration_seconds: float
    weekly_accuracy: list[dict]
    monthly_improvement: list[dict]
    rom_trend: list[dict]
    exercise_frequency: list[dict]
    pain_trend: list[dict]


class ReportItem(BaseModel):
    id: int
    exercise: str
    date: str
    duration_minutes: int
    repetitions: int
    average_rom: Optional[float] = None
    accuracy: float
    quality_score: Optional[float] = None
    feedback: list[str] = Field(default_factory=list)


class ReportsResponse(BaseModel):
    items: list[ReportItem]
    total: int


class RecommendationOut(BaseModel):
    exercise_id: int
    exercise_name: str
    reason: str
    priority: int
