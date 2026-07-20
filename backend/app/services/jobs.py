"""In-memory training job registry.

Training a reference profile takes minutes (pose estimation dominates), which is
far too long to hold an HTTP request open. Endpoints enqueue a job, return its
id immediately, and the client polls for progress.

Scope: this store lives in the process, so jobs are lost on restart and are not
shared across workers. That's fine for a single-worker dev/clinical deployment;
a multi-worker or restart-durable setup wants a jobs table or Redis/Celery.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

JobStatus = str  # "queued" | "running" | "done" | "failed"

MAX_JOBS = 50  # keep the most recent; training jobs are short-lived


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class TrainingJob:
    id: str
    exercise_id: int
    status: JobStatus = "queued"
    progress: int = 0
    message: str = "Queued"
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=_now)
    updated_at: datetime = field(default_factory=_now)

    def as_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.id,
            "exercise_id": self.exercise_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


_jobs: dict[str, TrainingJob] = {}
_lock = threading.Lock()


def create(exercise_id: int) -> TrainingJob:
    job = TrainingJob(id=uuid.uuid4().hex, exercise_id=exercise_id)
    with _lock:
        _jobs[job.id] = job
        # Trim oldest once we exceed the cap.
        if len(_jobs) > MAX_JOBS:
            oldest = sorted(_jobs.values(), key=lambda j: j.created_at)[
                : len(_jobs) - MAX_JOBS
            ]
            for old in oldest:
                _jobs.pop(old.id, None)
    return job


def get(job_id: str) -> Optional[TrainingJob]:
    with _lock:
        return _jobs.get(job_id)


def update(
    job_id: str,
    *,
    status: JobStatus | None = None,
    progress: int | None = None,
    message: str | None = None,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            return
        if status is not None:
            job.status = status
        if progress is not None:
            job.progress = max(0, min(100, progress))
        if message is not None:
            job.message = message
        if result is not None:
            job.result = result
        if error is not None:
            job.error = error
        job.updated_at = _now()
