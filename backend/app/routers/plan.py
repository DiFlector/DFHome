"""Floor-plan layout: room rectangles and device positions on the canvas.

Kept as a single opaque JSON blob (not a relational schema) — this is a
personal, single-user app with one plan, edited occasionally; a full table
per room/device would be pure overhead here. The frontend owns the shape.
"""
import json

from fastapi import APIRouter

from app import storage

router = APIRouter(prefix="/plan", tags=["plan"])

_DEFAULT_PLAN = {"rooms": [], "devices": []}


@router.get("")
async def get_plan() -> dict:
    raw = await storage.get("plan_layout")
    return json.loads(raw) if raw else _DEFAULT_PLAN


@router.put("")
async def save_plan(payload: dict) -> dict:
    await storage.set_values({"plan_layout": json.dumps(payload)})
    return payload
