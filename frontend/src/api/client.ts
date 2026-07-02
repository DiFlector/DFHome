import axios from "axios";
import type {
  ConnectionTestResult,
  DeviceView,
  HomeView,
  QuasarLoginResult,
  ScenarioDetail,
  ScenarioPayload,
  ScenarioSummary,
  SettingsUpdate,
  SettingsView,
} from "./types";

export const api = axios.create({ baseURL: "/api" });

// Extracts the backend's clean error message (see app/main.py exception
// handlers) instead of surfacing a generic axios error.
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (error.response?.status === 428) {
      return "Требуется настройка токена. Перейдите в Настройки.";
    }
  }
  return "Не удалось выполнить запрос";
}

export const endpoints = {
  getHome: () => api.get<HomeView>("/home").then((r) => r.data),

  getDevice: (id: string) => api.get<DeviceView>(`/devices/${id}`).then((r) => r.data),

  deviceAction: (id: string, capability_type: string, instance: string, value: unknown) =>
    api
      .post<DeviceView>(`/devices/${id}/action`, { capability_type, instance, value })
      .then((r) => r.data),

  getScenarios: () => api.get<ScenarioSummary[]>("/scenarios").then((r) => r.data),

  getScenarioForEdit: (id: string) =>
    api.get<ScenarioDetail>(`/scenarios/${id}/edit`).then((r) => r.data),

  runScenario: (id: string) => api.post(`/scenarios/${id}/run`).then((r) => r.data),

  createScenario: (payload: ScenarioPayload) =>
    api.post("/scenarios", payload).then((r) => r.data),

  updateScenario: (id: string, payload: ScenarioPayload) =>
    api.put(`/scenarios/${id}`, payload).then((r) => r.data),

  deleteScenario: (id: string) => api.delete(`/scenarios/${id}`).then((r) => r.data),

  getSettings: () => api.get<SettingsView>("/settings").then((r) => r.data),

  updateSettings: (update: SettingsUpdate) =>
    api.put<SettingsView>("/settings", update).then((r) => r.data),

  quasarLogin: (cookies: string) =>
    api.post<QuasarLoginResult>("/settings/quasar-login", { cookies }).then((r) => r.data),

  testConnection: () =>
    api.post<ConnectionTestResult>("/settings/test-connection").then((r) => r.data),
};
