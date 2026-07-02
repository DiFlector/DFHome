"""Client for the UNOFFICIAL Yandex Quasar API (iot.quasar.yandex.ru).

Used ONLY for scenario create/edit/delete, which the official public API
does not expose. Authentication (durable x_token -> short-lived session
cookies + CSRF, with automatic re-login) lives in quasar_session.py; this
module only knows about scenario endpoints and payload shapes.

Endpoint paths and payload shapes below are taken directly from Home
Assistant's AlexxIT/YandexStation integration (yandex_quasar.py), the most
battle-tested reference for this reverse-engineered API:
  https://github.com/AlexxIT/YandexStation/blob/master/custom_components/yandex_station/core/yandex_quasar.py

This API is not publicly documented and can change without notice. Everything
Yandex-schema-specific is isolated in this file so a breaking change upstream
doesn't affect devices/scenario-running, which use the stable official API.
"""
from app import storage
from app.models import ScenarioAction, ScenarioDetail, ScenarioPayload, ScenarioTrigger
from app.yandex.errors import NotAuthenticatedError
from app.yandex.quasar_session import get_session

BASE_URL = "https://iot.quasar.yandex.ru"


class QuasarClient:
    def __init__(self, session):
        self._session = session

    @classmethod
    async def from_storage(cls) -> "QuasarClient":
        x_token = await storage.get("quasar_x_token")
        if not x_token:
            raise NotAuthenticatedError(
                "Вход для сценариев не выполнен. Выполните вход на странице Настройки, "
                "чтобы создавать и редактировать сценарии."
            )
        session = await get_session(x_token)
        return cls(session)

    # -- read -------------------------------------------------------------

    async def list_scenarios(self) -> list[dict]:
        data = await self._session.request("GET", f"{BASE_URL}/m/user/scenarios")
        return data.get("scenarios") or []

    async def get_scenario(self, scenario_id: str) -> ScenarioDetail:
        data = await self._session.request(
            "GET", f"{BASE_URL}/m/v4/user/scenarios/{scenario_id}/edit"
        )
        return parse_quasar_scenario(scenario_id, data.get("scenario") or {})

    # -- write --------------------------------------------------------------

    async def create_scenario(self, payload: ScenarioPayload) -> dict:
        body = build_quasar_payload(payload)
        return await self._session.request("POST", f"{BASE_URL}/m/v4/user/scenarios", json=body)

    async def update_scenario(self, scenario_id: str, payload: ScenarioPayload) -> dict:
        body = build_quasar_payload(payload)
        return await self._session.request(
            "PUT", f"{BASE_URL}/m/v3/user/scenarios/{scenario_id}", json=body
        )

    async def delete_scenario(self, scenario_id: str) -> dict:
        # DELETE on this path isn't confirmed in the reference implementation
        # (it never deletes scenarios); kept as the most REST-consistent guess.
        return await self._session.request("DELETE", f"{BASE_URL}/m/user/scenarios/{scenario_id}")


# ---------------------------------------------------------------------------
# UI model <-> quasar payload translation
# ---------------------------------------------------------------------------

def _build_condition(operator: str | None, value) -> dict:
    """Confirmed against a real scenario's raw edit response: Yandex's
    condition schema for float properties is exactly one of these two keys —
    there is no generic operator+value/eq/gte/lte, which is also why the app's
    own UI only ever offers "больше"/"меньше"."""
    if operator == "lt":
        return {"upper_bound": value}
    return {"lower_bound": value}


def _build_trigger(trigger: ScenarioTrigger) -> dict:
    if trigger.kind == "voice_phrase":
        return {"trigger": {"type": "scenario.trigger.voice", "value": trigger.phrase or ""}}
    if trigger.kind == "device_property":
        return {
            "trigger": {
                "type": "scenario.trigger.property",
                "value": {
                    "device_id": trigger.device_id,
                    "property_type": trigger.property_type,
                    "instance": trigger.property_instance,
                    "condition": _build_condition(trigger.operator, trigger.value),
                },
            }
        }
    if trigger.kind == "schedule":
        return {
            "trigger": {
                "type": "scenario.trigger.timetable",
                "value": {
                    "time": trigger.time_of_day,
                    "days": trigger.days_of_week or [],
                    "cron": trigger.cron,
                },
            }
        }
    raise ValueError(f"Unknown trigger kind: {trigger.kind}")


def _device_action_item(device_id: str | None, capability: dict) -> dict:
    """Shape confirmed by yandex_quasar.py's scenario_speaker_tts/_action
    helpers: every device-targeting step is `step.action.item.device`,
    regardless of whether the capability is a real device control or the
    speaker-only `devices.capabilities.quasar` (TTS / server actions)."""
    return {
        "id": device_id,
        "type": "step.action.item.device",
        "value": {
            "id": device_id,
            "item_type": "device",
            "capabilities": [capability],
        },
    }


def _build_action_item(action: ScenarioAction) -> dict:
    if action.kind == "device_capability":
        return _device_action_item(
            action.device_id,
            {
                "type": action.capability_type,
                "state": {"instance": action.instance, "value": action.value},
            },
        )
    if action.kind == "tts":
        return _device_action_item(
            action.device_id,
            {
                "type": "devices.capabilities.quasar",
                "state": {"instance": "tts", "value": {"text": action.text}},
            },
        )
    if action.kind == "run_scenario":
        return {
            "type": "step.action.item.scenario",
            "value": {"item_type": "scenario", "launch_devices": [], "id": action.scenario_id},
        }
    raise ValueError(f"Unknown action kind: {action.kind}")


def build_quasar_payload(payload: ScenarioPayload) -> dict:
    return {
        "name": payload.name,
        "icon": payload.icon or "home",
        "triggers": [_build_trigger(t) for t in payload.triggers],
        "steps": [
            {
                "type": "scenarios.steps.actions.v2",
                "parameters": {"items": [_build_action_item(a) for a in payload.actions]},
            }
        ]
        if payload.actions
        else [],
    }


def _parse_trigger(raw: dict) -> ScenarioTrigger | None:
    """Best-effort reverse of _build_trigger. Returns None (rather than
    raising) for shapes we don't recognize, since this is an unofficial API
    and the exact schema isn't guaranteed to match what we send.

    Per yandex_quasar.py's own parse_trigger(), the *edit* response nests the
    device reference as value["device"]["id"], while create/update expects a
    flat device_id — this function reads the former, _build_trigger emits the
    latter."""
    try:
        trigger = raw.get("trigger", raw)
        t_type = trigger.get("type", "")
        value = trigger.get("value")
        if t_type.endswith(".voice"):
            return ScenarioTrigger(kind="voice_phrase", phrase=value if isinstance(value, str) else None)
        if t_type.endswith(".property") and isinstance(value, dict):
            condition = value.get("condition") or {}
            device = value.get("device") or {}
            if "lower_bound" in condition:
                operator, threshold = "gt", condition["lower_bound"]
            elif "upper_bound" in condition:
                operator, threshold = "lt", condition["upper_bound"]
            else:
                operator, threshold = None, None
            return ScenarioTrigger(
                kind="device_property",
                device_id=device.get("id") or value.get("device_id"),
                property_type=value.get("property_type"),
                property_instance=value.get("instance"),
                operator=operator,
                value=threshold,
            )
        if t_type.endswith(".timetable") and isinstance(value, dict):
            return ScenarioTrigger(
                kind="schedule",
                time_of_day=value.get("time"),
                days_of_week=value.get("days"),
                cron=value.get("cron"),
            )
    except (AttributeError, TypeError):
        pass
    return None


def _parse_action_item(item: dict) -> ScenarioAction | None:
    """Best-effort reverse of _build_action_item. Returns None for anything
    that doesn't match a shape we recognize instead of guessing wrong."""
    try:
        item_type = item.get("type", "")
        value = item.get("value") or {}
        capabilities = value.get("capabilities") or []
        if item_type == "step.action.item.device" and capabilities:
            cap = capabilities[0]
            cap_type = cap.get("type")
            state = cap.get("state") or {}
            device_id = value.get("id") or item.get("id")
            if cap_type == "devices.capabilities.quasar" and state.get("instance") == "tts":
                raw_value = state.get("value")
                text = raw_value.get("text") if isinstance(raw_value, dict) else None
                return ScenarioAction(kind="tts", device_id=device_id, text=text)
            return ScenarioAction(
                kind="device_capability",
                device_id=device_id,
                capability_type=cap_type,
                instance=state.get("instance"),
                value=state.get("value"),
            )
        if item_type == "step.action.item.scenario":
            return ScenarioAction(kind="run_scenario", scenario_id=value.get("id"))
    except (AttributeError, TypeError):
        pass
    return None


def parse_quasar_scenario(scenario_id: str, data: dict) -> ScenarioDetail:
    """Parse a raw quasar scenario-edit response (`resp["scenario"]`) into our
    UI model.

    Unrecognized triggers/actions are silently dropped rather than raising,
    so editing an older/differently-shaped scenario still lets the user see
    the name and rebuild what didn't parse, instead of a hard failure.
    """
    triggers = [t for raw_t in data.get("triggers", []) if (t := _parse_trigger(raw_t)) is not None]

    actions: list[ScenarioAction] = []
    for step in data.get("steps", []):
        for item in (step.get("parameters") or {}).get("items", []):
            action = _parse_action_item(item)
            if action is not None:
                actions.append(action)

    return ScenarioDetail(
        id=scenario_id,
        name=data.get("name", scenario_id),
        icon=data.get("icon"),
        triggers=triggers,
        actions=actions,
    )
