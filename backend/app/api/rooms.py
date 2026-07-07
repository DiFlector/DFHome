"""Rooms API: room grouping contributed by integrations."""
from fastapi import APIRouter

from app.core.models import Room
from app.core.runtime import registry

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[Room])
async def list_rooms() -> list[Room]:
    return registry.all_rooms()
