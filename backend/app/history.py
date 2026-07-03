"""Periodic sampling of numeric device properties into SQLite.

The official Yandex API has no state history, so the chart widgets need the
backend to build one itself: a background task polls /user/info every
15 minutes and stores every numeric property (temperature, humidity, ...)
as a (device_id, instance, ts, value) row. Old rows are pruned so the table
stays bounded — the widgets only look 12 hours back.
"""
import asyncio
import logging
import time

import aiosqlite

from app.config import settings
from app.yandex.normalize import normalize_device
from app.yandex.official import OfficialClient

_LOGGER = logging.getLogger(__name__)

SAMPLE_INTERVAL_SECONDS = 15 * 60
RETENTION_SECONDS = 48 * 60 * 60

_lock = asyncio.Lock()
_initialized = False


async def _ensure_db() -> None:
    global _initialized
    if _initialized:
        return
    async with _lock:
        if _initialized:
            return
        async with aiosqlite.connect(settings.database_path) as db:
            await db.execute(
                "CREATE TABLE IF NOT EXISTS sensor_history ("
                "device_id TEXT NOT NULL, instance TEXT NOT NULL, "
                "ts INTEGER NOT NULL, value REAL NOT NULL)"
            )
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_sensor_history "
                "ON sensor_history (device_id, instance, ts)"
            )
            await db.commit()
        _initialized = True


async def record_snapshot() -> None:
    """Sample every numeric property of every device right now."""
    client = await OfficialClient.from_storage()
    data = await client.get_user_info()

    now = int(time.time())
    rows: list[tuple[str, str, int, float]] = []
    for raw_device in data.get("devices", []):
        device = normalize_device(raw_device)
        for prop in device.properties:
            if isinstance(prop.value, (int, float)) and not isinstance(prop.value, bool):
                rows.append((device.id, prop.instance, now, float(prop.value)))

    if not rows:
        return

    await _ensure_db()
    async with aiosqlite.connect(settings.database_path) as db:
        await db.executemany(
            "INSERT INTO sensor_history (device_id, instance, ts, value) VALUES (?, ?, ?, ?)",
            rows,
        )
        await db.execute(
            "DELETE FROM sensor_history WHERE ts < ?", (now - RETENTION_SECONDS,)
        )
        await db.commit()


async def get_history(device_id: str, hours: int) -> dict[str, list[dict]]:
    """Points for all instances of one device, newest window first-to-last."""
    await _ensure_db()
    since = int(time.time()) - hours * 3600
    async with aiosqlite.connect(settings.database_path) as db:
        cur = await db.execute(
            "SELECT instance, ts, value FROM sensor_history "
            "WHERE device_id = ? AND ts >= ? ORDER BY ts",
            (device_id, since),
        )
        rows = await cur.fetchall()

    series: dict[str, list[dict]] = {}
    for instance, ts, value in rows:
        series.setdefault(instance, []).append({"ts": ts, "value": value})
    return series


async def sampler_loop() -> None:
    """Background task: one snapshot right away, then every 15 minutes.

    Errors (no token configured yet, Yandex hiccup) are logged and the loop
    keeps going — history just gets a gap instead of dying.
    """
    while True:
        try:
            await record_snapshot()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _LOGGER.warning("Sensor history snapshot failed: %s", exc)
        await asyncio.sleep(SAMPLE_INTERVAL_SECONDS)
