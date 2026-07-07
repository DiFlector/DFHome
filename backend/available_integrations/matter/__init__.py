"""Matter / Thread protocol-adapter stub (see zigbee for rationale)."""
from app.core.context import IntegrationContext


async def setup(ctx: IntegrationContext) -> None:
    return None


async def unload(ctx: IntegrationContext) -> None:
    return None
