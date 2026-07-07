"""Settings API: core settings and per-integration config entries."""
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import storage
from app.core.manager import IntegrationError
from app.core.runtime import manager

router = APIRouter(tags=["settings"])


class ConfigEntryUpdate(BaseModel):
    data: dict[str, Any]


@router.get("/settings")
async def get_settings() -> dict[str, Any]:
    return await storage.get_settings()


@router.put("/settings")
async def update_settings(payload: dict[str, Any]) -> dict[str, Any]:
    return await storage.update_settings(payload)


@router.get("/integrations")
async def list_integrations() -> list[dict[str, Any]]:
    """Installed integrations with their manifests and config-entry data."""
    result: list[dict[str, Any]] = []
    for item in await storage.list_installed():
        domain = item["domain"]
        result.append(
            {
                "domain": domain,
                "version": item["version"],
                "manifest": item.get("manifest", {}),
                "configSchema": item.get("manifest", {}).get("config_schema", {}),
                "config": await storage.get_config_entry(domain),
                "loaded": manager.is_loaded(domain),
            }
        )
    return result


@router.put("/integrations/{domain}/config")
async def update_config_entry(domain: str, payload: ConfigEntryUpdate) -> dict:
    installed = await storage.get_installed(domain)
    if installed is None:
        raise HTTPException(status_code=404, detail="Интеграция не установлена")
    await storage.set_config_entry(domain, payload.data)
    # Reload so the integration picks up the new config.
    try:
        await manager.reload(domain)
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}
