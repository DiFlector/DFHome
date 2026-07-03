"""Widgets shown in the plan page's side panel (weather, room sensors, ...).

Same rationale as plan.py: one opaque JSON list, frontend-owned shape.
"""
import json

from fastapi import APIRouter, Body

from app import storage

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.get("")
async def get_widgets() -> list:
    raw = await storage.get("widgets")
    return json.loads(raw) if raw else []


@router.put("")
async def save_widgets(payload: list = Body(...)) -> list:
    await storage.set_values({"widgets": json.dumps(payload)})
    return payload
