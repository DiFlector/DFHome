"""Dashboard widgets API.

Widgets are contributed by integrations; the user can rearrange them and the
arrangement is persisted as an override. GET returns the override if present,
otherwise the integration-contributed widgets.
"""
from fastapi import APIRouter, Body

from app.core import storage
from app.core.models import Widget
from app.core.runtime import registry

router = APIRouter(prefix="/widgets", tags=["widgets"])


@router.get("", response_model=list[Widget])
async def get_widgets() -> list[Widget]:
    raw = await storage.kv_get("widgets_layout")
    if raw:
        return [Widget.model_validate(item) for item in raw]
    return registry.all_widgets()


@router.put("", response_model=list[Widget])
async def save_widgets(payload: list[Widget] = Body(...)) -> list[Widget]:
    await storage.kv_set(
        "widgets_layout",
        [w.model_dump(by_alias=True, exclude_none=True) for w in payload],
    )
    return payload
