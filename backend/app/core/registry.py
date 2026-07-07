"""In-memory registry of everything integrations contribute.

Devices, rooms, widgets, command handlers and a suggested plan layout are all
grouped by the owning integration domain so an integration can be unloaded
cleanly (full, residue-free uninstall) without touching others.

State pushed by integrations updates the stored Device and is broadcast to
clients via the WsManager.
"""
import logging
from typing import Awaitable, Callable

from app.core.events import EventBus, WsManager
from app.core.models import (
    Device,
    PlanLayout,
    Room,
    Widget,
    WsMessage,
)

_LOGGER = logging.getLogger(__name__)

CommandHandler = Callable[[str, str, object], Awaitable[None]]


class DeviceRegistry:
    def __init__(self, event_bus: EventBus, ws_manager: WsManager) -> None:
        self._event_bus = event_bus
        self._ws_manager = ws_manager
        # domain -> {device_id -> Device}
        self._devices: dict[str, dict[str, Device]] = {}
        self._rooms: dict[str, dict[str, Room]] = {}
        self._widgets: dict[str, dict[str, Widget]] = {}
        self._command_handlers: dict[str, CommandHandler] = {}
        self._suggested_plans: dict[str, PlanLayout] = {}

    # -- registration (called by integrations via the context) --------------

    def register_device(self, domain: str, device: Device) -> None:
        self._devices.setdefault(domain, {})[device.id] = device

    def register_room(self, domain: str, room: Room) -> None:
        self._rooms.setdefault(domain, {})[room.id] = room

    def register_widget(self, domain: str, widget: Widget) -> None:
        self._widgets.setdefault(domain, {})[widget.id] = widget

    def register_command_handler(self, domain: str, handler: CommandHandler) -> None:
        self._command_handlers[domain] = handler

    def set_suggested_plan(self, domain: str, layout: PlanLayout) -> None:
        self._suggested_plans[domain] = layout

    # -- queries -------------------------------------------------------------

    def all_devices(self) -> list[Device]:
        return [
            device
            for devices in self._devices.values()
            for device in devices.values()
        ]

    def get_device(self, device_id: str) -> Device | None:
        for devices in self._devices.values():
            if device_id in devices:
                return devices[device_id]
        return None

    def all_rooms(self) -> list[Room]:
        return [room for rooms in self._rooms.values() for room in rooms.values()]

    def all_widgets(self) -> list[Widget]:
        return [
            widget
            for widgets in self._widgets.values()
            for widget in widgets.values()
        ]

    def suggested_plan(self) -> PlanLayout:
        merged = PlanLayout()
        for layout in self._suggested_plans.values():
            merged.rooms.extend(layout.rooms)
            merged.devices.extend(layout.devices)
        return merged

    def command_handler(self, domain: str) -> CommandHandler | None:
        return self._command_handlers.get(domain)

    def domain_of(self, device_id: str) -> str | None:
        for domain, devices in self._devices.items():
            if device_id in devices:
                return domain
        return None

    def device_ids_for_domain(self, domain: str) -> set[str]:
        return set(self._devices.get(domain, {}).keys())

    def room_ids_for_domain(self, domain: str) -> set[str]:
        return set(self._rooms.get(domain, {}).keys())

    def widget_ids_for_domain(self, domain: str) -> set[str]:
        return set(self._widgets.get(domain, {}).keys())

    # -- state updates -------------------------------------------------------

    async def push_state(self, device: Device) -> None:
        """Store an integration's updated device and broadcast it to clients."""
        self.register_device(device.integration, device)
        await self._event_bus.publish_device_state(device)
        await self._ws_manager.broadcast(WsMessage(type="device_state", device=device))

    # -- cleanup (clean unload / uninstall) ----------------------------------

    def clear_domain(self, domain: str) -> None:
        """Drop all registrations owned by a domain (residue-free unload)."""
        self._devices.pop(domain, None)
        self._rooms.pop(domain, None)
        self._widgets.pop(domain, None)
        self._command_handlers.pop(domain, None)
        self._suggested_plans.pop(domain, None)

    async def broadcast_snapshot(self) -> None:
        await self._ws_manager.broadcast(
            WsMessage(type="snapshot", devices=self.all_devices())
        )
