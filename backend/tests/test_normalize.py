from app.yandex.normalize import (
    normalize_capability,
    normalize_color_setting,
    normalize_device,
    normalize_property,
)


def test_on_off_capability_becomes_switch():
    cap = {
        "type": "devices.capabilities.on_off",
        "retrievable": True,
        "state": {"instance": "on", "value": True},
    }
    control = normalize_capability(cap)
    assert control.kind == "switch"
    assert control.instance == "on"
    assert control.value is True


def test_range_capability_becomes_slider_with_bounds():
    cap = {
        "type": "devices.capabilities.range",
        "retrievable": True,
        "state": {"instance": "brightness", "value": 50},
        "parameters": {"range": {"min": 1, "max": 100, "precision": 1}},
    }
    control = normalize_capability(cap)
    assert control.kind == "slider"
    assert control.min == 1
    assert control.max == 100
    assert control.value == 50
    assert control.unit == "%"


def test_mode_capability_lists_options():
    cap = {
        "type": "devices.capabilities.mode",
        "retrievable": True,
        "state": {"instance": "thermostat", "value": "eco"},
        "parameters": {"modes": [{"value": "eco"}, {"value": "turbo"}]},
    }
    control = normalize_capability(cap)
    assert control.kind == "mode"
    assert control.options == ["eco", "turbo"]
    assert control.value == "eco"


def test_color_setting_capability_becomes_color_control():
    cap = {
        "type": "devices.capabilities.color_setting",
        "retrievable": True,
        "parameters": {"color_model": "hsv"},
        "state": {"instance": "hsv", "value": {"h": 200, "s": 50, "v": 100}},
    }
    controls = normalize_color_setting(cap)
    assert len(controls) == 1
    assert controls[0].kind == "color"
    assert controls[0].color_model == "hsv"
    assert controls[0].value == {"h": 200, "s": 50, "v": 100}


def test_color_setting_with_both_color_and_temperature_exposes_both():
    """Real Yandex bulbs report ONE color_setting capability whose parameters
    list support for both hsv and temperature_k, with `state` reflecting only
    whichever was set last — both must still show up as separate controls."""
    cap = {
        "type": "devices.capabilities.color_setting",
        "retrievable": True,
        "parameters": {"color_model": "hsv", "temperature_k": {"min": 2700, "max": 6500}},
        "state": {"instance": "temperature_k", "value": 6500},
    }
    controls = normalize_color_setting(cap)
    kinds = {c.color_model: c for c in controls}
    assert set(kinds.keys()) == {"hsv", "temperature_k"}
    assert kinds["temperature_k"].value == 6500
    assert kinds["temperature_k"].min == 2700
    assert kinds["temperature_k"].max == 6500
    # hsv wasn't the active mode, so Yandex never reports its last value —
    # it should still be present with a sensible default instead of missing.
    assert kinds["hsv"].value == {"h": 0, "s": 0, "v": 100}


def test_unknown_capability_is_marked_unsupported():
    cap = {"type": "devices.capabilities.custom.weird", "state": {"instance": "x", "value": 1}}
    control = normalize_capability(cap)
    assert control.kind == "unsupported"


def test_float_property_extracts_unit():
    prop = {
        "type": "devices.properties.float",
        "state": {"instance": "temperature", "value": 21.5},
        "parameters": {"unit": "unit.temperature.celsius"},
    }
    spec = normalize_property(prop)
    assert spec.unit == "°C"
    assert spec.value == 21.5


def test_normalize_device_groups_controls_and_properties():
    raw = {
        "id": "dev-1",
        "name": "Лампа",
        "type": "devices.types.light",
        "capabilities": [
            {
                "type": "devices.capabilities.on_off",
                "state": {"instance": "on", "value": True},
            }
        ],
        "properties": [
            {
                "type": "devices.properties.float",
                "state": {"instance": "temperature", "value": 20},
            }
        ],
    }
    device = normalize_device(raw, room_name="Спальня")
    assert device.name == "Лампа"
    assert device.room == "Спальня"
    assert len(device.controls) == 1
    assert len(device.properties) == 1
