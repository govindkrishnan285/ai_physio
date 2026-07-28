"""Therapist and administrator endpoints.

Therapist: roster of assigned patients + a per-patient clinical summary.
Admin: user management and assigning therapists to patients (the assignment is
what makes a patient visible to a therapist at all).
"""

from __future__ import annotations

import uuid
from datetime import date as date_type
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, func, select

from ..auth_models import PatientProfile, Role, TherapistProfile, User
from ..db import get_session
from ..deps import CurrentUser, require_admin, require_therapist
from ..models import RehabSession

router = APIRouter(tags=["staff"])

DbSession = Annotated[Session, Depends(get_session)]


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class PatientRosterItem(BaseModel):
    patient_profile_id: uuid.UUID
    name: str
    email: EmailStr
    injury_type: str
    recovery_stage: str
    session_count: int
    last_session_date: Optional[date_type] = None
    avg_accuracy: Optional[float] = None


class UserAdminItem(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    is_verified: bool
    # For patients: their assigned therapist, if any.
    patient_profile_id: Optional[uuid.UUID] = None
    therapist_id: Optional[uuid.UUID] = None


class TherapistOption(BaseModel):
    therapist_id: uuid.UUID
    name: str
    email: EmailStr
    patient_count: int


class AssignInput(BaseModel):
    # null clears the assignment.
    therapist_id: Optional[uuid.UUID] = None


class AdminOverview(BaseModel):
    total_users: int
    patients: int
    therapists: int
    admins: int
    unassigned_patients: int
    total_sessions: int


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _patient_summary(db: Session, profile: PatientProfile) -> PatientRosterItem:
    user = db.get(User, profile.user_id)
    rows = db.exec(
        select(RehabSession).where(RehabSession.patient_profile_id == profile.id)
    ).all()
    accs = [r.accuracy for r in rows if r.accuracy is not None]
    last = max((r.date for r in rows), default=None)
    return PatientRosterItem(
        patient_profile_id=profile.id,
        name=(user.full_name if user else "") or (user.email if user else ""),
        email=user.email if user else "unknown@unknown",
        injury_type=profile.injury_type,
        recovery_stage=profile.recovery_stage,
        session_count=len(rows),
        last_session_date=last,
        avg_accuracy=round(sum(accs) / len(accs), 1) if accs else None,
    )


# --------------------------------------------------------------------------- #
# Therapist
# --------------------------------------------------------------------------- #
@router.get(
    "/therapist/patients",
    response_model=list[PatientRosterItem],
    dependencies=[Depends(require_therapist)],
)
def my_patients(user: CurrentUser, db: DbSession) -> list[PatientRosterItem]:
    """Patients assigned to the calling therapist (all patients for an admin)."""
    if user.role == Role.admin:
        profiles = db.exec(select(PatientProfile)).all()
    else:
        tp = db.exec(
            select(TherapistProfile).where(TherapistProfile.user_id == user.id)
        ).first()
        if tp is None:
            return []
        profiles = db.exec(
            select(PatientProfile).where(PatientProfile.therapist_id == tp.id)
        ).all()
    return [_patient_summary(db, p) for p in profiles]


# --------------------------------------------------------------------------- #
# Admin
# --------------------------------------------------------------------------- #
@router.get(
    "/admin/overview",
    response_model=AdminOverview,
    dependencies=[Depends(require_admin)],
)
def admin_overview(db: DbSession) -> AdminOverview:
    def count(stmt) -> int:
        return int(db.exec(stmt).one())

    by_role = {
        r: count(select(func.count()).select_from(User).where(User.role == r))
        for r in (Role.patient, Role.therapist, Role.admin)
    }
    unassigned = count(
        select(func.count())
        .select_from(PatientProfile)
        .where(PatientProfile.therapist_id.is_(None))  # type: ignore[union-attr]
    )
    return AdminOverview(
        total_users=count(select(func.count()).select_from(User)),
        patients=by_role[Role.patient],
        therapists=by_role[Role.therapist],
        admins=by_role[Role.admin],
        unassigned_patients=unassigned,
        total_sessions=count(select(func.count()).select_from(RehabSession)),
    )


@router.get(
    "/admin/users",
    response_model=list[UserAdminItem],
    dependencies=[Depends(require_admin)],
)
def list_users(db: DbSession) -> list[UserAdminItem]:
    users = db.exec(select(User).order_by(User.created_at)).all()
    # Preload patient profiles to attach assignment info.
    profiles = {p.user_id: p for p in db.exec(select(PatientProfile)).all()}
    out: list[UserAdminItem] = []
    for u in users:
        p = profiles.get(u.id)
        out.append(
            UserAdminItem(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                role=u.role,
                is_active=u.is_active,
                is_verified=u.is_verified,
                patient_profile_id=p.id if p else None,
                therapist_id=p.therapist_id if p else None,
            )
        )
    return out


@router.get(
    "/admin/therapists",
    response_model=list[TherapistOption],
    dependencies=[Depends(require_admin)],
)
def list_therapists(db: DbSession) -> list[TherapistOption]:
    out: list[TherapistOption] = []
    for tp in db.exec(select(TherapistProfile)).all():
        u = db.get(User, tp.user_id)
        n = int(
            db.exec(
                select(func.count())
                .select_from(PatientProfile)
                .where(PatientProfile.therapist_id == tp.id)
            ).one()
        )
        out.append(
            TherapistOption(
                therapist_id=tp.id,
                name=(u.full_name if u else "") or (u.email if u else ""),
                email=u.email if u else "unknown@unknown",
                patient_count=n,
            )
        )
    return out


@router.patch(
    "/admin/patients/{patient_profile_id}/assign",
    response_model=UserAdminItem,
    dependencies=[Depends(require_admin)],
)
def assign_therapist(
    patient_profile_id: uuid.UUID, body: AssignInput, db: DbSession
) -> UserAdminItem:
    profile = db.get(PatientProfile, patient_profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    if body.therapist_id is not None:
        tp = db.get(TherapistProfile, body.therapist_id)
        if tp is None:
            raise HTTPException(status_code=404, detail="Therapist not found.")

    profile.therapist_id = body.therapist_id
    db.add(profile)
    db.commit()
    db.refresh(profile)

    u = db.get(User, profile.user_id)
    return UserAdminItem(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        role=u.role,
        is_active=u.is_active,
        is_verified=u.is_verified,
        patient_profile_id=profile.id,
        therapist_id=profile.therapist_id,
    )
