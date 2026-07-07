"""Zigbee protocol-adapter stub.

Placeholder integration to demonstrate the store install/update/uninstall
lifecycle. A real adapter would discover a USB coordinator (zigpy/ZHA) and
register discovered devices via the context.
"""
from app.core.context import IntegrationContext


async def setup(ctx: IntegrationContext) -> None:
    # No hardware in the demo environment: register nothing.
    return None


async def unload(ctx: IntegrationContext) -> None:
    return None
