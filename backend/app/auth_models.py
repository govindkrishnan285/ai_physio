"""Identity, roles, and clinical profiles.

Kept separate from `models.py` so the pre-existing clinical tables (exercise,
referenceprofile and friends) stay untouched. New tables use UUID primary keys;
`exercise` and `referenceprofile` deliberately keep their integer PKs because
trained ReferenceProfile rows and on-disk model paths already reference them.
"""

# NOTE: deliberately no `from __future__ import annotations` here. PEP 563
# stringifies every annotation, which stops SQLModel resolving Relationship
# targets ("seems to be using a generic class as the argument to
# relationship()"). models.py omits it for the same reason.

import uuid
from datetime import date as date_type
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Role(str, Enum):
    patient = "patient"
    therapist = "therapist"
    admin = "admin"


class User(SQLModel, table=True):
    """A login identity. Exactly one row per person, whatever their role."""

    id: uuid.UUID = Field(default_factory=_uuid, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    full_name: str = ""
    role: Role = Field(default=Role.patient, index=True)

    is_active: bool = True
    is_verified: bool = False

    created_at: datetime = Field(default_factory=_now)
    last_login_at: Optional[datetime] = None

    patient_profile: Optional["PatientProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )
    therapist_profile: Optional["TherapistProfile"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "uselist": False},
    )


class TherapistProfile(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=_uuid, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)

    specialization: str = ""
    license_number: str = ""
    years_experience: Optional[int] = None
    bio: str = ""

    created_at: datetime = Field(default_factory=_now)

    user: Optional[User] = Relationship(back_populates="therapist_profile")
    patients: list["PatientProfile"] = Relationship(back_populates="therapist")


class PatientProfile(SQLModel, table=True):
    """Clinical profile for a patient, including their assigned therapist."""

    id: uuid.UUID = Field(default_factory=_uuid, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)

    # Assigned therapist. Nullable: a patient can register before assignment,
    # and must survive their therapist's account being removed.
    therapist_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="therapistprofile.id", index=True
    )

    # --- Personal ---
    date_of_birth: Optional[date_type] = None
    phone: str = ""
    # Free text rather than an enum; clinical intake shouldn't be forced into
    # a fixed vocabulary at this stage.
    gender: str = ""

    # --- Injury / rehabilitation ---
    injury_type: str = ""
    injury_date: Optional[date_type] = None
    injury_notes: str = ""
    # e.g. "acute", "subacute", "strengthening", "return-to-sport", "maintenance"
    recovery_stage: str = "acute"
    # Current program as structured data: exercise ids, sets, frequency.
    current_program: dict = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

    user: Optional[User] = Relationship(back_populates="patient_profile")
    therapist: Optional[TherapistProfile] = Relationship(back_populates="patients")


class TokenPurpose(str, Enum):
    email_verify = "email_verify"
    password_reset = "password_reset"


class AuthToken(SQLModel, table=True):
    """Single-use token for email verification and password reset.

    Stored hashed. The raw token only ever exists in the delivery channel (the
    log, for now), so a database read cannot be replayed into an account
    takeover.
    """

    id: uuid.UUID = Field(default_factory=_uuid, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(index=True, unique=True)
    purpose: TokenPurpose
    expires_at: datetime
    used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)
