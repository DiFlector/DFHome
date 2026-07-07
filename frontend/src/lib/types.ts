/**
 * Единая модель устройств DFHome (frontend-зеркало ядра).
 *
 * Соответствует docs/ARCHITECTURE.md ("Единая модель устройств"):
 * Device -> Entity -> Capability / Property -> Room.
 * Модель вендор-независима: UI, план дома и виджеты работают с ней одинаково,
 * независимо от источника устройства (интеграции).
 */

/** Управляемая функция: как её рисовать в UI. */
export type CapabilityKind =
  | "switch"
  | "slider"
  | "color"
  | "mode"
  | "unsupported";

/** Управляемая функция сущности (on/off, яркость, цвет, режим, ...). */
export interface Capability {
  kind: CapabilityKind;
  /** Стабильный идентификатор функции внутри сущности (например, "on"). */
  instance: string;
  label: string;
  value: unknown;
  /** slider */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** mode / enum */
  options?: string[];
  /** color */
  colorModel?: "hsv" | "rgb" | "temperature_k";
}

/** Телеметрия только на чтение (температура, влажность, батарея, движение). */
export type PropertyKind =
  | "temperature"
  | "humidity"
  | "battery"
  | "motion"
  | "power"
  | "illuminance"
  | "co2"
  | string;

export interface Property {
  kind: PropertyKind;
  instance: string;
  label: string;
  value: number | string | boolean | null;
  unit?: string;
}

/** Конкретная функция устройства (устройство может иметь несколько сущностей). */
export interface Entity {
  id: string;
  name: string;
  capabilities: Capability[];
  properties: Property[];
}

export type DeviceType =
  | "light"
  | "switch"
  | "socket"
  | "sensor"
  | "thermostat"
  | "media_device"
  | "other";

/** Физическое или логическое устройство. `id` включает домен интеграции. */
export interface Device {
  /** Глобально уникальный id, с префиксом интеграции (например "yandex:abc"). */
  id: string;
  /** Домен интеграции-владельца. */
  integration: string;
  name: string;
  type: DeviceType;
  roomId: string | null;
  online: boolean;
  entities: Entity[];
}

/** Группировка устройств; используется планом дома и виджетами. */
export interface Room {
  id: string;
  name: string;
  /** Иконка (lucide-имя) для UI. */
  icon?: string;
}

// ---------------------------------------------------------------------------
// Визуальный план дома
// ---------------------------------------------------------------------------

/** Комната, нарисованная прямоугольником на canvas плана. */
export interface PlanRoom {
  roomId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Как устройство отображается именно на плане. */
export type PlanDeviceVisualKind = "bulb" | "strip";

export interface PlanDevicePosition {
  deviceId: string;
  /** Fallback-позиция маркера; сохраняется даже для режима strip. */
  x: number;
  y: number;
  /** `strip` рисует источник света вокруг attachedRoomId. */
  visualKind: PlanDeviceVisualKind;
  attachedRoomId?: string | null;
}

export interface PlanLayout {
  rooms: PlanRoom[];
  devices: PlanDevicePosition[];
}

// ---------------------------------------------------------------------------
// Виджеты дашборда
// ---------------------------------------------------------------------------

export type WidgetKind = "weather" | "sensor" | "media" | "devices_summary";

export interface WeatherWidget {
  kind: "weather";
  id: string;
  title: string;
  location: string;
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
}

export interface SensorWidget {
  kind: "sensor";
  id: string;
  title: string;
  /** Id устройства, свойства которого отображает виджет. */
  deviceId: string;
}

export interface MediaWidget {
  kind: "media";
  id: string;
  title: string;
  deviceId: string;
  track: string;
  artist: string;
  playing: boolean;
}

export interface DevicesSummaryWidget {
  kind: "devices_summary";
  id: string;
  title: string;
  /** total/online/active вычисляются живьём через useDevices. */
}

export type Widget =
  | WeatherWidget
  | SensorWidget
  | MediaWidget
  | DevicesSummaryWidget;

// ---------------------------------------------------------------------------
// Магазин интеграций (модель HACS)
// ---------------------------------------------------------------------------

export type IntegrationCategory =
  | "protocol"
  | "service"
  | "sensor"
  | "media"
  | "weather";

export type StoreItemStatus = "installed" | "available" | "update_available";

export interface StoreItem {
  domain: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  version: string;
  author: string;
  status: StoreItemStatus;
  /** Заявленные протоколы для маршрутизации авто-обнаружения. */
  protocols: string[];
  /** Доступная версия при status === "update_available". */
  latestVersion?: string;
}
