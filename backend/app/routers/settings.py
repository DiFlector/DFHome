import json

from fastapi import APIRouter, Body, HTTPException

from app import storage
from app.models import (
    ConnectionTestResult,
    QuasarLoginRequest,
    QuasarLoginResult,
    SettingsUpdate,
    SettingsView,
)
from app.yandex.errors import YandexApiError
from app.yandex.official import OfficialClient
from app.yandex.quasar import QuasarClient
from app.yandex.quasar_session import exchange_cookies_for_x_token

router = APIRouter(prefix="/settings", tags=["settings"])


def _preview(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


@router.get("", response_model=SettingsView)
async def get_settings() -> SettingsView:
    values = await storage.get_all()
    return SettingsView(
        has_oauth_token=bool(values.get("yandex_oauth_token")),
        has_quasar_x_token=bool(values.get("quasar_x_token")),
        oauth_token_preview=_preview(values.get("yandex_oauth_token")),
        quasar_x_token_preview=_preview(values.get("quasar_x_token")),
    )


@router.put("", response_model=SettingsView)
async def update_settings(update: SettingsUpdate) -> SettingsView:
    await storage.set_values(update.model_dump(exclude_unset=True))
    return await get_settings()


# Keys whose stored value is itself a JSON document — exported as nested
# objects (readable file) and re-serialized on import.
_JSON_KEYS = ("room_order", "plan_layout", "widgets")


@router.get("/export")
async def export_config() -> dict:
    """Full config dump: tokens, room order, plan layout and widgets.

    Contains secrets in plain text by design — this is the user's own backup
    to move the app to another machine.
    """
    values = await storage.get_all()
    config: dict = {}
    for key in storage.ALL_KEYS:
        value = values.get(key)
        if value is None:
            continue
        config[key] = json.loads(value) if key in _JSON_KEYS else value
    return {"app": "dfhome", "version": 1, "config": config}


@router.post("/import")
async def import_config(payload: dict = Body(...)) -> dict:
    config = payload.get("config")
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Неверный формат файла: нет секции config.")

    updates: dict[str, str | None] = {}
    for key in storage.ALL_KEYS:
        if key not in config:
            continue
        value = config[key]
        if value is None:
            updates[key] = None
        elif isinstance(value, (dict, list)):
            updates[key] = json.dumps(value)
        else:
            updates[key] = str(value)

    if not updates:
        raise HTTPException(status_code=400, detail="В файле нет ни одного известного поля.")

    await storage.set_values(updates)
    return {"ok": True, "imported": sorted(updates)}


@router.post("/quasar-login", response_model=QuasarLoginResult)
async def quasar_login(request: QuasarLoginRequest) -> QuasarLoginResult:
    """One-time login for scenario CRUD: exchange a pasted browser cookie
    (copied while logged into yandex.ru) for a durable x_token, which is what
    we actually store. See yandex/quasar_session.py for why."""
    try:
        x_token, display_login = await exchange_cookies_for_x_token(request.cookies)
    except YandexApiError as exc:
        return QuasarLoginResult(ok=False, error=exc.message)

    await storage.set_values({"quasar_x_token": x_token})
    return QuasarLoginResult(ok=True, display_login=display_login)


@router.post("/test-connection", response_model=ConnectionTestResult)
async def test_connection() -> ConnectionTestResult:
    result = ConnectionTestResult(official_api=False, quasar_api=False)

    try:
        client = await OfficialClient.from_storage()
        await client.get_user_info()
        result.official_api = True
    except YandexApiError as exc:
        result.official_api_error = exc.message

    try:
        quasar = await QuasarClient.from_storage()
        await quasar.list_scenarios()
        result.quasar_api = True
    except YandexApiError as exc:
        result.quasar_api_error = exc.message

    return result
