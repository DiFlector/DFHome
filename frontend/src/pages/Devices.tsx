import { Link } from "react-router-dom"
import { Package } from "lucide-react"

import { devicesByRoom } from "@/lib/device-utils"
import { DeviceCard } from "@/components/DeviceCard"
import { useDevices } from "@/hooks/use-devices"
import { useRooms } from "@/hooks/use-rooms"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"

export default function Devices() {
  const { devices, isLoading: devicesLoading } = useDevices()
  const { rooms, isLoading: roomsLoading } = useRooms()
  const grouped = devicesByRoom(rooms, devices)

  if (devicesLoading || roomsLoading) {
    return <p className="text-muted-foreground text-sm">Загрузка устройств…</p>
  }

  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Package className="text-muted-foreground size-12" />
        <div className="space-y-1">
          <p className="font-medium">Устройств пока нет</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Установите интеграцию «Демо» из магазина, чтобы увидеть виртуальные
            устройства умного дома.
          </p>
        </div>
        <Link to="/store" className={buttonVariants()}>
          Открыть магазин
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Карточный список комнат и устройств. Управление и показания датчиков —
        прямо из карточек.
      </p>
      {grouped.map(({ room, devices: roomDevices }) => (
        <section key={room.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-lg font-semibold">{room.name}</h2>
            <Badge variant="secondary" className="font-normal">
              {roomDevices.length}
            </Badge>
          </div>
          {roomDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет устройств</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {roomDevices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
