"""Translate raw Yandex device JSON (capabilities/properties) into the
UI-friendly ControlSpec/PropertySpec model, and translate UI actions back
into the Yandex capability payload shape.

Yandex capability types (partial, the ones we render controls for):
  devices.capabilities.on_off        -> switch
  devices.capabilities.range         -> slider (brightness, volume, temperature)
  devices.capabilities.color_setting -> color picker (hsv / rgb / temperature_k)
  devices.capabilities.mode          -> select (thermostat mode, cleanup mode, ...)
  devices.capabilities.toggle        -> switch (backlight, mute, pause, ...)

Property types we surface read-only:
  devices.properties.float  (temperature, humidity, battery_level, ...)
  devices.properties.event  (motion, open, button, ...)
"""
from typing import Any

from app.models import ControlSpec, DeviceView, PropertySpec

_RANGE_UNITS = {
    "brightness": "%",
    "temperature": "°C",
    "channel": "",
    "volume": "%",
    "humidity": "%",
}

_FLOAT_UNITS = {
    "unit.temperature.celsius": "°C",
    "unit.percent": "%",
    "unit.ppm": "ppm",
}

# Human-readable Russian labels per capability/property instance, so the UI
# shows "Яркость" instead of "range:brightness". Keyed by instance name within
# each capability/property kind (an instance can mean different things across
# kinds, e.g. "open" is a range on covers but an event on contact sensors).
_TOGGLE_LABELS = {
    "backlight": "Подсветка",
    "controls_locked": "Блокировка кнопок",
    "ionization": "Ионизация",
    "keep_warm": "Поддержание тепла",
    "mute": "Без звука",
    "oscillation": "Вращение",
    "pause": "Пауза",
}

_RANGE_LABELS = {
    "brightness": "Яркость",
    "channel": "Канал",
    "humidity": "Влажность",
    "open": "Открытие",
    "temperature": "Температура",
    "volume": "Громкость",
}

_MODE_LABELS = {
    "cleanup_mode": "Режим уборки",
    "coffee_mode": "Режим кофеварки",
    "dishwashing": "Режим мойки",
    "fan_speed": "Скорость вентилятора",
    "heat": "Режим нагрева",
    "input_source": "Источник сигнала",
    "program": "Программа",
    "swing": "Направление воздуха",
    "tea_mode": "Тип чая",
    "thermostat": "Режим термостата",
    "work_speed": "Скорость работы",
}

_COLOR_LABELS = {
    "hsv": "Цвет",
    "rgb": "Цвет",
    "temperature_k": "Температура света",
    "scene": "Сцена освещения",
}

_PROPERTY_LABELS = {
    "amperage": "Ток",
    "battery_level": "Заряд батареи",
    "button": "Кнопка",
    "co2_level": "Уровень CO2",
    "food_level": "Уровень корма",
    "gas": "Газ",
    "humidity": "Влажность",
    "illumination": "Освещённость",
    "motion": "Движение",
    "open": "Открытие",
    "pm1_density": "Частицы PM1",
    "pm2.5_density": "Частицы PM2.5",
    "pm10_density": "Частицы PM10",
    "power": "Мощность",
    "pressure": "Давление",
    "smoke": "Дым",
    "temperature": "Температура",
    "tvoc": "Летучие органические вещества",
    "vibration": "Вибрация",
    "voltage": "Напряжение",
    "water_leak": "Протечка",
    "water_level": "Уровень воды",
}


def _humanize(instance: str) -> str:
    """Last-resort fallback for an instance we don't have a translation for:
    "input_source_2" -> "Input source 2" beats a raw "mode:input_source_2"."""
    text = instance.replace("_", " ").replace(".", " ").strip()
    return text[:1].upper() + text[1:] if text else instance


def normalize_capability(cap: dict) -> ControlSpec | None:
    cap_type = cap.get("type", "")
    state = cap.get("state") or {}
    instance = state.get("instance") or (cap.get("parameters") or {}).get("instance", "")
    retrievable = cap.get("retrievable", True)
    parameters = cap.get("parameters") or {}

    if cap_type == "devices.capabilities.on_off":
        return ControlSpec(
            kind="switch",
            capability_type=cap_type,
            instance=instance or "on",
            label="Включено",
            value=state.get("value"),
            retrievable=retrievable,
        )

    if cap_type == "devices.capabilities.toggle":
        return ControlSpec(
            kind="switch",
            capability_type=cap_type,
            instance=instance,
            label=_TOGGLE_LABELS.get(instance) or _humanize(instance),
            value=state.get("value"),
            retrievable=retrievable,
        )

    if cap_type == "devices.capabilities.range":
        range_params = parameters.get("range") or {}
        return ControlSpec(
            kind="slider",
            capability_type=cap_type,
            instance=instance,
            label=_RANGE_LABELS.get(instance) or _humanize(instance),
            value=state.get("value"),
            min=range_params.get("min", 0),
            max=range_params.get("max", 100),
            precision=range_params.get("precision", 1),
            unit=_RANGE_UNITS.get(instance, ""),
            retrievable=retrievable,
        )

    if cap_type == "devices.capabilities.mode":
        modes = [m.get("value") for m in parameters.get("modes", [])]
        return ControlSpec(
            kind="mode",
            capability_type=cap_type,
            instance=instance,
            label=_MODE_LABELS.get(instance) or _humanize(instance),
            value=state.get("value"),
            options=modes,
            retrievable=retrievable,
        )

    # Unknown/unsupported capability: still surface it as read-only so the
    # user can see it exists, rather than silently dropping data.
    return ControlSpec(
        kind="unsupported",
        capability_type=cap_type,
        instance=instance,
        label=_humanize(instance) if instance else cap_type.rsplit(".", 1)[-1],
        value=state.get("value"),
        retrievable=retrievable,
    )


_DEFAULT_HSV = {"h": 0, "s": 0, "v": 100}


def normalize_color_setting(cap: dict) -> list[ControlSpec]:
    """A single color_setting capability commonly supports BOTH a color model
    (hsv/rgb) AND a temperature_k range at once — Yandex's own bulbs report
    this via `parameters: {color_model: "hsv", temperature_k: {min, max}}`.
    `state` only reflects whichever mode was set *last*, so reading only
    state.instance (as every other capability type does) silently hides
    whichever mode isn't currently active — e.g. a bulb last set to a color
    temperature would never show the color picker at all, even though it's
    fully RGB-capable. Expose one ControlSpec per supported mode instead."""
    state = cap.get("state") or {}
    parameters = cap.get("parameters") or {}
    retrievable = cap.get("retrievable", True)
    cap_type = cap.get("type", "")
    active_instance = state.get("instance")
    active_value = state.get("value")

    controls: list[ControlSpec] = []

    color_model = parameters.get("color_model")
    if color_model in ("hsv", "rgb"):
        value = active_value if active_instance == color_model else None
        controls.append(
            ControlSpec(
                kind="color",
                capability_type=cap_type,
                instance=color_model,
                label=_COLOR_LABELS.get(color_model, "Цвет"),
                value=value if value is not None else (_DEFAULT_HSV if color_model == "hsv" else 0xFFFFFF),
                color_model=color_model,
                color_active=active_instance == color_model,
                retrievable=retrievable,
            )
        )

    temperature_range = parameters.get("temperature_k")
    if temperature_range:
        value = active_value if active_instance == "temperature_k" else None
        controls.append(
            ControlSpec(
                kind="color",
                capability_type=cap_type,
                instance="temperature_k",
                label=_COLOR_LABELS["temperature_k"],
                value=value if value is not None else temperature_range.get("min", 4500),
                min=temperature_range.get("min"),
                max=temperature_range.get("max"),
                color_model="temperature_k",
                color_active=active_instance == "temperature_k",
                retrievable=retrievable,
            )
        )

    if controls:
        return controls

    # Fallback for shapes without a recognized `parameters.color_model` /
    # `parameters.temperature_k` — behave like a single generic control based
    # on whatever state currently reports, same as before this function existed.
    fallback_instance = active_instance if active_instance in ("hsv", "rgb", "temperature_k") else "hsv"
    return [
        ControlSpec(
            kind="color",
            capability_type=cap_type,
            instance=fallback_instance,
            label=_COLOR_LABELS.get(fallback_instance, "Цвет"),
            value=active_value,
            color_model=fallback_instance,
            color_active=True,
            retrievable=retrievable,
        )
    ]


def normalize_property(prop: dict) -> PropertySpec:
    prop_type = prop.get("type", "")
    state = prop.get("state") or {}
    instance = state.get("instance", "")
    parameters = prop.get("parameters") or {}
    unit = _FLOAT_UNITS.get(parameters.get("unit", ""), "")
    label = _PROPERTY_LABELS.get(instance) or _humanize(instance) or prop_type.rsplit(".", 1)[-1]
    return PropertySpec(
        property_type=prop_type,
        instance=instance,
        label=label,
        value=state.get("value"),
        unit=unit,
    )


def normalize_device(raw: dict, room_name: str | None = None) -> DeviceView:
    controls: list[ControlSpec] = []
    for cap in raw.get("capabilities", []):
        if cap.get("type") == "devices.capabilities.color_setting":
            controls.extend(normalize_color_setting(cap))
        elif (c := normalize_capability(cap)) is not None:
            controls.append(c)
    properties = [normalize_property(p) for p in raw.get("properties", [])]
    return DeviceView(
        id=raw["id"],
        name=raw.get("name", raw["id"]),
        type=raw.get("type", "unknown"),
        room=room_name,
        household_id=(raw.get("household") or {}).get("id"),
        online=raw.get("state", "online") != "offline",
        controls=controls,
        properties=properties,
    )


def build_action_value(control: ControlSpec, raw_value: Any) -> Any:
    """Pass-through for now; kept as a hook in case Yandex needs coercion
    (e.g. hsv object shape) that differs from what the frontend sends."""
    return raw_value
