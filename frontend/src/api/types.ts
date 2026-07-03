export type ControlKind = "switch" | "slider" | "color" | "mode" | "unsupported";

export interface ControlSpec {
  kind: ControlKind;
  capability_type: string;
  instance: string;
  label: string;
  value: unknown;
  min?: number | null;
  max?: number | null;
  precision?: number | null;
  unit?: string | null;
  options?: string[] | null;
  color_model?: string | null;
  retrievable: boolean;
}

export interface PropertySpec {
  property_type: string;
  instance: string;
  label: string;
  value: unknown;
  unit?: string | null;
}

export interface DeviceView {
  id: string;
  name: string;
  type: string;
  room?: string | null;
  household_id?: string | null;
  online: boolean;
  controls: ControlSpec[];
  properties: PropertySpec[];
}

export interface RoomView {
  id: string;
  name: string;
  devices: DeviceView[];
}

export interface ScenarioSummary {
  id: string;
  name: string;
  icon?: string | null;
  is_active: boolean;
}

export interface HomeView {
  rooms: RoomView[];
  unassigned_devices: DeviceView[];
  scenarios: ScenarioSummary[];
}

export interface SettingsView {
  has_oauth_token: boolean;
  has_quasar_x_token: boolean;
  oauth_token_preview?: string | null;
  quasar_x_token_preview?: string | null;
}

export interface SettingsUpdate {
  yandex_oauth_token?: string | null;
  quasar_x_token?: string | null;
}

export interface QuasarLoginResult {
  ok: boolean;
  display_login?: string | null;
  error?: string | null;
}

export interface ConnectionTestResult {
  official_api: boolean;
  official_api_error?: string | null;
  quasar_api: boolean;
  quasar_api_error?: string | null;
}

export type TriggerKind = "voice_phrase" | "device_property" | "schedule";

export interface ScenarioTrigger {
  kind: TriggerKind;
  phrase?: string | null;
  device_id?: string | null;
  property_type?: string | null;
  property_instance?: string | null;
  operator?: "gt" | "lt" | null;
  value?: unknown;
  cron?: string | null;
  time_of_day?: string | null;
  days_of_week?: number[] | null;
}

export type ActionKind = "device_capability" | "tts" | "run_scenario";

export interface ScenarioAction {
  kind: ActionKind;
  device_id?: string | null;
  capability_type?: string | null;
  instance?: string | null;
  value?: unknown;
  text?: string | null;
  scenario_id?: string | null;
}

export interface ScenarioPayload {
  name: string;
  icon?: string | null;
  triggers: ScenarioTrigger[];
  actions: ScenarioAction[];
}

export interface ScenarioDetail extends ScenarioPayload {
  id: string;
}

// -- Floor plan ---------------------------------------------------------

export interface PlanRoom {
  room_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanDevicePosition {
  device_id: string;
  x: number;
  y: number;
}

export interface PlanLayout {
  rooms: PlanRoom[];
  devices: PlanDevicePosition[];
}

// -- Widgets --------------------------------------------------------------

export interface WeatherWidget {
  id: string;
  kind: "weather";
  query: string;
}

export interface RoomSensorWidget {
  id: string;
  kind: "room_sensor";
  device_id: string;
  device_name: string;
  property_instance: string;
  label: string;
}

export interface SensorChartWidget {
  id: string;
  kind: "sensor_chart";
  device_id: string;
  device_name: string;
  property_instance: string;
  label: string;
  unit?: string | null;
}

export type Widget = WeatherWidget | RoomSensorWidget | SensorChartWidget;

export interface HistoryPoint {
  ts: number;
  value: number;
}

export type DeviceHistory = Record<string, HistoryPoint[]>;

export interface WeatherData {
  city: string;
  lat: number;
  lon: number;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  weather_code: number | null;
}
