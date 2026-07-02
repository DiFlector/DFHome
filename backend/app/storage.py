"""Tiny key-value store backed by SQLite for mutable app settings (tokens).

Kept intentionally simple (no ORM) since there's exactly one row of settings.
"""
import asyncio
import os

import aiosqlite

from app.config import settings

_KEYS = ("yandex_oauth_token", "quasar_x_token")

_lock = asyncio.Lock()
_initialized = False


async def _ensure_db() -> None:
    global _initialized
    if _initialized:
        return
    async with _lock:
        if _initialized:
            return
        os.makedirs(os.path.dirname(settings.database_path) or ".", exist_ok=True)
        async with aiosqlite.connect(settings.database_path) as db:
            await db.execute(
                "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)"
            )
            await db.commit()
            # Seed from environment on first boot, without overwriting
            # anything the user has already saved through the UI.
            for key in _KEYS:
                cur = await db.execute(
                    "SELECT 1 FROM app_settings WHERE key = ?", (key,)
                )
                row = await cur.fetchone()
                if row is None:
                    seed_value = getattr(settings, key, None)
                    if seed_value:
                        await db.execute(
                            "INSERT INTO app_settings (key, value) VALUES (?, ?)",
                            (key, seed_value),
                        )
            await db.commit()
        _initialized = True


async def get_all() -> dict[str, str | None]:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute("SELECT key, value FROM app_settings")
        rows = await cur.fetchall()
    values: dict[str, str | None] = {key: None for key in _KEYS}
    values.update({key: value for key, value in rows})
    return values


async def get(key: str) -> str | None:
    if key not in _KEYS:
        raise KeyError(key)
    values = await get_all()
    return values.get(key)


async def set_values(values: dict[str, str | None]) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        for key, value in values.items():
            if key not in _KEYS:
                continue
            if value is None:
                await db.execute("DELETE FROM app_settings WHERE key = ?", (key,))
            else:
                await db.execute(
                    "INSERT INTO app_settings (key, value) VALUES (?, ?) "
                    "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                    (key, value),
                )
        await db.commit()
