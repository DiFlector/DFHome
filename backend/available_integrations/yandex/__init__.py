"""Yandex Smart Home stub.

Placeholder for the future port of the legacy Yandex client into a proper
integration (see docs/VISION.md — Yandex becomes one integration, not the core).
Registers nothing until credentials/config are wired up.
"""
from app.core.context import IntegrationContext


async def setup(ctx: IntegrationContext) -> None:
    return None


async def unload(ctx: IntegrationContext) -> None:
    return None
