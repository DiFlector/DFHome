import json

from fastapi import APIRouter

from app import history, storage
from app.models import HomeView, RoomView, ScenarioSummary
from app.yandex.normalize import normalize_device
from app.yandex.official import OfficialClient

router = APIRouter(prefix="/home", tags=["home"])


async def _ordered_room_ids(seen_ids: list[str]) -> list[str]:
    """Remember the order rooms were first seen in, so the dashboard doesn't
    reshuffle on every refresh just because Yandex's own room ordering isn't
    guaranteed stable. New rooms are appended at the end; rooms that no
    longer exist are dropped."""
    raw = await storage.get("room_order")
    stored: list[str] = json.loads(raw) if raw else []
    updated = [rid for rid in stored if rid in seen_ids] + [rid for rid in seen_ids if rid not in stored]
    if updated != stored:
        await storage.set_values({"room_order": json.dumps(updated)})
    return updated


@router.get("", response_model=HomeView)
async def get_home() -> HomeView:
    client = await OfficialClient.from_storage()
    data = await client.get_user_info()
    await history.ingest_user_info(data)

    room_by_id: dict[str, dict] = {r["id"]: r for r in data.get("rooms", [])}
    rooms: dict[str, RoomView] = {
        room_id: RoomView(id=room_id, name=room["name"])
        for room_id, room in room_by_id.items()
    }
    unassigned: list = []

    for raw_device in data.get("devices", []):
        room_id = raw_device.get("room")
        room_name = room_by_id.get(room_id, {}).get("name") if room_id else None
        device = normalize_device(raw_device, room_name=room_name)
        if room_id and room_id in rooms:
            rooms[room_id].devices.append(device)
        else:
            unassigned.append(device)

    ordered_ids = await _ordered_room_ids(list(room_by_id.keys()))
    ordered_rooms = [rooms[room_id] for room_id in ordered_ids if room_id in rooms]

    scenarios = [
        ScenarioSummary(id=s["id"], name=s.get("name", s["id"]), icon=s.get("icon"))
        for s in data.get("scenarios", [])
    ]

    return HomeView(
        rooms=ordered_rooms,
        unassigned_devices=unassigned,
        scenarios=scenarios,
    )
