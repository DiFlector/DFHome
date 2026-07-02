import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiErrorMessage, endpoints } from "../api/client";

export default function Settings() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: endpoints.getSettings });

  const [oauthToken, setOauthToken] = useState("");
  const [quasarCookies, setQuasarCookies] = useState("");

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

      <h3>1. OAuth-токен (устройства, управление, запуск сценариев)</h3>
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
          <div className="banner error">{apiErrorMessage(saveOauthMutation.error)}</div>
        )}
        {saveOauthMutation.isSuccess && <div className="banner success">Сохранено</div>}
      </form>

      <h3 style={{ marginTop: 32 }}>2. Вход для сценариев (создание/редактирование)</h3>
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
          <div className="banner error">{quasarLoginMutation.data.error}</div>
        )}
        {quasarLoginMutation.data?.ok && (
          <div className="banner success">
            Успешно вошли{quasarLoginMutation.data.display_login ? ` как ${quasarLoginMutation.data.display_login}` : ""}
          </div>
        )}
        {quasarLoginMutation.isError && (
          <div className="banner error">{apiErrorMessage(quasarLoginMutation.error)}</div>
        )}
      </form>

      <div style={{ marginTop: 24 }}>
        <button className="secondary" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
          Проверить связь
        </button>
        {testMutation.data && (
          <div className={`banner ${testMutation.data.official_api ? "success" : "error"}`} style={{ marginTop: 12 }}>
            Официальный API: {testMutation.data.official_api ? "OK" : testMutation.data.official_api_error}
            <br />
            Quasar API: {testMutation.data.quasar_api ? "OK" : testMutation.data.quasar_api_error}
          </div>
        )}
      </div>
    </div>
  );
}
