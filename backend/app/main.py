import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import devices, home, scenarios, settings as settings_router
from app.yandex.errors import NotAuthenticatedError, UpstreamAuthError, YandexApiError

_LOGGER = logging.getLogger(__name__)

app = FastAPI(title="DFHome", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(NotAuthenticatedError)
async def not_authenticated_handler(request: Request, exc: NotAuthenticatedError):
    return JSONResponse(status_code=428, content={"detail": exc.message})


@app.exception_handler(UpstreamAuthError)
async def upstream_auth_handler(request: Request, exc: UpstreamAuthError):
    return JSONResponse(status_code=401, content={"detail": exc.message})


@app.exception_handler(YandexApiError)
async def yandex_api_error_handler(request: Request, exc: YandexApiError):
    return JSONResponse(status_code=exc.status_code or 502, content={"detail": exc.message})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    # Safety net: anything not already mapped above (e.g. a transient network
    # error we didn't anticipate) should never leak a raw traceback to the
    # frontend — log it server-side and return a clean message instead.
    _LOGGER.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=502,
        content={"detail": "Не удалось выполнить запрос к Яндексу. Попробуйте ещё раз."},
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


app.include_router(settings_router.router)
app.include_router(home.router)
app.include_router(devices.router)
app.include_router(scenarios.router)
