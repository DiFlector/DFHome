import { useState } from "react"
import {
  Check,
  Download,
  RefreshCw,
  Bluetooth,
  Radio,
  Cloud,
  Network,
  Gauge,
  Loader2,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import type { IntegrationCategory, StoreItem } from "@/lib/types"
import { useStore } from "@/hooks/use-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const categoryLabel: Record<IntegrationCategory, string> = {
  protocol: "Протокол",
  service: "Сервис",
  sensor: "Датчики",
  media: "Медиа",
  weather: "Погода",
}

const protocolIcon: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  bluetooth: Bluetooth,
  zigbee: Radio,
  matter: Network,
  cloud: Cloud,
  wifi: Gauge,
}

function StoreCard({
  item,
  onInstall,
  onUpdate,
  onUninstall,
  busy,
}: {
  item: StoreItem
  onInstall: (domain: string) => Promise<void>
  onUpdate: (domain: string) => Promise<void>
  onUninstall: (domain: string) => Promise<void>
  busy: string | null
}) {
  const Icon = protocolIcon[item.protocols[0]] ?? Network
  const isBusy = busy === item.domain

  const handleInstall = async () => {
    try {
      await onInstall(item.domain)
      toast.success(`${item.name}: установлено`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка установки")
    }
  }

  const handleUpdate = async () => {
    try {
      await onUpdate(item.domain)
      toast.success(`${item.name}: обновлено`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка обновления")
    }
  }

  const handleUninstall = async () => {
    try {
      await onUninstall(item.domain)
      toast.success(`${item.name}: удалено`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка удаления")
    }
  }

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-start gap-2 text-base">
          <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate">{item.name}</div>
            <div className="text-muted-foreground text-xs font-normal">
              {item.author} · v{item.version}
              {item.latestVersion ? ` → v${item.latestVersion}` : ""}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        <p className="text-muted-foreground text-sm">{item.description}</p>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="font-normal">
            {categoryLabel[item.category]}
          </Badge>
          {item.protocols.map((p) => (
            <Badge key={p} variant="outline" className="font-normal">
              {p}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        {item.status === "installed" ? (
          <>
            <Button variant="outline" className="w-full" disabled>
              <Check className="size-4" />
              Установлено
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground w-full"
              disabled={isBusy}
              onClick={() => void handleUninstall()}
            >
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Удалить
            </Button>
          </>
        ) : item.status === "update_available" ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={isBusy}
            onClick={() => void handleUpdate()}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Обновить до v{item.latestVersion}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={isBusy}
            onClick={() => void handleInstall()}
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Установить
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default function Store() {
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const { items, isLoading, install, update, uninstall } = useStore()

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(query.toLowerCase()) ||
      i.description.toLowerCase().includes(query.toLowerCase()),
  )

  const wrap =
    (fn: (domain: string) => Promise<void>) => async (domain: string) => {
      setBusy(domain)
      try {
        await fn(domain)
      } finally {
        setBusy(null)
      }
    }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Загрузка каталога…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Каталог интеграций (модель HACS): протокол-адаптеры и сервисы из
        Git-репозиториев. Начните с интеграции «Демо» — она наполнит приложение
        виртуальными устройствами.
      </p>
      <Input
        placeholder="Поиск интеграций…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <StoreCard
            key={item.domain}
            item={item}
            busy={busy}
            onInstall={wrap(install)}
            onUpdate={wrap(update)}
            onUninstall={wrap(uninstall)}
          />
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">Ничего не найдено</p>
      )}
    </div>
  )
}
