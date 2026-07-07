"""Event bus and WebSocket connection manager.

Integrations push device state updates; the event bus fans them out to core
subscribers, and the WsManager forwards them to connected frontend clients.
The core stays generic: it moves opaque unified-model messages, nothing vendor
specific.
"""
import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from app.core.models import Device, WsMessage

_LOGGER = logging.getLogger(__name__)


class EventBus:
    """Minimal async pub/sub. Callbacks receive a Device that changed state."""

    def __init__(self) -> None:
        self._subscribers: list[Any] = []

    def subscribe(self, callback: Any) -> None:
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Any) -> None:
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def publish_device_state(self, device: Device) -> None:
        for callback in list(self._subscribers):
            try:
                await callback(device)
            except Exception:  # noqa: BLE001 - a bad subscriber must not break others
                _LOGGER.exception("Event subscriber failed")


class WsManager:
    """Tracks active WebSocket connections and broadcasts unified-model messages."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, message: WsMessage) -> None:
        payload = message.model_dump(by_alias=True, exclude_none=True)
        async with self._lock:
            targets = list(self._connections)
        dead: list[WebSocket] = []
        for connection in targets:
            try:
                await connection.send_json(payload)
            except Exception:  # noqa: BLE001 - drop broken sockets
                dead.append(connection)
        if dead:
            async with self._lock:
                for connection in dead:
                    self._connections.discard(connection)

    async def send_snapshot(self, websocket: WebSocket, devices: list[Device]) -> None:
        message = WsMessage(type="snapshot", devices=devices)
        await websocket.send_json(
            message.model_dump(by_alias=True, exclude_none=True)
        )
