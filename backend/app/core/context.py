"""IntegrationContext: the only surface an integration uses to talk to the core.

An integration receives a context in setup()/unload() and uses it to register
devices/rooms/widgets, push state updates, handle commands and spawn background
tasks. Background tasks are tracked so unload() can cancel them, guaranteeing a
clean, residue-free unload without restarting the core.
"""
import asyncio
import logging
from typing import Any, Awaitable, Callable

from app.core.models import Device, PlanLayout, Room, Widget
from app.core.registry import DeviceRegistry

_LOGGER = logging.getLogger(__name__)

CommandHandler = Callable[[str, str, Any], Awaitable[None]]


class IntegrationContext:
    def __init__(
        self,
        domain: str,
        registry: DeviceRegistry,
        config: dict[str, Any] | None = None,
    ) -> None:
        self.domain = domain
        self._registry = registry
        self.config: dict[str, Any] = config or {}
        self._tasks: list[asyncio.Task] = []

    # -- registration --------------------------------------------------------

    async def register_device(self, device: Device) -> None:
        device.integration = self.domain
        self._registry.register_device(self.domain, device)

    async def register_room(self, room: Room) -> None:
        self._registry.register_room(self.domain, room)

    async def register_widget(self, widget: Widget) -> None:
        self._registry.register_widget(self.domain, widget)

    def set_suggested_plan(self, layout: PlanLayout) -> None:
        self._registry.set_suggested_plan(self.domain, layout)

    def register_command_handler(self, handler: CommandHandler) -> None:
        self._registry.register_command_handler(self.domain, handler)

    # -- state push ----------------------------------------------------------

    async def push_state(self, device: Device) -> None:
        device.integration = self.domain
        await self._registry.push_state(device)

    def get_device(self, device_id: str) -> Device | None:
        return self._registry.get_device(device_id)

    # -- background tasks ----------------------------------------------------

    def create_task(self, coro: Awaitable[Any]) -> asyncio.Task:
        task = asyncio.ensure_future(coro)
        self._tasks.append(task)
        return task

    async def cancel_tasks(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._tasks.clear()
