"""Pydantic schemas shared between routers and the yandex client layer."""
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


# ---------------------------------------------------------------------------
# Metric thresholds (comfort bands for sensors / weather)
# ---------------------------------------------------------------------------

class TempThresholds(BaseModel):
    norm_lo: float = 20
    norm_hi: float = 24

    @model_validator(mode="after")
    def check_range(self) -> "TempThresholds":
        if self.norm_lo >= self.norm_hi:
            raise ValueError("temp.norm_lo must be less than temp.norm_hi")
        return self


class HumidityThresholds(BaseModel):
    norm_lo: float = 40
    norm_hi: float = 60
    margin: float = Field(default=5, ge=0, description="Yellow zone width outside norm band")

    @model_validator(mode="after")
    def check_range(self) -> "HumidityThresholds":
        if self.norm_lo >= self.norm_hi:
            raise ValueError("humidity.norm_lo must be less than humidity.norm_hi")
        return self


class BatteryThresholds(BaseModel):
    good_min: float = Field(default=60, ge=0, le=100)
    ok_min: float = Field(default=20, ge=0, le=100)

    @model_validator(mode="after")
    def check_range(self) -> "BatteryThresholds":
        if self.ok_min >= self.good_min:
            raise ValueError("battery.ok_min must be less than battery.good_min")
        return self


class MetricThresholds(BaseModel):
    temp: TempThresholds = Field(default_factory=TempThresholds)
    humidity: HumidityThresholds = Field(default_factory=HumidityThresholds)
    battery: BatteryThresholds = Field(default_factory=BatteryThresholds)


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class SettingsView(BaseModel):
    """What we return to the frontend: masked tokens + presence flags."""

    has_oauth_token: bool
    has_quasar_x_token: bool
    oauth_token_preview: str | None = None
    quasar_x_token_preview: str | None = None
    metric_thresholds: MetricThresholds = Field(default_factory=MetricThresholds)


class SettingsUpdate(BaseModel):
    yandex_oauth_token: str | None = None
    # Advanced/fallback: paste an x_token obtained elsewhere directly. Most
    # users should use POST /settings/quasar-login instead (see below).
    quasar_x_token: str | None = None
    metric_thresholds: MetricThresholds | None = None


class QuasarLoginRequest(BaseModel):
    """Raw `key=value; key2=value2` cookie string copied from DevTools while
    logged into yandex.ru. Exchanged once for a durable x_token; the cookie
    string itself is never stored."""

    cookies: str


class QuasarLoginResult(BaseModel):
    ok: bool
    display_login: str | None = None
    error: str | None = None


class ConnectionTestResult(BaseModel):
    official_api: bool
    official_api_error: str | None = None
    quasar_api: bool
    quasar_api_error: str | None = None


# ---------------------------------------------------------------------------
# Normalized device model (UI-friendly)
# ---------------------------------------------------------------------------

ControlKind = Literal["switch", "slider", "color", "mode", "unsupported"]


class ControlSpec(BaseModel):
    """Describes one controllable capability, ready for the frontend to render."""

    kind: ControlKind
    capability_type: str
    instance: str
    label: str
    value: Any = None
    # slider
    min: float | None = None
    max: float | None = None
    precision: float | None = None
    unit: str | None = None
    # mode / enum
    options: list[str] | None = None
    # color
    color_model: str | None = None  # "hsv" | "rgb" | "temperature_k"
    retrievable: bool = True


class PropertySpec(BaseModel):
    """Read-only telemetry (temperature, humidity, battery, motion, ...)."""

    property_type: str
    instance: str
    label: str
    value: Any = None
    unit: str | None = None


class DeviceView(BaseModel):
    id: str
    name: str
    type: str
    room: str | None = None
    household_id: str | None = None
    online: bool = True
    controls: list[ControlSpec] = []
    properties: list[PropertySpec] = []


class RoomView(BaseModel):
    id: str
    name: str
    devices: list[DeviceView] = []


class HomeView(BaseModel):
    rooms: list[RoomView] = []
    unassigned_devices: list[DeviceView] = []
    scenarios: list["ScenarioSummary"] = []


class ScenarioSummary(BaseModel):
    id: str
    name: str
    icon: str | None = None
    is_active: bool = True


# ---------------------------------------------------------------------------
# Device actions
# ---------------------------------------------------------------------------

class DeviceActionRequest(BaseModel):
    capability_type: str
    instance: str
    value: Any


# ---------------------------------------------------------------------------
# Scenario CRUD (simplified UI model -> translated to quasar payload)
# ---------------------------------------------------------------------------

class ScenarioTrigger(BaseModel):
    kind: Literal["voice_phrase", "device_property", "schedule"]
    # voice_phrase
    phrase: str | None = None
    # device_property. Yandex's condition schema for float sensors only
    # supports {"lower_bound": x} / {"upper_bound": x} (confirmed against a
    # real scenario's raw edit response) — no eq/gte/lte, hence just gt/lt.
    device_id: str | None = None
    property_type: str | None = None
    property_instance: str | None = None
    operator: Literal["gt", "lt"] | None = None
    value: Any = None
    # schedule
    cron: str | None = None
    time_of_day: str | None = None  # "HH:MM"
    days_of_week: list[int] | None = None


class ScenarioAction(BaseModel):
    kind: Literal["device_capability", "tts", "run_scenario"]
    # device_capability
    device_id: str | None = None
    capability_type: str | None = None
    instance: str | None = None
    value: Any = None
    # tts
    text: str | None = None
    # run_scenario
    scenario_id: str | None = None


class ScenarioPayload(BaseModel):
    name: str
    icon: str | None = None
    triggers: list[ScenarioTrigger] = []
    actions: list[ScenarioAction] = []


class ScenarioDetail(ScenarioPayload):
    id: str
