import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiErrorMessage, endpoints } from "../api/client";
import type { MetricThresholds } from "../api/types";
import { DEFAULT_METRIC_THRESHOLDS } from "../utils/metricStatus";

function validateMetricThresholds(m: MetricThresholds): string | null {
  if (m.temp.norm_lo >= m.temp.norm_hi) return "Температура: минимум нормы должен быть меньше максимума.";
  if (m.humidity.norm_lo >= m.humidity.norm_hi) return "Влажность: минимум нормы должен быть меньше максимума.";
  if (m.humidity.margin < 0) return "Влажность: жёлтая зона не может быть отрицательной.";
  if (m.battery.ok_min >= m.battery.good_min) return "Батарея: порог жёлтого должен быть ниже порога зелёного.";
  return null;
}

function MetricInput({
  label,
  suffix,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  suffix?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="metric-input-field">
      <span className="metric-input-label">{label}</span>
      <span className="metric-input-wrap">
        <input
          type="number"
          className="metric-input"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {suffix && <span className="metric-input-suffix">{suffix}</span>}
      </span>
    </label>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: endpoints.getSettings });

  const [oauthToken, setOauthToken] = useState("");
  const [quasarCookies, setQuasarCookies] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [metricThresholds, setMetricThresholds] = useState<MetricThresholds>(DEFAULT_METRIC_THRESHOLDS);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.metric_thresholds) setMetricThresholds(data.metric_thresholds);
  }, [data?.metric_thresholds]);

  const saveOauthMutation = useMutation({
    mutationFn: endpoints.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setOauthToken("");
    },
  });

  const quasarLoginMutation = useMutation({
    mutationFn: endpoints.quasarLogin,
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ["settings"] });
        setQuasarCookies("");
      }
    },
  });

  const saveMetricsMutation = useMutation({
    mutationFn: (thresholds: MetricThresholds) => endpoints.updateSettings({ metric_thresholds: thresholds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setMetricsError(null);
    },
  });

  const testMutation = useMutation({ mutationFn: endpoints.testConnection });

  const exportMutation = useMutation({
    mutationFn: endpoints.exportConfig,
    onSuccess: (config) => {
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dfhome-config.json";
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const importMutation = useMutation({
    mutationFn: endpoints.importConfig,
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const handleImportFile = async (file: File) => {
    setImportError(null);
    importMutation.reset();
    try {
      const payload = JSON.parse(await file.text());
      importMutation.mutate(payload);
    } catch {
      setImportError("Не удалось прочитать файл: это не JSON.");
    }
  };

  const handleSaveOauth = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oauthToken.trim()) return;
    saveOauthMutation.mutate({ yandex_oauth_token: oauthToken.trim() });
  };

  const handleSaveMetrics = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateMetricThresholds(metricThresholds);
    if (err) {
      setMetricsError(err);
      return;
    }
    saveMetricsMutation.mutate(metricThresholds);
  };

  const handleQuasarLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quasarCookies.trim()) return;
    quasarLoginMutation.mutate(quasarCookies.trim());
  };

  return (
    <div className="settings-page">
      <h2>Настройки</h2>

      {isLoading && <p className="loading">Загрузка…</p>}

      {data && (
        <div className="banner info settings-status">
          OAuth-токен: {data.has_oauth_token ? `настроен (${data.oauth_token_preview})` : "не настроен"}
          {" · "}
          Вход для сценариев: {data.has_quasar_x_token ? "выполнен" : "не выполнен"}
        </div>
      )}

      <div className="settings-grid">
        <div className="settings-col">
          <div className="card">
            <h3 className="settings-card-title">OAuth-токен</h3>
            <p className="settings-card-desc">Устройства, управление и запуск сценариев через api.iot.yandex.net.</p>
            <form onSubmit={handleSaveOauth}>
              <div className="form-field">
                <label>Токен</label>
                <input
                  type="password"
                  placeholder="AgAAAA...."
                  value={oauthToken}
                  onChange={(e) => setOauthToken(e.target.value)}
                />
                <small>
                  Получите на{" "}
                  <a href="https://oauth.yandex.ru/" target="_blank" rel="noreferrer">
                    oauth.yandex.ru
                  </a>{" "}
                  со scope iot:view + iot:control.
                </small>
              </div>
              <button className="primary" type="submit" disabled={saveOauthMutation.isPending}>
                Сохранить токен
              </button>
              {saveOauthMutation.isError && (
                <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {apiErrorMessage(saveOauthMutation.error)}
                </div>
              )}
              {saveOauthMutation.isSuccess && (
                <div className="banner success" style={{ marginTop: 16, marginBottom: 0 }}>
                  Сохранено
                </div>
              )}
            </form>
          </div>

          <div className="card">
            <h3 className="settings-card-title">Вход для сценариев</h3>
            <p className="settings-card-desc">Создание и редактирование сценариев через неофициальный API.</p>
            <div className="banner info" style={{ marginBottom: 14 }}>
              Сессия обменивается на долгоживущий токен один раз — повторно вставлять cookie не нужно.
            </div>
            <form onSubmit={handleQuasarLogin}>
              <div className="form-field">
                <label>Cookie сессии yandex.ru</label>
                <textarea
                  rows={4}
                  placeholder="Session_id=...; yandexuid=...; ..."
                  value={quasarCookies}
                  onChange={(e) => setQuasarCookies(e.target.value)}
                />
                <small>
                  DevTools (F12) → Network → запрос к yandex.ru → заголовок Cookie → скопируйте целиком.
                </small>
              </div>
              <button className="primary" type="submit" disabled={quasarLoginMutation.isPending}>
                Войти
              </button>
              {quasarLoginMutation.data && !quasarLoginMutation.data.ok && (
                <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {quasarLoginMutation.data.error}
                </div>
              )}
              {quasarLoginMutation.data?.ok && (
                <div className="banner success" style={{ marginTop: 16, marginBottom: 0 }}>
                  Успешно вошли
                  {quasarLoginMutation.data.display_login ? ` как ${quasarLoginMutation.data.display_login}` : ""}
                </div>
              )}
              {quasarLoginMutation.isError && (
                <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {apiErrorMessage(quasarLoginMutation.error)}
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="settings-col">
          <div className="card">
            <h3 className="settings-card-title">Пороги метрик</h3>
            <p className="settings-card-desc">
              Цвета датчиков, погоды, графиков и индикатора комфорта комнат.
            </p>
            <form onSubmit={handleSaveMetrics}>
              <div className="metric-thresholds-grid">
                <div className="metric-threshold-block metric-threshold-block--temp">
                  <h4>Температура</h4>
                  <p>Зелёная — норма, синяя — ниже, красная — выше.</p>
                  <div className="metric-threshold-fields">
                    <MetricInput
                      label="Норма от"
                      suffix="°C"
                      step={0.5}
                      value={metricThresholds.temp.norm_lo}
                      onChange={(v) => setMetricThresholds((m) => ({ ...m, temp: { ...m.temp, norm_lo: v } }))}
                    />
                    <MetricInput
                      label="Норма до"
                      suffix="°C"
                      step={0.5}
                      value={metricThresholds.temp.norm_hi}
                      onChange={(v) => setMetricThresholds((m) => ({ ...m, temp: { ...m.temp, norm_hi: v } }))}
                    />
                  </div>
                </div>

                <div className="metric-threshold-block metric-threshold-block--humidity">
                  <h4>Влажность</h4>
                  <p>Зелёная — норма, жёлтая — ±N% от границ, красная — дальше.</p>
                  <div className="metric-threshold-fields">
                    <MetricInput
                      label="Норма от"
                      suffix="%"
                      value={metricThresholds.humidity.norm_lo}
                      onChange={(v) =>
                        setMetricThresholds((m) => ({ ...m, humidity: { ...m.humidity, norm_lo: v } }))
                      }
                    />
                    <MetricInput
                      label="Норма до"
                      suffix="%"
                      value={metricThresholds.humidity.norm_hi}
                      onChange={(v) =>
                        setMetricThresholds((m) => ({ ...m, humidity: { ...m.humidity, norm_hi: v } }))
                      }
                    />
                    <MetricInput
                      label="Жёлтая зона"
                      suffix="±%"
                      min={0}
                      value={metricThresholds.humidity.margin}
                      onChange={(v) =>
                        setMetricThresholds((m) => ({ ...m, humidity: { ...m.humidity, margin: v } }))
                      }
                    />
                  </div>
                </div>

                <div className="metric-threshold-block metric-threshold-block--battery">
                  <h4>Заряд батареи</h4>
                  <p>Зелёный — выше порога, жёлтый — средний, красный — критически низкий.</p>
                  <div className="metric-threshold-fields">
                    <MetricInput
                      label="Зелёный от"
                      suffix="%"
                      min={0}
                      max={100}
                      value={metricThresholds.battery.good_min}
                      onChange={(v) =>
                        setMetricThresholds((m) => ({ ...m, battery: { ...m.battery, good_min: v } }))
                      }
                    />
                    <MetricInput
                      label="Жёлтый от"
                      suffix="%"
                      min={0}
                      max={100}
                      value={metricThresholds.battery.ok_min}
                      onChange={(v) =>
                        setMetricThresholds((m) => ({ ...m, battery: { ...m.battery, ok_min: v } }))
                      }
                    />
                  </div>
                </div>
              </div>

              <button className="primary" type="submit" disabled={saveMetricsMutation.isPending}>
                Сохранить пороги
              </button>
              {metricsError && (
                <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {metricsError}
                </div>
              )}
              {saveMetricsMutation.isError && (
                <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
                  {apiErrorMessage(saveMetricsMutation.error)}
                </div>
              )}
              {saveMetricsMutation.isSuccess && (
                <div className="banner success" style={{ marginTop: 16, marginBottom: 0 }}>
                  Пороги сохранены
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      <div className="settings-bottom">
        <div className="card">
          <h3 className="settings-card-title">Резервная копия</h3>
          <p className="settings-card-desc">
            Токены, план дома, виджеты. Файл содержит секреты — храните в надёжном месте.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              Экспорт конфига
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => importInputRef.current?.click()}
              disabled={importMutation.isPending}
            >
              Импорт конфига
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = "";
              }}
            />
          </div>
          {exportMutation.isError && (
            <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
              {apiErrorMessage(exportMutation.error)}
            </div>
          )}
          {(importError || importMutation.isError) && (
            <div className="banner error" style={{ marginTop: 16, marginBottom: 0 }}>
              {importError ?? apiErrorMessage(importMutation.error)}
            </div>
          )}
          {importMutation.isSuccess && (
            <div className="banner success" style={{ marginTop: 16, marginBottom: 0 }}>
              Конфиг импортирован: {importMutation.data.imported.join(", ")}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="settings-card-title">Проверка связи</h3>
          <p className="settings-card-desc">Тест подключения к официальному и Quasar API Яндекса.</p>
          <button className="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            Проверить связь
          </button>
          {testMutation.data && (
            <div
              className={`banner ${testMutation.data.official_api ? "success" : "error"}`}
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              Официальный API: {testMutation.data.official_api ? "OK" : testMutation.data.official_api_error}
              <br />
              Quasar API: {testMutation.data.quasar_api ? "OK" : testMutation.data.quasar_api_error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
