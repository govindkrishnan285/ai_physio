"""Request/response models for the auth and profile endpoints."""

from __future__ import annotations

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from .auth_models import Role

# Long enough to resist guessing, short enough to stay inside bcrypt's 72-byte
# limit once encoded.
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 72


class _PasswordMixin(BaseModel):
    password: str = Field(min_length=MIN_PASSWORD_LEN, max_length=MAX_PASSWORD_LEN)

    @field_validator("password")
    @classmethod
    def _not_all_one_class(cls, v: str) -> str:
        if v.isdigit() or v.isalpha():
            raise ValueError(
                "Password must mix letters with digits or symbols."
            )
        if len(v.encode("utf-8")) > MAX_PASSWORD_LEN:
            raise ValueError("Password must be at most 72 bytes.")
        return v


class RegisterInput(_PasswordMixin):
    email: EmailStr
    full_name: str = ""
    # Self-registration is limited to patient and therapist. Admins are created
    # by another admin or the bootstrap CLI, never through the public endpoint.
    role: Role = Role.patient

    @field_validator("role")
    @classmethod
    def _no_self_admin(cls, v: Role) -> Role:
        if v == Role.admin:
            raise ValueError("Administrator accounts cannot be self-registered.")
        return v


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshInput(BaseModel):
    refresh_token: str


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(_PasswordMixin):
    token: str


class VerifyEmailInput(BaseModel):
    token: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PatientProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    therapist_id: Optional[uuid.UUID] = None
    date_of_birth: Optional[date_type] = None
    phone: str
    gender: str
    injury_type: str
    injury_date: Optional[date_type] = None
    injury_notes: str
    recovery_stage: str
    current_program: dict

    model_config = {"from_attributes": True}


class PatientProfileUpdate(BaseModel):
    """All-optional: any subset of fields may be patched."""

    date_of_birth: Optional[date_type] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    injury_type: Optional[str] = None
    injury_date: Optional[date_type] = None
    injury_notes: Optional[str] = None
    recovery_stage: Optional[str] = None
    current_program: Optional[dict] = None


class TherapistProfileOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    specialization: str
    license_number: str
    years_experience: Optional[int] = None
    bio: str

    model_config = {"from_attributes": True}


class MeOut(BaseModel):
    """Everything the frontend needs to route and render after login."""

    user: UserOut
    patient_profile: Optional[PatientProfileOut] = None
    therapist_profile: Optional[TherapistProfileOut] = None
