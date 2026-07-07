"""IntegrationManager: lifecycle of integration plugins.

Discovers installed integrations on disk, imports their packages, runs
setup()/unload(), routes commands to the owning integration and keeps the
registry consistent. Nothing here is vendor- or protocol-specific.
"""
import asyncio
import importlib
import logging
import sys
from pathlib import Path
from typing import Any

from app.config import settings
from app.core import storage
from app.core.context import IntegrationContext
from app.core.registry import DeviceRegistry

_LOGGER = logging.getLogger(__name__)


class IntegrationError(Exception):
    pass


class IntegrationManager:
    def __init__(self, registry: DeviceRegistry) -> None:
        self._registry = registry
        self._contexts: dict[str, IntegrationContext] = {}
        self._modules: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    @property
    def integrations_dir(self) -> Path:
        path = Path(settings.integrations_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _ensure_on_path(self) -> None:
        base = str(self.integrations_dir)
        if base not in sys.path:
            sys.path.insert(0, base)

    def _purge_module_cache(self, domain: str) -> None:
        """Drop cached modules so a reload after update picks up new code."""
        for name in list(sys.modules):
            if name == domain or name.startswith(f"{domain}."):
                del sys.modules[name]

    def is_loaded(self, domain: str) -> bool:
        return domain in self._contexts

    # -- load / unload -------------------------------------------------------

    async def load(self, domain: str) -> None:
        async with self._lock:
            await self._load_locked(domain)

    async def _load_locked(self, domain: str) -> None:
        if domain in self._contexts:
            return
        package_dir = self.integrations_dir / domain
        if not (package_dir / "__init__.py").exists():
            raise IntegrationError(
                f"Integration '{domain}' has no package at {package_dir}"
            )
        self._ensure_on_path()
        self._purge_module_cache(domain)
        try:
            module = importlib.import_module(domain)
        except Exception as exc:  # noqa: BLE001
            raise IntegrationError(f"Failed to import '{domain}': {exc}") from exc

        if not hasattr(module, "setup"):
            raise IntegrationError(f"Integration '{domain}' has no setup()")

        config = await storage.get_config_entry(domain)
        context = IntegrationContext(domain, self._registry, config)
        try:
            await module.setup(context)
        except Exception as exc:  # noqa: BLE001
            await context.cancel_tasks()
            self._registry.clear_domain(domain)
            self._purge_module_cache(domain)
            raise IntegrationError(f"setup() failed for '{domain}': {exc}") from exc

        self._contexts[domain] = context
        self._modules[domain] = module
        _LOGGER.info("Loaded integration '%s'", domain)
        await self._registry.broadcast_snapshot()

    async def unload(self, domain: str) -> None:
        async with self._lock:
            await self._unload_locked(domain)

    async def _unload_locked(self, domain: str) -> None:
        context = self._contexts.get(domain)
        module = self._modules.get(domain)
        if context is None:
            return
        if module is not None and hasattr(module, "unload"):
            try:
                await module.unload(context)
            except Exception:  # noqa: BLE001 - never block a clean unload
                _LOGGER.exception("unload() raised for '%s'", domain)
        await context.cancel_tasks()
        self._registry.clear_domain(domain)
        self._contexts.pop(domain, None)
        self._modules.pop(domain, None)
        self._purge_module_cache(domain)
        _LOGGER.info("Unloaded integration '%s'", domain)
        await self._registry.broadcast_snapshot()

    async def reload(self, domain: str) -> None:
        await self.unload(domain)
        await self.load(domain)

    async def load_installed(self) -> None:
        for item in await storage.list_installed():
            domain = item["domain"]
            try:
                await self.load(domain)
            except IntegrationError:
                _LOGGER.exception("Could not load installed integration '%s'", domain)

    async def unload_all(self) -> None:
        for domain in list(self._contexts.keys()):
            await self.unload(domain)

    # -- commands ------------------------------------------------------------

    async def dispatch_command(
        self, device_id: str, entity_id: str, instance: str, value: Any
    ) -> None:
        domain = self._registry.domain_of(device_id)
        if domain is None:
            raise IntegrationError(f"Unknown device '{device_id}'")
        handler = self._registry.command_handler(domain)
        if handler is None:
            raise IntegrationError(f"Integration '{domain}' has no command handler")
        await handler(entity_id, instance, value)
