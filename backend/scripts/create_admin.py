"""Create (or promote) an administrator account.

Admins cannot be self-registered through the public API, so the first one has
to be made here.

    python -m scripts.create_admin --email you@example.com

The password is read from the ADMIN_PASSWORD environment variable, or prompted
for interactively. It is never accepted as a command-line argument, because
argv is visible to other processes and lands in shell history.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys

from sqlmodel import Session, select

from app.auth_models import Role, User
from app.db import engine, init_db
from app.services.security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or promote an admin user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    parser.add_argument(
        "--promote",
        action="store_true",
        help="If the account already exists, raise it to admin instead of failing.",
    )
    args = parser.parse_args()

    email = args.email.lower().strip()

    init_db()
    with Session(engine) as db:
        existing = db.exec(select(User).where(User.email == email)).first()

        if existing is not None:
            if not args.promote:
                print(
                    f"{email} already exists with role '{existing.role.value}'. "
                    "Re-run with --promote to make it an admin.",
                    file=sys.stderr,
                )
                return 1
            existing.role = Role.admin
            existing.is_verified = True
            db.add(existing)
            db.commit()
            print(f"Promoted {email} to admin.")
            return 0

        password = os.environ.get("ADMIN_PASSWORD")
        if not password:
            password = getpass.getpass("Password for the new admin: ")
            if password != getpass.getpass("Confirm password: "):
                print("Passwords did not match.", file=sys.stderr)
                return 1

        if len(password) < 8:
            print("Password must be at least 8 characters.", file=sys.stderr)
            return 1

        db.add(
            User(
                email=email,
                hashed_password=hash_password(password),
                full_name=args.name,
                role=Role.admin,
                # Created out-of-band by someone with server access; there is no
                # mailbox to confirm.
                is_verified=True,
            )
        )
        db.commit()
        print(f"Created admin {email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
