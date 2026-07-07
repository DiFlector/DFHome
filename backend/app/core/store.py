"""StoreClient: the DFHome integrations store (HACS model).

Sources of truth are distributed across Git repositories plus a curated index;
there is no central server. The client can install an integration from:
  - a curated index entry (`GET /store` catalog),
  - a direct Git URL (custom repository),
  - a local directory (bundled sources / offline).

It also detects updates (higher SemVer available) and performs safe update and
fully clean uninstall (see docs and the plan's lifecycle section).
"""
import asyncio
import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

import httpx

from app.config import settings
from app.core import storage
from app.core.manager import IntegrationError, IntegrationManager
from app.core.models import PlanLayout, StoreItem

_LOGGER = logging.getLogger(__name__)

_BUNDLED_INDEX = Path(__file__).resolve().parent.parent / "store_index.json"


def _parse_version(value: str) -> tuple[int, ...]:
    parts: list[int] = []
    for chunk in value.strip().lstrip("v").split("."):
        num = ""
        for ch in chunk:
            if ch.isdigit():
                num += ch
            else:
                break
        parts.append(int(num) if num else 0)
    return tuple(parts) or (0,)


def _is_newer(candidate: str, current: str) -> bool:
    return _parse_version(candidate) > _parse_version(current)


class StoreClient:
    def __init__(self, manager: IntegrationManager) -> None:
        self._manager = manager

    # -- index ---------------------------------------------------------------

    def _bundled_index(self) -> list[dict[str, Any]]:
        try:
            data = json.loads(_BUNDLED_INDEX.read_text(encoding="utf-8"))
            return data.get("integrations", [])
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Failed to read bundled store index")
            return []

    async def _remote_index(self) -> list[dict[str, Any]]:
        if not settings.store_index_url:
            return []
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(settings.store_index_url)
                resp.raise_for_status()
                return resp.json().get("integrations", [])
        except Exception:  # noqa: BLE001 - remote index is best-effort
            _LOGGER.warning("Remote store index unavailable, using bundled")
            return []

    async def _index(self) -> dict[str, dict[str, Any]]:
        entries: dict[str, dict[str, Any]] = {}
        for entry in self._bundled_index():
            entries[entry["domain"]] = entry
        for entry in await self._remote_index():
            entries[entry["domain"]] = entry
        return entries

    async def catalog(self) -> list[StoreItem]:
        index = await self._index()
        installed = {i["domain"]: i for i in await storage.list_installed()}
        items: list[StoreItem] = []
        for domain, entry in index.items():
            latest = entry.get("version", "0.0.0")
            if domain in installed:
                current = installed[domain]["version"]
                if _is_newer(latest, current):
                    status = "update_available"
                    latest_version = latest
                    version = current
                else:
                    status = "installed"
                    latest_version = None
                    version = current
            else:
                status = "available"
                latest_version = None
                version = latest
            items.append(
                StoreItem(
                    domain=domain,
                    name=entry.get("name", domain),
                    description=entry.get("description", ""),
                    category=entry.get("category", "service"),
                    version=version,
                    author=entry.get("author", "Community"),
                    status=status,
                    protocols=entry.get("protocols", []),
                    latest_version=latest_version,
                    source=entry.get("source"),
                )
            )
        return items

    # -- source resolution ---------------------------------------------------

    def _bundled_source_dir(self, name: str) -> Path:
        return Path(settings.bundled_integrations_dir).resolve() / name

    async def _run(self, *args: str) -> None:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate()
        if proc.returncode != 0:
            raise IntegrationError(
                f"Command failed ({' '.join(args)}): {out.decode(errors='replace')}"
            )

    async def _fetch_to(self, source: str, ref: str | None, dest: Path) -> None:
        """Materialize an integration's source into `dest`."""
        if source.startswith("local:"):
            src = self._bundled_source_dir(source[len("local:") :])
            if not src.exists():
                raise IntegrationError(f"Bundled source not found: {src}")
            shutil.copytree(src, dest)
            return
        if source.startswith("file://") or Path(source).exists():
            src = Path(source[len("file://") :] if source.startswith("file://") else source)
            if not src.exists():
                raise IntegrationError(f"Local source not found: {src}")
            shutil.copytree(src, dest)
            return
        # Otherwise treat as a Git URL.
        args = ["git", "clone", "--depth", "1"]
        if ref:
            args += ["--branch", ref]
        args += [source, str(dest)]
        await self._run(*args)
        shutil.rmtree(dest / ".git", ignore_errors=True)

    def _load_manifest(self, package_dir: Path) -> dict[str, Any]:
        manifest_path = package_dir / "manifest.json"
        if not manifest_path.exists():
            raise IntegrationError("manifest.json missing in integration package")
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise IntegrationError(f"Invalid manifest.json: {exc}") from exc
        if not manifest.get("domain"):
            raise IntegrationError("manifest.json missing 'domain'")
        if not manifest.get("version"):
            raise IntegrationError("manifest.json missing 'version'")
        if not (package_dir / "__init__.py").exists():
            raise IntegrationError("integration package missing __init__.py")
        return manifest

    async def _install_requirements(self, manifest: dict[str, Any]) -> None:
        reqs = manifest.get("requirements") or []
        if not reqs:
            return
        await self._run("uv", "pip", "install", "--system", *reqs)

    async def _resolve_source_ref(
        self, domain: str, source: str | None, ref: str | None
    ) -> tuple[str, str | None]:
        if source:
            return source, ref
        index = await self._index()
        entry = index.get(domain)
        if not entry or not entry.get("source"):
            raise IntegrationError(f"No source known for integration '{domain}'")
        return entry["source"], ref or entry.get("ref")

    # -- install / update / uninstall ---------------------------------------

    async def install(
        self,
        domain: str | None = None,
        source: str | None = None,
        ref: str | None = None,
    ) -> None:
        resolved_source, resolved_ref = await self._resolve_source_ref(
            domain or "", source, ref
        )
        with tempfile.TemporaryDirectory() as tmp:
            staging = Path(tmp) / "pkg"
            await self._fetch_to(resolved_source, resolved_ref, staging)
            manifest = self._load_manifest(staging)
            resolved_domain = manifest["domain"]
            if domain and domain != resolved_domain:
                raise IntegrationError(
                    f"Manifest domain '{resolved_domain}' != requested '{domain}'"
                )
            await self._install_requirements(manifest)

            target = self._manager.integrations_dir / resolved_domain
            if target.exists():
                raise IntegrationError(f"'{resolved_domain}' already installed")
            shutil.copytree(staging, target)

        await storage.upsert_installed(
            domain=resolved_domain,
            version=manifest["version"],
            source=resolved_source,
            pinned_ref=resolved_ref,
            manifest=manifest,
        )
        await self._manager.load(resolved_domain)

    async def update(self, domain: str) -> None:
        record = await storage.get_installed(domain)
        if record is None:
            raise IntegrationError(f"'{domain}' is not installed")
        source = record.get("source")
        if not source:
            raise IntegrationError(f"No source recorded for '{domain}'")
        _, ref = await self._resolve_source_ref(domain, source, record.get("pinned_ref"))

        target = self._manager.integrations_dir / domain
        backup = target.with_name(f"{domain}.bak")

        await self._manager.unload(domain)
        if backup.exists():
            shutil.rmtree(backup, ignore_errors=True)
        if target.exists():
            target.rename(backup)

        try:
            with tempfile.TemporaryDirectory() as tmp:
                staging = Path(tmp) / "pkg"
                await self._fetch_to(source, ref, staging)
                manifest = self._load_manifest(staging)
                await self._install_requirements(manifest)
                shutil.copytree(staging, target)
            await storage.upsert_installed(
                domain=domain,
                version=manifest["version"],
                source=source,
                pinned_ref=ref,
                manifest=manifest,
            )
            await self._manager.load(domain)
        except Exception:
            # Roll back to the previous version so the system stays functional.
            _LOGGER.exception("Update of '%s' failed, rolling back", domain)
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
            if backup.exists():
                backup.rename(target)
            await self._manager.load(domain)
            raise
        finally:
            if backup.exists():
                shutil.rmtree(backup, ignore_errors=True)

    async def uninstall(self, domain: str) -> None:
        record = await storage.get_installed(domain)
        if record is None:
            raise IntegrationError(f"'{domain}' is not installed")

        # Collect owned ids BEFORE unload clears the registry, so we can scrub
        # references from the persisted plan/widgets (fully clean uninstall).
        registry = self._manager._registry  # noqa: SLF001 - internal wiring
        device_ids = registry.device_ids_for_domain(domain)
        room_ids = registry.room_ids_for_domain(domain)
        widget_ids = registry.widget_ids_for_domain(domain)

        await self._manager.unload(domain)

        target = self._manager.integrations_dir / domain
        if target.exists():
            shutil.rmtree(target, ignore_errors=True)

        await storage.remove_installed(domain)
        await self._scrub_references(domain, device_ids, room_ids, widget_ids)

    async def _scrub_references(
        self,
        domain: str,
        device_ids: set[str],
        room_ids: set[str],
        widget_ids: set[str],
    ) -> None:
        prefix = f"{domain}:"

        raw_plan = await storage.kv_get("plan_layout")
        if raw_plan:
            layout = PlanLayout.model_validate(raw_plan)
            layout.devices = [
                d
                for d in layout.devices
                if d.device_id not in device_ids and not d.device_id.startswith(prefix)
            ]
            layout.rooms = [r for r in layout.rooms if r.room_id not in room_ids]
            await storage.kv_set(
                "plan_layout", layout.model_dump(by_alias=True, exclude_none=True)
            )

        raw_widgets = await storage.kv_get("widgets_layout")
        if raw_widgets:
            kept = [
                w
                for w in raw_widgets
                if w.get("id") not in widget_ids
                and not str(w.get("id", "")).startswith(prefix)
                and w.get("deviceId") not in device_ids
            ]
            if kept:
                await storage.kv_set("widgets_layout", kept)
            else:
                await storage.kv_delete("widgets_layout")

    async def add_custom_repo(self, url: str) -> None:
        await storage.add_custom_repo(url)
        await self.install(source=url)
