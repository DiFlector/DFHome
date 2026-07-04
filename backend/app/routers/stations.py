"""Yandex Station widgets: what's playing + playback control.

Thin HTTP facade over the local glagol WebSocket protocol (see
app/yandex/glagol.py). State is fetched on demand — the widget polls it.
"""
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.yandex import glagol

router = APIRouter(prefix="/stations", tags=["stations"])


class StationCommand(BaseModel):
    command: Literal["play", "stop", "next", "prev", "rewind", "setVolume"]
    # rewind: absolute position in seconds
    position: float | None = None
    # setVolume: 0.0 .. 1.0
    volume: float | None = None


@router.get("")
async def list_stations() -> list[dict]:
    return [
        {"id": d["id"], "name": d["name"], "platform": d["platform"], "online": d["online"]}
        for d in await glagol.get_devices()
        if d.get("id")
    ]


@router.get("/{device_id}/state")
async def station_state(device_id: str) -> dict:
    return await glagol.get_state(device_id)


@router.post("/{device_id}/command")
async def station_command(device_id: str, cmd: StationCommand) -> dict:
    payload: dict = {"command": cmd.command}
    if cmd.command == "rewind":
        if cmd.position is None:
            raise HTTPException(status_code=400, detail="rewind требует position")
        payload["position"] = max(0.0, cmd.position)
    if cmd.command == "setVolume":
        if cmd.volume is None:
            raise HTTPException(status_code=400, detail="setVolume требует volume")
        payload["volume"] = min(1.0, max(0.0, cmd.volume))
    return await glagol.send_command(device_id, payload)
