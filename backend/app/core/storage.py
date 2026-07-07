"""Persistent storage for the DFHome core (SQLite in the data dir).

Holds only core-owned configuration: a small key-value table for core settings
and the frontend-owned JSON blobs (plan layout, dashboard widget arrangement),
plus tables tracking installed integrations, their config entries and custom
store repositories.

Integrations never touch this directly — they go through the IntegrationContext.
"""
import asyncio
import json
import os
from typing import Any

import aiosqlite

from app.config import settings

_lock = asyncio.Lock()
_initialized = False

# Core settings exposed on the Settings page (general hub options).
DEFAULT_SETTINGS: dict[str, Any] = {
    "hubName": "DFHome",
    "darkDefault": False,
    "localControl": True,
}


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
                "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)"
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS installed_integrations (
                    domain TEXT PRIMARY KEY,
                    version TEXT NOT NULL,
                    source TEXT,
                    pinned_ref TEXT,
                    manifest TEXT
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS config_entries (
                    domain TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                )
                """
            )
            await db.execute(
                """
                CREATE TABLE IF NOT EXISTS custom_repos (
                    url TEXT PRIMARY KEY,
                    added_at TEXT
                )
                """
            )
            await db.commit()
        _initialized = True


# ---------------------------------------------------------------------------
# Generic key-value helpers (used for plan layout, widgets, core settings)
# ---------------------------------------------------------------------------


async def kv_get(key: str) -> Any | None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute("SELECT value FROM kv WHERE key = ?", (key,))
        row = await cur.fetchone()
    if row is None:
        return None
    return json.loads(row[0])


async def kv_set(key: str, value: Any) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )
        await db.commit()


async def kv_delete(key: str) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute("DELETE FROM kv WHERE key = ?", (key,))
        await db.commit()


# ---------------------------------------------------------------------------
# Core settings
# ---------------------------------------------------------------------------


async def get_settings() -> dict[str, Any]:
    stored = await kv_get("core_settings") or {}
    return {**DEFAULT_SETTINGS, **stored}


async def update_settings(values: dict[str, Any]) -> dict[str, Any]:
    current = await get_settings()
    merged = {**current, **{k: v for k, v in values.items() if k in DEFAULT_SETTINGS}}
    await kv_set("core_settings", merged)
    return merged


# ---------------------------------------------------------------------------
# Installed integrations
# ---------------------------------------------------------------------------


async def list_installed() -> list[dict[str, Any]]:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute(
            "SELECT domain, version, source, pinned_ref, manifest "
            "FROM installed_integrations"
        )
        rows = await cur.fetchall()
    result = []
    for domain, version, source, pinned_ref, manifest in rows:
        result.append(
            {
                "domain": domain,
                "version": version,
                "source": source,
                "pinned_ref": pinned_ref,
                "manifest": json.loads(manifest) if manifest else {},
            }
        )
    return result


async def get_installed(domain: str) -> dict[str, Any] | None:
    for item in await list_installed():
        if item["domain"] == domain:
            return item
    return None


async def upsert_installed(
    domain: str,
    version: str,
    source: str | None,
    pinned_ref: str | None,
    manifest: dict[str, Any] | None,
) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute(
            """
            INSERT INTO installed_integrations (domain, version, source, pinned_ref, manifest)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(domain) DO UPDATE SET
                version = excluded.version,
                source = excluded.source,
                pinned_ref = excluded.pinned_ref,
                manifest = excluded.manifest
            """,
            (domain, version, source, pinned_ref, json.dumps(manifest or {})),
        )
        await db.commit()


async def remove_installed(domain: str) -> None:
    """Remove an integration record and its config entry (full, clean uninstall)."""
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute(
            "DELETE FROM installed_integrations WHERE domain = ?", (domain,)
        )
        await db.execute("DELETE FROM config_entries WHERE domain = ?", (domain,))
        await db.commit()


# ---------------------------------------------------------------------------
# Config entries (per-integration configuration / secrets)
# ---------------------------------------------------------------------------


async def get_config_entry(domain: str) -> dict[str, Any]:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute(
            "SELECT data FROM config_entries WHERE domain = ?", (domain,)
        )
        row = await cur.fetchone()
    return json.loads(row[0]) if row else {}


async def set_config_entry(domain: str, data: dict[str, Any]) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute(
            "INSERT INTO config_entries (domain, data) VALUES (?, ?) "
            "ON CONFLICT(domain) DO UPDATE SET data = excluded.data",
            (domain, json.dumps(data)),
        )
        await db.commit()


# ---------------------------------------------------------------------------
# Custom store repositories (HACS-style "custom repository")
# ---------------------------------------------------------------------------


async def list_custom_repos() -> list[str]:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute("SELECT url FROM custom_repos")
        rows = await cur.fetchall()
    return [row[0] for row in rows]


async def add_custom_repo(url: str) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute(
            "INSERT OR IGNORE INTO custom_repos (url, added_at) VALUES (?, datetime('now'))",
            (url,),
        )
        await db.commit()


async def remove_custom_repo(url: str) -> None:
    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.execute("DELETE FROM custom_repos WHERE url = ?", (url,))
        await db.commit()
