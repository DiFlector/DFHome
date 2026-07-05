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
  color_active?: boolean | null;
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
  metric_thresholds: MetricThresholds;
}

export interface TempThresholds {
  norm_lo: number;
  norm_hi: number;
}

export interface HumidityThresholds {
  norm_lo: number;
  norm_hi: number;
  margin: number;
}

export interface BatteryThresholds {
  good_min: number;
  ok_min: number;
}

export interface MetricThresholds {
  temp: TempThresholds;
  humidity: HumidityThresholds;
  battery: BatteryThresholds;
}

export interface SettingsUpdate {
  yandex_oauth_token?: string | null;
  quasar_x_token?: string | null;
  metric_thresholds?: MetricThresholds;
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
  /** When set (e.g. an LED strip), the device is drawn as a glowing outline
      around this plan room instead of a point marker. x/y are kept as the
      fallback marker position. */
  outline_room_id?: string | null;
}

export interface PlanLayout {
  rooms: PlanRoom[];
  devices: PlanDevicePosition[];
}

// -- Widgets --------------------------------------------------------------

/** Fixed tile sizes on a 4-column grid (base unit = S, height 0.5× width):
    s — 1×0.5; m — 2×2; l — 4×2. */
export type WidgetSize = "s" | "m" | "l";

export interface WeatherWidget {
  id: string;
  kind: "weather";
  query: string;
  size?: WidgetSize;
  grid_row?: number;
  grid_col?: number;
}

export interface RoomSensorWidget {
  id: string;
  kind: "room_sensor";
  device_id: string;
  device_name: string;
  property_instance: string;
  label: string;
  size?: WidgetSize;
  grid_row?: number;
  grid_col?: number;
}

export interface SensorChartWidget {
  id: string;
  kind: "sensor_chart";
  device_id: string;
  device_name: string;
  property_instance: string;
  label: string;
  unit?: string | null;
  size?: WidgetSize;
  grid_row?: number;
  grid_col?: number;
}

export interface StationWidget {
  id: string;
  kind: "station";
  device_id: string;
  device_name: string;
  size?: WidgetSize;
  grid_row?: number;
  grid_col?: number;
}

export type Widget = WeatherWidget | RoomSensorWidget | SensorChartWidget | StationWidget;

// -- Yandex Station (glagol) ----------------------------------------------

export interface StationInfo {
  id: string;
  name: string;
  platform: string;
  online: boolean;
}

export interface StationState {
  device_id: string;
  device_name: string;
  playing: boolean;
  volume: number | null;
  alice_state?: string | null;
  title: string | null;
  artist: string | null;
  duration: number | null;
  progress: number | null;
  has_prev: boolean;
  has_next: boolean;
  cover_url: string | null;
}

export type StationCommand = "play" | "stop" | "next" | "prev" | "rewind" | "setVolume";

export interface HistoryPoint {
  ts: number;
  value: number;
}

export interface DeviceHistory {
  series: Record<string, HistoryPoint[]>;
  latest: Record<string, HistoryPoint>;
}

export interface WeatherHourly {
  time: string; // local time of the city, "YYYY-MM-DDTHH:mm"
  precipitation_probability: number | null;
  precipitation: number | null;
  weather_code: number | null;
}

export interface WeatherData {
  city: string;
  lat: number;
  lon: number;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  weather_code: number | null;
  precipitation: number | null;
  hourly: WeatherHourly[];
}
