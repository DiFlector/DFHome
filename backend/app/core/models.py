"""Unified device model for the DFHome core.

This is the vendor-independent contract between the core, the UI, the floor plan
and the widgets (see docs/ARCHITECTURE.md). It is the Python mirror of
frontend/src/lib/types.ts: field names are serialized in camelCase so the JSON
matches the frontend types exactly (roomId, colorModel, windSpeed, ...).

Any integration maps its devices onto this model; the core knows nothing about
protocols or vendors.
"""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model that serializes to camelCase while accepting snake_case too."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


# ---------------------------------------------------------------------------
# Device model: Device -> Entity -> Capability / Property -> Room
# ---------------------------------------------------------------------------

CapabilityKind = Literal["switch", "slider", "color", "mode", "unsupported"]


class Capability(CamelModel):
    """A controllable function of an entity (on/off, brightness, color, mode)."""

    kind: CapabilityKind
    instance: str
    label: str
    value: Any = None
    # slider
    min: float | None = None
    max: float | None = None
    step: float | None = None
    unit: str | None = None
    # mode / enum
    options: list[str] | None = None
    # color
    color_model: Literal["hsv", "rgb", "temperature_k"] | None = None


PropertyKind = str  # temperature | humidity | battery | motion | power | ...


class Property(CamelModel):
    """Read-only telemetry (temperature, humidity, battery, motion, ...)."""

    kind: PropertyKind
    instance: str
    label: str
    value: float | str | bool | None = None
    unit: str | None = None


class Entity(CamelModel):
    """A concrete function of a device (a device may have several entities)."""

    id: str
    name: str
    capabilities: list[Capability] = []
    properties: list[Property] = []


DeviceType = Literal[
    "light", "switch", "socket", "sensor", "thermostat", "media_device", "other"
]


class Device(CamelModel):
    """A physical or logical device. `id` includes the owning integration domain."""

    id: str
    integration: str
    name: str
    type: DeviceType
    room_id: str | None = None
    online: bool = True
    entities: list[Entity] = []


class Room(CamelModel):
    """Grouping of devices; used by the floor plan and widgets."""

    id: str
    name: str
    icon: str | None = None


# ---------------------------------------------------------------------------
# Floor plan
# ---------------------------------------------------------------------------

PlanDeviceVisualKind = Literal["bulb", "strip"]


class PlanRoom(CamelModel):
    room_id: str
    x: float
    y: float
    width: float
    height: float


class PlanDevicePosition(CamelModel):
    device_id: str
    x: float
    y: float
    visual_kind: PlanDeviceVisualKind = "bulb"
    attached_room_id: str | None = None


class PlanLayout(CamelModel):
    rooms: list[PlanRoom] = []
    devices: list[PlanDevicePosition] = []


# ---------------------------------------------------------------------------
# Dashboard widgets (contributed by integrations)
# ---------------------------------------------------------------------------

WidgetKind = Literal["weather", "sensor", "media", "devices_summary"]


class Widget(CamelModel):
    """A dashboard widget. Kept as an open shape so integrations can contribute
    any of the known widget kinds; the frontend renders by `kind`."""

    kind: WidgetKind
    id: str
    title: str
    # weather
    location: str | None = None
    temperature: float | None = None
    condition: str | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    # sensor / media
    device_id: str | None = None
    # media
    track: str | None = None
    artist: str | None = None
    playing: bool | None = None


# ---------------------------------------------------------------------------
# Store / integrations catalog (HACS model)
# ---------------------------------------------------------------------------

IntegrationCategory = Literal["protocol", "service", "sensor", "media", "weather"]
StoreItemStatus = Literal["installed", "available", "update_available"]


class StoreItem(CamelModel):
    domain: str
    name: str
    description: str
    category: IntegrationCategory
    version: str
    author: str
    status: StoreItemStatus = "available"
    protocols: list[str] = []
    # Present when an update is available for an installed integration.
    latest_version: str | None = None
    # Where the integration is fetched from (git URL / local dir / index entry).
    source: str | None = None


# ---------------------------------------------------------------------------
# Device commands
# ---------------------------------------------------------------------------


class DeviceCommand(CamelModel):
    entity_id: str
    instance: str
    value: Any = None


# ---------------------------------------------------------------------------
# WebSocket messages
# ---------------------------------------------------------------------------


class WsMessage(CamelModel):
    """Message pushed to connected clients over the WebSocket."""

    type: Literal["snapshot", "device_state"]
    # snapshot
    devices: list[Device] | None = None
    # device_state (a single device's updated full state)
    device: Device | None = None
