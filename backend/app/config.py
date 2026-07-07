"""Application configuration for the DFHome core.

Values can be seeded via environment variables but the authoritative, mutable
copy of user settings lives in SQLite (see core/storage.py). The core itself is
vendor- and protocol-agnostic; everything device-specific lives in integrations.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Persistent data directory (SQLite DB + installed integrations). This is a
    # Docker volume in container mode and the working dir in standalone mode.
    data_dir: str = "/data"

    # Directory holding bundled integration sources that can be installed
    # locally without network access (the "local directory" install source).
    bundled_integrations_dir: str = "available_integrations"

    # Remote curated store index (HACS model). When unreachable, the core falls
    # back to the bundled app/store_index.json.
    store_index_url: str | None = None

    # CORS origins allowed to call the API directly (frontend dev outside docker).
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:1285",
    ]

    @property
    def database_path(self) -> str:
        return str(Path(self.data_dir) / "dfhome.db")

    @property
    def integrations_dir(self) -> str:
        """Where installed integrations live on disk."""
        return str(Path(self.data_dir) / "integrations")


settings = Settings()
