"""Outdoor weather widget data with two providers:

1. Open-Meteo (https://open-meteo.com) — primary: free, no key, rich data
   (precipitation probability per hour). Unreachable directly from this
   deployment's network, so its requests go through the WEATHER_PROXY
   configured in app/config.py.
2. wttr.in — fallback, intentionally WITHOUT the proxy: a second,
   independent network path in case the proxy itself goes down.

Results are cached in-process: geocoding forever (a city's coordinates don't
move), weather for a short TTL — and the last good payload is served stale
when both providers fail, so a network hiccup doesn't blank the widget.

Every fetch is strictly time-bounded: if this handler hangs, nginx marks the
backend upstream as down and unrelated API calls start failing too.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Query

from app.config import settings

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["weather"])

WEATHER_TTL_SECONDS = 10 * 60

# city query (lowercased) -> geocoding result
_geo_cache: dict[str, dict] = {}
# city query (lowercased) -> (fetched_at, payload)
_weather_cache: dict[str, tuple[float, dict]] = {}


def _client(timeout: httpx.Timeout | float, proxy: str | None = None) -> httpx.AsyncClient:
    # local_address pins sockets to IPv4: Docker/TrueNAS networks often get
    # AAAA records from DNS without a working IPv6 route, and the connect
    # then hangs until timeout. retries=0 on purpose — a retry would push the
    # first attempt past the outer deadline and mask the REAL exception
    # (ConnectTimeout vs ReadTimeout vs DNS) behind a bare TimeoutError.
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=0, proxy=proxy)
    return httpx.AsyncClient(
        transport=transport,
        timeout=timeout,
        headers={"User-Agent": "DFHome/0.1 (personal smart home dashboard)"},
    )


async def _geocode(client: httpx.AsyncClient, query: str) -> dict:
    key = query.strip().lower()
    if key in _geo_cache:
        return _geo_cache[key]
    resp = await client.get(
        "https://geocoding-api.open-meteo.com/v1/search",
        params={"name": query, "count": 1, "language": "ru", "format": "json"},
    )
    results = resp.json().get("results")
    if not results:
        raise HTTPException(status_code=404, detail=f"Город «{query}» не найден")
    _geo_cache[key] = results[0]
    return results[0]


async def _fetch_open_meteo(client: httpx.AsyncClient, query: str) -> dict:
    location = await _geocode(client, query)
    lat, lon = location["latitude"], location["longitude"]

    weather_resp = await client.get(
        "https://api.open-meteo.com/v1/forecast",
        params={
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,"
            "weather_code,precipitation",
            "hourly": "precipitation_probability,precipitation,weather_code",
            "forecast_hours": 24,
            # Hourly timestamps in the city's local time, so the frontend
            # can say "дождь к 15:00" without converting.
            "timezone": "auto",
        },
    )
    body = weather_resp.json()

    current = body.get("current", {})
    hourly = body.get("hourly", {})
    times = hourly.get("time") or []
    probs = hourly.get("precipitation_probability") or []
    precs = hourly.get("precipitation") or []
    codes = hourly.get("weather_code") or []

    return {
        "city": location.get("name"),
        "lat": lat,
        "lon": lon,
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "wind_speed": current.get("wind_speed_10m"),
        "weather_code": current.get("weather_code"),
        "precipitation": current.get("precipitation"),
        "hourly": [
            {
                "time": t,
                "precipitation_probability": probs[i] if i < len(probs) else None,
                "precipitation": precs[i] if i < len(precs) else None,
                "weather_code": codes[i] if i < len(codes) else None,
            }
            for i, t in enumerate(times)
        ],
    }


def _num(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


async def _fetch_wttr(client: httpx.AsyncClient, query: str) -> dict:
    resp = await client.get(f"https://wttr.in/{quote(query)}", params={"format": "j1", "lang": "ru"})
    data = resp.json()
    cur = (data.get("current_condition") or [{}])[0]
    area = (data.get("nearest_area") or [{}])[0]

    # wttr's hourly slots are local dates + "0"/"300"/.../"2100", but the
    # response carries no timezone, so approximate local time from the
    # longitude (15° per hour). Off-by-one at odd timezones is fine for
    # 3-hour forecast slots. Keep the next ~24 h so the frontend's "first
    # rainy hour" scan works the same way as with Open-Meteo.
    now_local = None
    lon_num = _num(area.get("longitude"))
    if lon_num is not None:
        now_local = datetime.utcnow() + timedelta(hours=round(lon_num / 15))

    hourly_out = []
    for day in (data.get("weather") or [])[:2]:
        date = day.get("date")
        for slot in day.get("hourly") or []:
            try:
                t = datetime.strptime(f"{date} {int(slot.get('time', 0)) // 100:02d}:00", "%Y-%m-%d %H:%M")
            except (TypeError, ValueError):
                continue
            hour_floor = now_local.replace(minute=0, second=0, microsecond=0) if now_local else None
            if hour_floor and not (hour_floor <= t <= hour_floor + timedelta(hours=24)):
                continue
            hourly_out.append(
                {
                    "time": t.strftime("%Y-%m-%dT%H:%M"),
                    "precipitation_probability": _num(slot.get("chanceofrain")),
                    "precipitation": _num(slot.get("precipMM")),
                    # WWO codes are not WMO — leave unset; rain detection
                    # falls back to probability/amount on the frontend.
                    "weather_code": None,
                }
            )

    return {
        "city": ((area.get("areaName") or [{}])[0]).get("value") or query,
        "lat": _num(area.get("latitude")) or 0,
        "lon": _num(area.get("longitude")) or 0,
        "temperature": _num(cur.get("temp_C")),
        "humidity": _num(cur.get("humidity")),
        "wind_speed": _num(cur.get("windspeedKmph")),
        "weather_code": None,
        "precipitation": _num(cur.get("precipMM")),
        "hourly": hourly_out,
    }


# fetcher, httpx timeout, overall deadline (s), use_proxy. Open-meteo goes
# through WEATHER_PROXY (unreachable directly from this network) and answers
# fast or not at all; wttr.in stays direct as an independent path and is a
# free community service that can take >10s to render a cold city, so it
# gets a much longer read budget. Both deadlines together must stay under
# nginx's 30s proxy_read_timeout.
_PROVIDERS = {
    "open-meteo": (_fetch_open_meteo, 5.0, 8, True),
    "wttr.in": (_fetch_wttr, httpx.Timeout(15.0, connect=5.0), 18, False),
}
# The provider that answered last time is tried first, so a network where
# open-meteo is unreachable doesn't pay its connect timeout on every refresh.
_preferred: str | None = None


@router.get("")
async def get_weather(query: str = Query(..., min_length=1)) -> dict:
    global _preferred
    key = query.strip().lower()
    cached = _weather_cache.get(key)
    if cached and time.time() - cached[0] < WEATHER_TTL_SECONDS:
        return cached[1]

    errors: list[str] = []
    for name in sorted(_PROVIDERS, key=lambda n: n != _preferred):
        fetch, timeout, deadline, use_proxy = _PROVIDERS[name]
        try:
            async with asyncio.timeout(deadline):
                async with _client(timeout, proxy=(settings.weather_proxy or None) if use_proxy else None) as client:
                    payload = await fetch(client, query)
        except HTTPException:
            raise  # the provider answered ("city not found") — that's the answer
        except (httpx.HTTPError, TimeoutError, ValueError, KeyError, TypeError) as exc:
            reason = f"{name}: {type(exc).__name__}{f': {exc}' if str(exc) else ''}"
            errors.append(reason)
            _LOGGER.warning("Weather fetch failed for %r — %s", query, reason)
            continue
        _preferred = name
        _weather_cache[key] = (time.time(), payload)
        return payload

    if cached:  # stale data beats an error card
        return cached[1]
    raise HTTPException(status_code=502, detail="Не удалось получить погоду — " + "; ".join(errors))
