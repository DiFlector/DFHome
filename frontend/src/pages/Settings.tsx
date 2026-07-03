import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { apiErrorMessage, endpoints } from "../api/client";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: endpoints.getSettings });

  const [oauthToken, setOauthToken] = useState("");
  const [quasarCookies, setQuasarCookies] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

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
    // The file can change anything (tokens, plan, widgets), so drop every
    // cached query rather than picking individual keys.
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

  const handleQuasarLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quasarCookies.trim()) return;
    quasarLoginMutation.mutate(quasarCookies.trim());
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ marginTop: 0 }}>Настройки</h2>

      {isLoading && <p className="loading">Загрузка…</p>}

      {data && (
        <div className="banner info">
          OAuth-токен: {data.has_oauth_token ? `настроен (${data.oauth_token_preview})` : "не настроен"}
          <br />
          Вход для сценариев: {data.has_quasar_x_token ? "выполнен" : "не выполнен"}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>1. OAuth-токен (устройства, управление, запуск сценариев)</h3>
        <form onSubmit={handleSaveOauth}>
          <div className="form-field">
            <label>OAuth-токен (api.iot.yandex.net)</label>
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
            <div className="banner error" style={{ marginTop: 16 }}>
              {apiErrorMessage(saveOauthMutation.error)}
            </div>
          )}
          {saveOauthMutation.isSuccess && (
            <div className="banner success" style={{ marginTop: 16 }}>
              Сохранено
            </div>
          )}
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>2. Вход для сценариев (создание/редактирование)</h3>
        <div className="banner info">
          Официальный API не поддерживает создание и редактирование сценариев, поэтому для этого
          приложение один раз обменивает вашу браузерную сессию на долгоживущий токен и дальше само
          обновляет служебные cookie — повторно ничего вставлять не нужно.
        </div>
        <form onSubmit={handleQuasarLogin}>
          <div className="form-field">
            <label>Cookie сессии yandex.ru</label>
            <textarea
              rows={3}
              placeholder="Session_id=...; yandexuid=...; ..."
              value={quasarCookies}
              onChange={(e) => setQuasarCookies(e.target.value)}
            />
            <small>
              1. Откройте <code>yandex.ru</code> в браузере, войдите в аккаунт. 2. DevTools (F12) →
              Network → любой запрос к <code>yandex.ru</code> → заголовок запроса{" "}
              <code>Cookie</code> → скопируйте значение целиком. 3. Вставьте сюда и нажмите «Войти».
            </small>
          </div>
          <button className="primary" type="submit" disabled={quasarLoginMutation.isPending}>
            Войти
          </button>
          {quasarLoginMutation.data && !quasarLoginMutation.data.ok && (
            <div className="banner error" style={{ marginTop: 16 }}>
              {quasarLoginMutation.data.error}
            </div>
          )}
          {quasarLoginMutation.data?.ok && (
            <div className="banner success" style={{ marginTop: 16 }}>
              Успешно вошли
              {quasarLoginMutation.data.display_login ? ` как ${quasarLoginMutation.data.display_login}` : ""}
            </div>
          )}
          {quasarLoginMutation.isError && (
            <div className="banner error" style={{ marginTop: 16 }}>
              {apiErrorMessage(quasarLoginMutation.error)}
            </div>
          )}
        </form>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>3. Резервная копия конфигурации</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>
          Полный конфиг: токены, порядок комнат, план дома и виджеты. Файл содержит API-ключи в
          открытом виде — храните его в надёжном месте.
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
        <button className="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          Проверить связь
        </button>
        {testMutation.data && (
          <div className={`banner ${testMutation.data.official_api ? "success" : "error"}`} style={{ marginTop: 16, marginBottom: 0 }}>
            Официальный API: {testMutation.data.official_api ? "OK" : testMutation.data.official_api_error}
            <br />
            Quasar API: {testMutation.data.quasar_api ? "OK" : testMutation.data.quasar_api_error}
          </div>
        )}
      </div>
    </div>
  );
}
