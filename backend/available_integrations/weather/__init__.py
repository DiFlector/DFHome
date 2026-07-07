"""Weather service stub.

A real weather integration would fetch a forecast for the configured region and
contribute a weather widget. The demo integration provides the mock weather
widget for the showcase.
"""
from app.core.context import IntegrationContext


async def setup(ctx: IntegrationContext) -> None:
    return None


async def unload(ctx: IntegrationContext) -> None:
    return None
