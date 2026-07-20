"""Outbound mail.

Only the console backend exists today: tokens are logged instead of sent, which
keeps the full verification/reset flow exercisable locally with no provider
account. `send` is the single seam to implement for real delivery.
"""

from __future__ import annotations

import logging

from ..config import get_settings

log = logging.getLogger("physio.mail")


def send(to: str, subject: str, body: str) -> None:
    settings = get_settings()
    if settings.email_backend == "console":
        log.warning(
            "\n--- EMAIL (not sent; console backend) ---\n"
            "To:      %s\n"
            "Subject: %s\n\n%s\n"
            "----------------------------------------",
            to,
            subject,
            body,
        )
        return
    raise NotImplementedError(
        f"email_backend={settings.email_backend!r} is not implemented. "
        "Use 'console', or add a transport here."
    )


def send_verification(to: str, raw_token: str) -> None:
    url = f"{get_settings().frontend_url}/verify-email?token={raw_token}"
    send(
        to,
        "Verify your AI Physio account",
        f"Confirm your email address to activate your account:\n\n{url}\n",
    )


def send_password_reset(to: str, raw_token: str) -> None:
    url = f"{get_settings().frontend_url}/reset-password?token={raw_token}"
    send(
        to,
        "Reset your AI Physio password",
        f"Use the link below to choose a new password. It expires in 1 hour.\n\n{url}\n\n"
        "If you did not request this, you can ignore this email.\n",
    )
