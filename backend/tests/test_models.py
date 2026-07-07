"""The unified model must serialize to the camelCase shape the frontend expects."""
from app.core.models import Capability, Device, Entity, PlanDevicePosition


def test_device_serializes_camel_case():
    device = Device(
        id="demo:x",
        integration="demo",
        name="X",
        type="light",
        room_id="living",
        entities=[
            Entity(
                id="demo:x:main",
                name="X",
                capabilities=[
                    Capability(
                        kind="color", instance="c", label="C", value=1, color_model="rgb"
                    )
                ],
            )
        ],
    )
    data = device.model_dump(by_alias=True, exclude_none=True)
    assert data["roomId"] == "living"
    cap = data["entities"][0]["capabilities"][0]
    assert cap["colorModel"] == "rgb"


def test_plan_position_accepts_camel_and_snake():
    from_camel = PlanDevicePosition.model_validate(
        {"deviceId": "demo:x", "x": 1, "y": 2, "visualKind": "strip", "attachedRoomId": "kitchen"}
    )
    assert from_camel.device_id == "demo:x"
    assert from_camel.attached_room_id == "kitchen"
    dumped = from_camel.model_dump(by_alias=True)
    assert dumped["visualKind"] == "strip"
