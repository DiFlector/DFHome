import {
  Lightbulb,
  Plug,
  Thermometer,
  Speaker,
  ToggleLeft,
  CircuitBoard,
  WifiOff,
} from "lucide-react"

import type { Device, DeviceType } from "@/lib/types"
import { DeviceControls } from "@/components/DeviceControls"
import { useDevices } from "@/hooks/use-devices"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const typeIcon: Record<DeviceType, React.ComponentType<{ className?: string }>> =
  {
    light: Lightbulb,
    socket: Plug,
    switch: ToggleLeft,
    sensor: Thermometer,
    thermostat: Thermometer,
    media_device: Speaker,
    other: CircuitBoard,
  }

export function DeviceCard({ device }: { device: Device }) {
  const { updateCapability } = useDevices()
  const Icon = typeIcon[device.type]
  const offline = !device.online

  return (
    <Card className={offline ? "opacity-60" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{device.name}</span>
          {offline && (
            <Badge variant="outline" className="ml-auto gap-1 font-normal">
              <WifiOff className="size-3" />
              Оффлайн
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DeviceControls
          device={device}
          onCapabilityChange={updateCapability}
        />
      </CardContent>
    </Card>
  )
}
