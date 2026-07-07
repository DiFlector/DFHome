"""Floor-plan layout API.

GET returns the user-saved layout; if none, it falls back to the suggested
layout aggregated from installed integrations (so the plan looks populated out
of the box once an integration like demo is installed).
"""
from fastapi import APIRouter

from app.core import storage
from app.core.models import PlanLayout
from app.core.runtime import registry

router = APIRouter(prefix="/plan", tags=["plan"])


@router.get("", response_model=PlanLayout)
async def get_plan() -> PlanLayout:
    raw = await storage.kv_get("plan_layout")
    if raw:
        return PlanLayout.model_validate(raw)
    return registry.suggested_plan()


@router.put("", response_model=PlanLayout)
async def save_plan(payload: PlanLayout) -> PlanLayout:
    await storage.kv_set(
        "plan_layout", payload.model_dump(by_alias=True, exclude_none=True)
    )
    return payload


@router.delete("", response_model=PlanLayout)
async def reset_plan() -> PlanLayout:
    """Drop the user-saved layout and return the suggested one from integrations."""
    await storage.kv_delete("plan_layout")
    return registry.suggested_plan()
