"""Wiring of the core singletons shared across API routers.

Instantiated once and imported wherever the routers need access to the registry,
integration manager or store client.
"""
from app.core.events import EventBus, WsManager
from app.core.manager import IntegrationManager
from app.core.registry import DeviceRegistry
from app.core.store import StoreClient

event_bus = EventBus()
ws_manager = WsManager()
registry = DeviceRegistry(event_bus, ws_manager)
manager = IntegrationManager(registry)
store_client = StoreClient(manager)
