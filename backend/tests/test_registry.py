"""Registry: state push updates devices; clearing a domain leaves no residue."""
from app.core.events import EventBus, WsManager
from app.core.models import Capability, Device, Entity, Room
from app.core.registry import DeviceRegistry


def _device(value: bool = False) -> Device:
    return Device(
        id="demo:light",
        integration="demo",
        name="Light",
        type="light",
        entities=[
            Entity(
                id="demo:light:main",
                name="Light",
                capabilities=[Capability(kind="switch", instance="on", label="On", value=value)],
            )
        ],
    )


async def test_push_state_updates_device():
    registry = DeviceRegistry(EventBus(), WsManager())
    registry.register_device("demo", _device(False))
    await registry.push_state(_device(True))
    device = registry.get_device("demo:light")
    assert device.entities[0].capabilities[0].value is True


def test_clear_domain_removes_everything():
    registry = DeviceRegistry(EventBus(), WsManager())
    registry.register_device("demo", _device())
    registry.register_room("demo", Room(id="living", name="Living"))
    assert registry.all_devices()
    assert registry.all_rooms()

    registry.clear_domain("demo")
    assert registry.all_devices() == []
    assert registry.all_rooms() == []
    assert registry.device_ids_for_domain("demo") == set()
