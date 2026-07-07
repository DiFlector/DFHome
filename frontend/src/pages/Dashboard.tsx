import { Link } from "react-router-dom"
import {
  Cloud,
  Droplets,
  Wind,
  Play,
  Pause,
  Activity,
  Cpu,
  SkipBack,
  SkipForward,
  Package,
} from "lucide-react"

import type { Widget } from "@/lib/types"
import { devicesSummary } from "@/lib/device-utils"
import { useDevices } from "@/hooks/use-devices"
import { useWidgets } from "@/hooks/use-widgets"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function WeatherCard({ w }: { w: Extract<Widget, { kind: "weather" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{w.title}</span>
          <span className="text-muted-foreground text-sm font-normal">
            {w.location}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <Cloud className="text-muted-foreground size-10" />
          <div>
            <div className="text-3xl font-semibold tabular-nums">
              {w.temperature}°
            </div>
            <div className="text-muted-foreground text-sm">{w.condition}</div>
          </div>
        </div>
        <div className="text-muted-foreground mt-4 flex gap-4 text-sm">
          <span className="flex items-center gap-1">
            <Droplets className="size-4" /> {w.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind className="size-4" /> {w.windSpeed} м/с
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryCard({ title }: { title: string }) {
  const { devices } = useDevices()
  const summary = devicesSummary(devices)
  const stats = [
    { label: "Всего", value: summary.total },
    { label: "Онлайн", value: summary.online },
    { label: "Активны", value: summary.active },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="text-muted-foreground size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md bg-muted/50 p-3 text-center">
              <div className="text-2xl font-semibold tabular-nums">
                {s.value}
              </div>
              <div className="text-muted-foreground text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function SensorCard({ w }: { w: Extract<Widget, { kind: "sensor" }> }) {
  const { getDevice } = useDevices()
  const properties =
    getDevice(w.deviceId)?.entities.flatMap((entity) => entity.properties) ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="text-muted-foreground size-4" />
          {w.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {properties.map((p) => (
          <div
            key={p.instance}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums">
              {p.value ?? "—"}
              {p.value !== null && p.unit ? ` ${p.unit}` : ""}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function MediaCard({ w }: { w: Extract<Widget, { kind: "media" }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{w.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <div className="truncate font-medium">{w.track}</div>
          <div className="text-muted-foreground truncate text-sm">
            {w.artist}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <SkipBack className="size-4" />
          </Button>
          <Button size="icon">
            {w.playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon">
            <SkipForward className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function renderWidget(w: Widget) {
  switch (w.kind) {
    case "weather":
      return <WeatherCard key={w.id} w={w} />
    case "devices_summary":
      return <SummaryCard key={w.id} title={w.title} />
    case "sensor":
      return <SensorCard key={w.id} w={w} />
    case "media":
      return <MediaCard key={w.id} w={w} />
  }
}

export default function Dashboard() {
  const { widgets, isLoading } = useWidgets()

  if (isLoading) {
    return (
      <p className="text-muted-foreground text-sm">Загрузка виджетов…</p>
    )
  }

  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <Package className="text-muted-foreground size-12" />
        <div className="space-y-1">
          <p className="font-medium">Дашборд пуст</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Установите интеграцию «Демо» из магазина, чтобы увидеть виджеты и
            устройства.
          </p>
        </div>
        <Link to="/store" className={buttonVariants()}>
          Открыть магазин
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Настраиваемый дашборд из виджетов интеграций.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {widgets.map(renderWidget)}
      </div>
    </div>
  )
}
