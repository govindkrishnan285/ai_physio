"""Shared FastAPI dependencies: current user resolution and role gating."""

from __future__ import annotations

import uuid
from typing import Annotated, Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .auth_models import PatientProfile, Role, TherapistProfile, User
from .db import get_session
from .services.security import decode_token

# auto_error=False so a missing header produces our 401 with a clear message
# rather than FastAPI's bare "Not authenticated".
_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_session)],
) -> User:
    if creds is None:
        raise _CREDENTIALS_ERROR
    try:
        payload = decode_token(creds.credentials, expect="access")
        user_id = uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR

    user = db.get(User, user_id)
    if user is None:
        raise _CREDENTIALS_ERROR
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], User]:
    """Dependency factory gating an endpoint to the given roles."""

    def _check(user: CurrentUser) -> User:
        if user.role not in roles:
            # 403 not 404: the caller is authenticated, just not permitted.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have access to this resource.",
            )
        return user

    return _check


require_admin = require_roles(Role.admin)
require_therapist = require_roles(Role.therapist, Role.admin)


def get_current_patient_profile(
    user: CurrentUser,
    db: Annotated[Session, Depends(get_session)],
) -> PatientProfile:
    """The calling patient's own profile. Patients only ever see their own data."""
    profile = db.exec(
        select(PatientProfile).where(PatientProfile.user_id == user.id)
    ).first()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No patient profile exists for this account.",
        )
    return profile


def assert_can_view_patient(
    viewer: User, patient: PatientProfile, db: Session
) -> None:
    """Authorization check for reading one patient's clinical data.

    Admins see everyone; patients see only themselves; therapists see only the
    patients assigned to them. Raises 403 otherwise.
    """
    if viewer.role == Role.admin:
        return
    if viewer.role == Role.patient:
        if patient.user_id == viewer.id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own records.",
        )
    if viewer.role == Role.therapist:
        tp = db.exec(
            select(TherapistProfile).where(TherapistProfile.user_id == viewer.id)
        ).first()
        if tp is not None and patient.therapist_id == tp.id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This patient is not assigned to you.",
        )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Your role does not have access to this resource.",
    )
