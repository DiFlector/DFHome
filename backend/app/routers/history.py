"""Read access to the sensor history sampled by app/history.py."""
from fastapi import APIRouter, Query

from app import history

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/{device_id}")
async def get_device_history(
    device_id: str, hours: int = Query(default=12, ge=1, le=48)
) -> dict:
    return await history.get_device_history(device_id, hours)
