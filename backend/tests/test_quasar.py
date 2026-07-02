from app.models import ScenarioAction, ScenarioPayload, ScenarioTrigger
from app.yandex.quasar import build_quasar_payload, parse_quasar_scenario


def test_tts_action_uses_device_item_with_quasar_capability():
    """Matches yandex_quasar.py's scenario_speaker_tts shape: TTS is a
    step.action.item.device wrapping a devices.capabilities.quasar capability,
    not a standalone item type."""
    payload = ScenarioPayload(
        name="Вечер",
        triggers=[ScenarioTrigger(kind="voice_phrase", phrase="включи вечер")],
        actions=[ScenarioAction(kind="tts", device_id="speaker-1", text="Добрый вечер")],
    )
    body = build_quasar_payload(payload)
    item = body["steps"][0]["parameters"]["items"][0]
    assert item["type"] == "step.action.item.device"
    assert item["value"]["id"] == "speaker-1"
    cap = item["value"]["capabilities"][0]
    assert cap["type"] == "devices.capabilities.quasar"
    assert cap["state"] == {"instance": "tts", "value": {"text": "Добрый вечер"}}


def test_device_capability_action_shape():
    payload = ScenarioPayload(
        name="Свет",
        actions=[
            ScenarioAction(
                kind="device_capability",
                device_id="lamp-1",
                capability_type="devices.capabilities.on_off",
                instance="on",
                value=True,
            )
        ],
    )
    body = build_quasar_payload(payload)
    item = body["steps"][0]["parameters"]["items"][0]
    assert item["type"] == "step.action.item.device"
    assert item["value"]["capabilities"][0] == {
        "type": "devices.capabilities.on_off",
        "state": {"instance": "on", "value": True},
    }


def test_parse_quasar_scenario_round_trips_tts_action():
    raw_scenario = {
        "name": "Вечер",
        "icon": "home",
        "triggers": [{"trigger": {"type": "scenario.trigger.voice", "value": "включи вечер"}}],
        "steps": [
            {
                "type": "scenarios.steps.actions.v2",
                "parameters": {
                    "items": [
                        {
                            "id": "speaker-1",
                            "type": "step.action.item.device",
                            "value": {
                                "id": "speaker-1",
                                "item_type": "device",
                                "capabilities": [
                                    {
                                        "type": "devices.capabilities.quasar",
                                        "state": {"instance": "tts", "value": {"text": "Добрый вечер"}},
                                    }
                                ],
                            },
                        }
                    ]
                },
            }
        ],
    }
    detail = parse_quasar_scenario("scenario-1", raw_scenario)
    assert detail.name == "Вечер"
    assert detail.triggers[0].kind == "voice_phrase"
    assert detail.triggers[0].phrase == "включи вечер"
    assert detail.actions[0].kind == "tts"
    assert detail.actions[0].device_id == "speaker-1"
    assert detail.actions[0].text == "Добрый вечер"


def _property_trigger_raw(condition: dict) -> dict:
    return {
        "trigger": {
            "type": "scenario.trigger.property",
            "value": {
                "device": {"id": "sensor-1"},
                "property_type": "devices.properties.float",
                "instance": "temperature",
                "condition": condition,
            },
        }
    }


def test_parse_quasar_scenario_reads_nested_device_id_on_property_trigger():
    """The edit response nests the device ref under trigger.value.device.id;
    build_quasar_payload must emit it flat for create/update (see
    yandex_quasar.py's own parse_trigger, which does the same transform).

    condition shape ({"lower_bound"/"upper_bound": x}) confirmed by pulling
    the raw edit response of a real scenario from a live account — Yandex's
    UI only offers "больше"/"меньше" because that's literally the whole
    schema, there's no generic operator+value/eq/gte/lte."""
    raw_scenario = {
        "name": "Жарко",
        "triggers": [_property_trigger_raw({"lower_bound": 25})],
        "steps": [],
    }
    detail = parse_quasar_scenario("scenario-2", raw_scenario)
    trigger = detail.triggers[0]
    assert trigger.kind == "device_property"
    assert trigger.device_id == "sensor-1"
    assert trigger.operator == "gt"
    assert trigger.value == 25

    rebuilt = build_quasar_payload(ScenarioPayload(name="Жарко", triggers=[trigger]))
    rebuilt_value = rebuilt["triggers"][0]["trigger"]["value"]
    assert rebuilt_value["device_id"] == "sensor-1"
    assert rebuilt_value["condition"] == {"lower_bound": 25}


def test_parse_quasar_scenario_reads_upper_bound_condition():
    raw_scenario = {
        "name": "Холодно",
        "triggers": [_property_trigger_raw({"upper_bound": 10})],
        "steps": [],
    }
    detail = parse_quasar_scenario("scenario-3", raw_scenario)
    trigger = detail.triggers[0]
    assert trigger.operator == "lt"
    assert trigger.value == 10

    rebuilt = build_quasar_payload(ScenarioPayload(name="Холодно", triggers=[trigger]))
    assert rebuilt["triggers"][0]["trigger"]["value"]["condition"] == {"upper_bound": 10}
