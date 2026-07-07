import * as React from "react";

import { api } from "@/lib/api";

export type IntegrationInfo = {
  domain: string;
  version: string;
  manifest: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  config: Record<string, unknown>;
  loaded: boolean;
};

export function useSettings() {
  const [settings, setSettings] = React.useState<Record<string, unknown>>({});
  const [integrations, setIntegrations] = React.useState<IntegrationInfo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const [core, installed] = await Promise.all([
        api.getSettings(),
        api.getIntegrations(),
      ]);
      setSettings(core);
      setIntegrations(installed as IntegrationInfo[]);
    } catch {
      setSettings({});
      setIntegrations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveSettings = React.useCallback(
    async (values: Record<string, unknown>) => {
      const next = await api.saveSettings(values);
      setSettings(next);
      return next;
    },
    [],
  );

  return { settings, integrations, isLoading, refresh, saveSettings };
}
