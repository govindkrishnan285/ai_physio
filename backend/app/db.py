from collections.abc import Generator

from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from .config import get_settings

# Columns added after the initial schema. create_all() never ALTERs existing
# tables, so we add these idempotently on startup (dev-friendly lightweight
# migration; use Alembic for production).
_ADDED_COLUMNS = {
    "referenceprofile": [
        ("reference_video_path", "VARCHAR"),
        ("ref_start_sec", "DOUBLE PRECISION"),
        ("ref_end_sec", "DOUBLE PRECISION"),
    ],
}

_settings = get_settings()

# SQLite (handy for local/demo runs) needs check_same_thread disabled because
# FastAPI runs sync endpoints across a threadpool. Postgres ignores this.
_connect_args = (
    {"check_same_thread": False}
    if _settings.database_url.startswith("sqlite")
    else {}
)

# echo=False keeps logs quiet; pool_pre_ping avoids stale-connection errors.
engine = create_engine(
    _settings.database_url,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args,
)


def init_db() -> None:
    """Create any missing tables.

    Alembic is the source of truth for schema changes (`alembic upgrade head`).
    This stays for first-run convenience on an empty database, but note the
    tension: a model change picked up here lands in the database WITHOUT a
    migration, and `alembic check` will then report drift. Add a migration for
    every model change rather than relying on this.
    """
    # Import models so their tables register on SQLModel.metadata before create_all.
    from . import auth_models, models  # noqa: F401

    SQLModel.metadata.create_all(engine)

    # Postgres supports ADD COLUMN IF NOT EXISTS; skip for SQLite.
    if _settings.database_url.startswith("postgresql"):
        with engine.begin() as conn:
            for table, cols in _ADDED_COLUMNS.items():
                for name, coltype in cols:
                    conn.execute(
                        text(
                            f"ALTER TABLE {table} "
                            f"ADD COLUMN IF NOT EXISTS {name} {coltype}"
                        )
                    )


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
