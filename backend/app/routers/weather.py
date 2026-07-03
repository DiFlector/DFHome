"""Outdoor weather widget data, proxied through Open-Meteo (free, no API key
required — https://open-meteo.com). Two calls: geocode the city name to
lat/lon, then fetch current conditions for those coordinates.
"""
import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("")
async def get_weather(query: str = Query(..., min_length=1)) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            geo_resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": query, "count": 1, "language": "ru", "format": "json"},
            )
            results = geo_resp.json().get("results")
            if not results:
                raise HTTPException(status_code=404, detail=f"Город «{query}» не найден")
            location = results[0]
            lat, lon = location["latitude"], location["longitude"]

            weather_resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code",
                },
            )
            current = weather_resp.json().get("current", {})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Не удалось получить погоду: {exc}") from exc

    return {
        "city": location.get("name"),
        "lat": lat,
        "lon": lon,
        "temperature": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "wind_speed": current.get("wind_speed_10m"),
        "weather_code": current.get("weather_code"),
    }
