from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://physio:physio@localhost:5432/physio"
    data_dir: str = "./data"
    cors_origins: str = "http://localhost:3000"
    max_frames_per_video: int = 900
    enable_tf: bool = False

    # --- Auth ---
    # Dev default only. Startup refuses to serve with this value unless
    # `dev_mode` is on, so a deployment cannot silently sign tokens with it.
    jwt_secret: str = "dev-insecure-change-me"
    access_token_minutes: int = 30
    refresh_token_days: int = 14
    dev_mode: bool = True
    # Where password-reset / verification links should point (the frontend).
    frontend_url: str = "http://localhost:3000"
    # "console" logs tokens instead of sending mail. Swap for a real transport.
    email_backend: str = "console"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache
def get_settings() -> Settings:
    return Settings()
