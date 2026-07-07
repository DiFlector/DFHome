"""Demo integration: a self-contained mock source for the whole app.

Installed from the store (or a local directory / Git). On setup() it registers
mock devices, rooms, dashboard widgets and a suggested floor plan, handles
commands by echoing the new value back as state, and runs a small telemetry
simulation loop. unload() stops cleanly (the context cancels the loop).

This is the reference for the "everything demo-able goes into the demo
integration" rule (see CLAUDE.md).
"""
import asyncio
import random
from typing import Any

from app.core.context import IntegrationContext
from app.core.models import Device

from .data import build_devices, build_plan, build_rooms, build_widgets

# entity_id -> Device (devices are shared references held in the registry too)
_devices_by_entity: dict[str, Device] = {}
_devices_by_id: dict[str, Device] = {}


def _index(devices: list[Device]) -> None:
    _devices_by_entity.clear()
    _devices_by_id.clear()
    for device in devices:
        _devices_by_id[device.id] = device
        for entity in device.entities:
            _devices_by_entity[entity.id] = device


async def _handle_command(entity_id: str, instance: str, value: Any) -> None:
    device = _devices_by_entity.get(entity_id)
    if device is None:
        return
    for entity in device.entities:
        if entity.id != entity_id:
            continue
        for capability in entity.capabilities:
            if capability.instance == instance:
                capability.value = value
    await _ctx.push_state(device)


async def _simulate() -> None:
    """Nudge a few sensor readings so the UI feels alive."""
    while True:
        await asyncio.sleep(5)
        climate = _devices_by_id.get("demo:sensor-bedroom-climate")
        if climate:
            for prop in climate.entities[0].properties:
                if prop.kind == "temperature" and isinstance(prop.value, (int, float)):
                    prop.value = round(prop.value + random.uniform(-0.2, 0.2), 1)
                elif prop.kind == "humidity" and isinstance(prop.value, (int, float)):
                    prop.value = max(30, min(70, prop.value + random.randint(-1, 1)))
            await _ctx.push_state(climate)

        tv = _devices_by_id.get("demo:socket-living-tv")
        if tv:
            on = any(
                c.instance == "on" and c.value
                for c in tv.entities[0].capabilities
            )
            for prop in tv.entities[0].properties:
                if prop.kind == "power":
                    prop.value = random.randint(120, 165) if on else 0
            await _ctx.push_state(tv)


_ctx: IntegrationContext = None  # type: ignore[assignment]


async def setup(ctx: IntegrationContext) -> None:
    global _ctx
    _ctx = ctx

    for room in build_rooms():
        await ctx.register_room(room)

    devices = build_devices()
    _index(devices)
    for device in devices:
        await ctx.register_device(device)

    for widget in build_widgets():
        await ctx.register_widget(widget)

    ctx.set_suggested_plan(build_plan())
    ctx.register_command_handler(_handle_command)
    ctx.create_task(_simulate())


async def unload(ctx: IntegrationContext) -> None:
    _devices_by_entity.clear()
    _devices_by_id.clear()
