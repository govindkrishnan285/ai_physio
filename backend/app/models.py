import uuid
from datetime import date as date_type
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Exercise(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    category: str
    # Primary joint the rep state machine tracks, e.g. "knee" or "shoulder".
    primary_joint: str
    # "flexion" (worked angle is smaller) or "extension" (worked angle is larger).
    direction: str
    rest_threshold: float
    work_threshold: float
    target_rom_min: float
    target_rom_max: float
    instructions: str = ""
    created_at: datetime = Field(default_factory=_now)


class ReferenceProfile(SQLModel, table=True):
    """A learned movement template for one exercise, built from reference videos."""

    id: Optional[int] = Field(default=None, primary_key=True)
    exercise_id: int = Field(foreign_key="exercise.id", index=True)
    source: str = ""  # comma-joined YouTube URLs / filenames it was built from
    n_reps: int = 0  # how many reps were averaged into the template
    seq_len: int = 100  # time-normalized samples per rep
    feature_names: list = Field(default_factory=list, sa_column=Column(JSON))
    # 2D arrays [seq_len][n_features], stored as nested lists (JSON/JSONB).
    mean_trajectory: list = Field(default_factory=list, sa_column=Column(JSON))
    std_trajectory: list = Field(default_factory=list, sa_column=Column(JSON))
    # Reconstruction-error cutoff from the optional TF autoencoder (None if unused).
    ml_threshold: Optional[float] = None
    ml_model_path: Optional[str] = None
    # Curated reference clip for the side-by-side player, plus the active-exercise
    # window (seconds) detected by segmentation so the player loops only the
    # movement, skipping intro/talking/outro.
    reference_video_path: Optional[str] = None
    ref_start_sec: Optional[float] = None
    ref_end_sec: Optional[float] = None
    created_at: datetime = Field(default_factory=_now)


class RehabSession(SQLModel, table=True):
    """One completed rehabilitation session — the authoritative record.

    Stores both the clinical summary and the AI-quality signals that will later
    feed TensorFlow quality classification and recovery prediction.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    # --- Ownership / identity ---
    # The owning patient, resolved from the caller's token. Never accepted from
    # the request body: it previously was a client-supplied string, which let
    # any caller read or write any patient's data.
    #
    # Nullable because sessions recorded before authentication existed have no
    # owner. Those legacy rows are visible to admins only.
    patient_profile_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="patientprofile.id", index=True
    )

    # --- What & when ---
    exercise: str = Field(index=True)  # exercise name (denormalized for reads)
    exercise_id: Optional[int] = Field(default=None, foreign_key="exercise.id")
    date: date_type = Field(index=True, default_factory=lambda: _now().date())
    start_time: datetime = Field(default_factory=_now)
    end_time: Optional[datetime] = None
    duration_seconds: int = 0

    # --- Clinical summary ---
    repetitions: int = 0
    accuracy: float = 0.0
    average_rom: Optional[float] = None
    maximum_rom: Optional[float] = None
    minimum_rom: Optional[float] = None
    calories: float = 0.0
    pain_score: Optional[int] = None  # patient-reported 0..10
    status: str = "completed"

    # --- AI / biomechanical signals (for future ML training) ---
    average_knee_angle: Optional[float] = None
    average_hip_angle: Optional[float] = None
    average_shoulder_angle: Optional[float] = None
    average_elbow_angle: Optional[float] = None
    average_ankle_angle: Optional[float] = None
    quality_score: Optional[float] = None  # learned/DTW exercise-quality score
    posture_mistakes: list = Field(default_factory=list, sa_column=Column(JSON))
    fps: Optional[float] = None
    model_confidence: Optional[float] = None

    created_at: datetime = Field(default_factory=_now)

    # Children (cascade-deleted with the session).
    joints: list["JointMeasurement"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    feedback: list["ExerciseFeedback"] = Relationship(
        back_populates="session",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class JointMeasurement(SQLModel, table=True):
    """A time-sampled snapshot of joint angles during a session."""

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="rehabsession.id", index=True)
    timestamp: float = 0.0  # seconds since session start
    knee_angle: Optional[float] = None
    hip_angle: Optional[float] = None
    shoulder_angle: Optional[float] = None
    elbow_angle: Optional[float] = None
    ankle_angle: Optional[float] = None

    session: Optional[RehabSession] = Relationship(back_populates="joints")


class ExerciseFeedback(SQLModel, table=True):
    """A single corrective cue emitted during a session."""

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="rehabsession.id", index=True)
    timestamp: float = 0.0  # seconds since session start
    feedback: str = ""
    severity: str = "info"  # ok | minor | major | info

    session: Optional[RehabSession] = Relationship(back_populates="feedback")
