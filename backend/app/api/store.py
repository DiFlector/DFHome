"""Store API: catalog and install/update/uninstall of integrations."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core import storage
from app.core.manager import IntegrationError
from app.core.models import StoreItem
from app.core.runtime import store_client

router = APIRouter(prefix="/store", tags=["store"])


class InstallRequest(BaseModel):
    domain: str | None = None
    source: str | None = None
    ref: str | None = None


class DomainRequest(BaseModel):
    domain: str


class CustomRepoRequest(BaseModel):
    url: str


@router.get("", response_model=list[StoreItem])
async def catalog() -> list[StoreItem]:
    return await store_client.catalog()


@router.post("/install")
async def install(payload: InstallRequest) -> dict:
    try:
        await store_client.install(payload.domain, payload.source, payload.ref)
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.post("/update")
async def update(payload: DomainRequest) -> dict:
    try:
        await store_client.update(payload.domain)
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.post("/uninstall")
async def uninstall(payload: DomainRequest) -> dict:
    try:
        await store_client.uninstall(payload.domain)
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.post("/custom-repo")
async def add_custom_repo(payload: CustomRepoRequest) -> dict:
    try:
        await store_client.add_custom_repo(payload.url)
    except IntegrationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.get("/custom-repos", response_model=list[str])
async def list_custom_repos() -> list[str]:
    return await storage.list_custom_repos()
