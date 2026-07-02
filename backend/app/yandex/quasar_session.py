"""Session handling for the unofficial Yandex quasar API.

Mirrors the auth flow used by the Home Assistant integration
AlexxIT/YandexStation (yandex_session.py), the most battle-tested reference
implementation of this reverse-engineered protocol:

1. One-time: exchange a raw browser cookie string (copied from DevTools while
   logged into yandex.ru) for a durable ``x_token`` via passport's
   token_by_sessionid endpoint. This is the only value we persist.
2. Per-process: exchange the x_token for short-lived session cookies via the
   x_token auth bundle + a redirect-only GET that sets cookies in our client's
   jar. These cookies are what iot.quasar.yandex.ru / yandex.ru actually check.
3. Per-mutating-request: a CSRF token scraped out of the yandex.ru/quasar HTML
   page (there is no JSON endpoint for it) is required as `x-csrf-token`.
4. On 401 -> re-run step 2 (cookies expired). On 403 -> re-run step 3 (csrf
   expired). Both are retried once automatically.

This file is the only place that knows about this dance; QuasarClient
(quasar.py) just calls .request() and doesn't care about any of it.
"""
import asyncio
import logging
import re
import time

import httpx

from app.yandex.errors import UpstreamAuthError, YandexApiError

_LOGGER = logging.getLogger(__name__)

# Public client_id/secret used by the AlexxIT/YandexStation project to talk to
# Yandex Passport's mobile OAuth bundle. Reusing them here (rather than
# minting our own) is what makes the cookie->x_token exchange work without
# registering a separate OAuth app for this unofficial flow.
_TOKEN_CLIENT_ID = "c0ebe342af7d48fbbbfcf2d2eedb8f9e"
_TOKEN_CLIENT_SECRET = "ad0a908f0aa341a182a37ecd75bc319e"

_MIN_REQUEST_INTERVAL = 0.2  # seconds, courtesy throttle matching the reference


async def exchange_cookies_for_x_token(cookies: str) -> tuple[str, str | None]:
    """One-time login: raw yandex.ru cookie string -> durable x_token.

    Returns (x_token, display_login). Raises UpstreamAuthError if Yandex
    rejects the cookie (e.g. it was copied while logged out, or has expired).
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://mobileproxy.passport.yandex.net/1/bundle/oauth/token_by_sessionid",
                data={"client_id": _TOKEN_CLIENT_ID, "client_secret": _TOKEN_CLIENT_SECRET},
                headers={"Ya-Client-Host": "passport.yandex.ru", "Ya-Client-Cookie": cookies},
            )
            data = resp.json()
            x_token = data.get("access_token")
            if not x_token:
                raise UpstreamAuthError(
                    f"Яндекс отклонил cookie при обмене на токен: {data.get('error', data)}"
                )

            info_resp = await client.get(
                "https://mobileproxy.passport.yandex.net/1/bundle/account/short_info/"
                "?avatar_size=islands-300",
                headers={"Authorization": f"OAuth {x_token}"},
            )
            info = info_resp.json()
            return x_token, info.get("display_login")
    except httpx.RequestError as exc:
        raise YandexApiError(f"Не удалось связаться с Яндексом: {exc}") from exc


class QuasarSession:
    """One long-lived httpx client per x_token, holding session cookies and a
    CSRF token, with automatic re-auth on 401/403."""

    def __init__(self, x_token: str):
        self.x_token = x_token
        self._client = httpx.AsyncClient(timeout=15.0, follow_redirects=False)
        self._csrf_token: str | None = None
        self._logged_in = False
        self._last_request_ts = 0.0
        self._lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _login(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://mobileproxy.passport.yandex.net/1/bundle/auth/x_token/",
                    data={"type": "x-token", "retpath": "https://www.yandex.ru"},
                    headers={"Ya-Consumer-Authorization": f"OAuth {self.x_token}"},
                )
                data = resp.json()
                if data.get("status") != "ok":
                    raise UpstreamAuthError(
                        "Не удалось авторизоваться по сохранённому x_token — возможно, "
                        "он отозван. Повторите вход в Настройках."
                    )
                host = data["passport_host"]
                track_id = data["track_id"]

            resp = await self._client.get(f"{host}/auth/session/", params={"track_id": track_id})
        except httpx.RequestError as exc:
            raise YandexApiError(f"Не удалось связаться с Яндексом: {exc}") from exc

        location = resp.headers.get("location", "")
        if "/auth/finish" not in location:
            raise UpstreamAuthError("Не удалось установить сессию Яндекса по x_token.")

        self._csrf_token = None
        self._logged_in = True

    async def _ensure_csrf(self) -> None:
        if self._csrf_token:
            return
        try:
            resp = await self._client.get("https://yandex.ru/quasar")
        except httpx.RequestError as exc:
            raise YandexApiError(f"Не удалось связаться с Яндексом: {exc}") from exc
        match = re.search(r'"csrfToken2":"(.+?)"', resp.text)
        if not match:
            raise YandexApiError("Не удалось получить csrf-токен со страницы yandex.ru/quasar")
        self._csrf_token = match.group(1)

    async def _throttle(self) -> None:
        wait = self._last_request_ts + _MIN_REQUEST_INTERVAL - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_request_ts = time.monotonic()

    async def request(self, method: str, url: str, retry: int = 2, **kwargs) -> dict:
        if not self._logged_in:
            await self._login()

        headers = kwargs.pop("headers", {}) or {}
        if method.upper() != "GET":
            await self._ensure_csrf()
            headers["x-csrf-token"] = self._csrf_token

        try:
            async with self._lock:
                await self._throttle()
                resp = await self._client.request(method, url, headers=headers, **kwargs)
        except httpx.RequestError as exc:
            raise YandexApiError(f"Не удалось связаться с Яндексом: {exc}") from exc

        if resp.status_code >= 400:
            # Log the exact outgoing body alongside Yandex's response so a
            # BAD_REQUEST (which Yandex returns with no field-level detail)
            # can be diagnosed from `docker compose logs backend` instead of
            # guessing blind — this API has no error schema to lean on.
            _LOGGER.warning(
                "Quasar API %s %s -> %s\nrequest body: %s\nresponse: %s",
                method,
                url,
                resp.status_code,
                kwargs.get("json"),
                resp.text[:1000],
            )

        if resp.status_code == 401 and retry > 0:
            await self._login()
            return await self.request(method, url, retry - 1, **kwargs)
        if resp.status_code == 403 and retry > 0:
            self._csrf_token = None
            return await self.request(method, url, retry - 1, **kwargs)
        if resp.status_code >= 400:
            raise YandexApiError(
                f"Quasar API {resp.status_code}: {resp.text[:500]}",
                status_code=resp.status_code,
            )

        data = resp.json() if resp.content else {}
        if isinstance(data, dict) and data.get("status") not in (None, "ok"):
            raise YandexApiError(f"Quasar API вернул ошибку: {data}")
        return data


# One session per x_token for the lifetime of the process. Personal-use scope
# (single uvicorn worker) makes a module-level cache appropriate; if the
# stored x_token changes (re-login), the old session is dropped and closed.
_sessions: dict[str, QuasarSession] = {}
_sessions_lock = asyncio.Lock()


async def get_session(x_token: str) -> QuasarSession:
    async with _sessions_lock:
        session = _sessions.get(x_token)
        if session is not None:
            return session

        for stale in _sessions.values():
            await stale.aclose()
        _sessions.clear()

        session = QuasarSession(x_token)
        _sessions[x_token] = session
        return session
