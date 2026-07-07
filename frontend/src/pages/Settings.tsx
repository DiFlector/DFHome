import * as React from "react"
import { Link } from "react-router-dom"
import { Puzzle, SlidersHorizontal } from "lucide-react"
import { toast } from "sonner"

import { useSettings } from "@/hooks/use-settings"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function Settings() {
  const { settings, integrations, isLoading, saveSettings } = useSettings()
  const [hubName, setHubName] = React.useState("DFHome")
  const [darkDefault, setDarkDefault] = React.useState(false)
  const [localControl, setLocalControl] = React.useState(true)

  React.useEffect(() => {
    setHubName(String(settings.hubName ?? "DFHome"))
    setDarkDefault(Boolean(settings.darkDefault))
    setLocalControl(settings.localControl !== false)
  }, [settings])

  const handleSave = async () => {
    try {
      await saveSettings({
        hubName,
        darkDefault,
        localControl,
      })
      toast.success("Настройки сохранены")
    } catch {
      toast.error("Не удалось сохранить настройки")
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Загрузка настроек…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Общие настройки ядра и config entries установленных интеграций.
      </p>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <SlidersHorizontal className="size-4" />
            Общие
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Puzzle className="size-4" />
            Интеграции
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle className="text-base">Основные</CardTitle>
              <CardDescription>Параметры установки DFHome.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="hub-name">Название хаба</Label>
                <Input
                  id="hub-name"
                  value={hubName}
                  onChange={(e) => setHubName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data-dir">Каталог данных</Label>
                <Input id="data-dir" defaultValue="/data" readOnly />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">Тёмная тема по умолчанию</Label>
                  <p className="text-muted-foreground text-sm">
                    Использовать тёмную тему для новых сессий.
                  </p>
                </div>
                <Switch
                  checked={darkDefault}
                  onCheckedChange={setDarkDefault}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-normal">Локальное управление</Label>
                  <p className="text-muted-foreground text-sm">
                    Не использовать облако там, где возможно.
                  </p>
                </div>
                <Switch
                  checked={localControl}
                  onCheckedChange={setLocalControl}
                />
              </div>
              <Button onClick={() => void handleSave()}>Сохранить</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="mt-4 space-y-3">
          {integrations.length === 0 ? (
            <Card className="max-w-xl">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  Нет установленных интеграций.{" "}
                  <Link to="/store" className="text-foreground underline">
                    Откройте магазин
                  </Link>
                  , чтобы установить «Демо» или другие интеграции.
                </p>
              </CardContent>
            </Card>
          ) : (
            integrations.map((item) => (
              <Card key={item.domain} className="max-w-xl">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {(item.manifest.name as string) ?? item.domain}
                    <Badge variant="secondary" className="font-normal">
                      v{item.version}
                    </Badge>
                    {item.loaded ? (
                      <Badge variant="outline" className="font-normal">
                        Загружена
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="font-normal">
                        Ошибка загрузки
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {(item.manifest.description as string) ?? ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Домен: <code>{item.domain}</code>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast.info(`Настройка «${item.domain}» скоро`)
                    }
                  >
                    Настроить
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
