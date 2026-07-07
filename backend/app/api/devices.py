"""Devices API: list devices and route commands to the owning integration."""
from fastapi import APIRouter, HTTPException

from app.core.manager import IntegrationError
from app.core.models import Device, DeviceCommand
from app.core.runtime import manager, registry

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[Device])
async def list_devices() -> list[Device]:
    return registry.all_devices()


@router.get("/{device_id}", response_model=Device)
async def get_device(device_id: str) -> Device:
    device = registry.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    return device


@router.post("/{device_id}/command", response_model=Device)
async def send_command(device_id: str, command: DeviceCommand) -> Device:
    device = registry.get_device(device_id)
    if device is None:
        raise HTTPException(status_code=404, detail="Устройство не найдено")
    try:
        await manager.dispatch_command(
            device_id, command.entity_id, command.instance, command.value
        )
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return registry.get_device(device_id) or device
