"""WebSocket endpoint: pushes a snapshot on connect and live device-state deltas."""
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.runtime import registry, ws_manager

_LOGGER = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        await ws_manager.send_snapshot(websocket, registry.all_devices())
        while True:
            # We don't expect client messages; this keeps the connection open
            # and lets us detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        _LOGGER.debug("WebSocket closed", exc_info=True)
    finally:
        await ws_manager.disconnect(websocket)
