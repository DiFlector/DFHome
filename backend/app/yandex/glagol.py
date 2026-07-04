"""Local Yandex Station API ("glagol") — what's playing on the speakers.

Stations expose a local WebSocket server (wss on the LAN, self-signed cert)
that streams full player state: track title/artist, cover, duration, live
progress, and accepts playback commands. The cloud is only used for
bootstrap, mirroring AlexxIT/YandexStation (the battle-tested reference for
this reverse-engineered protocol):

1. Stored quasar x_token -> Yandex Music OAuth token (oauth.mobile.yandex.net).
2. Music token -> glagol device list (quasar.yandex.net/glagol/device_list),
   which includes each station's LAN IP + wss port as last reported by the
   device itself.
3. Music token -> per-device "conversation token" (glagol/token), required in
   every WS message.

All three are cached in-process; the WS connection is opened per request —
at a 5s widget poll for a couple of stations that's negligible.
"""
import asyncio
import json
import logging
import ssl
import time
import uuid

import httpx
import websockets

from app import storage
from app.yandex.errors import NotAuthenticatedError, YandexApiError

_LOGGER = logging.getLogger(__name__)

# Yandex Music mobile app credentials, same public pair AlexxIT uses for the
# x-token -> music token exchange.
_MUSIC_CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d"
_MUSIC_CLIENT_SECRET = "53bc75238f0c4d08a118e51fe9203300"

_DEVICES_TTL_SECONDS = 60

# x_token -> music token
_music_tokens: dict[str, str] = {}
# (device_id, platform) -> conversation token
_glagol_tokens: dict[tuple[str, str], str] = {}
# (fetched_at, devices)
_devices_cache: tuple[float, list[dict]] | None = None

# Stations use a self-signed certificate on the local wss endpoint.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


async def _x_token() -> str:
    token = await storage.get("quasar_x_token")
    if not token:
        raise NotAuthenticatedError(
            "Для виджета станции нужен вход Яндекса — выполните «Вход для сценариев» "
            "на странице Настройки."
        )
    return token


async def _music_token(client: httpx.AsyncClient) -> str:
    x_token = await _x_token()
    cached = _music_tokens.get(x_token)
    if cached:
        return cached
    resp = await client.post(
        "https://oauth.mobile.yandex.net/1/token",
        data={
            "client_id": _MUSIC_CLIENT_ID,
            "client_secret": _MUSIC_CLIENT_SECRET,
            "grant_type": "x-token",
            "access_token": x_token,
        },
    )
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise YandexApiError(f"Не удалось получить музыкальный токен: {data.get('error', data)}")
    _music_tokens[x_token] = token
    return token


async def get_devices(force: bool = False) -> list[dict]:
    """Glagol device list: id, name, platform + the LAN address the station
    last reported to the cloud."""
    global _devices_cache
    if not force and _devices_cache and time.time() - _devices_cache[0] < _DEVICES_TTL_SECONDS:
        return _devices_cache[1]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token = await _music_token(client)
            resp = await client.get(
                "https://quasar.yandex.net/glagol/device_list",
                headers={"Authorization": f"Oauth {token}"},
            )
            raw = resp.json().get("devices") or []
    except httpx.RequestError as exc:
        raise YandexApiError(f"Не удалось получить список станций: {exc}") from exc

    devices = []
    for d in raw:
        net = d.get("networkInfo") or {}
        ips = net.get("ip_addresses") or []
        # Prefer IPv4 — the LAN wss endpoint is not reliably reachable over
        # the ULA IPv6 addresses stations also report.
        ip = next((a for a in ips if ":" not in a), ips[0] if ips else None)
        devices.append(
            {
                "id": d.get("id"),
                "name": d.get("name"),
                "platform": d.get("platform"),
                "ip": ip,
                "port": net.get("external_port") or 1961,
                "online": bool(ip),
            }
        )
    _devices_cache = (time.time(), devices)
    return devices


async def _device(device_id: str) -> dict:
    devices = await get_devices()
    for d in devices:
        if d["id"] == device_id:
            return d
    # The station may have re-registered — refresh once before giving up.
    for d in await get_devices(force=True):
        if d["id"] == device_id:
            return d
    raise YandexApiError(f"Станция {device_id} не найдена в аккаунте", status_code=404)


async def _conversation_token(device: dict) -> str:
    key = (device["id"], device["platform"])
    cached = _glagol_tokens.get(key)
    if cached:
        return cached
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token = await _music_token(client)
            resp = await client.get(
                "https://quasar.yandex.net/glagol/token",
                params={"device_id": device["id"], "platform": device["platform"]},
                headers={"Authorization": f"Oauth {token}"},
            )
            data = resp.json()
    except httpx.RequestError as exc:
        raise YandexApiError(f"Не удалось получить токен станции: {exc}") from exc
    conv = data.get("token")
    if not conv:
        raise YandexApiError(f"Станция не выдала токен: {data}")
    _glagol_tokens[key] = conv
    return conv


def _normalize_state(device: dict, state: dict) -> dict:
    player = state.get("playerState") or {}
    extra = player.get("extra") or {}
    cover = extra.get("coverURI")
    return {
        "device_id": device["id"],
        "device_name": device["name"],
        "playing": bool(state.get("playing")),
        "volume": state.get("volume"),
        "alice_state": state.get("aliceState"),
        "title": player.get("title") or None,
        "artist": player.get("subtitle") or None,
        "duration": player.get("duration"),
        "progress": player.get("progress"),
        "has_prev": bool(player.get("hasPrev")),
        "has_next": bool(player.get("hasNext")),
        "cover_url": f"https://{cover.replace('%%', '400x400')}" if cover else None,
    }


async def _ws_exchange(device: dict, payload: dict, retry: bool = True) -> dict:
    """Open the station's local WS, send one command and return the first
    state snapshot it pushes back."""
    if not device.get("ip"):
        raise YandexApiError(f"Станция «{device['name']}» не в сети (нет IP-адреса)")
    conv = await _conversation_token(device)
    uri = f"wss://{device['ip']}:{device['port']}"
    message = {
        "conversationToken": conv,
        "id": str(uuid.uuid4()),
        "sentTime": int(time.time() * 1000),
        "payload": payload,
    }
    try:
        async with websockets.connect(
            uri, ssl=_SSL_CTX, open_timeout=5, close_timeout=1, max_size=2**22
        ) as ws:
            await ws.send(json.dumps(message))
            # The station streams snapshots; grab the first one with a state.
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                raw = await asyncio.wait_for(ws.recv(), timeout=4)
                msg = json.loads(raw)
                if "state" in msg:
                    return _normalize_state(device, msg["state"])
    except (OSError, asyncio.TimeoutError, websockets.WebSocketException) as exc:
        # A stale conversation token makes the station drop the connection —
        # refresh it once before reporting the station unreachable.
        if retry:
            _glagol_tokens.pop((device["id"], device["platform"]), None)
            return await _ws_exchange(device, payload, retry=False)
        raise YandexApiError(
            f"Станция «{device['name']}» недоступна по {device['ip']}:{device['port']}: "
            f"{type(exc).__name__}: {exc}"
        ) from exc
    raise YandexApiError(f"Станция «{device['name']}» не прислала состояние")


async def get_state(device_id: str) -> dict:
    device = await _device(device_id)
    return await _ws_exchange(device, {"command": "ping"})


async def send_command(device_id: str, payload: dict) -> dict:
    device = await _device(device_id)
    return await _ws_exchange(device, payload)
