"""Outdoor weather widget data, proxied through Open-Meteo (free, no API key
required — https://open-meteo.com). Two calls: geocode the city name to
lat/lon, then fetch current conditions plus 24 h of precipitation for those
coordinates.

Both steps are cached in-process: geocoding forever (a city's coordinates
don't move), weather for a short TTL — and the last good payload is served
stale when Open-Meteo is unreachable, so a network hiccup doesn't blank the
widget on the dashboard.
"""
import logging
import time

import httpx
from fastapi import APIRouter, HTTPException, Query

_LOGGER = logging.getLogger(__name__)

router = APIRouter(prefix="/weather", tags=["weather"])

WEATHER_TTL_SECONDS = 10 * 60

# city query (lowercased) -> geocoding result
_geo_cache: dict[str, dict] = {}
# city query (lowercased) -> (fetched_at, payload)
_weather_cache: dict[str, tuple[float, dict]] = {}


def _client() -> httpx.AsyncClient:
    # local_address pins sockets to IPv4: Docker/TrueNAS networks often get
    # AAAA records from DNS without a working IPv6 route, and the connect
    # then hangs until timeout. retries covers transient connect failures.
    transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0", retries=2)
    return httpx.AsyncClient(transport=transport, timeout=10.0)


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


@router.get("")
async def get_weather(query: str = Query(..., min_length=1)) -> dict:
    key = query.strip().lower()
    cached = _weather_cache.get(key)
    if cached and time.time() - cached[0] < WEATHER_TTL_SECONDS:
        return cached[1]

    try:
        async with _client() as client:
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
                    # Hourly timestamps in the city's local time, so the
                    # frontend can say "дождь к 15:00" without converting.
                    "timezone": "auto",
                },
            )
            body = weather_resp.json()
    except httpx.HTTPError as exc:
        _LOGGER.warning("Weather fetch failed for %r: %s: %s", query, type(exc).__name__, exc)
        if cached:  # stale data beats an error card
            return cached[1]
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось получить погоду: {type(exc).__name__}: {exc}",
        ) from exc

    current = body.get("current", {})
    hourly = body.get("hourly", {})
    times = hourly.get("time") or []
    probs = hourly.get("precipitation_probability") or []
    precs = hourly.get("precipitation") or []
    codes = hourly.get("weather_code") or []

    payload = {
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
    _weather_cache[key] = (time.time(), payload)
    return payload
