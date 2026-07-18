"""Default exercise definitions, mirroring the frontend exerciseConfig."""

from __future__ import annotations

from sqlmodel import Session, select

from .models import Exercise

# (name, category, primary_joint, direction, rest, work, rom_min, rom_max, instructions)
SEED_EXERCISES = [
    ("ACL Rehabilitation", "Knee", "knee", "flexion", 160, 130, 80, 110,
     "Slowly bend both knees into a controlled squat, then return to standing."),
    ("Meniscus Rehabilitation", "Knee", "knee", "flexion", 160, 140, 110, 140,
     "Perform a shallow, pain-free knee bend, keeping the motion slow and controlled."),
    ("Shoulder Abduction", "Shoulder", "shoulder", "extension", 30, 60, 80, 160,
     "Raise both arms out to the side, up to shoulder height or above."),
    ("Rotator Cuff Rehab", "Shoulder", "shoulder", "extension", 20, 45, 60, 100,
     "Rotate and raise the arm slowly, keeping the elbow close and stable."),
    ("Stroke Rehabilitation", "Neurological", "elbow", "extension", 90, 120, 150, 180,
     "Reach forward slowly, straightening the elbow, then return with control."),
    ("Low Back Pain", "Spine", "hip", "flexion", 165, 140, 100, 140,
     "Hinge slowly forward at the hips, keeping the back straight, then return to upright."),
    ("Squat Assessment", "Assessment", "knee", "flexion", 160, 120, 70, 100,
     "Perform a full-depth squat for assessment."),
    ("Lunge Assessment", "Assessment", "knee", "flexion", 160, 130, 80, 110,
     "Step into a lunge, bending both knees, then return to standing."),
]


def ensure_seed(session: Session) -> None:
    existing = session.exec(select(Exercise)).first()
    if existing is not None:
        return
    for row in SEED_EXERCISES:
        session.add(
            Exercise(
                name=row[0],
                category=row[1],
                primary_joint=row[2],
                direction=row[3],
                rest_threshold=float(row[4]),
                work_threshold=float(row[5]),
                target_rom_min=float(row[6]),
                target_rom_max=float(row[7]),
                instructions=row[8],
            )
        )
    session.commit()
