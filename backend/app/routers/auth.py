"""Authentication: registration, login, refresh, verification, password reset."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..auth_models import AuthToken, PatientProfile, Role, TherapistProfile, TokenPurpose, User
from ..auth_schemas import (
    ForgotPasswordInput,
    LoginInput,
    MeOut,
    RefreshInput,
    RegisterInput,
    ResetPasswordInput,
    TokenPair,
    UserOut,
    VerifyEmailInput,
)
from ..db import get_session
from ..deps import CurrentUser
from ..services import mailer
from ..services.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_one_time_token,
    hash_one_time_token,
    hash_password,
    verify_password,
)

log = logging.getLogger("physio.auth")

router = APIRouter(prefix="/auth", tags=["auth"])

VERIFY_TOKEN_TTL = timedelta(days=2)
RESET_TOKEN_TTL = timedelta(hours=1)

DbSession = Annotated[Session, Depends(get_session)]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _issue_one_time_token(
    db: Session, user: User, purpose: TokenPurpose, ttl: timedelta
) -> str:
    """Create a single-use token, invalidating any outstanding one of its kind."""
    outstanding = db.exec(
        select(AuthToken).where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for old in outstanding:
        old.used_at = _now()
        db.add(old)

    raw, token_hash = generate_one_time_token()
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=token_hash,
            purpose=purpose,
            expires_at=_now() + ttl,
        )
    )
    return raw


def _consume_one_time_token(
    db: Session, raw: str, purpose: TokenPurpose
) -> User:
    row = db.exec(
        select(AuthToken).where(
            AuthToken.token_hash == hash_one_time_token(raw),
            AuthToken.purpose == purpose,
        )
    ).first()

    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This link is invalid or has already been used.",
    )
    if row is None or row.used_at is not None:
        raise invalid
    # Stored naive by some drivers; normalize before comparing.
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < _now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This link has expired. Please request a new one.",
        )

    user = db.get(User, row.user_id)
    if user is None:
        raise invalid

    row.used_at = _now()
    db.add(row)
    return user


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterInput, db: DbSession) -> User:
    email = payload.email.lower().strip()
    if db.exec(select(User).where(User.email == email)).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        role=payload.role,
    )
    db.add(user)
    db.flush()  # assign user.id before building the dependent profile

    # Every user gets the profile row matching their role, so downstream code
    # never has to cope with a role/profile mismatch.
    if user.role == Role.patient:
        db.add(PatientProfile(user_id=user.id))
    elif user.role == Role.therapist:
        db.add(TherapistProfile(user_id=user.id))

    raw = _issue_one_time_token(db, user, TokenPurpose.email_verify, VERIFY_TOKEN_TTL)
    db.commit()
    db.refresh(user)

    mailer.send_verification(user.email, raw)
    return user


@router.post("/login", response_model=TokenPair)
def login(payload: LoginInput, db: DbSession) -> TokenPair:
    email = payload.email.lower().strip()
    user = db.exec(select(User).where(User.email == email)).first()

    # Same error and roughly the same work for unknown-email and wrong-password
    # so the endpoint doesn't disclose which emails are registered.
    if user is None:
        verify_password(payload.password, hash_password("dummy-password-1"))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    user.last_login_at = _now()
    db.add(user)
    db.commit()

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshInput, db: DbSession) -> TokenPair:
    try:
        claims = decode_token(payload.refresh_token, expect="refresh")
        import uuid as _uuid

        user_id = _uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    return TokenPair(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/verify-email", response_model=UserOut)
def verify_email(payload: VerifyEmailInput, db: DbSession) -> User:
    user = _consume_one_time_token(db, payload.token, TokenPurpose.email_verify)
    user.is_verified = True
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(user: CurrentUser, db: DbSession) -> dict:
    if user.is_verified:
        return {"detail": "This account is already verified."}
    raw = _issue_one_time_token(db, user, TokenPurpose.email_verify, VERIFY_TOKEN_TTL)
    db.commit()
    mailer.send_verification(user.email, raw)
    return {"detail": "Verification email sent."}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(payload: ForgotPasswordInput, db: DbSession) -> dict:
    email = payload.email.lower().strip()
    user = db.exec(select(User).where(User.email == email)).first()

    if user is not None:
        raw = _issue_one_time_token(
            db, user, TokenPurpose.password_reset, RESET_TOKEN_TTL
        )
        db.commit()
        mailer.send_password_reset(user.email, raw)
    else:
        log.info("Password reset requested for unregistered address: %s", email)

    # Always the same response: revealing which addresses exist would turn this
    # into an account-enumeration oracle.
    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(payload: ResetPasswordInput, db: DbSession) -> dict:
    user = _consume_one_time_token(db, payload.token, TokenPurpose.password_reset)
    user.hashed_password = hash_password(payload.password)
    # A successful reset proves control of the mailbox.
    user.is_verified = True
    db.add(user)
    db.commit()
    return {"detail": "Password updated. You can now sign in."}


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DbSession) -> MeOut:
    patient = db.exec(
        select(PatientProfile).where(PatientProfile.user_id == user.id)
    ).first()
    therapist = db.exec(
        select(TherapistProfile).where(TherapistProfile.user_id == user.id)
    ).first()
    return MeOut(
        user=UserOut.model_validate(user),
        patient_profile=patient,  # type: ignore[arg-type]
        therapist_profile=therapist,  # type: ignore[arg-type]
    )
