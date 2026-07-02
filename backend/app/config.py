"""Application configuration.

Values can be seeded via environment variables (see .env.example) but the
authoritative, mutable copy lives in SQLite (see storage.py) so the user can
change tokens from the Settings page without restarting the container.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Path to the SQLite database file holding mutable settings (tokens).
    database_path: str = "/data/dfhome.db"

    # Optional seed values. Only used to pre-populate the database on first
    # boot; after that, the Settings page / API is the source of truth.
    yandex_oauth_token: str | None = None
    # Durable secret for the unofficial quasar API, obtained once by exchanging
    # a pasted browser cookie (see routers/settings.py quasar-login endpoint).
    # Short-lived session cookies/CSRF are derived from this at runtime and
    # are never persisted (see yandex/quasar_session.py).
    quasar_x_token: str | None = None

    # CORS origins allowed to talk to the API directly (useful for local dev
    # of the frontend outside docker-compose).
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8080"]


settings = Settings()
